-- =========================================================
-- Migration 031 - Remise à plat du vocabulaire : objectifs par niveau + packs cohérents
--
-- Objectif par langue (éléments NOUVEAUX à chaque niveau) :
--   A1 = 2 packs = 700 mots ; A2 = 2 packs = 700 ; B1 = 3 packs = 1050 ; B2 = 4 packs = 1400
--
-- Ce que fait la fonction rebalance_vocabulary(p_apply) pour TOUTES les langues :
--   1. RECLASSEMENT : si un niveau dépasse son objectif, les mots les MOINS utiles (usage_score le plus bas ;
--      un score absent compte pour 50 ; à égalité, les plus récents d'abord) passent au niveau suivant.
--      Cascade A1 -> A2 -> B1 -> B2 (B2 n'a pas de niveau suivant : il garde tout).
--   2. PACKS : pour chaque langue et niveau, les mots sont rangés dans des packs de 350 (anciens packs réutilisés
--      d'abord, dans l'ordre de leur numéro ; packs créés si besoin). Les mots SANS PACK sont rattachés.
--      Les mots déjà dans un pack du bon niveau restent dans leur pack autant que possible.
--   3. STATUT des packs recalculé : 350 mots = ready ; sinon generating (pending si vide).
--      Les packs vides sont supprimés.
--   Aucun mot n'est supprimé. Les ids des mots (donc la progression, les scores, l'audio) ne changent pas.
--
-- UTILISATION (SQL Editor Supabase) :
--   1) APERCU, sans rien écrire :   select * from langues.rebalance_vocabulary();
--   2) APPLIQUER quand l'aperçu te convient :   select * from langues.rebalance_vocabulary(true);
-- =========================================================
set search_path = langues, public;

create or replace function rebalance_vocabulary(p_apply boolean default false)
returns table (
  langue text,
  niveau text,
  avant int,
  apres int,
  nb_packs int,
  mots_arrives int,
  sans_pack_rattaches int
)
language plpgsql
as $fn$
declare
  v_levels text[] := array['A1', 'A2', 'B1', 'B2'];
  v_target int[]  := array[700, 700, 1050, 1400];
  v_pack_size int := 350;
  v_lang text;
  v_i int;
  v_excess int;
  r record;
  v_next int;
  v_pack uuid;
