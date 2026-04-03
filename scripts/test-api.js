// Using global fetch (Node 18+)

const key = "+wF9V/FmtnPwFyVA23nnj8bPMr6408AqX7SOvjeKVxwn/9NdHD9lY3vlQ0SckYijlvhHdjIPmDttxD4bd9YvwQ==";

async function test() {
    const urls = [
        // 5. New Discovery: /info endpoint
        `https://apis.data.go.kr/1741000/public_restroom_info/info?serviceKey=${encodeURIComponent(key)}&type=json&numOfRows=1&pageNo=1`,
        `https://apis.data.go.kr/1741000/public_restroom_info/info?serviceKey=${key}&type=json&numOfRows=1&pageNo=1`,
        // 1. HTTP + Encoded Key
        `http://apis.data.go.kr/1741000/PublicRestroomInqireService/getRestroomList02?serviceKey=${encodeURIComponent(key)}&type=json&numOfRows=1&pageNo=1`,
        // 2. HTTP + Raw Key
        `http://apis.data.go.kr/1741000/PublicRestroomInqireService/getRestroomList02?serviceKey=${key}&type=json&numOfRows=1&pageNo=1`,
        // 3. HTTPS + Encoded Key
        `https://apis.data.go.kr/1741000/PublicRestroomInqireService/getRestroomList02?serviceKey=${encodeURIComponent(key)}&type=json&numOfRows=1&pageNo=1`,
        // 4. HTTPS + Raw Key
        `https://apis.data.go.kr/1741000/PublicRestroomInqireService/getRestroomList02?serviceKey=${key}&type=json&numOfRows=1&pageNo=1`
    ];

    for (const url of urls) {
        console.log(`Testing: ${url.substring(0, 100)}...`);
        try {
            const res = await fetch(url);
            console.log(`Status: ${res.status}`);
            const text = await res.text();
            if (res.ok) {
                try {
                    const data = JSON.parse(text);
                    const item = data?.response?.body?.items?.item?.[0];
                    if (item) {
                        console.log('Sample Item:', JSON.stringify(item, null, 2));
                    }
                } catch (e) {
                    console.log(`Response (text): ${text.substring(0, 200)}`);
                }
            } else {
                console.log(`Response (text): ${text.substring(0, 200)}`);
            }
        } catch (e) {
            console.log(`Error: ${e.message}`);
        }
        console.log('---');
    }
}

test();
