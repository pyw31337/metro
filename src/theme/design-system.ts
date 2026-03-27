export const THEME = {
    fonts: {
        primary: "'Pretendard', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    },
    colors: {
        textPrimary: "#222222",
        textSecondary: "#666666",
        white: "#FFFFFF",
        black: "#000000",
        background: "#FFFFFF",
        backgroundDark: "#000000",
        // Subtle Drop Shadow (Blur 10px, Opacity 0.05)
        shadow: "0 4px 10px rgba(0, 0, 0, 0.05)",
    },
    canvas: {
        lineWidth: 7.5, // 6px~8px per request
        lineCap: "round" as const,
        lineJoin: "round" as const,
        stationRadius: 5,
        hitAreaRadius: 25, // Large hitbox
        labelSize: 13,
        fontWeight: 400,
        selectedFontWeight: 800,
        capsulePadding: 10,
        capsuleRadius: 16,
    },
    transitions: {
        default: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        spring: { type: "spring" as const, stiffness: 350, damping: 25 },
    }
};
