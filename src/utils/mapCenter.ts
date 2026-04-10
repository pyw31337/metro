/**
 * Module-level mutable map center — avoids Zustand store subscriptions
 * for high-frequency (200ms) pan events. Read via getMapCenter() at any time
 * without triggering React re-renders.
 */
let _center: [number, number] = [37.5546, 126.9706]; // Seoul default

export const getMapCenter = (): [number, number] => _center;
export const setMapCenter = (lat: number, lng: number): void => { _center = [lat, lng]; };
