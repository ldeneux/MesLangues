import React from 'react';
import { Document, Page, View, Text, Image, Svg, Path, Line } from '@react-pdf/renderer';
import type { LessonContent, LessonWord } from '../../../lib/lessons';
import type { ConjugationVerb } from '../../../lib/conjugation';
import type { KanjiItem } from '../../../lib/kanji';
import { splitEnding } from '../../../lib/conjugationHighlight';
import { displayInfinitive, simplifyForm } from '../../../lib/conjugationDisplay';
import { parseRuby } from '../../../lib/japanese';
import { conjugateJapaneseVerb, JA_GROUP_INFO, JA_LEVEL_ORDER, type JaFormRow, type JaLevel } from '../../../lib/japaneseVerbs';
import { JA_FORM_CATEGORIES } from '../../../lib/japaneseFormInfo';
import { splitCommon } from '../../../lib/japaneseDiff';
import { markSpans } from '../../../lib/lessonMatch';
import { JA_GUIDE, JA_GUIDE_TITLE } from '../../../lib/japaneseConjugationGuide';
import { PRONUNCIATION } from '../../../lib/pronunciation';
import { vocabThemeLabel } from '../../../lib/constants';

// ---------------------------------------------------------
// Mise en page des PDF de cours. Document « pur » : il reçoit tout déjà préparé (contenu des leçons, lectures
// japonaises, SVG des emoji, tracés des kanji) et ne fait aucun appel réseau, donc il se teste aussi dans Node.
// ---------------------------------------------------------
export type PdfContext = {
  languageCode: string;
  languageLabel: string;
  levelCode: string;
  levelColor: string;
  furigana: boolean; // lecture en kana au-dessus des kanji
  romaji: boolean;
  readings: Record<string, { ruby: string; romaji: string }>; // lectures des mots japonais (cache ja_readings)
  images: Record<string, string>; // nom d'image → image PNG en data URL (convertie depuis le .webp)
  kanjiPaths: Record<string, string[]>; // kanji → tracés KanjiVG
};

const INK = '#23241f';
const SOFT = '#6e6c62';
const LINE = '#e2dfd4';
const TINT = '#f7f5ee';
const MARK = '#b4412c';
const F = { body: 'NotoSans', head: 'Fraunces', ja: 'NotoSansJP' };
const PRONOUNS = ['je', 'tu', 'elle', 'nous', 'vous', 'ils/elles'];

const CJK = /[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/;
/** Police adaptée au texte : Noto Sans JP dès qu'il contient du japonais (elle contient aussi les accents français). */
const ff = (text: string) => (CJK.test(text) ? F.ja : F.body);

const themeLabel = (code: string) => vocabThemeLabel(code);

// ---------- briques de texte ----------
function Hl({ text, style, ja }: { text: string; style?: any; ja?: boolean }) {
  const parts = String(text ?? '').split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <Text style={[{ fontFamily: ja || CJK.test(text) ? F.ja : F.body, color: INK }, style]}>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') ? (
          <Text key={i} style={{ color: MARK, fontWeight: 700 }}>
            {p.slice(2, -2)}
          </Text>
        ) : (
          p
        )
      )}
    </Text>
  );
}

// Forme conjuguée : partie commune normale, partie qui change en couleur
function Colored({ base, form, size, ja, bold }: { base: string; form: string; size: number; ja?: boolean; bold?: boolean }) {
  const { stem, rest } = splitCommon(base, form);
  return (
    <Text style={{ fontFamily: ja ? F.ja : F.body, fontSize: size, color: INK, fontWeight: bold ? 700 : 400 }}>
      {stem}
      {rest ? <Text style={{ color: MARK, fontWeight: 700 }}>{rest}</Text> : null}
    </Text>
  );
}

// Furigana : chaque groupe « kanji + lecture » est une petite colonne (lecture au-dessus)
export function RubyText({ ruby, size, bold, marked }: { ruby: string; size: number; bold?: boolean; marked?: boolean }) {
  const rt = size * 0.5;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap' }}>
      {parseRuby(ruby).map((s, i) => (
        <View key={i} style={{ alignItems: 'center' }}>
          <Text style={{ fontFamily: F.ja, fontSize: rt, lineHeight: 1.15, color: marked ? MARK : SOFT }}>{s.rt ?? '\u00A0'}</Text>
          <Text style={{ fontFamily: F.ja, fontSize: size, lineHeight: 1.25, fontWeight: bold || marked ? 700 : 400, color: marked ? MARK : INK }}>{s.base}</Text>
        </View>
      ))}
    </View>
  );
}

// Furigana avec **mise en couleur** (exemples de grammaire japonais)
function RubyMarked({ ruby, size }: { ruby: string; size: number }) {
  const parts = ruby.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap' }}>
      {parts.map((p, i) => {
        const marked = p.startsWith('**') && p.endsWith('**');
        return <RubyText key={i} ruby={marked ? p.slice(2, -2) : p} size={size} marked={marked} />;
      })}
    </View>
  );
}

