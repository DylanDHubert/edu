import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from './supabase/server';
import { cookies } from 'next/headers';

export interface AuthResult {
  user: any;
  supabase: any;
}

export interface courseMembership {
  id: string;
  course_id: string;
  user_id: string;
  role: 'manager' | 'member';
  status: 'active' | 'inactive';
  is_original_manager?: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * VERIFY USER AUTHENTICATION AND RETURN USER + SUPABASE CLIENT
 */
export async function verifyUserAuth(cookieStore: ReturnType<typeof cookies>): Promise<AuthResult> {
  const supabase = await createClient(cookieStore);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    throw new Error('UNAUTHORIZED');
  }
  
  return { user, supabase };
}

/**
 * VERIFY USER HAS ACCESS TO A course
 */
export async function verifycourseAccess(
  courseId: string, 
  userId: string, 
  requiredRole?: 'manager' | 'member'
): Promise<courseMembership> {
  const serviceClient = createServiceClient();
  
  const { data: membership, error } = await serviceClient
    .from('course_members')
    .select('*')
    .eq('course_id', courseId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (error || !membership) {
    throw new Error('course_ACCESS_DENIED');
  }

  if (requiredRole && membership.role !== requiredRole) {
    throw new Error('INSUFFICIENT_PERMISSIONS');
  }

  return membership;
}

/**
 * VERIFY USER IS AN ADMIN
 */
export async function verifyAdminAccess(userEmail: string): Promise<boolean> {
  const serviceClient = createServiceClient();
  
  const { data: adminUser, error } = await serviceClient
    .from('admin_users')
    .select('id')
    .eq('email', userEmail)
    .single();

  return !error && !!adminUser;
}

/**
 * GET SERVICE CLIENT FOR DATABASE OPERATIONS
 */
export function getServiceClient() {
  return createServiceClient();
}

/**
 * COMPLETE AUTHENTICATION FLOW WITH course ACCESS CHECK
 */
export async function authenticateWithcourseAccess(
  courseId: string,
  requiredRole?: 'manager' | 'member'
): Promise<{ user: any; membership: courseMembership; serviceClient: any }> {
  const cookieStore = cookies();
  const { user } = await verifyUserAuth(cookieStore);
  const membership = await verifycourseAccess(courseId, user.id, requiredRole);
  const serviceClient = getServiceClient();
  
  return { user, membership, serviceClient };
}

/**
 * COMPLETE AUTHENTICATION FLOW FOR ADMIN OPERATIONS
 */
export async function authenticateAsAdmin(): Promise<{ user: any; serviceClient: any }> {
  const cookieStore = cookies();
  const { user } = await verifyUserAuth(cookieStore);
  const isAdmin = await verifyAdminAccess(user.email);
  
  if (!isAdmin) {
    throw new Error('ADMIN_ACCESS_REQUIRED');
  }
  
  const serviceClient = getServiceClient();
  return { user, serviceClient };
}
