'use strict';
/**
 * collect-station-exits.js
 *
 * 레일포털 convenientInfo/stationGateInfo API로
 * 역사별 출구 인근 시설 정보를 수집합니다.
 *
 * 제공 범위: 서울 2호선(201~250), 3호선(309~342), 4호선(409~434) — 총 108역
 *
 * Output: public/data/station-exits.json
 *   {
 *     "강남": { line: "2호선", exits: { "1": ["뱅크샐러드", "신한은행"], "2": [...] } },
 *     ...
 *   }
 *
 * Usage:
 *   node scripts/collect-station-exits.js
 *   node scripts/collect-station-exits.js --dry-run   # 처음 5개 역만
 *   node scripts/collect-station-exits.js --resume
 */

const fs   = require('fs');
const path = require('path');

const DATA_DIR   = path.resolve(__dirname, '..', 'public', 'data');
const OUT_FILE   = path.join(DATA_DIR, 'station-exits.json');
const CKPT_FILE  = path.join(DATA_DIR, '_exits-checkpoint.json');

const API_KEY  = '$2a$10$CJzy9jEK1IFSiM2uFs/.COKfucfbKnBNN.XYdpY5NkuoXI7wpXE.C';
const BASE_URL = 'https://data.kric.go.kr/openapi/convenientInfo/stationGateInfo';
const DELAY_MS = 350;

const isDry    = process.argv.includes('--dry-run');
const doResume = process.argv.includes('--resume');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// 수집 대상: railOprIsttCd / lnCd / stinCd 범위 (실측으로 확인된 값)
const TARGETS = [
  ...range(201, 250).map(s => ({ opr: 'S1', ln: '2', lineName: '2호선', stin: String(s) })),
  ...range(309, 342).map(s => ({ opr: 'S1', ln: '3', lineName: '3호선', stin: String(s) })),
  ...range(409, 434).map(s => ({ opr: 'S1', ln: '4', lineName: '4호선', stin: String(s) })),
];

function range(from, to) {
  const r = [];
  for (let i = from; i <= to; i++) r.push(i);
  return r;
}

async function fetchExits(opr, ln, stin, attempt = 1) {
  const params = new URLSearchParams({
    serviceKey: API_KEY,
    railOprIsttCd: opr,
    lnCd: ln,
    stinCd: stin,
    numOfRows: '200',
    pageNo: '1',
    format: 'JSON',
  });
  try {
    const res = await fetch(`${BASE_URL}?${params}`, { signal: AbortSignal.timeout(10000) });
    const d = await res.json();
    if (d.header?.resultCode === '00') return d.body || [];
    return [];
  } catch (e) {
    if (attempt < 3) { await sleep(2000 * attempt); return fetchExits(opr, ln, stin, attempt + 1); }
    return null; // null = 오류
  }
}

// 역사코드 → 역명 맵 (station-facilities.json에 없으면 API 결과로 역명 추론 불가 → 별도 매핑 필요)
// 레일포털에서 stinCd와 역명 매핑을 제공하지 않으므로
// station-facilities.json의 stnNm 역인덱스로 교차 참조
function buildFacilitiesNameIndex(facilPath) {
  if (!fs.existsSync(facilPath)) return {};
  const fac = JSON.parse(fs.readFileSync(facilPath, 'utf8'));
  // stnCd(B553766 기준, e.g. "2511") → stnNm
  // 레일포털 stinCd는 다른 체계이므로 직접 매핑 불가
  // → 대신 수집 후 역명을 impFaclNm에서 추론하지 않고
  //   별도 매핑 테이블을 사용
  return {};
}