// Un mot (japonais : avec furigana si on les a) ; sinon texte simple
export function Word({ w, ctx, size, bold }: { w: string; ctx: PdfContext; size: number; bold?: boolean }) {
  const isJa = ctx.languageCode === 'ja';
  const rd = isJa && ctx.furigana ? ctx.readings[w] : undefined;
  if (rd) return <RubyText ruby={rd.ruby} size={size} bold={bold} />;
  return <Text style={{ fontFamily: isJa ? F.ja : F.body, fontSize: size, fontWeight: bold ? 700 : 400, color: INK }}>{w}</Text>;
}

const romajiOf = (ctx: PdfContext, w: string) => (ctx.languageCode === 'ja' && ctx.romaji ? ctx.readings[w]?.romaji : undefined);

// ---------- titres et cartes ----------
function SectionTitle({ children, color, sub, ahead = 90 }: { children: string; color: string; sub?: string; ahead?: number }) {
  return (
    <View minPresenceAhead={ahead} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 8 }}>
      <View style={{ width: 4, height: 18, backgroundColor: color, borderRadius: 2, marginRight: 8 }} />
      <Text style={{ fontFamily: F.head, fontWeight: 700, fontSize: 14.5, color: INK }}>{children}</Text>
      {sub ? <Text style={{ fontSize: 8.5, color: SOFT, marginLeft: 8 }}>{sub}</Text> : null}
    </View>
  );
}

/** Titre de section collé à ses `keep` premiers éléments (jamais de titre orphelin en bas de page). */
function Section({ title, color, sub, children, keep = 1, cards = false }: { title: string; color: string; sub?: string; children: any[]; keep?: number; cards?: boolean }) {
  const items = (children ?? []).filter(Boolean);
  const head = items.slice(0, keep);
  const rest = items.slice(keep);
  const Wrap: any = cards ? CardGrid : View;
  return (
    <View>
      <View wrap={false}>
        <SectionTitle color={color} sub={sub} ahead={0}>{title}</SectionTitle>
        <Wrap>{head}</Wrap>
      </View>
      {rest.length > 0 ? <Wrap>{rest}</Wrap> : null}
    </View>
  );
}

function Banner({ lesson, ctx, title, kicker, meta }: { lesson?: LessonContent; ctx: PdfContext; title: string; kicker: string; meta: string }) {
  return (
    <View style={{ backgroundColor: ctx.levelColor, borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center' }}>
      <View
        style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}
      >
        <Text style={{ fontFamily: F.head, fontWeight: 700, fontSize: 28, color: ctx.levelColor }}>{lesson ? String(lesson.number) : '0'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 8, color: '#ffffff', letterSpacing: 1.2, opacity: 0.9 }}>{kicker}</Text>
        <Text style={{ fontFamily: F.head, fontWeight: 700, fontSize: 22, color: '#ffffff', marginTop: 2 }}>{title}</Text>
        <Text style={{ fontSize: 9.5, color: '#ffffff', marginTop: 3, opacity: 0.95 }}>{meta}</Text>
      </View>
    </View>
  );
}

function Footer({ ctx, label }: { ctx: PdfContext; label: string }) {
  return (
    <View
      fixed
      style={{ position: 'absolute', bottom: 16, left: 34, right: 34, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.6, borderTopColor: LINE, paddingTop: 6 }}
    >
      <Text style={{ fontSize: 7.5, color: SOFT }}>
        MesLangues · {ctx.languageLabel} {ctx.levelCode}
      </Text>
      <Text style={{ fontSize: 7.5, color: SOFT }} render={({ pageNumber }) => `${label} · page ${pageNumber}`} />
    </View>
  );
}

// ---------- mots ----------
function WordCard({ w, ctx }: { w: LessonWord; ctx: PdfContext }) {
  const src = w.image ? ctx.images[w.image] : undefined;
  const rom = romajiOf(ctx, w.text);
  return (
    <View
      wrap={false}
      style={{ width: '32.2%', borderWidth: 0.8, borderColor: LINE, borderRadius: 9, marginBottom: 7, backgroundColor: '#ffffff', overflow: 'hidden' }}
    >
      {src ? (
        <View style={{ backgroundColor: '#ffffff', height: 62, alignItems: 'center', justifyContent: 'center' }}>
          <Image src={src} style={{ width: '100%', height: 62, objectFit: 'contain' }} />
        </View>
      ) : null}
      <View style={{ paddingVertical: 5, paddingHorizontal: 7 }}>
        <Word w={w.text} ctx={ctx} size={11} bold />
        {rom ? <Text style={{ fontSize: 7.5, color: SOFT }}>{rom}</Text> : null}
        <Text style={{ fontFamily: ff(w.fr), fontSize: 8.8, color: SOFT, marginTop: 1 }}>{w.fr}</Text>
      </View>
    </View>
  );
}

function WordLine({ w, ctx }: { w: LessonWord; ctx: PdfContext }) {
  const rom = romajiOf(ctx, w.text);
  return (
    <View wrap={false} style={{ width: '48.8%', flexDirection: 'row', alignItems: 'flex-end', marginBottom: 4 }}>
      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: ctx.levelColor, marginRight: 6, marginBottom: 4 }} />
      <Word w={w.text} ctx={ctx} size={10.5} bold />
      {rom ? <Text style={{ fontSize: 7.5, color: SOFT, marginLeft: 4, marginBottom: 1 }}>{rom}</Text> : null}
      <Text style={{ fontSize: 9, color: SOFT, marginLeft: 5, marginBottom: 1, flex: 1 }}>— {w.fr}</Text>
    </View>
  );
}

