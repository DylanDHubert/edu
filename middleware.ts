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

  // DEFINE ROUTES
  const protectedRoutes = ["/launcher", "/dashboard", "/setup"];  // Added setup routes
  const authRoutes = ["/login", "/signup"];
  const publicRoutes = ["/", "/debug", "/invite"];  // Added invite routes as public

  // CHECK IF USER IS AUTHENTICATED
  const isAuthenticated = !!user;

  // REDIRECT LOGIC
  if (isAuthenticated) {
    // IF USER IS LOGGED IN AND TRYING TO ACCESS AUTH ROUTES, REDIRECT TO LAUNCHER
    if (authRoutes.includes(pathname)) {
      return NextResponse.redirect(new URL("/launcher", request.url));
    }
    
    // CHECK ADMIN ROUTES - Let admin components handle verification
    if (pathname.startsWith("/admin")) {
      return response;
    }
    
    // ALLOW ACCESS TO PUBLIC ROUTES
    if (publicRoutes.includes(pathname)) {
      return response;
    }
  } else {
    // IF USER IS NOT LOGGED IN
    
    // ALLOW ACCESS TO AUTH ROUTES
    if (authRoutes.includes(pathname)) {
      return response;
    }
    
    // ALLOW ACCESS TO PUBLIC ROUTES  
    if (publicRoutes.includes(pathname)) {
      return response;
    }
    
    // REDIRECT TO LOGIN FOR PROTECTED ROUTES
    if (protectedRoutes.some(route => pathname.startsWith(route))) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    
    // REDIRECT TO LOGIN FOR ADMIN ROUTES
    if (pathname.startsWith("/admin")) {
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