const DATA_GO_KR_KEY_DECODED = "+wF9V/FmtnPwFyVA23nnj8bPMr6408AqX7SOvjeKVxwn/9NdHD9lY3vlQ0SckYijlvhHdjIPmDttxD4bd9YvwQ==";

async function testTagoSeoul() {
    console.log('Testing National (TAGO) for Seoul (11)...');
    const url = `http://apis.data.go.kr/1613000/BusRouteInfoInqireService/getRouteNoList?serviceKey=${encodeURIComponent(DATA_GO_KR_KEY_DECODED)}&_type=json&cityCode=11&numOfRows=10`;
    try {
        const res = await fetch(url);
        console.log('Status:', res.status);
        const json = await res.json();
        console.log('Sample Data:', JSON.stringify(json, null, 2).substring(0, 500));
    } catch (e) {
        console.error('Error:', e.message);
    }
}

testTagoSeoul();
