import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const line = searchParams.get('line');
    const apiKey = process.env.NEXT_PUBLIC_SEOUL_API_KEY;

    if (!line || !apiKey) {
        return NextResponse.json({ error: 'Missing line or apiKey' }, { status: 400 });
    }

    const url = `https://swopenapi.seoul.go.kr/api/subway/${apiKey}/json/realtimeSubwayPosition/1/100/${encodeURIComponent(line)}`;

    try {
        const res = await fetch(url, {
            next: { revalidate: 10 } // Cache for 10 seconds to avoid hitting API limits
        });
        const data = await res.json();
        return NextResponse.json(data);
    } catch (err) {
        console.error("Subway API Proxy Error:", err);
        return NextResponse.json({ error: 'Failed to fetch from Seoul API' }, { status: 500 });
    }
}
