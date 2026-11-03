/**
 * Next.js Configuration for Mezoteric School Platform
 * 
 * Features supported:
 * 1. Static HTML/JS/CSS Export (PWA/SPA) for zero-dependency hosting on the LAN node
 * 2. Reverse proxy rewrites during development to the Mezoteric LAN Node (port 3000)
 * 3. Unoptimized images for offline LAN hosting without an external CDN
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the preview safe to embed while hardening deployed responses.
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
      ],
    }];
  },
  // Support static export for zero-dependency hosting by server/index.js
  output: process.env.NEXT_EXPORT === 'true' ? 'export' : undefined,
  trailingSlash: true,
  images: {
    unoptimized: true, // Crucial for offline school LANs where no internet or CDN is available
  },
  // In development mode, proxy API requests and media streaming to the Mezoteric LAN Node
  async rewrites() {
    const backendUrl = process.env.MZ_BACKEND_URL || 'http://127.0.0.1:3000';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: '/media/:path*',
        destination: `${backendUrl}/media/:path*`,
      },
    ];
  },
};

export default nextConfig;
