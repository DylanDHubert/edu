import { NextResponse } from 'next/server';

/**
 * STANDARDIZED ERROR RESPONSES FOR CONSISTENT API BEHAVIOR
 */
export const ErrorResponses = {
  unauthorized: (message = 'Unauthorized') => 
    NextResponse.json({ error: message }, { status: 401 }),
  
  forbidden: (message = 'Access denied') => 
    NextResponse.json({ error: message }, { status: 403 }),
  
  notFound: (message = 'Resource not found') => 
    NextResponse.json({ error: message }, { status: 404 }),
  
  badRequest: (message = 'Bad request') => 
    NextResponse.json({ error: message }, { status: 400 }),
  
  serverError: (message = 'Internal server error') => 
    NextResponse.json({ error: message }, { status: 500 }),
  
  conflict: (message = 'Resource already exists') => 
    NextResponse.json({ error: message }, { status: 409 }),
  
  unprocessableEntity: (message = 'Invalid data provided') => 
    NextResponse.json({ error: message }, { status: 422 })
};

/**
 * HANDLE AUTHENTICATION ERRORS
 */
export function handleAuthError(error: Error): NextResponse {
  switch (error.message) {
    case 'UNAUTHORIZED':
      return ErrorResponses.unauthorized();
    case 'course_ACCESS_DENIED':
      return ErrorResponses.forbidden('You do not have access to this course');
    case 'INSUFFICIENT_PERMISSIONS':
      return ErrorResponses.forbidden('Insufficient permissions for this operation');
    case 'ADMIN_ACCESS_REQUIRED':
      return ErrorResponses.forbidden('Admin access required');
    default:
      return ErrorResponses.serverError();
  }
}

/**
 * HANDLE VALIDATION ERRORS
 */
export function handleValidationError(message: string): NextResponse {
  return ErrorResponses.badRequest(message);
}

/**
 * HANDLE DATABASE ERRORS
 */
export function handleDatabaseError(error: any, context = 'Database operation'): NextResponse {
  console.error(`${context} failed:`, error);
  return ErrorResponses.serverError(`Failed to ${context.toLowerCase()}`);
}
