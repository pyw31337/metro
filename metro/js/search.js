/**
 * search.js
 * 초성 검색 및 경로 검색 로직 관리
 */
class SearchManager {
    constructor() {
        this.index = []; // { name, type, id, lat, lng, chosung }
        this.isSearchOpen = false;
        this.searchStep = 'destination'; // destination, origin
        this.selectedDestination = null;
        this.selectedOrigin = null;
    }

    init() {
        this.buildIndex();
        this.bindEvents();
    }

    /**
     * 지하철/버스 정류장 데이터를 검색용 인덱스로 변환
     */
    buildIndex() {
        // 지하철 데이터 인덱싱
        if (window.subwayLayer && window.subwayLayer.data) {
            window.subwayLayer.data.lines.forEach(line => {
                line.stations.forEach(st => {
                    this.index.push({
                        name: st.name,
                        display: `${line.name} ${st.name}`,
                        type: 'subway',
                        id: st.id,
                        lat: st.lat,
                        lng: st.lng,
                        chosung: Hangul.disassemble(st.name, true).map(c => c[0]).join('')
                    });
                });
            });
        }
        
        // 중복 제거 (환승역 등)
        this.index = this.index.filter((item, index, self) =>
            index === self.findIndex((t) => t.name === item.name && t.type === item.type)
        );
        
        console.log(`Search Index Built: ${this.index.length} items`);
    }

    bindEvents() {
        const searchInput = document.querySelector('.floating-search input');
        if (searchInput) {
            searchInput.addEventListener('click', () => this.openSearchLayer());
            searchInput.addEventListener('input', (e) => this.search(e.target.value));
        }
    }

    openSearchLayer() {
        this.isSearchOpen = true;
        this.searchStep = 'destination';
        setBottomSheetHeight('full');
        this.renderSearchUI();
    }

    renderSearchUI() {
        const content = document.getElementById('bottom-sheet__content');
        content.innerHTML = `
            <div class="search-layer">
                <div class="search-header mb-6">
                    <div class="flex justify-between items-center mb-2">
                        <h2 class="text-2xl font-black">${this.searchStep === 'destination' ? '어디로 가시나요?' : '어디서 출발하시나요?'}</h2>
                        ${window.subwayLayer?.isRouteMode ? `<button class="text-xs font-bold text-blue-400 bg-blue-400/10 px-3 py-1.5 rounded-full" onclick="searchManager.resetAll()">경로 초기화</button>` : ''}
                    </div>
                    <div class="premium-card flex items-center p-3 gap-3">
                        <span class="text-zinc-500">${this.searchStep === 'destination' ? '🏁' : '🚩'}</span>
                        <input type="text" id="search-input-inner" class="bg-transparent border-none outline-none w-full text-lg font-bold" placeholder="장소명 또는 초성(ㄱㄴ) 검색" autofocus>
                    </div>
                </div>
                <div id="search-results" class="flex flex-col gap-2">
                    <p class="text-zinc-500 text-sm">최근 검색어 또는 주변 추천 장소가 여기에 표시됩니다.</p>
                </div>
            </div>
        `;

        const innerInput = document.getElementById('search-input-inner');
        innerInput.focus();
        innerInput.addEventListener('input', (e) => this.performSearch(e.target.value));
    }

    performSearch(query) {
        if (!query) {
            this.renderResults([]);
            return;
        }

        const isChosung = Hangul.isConsonant(query[0]);
        const results = this.index.filter(item => {
            if (isChosung) {
                return item.chosung.includes(query);
            }
            return item.name.includes(query);
        }).slice(0, 10);

        this.renderResults(results);
    }

    renderResults(results) {
        const resultsEl = document.getElementById('search-results');
        if (results.length === 0) {
            resultsEl.innerHTML = '<p class="text-zinc-500 text-sm p-4">검색 결과가 없습니다.</p>';
            return;
        }

        resultsEl.innerHTML = results.map(item => `
            <div class="search-item premium-card p-4 flex justify-between items-center cursor-pointer hover:bg-white/5" onclick="searchManager.selectItem('${item.id}', '${item.type}')">
                <div class="flex flex-col">
                    <span class="font-bold text-lg">${item.name}</span>
                    <span class="text-xs text-zinc-500">${item.display}</span>
                </div>
                <span class="text-xl">${item.type === 'subway' ? '🚇' : '🚌'}</span>
            </div>
        `).join('');
    }

