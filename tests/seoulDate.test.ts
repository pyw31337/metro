import test from "node:test";
import assert from "node:assert/strict";

import { parseSeoulDate } from "../src/utils/seoulDate";

test("서울 API 기본 datetime 문자열을 파싱한다", () => {
  const parsed = parseSeoulDate("2026-04-23 06:15:30");
  assert.ok(parsed > 0);

  const date = new Date(parsed);
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 3);
  assert.equal(date.getDate(), 23);
});

test("서울 API 숫자형 datetime 문자열을 파싱한다", () => {
  const parsed = parseSeoulDate("20260423061530");
  assert.ok(parsed > 0);
});

test("비어 있거나 잘못된 문자열은 0으로 처리한다", () => {
  assert.equal(parseSeoulDate(""), 0);
  assert.equal(parseSeoulDate("not-a-date"), 0);
});
