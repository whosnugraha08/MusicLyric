import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ────────────────────────────────────────────────────────────
// Environment variables
// ────────────────────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("⚠️ Missing Supabase environment variables. Make sure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.");
}

// ────────────────────────────────────────────────────────────
// Browser client (uses anon key — respects RLS)
// Safe to use in client components and API routes.
// ────────────────────────────────────────────────────────────

export const supabase: SupabaseClient = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder",
  {
    auth: {
      persistSession: false, // single-user tool, no auth sessions
      autoRefreshToken: false,
    },
  }
);

// ────────────────────────────────────────────────────────────
// Server / Admin client (uses service_role key — bypasses RLS)
// ONLY use in API routes and server-side code.
// Never expose to the browser.
// ────────────────────────────────────────────────────────────

function createAdminClient(): SupabaseClient {
  if (!supabaseServiceRoleKey) {
    throw new Error(
      "Missing env: SUPABASE_SERVICE_ROLE_KEY — required for server-side operations"
    );
  }

  return createClient(supabaseUrl!, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/** Lazily created admin client — only instantiated on first use */
let _adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createAdminClient();
  }
  return _adminClient;
}

/**
 * @deprecated Use `getSupabaseAdmin()` instead for explicit lazy initialisation.
 * Kept as a convenience alias.
 */
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    // Lazily initialise and forward all property access
    const client = getSupabaseAdmin();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
