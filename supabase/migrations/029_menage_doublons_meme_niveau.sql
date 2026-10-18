-- =========================================================
-- Migration 029 - Menage des doublons : on ne supprime plus que les doublons d'un MEME niveau
--
-- Nouvelle regle de generation du vocabulaire : un mot n'est refuse que s'il existe deja au meme niveau ou a un
-- niveau inferieur (B1 refuse si present en A1/A2/B1 ; A1 accepte meme si present en A2/B1/B2). Un mot peut donc
-- legitimement exister a deux niveaux (ex. A1 et B1).
-- La migration 027 supprimait tout doublon entre niveaux en gardant le niveau le plus bas : elle aurait efface les
-- copies B1 des mots ajoutes ensuite en A1 et vide les packs B1. Ici le groupe de doublons est (niveau + mot +
-- traduction a l'article pres) : seuls les doublons dans le meme niveau sont proposes a la suppression.
--
-- Relancable sans risque (create or replace), ne supprime aucune donnee par elle-meme. A lancer dans le SQL Editor de Supabase.
-- =========================================================
set search_path = langues, public;

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
           row_number()  over (partition by level_code, tkey, trkey order by lvl, in_plan desc, (audio_url is not null) desc, created_at, id) as rn,
           first_value(id)         over (partition by level_code, tkey, trkey order by lvl, in_plan desc, (audio_url is not null) desc, created_at, id) as kept_id,
           first_value(level_code) over (partition by level_code, tkey, trkey order by lvl, in_plan desc, (audio_url is not null) desc, created_at, id) as kept_level
    from v
    where tkey <> ''
  )
  select ranked.id, ranked.kept_id, ranked.language_code, ranked.level_code, ranked.lvl, ranked.pack_id, ranked.audio_url, ranked.created_at,
         case when ranked.level_code <> ranked.kept_level then 'deja vu a un niveau plus bas' else 'doublon dans le meme niveau' end
  from ranked
  where rn > 1;
$$;


revoke all on function public.menage_candidats(text) from public, anon, authenticated;
grant execute on function public.menage_candidats(text) to service_role;

notify pgrst, 'reload schema';
