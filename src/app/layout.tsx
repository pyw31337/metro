import type { Metadata, Viewport } from 'next';
import './globals.css';
import ErrorBoundary from '@/components/ErrorBoundary';

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
        apple: '/metro/icon-192.png',
        icon: '/metro/icon-192.png',
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
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('/metro/sw.js').then(function(reg) {
        reg.addEventListener('updatefound', function() {
          var newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', function() {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available — show toast
              var toast = document.createElement('div');
              toast.id = 'sw-update-toast';
              toast.style.cssText = 'position:fixed;bottom:120px;left:50%;transform:translateX(-50%);z-index:9999;background:rgba(15,15,20,0.92);color:white;padding:10px 20px;border-radius:20px;font-size:13px;font-weight:700;backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.1);cursor:pointer;white-space:nowrap;';
              toast.textContent = '새 버전 사용 가능 — 탭하여 업데이트';
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
