-- =========================================================
-- Migration 011 — ajout des langues japonais/allemand à la table de
-- référence (nécessaire : toutes les tables de contenu ont une clé
-- étrangère vers languages.code)
-- =========================================================
insert into languages (code, label, bcp47, flag_emoji) values
  ('ja', 'Japonais', 'ja-JP', '🇯🇵'),
  ('de', 'Allemand', 'de-DE', '🇩🇪')
on conflict (code) do nothing;

-- Cosmétique (cette colonne n'est lue nulle part dans le code, mais autant
-- rester cohérent avec le choix fait côté appli : anglais américain).
update languages set bcp47 = 'en-US', flag_emoji = '🇺🇸' where code = 'en';
