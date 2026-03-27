/**
 * js/config.js
 * API Keys and Global Configurations
 * ⚠️ 보안 주의: 이 파일은 클라이언트 측에서 로드되므로, 화이트리스트(도메인 제한) 설정을 권장합니다.
 */
const CONFIG = {
    // 카카오맵 JavaScript 키
    KAKAO_MAP_KEY: '0236cfffa7cfef34abacd91a6d7c73c0',
    
    // 서울 데이터 광장 인증키
    SEOUL_API_KEY: '434f7275707079773537687a507658',
    
    // 공공데이터포털 일반 인증키 (버스/화장실 공통 사용)
    // 인코딩된 상태 그대로 저장하여 API 호출 시 사용
    PUBLIC_DATA_KEY: '%2BwF9V%2FFmtnPwFyVA23nnj8bPMr6408AqX7SOvjeKVxwn%2F9NdHD9lY3vlQ0SckYijlvhHdjIPmDttxD4bd9YvwQ%3D%3D'
};

// 전역 객체로 노출
window.METRO_CONFIG = CONFIG;
