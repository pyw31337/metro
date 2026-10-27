import type { Metadata, Viewport } from 'next';
import './globals.css';
import AppUpdateBanner from '@/components/AppUpdateBanner';
import ErrorBoundary from '@/components/ErrorBoundary';
import { withDeployBase } from '@/utils/deployPaths';

const manifestPath = withDeployBase('/manifest.json');
const iconPath = withDeployBase('/icon-192.png');
const swPath = withDeployBase('/sw.js');

export const metadata: Metadata = {
    title: 'Metro Live',
    description: '수도권 실시간 지하철·버스·화장실 네비게이션',
    manifest: manifestPath,
    appleWebApp: {
        capable: true,
        statusBarStyle: 'black-translucent',
        title: 'Metro Live',
    },
    formatDetection: { telephone: false },
    icons: {
        apple: iconPath,
        icon: iconPath,
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
                <link rel="preconnect" href="https://cdn.jsdelivr.net" />
                <link
                    rel="stylesheet"
                    href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
                />
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
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('${swPath}').catch(function(err) { console.warn('SW registration failed', err); });
    });
  }
})();
        `.trim()
                    }}
                />
            </head>
            <body>
                <ErrorBoundary>
                    {children}
                    <AppUpdateBanner />
                </ErrorBoundary>
            </body>
        </html>
    );
}
