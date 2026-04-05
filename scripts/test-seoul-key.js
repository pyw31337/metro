const SEOUL_KEY = "634179436a7079773730786f4d5445";

async function testSeoulWithKey() {
    console.log('Testing Seoul with SEOUL_KEY (OpenData Key)...');
    // Pattern: http://openapi.seoul.go.kr:8088/{KEY}/{TYPE}/{SERVICE}/{START_INDEX}/{END_INDEX}/{PARAMS}
    const url = `http://openapi.seoul.go.kr:8088/${SEOUL_KEY}/json/busRoute/1/10/`;
    try {
        const res = await fetch(url);
        console.log('Status:', res.status);
        const json = await res.json();
        console.log('Sample Data:', JSON.stringify(json, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    }
}

testSeoulWithKey();
