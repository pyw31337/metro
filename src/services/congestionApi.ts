import { fetchWithFallbacks } from './arrivalApi';

export interface CongestionData {
    areaName: string;
    congestionLevel: '여유' | '보통' | '부족' | '혼잡';
    ppltnMax: number;
    ppltnMin: number;
    trend: '상승' | '하락' | '유지';
    msg: string;
    timestamp: string;
}

const STATION_AREA_MAP: Record<string, string> = {
    "강남": "강남역",
    "강남역": "강남역",
    "잠실": "잠실역",
    "잠실역": "잠실역",
    "홍대입구": "홍대입구역(2호선)",
    "홍대입구역": "홍대입구역(2호선)",
    "서울역": "서울역",
    "명동": "명동 관광특구",
    "명동역": "명동 관광특구",
    "건대입구": "건대입구역",
    "건대입구역": "건대입구역",
    "신도림": "신도림역",
    "신도림역": "신도림역",
    "고속터미널": "고속터미널역",
    "고속터미널역": "고속터미널역",
    "사당": "사당역",
    "사당역": "사당역",
    "교대": "교대역",
    "교대역": "교대역",
    "신림": "신림역",
    "신림역": "신림역",
    "마곡나루": "서울식물원·마곡나루역",
    "마곡나루역": "서울식물원·마곡나루역",
    "광화문": "광화문·덕수궁",
    "광화문역": "광화문·덕수궁",
    "경복궁": "경복궁",
    "경복궁역": "경복궁",
    "혜화": "혜화역",
    "혜화역": "혜화역",
    "성신여대입구": "성신여대입구역",
    "성신여대입구역": "성신여대입구역",
    "왕십리": "왕십리역",
    "왕십리역": "왕십리역",
    "용산": "용산역",
    "용산역": "용산역",
    "여의도": "여의도",
    "여의도역": "여의도",
    "영등포": "영등포 타임스퀘어",
    "영등포역": "영등포 타임스퀘어",
    "노량진": "노량진",
    "노량진역": "노량진",
    "군자": "군자역",
    "군자역": "군자역",
    "미아사거리": "미아사거리역",
    "미아사거리역": "미아사거리역",
    "가산디지털단지": "가산디지털단지역",
    "가산디지털단지역": "가산디지털단지역",
    "구로디지털단지": "구로디지털단지역",
    "구로디지털단지역": "구로디지털단지역",
    "대림": "대림역",
    "대림역": "대림역",
    "구로": "구로역",
    "구로역": "구로역",
    "합정": "합정역",
    "합정역": "합정역",
    "발산": "발산역",
    "발산역": "발산역",
    "쌍문": "쌍문역",
    "쌍문역": "쌍문역",
    "수유": "수유역",
    "수유역": "수유역",
    "양재": "양재역",
    "양재역": "양재역",
    "천호": "천호역",
    "천호역": "천호역",
    "장한평": "장한평역",
    "장한평역": "장한평역",
    "연신내": "연신내역",
    "연신내역": "연신내역",
    "오목교": "오목교역·목동운동장",
    "오목교역": "오목교역·목동운동장",
    "고덕": "고덕역",
    "고덕역": "고덕역",
    "삼각지": "삼각지역",
    "삼각지역": "삼각지역",
    "충정로": "충정로역",
    "충정로역": "충정로역",
    "회기": "회기역",
    "회기역": "회기역",
    "장지": "장지역",
    "장지역": "장지역",
    "잠실새내": "잠실새내역",
    "잠실새내역": "잠실새내역",
    "성수": "성수카페거리",
    "성수역": "성수카페거리",
    "이태원": "이태원역",
    "이태원역": "이태원역",
    "압구정로데오": "압구정로데오거리",
    "압구정로데오역": "압구정로데오거리",
    "선릉": "선릉역",
    "선릉역": "선릉역",
    "역삼": "역삼역",
    "역삼역": "역삼역",
    "삼성": "삼성역",
    "삼성역": "삼성역",
    "신논현": "신논현역·논현역",
    "신논현역": "신논현역·논현역",
    "논현": "신논현역·논현역",
    "논현역": "신논현역·논현역",
    "가락시장": "가락시장",
    "가락시장역": "가락시장"
};

export const fetchStationCongestion = async (stationName: string): Promise<CongestionData | null> => {
    const cleanName = stationName.replace(/역$/, '');
    const areaName = STATION_AREA_MAP[cleanName] || STATION_AREA_MAP[stationName];
    
    if (!areaName) return null;

    const apiKey = process.env.NEXT_PUBLIC_SEOUL_OPEN_DATA_KEY || 'sample';
    const url = `http://openapi.seoul.go.kr:8088/${apiKey}/json/citydata/1/1/${encodeURIComponent(areaName)}`;

    try {
        const json = await fetchWithFallbacks(url);
        const data = json?.['CITYDATA'];
        if (!data) return null;

        const subObj = data.LIVE_PPLTN_STTS?.[0];
        if (!subObj) return null;

        // Determine trend
        let trend: '상승' | '하락' | '유지' = '유지';
        const msg = subObj.AREA_PPLTN_MSGE || '';
        if (msg.includes('증가') || msg.includes('상승')) trend = '상승';
        else if (msg.includes('감소') || msg.includes('하락')) trend = '하락';

        return {
            areaName: data.AREA_NM,
            congestionLevel: subObj.AREA_PPLTN_LVL,
            ppltnMax: parseInt(subObj.AREA_PPLTN_MAX),
            ppltnMin: parseInt(subObj.AREA_PPLTN_MIN),
            trend,
            msg: subObj.AREA_PPLTN_MSGE,
            timestamp: data.PPLTN_TIME
        };
    } catch (err) {
        console.debug('Failed to fetch congestion:', err);
        return null;
    }
};
