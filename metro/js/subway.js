/**
 * subway.js
 * 지하철 노선 및 역사 렌더링 클래스
 */
class SubwayLayer {
    constructor() {
        this.data = null;
        this.polylines = [];
        this.markers = [];
        this.map = null;
        this.isRouteMode = false;
        this.trainMarkers = [];
        this.trainPollTimer = null;
    }

    async loadLines() {
        try {
            const response = await fetch('js/data/subway-lines.json');
            this.data = await response.json();
            console.log('Subway Data Loaded:', this.data);
        } catch (error) {
            console.error('Failed to load subway lines:', error);
        }
    }

    render(map) {
        this.map = map;
        if (!this.data) return;

        this.clear();

        this.data.lines.forEach(line => {
            if (!line.stations || line.stations.length < 2) return;

            // 1. 노선선 (Polyline) 그리기
            const path = line.stations.map(s => new kakao.maps.LatLng(s.lat, s.lng));
            
            // 순환선 처리
            if (line.isCircular) {
                path.push(path[0]);
            }

            const polyline = new kakao.maps.Polyline({
                path: path,
                strokeWeight: this.getStrokeWeight(map.getLevel()),
                strokeColor: line.color,
                strokeOpacity: 0.8,
                strokeStyle: 'solid'
            });

            polyline.setMap(map);
            this.polylines.push({ id: line.id, instance: polyline, color: line.color });

            // 2. 역사 마커
            line.stations.forEach(station => {
                this.createStationMarker(station, line);
            });
        });

        // 줌 이벤트 리스너 등록
        kakao.maps.event.addListener(map, 'zoom_changed', () => {
            this.updateStylesByZoom();
        });
    }

