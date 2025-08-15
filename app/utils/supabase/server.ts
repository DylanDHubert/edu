
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const createClient = async (cookieStore: ReturnType<typeof cookies>) => {
  return createServerClient(
    supabaseUrl!,
    supabaseKey!,
    {
      cookies: {
        async getAll() {
          const cookieStoreResolved = await cookieStore;
          return cookieStoreResolved.getAll()
        },
        async setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          try {
            const cookieStoreResolved = await cookieStore;
            cookiesToSet.forEach(({ name, value, options }) => cookieStoreResolved.set(name, value, options))
          } catch {
            // THE `setAll` METHOD WAS CALLED FROM A SERVER COMPONENT.
            // THIS CAN BE IGNORED IF YOU HAVE MIDDLEWARE REFRESHING
            // USER SESSIONS.
          }
        },
      },
    },
  );
};

// Service role client that bypasses RLS
export const createServiceClient = () => {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase service role key');
  }
  
  return createSupabaseClient(supabaseUrl, supabaseServiceKey);
};
