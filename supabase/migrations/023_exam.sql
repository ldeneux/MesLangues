-- =========================================================
-- Migration 023 — Examen blanc (épreuves, pause/reprise, historique)
-- =========================================================
create table if not exists exam_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references user_profiles(id) on delete cascade,
  language_code text not null references languages(code),
  level_code text not null references levels(code),
  status text not null default 'in_progress', -- in_progress | done | abandoned
  epreuves jsonb not null,                     -- liste des épreuves : statut, contenu tiré, score, durée
  current_index int not null default 0,        -- épreuve suivante à passer
  total_score int,                             -- 0-100, moyenne des épreuves (quand l'examen est terminé)
  passed boolean,
  seconds_used int not null default 0,         -- temps passé dans les épreuves (les pauses ne comptent pas)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

alter table exam_sessions enable row level security;
create policy "server manages exam sessions" on exam_sessions for all using (true) with check (true);

create index if not exists idx_exam_sessions_profile on exam_sessions(profile_id, language_code, level_code, created_at desc);

notify pgrst, 'reload schema';
