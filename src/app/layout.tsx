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
            <body>
                {children}
            </body>
        </html>
    );
}
