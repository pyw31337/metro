/**
 * api.js
 * 실시간 도착 정보 및 외부 API 연동
 */

const API_CONFIG = {
    SEOUL_API_KEY: 'sample',
    SUBWAY_BASE_URL: 'http://swopenapi.seoul.go.kr/api/subway',
    SEOUL_BUS_URL: 'http://ws.bus.go.kr/api/rest',
    GBUS_URL: 'http://apis.data.go.kr/6410000', // Gyeonggi
    IBUS_URL: 'http://apis.data.go.kr/6280000'  // Incheon
};

/**
 * 실시간 지하철 도착 정보 조회
 * @param {string} stationName - "강남"
 */
async function fetchArrivalInfo(stationName) {
    const key = CONFIG.SEOUL_API_KEY || API_CONFIG.SEOUL_API_KEY;
    const url = `${API_CONFIG.SUBWAY_BASE_URL}/${key}/json/realtimeStationArrival/0/10/${stationName}`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('API Request Failed');
        
        const data = await response.json();
        const list = data.realtimeArrivalList || [];

        return list.map(item => ({
            trainNo: item.btrainNo,
            destination: item.bstatnNm,
            direction: item.updnLine === "0" ? "상행/내선" : "하행/외선",
            message: normalizeArrivalMessage(item.arvlMsg2, parseInt(item.arvlMsg3)),
            secondsLeft: parseInt(item.arvlMsg3),
            lineId: item.subwayId,
            statusColor: getStatusColor(parseInt(item.arvlMsg3))
        }));
    } catch (error) {
        console.warn(`[API] CORS 이슈 또는 서버 에러로 Mock 데이터 사용: ${error.message}`);
        return getMockArrivalInfo(stationName);
    }
}

/**
 * 도착 메시지 정규화
 * 0~60초: "곧 도착"
 * 61~180초: m분
 * 181초 이상: m분
 */
function normalizeArrivalMessage(msg, seconds) {
    if (isNaN(seconds) || seconds <= 0) return msg;
    if (seconds <= 60) return "곧 도착";
    return `${Math.ceil(seconds / 60)}분`;
}

/**
 * 디자인 토큰 기반 상태 컬러 반환
 */
function getStatusColor(seconds) {
    if (isNaN(seconds) || seconds <= 0) return 'var(--arrival-normal)';
    if (seconds <= 60) return 'var(--arrival-urgent)';
    if (seconds <= 180) return 'var(--arrival-soon)';
    return 'var(--arrival-normal)';
}

/**
 * CORS 에러 발생 시를 위한 Fallback Mock 데이터
 */
function getMockArrivalInfo(stationName) {
    return [
        {
            trainNo: "1234",
            destination: "성수행",
            direction: "내선순환",
            message: "곧 도착",
            secondsLeft: 30,
            lineId: "1002",
            statusColor: 'var(--arrival-urgent)'
        },
        {
            trainNo: "5678",
            destination: "홍대입구행",
            direction: "외선순환",
            message: "3분",
            secondsLeft: 180,
            lineId: "1002",
            statusColor: 'var(--arrival-soon)'
        }
    ];
}

window.fetchArrivalInfo = fetchArrivalInfo;

/**
 * 지도 범위 정류장 조회 (서울 위주 샘플)
 */
async function fetchBusStations(lat, lng, radius = 500) {
    const key = CONFIG.BUS_API_KEY || API_CONFIG.SEOUL_API_KEY;
    const url = `${API_CONFIG.SEOUL_BUS_URL}/stationinfo/getStationByPos?ServiceKey=${key}&tmX=${lng}&tmY=${lat}&radius=${radius}&resultType=json`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Station API Failed');
        const data = await response.json();
        return parseSeoulStations(data);
    } catch (e) {
        console.warn('[Bus] Mocking Stations');
        return getMockStations(lat, lng);
    }
}

/**
 * 정류장 경유 노선 조회
 */
async function fetchBusRoutesByStation(arsId) {
    const key = CONFIG.BUS_API_KEY || API_CONFIG.SEOUL_API_KEY;
    const url = `${API_CONFIG.SEOUL_BUS_URL}/stationinfo/getRouteByStation?ServiceKey=${key}&arsId=${arsId}&resultType=json`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        return parseSeoulBusRoutes(data);
    } catch (e) {
        return getMockRoutes();
    }
}

