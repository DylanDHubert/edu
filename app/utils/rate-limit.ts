import { NextRequest } from 'next/server';

// IN-MEMORY STORE FOR RATE LIMITING (IN PRODUCTION, USE REDIS OR DATABASE)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * RATE LIMITING CONFIGURATION
 */
interface RateLimitConfig {
  windowMs: number; // TIME WINDOW IN MILLISECONDS
  maxRequests: number; // MAXIMUM REQUESTS PER WINDOW
  message?: string; // CUSTOM ERROR MESSAGE
}

/**
 * DEFAULT RATE LIMIT CONFIGURATIONS
 */
export const RATE_LIMITS = {
  // GENERAL API ENDPOINTS
  GENERAL: {
    windowMs: 15 * 60 * 1000, // 15 MINUTES
    maxRequests: 100,
    message: 'Too many requests. Please try again later.'
  },
  
  // SENSITIVE ENDPOINTS (AUTH, FILE UPLOAD, ETC.)
  SENSITIVE: {
    windowMs: 15 * 60 * 1000, // 15 MINUTES
    maxRequests: 20,
    message: 'Too many requests to sensitive endpoint. Please try again later.'
  },
  
  // CHAT ENDPOINTS
  CHAT: {
    windowMs: 1 * 60 * 1000, // 1 MINUTE
    maxRequests: 100,
    message: 'Too many chat requests. Please slow down.'
  },
  
  // FILE UPLOAD ENDPOINTS
  FILE_UPLOAD: {
    windowMs: 60 * 60 * 1000, // 1 HOUR
    maxRequests: 100,
    message: 'Too many file uploads. Please try again later.'
  }
} as const;

/**
 * GET CLIENT IDENTIFIER FOR RATE LIMITING
 * @param request - Next.js request object
 * @returns Client identifier (IP address or user ID)
 */
function getClientIdentifier(request: NextRequest): string {
  // TRY TO GET USER ID FROM HEADERS (IF AUTHENTICATED)
  const userId = request.headers.get('x-user-id');
  if (userId) {
    return `user:${userId}`;
  }
  
  // FALLBACK TO IP ADDRESS
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : 'unknown';
  return `ip:${ip}`;
}

/**
 * CHECK IF REQUEST IS WITHIN RATE LIMIT
 * @param request - Next.js request object
 * @param config - Rate limit configuration
 * @returns Object with isAllowed flag and remaining requests
 */
export function checkRateLimit(
  request: NextRequest,
  config: RateLimitConfig
): { isAllowed: boolean; remaining: number; resetTime: number } {
  const clientId = getClientIdentifier(request);
  const now = Date.now();
  
  // GET OR CREATE RATE LIMIT ENTRY
  let entry = rateLimitStore.get(clientId);
  
  if (!entry || now > entry.resetTime) {
    // CREATE NEW ENTRY OR RESET EXPIRED ENTRY
    entry = {
      count: 0,
      resetTime: now + config.windowMs
    };
    rateLimitStore.set(clientId, entry);
  }
  
  // INCREMENT REQUEST COUNT
  entry.count++;
  
  // CHECK IF LIMIT EXCEEDED
  const isAllowed = entry.count <= config.maxRequests;
  const remaining = Math.max(0, config.maxRequests - entry.count);
  
  return {
    isAllowed,
    remaining,
    resetTime: entry.resetTime
  };
}

/**
 * RATE LIMITING MIDDLEWARE FOR API ROUTES
 * @param request - Next.js request object
 * @param config - Rate limit configuration
 * @returns Response with rate limit headers or null if allowed
 */
export function rateLimitMiddleware(
  request: NextRequest,
  config: RateLimitConfig
): Response | null {
  const { isAllowed, remaining, resetTime } = checkRateLimit(request, config);
  
  if (!isAllowed) {
    const response = new Response(
      JSON.stringify({ 
        error: config.message || 'Rate limit exceeded',
        retryAfter: Math.ceil((resetTime - Date.now()) / 1000)
      }),
      { 
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': config.maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': Math.ceil(resetTime / 1000).toString(),
          'Retry-After': Math.ceil((resetTime - Date.now()) / 1000).toString()
        }
      }
    );
    return response;
  }
  
  // ADD RATE LIMIT HEADERS TO SUCCESSFUL RESPONSES
  const response = new Response();
  response.headers.set('X-RateLimit-Limit', config.maxRequests.toString());
  response.headers.set('X-RateLimit-Remaining', remaining.toString());
  response.headers.set('X-RateLimit-Reset', Math.ceil(resetTime / 1000).toString());
  
  return null; // ALLOW REQUEST TO CONTINUE
}

/**
 * CLEANUP EXPIRED RATE LIMIT ENTRIES
 * CALL THIS PERIODICALLY TO PREVENT MEMORY LEAKS
 */
export function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

// CLEANUP EXPIRED ENTRIES EVERY 5 MINUTES
setInterval(cleanupExpiredEntries, 5 * 60 * 1000);
