import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from './supabase/server';
import { cookies } from 'next/headers';

export interface AuthResult {
  user: any;
  supabase: any;
}

export interface TeamMembership {
  id: string;
  team_id: string;
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
 * VERIFY USER HAS ACCESS TO A TEAM
 */
export async function verifyTeamAccess(
  teamId: string, 
  userId: string, 
  requiredRole?: 'manager' | 'member'
): Promise<TeamMembership> {
  const serviceClient = createServiceClient();
  
  const { data: membership, error } = await serviceClient
    .from('team_members')
    .select('*')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (error || !membership) {
    throw new Error('TEAM_ACCESS_DENIED');
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
 * COMPLETE AUTHENTICATION FLOW WITH TEAM ACCESS CHECK
 */
export async function authenticateWithTeamAccess(
  teamId: string,
  requiredRole?: 'manager' | 'member'
): Promise<{ user: any; membership: TeamMembership; serviceClient: any }> {
  const cookieStore = cookies();
  const { user } = await verifyUserAuth(cookieStore);
  const membership = await verifyTeamAccess(teamId, user.id, requiredRole);
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
