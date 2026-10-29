-- Mots favoris : chaque profil peut marquer des mots du vocabulaire (étoile) et filtrer la liste dessus.
set search_path = langues, public;

create table if not exists vocabulary_favorites (
  profile_id uuid not null references user_profiles(id) on delete cascade,
  word_id uuid not null references vocabulary_words(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, word_id)
);

alter table vocabulary_favorites enable row level security;
create policy "server manages vocabulary favorites" on vocabulary_favorites for all using (true) with check (true);
