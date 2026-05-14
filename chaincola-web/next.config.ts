import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // NOTE: removed `experimental.turbopack` because this Next.js version
  // reported it as an unrecognized key. If you upgrade Next.js to a
  // version that supports `experimental.turbopack`, you can restore this
  // setting. For now keep `experimental` present (empty) to avoid
  // introducing unrelated changes.
  experimental: {},

  /** Legal pages live under /profile/*; old footer URLs and prefetches otherwise 404. */
  async redirects() {
    return [
      { source: '/terms', destination: '/profile/terms', permanent: true },
      { source: '/privacy', destination: '/profile/privacy', permanent: true },
      { source: '/security', destination: '/profile/security', permanent: true },
    ];
  },

  /** Browsers request /favicon.ico by default; we only ship SVGs in /public until a real .ico is added. */
  async rewrites() {
    return [{ source: '/favicon.ico', destination: '/file.svg' }];
  },

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