begin
  drop table if exists _rb_w;
  drop table if exists _rb_pk;

  create temp table _rb_w on commit drop as
    select w.id,
           w.language_code as lang,
           w.level_code as old_level,
           w.level_code as new_level,
           w.pack_id as old_pack,
           coalesce(w.usage_score, 50) as sc,
           w.created_at,
           null::int as new_idx
    from vocabulary_words w
    where w.level_code = any (v_levels);

  -- 1) Reclassement en cascade, langue par langue
  for v_lang in select distinct lang from _rb_w loop
    for v_i in 1..3 loop
      select count(*) - v_target[v_i]
        into v_excess
        from _rb_w
       where lang = v_lang and new_level = v_levels[v_i];

      if v_excess > 0 then
        update _rb_w
           set new_level = v_levels[v_i + 1]
         where id in (
           select id
             from _rb_w
            where lang = v_lang and new_level = v_levels[v_i]
            order by sc asc, created_at desc, id
            limit v_excess
         );
      end if;
    end loop;
  end loop;

  -- 2) Rangement en packs de 350 : packs actuels du bon niveau d'abord (par numéro), puis les autres mots
  with ranked as (
    select w.id,
           ceil(
             row_number() over (
               partition by w.lang, w.new_level
               order by coalesce(case when p.level_code = w.new_level then p.pack_number end, 9999), w.created_at, w.id
             ) / v_pack_size::numeric
           )::int as idx
      from _rb_w w
      left join vocabulary_packs p on p.id = w.old_pack
  )
  update _rb_w w
     set new_idx = ranked.idx
    from ranked
   where ranked.id = w.id;

  -- Packs nécessaires (langue, niveau, rang) et pack existant réutilisé (le n-ième par numéro) s'il y en a un
  create temp table _rb_pk on commit drop as
    select l.lang,
           l.lvl,
           j.idx,
           ep.id as pack_id
      from (select lang, new_level as lvl, max(new_idx) as k from _rb_w group by lang, new_level) l
     cross join lateral generate_series(1, l.k) as j(idx)
      left join (
        select id,
               language_code,
               level_code,
               row_number() over (partition by language_code, level_code order by pack_number) as rn
          from vocabulary_packs
      ) ep
        on ep.language_code = l.lang and ep.level_code = l.lvl and ep.rn = j.idx;

  if p_apply then
    -- Création des packs manquants (numéro = max existant + 1, sans jamais heurter la contrainte d'unicité)
    for r in select lang, lvl, idx from _rb_pk where pack_id is null order by lang, lvl, idx loop
      select coalesce(max(pack_number), 0) + 1
        into v_next
        from vocabulary_packs
       where language_code = r.lang and level_code = r.lvl;

      insert into vocabulary_packs (language_code, level_code, pack_number, target_count, status)
      values (r.lang, r.lvl, v_next, v_pack_size, 'generating')
      returning id into v_pack;

      update _rb_pk set pack_id = v_pack where lang = r.lang and lvl = r.lvl and idx = r.idx;
    end loop;

    -- Niveau + pack de chaque mot
    update vocabulary_words v
       set level_code = w.new_level,
           pack_id = pk.pack_id
      from _rb_w w
      join _rb_pk pk on pk.lang = w.lang and pk.lvl = w.new_level and pk.idx = w.new_idx
     where v.id = w.id
       and (v.level_code is distinct from w.new_level or v.pack_id is distinct from pk.pack_id);

    -- Statut et compteur de tous les packs d'après le contenu réel
    update vocabulary_packs p
       set generated_count = c.n,
           status = case
                      when c.n >= p.target_count then 'ready'
                      when c.n > 0 then 'generating'
                      else 'pending'
                    end,
           completed_at = case
                            when c.n >= p.target_count then coalesce(p.completed_at, now())
                            else null
                          end
      from (
        select p2.id, (select count(*) from vocabulary_words w2 where w2.pack_id = p2.id)::int as n
          from vocabulary_packs p2
      ) c
     where c.id = p.id;

    -- Packs vides (inutiles après le regroupement)
    delete from vocabulary_packs p
     where not exists (select 1 from vocabulary_words w where w.pack_id = p.id);
  end if;

  -- Résumé (avant / après) : calculé sur le plan, identique à l'état de la base si p_apply = true
  return query
  with lv as (
    select lang, old_level as lvl from _rb_w
    union
    select lang, new_level from _rb_w
  ),
  a as (select lang, old_level as lvl, count(*)::int as n from _rb_w group by lang, old_level),
  b as (select lang, new_level as lvl, count(*)::int as n, max(new_idx)::int as k from _rb_w group by lang, new_level),
  m as (select lang, new_level as lvl, count(*)::int as n from _rb_w where new_level <> old_level group by lang, new_level),
  o as (select lang, new_level as lvl, count(*)::int as n from _rb_w where old_pack is null group by lang, new_level)
  select lv.lang,
         lv.lvl,
         coalesce(a.n, 0),
         coalesce(b.n, 0),
         coalesce(b.k, 0),
         coalesce(m.n, 0),
         coalesce(o.n, 0)
    from lv
    left join a on a.lang = lv.lang and a.lvl = lv.lvl
    left join b on b.lang = lv.lang and b.lvl = lv.lvl
    left join m on m.lang = lv.lang and m.lvl = lv.lvl
    left join o on o.lang = lv.lang and o.lvl = lv.lvl
   order by lv.lang, lv.lvl;
end;
$fn$;

revoke all on function rebalance_vocabulary(boolean) from public, anon, authenticated;
grant execute on function rebalance_vocabulary(boolean) to service_role;

notify pgrst, 'reload schema';
