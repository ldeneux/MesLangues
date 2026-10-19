-- =========================================================
-- Migration 030 - Verbes par niveau (120 verbes par langue ET par niveau)
--
-- Avant : 120 verbes par langue, partages par tous les niveaux (les lecons A1 consommaient les 120).
-- Maintenant : chaque verbe appartient a un niveau (A1, A2, B1, B2) ; on telecharge 120 verbes par niveau.
-- Un meme verbe n'existe qu'une fois par langue (contrainte inchangee) : les niveaux superieurs recoivent d'AUTRES verbes.
-- La grammaire (fiches + quiz) reste commune a tous les niveaux.
--
-- Les verbes deja presents : rattaches au plus bas niveau dont une lecon les utilise, sinon A1.
-- Relancable sans risque. A lancer dans le SQL Editor de Supabase.
-- =========================================================
set search_path = langues, public;

alter table conjugation_verbs add column if not exists level_code text references levels(code);

with used as (
  select e::uuid as verb_id, l.level_code, lv.ordre
  from lessons l
  join levels lv on lv.code = l.level_code,
       jsonb_array_elements_text(l.verb_ids) e
),
best as (
  select distinct on (verb_id) verb_id, level_code from used order by verb_id, ordre
)
update conjugation_verbs v set level_code = b.level_code
from best b
where b.verb_id = v.id and v.level_code is null;

update conjugation_verbs set level_code = 'A1' where level_code is null;

create index if not exists idx_conjugation_lang_level_rank on conjugation_verbs (language_code, level_code, frequency_rank);

notify pgrst, 'reload schema';
