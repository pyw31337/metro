/**
 * Administrative City Codes for TAGO API
 * Boundaries are approximate for trigger logic.
 */
export const REGION_BOUNDS = [
  { name: "서울", cityCode: "11", bounds: [[37.4, 126.7], [37.7, 127.2]] },
  { name: "인천", cityCode: "23", bounds: [[37.3, 126.3], [37.6, 126.8]] },
  { name: "대전", cityCode: "25", bounds: [[36.2, 127.2], [36.5, 127.5]] },
  { name: "세종", cityCode: "36010", bounds: [[36.4, 127.2], [36.7, 127.4]] },
  { name: "강릉", cityCode: "32010", bounds: [[37.6, 128.7], [37.9, 129.1]] },
  { name: "춘천", cityCode: "32020", bounds: [[37.7, 127.6], [38.0, 127.9]] },
  { name: "원주", cityCode: "32030", bounds: [[37.2, 127.8], [37.5, 128.1]] },
  { name: "청주", cityCode: "33010", bounds: [[36.5, 127.3], [36.8, 127.6]] },
  { name: "충주", cityCode: "33020", bounds: [[36.8, 127.8], [37.1, 128.1]] },
];

/**
 * Find city code for a given coordinate.
 */
export const getCityCodeByCoords = (lat: number, lng: number) => {
  const match = REGION_BOUNDS.find(r => 
    lat >= r.bounds[0][0] && lat <= r.bounds[1][0] &&
    lng >= r.bounds[0][1] && lng <= r.bounds[1][1]
  );
  return match?.cityCode || null;
};
