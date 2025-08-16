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
  const protectedRoutes = ["/dashboard", "/setup", "/chat"];  // Removed launcher, added chat
  const authRoutes = ["/login", "/signup"];
  const publicRoutes = ["/", "/debug", "/invite", "/no-access"];  // Home page is now public for both logged in and out users

  // CHECK IF USER IS AUTHENTICATED
  const isAuthenticated = !!user;

  // REDIRECT LOGIC
  if (isAuthenticated) {
    // IF USER IS LOGGED IN AND TRYING TO ACCESS AUTH ROUTES, CHECK FOR INVITATION CONTEXT
    if (authRoutes.includes(pathname)) {
      // ALLOW ACCESS TO AUTH ROUTES IF THEY HAVE INVITATION PARAMETERS
      const url = new URL(request.url);
      const hasInvitationContext = url.searchParams.has('token') && url.searchParams.has('type');
      
      console.log('=== MIDDLEWARE DEBUG ===');
      console.log('Pathname:', pathname);
      console.log('Has invitation context:', hasInvitationContext);
      console.log('Token:', url.searchParams.get('token'));
      console.log('Type:', url.searchParams.get('type'));
      
      if (hasInvitationContext) {
        console.log('Allowing access to auth route with invitation context');
        return response; // ALLOW ACCESS TO AUTH ROUTES WITH INVITATION CONTEXT
      } else {
        console.log('Redirecting authenticated user to home');
        return NextResponse.redirect(new URL("/", request.url));
      }
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