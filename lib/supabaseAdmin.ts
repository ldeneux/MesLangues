import { createClient } from '@supabase/supabase-js';
import { DB_SCHEMA } from './dbSchema';

// Client "admin" : à n'utiliser QUE côté serveur (routes API, cron).
// Il bypasse les policies RLS grâce à la clé service_role.
// Les tables sont cherchées dans le schéma DB_SCHEMA (« public » par défaut, « langues » après la migration 025).
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false }, db: { schema: DB_SCHEMA } }
);
