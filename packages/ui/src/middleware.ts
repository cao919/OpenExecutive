import { NextResponse } from "next/server";

// LOCAL-DEV BYPASS: the original implementation gated every page + non-auth
// API route behind NextAuth (Google sign-in). For local evaluation we disable
// that gate. Revert this file to restore the login wall.
export default function middleware() {
  return NextResponse.next();
}

// Exclude Auth.js's own routes, Next internals, static assets, and exactly
// `/signin` (with optional trailing slash).
export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|signin/?$).*)"],
};
