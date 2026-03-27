// app.js

let subwayLayer = null;
let busLayer = null;
let wcLayer = null;

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    console.log('Metro Live App Initializing...');

    // 1. Subway Layer 전역 로드
    subwayLayer = new SubwayLayer();
    await subwayLayer.loadLines();

    // 2. Bus Layer 준비
    busLayer = new BusLayer();

    // 3. WC Layer 준비
    wcLayer = new WCLayer();

    // 4. Favorite Manager 준비
    window.favoriteManager = new FavoriteManager();

    // 5. Search Manager 준비
    if (window.searchManager) {
        window.searchManager.init();
    }

    // 6. Load Maps
    loadMapScript(CONFIG.KAKAO_MAP_KEY);

    // 7. UI Events
    bindTabEvents();
    bindBottomSheetEvents();
    
    // 8. Click Events Integration
    window.addEventListener('stationClicked', (e) => {
        openStationInfo(e.detail);
    });

    window.addEventListener('busStationClicked', (e) => {
        openBusStationInfo(e.detail);
    });

    window.addEventListener('wcClicked', (e) => {
        openWCInfo(e.detail);
    });

    // 9. Filter Events
    bindFilterEvents();

    // 10. My Location Button
    const myLocBtn = document.getElementById('btn-my-location');
    if (myLocBtn) {
        myLocBtn.onclick = () => moveToMyLocation();
    }

    updateTabUI('subway');
    renderHomeDashboard();
}

/**
 * 즐겨찾기 관리자
 */
class FavoriteManager {
    constructor() {
        this.favorites = JSON.parse(localStorage.getItem('metro_favorites') || '[]');
    }

    toggle(item) {
        const index = this.favorites.findIndex(f => f.id === item.id && f.type === item.type);
        if (index > -1) {
            this.favorites.splice(index, 1);
        } else {
            this.favorites.unshift({
                ...item,
                addedAt: Date.now()
            });
        }
        localStorage.setItem('metro_favorites', JSON.stringify(this.favorites));
        return index === -1; // true if added
    }

    isFavorite(id, type) {
        return this.favorites.some(f => f.id === id && f.type === type);
    }

    getFavorites() {
        return this.favorites;
    }
}

/**
 * search.js
 * 초성 검색 및 전역 검색 로직 관리
 */
class SearchManager {
    constructor() {
        this.index = [];
        this.debounceTimer = null;
        this.isActive = false;
    }

    init() {
        this.buildIndex();
        this.bindEvents();
    }

    /**
     * 지하철/버스 정류장 데이터를 검색용 인덱스로 변환
     */
    buildIndex() {
        this.index = [];
        
        // 1. 지하철 데이터 인덱싱
        if (window.subwayLayer && window.subwayLayer.data) {
            window.subwayLayer.data.lines.forEach(line => {
                line.stations.forEach(st => {
                    this.index.push({
                        name: st.name,
                        display: `${line.name} ${st.name}`,
                        type: 'subway',
                        id: st.id,
                        lineId: line.id,
                        color: line.color,
                        lat: st.lat,
                        lng: st.lng,
                        chosung: Hangul.disassemble(st.name, true).map(c => c[0]).join('')
                    });
                });
            });
        }
        
        // 2. 버스 정류장 데이터 인덱싱 (캐시가 있는 경우)
        const busCache = localStorage.getItem('metro_bus_stations');
        if (busCache) {
            const stations = JSON.parse(busCache);
            stations.forEach(st => {
                this.index.push({
                    name: st.name,
                    display: `정류장 (${st.arsId})`,
                    type: 'bus',
                    id: st.id,
                    arsId: st.arsId,
                    lat: st.lat,
                    lng: st.lng,
                    chosung: Hangul.disassemble(st.name, true).map(c => c[0]).join('')
                });
            });
        }
        
        // 중복 제거 및 최적화
        this.index = this.index.filter((item, index, self) =>
            index === self.findIndex((t) => t.name === item.name && t.type === item.type && t.id === item.id)
        );
        
        console.log(`[Search] Index Built: ${this.index.length} items`);
    }

    bindEvents() {
        const input = document.getElementById('global-search-input');
        const clearBtn = document.getElementById('search-clear-btn');
        const dropdown = document.getElementById('search-autocomplete');

        if (!input) return;

        input.addEventListener('focus', () => this.onFocus());
        input.addEventListener('input', (e) => {
            const val = e.target.value;
            clearBtn.classList.toggle('hidden', val.length === 0);
            
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => this.performSearch(val), 300);
        });

