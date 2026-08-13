/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the file-tracing root to this project (a stray lockfile exists in a
  // parent dir). Keeps Vercel output tracing correct.
  outputFileTracingRoot: import.meta.dirname,
  // WebXR requires a secure context. On localhost this is satisfied automatically;
  // for on-device (Quest) testing use `npm run dev:https` or a tunnel (see README).
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Allow the immersive session + XR device access on this origin.
          { key: 'Permissions-Policy', value: 'xr-spatial-tracking=(self)' },
        ],
      },
    ];
  },
};

export default nextConfig;
