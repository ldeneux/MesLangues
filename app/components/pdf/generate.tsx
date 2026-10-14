'use client';

import React from 'react';
import { getLesson, type LessonContent } from '../../../lib/lessons';
import { getJapaneseReadings, type JaReading } from '../../../lib/japaneseReadings';
import { loadKanjiPaths } from '../kanjiPaths';
import { LANGS, LEVELS } from '../../../lib/constants';
import { imageUrl } from '../../../lib/imageName';
import type { PdfContext } from './LessonsDocument';

// Fabrication des PDF dans le navigateur : un vrai PDF vectoriel (texte sélectionnable, polices intégrées), pas une impression
// de la page. Rien ne passe par le serveur de calcul : seules les données des leçons sont lues. Les gros modules
// (@react-pdf/renderer, polices) ne sont chargés qu'au clic.

export type PdfOptions = {
  profileId: string;
  languageCode: string;
  levelCode: string;
  furigana: boolean;
  romaji: boolean;
  onProgress?: (message: string) => void;
};

// .webp → JPEG (le moteur PDF ne lit pas le WebP), fond blanc (comme la page), 480 px de large au plus
async function webpToJpeg(url: string, maxWidth = 480): Promise<string | null> {
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, maxWidth / img.naturalWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const c = canvas.getContext('2d');
    if (!c) return null;
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.86);
  } catch {
    return null;
  }
}

async function inBatches<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

const slug = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

function baseContext(o: PdfOptions): PdfContext {
  const lang = LANGS.find((l) => l.code === o.languageCode);
  const level = LEVELS.find((l) => l.code === o.levelCode);
  return {
    languageCode: o.languageCode,
    languageLabel: lang?.label ?? o.languageCode,
    levelCode: o.levelCode,
    levelColor: level?.color ?? '#8b7fd6',
    furigana: o.furigana,
    romaji: o.romaji,
    readings: {},
    images: {},
    kanjiPaths: {},
  };
}

async function loadPdfLibs() {
  const [pdfLib, doc, fonts] = await Promise.all([import('@react-pdf/renderer'), import('./LessonsDocument'), import('./pdfFonts')]);
  fonts.registerPdfFonts(pdfLib.Font, '/fonts');
  return { pdf: pdfLib.pdf, ...doc };
}

/** PDF d'une ou plusieurs leçons (numéros dans l'ordre voulu). */
export async function downloadLessonsPdf(o: PdfOptions & { numbers: number[] }): Promise<void> {
  const say = o.onProgress ?? (() => {});
  const ctx = baseContext(o);

  // 1) contenu des leçons
  const lessons: LessonContent[] = [];
  for (const n of o.numbers) {
    say(`Lecture de la leçon ${n}…`);
    const r = await getLesson(o.profileId, o.languageCode, o.levelCode, n);
    if (!r.ok) throw new Error((r as { error: string }).error);
    lessons.push((r as { data: LessonContent }).data);
  }

  // 2) japonais : furigana et rōmaji des mots (lectures déjà en cache pour la plupart)
  if (o.languageCode === 'ja' && (o.furigana || o.romaji)) {
    say('Lectures japonaises…');
    const texts = Array.from(
      new Set(
        lessons.flatMap((l) => [
          ...l.nouns,
          ...l.adjectives,
          ...l.others,
          ...l.phrases,
          ...l.review.filter((r) => r.word).map((r) => r.word!),
        ]).map((w) => w.text)
      )
    );
    const readings: Record<string, JaReading> = {};
    for (let i = 0; i < texts.length; i += 8) Object.assign(readings, await getJapaneseReadings(texts.slice(i, i + 8)));
    ctx.readings = readings;
  }

  // 3) images des mots
  const names = Array.from(new Set(lessons.flatMap((l) => [...l.nouns, ...l.adjectives, ...l.others, ...l.phrases].map((w) => w.image).filter((x): x is string => !!x))));
  let done = 0;
  await inBatches(names, 8, async (name) => {
    const data = await webpToJpeg(imageUrl(name));
    if (data) ctx.images[name] = data;
    done++;
    if (done % 8 === 0 || done === names.length) say(`Images ${done} / ${names.length}…`);
  });

  // 4) japonais : tracés des kanji (KanjiVG)
  if (o.languageCode === 'ja') {
    const chars = Array.from(new Set(lessons.flatMap((l) => l.kanji.map((k) => k.char))));
    if (chars.length) say('Tracés des kanji…');
    await inBatches(chars, 6, async (c) => {
      try {
        ctx.kanjiPaths[c] = await loadKanjiPaths(c);
      } catch {
        /* sans tracé : le PDF affiche le kanji en gros, sans numéros de traits */
      }
    });
  }

  // 5) mise en page et téléchargement
  say('Mise en page du PDF…');
  const { pdf, LessonsDocument } = await loadPdfLibs();
  const blob = await pdf(React.createElement(LessonsDocument, { lessons, ctx, includeGuide: true }) as any).toBlob();
  const first = o.numbers[0];
  const last = o.numbers[o.numbers.length - 1];
  const part = o.numbers.length === 1 ? `lecon_${first}` : `lecons_${first}-${last}`;
  download(blob, `MesLangues_${slug(ctx.languageLabel)}_${o.levelCode}_${part}.pdf`);
  say('');
}

/** PDF de la leçon 0 (prononciation). */
export async function downloadPronunciationPdf(o: Omit<PdfOptions, 'profileId'>): Promise<void> {
  const say = o.onProgress ?? (() => {});
  const ctx = baseContext({ ...o, profileId: '' });
  say('Mise en page du PDF…');
  const { pdf, PronunciationDocument } = await loadPdfLibs();
  const blob = await pdf(React.createElement(PronunciationDocument, { ctx }) as any).toBlob();
  download(blob, `MesLangues_${slug(ctx.languageLabel)}_lecon_0_prononciation.pdf`);
  say('');
}
