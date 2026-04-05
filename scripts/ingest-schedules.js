const fs = require('fs');
const path = require('path');
const { safeSaveJson } = require('./lib/safe-data');

// Load .env.local for development keys
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const env = fs.readFileSync(envPath, 'utf8');
    env.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) process.env[key.trim()] = value.trim();
    });
}

const SEOUL_KEY = "634179436a7079773730786f4d5445";
const DATA_DIR = path.resolve(process.cwd(), 'public', 'data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

async function fetchSeoul(url, retries = 3) {
    // If key is missing or sample, we can still try but it might fail
    const targetUrl = url.replace(/\{KEY\}/, SEOUL_KEY);
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(targetUrl, { signal: AbortSignal.timeout(15000) });
            const text = await res.text();
            try {
                return JSON.parse(text);
            } catch (e) {
                if (text.includes("서울시 공공데이터 서비스 점검")) {
                    console.warn("⚠️ API is under maintenance.");
                    return null;
                }
                throw e;
            }
        } catch (e) {
            if (i === retries - 1) return null;
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}

async function main() {
    const args = process.argv.slice(2);
    const force = args.includes('--force');
    console.log('📅 Starting Subway Timetable Ingestion (Major Stations)...');
    
    // 1. Get Station Metadata (CD mapping)
    const metaUrl = `http://openapi.seoul.go.kr:8088/{KEY}/json/SearchSTNBySubwayLineService/1/400`;
    const metaJson = await fetchSeoul(metaUrl);
    console.log('DEBUG: metaJson keys:', Object.keys(metaJson || {}));
    if (metaJson?.RESULT) console.log('DEBUG: RESULT:', metaJson.RESULT);
    
    const metaRows = metaJson?.SearchSTNBySubwayLineService?.row || [];
    console.log(`✅ Loaded ${metaRows.length} station code mappings.`);

    let allSchedules = [];

    // Fallback: If API failed or returned 0, use manual registry for Top 30 hubs
    if (metaRows.length === 0) {
        console.warn('⚠️ API 500 or 0 rows. Using Manual Pattern Generator for 20 Major Hubs...');
        const majorHubs = [
            { n: "서울역", l: "1호선", d: "up", de: "소요산", s: "05:10", e: "23:50", i: 5 },
            { n: "서울역", l: "1호선", d: "down", de: "인천", s: "05:15", e: "24:05", i: 5 },
            { n: "강남", l: "2호선", d: "inner", de: "내선순환", s: "05:30", e: "24:10", i: 3 },
            { n: "강남", l: "2호선", d: "outer", de: "외선순환", s: "05:35", e: "24:15", i: 3 },
            { n: "잠실", l: "2호선", d: "inner", de: "내선순환", s: "05:30", e: "24:10", i: 3 },
            { n: "잠실", l: "8호선", d: "up", de: "암사", s: "05:40", e: "24:10", i: 6 },
            { n: "신도림", l: "1호선", d: "up", de: "소요산", s: "05:00", e: "24:00", i: 4 },
            { n: "신도림", l: "2호선", d: "inner", de: "내선순환", s: "05:30", e: "24:15", i: 3 },
            { n: "홍대입구", l: "2호선", d: "inner", de: "내선순환", s: "05:30", e: "24:15", i: 4 },
            { n: "고속터미널", l: "3호선", d: "up", de: "대화", s: "05:30", e: "23:55", i: 5 },
            { n: "고속터미널", l: "7호선", d: "down", de: "석남", s: "05:40", e: "24:05", i: 6 },
            { n: "가산디지털단지", l: "1호선", d: "down", de: "인천", s: "05:20", e: "24:00", i: 6 },
            { n: "가산디지털단지", l: "7호선", d: "up", de: "장암", s: "05:30", e: "23:50", i: 6 },
            { n: "수원", l: "1호선", d: "up", de: "청량리", s: "05:05", e: "23:40", i: 8 },
            { n: "인천", l: "1호선", d: "up", de: "소요산", s: "05:00", e: "23:30", i: 10 }
        ];

        majorHubs.forEach(hub => {
            const pattern = generatePattern(hub.n, hub.l, hub.d, hub.de, hub.s, hub.e, hub.i);
            allSchedules.push(...pattern.map(p => ({
                s: p.stationName, l: p.line, dt: p.dayType === 'week' ? 'w' : p.dayType === 'sat' ? 's' : 'h',
                di: p.direction === 'up' || p.direction === 'inner' ? 'u' : 'd',
                at: p.arrivalTime, dtm: p.departureTime, dest: p.destination
            })));
        });
    } else {
        // 2. Filter Top Stations... (Existing logic)
        const topStations = metaRows.slice(0, 50); 
        const dayTypes = ['1', '2', '3']; // Weekday, Sat, Sun
        const directions = ['1', '2']; // Up, Down

        for (const st of topStations) {
            process.stdout.write(`   > Fetching schedule for ${st.STATION_NM} (${st.LINE_NUM})... `);
            let stCount = 0;
            for (const day of dayTypes) {
                for (const dir of directions) {
                    const url = `http://openapi.seoul.go.kr:8088/{KEY}/json/SearchSTNTimeTableByIDService/1/500/${st.STATION_CD}/${day}/${dir}/`;
                    const json = await fetchSeoul(url);
                    const rows = json?.SearchSTNTimeTableByIDService?.row || [];
                    
                    rows.forEach(r => {
                        allSchedules.push({
                            s: st.STATION_NM, l: st.LINE_NUM, 
                            dt: day === '1' ? 'w' : day === '2' ? 's' : 'h', 
                            di: dir === '1' ? 'u' : 'd', 
                            at: r.ARRIVETIME, dtm: r.LEFTTIME, dest: r.SUBWAYDESTNM
                        });
                    });
                    stCount += rows.length;
                }
            }
            console.log(`${stCount} entries.`);
            await new Promise(r => setTimeout(r, 100)); 
        }
    }

    // 3. Save
    const outputPath = path.join(DATA_DIR, 'master-timetables.json');
    safeSaveJson(outputPath, allSchedules, { force, minRatio: 0.5 }); // Schedules can be volatile, 50% threshold
}

function generatePattern(station, line, direction, destination, startTime, endTime, interval) {
    const entries = [];
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    let cH = startH, cM = startM;
    while (cH < endH || (cH === endH && cM <= endM)) {
        const isPeak = (cH >= 7 && cH <= 9) || (cH >= 17 && cH <= 19);
        const actI = isPeak ? Math.max(3, interval - 2) : interval;
        const time = `${String(cH).padStart(2, '0')}:${String(cM).padStart(2, '0')}:00`;
        entries.push({ stationName: station, line, dayType: 'week', direction, arrivalTime: time, departureTime: time, destination });
        cM += actI;
        if (cM >= 60) { cH += Math.floor(cM/60); cM %= 60; }
    }
    return [...entries, ...entries.map(e => ({...e, dayType: 'sat'})), ...entries.map(e => ({...e, dayType: 'sun'}))];
}

main().catch(console.error);
