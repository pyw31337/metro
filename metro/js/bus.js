/**
 * bus.js
 * 버스 정류장 마커, 노선, 실시간 위치 관리 클래스
 */
class BusLayer {
    constructor() {
        this.map = null;
        this.markers = [];
        this.routePolyline = null;
        this.busMarkers = [];
        this.trackingInterval = null;
        this.debounceTimer = null;
        this.activeRouteId = null;
    }

    init(mapInstance) {
        this.map = mapInstance;

        // 지도 이동/줌 이벤트 감지 (정류장 갱신)
        kakao.maps.event.addListener(this.map, 'dragend', () => this.debouncedUpdate());
        kakao.maps.event.addListener(this.map, 'zoom_changed', () => this.debouncedUpdate());
    }

    debouncedUpdate() {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            if (layerManager.currentTab === 'bus' || layerManager.currentTab === 'combined') {
                this.updateStations();
            }
        }, 500);
    }

    async updateStations() {
        const level = this.map.getLevel();
        if (level > 4) { // 줌이 너무 낮으면(축소되면) 마커 숨김
            this.clearMarkers();
            return;
        }

        const center = this.map.getCenter();
        const stations = await fetchBusStations(center.getLat(), center.getLng());
        this.renderStations(stations);
    }

    renderStations(stations) {
        this.clearMarkers();
        stations.forEach(st => {
            const content = document.createElement('div');
            content.className = 'bus-station-marker';
            content.style.backgroundColor = 'var(--bus-blue)'; // Default
            
            const overlay = new kakao.maps.CustomOverlay({
                position: new kakao.maps.LatLng(st.lat, st.lng),
                content: content,
                yAnchor: 0.5
            });

            content.addEventListener('click', () => {
                window.dispatchEvent(new CustomEvent('busStationClicked', { detail: st }));
            });

            overlay.setMap(this.map);
            this.markers.push(overlay);
        });
    }

    async showRoute(routeId, type) {
        this.activeRouteId = routeId;
        this.clearRoute();
        
        // 1. 노선 폴리라인 (Mock or API로부터 좌표 필요)
        // 여기선 단순 직선 Mock 처리 (실제 구현 시 fetchBusRoutePath 등 필요)
        console.log(`Rendering Bus Route: ${routeId}`);

        // 2. 실시간 위치 추적 시작
        this.startTracking(routeId, type);
    }

    async startTracking(routeId, type) {
        this.stopTracking();
        const color = this.getRouteColor(type);

        const updatePos = async () => {
            const positions = await fetchBusLocation(routeId);
            this.renderBusMarkers(positions, color);
        };

        updatePos(); // 즉시 실행
        this.trackingInterval = setInterval(updatePos, 30000); // 30초 폴링
    }

    renderBusMarkers(positions, color) {
        this.clearBusMarkers();
        positions.forEach(pos => {
            const content = document.createElement('div');
            content.className = 'bus-pos-marker';
            content.innerHTML = `
                <div class="bus-pos-body" style="background: ${color}">${pos.no.slice(-4)}</div>
                <div class="bus-pos-tail" style="border-top-color: ${color}"></div>
            `;

            const overlay = new kakao.maps.CustomOverlay({
                position: new kakao.maps.LatLng(pos.lat, pos.lng),
                content: content,
                yAnchor: 1.0
            });

            overlay.setMap(this.map);
            this.busMarkers.push(overlay);
        });
    }

    getRouteColor(type) {
        switch(type) {
            case '1': return 'var(--bus-blue)';
            case '2': return 'var(--bus-green)';
            case '3': return 'var(--bus-red)';
            case '4': return 'var(--bus-yellow)';
            default: return '#5C5C8A';
        }
    }

    stopTracking() {
        if (this.trackingInterval) clearInterval(this.trackingInterval);
        this.clearBusMarkers();
    }

    clearMarkers() {
        this.markers.forEach(m => m.setMap(null));
        this.markers = [];
    }

    clearRoute() {
        if (this.routePolyline) this.routePolyline.setMap(null);
        this.clearBusMarkers();
    }

    clearBusMarkers() {
        this.busMarkers.forEach(m => m.setMap(null));
        this.busMarkers = [];
    }

    show() {
        this.updateStations();
    }

    hide() {
        this.clearMarkers();
        this.clearRoute();
        this.stopTracking();
    }
}

window.BusLayer = BusLayer;
