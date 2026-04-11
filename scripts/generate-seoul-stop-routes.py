#!/usr/bin/env python3
"""
OSM 경로 polyline + 서울 버스 정류장 좌표를 공간 매칭해
stop-routes.json에 서울 항목을 추가하는 스크립트.

방법:
 1. bus-paths-11.json에서 routeId → encoded polyline 로드
 2. master-bus-routes.json에서 routeId → {no, cityCode} 로드
 3. master-bus-stops.json에서 서울 정류장 좌표 KDTree 구성
 4. 각 경로 polyline을 일정 간격(50m)으로 샘플링
 5. 각 샘플 포인트에서 75m 이내 정류장 → 그 정류장에 해당 노선 추가
 6. stop-routes.json에 병합 저장
"""

import json, math, sys
from pathlib import Path

BASE = Path(__file__).parent.parent / "public" / "data"

# ── 폴리라인 디코딩 ──────────────────────────────────────────────
def decode_polyline(encoded: str):
    coords = []
    idx, lat, lng = 0, 0, 0
    while idx < len(encoded):
        # latitude
        result = shift = 0
        while True:
            b = ord(encoded[idx]) - 63; idx += 1
            result |= (b & 0x1f) << shift; shift += 5
            if b < 0x20: break
        lat += ~(result >> 1) if result & 1 else result >> 1
        # longitude
        result = shift = 0
        while True:
            b = ord(encoded[idx]) - 63; idx += 1
            result |= (b & 0x1f) << shift; shift += 5
            if b < 0x20: break
        lng += ~(result >> 1) if result & 1 else result >> 1
        coords.append((lat / 1e5, lng / 1e5))
    return coords  # [(lat, lng), ...]

# ── 위경도 → 미터 거리 (간이 equirectangular) ────────────────────
def dist_m(lat1, lng1, lat2, lng2):
    R = 6_371_000
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1) * math.cos(math.radians((lat1 + lat2) / 2))
    return R * math.sqrt(dlat**2 + dlng**2)

# ── 로드 ─────────────────────────────────────────────────────────
print("로딩 중...")
paths   = json.loads((BASE / "paths" / "bus-paths-11.json").read_text())
routes  = json.loads((BASE / "master-bus-routes.json").read_text())
stops   = json.loads((BASE / "master-bus-stops.json").read_text())
sr_path = BASE / "stop-routes.json"
stop_routes = json.loads(sr_path.read_text())

# routeId → (no, cityCode) 맵
route_meta = {r["id"]: r for r in routes if str(r.get("cityCode")) == "11"}
print(f"서울 노선 수: {len(route_meta)}")

# 서울 정류장만 필터링 (arsId 기준, ID가 순수 숫자인 것)
seoul_stops = [s for s in stops if str(s.get("cityCode")) == "11" and s.get("lat") and s.get("lng")]
print(f"서울 정류장 수: {len(seoul_stops)}")

# ── KDTree 구성 (위경도를 단위 구 좌표로 변환) ────────────────────
# scipy 없이 간단한 grid cell 인덱스 사용
CELL_DEG = 0.001  # ~100m grid

grid: dict[tuple, list] = {}
for stop in seoul_stops:
    cx = int(stop["lat"] / CELL_DEG)
    cy = int(stop["lng"] / CELL_DEG)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            key = (cx + dx, cy + dy)
            grid.setdefault(key, []).append(stop)

def nearby_stops(lat, lng, radius_m=80):
    cx = int(lat / CELL_DEG)
    cy = int(lng / CELL_DEG)
    candidates = grid.get((cx, cy), [])
    return [s for s in candidates if dist_m(lat, lng, s["lat"], s["lng"]) <= radius_m]

# ── 각 경로마다 공간 매칭 ─────────────────────────────────────────
print("공간 매칭 중...")
added = 0

for route_id, polyline in paths.items():
    meta = route_meta.get(route_id)
    if not meta:
        continue

    no       = meta["no"]
    city     = str(meta["cityCode"])
    route_entry = {"no": no, "id": route_id, "cityCode": city}

    coords = decode_polyline(polyline)
    if not coords:
        continue

    # ~50m 간격으로 다운샘플링 (연속 포인트가 매우 가까울 경우 스킵)
    sampled = [coords[0]]
    for pt in coords[1:]:
        if dist_m(sampled[-1][0], sampled[-1][1], pt[0], pt[1]) >= 40:
            sampled.append(pt)

    matched_stops: set[str] = set()
    for lat, lng in sampled:
        for stop in nearby_stops(lat, lng, radius_m=80):
            sid = str(stop["id"])
            if sid not in matched_stops:
                matched_stops.add(sid)
                if sid not in stop_routes:
                    stop_routes[sid] = []
                # 중복 방지
                if not any(r["id"] == route_id for r in stop_routes[sid]):
                    stop_routes[sid].append(route_entry)
                    added += 1

print(f"매칭 완료: {added}개 정류장-노선 추가")

# ── 저장 ─────────────────────────────────────────────────────────
sr_path.write_text(json.dumps(stop_routes, ensure_ascii=False, separators=(",", ":")))
print(f"✅ stop-routes.json 업데이트 완료 (총 {len(stop_routes)}개 정류장)")