/**
 * 실시간 버스 위치 조회
 */
async function fetchBusLocation(busRouteId) {
    const key = CONFIG.BUS_API_KEY || API_CONFIG.SEOUL_API_KEY;
    const url = `${API_CONFIG.SEOUL_BUS_URL}/buspos/getBusPosByRtid?ServiceKey=${key}&busRouteId=${busRouteId}&resultType=json`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        return parseSeoulBusPos(data);
    } catch (e) {
        return [];
    }
}

/* Regional Parsers */
function parseSeoulStations(data) {
    const list = data?.msgBody?.itemList || [];
    return list.map(item => ({
        id: item.stationId,
        arsId: item.arsId,
        name: item.stationNm,
        lat: parseFloat(item.gpsY),
        lng: parseFloat(item.gpsX),
        type: 'seoul'
    }));
}

function parseSeoulBusRoutes(data) {
    const list = data?.msgBody?.itemList || [];
    return list.map(item => ({
        id: item.busRouteId,
        number: item.busRouteNm,
        type: item.routeType, // 1:파랑, 2:초록, 3:빨강, 4:노랑
        stStation: item.stStationNm,
        edStation: item.edStationNm,
        term: item.term,
        firstTime: item.firstBusTm,
        lastTime: item.lastBusTm
    }));
}

function parseSeoulBusPos(data) {
    const list = data?.msgBody?.itemList || [];
    return list.map(item => ({
        id: item.vehId,
        no: item.plainNo,
        lat: parseFloat(item.gpsY),
        lng: parseFloat(item.gpsX),
        stId: item.lastStnId,
        stopFlag: item.stopFlag
    }));
}

/* Mock Helpers */
function getMockStations(lat, lng) {
    return [
        { id: '100000001', arsId: '01001', name: '종로1가', lat: lat + 0.001, lng: lng + 0.001, type: 'seoul' },
        { id: '100000002', arsId: '01002', name: '광화문', lat: lat - 0.001, lng: lng - 0.001, type: 'seoul' }
    ];
}

function getMockRoutes() {
    return [
        { id: '100100011', number: '160', type: '1', stStation: '도봉산', edStation: '온수동' },
        { id: '100100077', number: '472', type: '1', stStation: '은평', edStation: '개포동' }
    ];
}

window.fetchBusStations = fetchBusStations;
window.fetchBusRoutesByStation = fetchBusRoutesByStation;
window.fetchBusLocation = fetchBusLocation;

/**
 * 실시간 열차 위치 조회
 * @param {string} lineName - "2호선"
 */
async function fetchTrainPositions(lineName) {
    const key = CONFIG.SEOUL_API_KEY || API_CONFIG.SEOUL_API_KEY;
    const url = `http://swopenapi.seoul.go.kr/api/subway/${key}/json/realtimeTrainPosition/0/50/${lineName}`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Train API Failed');
        const data = await response.json();
        const list = data.realtimeTrainPositionList || [];
        
        return list.map(item => ({
            id: item.trainNo,
            no: item.trainNo,
            stName: item.statnNm,
            stId: item.statnId,
            destination: item.statnTnm,
            status: item.trainSttus, // 0:진입, 1:도착, 2:출발
            updnLine: item.updnLine, // 0:상행/내선, 1:하행/외선
            directAt: item.directAt,
            lastStName: item.statnTnm
        }));
    } catch (e) {
        console.warn(`[Subway] Mocking Train Pos for ${lineName}`);
        return getMockTrainPositions(lineName);
    }
}

function getMockTrainPositions(lineName) {
    if (lineName !== '2호선') return [];
    return [
        { id: '2234', no: '2234', stName: '강남', stId: '1002000222', destination: '성수행', status: '1', updnLine: '0' },
        { id: '2567', no: '2567', stName: '홍대입구', stId: '1002000239', destination: '신도림행', status: '0', updnLine: '1' }
    ];
}

window.fetchTrainPositions = fetchTrainPositions;