        clearBtn.addEventListener('click', () => {
            input.value = '';
            clearBtn.classList.add('hidden');
            this.performSearch('');
            input.focus();
        });

        // Close on blur (delayed to allow clicks)
        input.addEventListener('blur', () => {
            setTimeout(() => {
                dropdown.style.opacity = '0';
                dropdown.style.pointerEvents = 'none';
            }, 200);
        });
    }

    onFocus() {
        if (this.index.length === 0) this.buildIndex();
        this.performSearch(document.getElementById('global-search-input').value);
    }

    performSearch(query) {
        const dropdown = document.getElementById('search-autocomplete');
        
        if (!query) {
            this.renderRecentSearches();
            return;
        }

        const isChosung = Hangul.isConsonant(query[0]);
        const results = this.index.filter(item => {
            if (isChosung) return item.chosung.includes(query);
            return item.name.includes(query);
        }).slice(0, 8);

        this.renderResults(results);
    }

    renderRecentSearches() {
        const dropdown = document.getElementById('search-autocomplete');
        dropdown.style.opacity = '1';
        dropdown.style.pointerEvents = 'auto';
        dropdown.innerHTML = `
            <div class="p-4">
                <p class="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3">즐겨찾기 및 추천</p>
                <div class="flex flex-col gap-1">
                    ${window.favoriteManager.getFavorites().slice(0, 3).map(fav => `
                        <div class="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 cursor-pointer" onclick="searchManager.selectItem('${fav.id}', '${fav.type}')">
                            <span class="text-lg">${fav.type === 'subway' ? '🚇' : '🚌'}</span>
                            <span class="text-sm font-bold text-white">${fav.name}</span>
                        </div>
                    `).join('')}
                    ${window.favoriteManager.getFavorites().length === 0 ? '<p class="text-xs text-zinc-600">자주 가는 장소를 별표로 등록해 보세요.</p>' : ''}
                </div>
            </div>
        `;
    }

    renderResults(results) {
        const dropdown = document.getElementById('search-autocomplete');
        dropdown.style.opacity = '1';
        dropdown.style.pointerEvents = 'auto';

        if (results.length === 0) {
            dropdown.innerHTML = '<div class="p-8 text-center text-sm text-zinc-500 font-medium">검색 결과가 없습니다.</div>';
            return;
        }

        dropdown.innerHTML = results.map(item => `
            <div class="flex items-center justify-between p-4 hover:bg-white/5 cursor-pointer border-b border-white/5 last:border-none" 
                 onclick="searchManager.selectItem('${item.id}', '${item.type}')">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 text-lg">
                        ${item.type === 'subway' ? '🚇' : '🚌'}
                    </div>
                    <div class="flex flex-col">
                        <span class="text-sm font-bold text-white">${item.name}</span>
                        <span class="text-[10px] text-zinc-500">${item.display}</span>
                    </div>
                </div>
                ${item.type === 'subway' ? `<div class="w-2 h-2 rounded-full" style="background: ${item.color}"></div>` : ''}
            </div>
        `).join('');
    }

    selectItem(id, type) {
        const item = this.index.find(i => i.id === id && i.type === type);
        if (!item) return;

        // 지도 이동
        const loc = new kakao.maps.LatLng(item.lat, item.lng);
        window.kakaoMap.setCenter(loc);
        window.kakaoMap.setLevel(3);

        // 검색창 클리어
        const input = document.getElementById('global-search-input');
        input.value = item.name;
        
        // 정보창 열기
        if (type === 'subway') {
            updateTabUI('subway');
            openStationInfo(item);
        } else {
            updateTabUI('bus');
            openBusStationInfo(item);
        }
    }
}

window.searchManager = new SearchManager();

