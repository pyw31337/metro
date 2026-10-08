import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === 'development';
// Use '/metro' for GitHub Pages (https://pyw31337.github.io/metro), but empty for Firebase root-level hosting
const basePath = process.env.NEXT_PUBLIC_DEPLOY_TARGET === 'firebase' ? '' : '/metro';

const nextConfig: NextConfig = {
  compiler: {
    removeConsole: isDev ? false : { exclude: ['error', 'warn'] },
  },
  output: 'export',
  distDir: 'out',
  basePath,
  // 클라이언트 코드에서 정적 자산/데이터 경로를 만들 때 사용 (fetch 는 basePath 를 자동으로 붙이지 않음)
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  images: {
    unoptimized: true,
  },

  // Ensure trailing slashes for static export routing
  trailingSlash: true,
  ...(isDev && {
    rewrites: async () => [
      {
        source: '/api/proxy/subway/:path*',
        destination: 'http://swopenapi.seoul.go.kr/api/subway/:path*'
      }
    ]
  })
};

export default nextConfig;
