/**
 * wc-api.js
 * 수도권 통합 화장실 데이터 서비스
 */

const WC_CONFIG = {
    SEOUL_URL: 'http://openapi.seoul.go.kr:8088',
    GG_URL: 'https://openapi.gg.go.kr/Publtolt', // 경기도 공공데이터
    NATIONAL_URL: 'https://api.odcloud.kr/api/15012892/v1/uddi:25c8ddd6-c0a4-4abb-bece-d9b6b0ce85a0' // 전국 표준 데이터
};

const CACHE_KEY = 'metro_restrooms';
const CACHE_EXPIRE = 24 * 60 * 60 * 1000; // 24시간

/**
 * 수도권 화장실 전체 수집 및 캐싱
 */
async function fetchRestrooms(forceRefresh = false) {
    const cached = localStorage.getItem(CACHE_KEY);
    const timestamp = localStorage.getItem(`${CACHE_KEY}_time`);
    
    if (!forceRefresh && cached && timestamp && (Date.now() - parseInt(timestamp) < CACHE_EXPIRE)) {
        console.log('[WC] Loaded from Cache');
        return JSON.parse(cached);
    }

    console.log('[WC] Fetching Remote Data...');
    try {
        const [seoul, national] = await Promise.all([
            fetchSeoulWC_Full(),
            fetchNationalWC_Full()
        ]);
        
        const combined = [...seoul, ...national];
        
        // 수도권 필터링 (Lat 37.0~38.0, Lon 126.5~127.9)
        const filtered = combined.filter(wc => 
            wc.lat >= 37.0 && wc.lat <= 38.0 && 
            wc.lng >= 126.5 && wc.lng <= 127.9
        );

        localStorage.setItem(CACHE_KEY, JSON.stringify(filtered));
        localStorage.setItem(`${CACHE_KEY}_time`, Date.now().toString());

        return filtered;
    } catch (e) {
        console.error('[WC] All APIs Failed', e);
        return cached ? JSON.parse(cached) : [];
    }
}

async function fetchSeoulWC_Full() {
    const key = CONFIG.SEOUL_API_KEY || 'sample';
    // 서울시 1000개 수집
    const url = `${WC_CONFIG.SEOUL_URL}/${key}/json/SearchPublicToiletPOIService/1/1000/`;
    const response = await fetch(url);
    const data = await response.json();
    return (data.SearchPublicToiletPOIService?.row || []).map(item => ({
        id: `seoul-${item.POI_ID}`,
        name: item.FNAME,
        lat: parseFloat(item.Y_WGS84),
        lng: parseFloat(item.X_WGS84),
        address: item.ANAME,
        is24h: item.OPEN_TIME?.includes('24시간'),
        openTime: '00:00',
        closeTime: '24:00',
        hasHandicap: true, // 서울시 데이터는 대부분 갖춤
        hasDiaper: false,
        type: 'seoul',
        managerTel: item.COT_TEL_NO,
        note: item.INSERT_DATE
    }));
}

async function fetchNationalWC_Full() {
    const key = CONFIG.PUBLIC_DATA_KEY;
    if (!key) return [];
    
    // 전국 데이터 1000개 호출 (수도권 비중이 높음)
    const url = `${WC_CONFIG.NATIONAL_URL}?page=1&perPage=1000&serviceKey=${key}`;
    const response = await fetch(url);
    const data = await response.json();
    
    return (data.data || []).map(item => ({
        id: `nat-${item.lat}-${item.lng}`,
        name: item.화장실명,
        lat: parseFloat(item.위도),
        lng: parseFloat(item.경도),
        address: item.소재지도로명주소 || item.소재지지번주소,
        is24h: item.개방시간?.includes('24시간'),
        openTime: item.평일개방시작시각 || '09:00',
        closeTime: item.평일개방종료시각 || '18:00',
        hasHandicap: item.장애인용대변기설치수 > 0,
        hasDiaper: item.기저귀교환대설치지점?.includes('남') || item.기저귀교환대설치지점?.includes('여'),
        managerTel: item.전화번호,
        type: 'national',
        note: item.기타사항
    }));
}

/**
 * 현재 위치 기반 최단 거리 계산
 */
function getNearestRestrooms(userLat, userLng, list, count = 10) {
    if (!list) return [];
    return list
        .map(wc => ({
            ...wc,
            distance: calculateDistance(userLat, userLng, wc.lat, wc.lng)
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, count);
}

/**
 * 하버사인(Haversine) 공식을 이용한 두 좌표 간 거리 계산 (단위: km)
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

window.fetchRestrooms = fetchRestrooms;
window.getNearestRestrooms = getNearestRestrooms;
window.calculateDistance = calculateDistance;
