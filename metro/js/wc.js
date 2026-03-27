/**
 * wc.js
 * 화장실 마커 및 클러스터링 관리
 */
class WCLayer {
    constructor() {
        this.map = null;
        this.clusterer = null;
        this.wcData = [];
        this.visibleMarkers = [];
        this.activeFilters = {
            is24h: false,
            hasHandicap: false,
            hasDiaper: false
        };
        this.isInitialized = false;
    }

    async init(mapInstance) {
        this.map = mapInstance;
        
        if (typeof kakao.maps.MarkerClusterer !== 'undefined') {
            this.clusterer = new kakao.maps.MarkerClusterer({
                map: this.map,
                averageCenter: true,
                minLevel: 6,
                styles: [{
                    width: '40px', height: '40px',
                    background: 'rgba(124, 79, 196, 0.9)',
                    borderRadius: '50%',
                    color: '#fff',
                    textAlign: 'center',
                    lineHeight: '40px',
                    fontWeight: '900',
                    fontSize: '12px',
                    border: '2px solid rgba(255, 255, 255, 0.2)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                }]
            });
        }

        // 지도 이동/줌 감지 
        kakao.maps.event.addListener(this.map, 'idle', () => {
            if (this.isInitialized) this.renderMarkersInternal();
        });

        this.wcData = await fetchRestrooms();
        this.isInitialized = true;
    }

    async show() {
        if (!this.isInitialized) return;
        this.renderMarkersInternal();
    }

    setFilter(key, value) {
        this.activeFilters[key] = value;
        this.renderMarkersInternal();
    }

    renderMarkersInternal() {
        this.clearMarkers();
        
        const zoom = this.map.getLevel();
        if (zoom > 8) return; // Zoom 11 미만 (카카오 기준 레벨 8 이상) 숨김

        const bounds = this.map.getBounds();
        
        // 1. 필터 및 영역 필터링
        const filtered = this.wcData.filter(wc => {
            if (this.activeFilters.is24h && !wc.is24h) return false;
            if (this.activeFilters.hasHandicap && !wc.hasHandicap) return false;
            if (this.activeFilters.hasDiaper && !wc.hasDiaper) return false;
            
            const loc = new kakao.maps.LatLng(wc.lat, wc.lng);
            return bounds.contains(loc);
        });

        // 2. 마커 생성
        const markers = filtered.map(wc => {
            const content = document.createElement('div');
            content.className = 'restroom-marker';
            content.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                    <path d="M11 18.25V21H13V18.25H16.5V11C16.5 10.45 16.05 10 15.5 10H8.5C7.95 10 7.5 10.45 7.5 11V18.25H11ZM12 8C13.1 8 14 7.1 14 6C14 4.9 13.1 4 12 4C10.9 4 10 4.9 10 6C10 7.1 10.9 8 12 8Z"/>
                </svg>
            `;

            const overlay = new kakao.maps.CustomOverlay({
                position: new kakao.maps.LatLng(wc.lat, wc.lng),
                content: content,
                yAnchor: 1
            });

            content.addEventListener('click', () => {
                window.dispatchEvent(new CustomEvent('wcClicked', { detail: wc }));
            });

            overlay.setMap(this.map);
            return overlay;
        });

        this.visibleMarkers = markers;
    }

    clearMarkers() {
        this.visibleMarkers.forEach(m => m.setMap(null));
        this.visibleMarkers = [];
        if (this.clusterer) this.clusterer.clear();
    }

    sortNearest(userLat, userLng) {
        return getNearestRestrooms(userLat, userLng, this.wcData);
    }

    hide() {
        this.clearMarkers();
    }
}

window.WCLayer = WCLayer;
