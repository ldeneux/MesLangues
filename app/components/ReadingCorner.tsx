'use client';

import { useEffect, useState } from 'react';
import ReadingWordPopover, { type ReadingSelection } from './ReadingWordPopover';
import { READING_ORIGINS, READING_TOTAL, findReadingOrigin, type ReadingEntry } from '../../lib/readingCatalog';
import { getReadingStatus, getReadingStory, generateReadingStory } from '../../lib/readingServer';
import type { ReadingView } from '../../lib/readingLogic';
import { estimateReadingCost } from '../../lib/pricing';
import { LANGS, type LangCode } from '../../lib/constants';

const eur = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 3 });

/**
 * Coin lecture (niveau B2) : de grands récits du monde, lus dans la langue apprise (quelle que soit leur origine), avec la
 * traduction française masquable. Une version déjà générée s'ouvre directement ; sinon une fenêtre annonce le coût avant l'appel
 * à Gemini. On ne génère que la langue lue : la 1re fois avec la traduction française, ensuite seulement la nouvelle langue.
 */
export default function ReadingCorner({ languageCode }: { languageCode: LangCode }) {
  const langLabel = LANGS.find((l) => l.code === languageCode)?.label ?? languageCode;

  const [langsById, setLangsById] = useState<Record<string, string[]> | null>(null);
  const [originCode, setOriginCode] = useState(READING_ORIGINS[0].code);
  const [opened, setOpened] = useState<{ entry: ReadingEntry; view: ReadingView } | null>(null);
  const [confirmEntry, setConfirmEntry] = useState<ReadingEntry | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // identifiant du récit en cours de chargement ou de génération
  const [error, setError] = useState('');
  const [showFr, setShowFr] = useState(false);
  const [wordSel, setWordSel] = useState<ReadingSelection | null>(null); // mot sélectionné dans le texte (infobulle de traduction)

  useEffect(() => {
    getReadingStatus().then((r) => {
      if (r.ok) setLangsById(r.langs);
      else {
        setLangsById({});
        setError((r as { error: string }).error);
      }
    });
  }, []);

  const origin = findReadingOrigin(originCode) ?? READING_ORIGINS[0];
  const readyIn = (id: string) => !!langsById?.[id]?.includes(languageCode);
  const readableCount = langsById ? Object.values(langsById).filter((l) => l.includes(languageCode)).length : null;

  function remember(id: string, lang: string) {
    setLangsById((prev) => {
      const cur = new Set(prev?.[id] ?? []);
      cur.add(lang);
      cur.add('fr');
      return { ...(prev ?? {}), [id]: Array.from(cur) };
    });
  }

  // Sélection d'un mot (double-clic, glissé ou appui long) dans un paragraphe : infobulle de traduction
  function onSelectInParagraph(index: number, el: HTMLElement | null) {
    setTimeout(() => {
      const sel = typeof window !== 'undefined' ? window.getSelection() : null;
      if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !el) return;
      const range = sel.getRangeAt(0);
      if (!el.contains(range.commonAncestorContainer)) return; // sélection hors de ce paragraphe
      const text = sel.toString().trim().replace(/\s+/g, ' ');
      if (!text || text.length > 80) return; // un mot ou une courte expression
      const r = range.getBoundingClientRect();
      setWordSel({ text, paragraph: index, rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom } });
    }, 30);
  }

  async function openEntry(entry: ReadingEntry) {
    setError('');
    if (!readyIn(entry.id)) {
      setConfirmEntry(entry); // pas encore généré dans cette langue : on annonce le coût d'abord
      return;
    }
    setBusy(entry.id);
    const r = await getReadingStory(entry.id, languageCode);
    setBusy(null);
    if (r.ok) {
      setOpened({ entry, view: r.view });
      setShowFr(false);
    } else setError((r as { error: string }).error);
  }

  async function confirmGenerate() {
    const entry = confirmEntry;
    if (!entry) return;
    setConfirmEntry(null);
    setBusy(entry.id);
    setError('');
    const r = await generateReadingStory(entry.id, languageCode);
    setBusy(null);
    if (r.ok) {
      remember(entry.id, languageCode);
      setOpened({ entry, view: r.view });
      setShowFr(false);
    } else setError((r as { error: string }).error);
  }

  // ----------------------------- Lecteur -----------------------------
  if (opened) {
    const { entry, view } = opened;
    const o = findReadingOrigin(entry.origin);
    const words =
      languageCode === 'ja'
        ? view.version.paragraphs.join('').replace(/\s+/g, '').length
        : view.version.paragraphs.join(' ').split(/\s+/).filter(Boolean).length;
    return (
      <div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <button className="secondary" onClick={() => { setWordSel(null); setOpened(null); }}>
            ← Retour à la liste
          </button>
          <button className="secondary" onClick={() => setShowFr((v) => !v)}>
            {showFr ? 'Masquer la traduction française' : 'Afficher la traduction française'}
          </button>
        </div>

        <p className="eyebrow-free" style={{ marginTop: 0 }}>
          💡 Sélectionne un mot ou une expression (double-clic, ou appui long sur mobile) pour voir sa traduction.
        </p>

        {wordSel && (
          <ReadingWordPopover
            sel={wordSel}
            languageCode={languageCode}
            bcp47={LANGS.find((l) => l.code === languageCode)?.bcp47 ?? 'en-GB'}
            paragraphText={view.version.paragraphs[wordSel.paragraph] ?? ''}
            paragraphFr={view.fr.paragraphs[wordSel.paragraph] ?? ''}
            onClose={() => setWordSel(null)}
          />
        )}

        <div className="phrase-card phrase-card-big">
          <div className="eyebrow-free" style={{ marginBottom: '0.25rem' }}>
            {o?.flag} {o?.label} · {entry.kind}
            {entry.author ? ` · ${entry.author}` : ''} · lu en {langLabel.toLowerCase()} · {words} {languageCode === 'ja' ? 'caractères' : 'mots'}
          </div>
          <h2 style={{ margin: '0 0 0.25rem' }} lang={languageCode}>
            {view.version.title}
          </h2>
          {showFr && <div className="eyebrow-free" style={{ marginBottom: '0.75rem' }}>{view.fr.title}</div>}

          {view.version.paragraphs.map((p, i) => (
            <div key={i} style={{ marginTop: '1rem' }}>
              <p
                lang={languageCode}
                style={{ margin: 0, lineHeight: languageCode === 'ja' ? 2 : 1.65, fontSize: '1.05rem' }}
                onMouseUp={(e) => onSelectInParagraph(i, e.currentTarget)}
                onTouchEnd={(e) => onSelectInParagraph(i, e.currentTarget)}
              >
                {p}
              </p>
              {showFr && view.fr.paragraphs[i] && (
                <p style={{ margin: '0.35rem 0 0', lineHeight: 1.55, opacity: 0.7, fontSize: '0.95rem', borderLeft: '3px solid var(--line)', paddingLeft: '0.6rem' }}>
                  {view.fr.paragraphs[i]}
                </p>
              )}
            </div>
          ))}

          <p className="eyebrow-free" style={{ marginTop: '1.25rem' }}>
            Adaptation d'un récit du patrimoine ({entry.original}), écrite pour l'apprentissage : ce n'est pas le texte intégral de l'œuvre.
          </p>
        </div>
      </div>
    );
  }

  // ----------------------------- Liste -----------------------------
  const hasFr = confirmEntry ? !!langsById?.[confirmEntry.id]?.includes('fr') : false;
  const cost = confirmEntry ? estimateReadingCost(confirmEntry.words, hasFr) : null;

  return (
    <div>
      <p className="eyebrow-free">
        Grands récits du monde, adaptés en {langLabel.toLowerCase()} (niveau B2), quelle que soit leur origine. {readableCount ?? '…'} / {READING_TOTAL} déjà disponibles
        en {langLabel.toLowerCase()}.
      </p>

      <div className="subtab-row" style={{ flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        {READING_ORIGINS.map((o) => {
          const n = o.stories.filter((s) => readyIn(s.id)).length;
          return (
            <button key={o.code} className={`subtab-btn${o.code === originCode ? ' active' : ''}`} onClick={() => setOriginCode(o.code)}>
              {o.flag} {o.label} <span style={{ opacity: 0.6, fontSize: '0.75rem' }}>{n}/{o.stories.length}</span>
            </button>
          );
        })}
      </div>

      {error && <p className="conv-warning">{error}</p>}

      <div className="pack-list">
        {origin.stories.map((s) => (
          <div key={s.id} className="pack-row" style={{ cursor: 'pointer' }} onClick={() => !busy && openEntry(s)}>
            <div>
              <div className="pack-row-title">
                {s.n}. {s.title}
              </div>
              <div className="pack-row-sub">
                {s.kind}
                {s.author ? ` · ${s.author}` : ' · tradition'} · {s.original} · ≈ {s.words} mots
              </div>
            </div>
            <span style={{ whiteSpace: 'nowrap' }}>{busy === s.id ? 'En cours…' : readyIn(s.id) ? '✓ Lire' : '☁ À générer'}</span>
          </div>
        ))}
      </div>

      {/* Fenêtre de coût (avant tout appel à Gemini) */}
      {confirmEntry && cost && (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 50 }}
          onClick={() => setConfirmEntry(null)}
        >
          <div className="phrase-card" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Préparer « {confirmEntry.title} » en {langLabel.toLowerCase()} ?</h3>
            <p className="eyebrow-free">
              {hasFr
                ? `Gemini écrit la version ${langLabel.toLowerCase()} (≈ ${confirmEntry.words} mots) à partir de la traduction française déjà enregistrée.`
                : `Gemini écrit la version ${langLabel.toLowerCase()} (≈ ${confirmEntry.words} mots) et sa traduction française, qui servira aussi pour les autres langues.`}
            </p>
            <p className="eyebrow-free">
              Coût estimé : <strong>≈ {eur(cost.eur)} €</strong> (≈ {eur(cost.usd)} $), une seule fois : la version est conservée.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button className="primary" onClick={confirmGenerate}>
                Générer et lire
              </button>
              <button className="secondary" onClick={() => setConfirmEntry(null)}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