function renderHomeDashboard() {
    const content = document.getElementById('bottom-sheet__content');
    const favs = window.favoriteManager.getFavorites();

    content.innerHTML = `
        <div class="flex flex-col gap-6 py-2">
            <div class="flex justify-between items-center px-1">
                <h2 class="text-xl font-black text-white">즐겨찾기</h2>
                <span class="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">${favs.length} SAVED</span>
            </div>
            
            <div class="flex gap-3 overflow-x-auto pb-4 no-scrollbar">
                ${favs.map(fav => `
                    <div class="flex-shrink-0 w-32 h-32 premium-card flex flex-col justify-between p-4 cursor-pointer active:scale-95 transition-transform" onclick="searchManager.selectItem('${fav.id}', '${fav.type}')">
                        <span class="text-2xl">${fav.type === 'subway' ? '🚇' : '🚌'}</span>
                        <div class="flex flex-col">
                            <span class="text-sm font-bold truncate">${fav.name}</span>
                            <span class="text-[10px] text-zinc-500 truncate">${fav.display || ''}</span>
                        </div>
                    </div>
                `).join('')}
                ${favs.length === 0 ? `
                    <div class="w-full py-12 flex flex-col items-center justify-center opacity-40">
                        <span class="text-4xl mb-3">⭐</span>
                        <p class="text-xs font-bold uppercase tracking-tighter">아직 즐겨찾기가 없습니다</p>
                    </div>
                ` : ''}
            </div>

            <div class="flex flex-col gap-3">
                <h3 class="text-xs font-black text-zinc-500 uppercase tracking-widest px-1">내 주변 빠른 정보</h3>
                <div class="premium-card p-4 flex justify-between items-center" onclick="moveToMyLocation()">
                    <div class="flex items-center gap-3">
                        <span class="text-xl">🎯</span>
                        <span class="text-sm font-bold">현재 위치로 이동</span>
                    </div>
                    <span class="text-zinc-600">→</span>
                </div>
                 <div class="premium-card p-4 flex justify-between items-center" onclick="showNearestWCList()">
                    <div class="flex items-center gap-3">
                        <span class="text-xl">🚻</span>
                        <span class="text-sm font-bold">주변 개방 화장실</span>
                    </div>
                    <span class="text-zinc-600">→</span>
                </div>
            </div>
        </div>
    `;
    
    if (sheetState === 'hidden') setBottomSheetHeight('half');
}

function bindFilterEvents() {
    const chips = document.querySelectorAll('.filter-chip');
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            const filter = chip.dataset.filter;
            const isActive = chip.classList.toggle('active');
            if (wcLayer) wcLayer.setFilter(filter, isActive);
        });
    });
}

function moveToMyLocation() {
    if (!navigator.geolocation) return alert('GPS를 사용할 수 없는 환경입니다.');
    
    navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude, longitude } = pos.coords;
        const loc = new kakao.maps.LatLng(latitude, longitude);
        
        // 지도 이동
        if (window.kakaoMap) {
            window.kakaoMap.panTo(loc);
            
            // 현위치 마커 (임시)
            if (window.myLocMarker) window.myLocMarker.setMap(null);
            window.myLocMarker = new kakao.maps.Marker({
                position: loc,
                image: new kakao.maps.MarkerImage('https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/markerStar.png', new kakao.maps.Size(24, 35))
            });
            window.myLocMarker.setMap(window.kakaoMap);
        }
    }, () => alert('위치 정보를 가져올 수 없습니다.'));
}

/**
 * 역 정보 표시 및 도착 정보 로드
 */
async function openStationInfo(station) {
    const content = document.getElementById('bottom-sheet__content');
    
    // UI 초기화
    content.innerHTML = `
        <div class="flex items-center justify-between mb-6">
            <div class="flex items-center gap-3">
                <h2 class="text-2xl font-extrabold uppercase">${station.name}</h2>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10">STATION</span>
            </div>
            <button class="fav-btn p-2 text-xl ${window.favoriteManager.isFavorite(station.id, 'subway') ? 'active' : ''}" onclick="toggleStationFavorite('${station.id}', 'subway', '${station.name}')">
                ${window.favoriteManager.isFavorite(station.id, 'subway') ? '★' : '☆'}
            </button>
        </div>
        <div class="grid grid-cols-2 gap-3 mb-8">
            <button class="premium-card text-sm font-bold flex flex-col items-center gap-2 py-4 btn-path-start" data-id="${station.id}"><span>🚩</span>출발지로</button>
            <button class="premium-card text-sm font-bold flex flex-col items-center gap-2 py-4 btn-path-end" data-id="${station.id}"><span>🏁</span>도착지로</button>
        </div>
        <div id="arrival-list" class="flex flex-col gap-4">
            <div class="text-zinc-500 text-sm animate-pulse">실시간 도착 정보를 불러오는 중...</div>
        </div>
    `;

    setBottomSheetHeight('half');

    // 이벤트 바인딩
    const startBtn = content.querySelector('.btn-path-start');
    const endBtn = content.querySelector('.btn-path-end');
    
    if (startBtn) startBtn.onclick = () => {
        window.routingSelectedStart = station;
        alert(`${station.name}을 출발지로 지정했습니다. 목적지를 선택해주세요.`);
    };

    if (endBtn) endBtn.onclick = () => {
        if (!window.routingSelectedStart) {
            alert('출발지를 먼저 선택해주세요.');
            return;
        }
        subwayLayer.highlightRoute(window.routingSelectedStart, station);
        renderRoutingResult(window.routingSelectedStart, station);
    };

    // 실시간 정보 페치
    const arrivals = await fetchArrivalInfo(station.name);
    renderArrivals(arrivals);
}