const Grid = ({ children }: { children: any }) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>{children}</View>;
const CardGrid = ({ children }: { children: any }) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: '1.5%' as any }}>{children}</View>;

// ---------- verbes ----------
function verbTitle(v: ConjugationVerb, ctx: PdfContext, size: number) {
  if (ctx.languageCode === 'ja' && v.ja_data) {
    return ctx.furigana ? (
      <RubyText ruby={v.ja_data.ruby} size={size} bold />
    ) : (
      <Text style={{ fontFamily: F.ja, fontWeight: 700, fontSize: size }}>{v.infinitive}</Text>
    );
  }
  return <Text style={{ fontFamily: F.head, fontWeight: 700, fontSize: size, color: INK }}>{displayInfinitive(v.infinitive, ctx.languageCode)}</Text>;
}

function VerbCard({ v, ctx, index, total }: { v: ConjugationVerb; ctx: PdfContext; index: number; total: number }) {
  const isJa = ctx.languageCode === 'ja' && !!v.ja_data;
  const head = (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 6 }}>
      {verbTitle(v, ctx, 17)}
      <Text style={{ fontSize: 10, color: SOFT, marginLeft: 8, marginBottom: 2 }}>— {v.translation_fr}</Text>
      <Text style={{ fontSize: 7.5, color: SOFT, marginLeft: 'auto', marginBottom: 2 }}>
        Verbe {index + 1} sur {total}
      </Text>
    </View>
  );

  if (isJa) {
    const data = v.ja_data!;
    const info = JA_GROUP_INFO[data.group];
    const rows = conjugateJapaneseVerb(v.infinitive, data.reading, data.group);
    const limit = Math.max(0, JA_LEVEL_ORDER.indexOf(ctx.levelCode as JaLevel));
    const byId = new Map(rows.filter((r) => JA_LEVEL_ORDER.indexOf(r.level) <= limit).map((r) => [r.id, r]));
    const shown = JA_FORM_CATEGORIES.filter((c) => c.key === 'essential' || c.key === 'polite')
      .flatMap((c) => (c.ids ?? []).map((id) => ({ cat: c.key, row: byId.get(id) })))
      .filter((x): x is { cat: string; row: JaFormRow } => !!x.row);
    return (
      <View wrap={false} style={{ borderWidth: 0.8, borderColor: LINE, borderRadius: 10, padding: 10, marginBottom: 10, backgroundColor: '#ffffff' }}>
        {head}
        <Text style={{ fontFamily: F.ja, fontSize: 8.5, color: SOFT, marginBottom: 5 }}>
          <Text style={{ fontWeight: 700, color: INK }}>{info.label}.</Text> {info.tip}
        </Text>
        {shown.map(({ cat, row }, i) => (
          <View key={row.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 2.5, backgroundColor: i % 2 ? TINT : '#ffffff', paddingHorizontal: 4 }}>
            <View style={{ width: '40%' }}>
              <Text style={{ fontFamily: F.ja, fontSize: 8.5, fontWeight: 700 }}>
                {cat === 'essential' ? '★ ' : ''}
                {row.label_fr}
              </Text>
              <Text style={{ fontFamily: F.ja, fontSize: 7, color: SOFT }}>{row.term_jp}</Text>
            </View>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end' }}>
              <Colored base={v.infinitive} form={row.written} size={11.5} ja />
              {ctx.furigana && row.reading !== row.written ? <Text style={{ fontFamily: F.ja, fontSize: 8, color: SOFT, marginLeft: 6, marginBottom: 1 }}>{row.reading}</Text> : null}
            </View>
          </View>
        ))}
        <Text style={{ fontFamily: F.ja, fontSize: 7.5, color: SOFT, marginTop: 4 }}>★ formes essentielles. En couleur : la partie qui change par rapport à la forme du dictionnaire.</Text>
      </View>
    );
  }

  const forms = (v.tenses?.present ?? []).map((f) => simplifyForm(f, ctx.languageCode));
  const col = (from: number) => (
    <View style={{ width: '48%' }}>
      {forms.slice(from, from + 3).map((f, k) => {
        const sp = splitEnding(f, ctx.languageCode, 'present');
        return (
          <View key={k} style={{ flexDirection: 'row', paddingVertical: 2.5 }}>
            <Text style={{ width: 46, fontSize: 8.5, color: SOFT }}>{PRONOUNS[from + k]}</Text>
            <Text style={{ fontSize: 11, color: INK }}>
              {sp ? sp.stem : f}
              {sp ? <Text style={{ color: MARK, fontWeight: 700 }}>{sp.ending}</Text> : null}
            </Text>
          </View>
        );
      })}
    </View>
  );
  return (
    <View wrap={false} style={{ borderWidth: 0.8, borderColor: LINE, borderRadius: 10, padding: 10, marginBottom: 10, backgroundColor: '#ffffff' }}>
      {head}
      <Text style={{ fontSize: 8, color: SOFT, letterSpacing: 0.8, marginBottom: 3 }}>PRÉSENT</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {col(0)}
        {col(3)}
      </View>
    </View>
  );
}

