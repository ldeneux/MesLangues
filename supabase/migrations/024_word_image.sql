-- =========================================================
-- Migration 024 — Images des mots (fichiers .webp déposés dans public/image_webp)
--  * vocabulary_words.image : nom du fichier image SANS extension (ex. « un_fromage » → public/image_webp/un_fromage.webp)
--      = slug de la traduction française, article compris (voir lib/imageName.ts) ; NULL = pas encore calculé.
--  La colonne « emoji » (migration 022) n'est plus utilisée ; elle est conservée telle quelle (rien n'est supprimé).
-- =========================================================
alter table vocabulary_words add column if not exists image text;
create index if not exists idx_vocab_words_image on vocabulary_words(language_code, level_code, image);
notify pgrst, 'reload schema';
