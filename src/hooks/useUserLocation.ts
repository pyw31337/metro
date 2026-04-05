"use client";

import { useEffect, useState, useRef } from 'react';

export interface UserLocation {
    lat: number;
    lng: number;
    accuracy: number;
    heading: number | null;
    timestamp: number;
}

export function useUserLocation(map: any | null) {
    const [location, setLocation] = useState<UserLocation | null>(null);
    const lastPosRef = useRef<UserLocation | null>(null);
    const targetPosRef = useRef<UserLocation | null>(null);
    const lastUpdateRef = useRef<number>(0);

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

                if (!lastPosRef.current) {
                    lastPosRef.current = newLoc;
                    setLocation(newLoc);
                }
                
                // Shift current target to last position for interpolation
                if (targetPosRef.current) {
                    lastPosRef.current = targetPosRef.current;
                }
                
                targetPosRef.current = newLoc;
                lastUpdateRef.current = Date.now();
            },
            (err) => {
                console.warn("Geolocation error:", err);
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
    };

    useEffect(() => {
        if (!map) return;

        // Initial fetch
        fetchLocation();

        // 10s interval as requested
        const interval = setInterval(fetchLocation, 10000);

        // Immediate fetch on focus/visible
        const handleRefresh = () => fetchLocation();
        window.addEventListener('focus', handleRefresh);
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') fetchLocation();
        };
        document.addEventListener('visibilitychange', handleVisibility);

        // Animation Loop for 60fps interpolation
        let rafId: number;
        const animate = () => {
            if (lastPosRef.current && targetPosRef.current && map && map.isStyleLoaded()) {
                const now = Date.now();
                const elapsed = now - lastUpdateRef.current;
                const duration = 10000; // 10s polling window
                const t = Math.min(1.1, elapsed / duration); // Allow slight overshoot for smoothness

                // Smoothly interpolate between last known and target
                const currentLat = lastPosRef.current.lat + (targetPosRef.current.lat - lastPosRef.current.lat) * Math.min(1, t);
                const currentLng = lastPosRef.current.lng + (targetPosRef.current.lng - lastPosRef.current.lng) * Math.min(1, t);

                // Update internal state
                setLocation({
                    lat: currentLat,
                    lng: currentLng,
                    accuracy: targetPosRef.current.accuracy,
                    heading: targetPosRef.current.heading,
                    timestamp: now
                });

                // Update Map Source directly for high performance
                const source: any = map.getSource('user-location-source');
                if (source) {
                    source.setData({
                        type: 'FeatureCollection',
                        features: [{
                            type: 'Feature',
                            geometry: { type: 'Point', coordinates: [currentLng, currentLat] },
                            properties: { 
                                accuracy: targetPosRef.current.accuracy,
                                heading: targetPosRef.current.heading || 0
                            }
                        }]
                    });
                }
            }
            rafId = requestAnimationFrame(animate);
        };
        rafId = requestAnimationFrame(animate);

        return () => {
            clearInterval(interval);
            cancelAnimationFrame(rafId);
            window.removeEventListener('focus', handleRefresh);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [map]);

    return location;
}
