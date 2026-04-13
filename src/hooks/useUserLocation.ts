"use client";

import { useEffect, useRef } from 'react';

// 위치 interpolation을 60fps RAF 대신 ~10fps setInterval로 실행
// 사용자가 정적일 때(t≥1.0) 는 업데이트 완전 중단 → 배터리/CPU 절약
const INTERP_FPS = 10;
const INTERP_INTERVAL_MS = 1000 / INTERP_FPS;

export function useUserLocation(map: any | null) {
    const lastPosRef   = useRef<{ lat: number; lng: number } | null>(null);
    const targetPosRef = useRef<{ lat: number; lng: number; accuracy: number; heading: number | null } | null>(null);
    const lastUpdateRef = useRef<number>(0);
    const isMovingRef   = useRef(false); // 이동 중일 때만 interpolation 구동
    const hasFlownToRef = useRef(false); // 최초 위치 수신 시 1회만 flyTo

    const fetchLocation = () => {
        if (!navigator.geolocation) return;

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const newLoc = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    heading: pos.coords.heading,
                    timestamp: Date.now()
                };

                // 최초 위치 수신 시 지도 중심 이동 (1회)
                if (!hasFlownToRef.current && map) {
                    hasFlownToRef.current = true;
                    try {
                        const doFly = () => map.flyTo({ center: [newLoc.lng, newLoc.lat], zoom: 14, duration: 1500 });
                        if (map.isStyleLoaded()) doFly();
                        else map.once('style.load', doFly);
                    } catch {}
                }

                if (!lastPosRef.current) {
                    lastPosRef.current = newLoc;
                }
                if (targetPosRef.current) {
                    // 이전 목표와 새 목표가 충분히 다를 때만 이동 중으로 표시
                    const dLat = Math.abs(newLoc.lat - targetPosRef.current.lat);
                    const dLng = Math.abs(newLoc.lng - targetPosRef.current.lng);
                    isMovingRef.current = dLat > 0.000005 || dLng > 0.000005; // ~0.5m
                    lastPosRef.current = targetPosRef.current;
                }

                targetPosRef.current = newLoc;
                lastUpdateRef.current = Date.now();
            },
            () => { /* silent */ },
            // PC엔 GPS 없음 → enableHighAccuracy:false로 네트워크 위치 사용, 60초 캐시 허용
            { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
        );
    };

    useEffect(() => {
        if (!map) return;

        fetchLocation();
        let pollInterval = setInterval(fetchLocation, 10000);

        // 탭 숨김 시 폴링 중단, 복귀 시 즉시 갱신 후 재시작
        const handleVisibility = () => {
            if (document.visibilityState === 'hidden') {
                clearInterval(pollInterval);
            } else {
                fetchLocation();
                pollInterval = setInterval(fetchLocation, 10000);
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        // focus 이벤트 제거 — 창 전환마다 권한 프롬프트 트리거 방지

        // ~10fps interpolation loop (RAF 대신 setInterval 사용 → 백그라운드 자동 스로틀)
        const interpInterval = setInterval(() => {
            if (!lastPosRef.current || !targetPosRef.current || !map || !map.isStyleLoaded()) return;

            const elapsed = Date.now() - lastUpdateRef.current;
            const t = Math.min(1.0, elapsed / 10000);

            // 이미 목표에 도달했고 이동 중이 아니면 스킵
            if (t >= 1.0 && !isMovingRef.current) return;

            const currentLat = lastPosRef.current.lat + (targetPosRef.current.lat - lastPosRef.current.lat) * t;
            const currentLng = lastPosRef.current.lng + (targetPosRef.current.lng - lastPosRef.current.lng) * t;

            const source: any = map.getSource('user-location-source');
            if (source) {
                source.setData({
                    type: 'FeatureCollection',
                    features: [{
                        type: 'Feature',
                        geometry: { type: 'Point', coordinates: [currentLng, currentLat] },
                        properties: {
                            accuracy: targetPosRef.current.accuracy,
                            heading:  targetPosRef.current.heading || 0
                        }
                    }]
                });
            }

            if (t >= 1.0) isMovingRef.current = false;
        }, INTERP_INTERVAL_MS);

        return () => {
            clearInterval(pollInterval);
            clearInterval(interpInterval);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [map]);
}
