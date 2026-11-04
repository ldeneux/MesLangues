-- Packs « extension » (packs thématiques ajoutés hors parcours, status = 'extension') : le ménage des doublons ne doit pas les repasser
-- en « generating » (ce qui cacherait leurs mots). On recrée uniquement la fonction concernée avec cette protection.
set search_path = public, langues;

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
    status = case when c.n >= p.target_count or p.status = 'extension' then p.status else 'generating' end, -- une extension garde son statut
    completed_at = case when c.n >= p.target_count or p.status = 'extension' then p.completed_at else null end
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