// 레일포털 stinCd → 역명 하드코딩 매핑 (2/3/4호선 108역)
// API가 역명 필드를 제공하지 않으므로 직접 매핑
const STIN_TO_NAME = {
  // 2호선 (순서: 시청→... 외선 순환)
  '201': '시청', '202': '을지로입구', '203': '을지로3가', '204': '을지로4가',
  '205': '동대문역사문화공원', '206': '신당', '207': '상왕십리', '208': '왕십리',
  '209': '한양대', '210': '뚝섬', '211': '성수', '212': '건대입구',
  '213': '구의', '214': '강변', '215': '잠실나루', '216': '잠실',
  '217': '잠실새내', '218': '종합운동장', '219': '삼성', '220': '선릉',
  '221': '역삼', '222': '강남', '223': '교대', '224': '서초',
  '225': '방배', '226': '사당', '227': '낙성대', '228': '서울대입구',
  '229': '봉천', '230': '신림', '231': '신대방', '232': '구로디지털단지',
  '233': '대림', '234': '신도림', '235': '문래', '236': '영등포구청',
  '237': '당산', '238': '합정', '239': '홍대입구', '240': '신촌',
  '241': '이대', '242': '아현', '243': '충정로', '244': '용답',
  '245': '신답', '246': '용두', '247': '도림천', '248': '양천구청',
  '249': '신정네거리', '250': '까치산',
  // 3호선 (지축→오금)
  '309': '지축', '310': '구파발', '311': '연신내', '312': '불광',
  '313': '녹번', '314': '홍제', '315': '무악재', '316': '독립문',
  '317': '경복궁', '318': '안국', '319': '종로3가', '320': '을지로3가',
  '322': '충무로', '323': '동대입구', '324': '약수', '325': '금호',
  '326': '옥수', '327': '압구정', '328': '신사', '329': '잠원',
  '330': '고속터미널', '331': '교대', '332': '남부터미널', '333': '양재',
  '335': '매봉', '336': '도곡', '337': '대치', '338': '학여울',
  '339': '대청', '340': '일원', '341': '수서', '342': '가락시장',
  // 4호선 (진접→남태령 방향 서울구간)
  '409': '미아사거리', '410': '미아', '411': '수유', '412': '쌍문',
  '413': '창동', '414': '노원', '415': '상계', '416': '당고개',
  '417': '불암산', '418': '중계', '419': '은행', '420': '하계',
  '421': '공릉', '422': '태릉입구', '423': '석계', '424': '신이문',
  '425': '외대앞', '426': '회기', '427': '청량리', '428': '신설동',
  '429': '동대문', '430': '동대문역사문화공원', '431': '충무로',
  '432': '명동', '433': '회현', '434': '서울역',
};

async function main() {
  console.log('🚇 레일포털 출구정보 수집기 (convenientInfo/stationGateInfo)');
  console.log('─────────────────────────────────────────────────────────');
  console.log(`수집 대상: 2호선 50역 + 3호선 32역 + 4호선 26역 = ${TARGETS.length}역`);
  if (isDry) console.log('⚠️  DRY-RUN: 처음 5개 역만');
  console.log();

  // 기존 결과 로드
  let result = {};
  if (fs.existsSync(OUT_FILE)) {
    result = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
    console.log(`📂 기존 데이터: ${Object.keys(result).length}역`);
  }

  // 체크포인트
  let processed = new Set();
  if (doResume && fs.existsSync(CKPT_FILE)) {
    processed = new Set(JSON.parse(fs.readFileSync(CKPT_FILE, 'utf8')));
    console.log(`📋 재개: 이미 처리 ${processed.size}개`);
  }

  const toProcess = isDry ? TARGETS.slice(0, 5) : TARGETS;
  let done = 0, empty = 0, errors = 0;

  for (const { opr, ln, lineName, stin } of toProcess) {
    const stationName = STIN_TO_NAME[stin];
    if (!stationName) {
      process.stdout.write(`  ⚠️  stinCd=${stin} 역명 매핑 없음\n`);
      continue;
    }

    const ckptKey = `${lineName}_${stin}`;
    if (doResume && processed.has(ckptKey)) continue;

    await sleep(DELAY_MS);
    const rows = await fetchExits(opr, ln, stin);

    if (rows === null) {
      process.stdout.write(`  ${stationName}(${lineName}) [${stin}] → ❌ 오류\n`);
      errors++;
    } else if (rows.length === 0) {
      process.stdout.write(`  ${stationName}(${lineName}) [${stin}] → (데이터 없음)\n`);
      empty++;
    } else {
      // 출구번호별로 그룹화
      const exitMap = {};
      for (const row of rows) {
        const exitNo = row.exitNo || '?';
        if (!exitMap[exitNo]) exitMap[exitNo] = [];
        exitMap[exitNo].push(row.impFaclNm || '');
      }

      // 출구 수 계산
      const exitCount = Object.keys(exitMap).filter(k => k !== '?').length;
      process.stdout.write(`  ${stationName}(${lineName}) → 출구 ${exitCount}개, 시설 ${rows.length}건\n`);

      result[stationName] = {
        line: lineName,
        stinCd: stin,
        exits: exitMap,
      };
      done++;
    }

    processed.add(ckptKey);

    // 20개마다 중간 저장
    if ((done + empty + errors) % 20 === 0 && done > 0) {
      fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2));
      fs.writeFileSync(CKPT_FILE, JSON.stringify([...processed]));
      console.log(`  💾 중간 저장 (${done}역 완료)`);
    }
  }

  // 최종 저장
  fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2));
  fs.writeFileSync(CKPT_FILE, JSON.stringify([...processed]));

  console.log('\n─────────────────────────────────────────────────────────');
  console.log(`✅ 수집 완료: ${done}역`);
  console.log(`⚪ 데이터 없음: ${empty}역`);
  console.log(`❌ 오류: ${errors}역`);
  console.log(`📊 station-exits.json: ${Object.keys(result).length}역`);
}

main().catch(e => { console.error('💥', e); process.exit(1); });
