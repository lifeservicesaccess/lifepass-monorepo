/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // Keep local DX simple: /proof, /sbt, /flow proxy to local API in dev.
    if (process.env.NODE_ENV !== 'development') {
      return [];
    }

    const localApiBaseUrl = process.env.LOCAL_API_BASE_URL || 'http://localhost:3003';
    return [
      {
        source: '/proof/:path*',
        destination: `${localApiBaseUrl}/proof/:path*`
      },
      {
        source: '/sbt/:path*',
        destination: `${localApiBaseUrl}/sbt/:path*`
      },
      {
        source: '/flow/:path*',
        destination: `${localApiBaseUrl}/flow/:path*`
      }
    ];
  }
};

module.exports = nextConfig;
