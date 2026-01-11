# ============================================================
# FAST Complete Trip Demo Builder (Jan, All ODs)
# - OD-first filtering
# - Geometry built only for needed trips
# - JSON-safe
# - 100% OLD JSON schema compatible
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

OUTPUT_DIR = "./data/samples"
import os
os.makedirs(OUTPUT_DIR, exist_ok=True)

OD_PAIRS = [
    ("49035114000", "49035980000"),
    ("49035114000", "49035110106"),
    ("49035114000", "49035101402"),
    ("49035980000", "49035114000"),
    ("49035980000", "49035110106"),
    ("49035980000", "49035101402"),
    ("49035110106", "49035114000"),
    ("49035110106", "49035980000"),
    ("49035110106", "49035101402"),
    ("49035101402", "49035114000"),
    ("49035101402", "49035980000"),
    ("49035101402", "49035110106"),
]

# =========================
# IMPORTS
# =========================
import pandas as pd
import numpy as np
import geopandas as gpd
import pygeohash as pgh
from shapely.geometry import Point, LineString, mapping
from shapely import wkt
import glob
import json
import math
from datetime import datetime, timedelta
from collections import defaultdict

# =========================
# UTILS
# =========================
def is_finite(x):
    return x is not None and isinstance(x, (int, float)) and math.isfinite(x)

def clean_num(x):
    try:
        x = float(x)
        return x if math.isfinite(x) else None
    except:
        return None

def safe_decode_geohash(gh):
    try:
        lat, lon = pgh.decode(gh)
        if is_finite(lat) and is_finite(lon):
            return lon, lat
    except:
        pass
    return None, None

def to_iso(t):
    return t.isoformat() if t is not None else None

# =========================
# LOAD DATA
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

# =========================
# TRACT JOIN
# =========================
tracts = gpd.read_file(TRACT_SHP).to_crs("EPSG:4326")
tracts["GEOID"] = tracts["GEOID"].astype(str)

TRACT_GEOM = {
    r.GEOID: mapping(r.geometry)
    for r in tracts.itertuples()
}

def gh_to_point(gh):
    lat, lon = pgh.decode(gh)
    return Point(lon, lat)

gdf_o = gpd.GeoDataFrame(df, geometry=df["geohash7_orig"].apply(gh_to_point), crs="EPSG:4326")
gdf_d = gpd.GeoDataFrame(df, geometry=df["geohash7_dest"].apply(gh_to_point), crs="EPSG:4326")

df["GEOID_orig"] = gpd.sjoin(gdf_o, tracts, how="left", predicate="within")["GEOID"].values
df["GEOID_dest"] = gpd.sjoin(gdf_d, tracts, how="left", predicate="within")["GEOID"].values

# =========================
# OD-FIRST FILTER
# =========================
OD_SET = set(OD_PAIRS)

first = df.groupby("linked_trip_id").first()
last = df.groupby("linked_trip_id").last()

keep_ids = first.index[
    [(o, d) in OD_SET for o, d in zip(first["GEOID_orig"], last["GEOID_dest"])]
]

df = df[df["linked_trip_id"].isin(keep_ids)]

# =========================
# BUILD GEOMETRY
# =========================
auto_links = pd.read_csv(f"{BASE_DIR}/Salt_Lake/supplementInputs/network/auto-biggest-connected-graph/link.csv")
walk_links = pd.read_csv(f"{BASE_DIR}/Salt_Lake/supplementInputs/network/walk-biggest-connected-graph/link.csv")
transit_links = pd.read_csv(f"{BASE_DIR}/Salt_Lake/supplementInputs/network/UTA/link with flow.csv")

auto_dict = {(int(r.from_osm_node_id), int(r.to_osm_node_id)): r.geometry for r in auto_links.itertuples()}
walk_dict = {(int(r.from_osm_node_id), int(r.to_osm_node_id)): r.geometry for r in walk_links.itertuples()}
transit_dict = {(int(r.from_node_id), int(r.to_node_id)): r.geometry for r in transit_links.itertuples()}

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
def haversine_miles(lon1, lat1, lon2, lat2):
    R = 3958.8  # Earth radius in miles
    lon1, lat1, lon2, lat2 = map(
        np.radians, [lon1, lat1, lon2, lat2]
    )
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = (
        np.sin(dlat / 2) ** 2
        + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    )
    return 2 * R * np.arcsin(np.sqrt(a))

