const DATA_GO_KR_KEY = "+wF9V/FmtnPwFyVA23nnj8bPMr6408AqX7SOvjeKVxwn/9NdHD9lY3vlQ0SckYijlvhHdjIPmDttxD4bd9YvwQ==";

async function testSeoul() {
    const routeId = "100100111"; // Route 143
    const endpoints = [
        {
            name: "Seoul Bus API (Encoded Key)",
            url: `http://ws.bus.go.kr/api/rest/busRouteInfo/getRoutePath?serviceKey=${encodeURIComponent(DATA_GO_KR_KEY)}&busRouteId=${routeId}&resultType=json`
        },
        {
            name: "Seoul Bus API (Literal Key)",
            url: `http://ws.bus.go.kr/api/rest/busRouteInfo/getRoutePath?serviceKey=${DATA_GO_KR_KEY}&busRouteId=${routeId}&resultType=json`
        },
        {
            name: "Tago API (Encoded Key, City 11)",
            url: `http://apis.data.go.kr/1613000/BusRouteInfoInqireService/getRoutePathList?serviceKey=${encodeURIComponent(DATA_GO_KR_KEY)}&_type=json&cityCode=11&routeId=${routeId}`
        },
         {
            name: "Tago API (Literal Key, City 11)",
            url: `http://apis.data.go.kr/1613000/BusRouteInfoInqireService/getRoutePathList?serviceKey=${DATA_GO_KR_KEY}&_type=json&cityCode=11&routeId=${routeId}`
        },
        {
            name: "Tago Stations Fallback (Encoded Key, City 11)",
            url: `http://apis.data.go.kr/1613000/BusRouteInfoInqireService/getRouteAcctoThrghSttnList?serviceKey=${encodeURIComponent(DATA_GO_KR_KEY)}&_type=json&cityCode=11&routeId=${routeId}&numOfRows=400`
        },
        {
            name: "Seoul Open Data (openapi.seoul.go.kr) - getRoutePath",
            url: `http://openAPI.seoul.go.kr:8088/78684d72497079773836696b4b4b45/json/getRoutePath/1/1000/${routeId}`
        }
    ];

    for (const ep of endpoints) {
        console.log(`\nTesting ${ep.name}...`);
        try {
            const res = await fetch(ep.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            console.log('Status:', res.status);
            const text = await res.text();
            console.log('Response (first 200 chars):', text.substring(0, 200));
            if (text.includes('msgBody') || text.includes('item')) {
                console.log('✅ SUCCESS!');
            }
        } catch (e) {
            console.error('❌ Error:', e.message);
        }
    }
}

testSeoul();
