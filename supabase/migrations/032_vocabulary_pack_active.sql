-- Packs de vocabulaire activables : un pack inactif n'apparaît ni dans la liste de vocabulaire, ni dans les jeux,
-- les leçons, les scores ou l'examen. Par défaut : les packs « attendus » du niveau sont actifs (A1 et A2 : packs 1 à 4,
-- B1 et B2 : packs 1 à 5), les autres sont inactifs (optionnels).
set search_path = langues, public;

alter table vocabulary_packs add column if not exists active boolean not null default true;

update vocabulary_packs
set active = (pack_number <= case level_code when 'A1' then 4 when 'A2' then 4 else 5 end);
