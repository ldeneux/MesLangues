-- =========================================================
-- Migration 022 — Images des noms (Fluent Emoji)
--  * vocabulary_words.emoji : l'emoji qui illustre le mot
--      NULL = pas encore traité ; '' = traité, aucun emoji ne convient
-- =========================================================
alter table vocabulary_words add column if not exists emoji text;
create index if not exists idx_vocab_words_emoji on vocabulary_words(language_code, level_code, word_type, emoji);
notify pgrst, 'reload schema';
