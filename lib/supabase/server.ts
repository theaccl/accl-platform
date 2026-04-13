import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server Components / Route Handlers: same cookie session as middleware + browser (@supabase/ssr).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2]),
          );
        } catch {
          /* ignore when cookies are read-only */
        }
      },
    },
  });
}
