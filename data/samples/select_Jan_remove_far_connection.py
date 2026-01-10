# ============================================================
# FAST Complete Trip Demo Builder (Jan, All ODs)
# - OD-first filtering
# - Geometry built only for needed trips
# ============================================================

# =========================
# CONFIG
# =========================
BASE_DIR = "C:/Users/rli04/Villanova University/Complete-trip-coordinate - Documents/General"
PARQUET_DIR = f"{BASE_DIR}/Salt_Lake/delivery"
TRACT_SHP = (
    f"{BASE_DIR}/Manuscript/Figure/Visualization-RL/"
    f"2-OD patterns by census track/six_counties_track.shp"
)

MONTHS = ["Jan"]
MAX_DIST_MILES = 1.0

OD_PAIRS = [
    ("49035114000", "49035980000"),  # center → airport
    ("49035114000", "49035110106"),  # center → canyon
    ("49035114000", "49035101402"),  # center → uofu
    ("49035980000", "49035114000"),  # airport → center
    ("49035980000", "49035110106"),  # airport → canyon
    ("49035980000", "49035101402"),  # airport → uofu 
    ("49035110106", "49035114000"),  # canyon → center
    ("49035110106", "49035980000"),  # canyon → airport
    ("49035110106", "49035101402"),  # canyon → uofu
    ("49035101402", "49035114000"),  # uofu → center
    ("49035101402", "49035980000"),  # uofu → airport
    ("49035101402", "49035110106"),  # uofu → canyon
]

# =========================
# IMPORTS
# =========================
import pandas as pd
import numpy as np
import geopandas as gpd
import pygeohash as pgh
from shapely.geometry import Point, LineString
from shapely import wkt
import glob
import json
import math
from datetime import datetime, timedelta
from collections import defaultdict
from shapely.geometry import mapping

