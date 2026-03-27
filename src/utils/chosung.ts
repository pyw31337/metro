/**
 * Korean Chosung (Consonant) Search Utility
 */

const CHOSUNG = [
    'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 
    'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
];

/**
 * Extracts chosung from a Korean string.
 * Example: "강남역" -> "ㄱㄴㅇ"
 */
export const extractChosung = (text: string): string => {
    let result = '';
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i) - 44032;
        if (code > -1 && code < 11172) {
            result += CHOSUNG[Math.floor(code / 588)];
        } else {
            result += text.charAt(i);
        }
    }
    return result;
};

/**
 * Checks if search text matches target text (supports chosung and literal).
 */
export const chosungIncludes = (target: string, search: string): boolean => {
    const targetChosung = extractChosung(target);
    const searchChosung = extractChosung(search);
    
    // 1. Check literal inclusion
    if (target.includes(search)) return true;
    
    // 2. Check chosung inclusion
    if (targetChosung.includes(searchChosung)) return true;
    
    return false;
};
