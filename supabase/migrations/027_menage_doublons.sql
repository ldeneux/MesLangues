-- =========================================================
-- Migration 027 - Menage des doublons de vocabulaire (bouton " Nettoyer les doublons " de l'onglet Packs)
--
-- Reprend, sous forme de fonctions appelees par petits lots, les scripts 02a a 02d3 lances a la main :
--  * pour chaque mot present plusieurs fois dans une langue (meme mot, meme traduction a l'article pres), on GARDE la
--    ligne du niveau le plus bas et on supprime les autres (y compris les doublons dans un meme niveau) ;
--  * la progression de l'apprenant est fusionnee sur la ligne gardee ;
--  * les lignes supprimees sont copiees dans vocabulary_words_archive (rien n'est perdu) ;
--  * les fichiers audio devenus inutiles sont seulement LISTES dans audio_a_supprimer (la suppression se fait plus tard,
--    avec le bouton " Supprimer les audios en double ") ;
--  * les compteurs des packs touches sont recalcules (un pack devenu incomplet repasse " generating ").
--
-- Sans risque : relancable (les tables existantes sont conservees), aucune donnee n'est supprimee par la migration elle-meme.
-- Les fonctions sont creees dans " public " (comme les fonctions de statistiques) et lisent les tables via le
-- search_path " langues, public " : elles marchent que les tables soient dans " langues " (migration 025) ou dans " public ".
-- =========================================================
set search_path = langues, public;

-- ---------------------------------------------------------
-- Tables de travail (deja presentes si les scripts manuels ont ete lances : " if not exists ")
-- ---------------------------------------------------------
create table if not exists vocabulary_words_archive (like vocabulary_words including defaults);
alter table vocabulary_words_archive
  add column if not exists kept_id uuid,
  add column if not exists reason text,
  add column if not exists archived_at timestamptz not null default now();

create table if not exists audio_a_supprimer (
  id bigserial primary key,
  bucket text not null,
  path text not null,
  word_id uuid,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  unique (bucket, path)
);

create table if not exists menage_del (
  id uuid,
  kept_id uuid,
  language_code text,
  level_code text,
  lvl integer,
  pack_id uuid,
  audio_url text,
  created_at timestamptz,
  reason text,
  progress_done boolean not null default false
);

alter table vocabulary_words_archive enable row level security;
alter table audio_a_supprimer enable row level security;
alter table menage_del enable row level security;
grant all on vocabulary_words_archive to service_role;
grant all on audio_a_supprimer to service_role;
grant all on menage_del to service_role;
grant all on sequence audio_a_supprimer_id_seq to service_role;

-- ---------------------------------------------------------
-- Index : sans eux, supprimer des mots oblige Postgres a relire toute la table liee pour chaque mot (timeouts)
-- ---------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tbl, a.attname as col, c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'vocabulary_words'::regclass
      and array_length(c.conkey, 1) = 1
      and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = a.attnum)
  loop
    execute format('create index if not exists %I on %s (%I)', 'idx_menage_' || r.conname, r.tbl, r.col);
  end loop;
end $$;

create index if not exists idx_menage_del_id on menage_del (id);
create index if not exists idx_menage_del_lang on menage_del (language_code);
create index if not exists idx_menage_archive_id on vocabulary_words_archive (id);
create index if not exists idx_vocab_words_lang_level_theme on vocabulary_words (language_code, level_code, theme_code);

-- ---------------------------------------------------------
-- 1) Les mots a supprimer pour une langue (lecture seule) et celui qu'on garde pour chacun
--    Cle de doublon : texte normalise + traduction francaise sans article ni accents.
-- ---------------------------------------------------------
create or replace function public.menage_candidats(p_lang text)
returns table (
  id uuid, kept_id uuid, language_code text, level_code text, lvl integer,
  pack_id uuid, audio_url text, created_at timestamptz, reason text
)
language sql
stable
security definer
set search_path = langues, public
as $$
  with plan_ids as (
    select jsonb_array_elements_text(noun_ids) as id from lessons
    union select jsonb_array_elements_text(adjective_ids) from lessons
    union select jsonb_array_elements_text(other_ids) from lessons
    union select jsonb_array_elements_text(phrase_ids) from lessons
    union select e->>'id' from lessons, jsonb_array_elements(review) e where e->>'k' = 'w'
  ),
  v as (
    select w.id, w.language_code, w.level_code, lv.ordre as lvl, w.pack_id, w.target_text, w.translation_fr, w.audio_url, w.created_at,
           lower(btrim(regexp_replace(translate(w.target_text, U&'\2019', ''''), '\s+', ' ', 'g'))) as tkey,
           btrim(regexp_replace(regexp_replace(translate(lower(btrim(w.translation_fr)),
                 U&'\00E0\00E2\00E4\00E1\00E3\00E9\00E8\00EA\00EB\00ED\00EC\00EE\00EF\00F3\00F2\00F4\00F6\00F5\00FA\00F9\00FB\00FC\00E7\00F1\2019',
                 'aaaaaeeeeiiiiooooouuuucn'''),
                 '^(de la|de l|du|des|le|la|les|l|un|une|d)( |'''')', ''), '[^a-z0-9]+', ' ', 'g')) as trkey,
           exists (select 1 from plan_ids p where p.id = w.id::text) as in_plan
    from vocabulary_words w
    join levels lv on lv.code = w.level_code
    where w.language_code = p_lang
  ),
  ranked as (
    select v.*,
           row_number()  over (partition by tkey, trkey order by lvl, in_plan desc, (audio_url is not null) desc, created_at, id) as rn,
           first_value(id)         over (partition by tkey, trkey order by lvl, in_plan desc, (audio_url is not null) desc, created_at, id) as kept_id,
           first_value(level_code) over (partition by tkey, trkey order by lvl, in_plan desc, (audio_url is not null) desc, created_at, id) as kept_level
    from v
    where tkey <> ''
  )
  select ranked.id, ranked.kept_id, ranked.language_code, ranked.level_code, ranked.lvl, ranked.pack_id, ranked.audio_url, ranked.created_at,
         case when ranked.level_code <> ranked.kept_level then 'deja vu a un niveau plus bas' else 'doublon dans le meme niveau' end
  from ranked
  where rn > 1;
$$;

-- Apercu (aucune ecriture) : combien de mots seraient supprimes, par motif.
create or replace function public.menage_apercu(p_lang text)
returns table (motif text, nb bigint)
language sql
stable
security definer
set search_path = langues, public
as $$
  select c.reason, count(*) from public.menage_candidats(p_lang) c group by c.reason;
$$;

-- ---------------------------------------------------------
-- 2) Preparation : remplit la table de travail (rejouable ; une fusion de progression deja faite n'est jamais refaite)
-- ---------------------------------------------------------
create or replace function public.menage_preparer(p_lang text)
returns bigint
language plpgsql
security definer
set search_path = langues, public
as $$
declare n bigint;
begin
  drop table if exists _cand;
  create temp table _cand on commit drop as select * from public.menage_candidats(p_lang);

  -- lignes de travail qui ne sont plus a supprimer (mot deja supprime, ou plus en doublon)
  delete from menage_del m where m.language_code = p_lang and not exists (select 1 from _cand c where c.id = m.id);

  -- lignes deja connues : on met a jour la ligne gardee, SANS toucher a progress_done
  update menage_del m set kept_id = c.kept_id, reason = c.reason, lvl = c.lvl, pack_id = c.pack_id, audio_url = c.audio_url
  from _cand c where c.id = m.id;

  -- nouvelles lignes
  insert into menage_del (id, kept_id, language_code, level_code, lvl, pack_id, audio_url, created_at, reason, progress_done)
  select c.id, c.kept_id, c.language_code, c.level_code, c.lvl, c.pack_id, c.audio_url, c.created_at, c.reason, false
  from _cand c where not exists (select 1 from menage_del m where m.id = c.id);

  select count(*) into n from menage_del where language_code = p_lang;
  return n;
end $$;

-- ---------------------------------------------------------
-- 3) Fusion de la progression, par lot (renvoie combien de lignes restent a traiter)
-- ---------------------------------------------------------
create or replace function public.menage_progression(p_lang text, p_limit integer default 500)
returns bigint
language plpgsql
security definer
set search_path = langues, public
as $$
declare n bigint;
begin
  with lot as (
    select d.id, d.kept_id from menage_del d
    where d.language_code = p_lang and d.progress_done = false
    order by d.id limit p_limit
  ),
  agg as (
    select p.profile_id, l.kept_id, sum(p.success_count)::int as s, sum(p.fail_count)::int as f, max(p.last_practiced_at) as lp
    from vocabulary_progress p join lot l on l.id = p.word_id
    group by p.profile_id, l.kept_id
  ),
  ins as (
    insert into vocabulary_progress (profile_id, word_id, success_count, fail_count, last_practiced_at)
    select a.profile_id, a.kept_id, a.s, a.f, a.lp from agg a
    on conflict (profile_id, word_id) do update set
      success_count = vocabulary_progress.success_count + excluded.success_count,
      fail_count = vocabulary_progress.fail_count + excluded.fail_count,
      last_practiced_at = greatest(vocabulary_progress.last_practiced_at, excluded.last_practiced_at)
    returning 1
  )
  update menage_del m set progress_done = true from lot where m.id = lot.id;

  select count(*) into n from menage_del where language_code = p_lang and progress_done = false;
  return n;
end $$;

-- ---------------------------------------------------------
-- 4) Archivage par lot + reprise de l'audio si la ligne gardee n'en a pas (renvoie combien restent a archiver)
-- ---------------------------------------------------------
create or replace function public.menage_archiver(p_lang text, p_limit integer default 300)
returns bigint
language plpgsql
security definer
set search_path = langues, public
as $$
declare
  cols text;
  pre text;
  r record;
  n bigint;
begin
  -- colonnes ajoutees plus tard a vocabulary_words (ex. " image ") : on les ajoute aussi a l'archive
  for r in
    select a.attname, format_type(a.atttypid, a.atttypmod) as typ
    from pg_attribute a
    where a.attrelid = 'vocabulary_words'::regclass and a.attnum > 0 and not a.attisdropped
      and not exists (
        select 1 from pg_attribute b
        where b.attrelid = 'vocabulary_words_archive'::regclass and b.attname = a.attname and not b.attisdropped
      )
  loop
    execute format('alter table vocabulary_words_archive add column %I %s', r.attname, r.typ);
  end loop;

  select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into cols
  from pg_attribute a where a.attrelid = 'vocabulary_words'::regclass and a.attnum > 0 and not a.attisdropped;
  pre := 'w.' || replace(cols, ', ', ', w.');

  execute format(
    'insert into vocabulary_words_archive (%s, kept_id, reason, archived_at) '
    'select %s, d.kept_id, d.reason, now() from vocabulary_words w '
    'join (select m.id, m.kept_id, m.reason from menage_del m where m.language_code = %L '
    '      and exists (select 1 from vocabulary_words x where x.id = m.id) '
    '      and not exists (select 1 from vocabulary_words_archive a where a.id = m.id) '
    '      order by m.id limit %s) d on d.id = w.id',
    cols, pre, p_lang, p_limit);

  -- si la ligne gardee n'a pas d'audio, on reprend celui d'un doublon
  update vocabulary_words k set audio_url = s.audio_url
  from (
    select distinct on (d.kept_id) d.kept_id, d.audio_url
    from menage_del d
    where d.language_code = p_lang and d.audio_url is not null
    order by d.kept_id, d.lvl, d.created_at, d.id
  ) s
  where k.id = s.kept_id and k.audio_url is null;

  select count(*) into n from menage_del m
  where m.language_code = p_lang
    and exists (select 1 from vocabulary_words x where x.id = m.id)
    and not exists (select 1 from vocabulary_words_archive a where a.id = m.id);
  return n;
end $$;

-- ---------------------------------------------------------
-- 5) Suppression par lot (uniquement des mots deja archives ; renvoie combien restent a supprimer)
-- ---------------------------------------------------------
create or replace function public.menage_supprimer(p_lang text, p_limit integer default 300)
returns bigint
language plpgsql
security definer
set search_path = langues, public
as $$
declare n bigint;
begin
  with lot as (
    select d.id from menage_del d
    join vocabulary_words w on w.id = d.id
    where d.language_code = p_lang
      and exists (select 1 from vocabulary_words_archive a where a.id = d.id)
    order by d.id limit p_limit
  )
  delete from vocabulary_words w using lot where w.id = lot.id;

  select count(*) into n from menage_del d join vocabulary_words w on w.id = d.id where d.language_code = p_lang;
  return n;
end $$;

-- ---------------------------------------------------------
-- 6) Fin : liste des audios devenus inutiles + compteurs des packs, puis la table de travail de la langue est videe
--    Renvoie (mots supprimes, audios listes en attente).
-- ---------------------------------------------------------
create or replace function public.menage_finaliser(p_lang text)
returns table (mots_supprimes bigint, audios_en_attente bigint)
language plpgsql
security definer
set search_path = langues, public
as $$
declare
  n_del bigint;
  n_left bigint;
begin
  select count(*) into n_left from menage_del d join vocabulary_words w on w.id = d.id where d.language_code = p_lang;
  if n_left > 0 then
    raise exception 'Il reste % mot(s) a supprimer : relance l''etape de suppression avant de finaliser.', n_left;
  end if;

  select count(*) into n_del from menage_del where language_code = p_lang;

  with restants as (
    select substring(k.audio_url from '/object/public/([^/]+)/') as bucket,
           split_part(substring(k.audio_url from '/object/public/[^/]+/(.*)$'), '?', 1) as path
    from vocabulary_words k
    where k.audio_url is not null and k.language_code = p_lang
  ),
  candidats as (
    select a.id,
           substring(a.audio_url from '/object/public/([^/]+)/') as bucket,
           split_part(substring(a.audio_url from '/object/public/[^/]+/(.*)$'), '?', 1) as path
    from vocabulary_words_archive a
    join menage_del d on d.id = a.id
    where d.language_code = p_lang and a.audio_url is not null
  )
  insert into audio_a_supprimer (bucket, path, word_id)
  select c.bucket, c.path, min(c.id::text)::uuid
  from candidats c
  left join restants r on r.bucket = c.bucket and r.path = c.path
  where c.bucket is not null and c.path <> '' and r.path is null
  group by c.bucket, c.path
  on conflict (bucket, path) do nothing;

  update vocabulary_packs p set
    generated_count = c.n,
    status = case when c.n >= p.target_count then p.status else 'generating' end,
    completed_at = case when c.n >= p.target_count then p.completed_at else null end
  from (
    select p2.id, count(w.id) as n
    from vocabulary_packs p2
    left join vocabulary_words w on w.pack_id = p2.id
    where p2.id in (select distinct d.pack_id from menage_del d where d.language_code = p_lang and d.pack_id is not null)
    group by p2.id
  ) c
  where c.id = p.id;

  delete from menage_del where language_code = p_lang;

  return query select n_del, (select count(*) from audio_a_supprimer where done_at is null);
end $$;

-- ---------------------------------------------------------
-- Droits : seul le service_role (cle serveur de l'appli) peut appeler ces fonctions.
-- ATTENTION Indispensable : sur Supabase, les fonctions du schema public sont appelables par defaut par " anon " (cle publique du
-- navigateur) ; ces fonctions suppriment des donnees, on retire donc explicitement ce droit a anon et authenticated.
-- ---------------------------------------------------------
revoke all on function public.menage_candidats(text) from public, anon, authenticated;
revoke all on function public.menage_apercu(text) from public, anon, authenticated;
revoke all on function public.menage_preparer(text) from public, anon, authenticated;
revoke all on function public.menage_progression(text, integer) from public, anon, authenticated;
revoke all on function public.menage_archiver(text, integer) from public, anon, authenticated;
revoke all on function public.menage_supprimer(text, integer) from public, anon, authenticated;
revoke all on function public.menage_finaliser(text) from public, anon, authenticated;

grant execute on function public.menage_candidats(text) to service_role;
grant execute on function public.menage_apercu(text) to service_role;
grant execute on function public.menage_preparer(text) to service_role;
grant execute on function public.menage_progression(text, integer) to service_role;
grant execute on function public.menage_archiver(text, integer) to service_role;
grant execute on function public.menage_supprimer(text, integer) to service_role;
grant execute on function public.menage_finaliser(text) to service_role;

notify pgrst, 'reload schema';