# =========================
# UTILS
# =========================
def haversine_miles(lon1, lat1, lon2, lat2):
    R = 3958.8
    lon1, lat1, lon2, lat2 = map(np.radians, [lon1, lat1, lon2, lat2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = np.sin(dlat/2)**2 + np.cos(lat1)*np.cos(lat2)*np.sin(dlon/2)**2
    return 2 * R * np.arcsin(np.sqrt(a))

def is_finite(x):
    return x is not None and isinstance(x, (int, float)) and math.isfinite(x)

def safe_decode_geohash(gh):
    try:
        lat, lon = pgh.decode(gh)
        if is_finite(lat) and is_finite(lon):
            return lon, lat
    except:
        pass
    return None, None

# =========================
# LOAD DATA (JAN)
# =========================
USE_COLS = [
    "linked_trip_id", "trip_id", "tour_id",
    "travel_mode", "local_datetime_start", "local_datetime_end",
    "network_distance", "route_distance",
    "geohash7_orig", "geohash7_dest",
    "access_stop", "access_stop_id",
    "egress_stop", "egress_stop_id",
    "trip_purpose", "trip_weight",
    "route_taken"
]

dfs = []
for m in MONTHS:
    files = glob.glob(f"{PARQUET_DIR}/Salt_Lake-{m}-2020/*.snappy.parquet")
    dfs.extend([pd.read_parquet(f, columns=USE_COLS) for f in files])

df = pd.concat(dfs, ignore_index=True)
df["local_datetime_start"] = pd.to_datetime(df["local_datetime_start"], errors="coerce")
df["local_datetime_end"] = pd.to_datetime(df["local_datetime_end"], errors="coerce")
df = df[df["local_datetime_end"] > df["local_datetime_start"]]
df["duration_min"] = (
    df["local_datetime_end"] - df["local_datetime_start"]
).dt.total_seconds() / 60
df = df.sort_values(["linked_trip_id", "local_datetime_start"])

print("Raw linked trips:", df["linked_trip_id"].nunique())

# =========================
# TRACT JOIN (FAST, ONCE)
# =========================
tracts = gpd.read_file(TRACT_SHP).to_crs("EPSG:4326")
tracts["GEOID"] = tracts["GEOID"].astype(str)

def gh_to_point(gh):
    lat, lon = pgh.decode(gh)
    return Point(lon, lat)

gdf_o = gpd.GeoDataFrame(df, geometry=df["geohash7_orig"].apply(gh_to_point), crs="EPSG:4326")
gdf_d = gpd.GeoDataFrame(df, geometry=df["geohash7_dest"].apply(gh_to_point), crs="EPSG:4326")

df["GEOID_orig"] = gpd.sjoin(gdf_o, tracts, how="left", predicate="within")["GEOID"].values
df["GEOID_dest"] = gpd.sjoin(gdf_d, tracts, how="left", predicate="within")["GEOID"].values

# =========================
# OD-FIRST LINKED TRIP FILTER
# =========================
OD_SET = set(OD_PAIRS)

first = df.groupby("linked_trip_id").first()
last = df.groupby("linked_trip_id").last()

keep_linked_ids = first.index[
    [
        (o, d) in OD_SET
        for o, d in zip(first["GEOID_orig"], last["GEOID_dest"])
    ]
]

df = df[df["linked_trip_id"].isin(keep_linked_ids)]
print("Linked trips after OD prefilter:", df["linked_trip_id"].nunique())

# =========================
# LOAD NETWORKS
# =========================
auto_links = pd.read_csv(
    f"{BASE_DIR}/Salt_Lake/supplementInputs/network/auto-biggest-connected-graph/link.csv"
)
walk_links = pd.read_csv(
    f"{BASE_DIR}/Salt_Lake/supplementInputs/network/walk-biggest-connected-graph/link.csv"
)
transit_links = pd.read_csv(
    f"{BASE_DIR}/Salt_Lake/supplementInputs/network/UTA/link with flow.csv"
)

auto_dict = {(int(r.from_osm_node_id), int(r.to_osm_node_id)): r.geometry for r in auto_links.itertuples()}
walk_dict = {(int(r.from_osm_node_id), int(r.to_osm_node_id)): r.geometry for r in walk_links.itertuples()}
transit_dict = {(int(r.from_node_id), int(r.to_node_id)): r.geometry for r in transit_links.itertuples()}

# =========================
# BUILD GEOMETRY (ONLY FOR KEPT DATA)
# =========================
def build_geometry(row):
    nodes = [int(x) for x in str(row.route_taken).split(",") if x.strip().isdigit()]
    if len(nodes) < 2:
        return None

    link_dict = (
        auto_dict if row.travel_mode == "car"
        else walk_dict if row.travel_mode == "walk/bike"
        else transit_dict if row.travel_mode in ["bus", "rail"]
        else None
    )
    if link_dict is None:
        return None

    coords = []
    for a, b in zip(nodes[:-1], nodes[1:]):
        if (a, b) in link_dict:
            try:
                coords.extend(wkt.loads(link_dict[(a, b)]).coords)
            except:
                continue

    return LineString(coords) if len(coords) > 1 else None

df["geometry"] = df.apply(build_geometry, axis=1)
df = df[df["geometry"].notnull()]

# =========================
# BUILD ROUTES + SAMPLES
# =========================
def build_route(geom):
    coords = [[lat, lon] for lon, lat in geom.coords if is_finite(lat) and is_finite(lon)]
    if len(coords) < 2:
        return None
    return coords[::3] if len(coords) > 400 else coords

samples = []
for r in df.itertuples():
    route = build_route(r.geometry)
    if route is None:
        continue

    o_lon, o_lat = safe_decode_geohash(r.geohash7_orig)
    d_lon, d_lat = safe_decode_geohash(r.geohash7_dest)

    samples.append({
        "id": str(r.trip_id),
        "mode": str(r.travel_mode).lower().strip(),
        "route": route,
        "start_time": r.local_datetime_start.isoformat(),
        "end_time": (
            r.local_datetime_start + timedelta(minutes=r.duration_min)
        ).isoformat(),
        "origin": {
            "lon": o_lon,
            "lat": o_lat,
            "geohash": r.geohash7_orig,
            "tract_id": r.GEOID_orig
        },
        "destination": {
            "lon": d_lon,
            "lat": d_lat,
            "geohash": r.geohash7_dest,
            "tract_id": r.GEOID_dest
        },
        "meta": {
            "linked_trip_id": r.linked_trip_id,
            "weight": r.trip_weight
        }
    })

# =========================
# BUILD LINKED TRIPS
# =========================
linked_groups = defaultdict(list)
for s in samples:
    linked_groups[s["meta"]["linked_trip_id"]].append(s)

linked_trips_full = []
for linked_id, trips in linked_groups.items():
    trips = sorted(trips, key=lambda x: x["start_time"])
    linked_trips_full.append({
        "linked_trip_id": linked_id,
        "origin": trips[0]["origin"],
        "destination": trips[-1]["destination"],
        "legs": trips,
        "weight": max(t["meta"]["weight"] or 0 for t in trips)
    })

# =========================
# FINAL CONSISTENCY FILTER
# =========================
def filter_linked_trips(linked_trips, max_dist):
    out = []
    for lt in linked_trips:
        ok = True
        for leg in lt["legs"]:
            r = leg["route"]
            o = leg["origin"]
            d = leg["destination"]
            if (
                haversine_miles(o["lon"], o["lat"], r[0][1], r[0][0]) > max_dist or
                haversine_miles(d["lon"], d["lat"], r[-1][1], r[-1][0]) > max_dist
            ):
                ok = False
                break
        if ok:
            out.append(lt)
    return out

# =========================
# EXPORT MULTIPLE ODs
# =========================
for ORIG, DEST in OD_PAIRS:
    subset = [
        lt for lt in linked_trips_full
        if lt["origin"]["tract_id"] == ORIG and lt["destination"]["tract_id"] == DEST
    ]
    subset = filter_linked_trips(subset, MAX_DIST_MILES)

    out = {
        "schema": "nova.complete_trip.sample.v2",
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "od": {
            "origin": {"tract_id": ORIG},
            "destination": {"tract_id": DEST}
        },
        "count": len(subset),
        "linked_trips": subset
    }

    with open(f"./data/samples/{ORIG}_to_{DEST}.json", "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)

    print(f"Saved {len(subset)} linked trips → {ORIG}_to_{DEST}.json")
