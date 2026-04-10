#!/usr/bin/env python3
"""
서울 공공화장실 데이터 수집 스크립트
서울 열린데이터 광장 API를 이용합니다.

사용법:
  1. https://data.seoul.go.kr 에서 API 키 발급 (SearchPublicToiletPOIService)
  2. python3 scripts/fetch-seoul-wc.py --key YOUR_API_KEY --out src/data/wc-seoul.json
  3. 기존 wc.json과 병합 필요시: python3 scripts/fetch-seoul-wc.py --key YOUR_KEY --merge
"""

import argparse, json, math, time, sys
from urllib.request import urlopen
from urllib.parse import quote

BASE_URL = "http://openapi.seoul.go.kr:8088/{key}/json/SearchPublicToiletPOIService/{start}/{end}/"

def fetch_page(api_key: str, start: int, end: int) -> list:
    url = BASE_URL.format(key=quote(api_key), start=start, end=end)
    try:
        with urlopen(url, timeout=10) as resp:
            data = json.load(resp)
        svc = data.get("SearchPublicToiletPOIService", {})
        return svc.get("row", [])
    except Exception as e:
        print(f"  오류 (start={start}): {e}", file=sys.stderr)
        return []

def fetch_all(api_key: str, page_size: int = 1000) -> list:
    # 전체 건수 확인
    first = fetch_page(api_key, 1, 1)
    if not first:
        print("첫 페이지 조회 실패. API 키를 확인해주세요.", file=sys.stderr)
        return []

    # total_count는 첫 응답에 포함됨 (일반적으로 row 배열 앞에 list_total_count가 있음)
    url = BASE_URL.format(key=quote(api_key), start=1, end=1)
    with urlopen(url, timeout=10) as resp:
        raw = json.load(resp)
    total = raw.get("SearchPublicToiletPOIService", {}).get("list_total_count", 0)
    print(f"전체 건수: {total}")

    results = []
    for start in range(1, total + 1, page_size):
        end = min(start + page_size - 1, total)
        print(f"  {start}~{end} 조회 중...", end=" ", flush=True)
        rows = fetch_page(api_key, start, end)
        results.extend(rows)
        print(f"{len(rows)}건")
        time.sleep(0.3)  # API 부하 방지
    return results

def transform(row: dict, idx: int) -> dict | None:
    try:
        lat = float(row.get("Y_WGS84") or row.get("LATITUDE") or 0)
        lng = float(row.get("X_WGS84") or row.get("LONGITUDE") or 0)
    except (TypeError, ValueError):
        return None
    if lat == 0 or lng == 0:
        return None

    name    = row.get("FNAME") or row.get("TOILET_NM") or f"화장실{idx}"
    address = row.get("ROAD_NM_ADDR") or row.get("ADDR") or ""
    open_time = row.get("OPEN_TM") or ""
    if open_time and row.get("CLOSE_TM"):
        open_time = f"{open_time}~{row['CLOSE_TM']}"

    male_big   = int(row.get("MAN_YR_CNT") or row.get("MALE_BIG") or 0)
    male_small = int(row.get("MAN_CHILD_CNT") or row.get("MALE_SMALL") or 0)
    female_big = int(row.get("WOAN_YR_CNT") or row.get("FEMALE_BIG") or 0)

    accessible    = bool(row.get("DISABLED_YN") or row.get("WHEELCHAIR"))
    diapers       = bool(row.get("DIAPER_YN") or row.get("DIAPER"))
    emergency_bell = bool(row.get("EMERGENCY_BELL") or row.get("BELL"))

    return {
        "id":            f"seoul-{idx:05d}",
        "name":          name,
        "lat":           lat,
        "lng":           lng,
        "address":       address,
        "openTime":      open_time,
        "maleStalls":    male_big,
        "maleUrinals":   male_small,
        "femaleStalls":  female_big,
        "accessible":    accessible,
        "diapers":       diapers,
        "emergencyBell": emergency_bell,
        "isInsideGate":  False,
    }

def main():
    parser = argparse.ArgumentParser(description="서울 공공화장실 데이터 수집")
    parser.add_argument("--key",   required=True,  help="서울 열린데이터 광장 API 키")
    parser.add_argument("--out",   default="src/data/wc-seoul.json", help="출력 파일 경로")
    parser.add_argument("--merge", action="store_true", help="src/data/wc.json에 병합")
    parser.add_argument("--page-size", type=int, default=1000)
    args = parser.parse_args()

    print("서울 공공화장실 데이터 수집 시작...")
    rows = fetch_all(args.key, args.page_size)
    if not rows:
        print("데이터 없음. 종료.", file=sys.stderr)
        sys.exit(1)

    items = []
    for i, row in enumerate(rows):
        t = transform(row, i + 1)
        if t:
            items.append(t)
    print(f"\n변환 완료: {len(rows)}건 → {len(items)}건 (좌표 없는 항목 제외)")

    if args.merge:
        import os
        merge_path = os.path.join(os.path.dirname(__file__), "..", "src", "data", "wc.json")
        existing = json.load(open(merge_path, encoding="utf-8"))
        # 기존 서울 데이터 제거 후 재추가
        existing = [x for x in existing if not x.get("id", "").startswith("seoul-")]
        merged = existing + items
        with open(merge_path, "w", encoding="utf-8") as f:
            json.dump(merged, f, ensure_ascii=False, separators=(",", ":"))
        print(f"병합 완료: {merge_path} ({len(merged)}건)")
    else:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(items, f, ensure_ascii=False, indent=2)
        print(f"저장 완료: {args.out}")

if __name__ == "__main__":
    main()
