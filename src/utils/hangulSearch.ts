/**
 * hangul-js 없이 순수 JS로 구현한 한글 초성 검색 유틸
 * 초성 목록: ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ
 */

const CHOSUNG_LIST = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ',
  'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
];

const HANGUL_START = 0xAC00; // '가'
const HANGUL_END = 0xD7A3;   // '힣'
const JUNGSUNG_COUNT = 21;
const JONGSUNG_COUNT = 28;

/**
 * 한글 문자에서 초성을 추출합니다.
 */
function getChosung(char: string): string {
  const code = char.charCodeAt(0);
  if (code < HANGUL_START || code > HANGUL_END) return char;
  const offset = code - HANGUL_START;
  const chosungIndex = Math.floor(offset / (JUNGSUNG_COUNT * JONGSUNG_COUNT));
  return CHOSUNG_LIST[chosungIndex];
}

/**
 * 문자열 전체의 초성 배열을 반환합니다.
 * 예: "강남구" → ['ㄱ', 'ㄴ', 'ㄱ']
 */
function extractChosung(str: string): string {
  return str.split('').map(getChosung).join('');
}

/**
 * 쿼리가 전부 초성(자음)으로만 이루어져 있는지 확인합니다.
 */
function isChosungOnly(query: string): boolean {
  return /^[ㄱ-ㅎ]+$/.test(query);
}

/**
 * 한글 초성 + 일반 텍스트 복합 검색
 *
 * - 쿼리가 초성(ㄱㄴ 등)이면 대상 문자열의 초성과 비교
 * - 그 외에는 includes() 비교
 *
 * @param target 검색 대상 문자열
 * @param query 사용자 입력 쿼리
 */
export function matchesSearch(target: string, query: string): boolean {
  if (!query || query.trim() === '') return true;
  const q = query.trim();

  if (isChosungOnly(q)) {
    // 초성 검색: 대상의 초성이 쿼리를 포함하는지
    const targetChosung = extractChosung(target);
    return targetChosung.includes(q);
  }

  // 일반 텍스트 검색 (대소문자 무시)
  return target.toLowerCase().includes(q.toLowerCase());
}

/**
 * 역 이름 목록에서 쿼리에 매칭되는 항목들을 반환합니다.
 *
 * @param stations 역 이름 배열
 * @param query 사용자 입력 쿼리
 * @param maxResults 최대 결과 수 (기본 8)
 */
export function searchStations(stations: string[], query: string, maxResults = 8): string[] {
  if (!query || query.trim() === '') return [];
  return stations.filter(name => matchesSearch(name, query)).slice(0, maxResults);
}
