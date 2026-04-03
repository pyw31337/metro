/**
 * coordUtils.ts
 * High-performance coordinate conversion for South Korean standard projections.
 * Purpose: Convert Seoul Subway / bus.go.kr GRS80 (TM) coordinates to WGS84 (MapLibre standard).
 */

const KOREA_PROJ = {
    EPSG5186: { // Korea Central Belt 2010 (GRS80)
        lat_0: 38.0,
        lon_0: 127.0,
        k: 1.0,
        x_0: 200000,
        y_0: 600000,
        a: 6378137.0,
        f: 1 / 298.257222101
    },
    WGS84: {
        a: 6378137.0,
        f: 1 / 298.257223563
    }
};

/**
 * grs80ToWgs84
 * Simplified Transverse Mercator to Geographic conversion.
 * Logic: Standard TM Inverse Projection Formulas.
 */
export function grs80ToWgs84(x: number, y: number): { lat: number; lng: number } {
    const proj = KOREA_PROJ.EPSG5186;
    const a = proj.a;
    const f = proj.f;
    const e2 = 2 * f - f * f;
    const ep2 = e2 / (1 - e2);

    const dx = x - proj.x_0;
    const dy = y - proj.y_0;

    const rad = Math.PI / 180;
    const lat0 = proj.lat_0 * rad;
    
    // Meridional distance calculation
    const n = f / (2 - f);
    const G = a * (1 - n) * (1 - n * n) * (1 + (9 / 4) * n * n + (225 / 64) * Math.pow(n, 4)) * rad;
    
    // M calculation for initial guess
    const M = dy / proj.k;
    const mu = M / G;

    // Iterative find for footprint latitude (Simplified for subway precision)
    const phi1 = mu + 
        (3 * n / 2 - 27 * Math.pow(n, 3) / 32) * Math.sin(2 * mu) + 
        (21 * n * n / 16 - 55 * Math.pow(n, 4) / 32) * Math.sin(4 * mu) + 
        (151 * Math.pow(n, 3) / 96) * Math.sin(6 * mu);

    const sinPhi1 = Math.sin(phi1);
    const cosPhi1 = Math.cos(phi1);
    const tanPhi1 = Math.tan(phi1);

    const C1 = ep2 * cosPhi1 * cosPhi1;
    const T1 = tanPhi1 * tanPhi1;
    const N1 = a / Math.sqrt(1 - e2 * sinPhi1 * sinPhi1);
    const R1 = a * (1 - e2) / Math.pow(1 - e2 * sinPhi1 * sinPhi1, 1.5);
    const D = dx / (N1 * proj.k);

    const lat = phi1 - (N1 * tanPhi1 / R1) * (
        D * D / 2 - 
        (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * Math.pow(D, 4) / 24 + 
        (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * Math.pow(D, 6) / 720
    );

    const lng = (D - 
        (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6 + 
        (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * Math.pow(D, 5) / 120
    ) / cosPhi1;

    return {
        lat: lat / rad,
        lng: (lng / rad) + proj.lon_0
    };
}
