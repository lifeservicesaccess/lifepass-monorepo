import { NextResponse } from 'next/server';

export function middleware(request) {
  const url = request.nextUrl;
  if (url.pathname.startsWith('/_next/static/webpack/')) {
    const res = NextResponse.next();
    res.headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');
    return res;
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/_next/static/webpack/:path*'
};
