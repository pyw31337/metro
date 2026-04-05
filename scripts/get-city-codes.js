const DATA_GO_KR_KEY_DECODED = "+wF9V/FmtnPwFyVA23nnj8bPMr6408AqX7SOvjeKVxwn/9NdHD9lY3vlQ0SckYijlvhHdjIPmDttxD4bd9YvwQ==";

async function getCityCodes() {
    console.log('Fetching TAGO City Codes...');
    const url = `http://apis.data.go.kr/1613000/BusRouteInfoInqireService/getCityCodeList?serviceKey=${encodeURIComponent(DATA_GO_KR_KEY_DECODED)}&_type=json`;
    try {
        const res = await fetch(url);
        const text = await res.text();
        console.log(text);
    } catch (e) {
        console.error('Error:', e.message);
    }
}

getCityCodes();
