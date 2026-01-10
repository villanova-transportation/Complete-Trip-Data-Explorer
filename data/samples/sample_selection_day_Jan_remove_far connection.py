# =========================
# CONFIG
# =========================
BASE_DIR = "C:/Users/rli04/Villanova University/Complete-trip-coordinate - Documents/General"
PARQUET_DIR = f"{BASE_DIR}/Salt_Lake/delivery"
TRACT_SHP = f"{BASE_DIR}/Manuscript/Figure/Visualization-RL/2-OD patterns by census track/six_counties_track.shp"

TRACTS = {
    "49035114000": "center",
    "49035980000": "airport",
    "49035110106": "canyon",
    "49035101402": "uofu"
}

MONTHS = ["Jan"]

MAX_DIST_M = 800
MAX_DIST_MILE = 1.0

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
from datetime import datetime, timedelta
from collections import defaultdict
import math
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

def haversine_m(lon1, lat1, lon2, lat2):
    return haversine_miles(lon1, lat1, lon2, lat2) * 1609.34

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
# LOAD NODE TABLES (ONCE)
# =========================
auto_nodes = pd.read_csv(
    f"{BASE_DIR}/Salt_Lake/supplementInputs/network/auto-biggest-connected-graph/node.csv"
)
walk_nodes = pd.read_csv(
    f"{BASE_DIR}/Salt_Lake/supplementInputs/network/walk-biggest-connected-graph/node.csv"
)
transit_nodes = pd.read_csv(
    f"{BASE_DIR}/Salt_Lake/supplementInputs/network/UTA/node with flow.csv"
)

auto_node_dict = dict(zip(auto_nodes.osm_node_id, zip(auto_nodes.x_coord, auto_nodes.y_coord)))
walk_node_dict = dict(zip(walk_nodes.osm_node_id, zip(walk_nodes.x_coord, walk_nodes.y_coord)))
transit_node_dict = dict(zip(transit_nodes.node_id, zip(transit_nodes.x_coord, transit_nodes.y_coord)))

def get_node_coord(osm_id, mode):
    if mode == "car":
        return auto_node_dict.get(osm_id)
    if mode == "walk/bike":
        return walk_node_dict.get(osm_id)
    if mode in ["bus", "rail"]:
        return transit_node_dict.get(osm_id)
    return None