// Fiche de conjugaison récapitulative (toutes les 5 leçons)
const RECAP_TENSES: { key: 'present' | 'passe_compose' | 'futur'; label: string }[] = [
  { key: 'present', label: 'Présent' },
  { key: 'passe_compose', label: 'Passé composé' },
  { key: 'futur', label: 'Futur' },
];
const JA_RECAP = [
  { id: 'dict', label: 'Dictionnaire' },
  { id: 'masu', label: 'ます (poli)' },
  { id: 'masen', label: 'ません (négatif poli)' },
  { id: 'mashita', label: 'ました (passé poli)' },
];

function ConjugationRecap({ verbs, ctx }: { verbs: ConjugationVerb[]; ctx: PdfContext }) {
  const isJa = ctx.languageCode === 'ja';
  return (
    <View>
      <Text style={{ fontSize: 9, color: SOFT, marginBottom: 6 }}>
        Les {verbs.length} verbes des 5 dernières leçons.{isJa ? '' : ' Dans chaque colonne : je, tu, elle, nous, vous, ils/elles.'}
      </Text>
      <View wrap={false} style={{ flexDirection: 'row', backgroundColor: ctx.levelColor, borderRadius: 6, paddingVertical: 4, paddingHorizontal: 6 }}>
        <Text style={{ width: isJa ? '28%' : '19%', fontSize: 8, color: '#fff', fontWeight: 700 }}>Verbe</Text>
        {(isJa ? JA_RECAP : RECAP_TENSES).map((t: any) => (
          <Text key={t.key ?? t.id} style={{ width: isJa ? '18%' : '27%', fontFamily: ff(t.label), fontSize: 8, color: '#fff', fontWeight: 700 }}>
            {t.label}
          </Text>
        ))}
      </View>
      {verbs.map((v, i) => {
        if (isJa && v.ja_data) {
          const rows = conjugateJapaneseVerb(v.infinitive, v.ja_data.reading, v.ja_data.group);
          return (
            <View key={v.id} wrap={false} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 6, backgroundColor: i % 2 ? TINT : '#fff' }}>
              <View style={{ width: '28%' }}>
                {verbTitle(v, ctx, 11)}
                <Text style={{ fontSize: 7.5, color: SOFT }}>{v.translation_fr}</Text>
              </View>
              {JA_RECAP.map((spec) => {
                const row = rows.find((r) => r.id === spec.id);
                return (
                  <View key={spec.id} style={{ width: '18%' }}>
                    {row ? <Colored base={v.infinitive} form={row.written} size={10} ja /> : null}
                  </View>
                );
              })}
            </View>
          );
        }
        return (
          <View key={v.id} wrap={false} style={{ flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6, backgroundColor: i % 2 ? TINT : '#fff' }}>
            <View style={{ width: '19%' }}>
              <Text style={{ fontWeight: 700, fontSize: 9.5 }}>{displayInfinitive(v.infinitive, ctx.languageCode)}</Text>
              <Text style={{ fontSize: 7.5, color: SOFT }}>{v.translation_fr}</Text>
            </View>
            {RECAP_TENSES.map((t) => (
              <View key={t.key} style={{ width: '27%' }}>
                {(v.tenses?.[t.key] ?? []).map((raw, k) => {
                  const f = simplifyForm(raw, ctx.languageCode);
                  const sp = splitEnding(f, ctx.languageCode, t.key);
                  return (
                    <Text key={k} style={{ fontSize: 8, lineHeight: 1.3, color: INK }}>
                      {sp ? sp.stem : f}
                      {sp ? <Text style={{ color: MARK, fontWeight: 700 }}>{sp.ending}</Text> : null}
                    </Text>
                  );
                })}
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

// ---------- kanji : tracé avec numéros + cases de recopie ----------
const startPoint = (d: string): { x: number; y: number } => {
  const m = d.match(/^[Mm]\s*(-?[\d.]+)[ ,]\s*(-?[\d.]+)/);
  return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 0, y: 0 };
};

function KanjiGlyph({ paths, size, color, numbers, strokeWidth = 3.4 }: { paths: string[]; size: number; color: string; numbers?: boolean; strokeWidth?: number }) {
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 109 109">
        {paths.map((d, i) => (
          <Path key={i} d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </Svg>
      {numbers
        ? paths.map((d, i) => {
            const p = startPoint(d);
            return (
              <Text
                key={`n${i}`}
                style={{ position: 'absolute', left: ((p.x - 8) / 109) * size, top: ((p.y - 7) / 109) * size, fontFamily: F.body, fontSize: 6.5, color: MARK, fontWeight: 700 }}
              >
                {String(i + 1)}
              </Text>
            );
          })
        : null}
    </View>
  );
}

function Cell({ size, children }: { size: number; children?: any }) {
  return (
    <View style={{ width: size, height: size, borderWidth: 0.8, borderColor: '#c9c5b6', marginRight: 3, backgroundColor: '#fff' }}>
      <Svg width={size - 1.6} height={size - 1.6} viewBox="0 0 100 100" style={{ position: 'absolute', top: 0, left: 0 }}>
        <Line x1={50} y1={0} x2={50} y2={100} stroke="#dcd8cb" strokeWidth={1} strokeDasharray="4,4" />
        <Line x1={0} y1={50} x2={100} y2={50} stroke="#dcd8cb" strokeWidth={1} strokeDasharray="4,4" />
      </Svg>
      {children ? <View style={{ position: 'absolute', top: 0, left: 0 }}>{children}</View> : null}
    </View>
  );
}

function KanjiBlock({ k, ctx, inLesson }: { k: KanjiItem; ctx: PdfContext; inLesson: { text: string; fr: string }[] }) {
  const paths = ctx.kanjiPaths[k.char] ?? [];
  const cell = 36;
  const clean = (s: string) => s.replace(/\./g, '・');
  return (
    <View wrap={false} style={{ borderWidth: 0.8, borderColor: LINE, borderRadius: 10, padding: 10, marginBottom: 10, backgroundColor: '#fff' }}>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: 84, height: 84, borderWidth: 0.8, borderColor: LINE, borderRadius: 8, marginRight: 12, backgroundColor: TINT }}>
          {paths.length ? (
            <KanjiGlyph paths={paths} size={82} color={INK} numbers />
          ) : (
            <Text style={{ fontFamily: F.ja, fontSize: 56, textAlign: 'center', marginTop: 6 }}>{k.char}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.head, fontWeight: 700, fontSize: 13 }}>{k.meaning_fr}</Text>
          {k.onyomi.length > 0 ? (
            <Text style={{ fontFamily: F.ja, fontSize: 9, marginTop: 3 }}>
              <Text style={{ color: SOFT }}>On : </Text>
              {k.onyomi.join('、')}
            </Text>
          ) : null}
          {k.kunyomi.length > 0 ? (
            <Text style={{ fontFamily: F.ja, fontSize: 9, marginTop: 2 }}>
              <Text style={{ color: SOFT }}>Kun : </Text>
              {k.kunyomi.map(clean).join('、')}
            </Text>
          ) : null}
          {inLesson.length > 0 ? (
            <Text style={{ fontFamily: F.ja, fontSize: 9, marginTop: 3 }}>
              <Text style={{ color: SOFT }}>Dans la leçon : </Text>
              {inLesson.map((w) => `${w.text} (${w.fr})`).join('、')}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row', marginTop: 8 }}>
        <Cell size={cell}>{paths.length ? <KanjiGlyph paths={paths} size={cell - 2} color={INK} /> : null}</Cell>
        <Cell size={cell}>{paths.length ? <KanjiGlyph paths={paths} size={cell - 2} color="#c3bfb1" /> : null}</Cell>
        <Cell size={cell}>{paths.length ? <KanjiGlyph paths={paths} size={cell - 2} color="#d6d2c6" /> : null}</Cell>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Cell key={i} size={cell} />
        ))}
      </View>
    </View>
  );
}

// ---------- grammaire ----------
function GrammarBlock({ lesson, ctx }: { lesson: LessonContent; ctx: PdfContext }) {
  const g = lesson.grammar!;
  const topic = g.topic;
  if (!topic) return null;
  const ex = Array.isArray(topic.examples) ? topic.examples[g.exampleIndex] : null;
  const isJa = ctx.languageCode === 'ja';
  return (
    <View wrap={false} style={{ backgroundColor: TINT, borderRadius: 10, padding: 12, borderLeftWidth: 4, borderLeftColor: ctx.levelColor }}>
      <Text style={{ fontFamily: CJK.test(topic.title) ? F.ja : F.head, fontWeight: 700, fontSize: 12.5 }}>{topic.title}</Text>
      <Text style={{ fontFamily: ff(topic.explanation_fr), fontSize: 9.5, lineHeight: 1.5, marginTop: 4 }}>{topic.explanation_fr}</Text>
      {ex ? (
        <View style={{ marginTop: 8, backgroundColor: '#fff', borderRadius: 8, padding: 8 }}>
          <Text style={{ fontSize: 7.5, color: SOFT, letterSpacing: 0.8, marginBottom: 3 }}>UN EXEMPLE</Text>
          {isJa && ctx.furigana && ex.ruby ? <RubyMarked ruby={ex.ruby} size={12.5} /> : <Hl text={ex.target} ja={isJa} style={{ fontSize: 12.5 }} />}
          {isJa && ctx.romaji && ex.romaji ? <Text style={{ fontSize: 8, color: SOFT, marginTop: 2 }}>{ex.romaji}</Text> : null}
          <Hl text={ex.fr} style={{ fontSize: 9.5, color: SOFT, marginTop: 3 }} />
        </View>
      ) : null}
    </View>
  );
}

// ---------- guide « Comprendre la conjugaison » (japonais, leçon 1) ----------
function Guide({ ctx }: { ctx: PdfContext }) {
  const colored = (base: string, form: string) => <Colored base={base} form={form} size={9.5} ja />;
  return (
    <View>
      {JA_GUIDE.map((sec, si) => (
        <View key={si} style={{ marginBottom: 10 }}>
          <Text minPresenceAhead={50} style={{ fontFamily: CJK.test(sec.title) ? F.ja : F.head, fontWeight: 700, fontSize: 11.5, marginBottom: 3 }}>
            {si + 1}. {sec.title}
          </Text>
          {sec.paragraphs.map((p, pi) => (
            <Text key={pi} style={{ fontFamily: F.ja, fontSize: 9, lineHeight: 1.55, marginBottom: 3 }}>
              {p}
            </Text>
          ))}
          {sec.table ? (
            <View wrap={false} style={{ marginTop: 3, marginBottom: 3 }}>
              <View style={{ flexDirection: 'row', backgroundColor: ctx.levelColor, paddingVertical: 3, paddingHorizontal: 5 }}>
                {sec.table.head.map((h, hi) => (
                  <Text key={hi} style={{ flex: 1, fontFamily: ff(h), fontSize: 8, color: '#fff', fontWeight: 700 }}>
                    {h}
                  </Text>
                ))}
              </View>
              {sec.table.rows.map((row, ri) => (
                <View key={ri} style={{ flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 5, backgroundColor: ri % 2 ? TINT : '#fff' }}>
                  {row.map((cell, ci) => (
                    <View key={ci} style={{ flex: 1 }}>
                      <Hl text={cell} ja style={{ fontSize: 9, fontWeight: ci === 0 ? 700 : 400 }} />
                    </View>
                  ))}
                </View>
              ))}
            </View>
          ) : null}
          {sec.verbTables?.map((t, ti) => (
            <View key={ti} wrap={false} style={{ marginTop: 3, marginBottom: 3 }}>
              {t.caption ? <Text style={{ fontFamily: ff(t.caption), fontSize: 8.5, fontWeight: 700, marginBottom: 2 }}>{t.caption}</Text> : null}
              <View style={{ flexDirection: 'row', backgroundColor: ctx.levelColor, paddingVertical: 3, paddingHorizontal: 5 }}>
                {['Verbe', 'ない (négatif familier)', 'ます (poli)', 'て'].map((h, hi) => (
                  <Text key={hi} style={{ flex: hi === 0 ? 1.3 : 1, fontFamily: ff(h), fontSize: 8, color: '#fff', fontWeight: 700 }}>
                    {h}
                  </Text>
                ))}
              </View>
              {t.rows.map((r, ri) => (
                <View key={ri} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 3, paddingHorizontal: 5, backgroundColor: ri % 2 ? TINT : '#fff' }}>
                  <View style={{ flex: 1.3 }}>
                    <Text style={{ fontFamily: F.ja, fontSize: 10, fontWeight: 700 }}>
                      {r.dict}
                      {r.reading !== r.dict ? <Text style={{ fontSize: 7.5, color: SOFT, fontWeight: 400 }}> {r.reading}</Text> : null}
                    </Text>
                    <Text style={{ fontFamily: ff(r.fr), fontSize: 7, color: SOFT }}>{r.fr}</Text>
                  </View>
                  <View style={{ flex: 1 }}>{colored(r.dict, r.nai)}</View>
                  <View style={{ flex: 1 }}>{colored(r.dict, r.masu)}</View>
                  <View style={{ flex: 1 }}>{colored(r.dict, r.te)}</View>
                </View>
              ))}
            </View>
          ))}
          {sec.examples?.map((e, ei) => (
            <View key={ei} wrap={false} style={{ backgroundColor: TINT, borderRadius: 6, padding: 6, marginTop: 3 }}>
              <Hl text={e.ja} ja style={{ fontSize: 11 }} />
              <Text style={{ fontSize: 7.5, color: SOFT, marginTop: 1 }}>{e.romaji}</Text>
              <Text style={{ fontSize: 8.5, color: INK, marginTop: 1 }}>{e.fr}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// ---------- phrases d'exemple (les mots de la leçon en couleur) ----------
function SentenceBlock({ s, ctx }: { s: LessonContent['sentences'][number]; ctx: PdfContext }) {
  const isJa = ctx.languageCode === 'ja';
  const rd = isJa && ctx.furigana ? ctx.readings[s.text] : undefined;
  return (
    <View wrap={false} style={{ borderWidth: 0.8, borderColor: LINE, borderRadius: 9, padding: 8, marginBottom: 6, backgroundColor: '#ffffff' }}>
      {rd ? <RubyText ruby={rd.ruby} size={12} /> : <Hl text={markSpans(s.text, s.spans)} ja={isJa} style={{ fontSize: 12, lineHeight: 1.35 }} />}
      {isJa && ctx.romaji && ctx.readings[s.text]?.romaji ? <Text style={{ fontSize: 8, color: SOFT, marginTop: 2 }}>{ctx.readings[s.text].romaji}</Text> : null}
      <Text style={{ fontFamily: ff(s.fr), fontSize: 9.5, color: SOFT, marginTop: 3 }}>{s.fr}</Text>
    </View>
  );
}

// ---------- page « À retenir » ----------
function Recap({ lesson, ctx }: { lesson: LessonContent; ctx: PdfContext }) {
  const block = (label: string, items: { text: string; fr: string }[], ja?: boolean) =>
    items.length > 0 ? (
      <View key={label} wrap={false} style={{ width: '48.8%', marginBottom: 10 }}>
        <Text style={{ fontSize: 8, color: SOFT, letterSpacing: 0.8, marginBottom: 3 }}>{label.toUpperCase()}</Text>
        {items.map((it, i) => (
          <Text key={i} style={{ fontSize: 9.5, lineHeight: 1.45 }}>
            <Text style={{ fontFamily: ja ? F.ja : F.body, fontWeight: 700 }}>{it.text}</Text>
            <Text style={{ color: SOFT }}> — {it.fr}</Text>
          </Text>
        ))}
      </View>
    ) : null;
  const isJa = ctx.languageCode === 'ja';
  const w = (list: LessonWord[]) => list.map((x) => ({ text: x.text, fr: x.fr }));
  return (
    <View break>
      <Banner ctx={ctx} lesson={lesson} kicker={`LEÇON ${lesson.number} · À RETENIR`} title="À retenir" meta={`${themeLabel(lesson.theme_code)} · ${ctx.languageLabel} ${ctx.levelCode}`} />
      <View style={{ height: 14 }} />
      <Grid>
        {block('Noms', w(lesson.nouns), isJa)}
        {block('Adjectifs', w(lesson.adjectives), isJa)}
        {block('Autres mots', w(lesson.others), isJa)}
        {block('Verbes', lesson.verbs.map((v) => ({ text: displayInfinitive(v.infinitive, ctx.languageCode), fr: v.translation_fr })), isJa)}
        {block('Kanji', lesson.kanji.map((k) => ({ text: k.char, fr: k.meaning_fr })), true)}
        {block('À connaître aussi', w(lesson.phrases), isJa)}
      </Grid>
    </View>
  );
}

// ---------- une leçon ----------
function LessonPage({ lesson, ctx, includeGuide }: { lesson: LessonContent; ctx: PdfContext; includeGuide: boolean }) {
  const color = ctx.levelColor;
  const isJa = ctx.languageCode === 'ja';
  const counts = [
    lesson.nouns.length ? `${lesson.nouns.length} noms` : '',
    lesson.adjectives.length ? `${lesson.adjectives.length} adjectifs` : '',
    lesson.verbs.length ? `${lesson.verbs.length} verbes` : '',
    lesson.kanji.length ? `${lesson.kanji.length} kanji` : '',
  ].filter(Boolean);
  const wordsWithKanji = (char: string) => [
    ...[...lesson.nouns, ...lesson.adjectives, ...lesson.others, ...lesson.phrases].filter((w) => w.text.includes(char)).map((w) => ({ text: w.text, fr: w.fr })),
    ...lesson.verbs.filter((v) => v.infinitive.includes(char)).map((v) => ({ text: v.infinitive, fr: v.translation_fr })),
  ];

  return (
    <Page size="A4" style={{ paddingTop: 34, paddingBottom: 46, paddingHorizontal: 34, fontFamily: isJa ? F.ja : F.body, fontSize: 10, color: INK, backgroundColor: '#fff' }}>
      <Footer ctx={ctx} label={`Leçon ${lesson.number}`} />
      <Banner
        ctx={ctx}
        lesson={lesson}
        kicker={`LEÇON ${lesson.number} SUR ${lesson.total}`}
        title={themeLabel(lesson.theme_code)}
        meta={`${ctx.languageLabel} · ${ctx.levelCode}${counts.length ? ' · ' + counts.join(' · ') : ''}`}
      />

      {lesson.review.length > 0 ? (
        <View>
          <SectionTitle color={color} sub="des leçons précédentes">On se rappelle</SectionTitle>
          <Grid>
            {lesson.review.map((r, i) =>
              r.word ? (
                <WordLine key={i} w={r.word} ctx={ctx} />
              ) : r.verb ? (
                <WordLine key={i} w={{ id: r.verb.id, text: r.verb.infinitive, fr: r.verb.translation_fr, audio_url: null, word_type: 'verbe', theme_code: '', image: null }} ctx={ctx} />
              ) : null
            )}
          </Grid>
        </View>
      ) : null}

      {lesson.nouns.length > 0 ? (
        <Section title="Les noms" color={color} sub={`${lesson.nouns.length} mots`} keep={3} cards>
          {lesson.nouns.map((w) => <WordCard key={w.id} w={w} ctx={ctx} />)}
        </Section>
      ) : null}

      {lesson.adjectives.length > 0 ? (
        <Section title="Les adjectifs" color={color} sub={`${lesson.adjectives.length} mots`} keep={3} cards>
          {lesson.adjectives.map((w) => <WordCard key={w.id} w={w} ctx={ctx} />)}
        </Section>
      ) : null}

      {lesson.others.length > 0 ? (
        <Section title="Autres mots utiles" color={color} keep={3} cards>
          {lesson.others.map((w) => <WordCard key={w.id} w={w} ctx={ctx} />)}
        </Section>
      ) : null}

      {lesson.verbs.length > 0 ? (
        <Section title="Les verbes" color={color} sub={isJa && includeGuide ? 'voir « Comprendre la conjugaison » en fin de leçon' : `${lesson.verbs.length} verbes`}>
          {lesson.verbs.map((v, i) => <VerbCard key={v.id} v={v} ctx={ctx} index={i} total={lesson.verbs.length} />)}
        </Section>
      ) : null}

      {lesson.conjugationRecap.length > 0 ? (
        <View>
          <SectionTitle color={color} ahead={150}>Fiche de conjugaison</SectionTitle>
          <ConjugationRecap verbs={lesson.conjugationRecap} ctx={ctx} />
        </View>
      ) : null}

      {lesson.kanji.length > 0 ? (
        <Section title="Les kanji" color={color} sub="trace, puis recopie dans les cases">
          {lesson.kanji.map((k) => <KanjiBlock key={k.id} k={k} ctx={ctx} inLesson={wordsWithKanji(k.char)} />)}
        </Section>
      ) : null}

      {lesson.grammar && lesson.grammar.topic ? (
        <View>
          <SectionTitle color={color} ahead={130}>La règle du jour</SectionTitle>
          <GrammarBlock lesson={lesson} ctx={ctx} />
        </View>
      ) : null}

      {(lesson.sentences ?? []).length > 0 ? (
        <Section title="Les mots en phrases" color={color} sub="les mots de la leçon sont en couleur">
          {lesson.sentences.map((s) => <SentenceBlock key={s.id} s={s} ctx={ctx} />)}
        </Section>
      ) : null}

      {lesson.phrases.length > 0 ? (
        <Section title="À connaître aussi" color={color} keep={3} cards>
          {lesson.phrases.map((w) => <WordCard key={w.id} w={w} ctx={ctx} />)}
        </Section>
      ) : null}

      <Recap lesson={lesson} ctx={ctx} />

      {isJa && includeGuide ? (
        <View break>
          <SectionTitle color={color} sub="annexe de la leçon 1" ahead={120}>{JA_GUIDE_TITLE}</SectionTitle>
          <Guide ctx={ctx} />
        </View>
      ) : null}
    </Page>
  );
}

export function LessonsDocument({ lessons, ctx, includeGuide = true, title }: { lessons: LessonContent[]; ctx: PdfContext; includeGuide?: boolean; title?: string }) {
  return (
    <Document title={title ?? `MesLangues · ${ctx.languageLabel} ${ctx.levelCode}`} author="MesLangues" creator="MesLangues" language="fr">
      {lessons.map((l) => (
        <LessonPage key={l.id} lesson={l} ctx={ctx} includeGuide={includeGuide && l.number === 1} />
      ))}
    </Document>
  );
}

// ---------- Leçon 0 : prononciation ----------
export function PronunciationDocument({ ctx }: { ctx: PdfContext }) {
  const lesson = PRONUNCIATION[ctx.languageCode];
  const isJa = ctx.languageCode === 'ja';
  if (!lesson) {
    return (
      <Document>
        <Page size="A4">
          <Text>Leçon 0 indisponible pour cette langue.</Text>
        </Page>
      </Document>
    );
  }
  return (
    <Document title={`Leçon 0 · Prononciation · ${ctx.languageLabel}`} author="MesLangues" creator="MesLangues" language="fr">
      <Page size="A4" style={{ paddingTop: 34, paddingBottom: 46, paddingHorizontal: 34, fontFamily: isJa ? F.ja : F.body, fontSize: 10, color: INK, backgroundColor: '#fff' }}>
        <Footer ctx={ctx} label="Leçon 0" />
        <Banner ctx={ctx} title="La prononciation" kicker="LEÇON 0" meta={`${ctx.languageLabel} · les sons et les pièges`} />
        <Text style={{ fontFamily: ff(lesson.intro), fontSize: 10, lineHeight: 1.55, marginTop: 12 }}>{lesson.intro}</Text>
        {lesson.sections.map((s, i) => (
          <View key={i} wrap={false} style={{ marginTop: 12, borderWidth: 0.8, borderColor: LINE, borderRadius: 10, padding: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: ctx.levelColor, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                <Text style={{ fontSize: 9, fontWeight: 700, color: '#fff' }}>{String(i + 1)}</Text>
              </View>
              <Text style={{ fontFamily: CJK.test(s.title) ? F.ja : F.head, fontWeight: 700, fontSize: 12.5 }}>{s.title}</Text>
            </View>
            <Text style={{ fontFamily: ff(s.explain), fontSize: 9.5, lineHeight: 1.5, marginBottom: 5 }}>{s.explain}</Text>
            {s.examples.map((e, k) => (
              <View key={k} style={{ flexDirection: 'row', alignItems: 'baseline', paddingVertical: 2.5, backgroundColor: k % 2 ? TINT : '#fff', paddingHorizontal: 5 }}>
                <Text style={{ width: '30%', fontFamily: isJa ? F.ja : F.body, fontWeight: 700, fontSize: 11 }}>{e.text}</Text>
                <Text style={{ flex: 1, fontFamily: ff(e.note), fontSize: 8.8, color: SOFT }}>{e.note}</Text>
              </View>
            ))}
          </View>
        ))}
      </Page>
    </Document>
  );
}