function renderArrivals(arrivals) {
    const listContainer = document.getElementById('arrival-list');
    if (!arrivals || arrivals.length === 0) {
        listContainer.innerHTML = '<div class="text-zinc-500 py-4">도착 정보가 없습니다.</div>';
        return;
    }

    listContainer.innerHTML = arrivals.map(info => `
        <div class="flex justify-between items-center p-4 rounded-2xl bg-white/[0.03] border border-white/[0.05]">
            <div class="flex flex-col">
                <span class="text-[11px] font-bold text-zinc-500 mb-1">${info.direction}</span>
                <span class="text-base font-bold">${info.destination}</span>
            </div>
            <div class="flex flex-col items-end">
                <span class="text-sm font-black" style="color: ${info.statusColor}">${info.message}</span>
                <span class="text-[10px] text-zinc-600 mt-1">#${info.trainNo}</span>
            </div>
        </div>
    `).join('');
}

/**
 * 바텀 시트 드래그 제스처
 */
let startY = 0;
let sheetState = 'hidden'; 

function bindBottomSheetEvents() {
    const sheet = document.getElementById('bottomSheet');
    const handle = sheet.querySelector('.bottom-sheet__handle');

    if (!handle) return;

    handle.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
        sheet.style.transition = 'none';
    });

    handle.addEventListener('touchend', (e) => {
        sheet.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.1)';
        const delta = e.changedTouches[0].clientY - startY;

        if (delta < -50) {
            setBottomSheetHeight('full');
        } else if (delta > 50) {
            if (sheetState === 'full') setBottomSheetHeight('half');
            else setBottomSheetHeight('hidden');
        } else {
            setBottomSheetHeight(sheetState);
        }
    });
}

async function openBusStationInfo(station) {
    const content = document.getElementById('bottom-sheet__content');
    
    content.innerHTML = `
        <div class="flex items-center gap-3 mb-6">
            <h2 class="text-2xl font-extrabold text-blue-400 uppercase">${station.name}</h2>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 uppercase">${station.arsId}</span>
        </div>
        <div class="grid grid-cols-2 gap-3 mb-8">
            <button class="premium-card text-sm font-bold flex flex-col items-center gap-2 py-4"><span>🚩</span>출발</button>
            <button class="premium-card text-sm font-bold flex flex-col items-center gap-2 py-4"><span>🏁</span>도착</button>
        </div>
        <h3 class="text-sm font-bold text-zinc-500 mb-4 uppercase tracking-widest">이 정류장 경유 버스</h3>
        <div id="bus-list" class="bus-badge-container">
            <div class="text-zinc-500 text-sm animate-pulse">노선 정보를 불러오는 중...</div>
        </div>
    `;

    setBottomSheetHeight('half');

    const routes = await fetchBusRoutesByStation(station.arsId);
    renderBusRoutes(routes);
}

function renderBusRoutes(routes) {
    const listContainer = document.getElementById('bus-list');
    if (!routes || routes.length === 0) {
        listContainer.innerHTML = '<div class="text-zinc-500">경유 노선이 없습니다.</div>';
        return;
    }

    listContainer.innerHTML = '';
    routes.forEach(route => {
        const badge = document.createElement('div');
        badge.className = 'bus-badge';
        const color = busLayer.getRouteColor(route.type);
        badge.style.backgroundColor = color;
        badge.textContent = route.number;
        
        badge.onclick = () => {
            busLayer.showRoute(route.id, route.type);
            updateBusDetailSheet(route);
        };
        listContainer.appendChild(badge);
    });
}