# =========================
# MAIN LOOP (12 ODs)
# =========================
for ORIG_TRACT in TRACTS:
    for DEST_TRACT in TRACTS:
        if ORIG_TRACT == DEST_TRACT:
            continue

        print(f"\n=== Processing {ORIG_TRACT} → {DEST_TRACT} ===")
        OUTPUT_JSON = f"{ORIG_TRACT}_to_{DEST_TRACT}.json"

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

        MONTHLY_DFS = []

        for m in MONTHS:
            files = glob.glob(f"{PARQUET_DIR}/Salt_Lake-{m}-2020/*.snappy.parquet")
            dfs = [pd.read_parquet(f, columns=USE_COLS) for f in files]
            df_month = pd.concat(dfs, ignore_index=True)

            df_month["local_datetime_start"] = pd.to_datetime(df_month["local_datetime_start"])
            df_month["local_datetime_end"] = pd.to_datetime(df_month["local_datetime_end"])
            df_month = df_month[df_month["local_datetime_end"] > df_month["local_datetime_start"]]

            df_month["duration_min"] = (
                df_month["local_datetime_end"] - df_month["local_datetime_start"]
            ).dt.total_seconds() / 60

            MONTHLY_DFS.append(df_month)

        df = pd.concat(MONTHLY_DFS, ignore_index=True)
        df = df.sort_values(["linked_trip_id", "local_datetime_start"])

        # =========================
        # BUILD GEOMETRY (UNCHANGED)
        # =========================
        auto_links = pd.read_csv(f"{BASE_DIR}/Salt_Lake/supplementInputs/network/auto-biggest-connected-graph/link.csv")
        walk_links = pd.read_csv(f"{BASE_DIR}/Salt_Lake/supplementInputs/network/walk-biggest-connected-graph/link.csv")
        transit_links = pd.read_csv(f"{BASE_DIR}/Salt_Lake/supplementInputs/network/UTA/link with flow.csv")

        auto_dict = {
            (int(r.from_osm_node_id), int(r.to_osm_node_id)): r.geometry
            for r in auto_links.itertuples()
        }
        transit_dict = {
            (int(r.from_node_id), int(r.to_node_id)): r.geometry
            for r in transit_links.itertuples()
        }
        walk_dict = {
            (int(r.from_osm_node_id), int(r.to_osm_node_id)): r.geometry
            for r in walk_links.itertuples()
        }

        def build_geometry(row):
            nodes = [int(x) for x in str(row.route_taken).split(",") if x.strip().isdigit()]
            if len(nodes) < 2:
                return None

            coords = []
            link_dict = (
                auto_dict if row.travel_mode == "car"
                else walk_dict if row.travel_mode == "walk/bike"
                else transit_dict if row.travel_mode in ["bus", "rail"]
                else None
            )
            for a, b in zip(nodes[:-1], nodes[1:]):
                if (a, b) in link_dict:
                    try:
                        geom = wkt.loads(link_dict[(a, b)])
                        coords.extend(list(geom.coords))
                    except:
                        continue
            return LineString(coords) if len(coords) > 1 else None

        df["geometry"] = df.apply(build_geometry, axis=1)
        df = df[df["geometry"].notnull()]

        def clean_num(x):
            return float(x) if is_finite(x) else None

        def build_route(geom):
            if geom is None:
                return None
            coords = [[lat, lon] for lon, lat in geom.coords if is_finite(lat) and is_finite(lon)]
            if len(coords) < 2:
                return None
            if len(coords) > 400:
                coords = coords[::3]
            return coords

        # =========================
        # BUILD SAMPLES
        # =========================
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
                "start_time": start_dt.isoformat(),
                "end_time": end_dt.isoformat() if end_dt else None,
                "duration_min": duration,
                "origin": {"lon": o_lon, "lat": o_lat, "geohash": r.geohash7_orig},
                "destination": {"lon": d_lon, "lat": d_lat, "geohash": r.geohash7_dest},
                "meta": {
                    "linked_trip_id": r.linked_trip_id,
                    "weight": clean_num(r.trip_weight)
                }
            })

        # =========================
        # GROUP → LINKED TRIPS
        # =========================
        linked_groups = defaultdict(list)
        for s in samples:
            linked_groups[s["meta"]["linked_trip_id"]].append(s)

        linked_trips_full = []

        for linked_id, trips in linked_groups.items():
            trips_sorted = sorted(trips, key=lambda x: x["start_time"])
            linked_trips_full.append({
                "linked_trip_id": linked_id,
                "origin": trips_sorted[0]["origin"],
                "destination": trips_sorted[-1]["destination"],
                "legs": trips_sorted,
                "weight": max(t["meta"]["weight"] or 0 for t in trips_sorted)
            })

        # =========================
        # >>> FINAL FILTER BEFORE JSON OUTPUT <<<
        # =========================
        filtered_linked = []

        for lt in linked_trips_full:
            drop = False
            for leg in lt["legs"]:
                route = leg["route"]
                if not route:
                    drop = True
                    break

                nodes = [int(x) for x in leg["route"][0:1] if False]  # dummy to keep structure
                # use original route_taken via geometry nodes instead
                # fallback: skip if missing
                o_lon, o_lat = leg["origin"]["lon"], leg["origin"]["lat"]
                d_lon, d_lat = leg["destination"]["lon"], leg["destination"]["lat"]

                # first / last node coords already encoded in route geometry
                first_lat, first_lon = route[0]
                last_lat, last_lon = route[-1]

                if o_lon is not None:
                    if haversine_m(o_lon, o_lat, first_lon, first_lat) > MAX_DIST_M:
                        drop = True
                        break
                if d_lon is not None:
                    if haversine_m(d_lon, d_lat, last_lon, last_lat) > MAX_DIST_M:
                        drop = True
                        break

            if not drop:
                filtered_linked.append(lt)

        linked_trips_final = filtered_linked

        # =========================
        # OUTPUT JSON
        # =========================
        out = {
            "schema": "nova.complete_trip.sample.v2",
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "count": len(linked_trips_final),
            "linked_trips": linked_trips_final
        }

        with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
            json.dump(out, f, indent=2, allow_nan=False)

        print(f"Saved {len(linked_trips_final)} linked trips → {OUTPUT_JSON}")
