import test from "node:test";
import assert from "node:assert/strict";

import {
  getArrivalBadge,
  getArrivalMetaText,
  isRealtimeArrival,
  scoreArrivalSet,
} from "../src/utils/arrivalTrust";
import type { StationArrival } from "../src/types/metro";

function makeArrival(overrides: Partial<StationArrival> = {}): StationArrival {
  return {
    lineName: "2호선",
    subwayId: "1002",
    updnLine: "내선",
    trainLineNm: "내선순환",
    statnNm: "강남",
    arvlMsg2: "2분 후",
    arvlMsg3: "",
    arvlCd: "99",
    bstatnNm: "잠실",
    barvlDt: "120",
    btrainNo: "1234",
    ...overrides,
  };
}

test("실시간 데이터가 시간표보다 높은 점수를 받는다", () => {
  const live = [makeArrival({ source: "live", confidence: "high", ageSeconds: 4 })];
  const timetable = [makeArrival({ source: "full-timetable", confidence: "medium", isScheduled: true })];

  assert.ok(scoreArrivalSet(live) > scoreArrivalSet(timetable));
});

test("실시간 추정 데이터는 realtime 으로 분류된다", () => {
  const estimated = makeArrival({
    source: "arrival-probe",
    confidence: "medium",
    isEstimatedRealtime: true,
  });

  assert.equal(isRealtimeArrival(estimated), true);
  assert.equal(getArrivalBadge(estimated).label, "실시간 추정");
  assert.match(getArrivalMetaText(estimated), /도착 API 기반 위치 추정/);
});

test("오래된 live 데이터는 경고 배지로 바뀐다", () => {
  const staleLive = makeArrival({
    source: "live",
    confidence: "low",
    ageSeconds: 95,
  });

  assert.equal(getArrivalBadge(staleLive).label, "LIVE 지연");
  assert.match(getArrivalMetaText(staleLive), /1분 전 수신/);
});