    async selectItem(id, type) {
        const item = this.index.find(i => i.id === id && i.type === type);
        if (!item) return;

        if (this.searchStep === 'destination') {
            this.selectedDestination = item;
            this.prepareOriginStep();
        } else {
            this.selectedOrigin = item;
            this.finishSearch();
        }
    }

    /**
     * 목적지 선택 후 출발지 단계 준비
     * 현재 위치 기반 가장 가까운 역 자동 추천
     */
    prepareOriginStep() {
        this.searchStep = 'origin';
        
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((pos) => {
                const { latitude, longitude } = pos.coords;
                const nearest = this.findNearest(latitude, longitude);
                if (nearest) {
                    this.selectedOrigin = nearest;
                    this.renderOriginStep(nearest);
                } else {
                    this.renderSearchUI();
                }
            }, () => {
                this.renderSearchUI();
            });
        } else {
            this.renderSearchUI();
        }
    }

    findNearest(lat, lng) {
        return this.index
            .map(item => ({
                ...item,
                dist: calculateDistance(lat, lng, item.lat, item.lng)
            }))
            .sort((a, b) => a.dist - b.dist)[0];
    }

    renderOriginStep(nearest) {
        const content = document.getElementById('bottom-sheet__content');
        content.innerHTML = `
            <div class="search-layer">
                <h2 class="text-2xl font-black mb-6">출발지를 확인해주세요.</h2>
                
                <div class="flex flex-col gap-4 mb-8">
                    <div class="premium-card p-4 border-l-4 border-zinc-500">
                        <span class="text-xs font-black text-zinc-500 uppercase">목적지</span>
                        <div class="text-lg font-bold">${this.selectedDestination.name}</div>
                    </div>
                    
                    <div class="premium-card p-4 border-l-4 border-blue-500 bg-blue-500/5">
                        <div class="flex justify-between items-center mb-1">
                            <span class="text-xs font-black text-blue-500 uppercase">출발지 (자동 추천)</span>
                            <button class="text-[10px] font-bold underline text-zinc-400" onclick="searchManager.renderSearchUI()">변경하기</button>
                        </div>
                        <div class="text-lg font-bold">${nearest.name}</div>
                        <p class="text-xs text-zinc-500 mt-1">현위치에서 가장 가까운 역입니다.</p>
                    </div>
                </div>

                <button class="w-full py-5 rounded-2xl bg-blue-600 text-white font-black text-lg shadow-xl shadow-blue-900/20" onclick="searchManager.finishSearch()">경로 탐색 시작</button>
            </div>
        `;
    }

    finishSearch() {
        this.isSearchOpen = false;
        setBottomSheetHeight('hidden');
        
        // 경로 렌더링 로직 (subwayLayer.highlightRoute 연동)
        if (this.selectedOrigin && this.selectedDestination) {
            console.log(`Routing: ${this.selectedOrigin.name} ➔ ${this.selectedDestination.name}`);
            
            if (window.subwayLayer) {
                window.subwayLayer.highlightRoute(this.selectedOrigin, this.selectedDestination);
                
                // 검색바 텍스트 업데이트
                const btnText = document.querySelector('.search-trigger-btn .placeholder');
                if (btnText) btnText.textContent = `${this.selectedOrigin.name} ➔ ${this.selectedDestination.name}`;
            }
        }
    }

    resetAll() {
        if (window.subwayLayer) window.subwayLayer.resetRouteMode();
        this.selectedOrigin = null;
        this.selectedDestination = null;
        const btnText = document.querySelector('.search-trigger-btn .placeholder');
        if (btnText) btnText.textContent = '어디로 가시나요?';
        setBottomSheetHeight('hidden');
    }
}

window.searchManager = new SearchManager();