    createStationMarker(station, line) {
        const content = document.createElement('div');
        content.className = 'subway-marker-container';
        
        // 역 마커 HTML (Bold + Outline Style)
        content.innerHTML = `
            <div class="station-dot" style="background: ${line.color}; border: 1.5px solid white;"></div>
            <div class="station-label" style="
                color: #fff; 
                font-weight: 900; 
                text-shadow: -1px -1px 0 ${line.color}, 1px -1px 0 ${line.color}, -1px 1px 0 ${line.color}, 1px 1px 0 ${line.color};
            ">${station.name}</div>
        `;

        const customOverlay = new kakao.maps.CustomOverlay({
            position: new kakao.maps.LatLng(station.lat, station.lng),
            content: content,
            yAnchor: 0.5
        });

        // 클릭 이벤트 (바텀시트 오픈 연동은 app.js에서 처리하도록 위임하거나 직접 호출)
        content.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('stationClicked', { detail: station }));
        });

        customOverlay.setMap(this.map);
        this.markers.push({ station, overlay: customOverlay, element: content });
    }

    getStrokeWeight(level) {
        if (level >= 10) return 2;
        if (level === 11) return 3;
        return 4; // 12 이상 (카카오는 레벨 낮을수록 확대, 1~4가 시내 중심)
        // 주의: 카카오맵 레벨은 숫자가 작을수록 확대입니다. 
        // 사용자 기획: 레벨 10이하=2px, 11=3px, 12이상=4px 
        // 카카오 레벨 기준: 5(확대) -> 4px, 10(축소) -> 2px
    }

    updateStylesByZoom() {
        const level = this.map.getLevel();
        const weight = this.getStrokeWeight(level);

        this.polylines.forEach(p => {
            p.instance.setOptions({ strokeWeight: weight });
        });

        // Marker 가시성 제어 (CSS class로 처리 가능)
        const container = document.getElementById('map');
        if (level > 6) { // 축소됨
            container.classList.add('zoom-out');
        } else {
            container.classList.remove('zoom-out');
        }
    }

    highlightRoute(origin, destination) {
        this.isRouteMode = true;
        const bounds = new kakao.maps.LatLngBounds();
        
        // 두 역사 및 인접 역사 강조
        this.polylines.forEach(p => {
            p.instance.setOptions({ strokeColor: '#555', strokeOpacity: 0.1 });
        });

        // 출발/도착 지점 포함 영역 계산
        bounds.extend(new kakao.maps.LatLng(origin.lat, origin.lng));
        bounds.extend(new kakao.maps.LatLng(destination.lat, destination.lng));
        
        this.map.setBounds(bounds, 80, 80, 80, 80); // Padding 부여

        // 역사 마커 스타일 강화
        this.markers.forEach(m => {
            if (m.station.id === origin.id || m.station.id === destination.id) {
                m.element.classList.add('highlighted-station');
            } else {
                m.element.classList.add('dimmed-station');
            }
        });
    }

    resetRouteMode() {
        this.isRouteMode = false;
        this.polylines.forEach(p => {
            p.instance.setOptions({ 
                strokeColor: p.color, 
                strokeOpacity: 0.8,
                strokeWeight: this.getStrokeWeight(this.map.getLevel())
            });
        });
        this.markers.forEach(m => {
            m.element.classList.remove('highlighted-station', 'dimmed-station');
        });
    }

    clear() {
        this.polylines.forEach(p => p.instance.setMap(null));
        this.markers.forEach(m => m.overlay.setMap(null));
        this.polylines = [];
        this.markers = [];
    }

    show() {
        this.polylines.forEach(p => p.instance.setMap(this.map));
        this.markers.forEach(m => m.overlay.setMap(this.map));
        this.startTrainTracking();
    }

    hide() {
        this.polylines.forEach(p => p.instance.setMap(null));
        this.markers.forEach(m => m.overlay.setMap(null));
        this.stopTrainTracking();
    }

    startTrainTracking() {
        if (this.trainPollTimer) return;
        this.updateTrainPositions();
        this.trainPollTimer = setInterval(() => this.updateTrainPositions(), 60000);
    }

    stopTrainTracking() {
        if (this.trainPollTimer) {
            clearInterval(this.trainPollTimer);
            this.trainPollTimer = null;
        }
        this.clearTrainMarkers();
    }

    async updateTrainPositions() {
        // 우선 1~9호선 위주로 노출 (샘플로 2호선만 우선)
        const trains = await fetchTrainPositions('2호선');
        this.renderTrainMarkers(trains);
    }

    renderTrainMarkers(trains) {
        this.clearTrainMarkers();
        
        trains.forEach(t => {
            // 해당 역 정보 찾기
            const stMarker = this.markers.find(m => m.station.name === t.stName);
            if (!stMarker) return;

            const content = document.createElement('div');
            content.className = 'train-marker';
            content.style.borderColor = '#00A84D'; // 2호선 색상
            content.innerHTML = `
                <div class="train-icon">🚋</div>
                <div class="train-bubble">
                    <span class="dest">${t.destination}</span>
                    <span class="no">#${t.no}</span>
                </div>
            `;

            const overlay = new kakao.maps.CustomOverlay({
                position: new kakao.maps.LatLng(stMarker.station.lat, stMarker.station.lng),
                content: content,
                yAnchor: 1.2
            });

            // 열차 클릭 이벤트
            content.addEventListener('click', () => {
                this.openTrainInfo(t);
            });

            overlay.setMap(this.map);
            this.trainMarkers.push(overlay);
        });
    }

    openTrainInfo(train) {
        const content = document.getElementById('bottom-sheet__content');
        if (!content) return;

        content.innerHTML = `
            <div class="flex flex-col gap-6">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <span class="px-2 py-1 rounded bg-green-600 text-[10px] font-black">2호선</span>
                        <h2 class="text-2xl font-extrabold uppercase">열차 #${train.no}</h2>
                    </div>
                    <span class="px-2 py-1 rounded bg-white/10 text-[10px] font-bold">실시간 위치</span>
                </div>
                
                <div class="premium-card bg-white/[0.02] flex flex-col gap-1">
                    <span class="text-[10px] font-black text-zinc-500 uppercase">현재 상태</span>
                    <div class="text-lg font-bold text-green-400">
                        ${train.stName}역 ${this.getTrainStatusText(train.status)}
                    </div>
                </div>

                <div class="premium-card bg-white/[0.02] flex flex-row justify-between items-center">
                    <div class="flex flex-col gap-1">
                        <span class="text-[10px] font-black text-zinc-500 uppercase">행선지</span>
                        <div class="text-lg font-bold">${train.destination}</div>
                    </div>
                </div>
            </div>
        `;
        setBottomSheetHeight('half');
    }

    getTrainStatusText(status) {
        switch(status) {
            case '0': return '진입 중';
            case '1': return '도착';
            case '2': return '출발함';
            default: return '운행 중';
        }
    }

    clearTrainMarkers() {
        this.trainMarkers.forEach(t => t.setMap(null));
        this.trainMarkers = [];
    }
}

window.SubwayLayer = SubwayLayer;
