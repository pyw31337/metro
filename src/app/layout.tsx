import type { Metadata, Viewport } from 'next';
import './globals.css';
import ErrorBoundary from '@/components/ErrorBoundary';

// next.config.ts 의 basePath 와 동일 ('/metro' 또는 Firebase 빌드 시 '')
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const DESCRIPTION = '수도권 지하철 열차 위치를 실시간으로 지도에 보여주고, 경로·버스·화장실까지 한 화면에서 찾습니다.';

export const metadata: Metadata = {
    title: 'Metro Live · 수도권 실시간 지하철 지도',
    description: DESCRIPTION,
    applicationName: 'Metro Live',
    metadataBase: BASE ? new URL('https://pyw31337.github.io') : undefined,
    manifest: `${BASE}/manifest.json`,
    appleWebApp: {
        capable: true,
        statusBarStyle: 'black-translucent',
        title: 'Metro Live',
    },
    formatDetection: { telephone: false },
    icons: {
        apple: `${BASE}/icon-192.png`,
        icon: `${BASE}/icon-192.png`,
    },
    openGraph: {
        type: 'website',
        locale: 'ko_KR',
        siteName: 'Metro Live',
        title: 'Metro Live · 수도권 실시간 지하철 지도',
        description: DESCRIPTION,
        images: [{ url: `${BASE}/icon-512.png`, width: 512, height: 512 }],
    },
    twitter: {
        card: 'summary',
        title: 'Metro Live',
        description: DESCRIPTION,
    },
};

// 확대 제한(userScalable: false)은 저시력 사용자를 막으므로 두지 않는다.
// 지도 자체의 핀치 줌은 MapLibre 캔버스가 처리한다.
export const viewport: Viewport = {
    themeColor: [
        { media: '(prefers-color-scheme: light)', color: '#f6f6f4' },
        { media: '(prefers-color-scheme: dark)', color: '#09090b' },
    ],
    colorScheme: 'light dark',
    width: 'device-width',
    initialScale: 1,
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
      navigator.serviceWorker.register('${BASE}/sw.js', { scope: '${BASE}/' }).then(function(reg) {
        reg.addEventListener('updatefound', function() {
          var newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', function() {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available: show toast
              var toast = document.createElement('div');
              toast.id = 'sw-update-toast';
              toast.setAttribute('role', 'status');
              toast.style.cssText = 'position:fixed;bottom:120px;left:50%;transform:translateX(-50%);z-index:9000;background:rgba(24,24,27,0.94);color:#fafaf9;padding:10px 18px;border-radius:999px;font-size:13px;font-weight:600;backdrop-filter:blur(12px);border:1px solid rgba(250,250,249,0.08);box-shadow:0 8px 24px -6px rgba(24,24,27,0.4);cursor:pointer;white-space:nowrap;';
              toast.textContent = '새 버전이 있어요. 눌러서 업데이트';
              toast.onclick = function() { window.location.reload(); };
              document.body.appendChild(toast);
              setTimeout(function() { var t = document.getElementById('sw-update-toast'); if(t) t.remove(); }, 8000);
            }
          });
        });
      }).catch(function(err) { console.warn('SW registration failed', err); });
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
                </ErrorBoundary>
            </body>
        </html>
    );
}
