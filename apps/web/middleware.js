import { NextResponse } from 'next/server';

export function middleware(request) {
  const url = request.nextUrl;
  // Disable caching for dev assets and the HTML page so the browser doesn't
  // hold stale references to hot-update manifests.
  if (url.pathname === '/' || url.pathname.startsWith('/_next/static/')) {
    // Log HMR-related requests for debugging (dev-only)
    try {
      const now = new Date().toISOString();
      // Narrow logging to webpack hot-update assets for clarity
      if (url.pathname.includes('/_next/static/webpack') || url.pathname.endsWith('.hot-update.json')) {
        console.log(`[dev-middleware] HMR request: ${now} ${url.pathname}`);
      }
    } catch (err) {
      // ignore logging errors in edge runtime
    }

    const res = NextResponse.next();
    res.headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');
    // Mark responses we logged to help correlate in server logs
    res.headers.set('x-dev-hmr-logged', '1');
    return res;
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/_next/static/:path*']
};
