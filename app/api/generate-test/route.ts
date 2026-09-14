import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

const MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const LANGUAGE_NAMES: Record<string, string> = { it: 'italien', es: 'espagnol', en: 'anglais' };

export async function GET(req: NextRequest) {
  const secretParam = req.nextUrl.searchParams.get('secret');
  const expected = process.env.CRON_SECRET;
  if (expected && secretParam !== expected) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const language = req.nextUrl.searchParams.get('language');
  const level = req.nextUrl.searchParams.get('level') ?? 'A1';
  const nbQuestions = Number(req.nextUrl.searchParams.get('count') ?? 15);

  if (!language) return NextResponse.json({ error: 'Paramètre "language" requis' }, { status: 400 });
  const langName = LANGUAGE_NAMES[language] ?? language;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY manquant' }, { status: 500 });

  const system = `Tu es un examinateur créant des tests de niveau CECRL pour le ${langName}.
Réponds STRICTEMENT en JSON valide, sans texte autour, sous la forme d'un tableau
d'objets ayant exactement les clés :
- "question" (string, en français ou avec la phrase en ${langName} à compléter/traduire)
- "choices" (tableau de 4 chaînes)
- "correct_index" (entier, 0 à 3)
- "explanation" (string courte)`;

  const user = `Génère ${nbQuestions} questions de QCM pour évaluer si un apprenant a le niveau
${level} en ${langName} (grammaire, vocabulaire courant, compréhension de phrases simples).
Difficulté strictement calibrée sur le niveau ${level} du CECRL, pas plus facile ni plus dur.`;

  const geminiRes = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0.7, responseMimeType: 'application/json' },
    }),
  });

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    return NextResponse.json({ error: `Gemini a échoué: ${errText}` }, { status: 500 });
  }

  const geminiJson = await geminiRes.json();
  const text = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return NextResponse.json({ error: 'Réponse Gemini vide' }, { status: 500 });

  let questions;
  try {
    questions = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'JSON invalide reçu de Gemini' }, { status: 500 });
  }

  const { data: test, error: testError } = await supabaseAdmin
    .from('level_tests')
    .insert({
      language_code: language,
      level_code: level,
      title: `Test de niveau ${level} — ${langName}`,
      generation_model: MODEL,
    })
    .select()
    .single();

  if (testError) return NextResponse.json({ error: testError.message }, { status: 500 });

  const rows = questions.map((q: any, i: number) => ({
    level_test_id: test.id,
    question: q.question,
    choices: q.choices,
    correct_index: q.correct_index,
    explanation: q.explanation ?? null,
    position: i + 1,
  }));

  const { error: qError } = await supabaseAdmin.from('level_test_questions').insert(rows);
  if (qError) return NextResponse.json({ error: qError.message }, { status: 500 });

  return NextResponse.json({ level_test_id: test.id, questions: rows.length });
}
