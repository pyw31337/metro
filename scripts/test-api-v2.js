const DATA_GO_KR_KEY_DECODED = "+wF9V/FmtnPwFyVA23nnj8bPMr6408AqX7SOvjeKVxwn/9NdHD9lY3vlQ0SckYijlvhHdjIPmDttxD4bd9YvwQ==";

async function testSeoul() {
    console.log('Testing Seoul...');
    const url = `http://ws.bus.go.kr/api/rest/busRouteInfo/getBusRouteList?serviceKey=${encodeURIComponent(DATA_GO_KR_KEY_DECODED)}&_type=json`;
    try {
        const res = await fetch(url);
        console.log('Seoul Status:', res.status);
        const text = await res.text();
        console.log('Seoul Sample:', text.substring(0, 200));
    } catch (e) {
        console.error('Seoul Error:', e.message);
    }
}

async function testGyeonggi() {
    console.log('\nTesting Gyeonggi v2...');
    const url = `http://apis.data.go.kr/6410000/busrouteservice/v2/getBusRouteListv2?serviceKey=${encodeURIComponent(DATA_GO_KR_KEY_DECODED)}&format=json&keyword=11`;
    try {
        const res = await fetch(url);
        console.log('Gyeonggi Status:', res.status);
        const text = await res.text();
        console.log('Gyeonggi Sample:', text.substring(0, 200));
    } catch (e) {
        console.error('Gyeonggi Error:', e.message);
    }
}

async function testIncheon() {
    console.log('\nTesting Incheon...');
    // Try lower case or different path
    const url = `http://apis.data.go.kr/6280000/busRouteService/getBusRouteList?serviceKey=${encodeURIComponent(DATA_GO_KR_KEY_DECODED)}&_type=json&numOfRows=10`;
    try {
        const res = await fetch(url);
        console.log('Incheon Status:', res.status);
        const text = await res.text();
        console.log('Incheon Sample:', text.substring(0, 200));
    } catch (e) {
        console.error('Incheon Error:', e.message);
    }
}

async function run() {
    await testSeoul();
    await testGyeonggi();
    await testIncheon();
}

run();
