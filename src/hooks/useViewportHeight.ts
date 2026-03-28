import { useState, useEffect } from 'react';

export function useViewportHeight() {
    const [viewportHeight, setViewportHeight] = useState<number>(0);
    const [keyboardOffset, setKeyboardOffset] = useState<number>(0);

    useEffect(() => {
        if (!window.visualViewport) return;

        const handleResize = () => {
            if (!window.visualViewport) return;
            const height = window.visualViewport.height;
            const totalHeight = window.innerHeight;
            
            setViewportHeight(height);
            // Height difference often corresponds to the virtual keyboard
            const diff = totalHeight - height;
            setKeyboardOffset(diff > 50 ? diff : 0);
        };

        window.visualViewport.addEventListener('resize', handleResize);
        window.visualViewport.addEventListener('scroll', handleResize);
        handleResize();

        return () => {
            window.visualViewport?.removeEventListener('resize', handleResize);
            window.visualViewport?.removeEventListener('scroll', handleResize);
        };
    }, []);

    return { viewportHeight, keyboardOffset };
}
