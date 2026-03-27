// map.js
let map = null;

const layerManager = {
    layers: {
        'subway': [],
        'bus': [],
        'combined': [],
        'restroom': []
    },

    currentTab: 'subway',

    init(mapInstance) {
        map = mapInstance;
        console.log('Map Layer Manager Initialized');
    },

    // Show/Hide Layers based on Tab
    switchTab(tabId) {
        this.currentTab = tabId;
        console.log(`LayerManager: Switching to ${tabId}`);
        // Clear all markers from map momentarily (Mock logic for now)
        this.hideAllLayers();
        this.showLayer(tabId);
    },

    showLayer(id) {
        if (id === 'combined') {
            this.showLayer('subway');
            this.showLayer('bus');
            return;
        }
        console.log(`Showing Layer: ${id}`);
        // Actual Kakao Marker .setMap(map) logic will go here
    },

    hideAllLayers() {
        Object.keys(this.layers).forEach(key => {
            console.log(`Hiding Layer: ${key}`);
            // Actual Kakao Marker .setMap(null) logic
        });
    }
};

// Kakao Maps Async Loader
function initKakaoMap() {
    const container = document.getElementById('map');
    const options = {
        center: new kakao.maps.LatLng(CONFIG.INITIAL_CENTER.lat, CONFIG.INITIAL_CENTER.lng),
        level: CONFIG.INITIAL_ZOOM
    };

    map = new kakao.maps.Map(container, options);

    // Zoom Control
    const zoomControl = new kakao.maps.ZoomControl();
    map.addControl(zoomControl, kakao.maps.ControlPosition.RIGHT);

    layerManager.init(map);
    
    // Initial Layer
    layerManager.switchTab('subway');
}

// Load Script Dynamic
function loadMapScript(apiKey) {
    const script = document.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${apiKey}&autoload=false`;
    script.async = true;
    
    script.onload = () => {
        kakao.maps.load(() => {
            initKakaoMap();
        });
    };
    
    document.head.appendChild(script);
}
