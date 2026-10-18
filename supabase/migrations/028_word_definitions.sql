-- =========================================================
-- Migration 028 — Définitions des mots (jeu de mots croisés, indice « Définition »)
--  * word_definitions : une définition par mot du vocabulaire, tirée de Wikipédia (français) puis traduite dans la
--    langue apprise par Gemini, mise en cache pour ne jamais être retraduite (coût payé une seule fois par mot).
--  * definition = '' : Wikipédia n'a rien d'exploitable pour ce mot (page absente, page d'homonymie…) ; on ne réessaie pas,
--    le jeu retombe alors sur l'indice « traduction ».
--  La table est créée dans le MÊME schéma que « vocabulary_words » (public, ou langues si la migration 025 est passée),
--  donc cette migration peut être lancée avant ou après la 025. Relançable sans danger.
-- =========================================================
do $$
declare sch text;
begin
  select n.nspname into sch
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relname = 'vocabulary_words' and c.relkind = 'r' and n.nspname in ('langues', 'public')
  order by (n.nspname = 'langues') desc
  limit 1;
  if sch is null then
    raise exception 'La table « vocabulary_words » est introuvable : exécute d''abord la migration 006.';
  end if;

  execute format($f$
    create table if not exists %1$I.word_definitions (
      word_id uuid primary key references %1$I.vocabulary_words(id) on delete cascade,
      definition text not null default '',
      source_url text,
      created_at timestamptz not null default now()
    )$f$, sch);

  execute format('alter table %I.word_definitions enable row level security', sch);
  execute format('drop policy if exists "server manages word definitions" on %I.word_definitions', sch);
  execute format('create policy "server manages word definitions" on %I.word_definitions for all using (true) with check (true)', sch);
  if sch = 'langues' then
    execute 'grant all on langues.word_definitions to service_role';
  end if;
  raise notice 'word_definitions créée dans le schéma %', sch;
end $$;

notify pgrst, 'reload schema';
