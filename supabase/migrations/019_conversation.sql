-- =========================================================
-- Migration 019 — Conversation notée (séances + historique)
-- =========================================================
create table if not exists conversation_results (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references user_profiles(id) on delete cascade,
  language_code text not null references languages(code),
  level_code text not null references levels(code),
  theme_code text not null,              -- code du scénario, 'free' ou 'custom'
  theme_label text not null,             -- libellé affiché (ou sujet saisi par l'apprenant)
  transcript jsonb not null,             -- [{speaker, text, text_fr?, correction?, errors?}]
  score int not null,                    -- 0-100, calculé par le code
  criteria jsonb,
  errors jsonb,
  penalties jsonb,
  objectives jsonb,                      -- [{label, covered}]
  feedback_fr text not null,
  user_turns int not null,
  cost_usd numeric(10, 5) not null default 0, -- coût Gemini réel mesuré de la séance
  rubric_version text,
  created_at timestamptz not null default now()
);

alter table conversation_results enable row level security;
create policy "server manages conversation results" on conversation_results for all using (true) with check (true);

create index if not exists idx_conversation_results_profile on conversation_results(profile_id, language_code, level_code, created_at desc);

notify pgrst, 'reload schema';