function updateBusDetailSheet(route) {
    const content = document.getElementById('bottom-sheet__content');
    const color = busLayer.getRouteColor(route.type);

    content.innerHTML = `
        <div class="flex flex-col gap-6">
            <div class="flex items-center justify-between">
                <div class="flex flex-col">
                    <span class="px-3 py-1 rounded-lg text-xs font-black inline-block w-max mb-2" style="background: ${color}">${route.number}번</span>
                    <h2 class="text-xl font-extrabold">${route.stStation} ↔ ${route.edStation}</h2>
                </div>
                <button class="premium-card text-xs p-3 btn-reset-route">초기화</button>
            </div>
            
            <div class="premium-card bg-white/[0.02]">
                <h4 class="text-[11px] font-black text-zinc-500 uppercase mb-4 tracking-tighter">운행 정보</h4>
                <div class="flex justify-between items-center">
                    <div class="flex flex-col">
                        <span class="text-xs text-zinc-500">배차간격</span>
                        <span class="text-base font-bold">${route.term}분</span>
                    </div>
                     <div class="flex flex-col items-end">
                        <span class="text-xs text-zinc-500">첫차/막차</span>
                        <span class="text-base font-bold">${route.firstTime.slice(8,10)}:${route.firstTime.slice(10,12)} / ${route.lastTime.slice(8,10)}:${route.lastTime.slice(10,12)}</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    const resetBtn = content.querySelector('.btn-reset-route');
    if (resetBtn) resetBtn.onclick = () => updateTabUI('bus');

    setBottomSheetHeight('half');
}

async function openWCInfo(wc) {
    const content = document.getElementById('bottom-sheet__content');
    
    // 운영 상태 판별
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const isOpen = wc.is24h || (currentTime >= wc.openTime && currentTime <= wc.closeTime);

    // 거리 계산
    let distanceHtml = '';
    if (navigator.geolocation) {
        const pos = await new Promise(resolve => navigator.geolocation.getCurrentPosition(resolve, () => resolve(null)));
        if (pos) {
            const dist = calculateDistance(pos.coords.latitude, pos.coords.longitude, wc.lat, wc.lng);
            distanceHtml = `<span class="text-blue-400 font-bold ml-2">${dist.toFixed(1)}km</span>`;
        }
    }

    content.innerHTML = `
        <div class="flex flex-col gap-6">
            <div class="flex flex-col gap-2">
                <div class="flex items-center gap-2">
                    <span class="px-2 py-0.5 rounded text-[10px] font-black ${isOpen ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}">
                        ${isOpen ? '운영중' : '운영종료'}
                    </span>
                    ${wc.is24h ? '<span class="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[10px] font-black">24시간 개방</span>' : ''}
                </div>
                <h2 class="text-2xl font-extrabold uppercase">${wc.name}</h2>
            </div>
            
            <div class="premium-card bg-white/[0.02] flex flex-col gap-2">
                <span class="text-[10px] font-black text-zinc-500 uppercase">LOCATION ${distanceHtml}</span>
                <p class="text-sm font-medium text-zinc-300">${wc.address || '주소 정보 없음'}</p>
            </div>

            <div class="flex gap-2">
                ${wc.hasHandicap ? '<span class="premium-card py-2 px-3 text-[10px] font-bold">♿ 장애인</span>' : ''}
                ${wc.hasDiaper ? '<span class="premium-card py-2 px-3 text-[10px] font-bold">🍼 기저귀</span>' : ''}
                <span class="premium-card py-2 px-3 text-[10px] font-bold">🚻 남녀구분</span>
            </div>

            ${wc.managerTel ? `
                <div class="premium-card bg-white/[0.02] flex justify-between items-center">
                    <span class="text-xs font-bold text-zinc-500">관리자 연락처</span>
                    <a href="tel:${wc.managerTel}" class="text-sm font-bold text-blue-400">${wc.managerTel}</a>
                </div>
            ` : ''}

            <div class="grid grid-cols-2 gap-3">
                <a href="kakaomap://look?p=${wc.lat},${wc.lng}" onclick="window.location.href=this.href; return false;" class="premium-card text-center py-4 font-bold text-sm bg-[#FAE100] text-[#3C1E1E]">카카오맵 앱</a>
                <a href="kakaomap://route?ep=${wc.lat},${wc.lng}&by=FOOT" onclick="window.location.href=this.href; return false;" class="premium-card text-center py-4 font-bold text-sm bg-blue-600 text-white">도보 길찾기</a>
            </div>

            <p class="text-[10px] text-zinc-600">※ 모바일에서 카카오맵 앱이 설치되어 있어야 즉시 이동합니다.</p>
        </div>
    `;
    setBottomSheetHeight('half');
}

async function showNearestWCList() {
    if (!navigator.geolocation) return;
    
    const content = document.getElementById('bottom-sheet__content');
    content.innerHTML = '<div class="text-zinc-500 text-sm animate-pulse p-4">주변 화장실을 찾는 중...</div>';
    setBottomSheetHeight('half');

    navigator.geolocation.getCurrentPosition(async (pos) => {
        const { latitude, longitude } = pos.coords;
        const nearest = wcLayer.sortNearest(latitude, longitude);
        
        content.innerHTML = `
            <h3 class="text-sm font-black text-zinc-500 uppercase mb-4 tracking-widest">내 주변 화장실 추천</h3>
            <div class="flex flex-col gap-3">
                ${nearest.map(wc => `
                    <div class="wc-card premium-card flex justify-between items-center p-4" onclick='openWCInfo(${JSON.stringify(wc).replace(/'/g, "&apos;")})'>
                        <div class="flex flex-col">
                            <span class="text-base font-bold">${wc.name}</span>
                            <span class="text-[11px] text-zinc-500 mt-1">${wc.address}</span>
                        </div>
                        <span class="distance-badge">${wc.distance.toFixed(1)}km</span>
                    </div>
                `).join('')}
            </div>
        `;
    });
}

function setBottomSheetHeight(state) {
    const sheet = document.getElementById('bottomSheet');
    if (!sheet) return;
    sheetState = state;
    switch(state) {
        case 'hidden': 
            sheet.style.transform = 'translateY(100%)'; 
            sheet.classList.remove('open');
            const searchPanel = document.getElementById('mainSearchPanel');
            if (searchPanel) searchPanel.style.display = 'block';
            break;
        case 'half': 
            sheet.style.transform = 'translateY(60%)'; 
            sheet.classList.add('open');
            break;
        case 'full': 
            sheet.style.transform = 'translateY(10%)'; 
            sheet.classList.add('open');
            const sp = document.getElementById('mainSearchPanel');
            if (sp) sp.style.display = 'none';
            break;
    }
}

function bindTabEvents() {
    const tabs = document.querySelectorAll('.tab-item');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            updateTabUI(tabId);
        });
    });
}

function updateTabUI(tabId) {
    document.querySelectorAll('.tab-item').forEach(tab => {
        tab.dataset.tab === tabId ? tab.classList.add('active') : tab.classList.remove('active');
    });

    // 검색창 placeholder 업데이트
    const searchInput = document.getElementById('global-search-input');
    if (searchInput) {
        switch(tabId) {
            case 'subway': searchInput.placeholder = '역 이름 검색...'; break;
            case 'bus': searchInput.placeholder = '정류장 또는 버스번호 검색...'; break;
            case 'wc': searchInput.placeholder = '주소 또는 장소 검색...'; break;
            case 'combined': searchInput.placeholder = '통합 검색...'; break;
        }
    }

    // 필터 바 가시성
    const filterBar = document.getElementById('restroom-filter-bar');
    if (filterBar) {
        filterBar.style.opacity = tabId === 'wc' ? '1' : '0';
        filterBar.style.pointerEvents = tabId === 'wc' ? 'auto' : 'none';
    }

    if (subwayLayer) {
        (tabId === 'subway' || tabId === 'combined') ? subwayLayer.show() : subwayLayer.hide();
    }
    if (busLayer) {
        (tabId === 'bus' || tabId === 'combined') ? busLayer.show() : busLayer.hide();
    }
    if (wcLayer) {
        tabId === 'wc' ? wcLayer.show() : wcLayer.hide();
    }

    // 통합 모드일 경우 지도의 줌 레벨에 따라 버스 마커 가시성 자동 조절 이벤트 추가
    if (tabId === 'combined') {
        kakao.maps.event.addListener(window.kakaoMap, 'zoom_changed', () => {
            const level = window.kakaoMap.getLevel();
            if (level > 4) busLayer.hide(); // 멀리서 보면 버스 숨기기
            else busLayer.show();
        });
    }
}
