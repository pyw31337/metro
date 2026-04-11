// 15000193 namespace returns 500, not 404 — it's registered! Try different param names
const KEY = "+wF9V/FmtnPwFyVA23nnj8bPMr6408AqX7SOvjeKVxwn/9NdHD9lY3vlQ0SckYijlvhHdjIPmDttxD4bd9YvwQ==";
const ENCODED_KEY = encodeURIComponent(KEY);
const ROUTE_ID = "100100111"; // Seoul route 143

async function test(name, url) {
    try {
        const res = await fetch(url);
        const text = await res.text();
        const status = res.status;
        const isGood = status === 200 && !text.includes('인증실패') && !text.includes('ACCESS DENIED') && !text.includes('INFO-100') && !text.includes('인증키가 유효하지');
        const marker = isGood ? "✅✅" : (status === 200 ? "⚠️" : (status === 500 ? "🔥500" : "❌"));
        console.log(`\n${marker} ${name}`);
        console.log("Status:", status);
        console.log("Response:", text.substring(0, 300));
    } catch (e) {
        console.log(`\n❌ ${name}: ${e.message}`);
    }
}

async function main() {
    const BASE = `https://apis.data.go.kr/15000193`;
    const tests = [
        // param name variations for getRoutePathList
        ["getRoutePathList?routeId=", `${BASE}/BusRouteInfoService/getRoutePathList?serviceKey=${ENCODED_KEY}&routeId=${ROUTE_ID}&_type=json`],
        ["getRoutePathList?busRouteId=", `${BASE}/BusRouteInfoService/getRoutePathList?serviceKey=${ENCODED_KEY}&busRouteId=${ROUTE_ID}&_type=json`],
        ["getRoutePathList no params", `${BASE}/BusRouteInfoService/getRoutePathList?serviceKey=${ENCODED_KEY}&_type=json`],

        // getBusRouteList param variations
        ["getBusRouteList?strSrch=143", `${BASE}/BusRouteInfoService/getBusRouteList?serviceKey=${ENCODED_KEY}&strSrch=143&_type=json`],
        ["getBusRouteList?busRouteNm=143", `${BASE}/BusRouteInfoService/getBusRouteList?serviceKey=${ENCODED_KEY}&busRouteNm=143&_type=json`],
        ["getBusRouteList no params", `${BASE}/BusRouteInfoService/getBusRouteList?serviceKey=${ENCODED_KEY}&_type=json`],

        // getRouteInfoItem
        ["getRouteInfoItem?busRouteId=", `${BASE}/BusRouteInfoService/getRouteInfoItem?serviceKey=${ENCODED_KEY}&busRouteId=${ROUTE_ID}&_type=json`],
        ["getRouteInfoItem no params", `${BASE}/BusRouteInfoService/getRouteInfoItem?serviceKey=${ENCODED_KEY}&_type=json`],

        // Different service name paths (not BusRouteInfoService)
        ["15000193/busRouteInfo/getRoutePathList", `${BASE}/busRouteInfo/getRoutePathList?serviceKey=${ENCODED_KEY}&busRouteId=${ROUTE_ID}&_type=json`],
        ["15000193/getRoutePathList (flat)", `${BASE}/getRoutePathList?serviceKey=${ENCODED_KEY}&busRouteId=${ROUTE_ID}&_type=json`],

        // Try XML output type too
        ["getRoutePathList XML", `${BASE}/BusRouteInfoService/getRoutePathList?serviceKey=${ENCODED_KEY}&busRouteId=${ROUTE_ID}`],
    ];

    for (const [name, url] of tests) {
        await test(name, url);
    }
}

main();
