// Module pur : tirage des questions, notation et calcul de la note globale de l'examen.
// Testable avec node, sans base de données.

import { EXAM_PASS_TOTAL, EXAM_MIN_PER_EPREUVE } from './examConfig';

export type ExamQuestion = {
  id: string;
  kind: 'comprehension' | 'grammar' | 'lexicon';
  prompt: string;
  options: string[];
  correct_index: number;
};

export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Tire `count` questions en répartissant sur les thèmes (un de chaque thème d'abord, puis on recommence). */
export function pickSpread<T extends { topic_code: string }>(items: T[], count: number, rand: () => number = Math.random): T[] {
  const byTopic = new Map<string, T[]>();
  for (const it of shuffle(items, rand)) {
    const list = byTopic.get(it.topic_code) ?? [];
    list.push(it);
    byTopic.set(it.topic_code, list);
  }
  const topics = shuffle(Array.from(byTopic.keys()), rand);
  const out: T[] = [];
  let round = 0;
  while (out.length < count) {
    let added = false;
    for (const t of topics) {
      const item = byTopic.get(t)![round];
      if (item) {
        out.push(item);
        added = true;
        if (out.length >= count) break;
      }
    }
    if (!added) break;
    round++;
  }
  return out;
}

export type LexiconWord = { id: string; word_type: string | null; target_text: string; translation_fr: string };

/** Construit des QCM « Que signifie X ? » avec 3 distracteurs (de même type de mot si possible). */
export function buildLexiconQuestions(words: LexiconWord[], count: number, rand: () => number = Math.random): ExamQuestion[] {
  const usable = words.filter((w) => w.target_text?.trim() && w.translation_fr?.trim() && w.translation_fr.length <= 60);
  const pool = shuffle(usable, rand);
  const targets = pool.slice(0, count);
  const questions: ExamQuestion[] = [];

  for (const w of targets) {
    const sameType = pool.filter((x) => x.id !== w.id && x.translation_fr !== w.translation_fr && x.word_type === w.word_type);
    const others = pool.filter((x) => x.id !== w.id && x.translation_fr !== w.translation_fr && x.word_type !== w.word_type);
    const distractors: string[] = [];
    for (const x of [...sameType, ...others]) {
      if (!distractors.includes(x.translation_fr)) distractors.push(x.translation_fr);
      if (distractors.length >= 3) break;
    }
    if (distractors.length < 3) continue; // pas assez de mots pour faire un QCM propre
    const options = shuffle([w.translation_fr, ...distractors], rand);
    questions.push({
      id: `lex-${w.id}`,
      kind: 'lexicon',
      prompt: `Que signifie « ${w.target_text} » ?`,
      options,
      correct_index: options.indexOf(w.translation_fr),
    });
  }
  return questions;
}

export type GradeResult = { correct: number; total: number; score: number };

/** Une question sans réponse compte comme fausse. */
export function gradeAnswers(questions: ExamQuestion[], answers: Record<string, number | null | undefined>): GradeResult {
  const total = questions.length;
  const correct = questions.filter((q) => answers[q.id] === q.correct_index).length;
  return { correct, total, score: total > 0 ? Math.round((correct / total) * 100) : 0 };
}

export type ExamTotals = { total: number; passed: boolean; failedMinimum: boolean };

/** Note globale = moyenne des épreuves ; réussite = moyenne >= seuil ET chaque épreuve >= minimum. */
export function computeExamTotals(scores: number[]): ExamTotals {
  if (scores.length === 0) return { total: 0, passed: false, failedMinimum: false };
  const total = Math.round(scores.reduce((s, x) => s + x, 0) / scores.length);
  const failedMinimum = scores.some((s) => s < EXAM_MIN_PER_EPREUVE);
  return { total, passed: total >= EXAM_PASS_TOTAL && !failedMinimum, failedMinimum };
}
