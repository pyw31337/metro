import fs from "node:fs";
import path from "node:path";

import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === 'development';
const buildTimestamp = new Date().toISOString();
const buildVersion = process.env.METRO_BUILD_VERSION ?? buildTimestamp.replace(/[:.]/g, "-");
const publicDir = path.join(process.cwd(), "public");

fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(
  path.join(publicDir, "version.json"),
  JSON.stringify(
    {
      buildVersion,
      builtAt: buildTimestamp,
      target: process.env.NEXT_PUBLIC_DEPLOY_TARGET === "firebase" ? "firebase" : "static",
    },
    null,
    2,
  ),
);

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_VERSION: buildVersion,
  },
  turbopack: {
    root: process.cwd(),
  },
  compiler: {
    removeConsole: isDev ? false : { exclude: ['error', 'warn'] },
  },
  output: 'export',
  distDir: 'out',
  // Use '/metro' for GitHub Pages, but empty for Firebase root-level hosting
  basePath: process.env.NEXT_PUBLIC_DEPLOY_TARGET === 'firebase' ? '' : '/metro',
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
