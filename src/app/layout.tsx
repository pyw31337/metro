import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'Metro Live',
    description: '수도권 실시간 지하철·버스·화장실 네비게이션',
    manifest: '/metro/manifest.json',
    appleWebApp: {
        capable: true,
        statusBarStyle: 'black-translucent',
        title: 'Metro Live',
    },
    formatDetection: { telephone: false },
    icons: {
        apple: '/metro/train-icon.png',
    },
};

export const viewport: Viewport = {
    themeColor: '#0052A4',
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: 'cover',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="ko">
            <head>
                {/* Apply dark mode before first paint to prevent flash */}
                <script
                    dangerouslySetInnerHTML={{
                        __html: `
(function(){
  try {
    var prefs = JSON.parse(localStorage.getItem('metro-ui-prefs') || '{}');
    var dark = prefs.state?.isDarkMode ?? window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark) document.documentElement.classList.add('dark');
  } catch(e) {}
})();
        `.trim()
                    }}
                />
            </head>
            <body>
                {children}
            </body>
        </html>
    );
}
