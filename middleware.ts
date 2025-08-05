import { createClient } from "./app/utils/supabase/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // CREATE SUPABASE CLIENT FOR MIDDLEWARE
  const { supabase, response } = createClient(request);

  // REFRESH SESSION IF EXPIRED
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // GET THE PATHNAME OF THE REQUEST
  const { pathname } = request.nextUrl;

  // DEFINE PROTECTED ROUTES
  const protectedRoutes = ["/", "/dashboard"];
  const authRoutes = ["/login", "/signup"];

  // CHECK IF USER IS AUTHENTICATED
  const isAuthenticated = !!user;

  // REDIRECT LOGIC
  if (isAuthenticated) {
    // IF USER IS LOGGED IN AND TRYING TO ACCESS AUTH ROUTES, REDIRECT TO HOME
    if (authRoutes.includes(pathname)) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  } else {
    // IF USER IS NOT LOGGED IN AND TRYING TO ACCESS PROTECTED ROUTES, REDIRECT TO LOGIN
    if (protectedRoutes.includes(pathname)) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * MATCH ALL REQUEST PATHS EXCEPT FOR THE ONES STARTING WITH:
     * - _next/static (STATIC FILES)
     * - _next/image (IMAGE OPTIMIZATION FILES)
     * - favicon.ico (FAVICON FILE)
     * - PUBLIC FOLDER
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}; 