def leg_route_distance_ok(leg, max_dist_miles):
    """
    Check if origin/destination are close enough to route geometry
    """
    geom = leg.get("route")
    if not geom or len(geom) < 2:
        return False

    # route geometry first/last point (lat, lon)
    route_start_lat, route_start_lon = geom[0]
    route_end_lat, route_end_lon = geom[-1]

    # origin
    o = leg["origin"]
    d = leg["destination"]

    if o["lat"] is None or o["lon"] is None:
        return False
    if d["lat"] is None or d["lon"] is None:
        return False

    dist_o = haversine_miles(
        o["lon"], o["lat"],
        route_start_lon, route_start_lat
    )
    dist_d = haversine_miles(
        d["lon"], d["lat"],
        route_end_lon, route_end_lat
    )

    return dist_o <= max_dist_miles and dist_d <= max_dist_miles

# =========================
# BUILD SAMPLES（🔒 对齐 leg 时间语义）
# =========================
def build_route(geom):
    coords = [[lat, lon] for lon, lat in geom.coords if is_finite(lat) and is_finite(lon)]
    return coords[::3] if len(coords) >= 2 else None

samples = []

for r in df.itertuples():
    route = build_route(r.geometry)
    if route is None:
        continue

    o_lon, o_lat = safe_decode_geohash(r.geohash7_orig)
    d_lon, d_lat = safe_decode_geohash(r.geohash7_dest)

    start_dt = r.local_datetime_start
    duration = clean_num(r.duration_min)

    end_dt = (
        start_dt + timedelta(minutes=duration)
        if start_dt is not None and duration is not None
        else None
    )

    samples.append({
        "id": str(r.trip_id),
        "mode": str(r.travel_mode).lower().strip(),
        "route": route,
        "start_time": to_iso(start_dt),
        "end_time": to_iso(end_dt),          # 🔒 ALIGN
        "duration_min": duration,            # 🔒 ALIGN
        "network_distance_km": clean_num(r.network_distance),
        "route_distance_km": clean_num(r.route_distance),
        "origin": {
            "lon": o_lon,
            "lat": o_lat,
            "geohash": r.geohash7_orig
        },
        "destination": {
            "lon": d_lon,
            "lat": d_lat,
            "geohash": r.geohash7_dest
        },
        "access": {
            "stop_id": clean_num(r.access_stop_id),
            "stop_name": r.access_stop
        },
        "egress": {
            "stop_id": clean_num(r.egress_stop_id),
            "stop_name": r.egress_stop
        },
        "meta": {
            "linked_trip_id": r.linked_trip_id,
            "tour_id": r.tour_id,
            "purpose": r.trip_purpose,
            "weight": clean_num(r.trip_weight)
        }
    })

# =========================
# GROUP + BUILD LINKED TRIPS（🔒 对齐 destination.end_time）
# =========================
groups = defaultdict(list)
for s in samples:
    groups[s["meta"]["linked_trip_id"]].append(s)

linked_trips_full = []

for lid, trips in groups.items():
    trips = sorted(trips, key=lambda x: x["start_time"])
    if not all(
        leg_route_distance_ok(t, MAX_DIST_MILES)
        for t in trips
    ):
        continue

    for i, t in enumerate(trips):
        t["leg_index"] = i

    origin = {
        **trips[0]["origin"],
        "start_time": trips[0]["start_time"]
    }

    destination = {
        **trips[-1]["destination"],
        "end_time": trips[-1]["end_time"]    # 🔒 ALIGN（不再 fallback）
    }

    transfers = [
        {
            "lat": t["destination"]["lat"],
            "lon": t["destination"]["lon"],
            "geohash": t["destination"]["geohash"]
        }
        for t in trips[:-1]
        if t["destination"]["lat"] is not None and t["destination"]["lon"] is not None
    ]

    weight = max(t["meta"]["weight"] or 0 for t in trips)

    linked_trips_full.append({
        "linked_trip_id": lid,
        "origin": origin,
        "destination": destination,
        "transfers": transfers,
        "legs": trips,
        "weight": weight
    })

