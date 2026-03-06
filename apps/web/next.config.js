/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/proof/:path*',
        destination: 'http://localhost:3003/proof/:path*'
      },
      {
        source: '/sbt/:path*',
        destination: 'http://localhost:3003/sbt/:path*'
      },
      {
        source: '/flow/:path*',
        destination: 'http://localhost:3003/flow/:path*'
      }
    ];
  }
};

module.exports = nextConfig;
