import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
  output: 'export',
  distDir: 'out',
  // Use '/metro' for GitHub Pages, but empty for Firebase root-level hosting
  basePath: process.env.NEXT_PUBLIC_DEPLOY_TARGET === 'firebase' ? '' : '/metro',
  images: {
    unoptimized: true,
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
