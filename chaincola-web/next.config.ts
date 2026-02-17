import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // NOTE: removed `experimental.turbopack` because this Next.js version
  // reported it as an unrecognized key. If you upgrade Next.js to a
  // version that supports `experimental.turbopack`, you can restore this
  // setting. For now keep `experimental` present (empty) to avoid
  // introducing unrelated changes.
  experimental: {},
  
  // Increase header size limits to prevent HTTP 431 errors
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