linked_trips_full = sorted(linked_trips_full, key=lambda x: -x["weight"])

# =========================
# EXPORT（不变）
# =========================
for ORIG, DEST in OD_PAIRS:
    subset = [
        lt for lt in linked_trips_full
        if df.loc[df["linked_trip_id"] == lt["linked_trip_id"], "GEOID_orig"].iloc[0] == ORIG
        and df.loc[df["linked_trip_id"] == lt["linked_trip_id"], "GEOID_dest"].iloc[-1] == DEST
    ]

    out = {
        "schema": "nova.complete_trip.sample.v2",
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "od": {
            "origin": {
                "tract_id": ORIG,
                "geometry": TRACT_GEOM[ORIG]
            },
            "destination": {
                "tract_id": DEST,
                "geometry": TRACT_GEOM[DEST]
            }
        },
        "count": len(subset),
        "linked_trips": subset
    }

    out_path = f"{OUTPUT_DIR}/{ORIG}_to_{DEST}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, allow_nan=False)

    print(f"Saved {len(subset)} linked trips → {out_path}")

    # =========================
    # OD-LEVEL STATS (STRICTLY OLD DEFINITION)
    # =========================

    if subset:
        # 1️⃣ per linked trip aggregation
        trip_durations = []
        trip_segments = []
        trip_modes = []

        for lt in subset:
            legs = lt["legs"]

            # total duration = sum of leg durations
            total_dur = sum(
                leg["duration_min"]
                for leg in legs
                if leg["duration_min"] is not None
            )

            trip_durations.append(total_dur)
            trip_segments.append(len(legs))
            trip_modes.append(set(leg["mode"] for leg in legs))

        dur = np.array(trip_durations)
        segments = np.array(trip_segments)
        modes = trip_modes

        def pct(a, q): return float(np.percentile(a, q))

        BIN_WIDTH = 5
        MAX_TIME = 180

        bins = np.arange(0, MAX_TIME + BIN_WIDTH, BIN_WIDTH)
        dur_capped = np.clip(dur, 0, MAX_TIME)
        hist_counts, bin_edges = np.histogram(dur_capped, bins=bins)

        travel_time_hist = {
            "bin_width_min": BIN_WIDTH,
            "max_time_min": MAX_TIME,
            "bin_edges_min": bin_edges.tolist(),
            "counts": hist_counts.tolist()
        }

        stats = {
            "schema": "nova.complete_trip.od_stats.v1",
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "od": {"origin": ORIG, "destination": DEST},
            "coverage": {"temporal": "year-2020", "spatial": "Salt Lake 6-county"},
            "counts": {"linked_trips": int(len(dur))},
            "trip_duration_min": {
                "min": float(dur.min()),
                "mean": float(dur.mean()),
                "p25": pct(dur, 25),
                "median": pct(dur, 50),
                "p75": pct(dur, 75),
                "max": float(dur.max())
            },
            "segments": {
                "avg": float(segments.mean()),
                "p75": int(pct(segments, 75)),
                "max": int(segments.max())
            },
            "mode_involvement": {
                "car": float(sum("car" in m for m in modes) / len(modes)),
                "bus": float(sum("bus" in m for m in modes) / len(modes)),
                "rail": float(sum("rail" in m for m in modes) / len(modes)),
                "walk": float(sum("walk/bike" in m for m in modes) / len(modes))
            },
            "travel_time_distribution": travel_time_hist
        }

    else:
        stats = {
            "schema": "nova.complete_trip.od_stats.v1",
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "od": {"origin": ORIG, "destination": DEST},
            "coverage": {"temporal": "year-2020", "spatial": "Salt Lake 6-county"},
            "counts": {"linked_trips": 0},
            "note": "No linked trips after distance + OD filter"
        }

    # 写 stats
    stats_path = f"{OUTPUT_DIR}/{ORIG}_to_{DEST}.stats.json"
    with open(stats_path, "w", encoding="utf-8") as f:
        json.dump(stats, f, indent=2, allow_nan=False)

    print(f"✓ Stats written → {stats_path}")
