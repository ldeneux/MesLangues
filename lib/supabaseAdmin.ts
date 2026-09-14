import { createClient } from '@supabase/supabase-js';

// Client "admin" : à n'utiliser QUE côté serveur (routes API, cron).
// Il bypasse les policies RLS grâce à la clé service_role.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);
