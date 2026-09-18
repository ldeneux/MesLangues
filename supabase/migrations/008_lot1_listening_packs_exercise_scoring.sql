-- =========================================================
-- Migration 008 — Lot 1 : Écoute en packs (articles + banque de
-- questions), scoring Exercice
-- =========================================================

-- ---------------------------------------------------------
-- Packs d'articles (même principe que phrases/vocabulaire) : ~100
-- articles par niveau, thèmes variés, générés en une fois avec
-- confirmation de coût. Chaque article a sa propre banque de 25
-- questions, tirées aléatoirement (5 à la fois) pour ne jamais rejouer
-- le même quiz.
-- ---------------------------------------------------------
create table if not exists listening_packs (
  id uuid primary key default gen_random_uuid(),
  language_code text not null references languages(code),
  level_code text not null references levels(code),
  pack_number int not null,
  target_count int not null default 100,
  status text not null default 'pending',
  generated_count int not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (language_code, level_code, pack_number)
);

alter table listening_packs enable row level security;
create policy "read listening packs" on listening_packs for select using (true);
create policy "server manages listening packs" on listening_packs for all using (true) with check (true);

alter table listening_articles add column if not exists pack_id uuid references listening_packs(id) on delete cascade;
create index if not exists idx_listening_articles_pack on listening_articles(pack_id);

-- La banque de questions par article passe de 3 à 25 — le schéma
-- (listening_questions) ne change pas, juste le volume généré.

-- ---------------------------------------------------------
-- Scoring Exercice (phrases à trous), même principe que
-- vocabulary_progress : succès/échec par phrase et par profil.
-- ---------------------------------------------------------
create table if not exists exercise_progress (
  profile_id uuid not null references user_profiles(id) on delete cascade,
  phrase_id uuid not null references phrases(id) on delete cascade,
  success_count int not null default 0,
  fail_count int not null default 0,
  last_practiced_at timestamptz,
  primary key (profile_id, phrase_id)
);

alter table exercise_progress enable row level security;
create policy "server manages exercise progress" on exercise_progress for all using (true) with check (true);
