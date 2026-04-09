/**
 * Haversine distance calculation between two GPS coordinates.
 * Returns distance in kilometers.
 */
export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Convert distance in km to travel time in minutes given speed in km/h.
 * Minimum 1 minute per segment (station dwell + acceleration).
 */
export function kmToMinutes(km: number, speedKmh: number): number {
  return Math.max(1, (km / speedKmh) * 60);
}
