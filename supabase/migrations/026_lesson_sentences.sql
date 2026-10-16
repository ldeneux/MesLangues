-- =========================================================
-- Migration 026 — Phrases d'exemple générées pour les leçons
--  * lesson_sentences : phrases écrites pour une leçon (avec les mots de la leçon) quand les packs de phrases n'en
--    contiennent pas assez ; texte + traduction + audio. Les phrases des packs, elles, restent dans « phrases ».
--  La table est créée dans le MÊME schéma que « lessons » (public, ou langues si la migration 025 est déjà passée),
--  donc cette migration peut être lancée avant ou après la 025.
-- =========================================================
do $$
declare sch text;
begin
  select n.nspname into sch
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relname = 'lessons' and c.relkind = 'r' and n.nspname in ('langues', 'public')
  order by (n.nspname = 'langues') desc
  limit 1;
  if sch is null then
    raise exception 'La table « lessons » est introuvable : exécute d''abord la migration 020.';
  end if;

  execute format($f$
    create table if not exists %1$I.lesson_sentences (
      id uuid primary key default gen_random_uuid(),
      lesson_id uuid not null references %1$I.lessons(id) on delete cascade,
      position int not null,
      target_text text not null,
      translation_fr text not null,
      audio_url text,
      created_at timestamptz not null default now(),
      unique (lesson_id, position)
    )$f$, sch);

  execute format('alter table %I.lesson_sentences enable row level security', sch);
  execute format('drop policy if exists "server manages lesson sentences" on %I.lesson_sentences', sch);
  execute format('create policy "server manages lesson sentences" on %I.lesson_sentences for all using (true) with check (true)', sch);
  if sch = 'langues' then
    execute 'grant all on langues.lesson_sentences to service_role';
  end if;
  raise notice 'lesson_sentences créée dans le schéma %', sch;
end $$;

notify pgrst, 'reload schema';
