import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/metro',
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
