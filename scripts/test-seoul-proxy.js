// Testing data.go.kr proxy URLs for "서울특별시_노선정보조회 서비스" (ID 15000193)
const KEY = "+wF9V/FmtnPwFyVA23nnj8bPMr6408AqX7SOvjeKVxwn/9NdHD9lY3vlQ0SckYijlvhHdjIPmDttxD4bd9YvwQ==";
const ENCODED_KEY = encodeURIComponent(KEY);
const ROUTE_ID = "100100111"; // Seoul route 143

async function test(name, url) {
    try {
        const res = await fetch(url);
        const text = await res.text();
        const ok = !text.includes('인증실패') && !text.includes('ACCESS DENIED') && !text.includes('INFO-100') && !text.includes('API not found') && !text.includes('인증키가 유효하지');
        const marker = ok ? "✅" : "❌";
        console.log(`\n${marker} ${name}`);
        console.log("Status:", res.status);
        console.log("Response:", text.substring(0, 250));
    } catch (e) {
        console.log(`\n❌ ${name}: ${e.message}`);
    }
}

async function main() {
    const tests = [
        // data.go.kr 프록시 패턴들
        ["data.go.kr 15000193/getRoutePathList",
         `https://apis.data.go.kr/15000193/BusRouteInfoService/getRoutePathList?serviceKey=${ENCODED_KEY}&busRouteId=${ROUTE_ID}&_type=json`],

        ["data.go.kr 15000193/getStaionsByRouteList",
         `https://apis.data.go.kr/15000193/BusRouteInfoService/getStaionsByRouteList?serviceKey=${ENCODED_KEY}&busRouteId=${ROUTE_ID}&_type=json`],

        ["data.go.kr 15000193/getBusRouteList",
         `https://apis.data.go.kr/15000193/BusRouteInfoService/getBusRouteList?serviceKey=${ENCODED_KEY}&strSrch=143&_type=json`],

        ["data.go.kr 15000193/getRouteInfoItem",
         `https://apis.data.go.kr/15000193/BusRouteInfoService/getRouteInfoItem?serviceKey=${ENCODED_KEY}&busRouteId=${ROUTE_ID}&_type=json`],

        // 네임스페이스 없이
        ["data.go.kr (no namespace)/getRoutePathList",
         `https://apis.data.go.kr/BusRouteInfoService/getRoutePathList?serviceKey=${ENCODED_KEY}&busRouteId=${ROUTE_ID}&_type=json`],

        // 서울시 6260000 namespace
        ["data.go.kr 6260000/getRoutePathList",
         `https://apis.data.go.kr/6260000/BusRouteInfoService/getRoutePathList?serviceKey=${ENCODED_KEY}&busRouteId=${ROUTE_ID}&_type=json`],

        ["data.go.kr 6260000/SeoulBusRoute/getRoutePathList",
         `https://apis.data.go.kr/6260000/SeoulBusRoute/getRoutePathList?serviceKey=${ENCODED_KEY}&busRouteId=${ROUTE_ID}&_type=json`],

        // ws.bus.go.kr with different encoding
        ["ws.bus.go.kr getRoutePath (encoded, json)",
         `http://ws.bus.go.kr/api/rest/busRouteInfo/getRoutePath?serviceKey=${ENCODED_KEY}&busRouteId=${ROUTE_ID}&resultType=json`],

        // data.go.kr service discovery
        ["data.go.kr service list for 15000193",
         `https://apis.data.go.kr/15000193/?serviceKey=${ENCODED_KEY}`],
    ];

    for (const [name, url] of tests) {
        await test(name, url);
    }
}

main();
