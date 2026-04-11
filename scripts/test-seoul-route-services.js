// Test Seoul Open API for bus route-station services
const SEOUL_KEY = "634179436a7079773730786f4d5445";
const ROUTE_ID = "100100111"; // Route 143 routeId
const ROUTE_NO = "143"; // Route number

async function test(name, url) {
    try {
        const res = await fetch(url);
        const text = await res.text();
        const code = text.match(/"CODE":"([^"]+)"/)?.[1] || '';
        const isGood = res.status === 200 && !code.includes('ERROR') && !code.includes('INFO-1');
        const marker = isGood ? "✅✅" : (code === 'ERROR-500' ? "🚫" : (code ? `⚠️[${code}]` : `❌[${res.status}]`));
        console.log(`\n${marker} ${name}`);
        if (isGood) console.log("Response:", text.substring(0, 500));
        else if (code !== 'ERROR-500') console.log("Response:", text.substring(0, 200));
    } catch (e) {
        console.log(`\n❌ ${name}: ${e.message}`);
    }
}

async function main() {
    const B = `http://openapi.seoul.go.kr:8088/${SEOUL_KEY}/json`;
    const tests = [
        // busRoute service (known to work) - check if it has station info
        ["busRoute detail with routeId", `${B}/busRoute/1/1/${ROUTE_ID}`],

        // Station-by-route service name variations
        ["busRouteInfo/1/5/", `${B}/busRouteInfo/1/5/${ROUTE_ID}`],
        ["busRouteStationByRouteList/1/5/", `${B}/busRouteStationByRouteList/1/5/${ROUTE_ID}`],
        ["BusStationByRouteService/1/5/", `${B}/BusStationByRouteService/1/5/${ROUTE_ID}`],
        ["SearchSTNByRouteInfo/1/5/", `${B}/SearchSTNByRouteInfo/1/5/${ROUTE_ID}`],

        // ws.bus.go.kr via data.go.kr service ID variations
        // Try to find the right service path under apis.data.go.kr
        ["apis.data.go.kr/1160000", `https://apis.data.go.kr/1160000/BusRouteInfoService/getStaionsByRouteList?serviceKey=${encodeURIComponent("634179436a7079773730786f4d5445")}&busRouteId=${ROUTE_ID}&_type=json`],

        // Try ws.bus.go.kr with the actual SEOUL_KEY
        ["ws.bus.go.kr getRoutePath (SEOUL_KEY encoded)",
         `http://ws.bus.go.kr/api/rest/busRouteInfo/getRoutePath?serviceKey=${encodeURIComponent(SEOUL_KEY)}&busRouteId=${ROUTE_ID}&resultType=json`],

        // Check if there's a newer Seoul transit API
        ["topis.seoul.go.kr/getRouteInfo",
         `https://topis.seoul.go.kr/api/getRouteInfo?route_id=${ROUTE_ID}`],
    ];

    for (const [name, url] of tests) {
        await test(name, url);
    }
}

main();
