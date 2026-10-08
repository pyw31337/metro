import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const OK = { errorMessage: { status: 200, code: 'INFO-000' }, realtimeArrivalList: [{ statnNm: '강남' }] };

describe('dedicated subway proxy (Cloudflare Worker)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_SUBWAY_PROXY_URL', 'https://proxy.example.dev/');
    vi.stubEnv('NEXT_PUBLIC_SEOUL_API_KEY', '');
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('calls the Worker with a KEY placeholder (no real key in the client)', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string) => { calls.push(String(u)); return new Response(JSON.stringify(OK), { status: 200 }); }));
    const api = await import('@/services/seoulApi');
    const r = await api.callSeoulSubway('json/realtimeStationArrival/0/40/강남');
    expect(r.kind).toBe('ok');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe('https://proxy.example.dev/KEY/json/realtimeStationArrival/0/40/%EA%B0%95%EB%82%A8');
    expect(api.usingDedicatedProxy()).toBe(true);
  });

  it('falls back to public CORS proxies with the sample key when the Worker fails', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      const url = String(u); calls.push(url);
      if (url.startsWith('https://proxy.example.dev')) return new Response('{"code":"PROXY-UPSTREAM"}', { status: 502 });
      return new Response(JSON.stringify(OK), { status: 200 });
    }));
    const api = await import('@/services/seoulApi');
    const r = await api.callSeoulSubway('json/realtimeStationArrival/0/40/강남');
    expect(r.kind).toBe('ok');
    const fallback = calls.find(u => !u.startsWith('https://proxy.example.dev'))!;
    expect(fallback).toContain('/sample/json/realtimeStationArrival/0/5/');
    expect(api.usingDedicatedProxy()).toBe(false); // 60초 동안 Worker 건너뜀
    expect(api.getSeoulApiIssue()).toBe('sample-key');
  });
});
