-- =========================================================
-- Migration 006 — audio de conjugaison, banque de vocabulaire,
-- scoring de maîtrise (mode Jeu)
-- =========================================================

-- Un audio par temps (pas par forme) : {"present": "url", "futur": "url", ...}
alter table conjugation_verbs add column if not exists tense_audio jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------
-- Banque de mots de vocabulaire (distincte des phrases) : un mot/une
-- expression, avec article inclus quand ça a du sens ("una sedia"), sa
-- nature, son thème, son niveau, son audio.
-- ---------------------------------------------------------
create table if not exists vocabulary_words (
  id uuid primary key default gen_random_uuid(),
  language_code text not null references languages(code),
  level_code text not null references levels(code),
  theme_code text not null,
  word_type text not null, -- nom | adjectif | adverbe | expression
  target_text text not null,
  translation_fr text not null,
  audio_url text,
  created_at timestamptz not null default now()
);

alter table vocabulary_words enable row level security;
create policy "read vocabulary words" on vocabulary_words for select using (true);
create policy "server manages vocabulary words" on vocabulary_words for all using (true) with check (true);

create index if not exists idx_vocab_words_lang_level on vocabulary_words(language_code, level_code);
create index if not exists idx_vocab_words_theme on vocabulary_words(theme_code);
create index if not exists idx_vocab_words_type on vocabulary_words(word_type);

-- ---------------------------------------------------------
-- Score par profil, pour le mode Jeu : combien de fois trouvé / raté.
-- "Acquis" = calculé côté appli (>= 5 tentatives et >= 90% de réussite).
-- ---------------------------------------------------------
create table if not exists vocabulary_progress (
  profile_id uuid not null references user_profiles(id) on delete cascade,
  word_id uuid not null references vocabulary_words(id) on delete cascade,
  success_count int not null default 0,
  fail_count int not null default 0,
  last_practiced_at timestamptz,
  primary key (profile_id, word_id)
);

alter table vocabulary_progress enable row level security;
create policy "server manages vocabulary progress" on vocabulary_progress for all using (true) with check (true);

-- Même principe pour les verbes, puisque le mode Jeu pioche aussi dedans.
create table if not exists conjugation_progress (
  profile_id uuid not null references user_profiles(id) on delete cascade,
  verb_id uuid not null references conjugation_verbs(id) on delete cascade,
  success_count int not null default 0,
  fail_count int not null default 0,
  last_practiced_at timestamptz,
  primary key (profile_id, verb_id)
);

alter table conjugation_progress enable row level security;
create policy "server manages conjugation progress" on conjugation_progress for all using (true) with check (true);
