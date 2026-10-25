'use client';

import { useCallback, useEffect, useState } from 'react';
import { getImageStatus, fillImageNamesStep, listMissingImages, type ImageStatus } from '../../lib/lessons';

/** « Images des mots » : compteur d'images disponibles / manquantes pour la langue et le niveau (paramétrage, onglet Packs). */
export default function WordImagesBlock({ languageCode, levelCode }: { languageCode: string; levelCode: string }) {
  const [status, setStatus] = useState<ImageStatus | null>(null);
  const [namesRun, setNamesRun] = useState<{ remaining: number; total: number } | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const r = await getImageStatus(languageCode, levelCode);
      if (r.ok) {
        setStatus((r as { data: ImageStatus }).data);
        setError('');
      } else setError((r as { error: string }).error);
    } catch (e: any) {
      setError(e?.message ?? "Impossible de lire l'état des images.");
    }
  }, [languageCode, levelCode]);

  useEffect(() => {
    setStatus(null);
    refresh();
  }, [refresh]);

  // Noms d'images : calcul par code (gratuit), enregistré en base par lots
  async function runFillNames() {
    if (!status) return;
    setError('');
    const total = status.namesPending;
    setNamesRun({ remaining: total, total });
    try {
      for (let guard = 0; guard < 60; guard++) {
        const r = await fillImageNamesStep(languageCode, levelCode);
        if (!r.ok) {
          setError((r as { error: string }).error);
          break;
        }
        const remaining = (r as { data: { remaining: number } }).data.remaining;
        setNamesRun({ remaining, total });
        if (remaining === 0) break;
      }
    } catch (e: any) {
      setError(e?.message ?? "Le calcul des noms d'images a été interrompu.");
    } finally {
      setNamesRun(null);
      await refresh();
    }
  }

  // Liste des images à fournir : un fichier texte « nom-du-fichier » par ligne
  async function downloadMissing(all: boolean) {
    setError('');
    try {
      const r = await listMissingImages(all ? null : languageCode, all ? null : levelCode);
      if (!r.ok) {
        setError((r as { error: string }).error);
        return;
      }
      const list = (r as { data: { name: string; fr: string; near: string | null }[] }).data;
      const head = `# Images à fournir (${list.length}) : un fichier .webp par ligne, à nommer exactement comme le mot et à déposer dans public/image_webp\n`;
      const blob = new Blob(
        [head + list.map((m) => (m.near ? `${m.name}   # fichier proche non utilisé : « ${m.near} » (accents différents : renomme-le si c'est le bon mot)` : m.name)).join('\n') + '\n'],
        { type: 'text/plain;charset=utf-8' }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = all ? 'images_manquantes_toutes_langues.txt' : `images_manquantes_${languageCode}_${levelCode}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message ?? 'Impossible de préparer la liste.');
    }
  }

  const pct = namesRun && namesRun.total > 0 ? Math.round(((namesRun.total - namesRun.remaining) / namesRun.total) * 100) : 0;

  return (
    <div className="pack-list" style={{ marginTop: '1.5rem' }}>
      <div className="pack-row-title" style={{ marginBottom: '0.5rem' }}>
        Images des mots
      </div>
      <div className="phrase-card lesson-setup">
        {error && <p className="conv-warning">{error}</p>}
        {!status && !error ? (
          <p className="eyebrow-free">Chargement…</p>
        ) : status && !status.ready ? (
          <p className="conv-warning" style={{ marginBottom: 0 }}>
            La colonne des images n'existe pas encore : exécute la migration 024 dans le SQL Editor de Supabase.
          </p>
        ) : status && status.words === 0 ? (
          <p className="eyebrow-free" style={{ marginBottom: 0 }}>
            Aucun mot dans ce niveau pour l'instant.
          </p>
        ) : status ? (
          namesRun ? (
            <div className="pack-progress">
              <div className="pack-progress-label">
                {namesRun.total - namesRun.remaining} / {namesRun.total} mots
              </div>
              <div className="pack-progress-track">
                <div className="pack-progress-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          ) : (
            <>
              <p className="eyebrow-free">
                <strong>{status.available}</strong> images disponibles sur {status.distinct} nécessaires pour ce niveau, <strong>{status.missing}</strong> manquantes. Une image
                correspond à un mot français : elle sert dans toutes les langues. Le nom du fichier est reconnu sans tenir compte de la casse ni des accents, et à défaut sans
                l'article (« la pharmacie » trouve « une pharmacie.webp »).
              </p>
              <div className="conv-bubble-actions">
                {status.namesPending > 0 && (
                  <button className="primary" onClick={runFillNames}>
                    Enregistrer les noms d'images ({status.namesPending} mots, gratuit)
                  </button>
                )}
                {status.missing > 0 && (
                  <>
                    <button className="conv-mini-btn" onClick={() => downloadMissing(false)}>
                      Liste des manquantes (ce niveau)
                    </button>
                    <button className="conv-mini-btn" onClick={() => downloadMissing(true)}>
                      Liste de toutes les langues
                    </button>
                  </>
                )}
              </div>
              <p className="eyebrow-free" style={{ marginTop: '0.6rem', marginBottom: 0 }}>
                Pour ajouter des images : dépose les .webp dans public/image_webp, nommés comme le mot français (« un fromage.webp », accents et espaces autorisés), puis pousse sur
                GitHub : le compteur se met à jour au déploiement.
              </p>
            </>
          )
        ) : null}
      </div>
    </div>
  );
}
