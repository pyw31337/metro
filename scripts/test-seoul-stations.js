// Test Seoul Open API for bus route station sequences
const SEOUL_KEY = "634179436a7079773730786f4d5445";
const ROUTE_ID = "100100111"; // Route 143

async function test(name, url) {
    try {
        const res = await fetch(url);
        const text = await res.text();
        const isGood = res.status === 200 && !text.includes('INFO-100') && !text.includes('INFO-200');
        const marker = isGood ? "✅" : "❌";
        console.log(`\n${marker} ${name} [${res.status}]`);
        console.log("Response:", text.substring(0, 300));
    } catch (e) {
        console.log(`\n❌ ${name}: ${e.message}`);
    }
}

async function main() {
    const B = `http://openapi.seoul.go.kr:8088/${SEOUL_KEY}/json`;
    const tests = [
        // Seoul bus route station services
        ["busRouteStation/1/10/", `${B}/busRouteStation/1/10/${ROUTE_ID}`],
        ["StationByRoute/1/100/", `${B}/StationByRoute/1/100/${ROUTE_ID}`],
        ["getBusRouteStationInfo/1/100/", `${B}/getBusRouteStationInfo/1/100/${ROUTE_ID}`],
        ["busRouteStationInfo/1/100/", `${B}/busRouteStationInfo/1/100/${ROUTE_ID}`],
        ["SeoulBusRoute/1/5/", `${B}/SeoulBusRoute/1/5/`],
        // Try ws.bus.go.kr getStaionByRoute with Seoul key
        ["ws.bus.go.kr getStaionByRoute (SEOUL_KEY encoded)",
         `http://ws.bus.go.kr/api/rest/busRouteInfo/getStaionByRoute?serviceKey=${encodeURIComponent(SEOUL_KEY)}&busRouteId=${ROUTE_ID}&resultType=json`],
        ["ws.bus.go.kr getStaionByRoute (SEOUL_KEY literal)",
         `http://ws.bus.go.kr/api/rest/busRouteInfo/getStaionByRoute?serviceKey=${SEOUL_KEY}&busRouteId=${ROUTE_ID}&resultType=json`],
        // TAGO getRouteAcctoThrghSttnList with Seoul key
        ["TAGO getStations (SEOUL_KEY, city=11)",
         `http://apis.data.go.kr/1613000/BusRouteInfoInqireService/getRouteAcctoThrghSttnList?serviceKey=${encodeURIComponent(SEOUL_KEY)}&_type=json&cityCode=11&routeId=${ROUTE_ID}&numOfRows=200`],
    ];

    for (const [name, url] of tests) {
        await test(name, url);
    }
}

main();
