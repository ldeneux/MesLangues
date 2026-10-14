-- Suppression de packs / questions déjà jouées : les clés étrangères vers `questions` bloquaient la suppression
-- (« games_current_question_id_fkey »). À exécuter une fois dans l'éditeur SQL de Supabase.

-- La partie qui avait cette question « en cours » l'oublie simplement
alter table games drop constraint if exists games_current_question_id_fkey;
alter table games
  add constraint games_current_question_id_fkey
  foreign key (current_question_id) references questions(id) on delete set null;

-- Les réponses données à une question supprimée disparaissent avec elle
alter table answers drop constraint if exists answers_question_id_fkey;
alter table answers
  add constraint answers_question_id_fkey
  foreign key (question_id) references questions(id) on delete cascade;

notify pgrst, 'reload schema';
