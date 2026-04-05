const DATA_GO_KR_KEY_DECODED = "+wF9V/FmtnPwFyVA23nnj8bPMr6408AqX7SOvjeKVxwn/9NdHD9lY3vlQ0SckYijlvhHdjIPmDttxD4bd9YvwQ==";

async function getAreaCodes() {
    console.log('Fetching TAGO Area Codes...');
    const url = `http://apis.data.go.kr/1613000/BusRouteInfoInqireService/getAreaCodeList?serviceKey=${encodeURIComponent(DATA_GO_KR_KEY_DECODED)}&_type=json`;
    try {
        const res = await fetch(url);
        const json = await res.json();
        console.log(JSON.stringify(json, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    }
}

getAreaCodes();
