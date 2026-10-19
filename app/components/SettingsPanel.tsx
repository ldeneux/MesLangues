'use client';

import { useEffect, useState } from 'react';
import { getInventory, getStorageStats, type Inventory, type StorageStats } from '../../lib/inventory';
import { LANGS, LEVELS } from '../../lib/constants';
import FlagIcon from './FlagIcon';

function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function CellBadge({ ready, target }: { ready: number; target: number }) {
  const pct = target > 0 ? Math.min(100, Math.round((ready / target) * 100)) : 0;
  return (
    <span className={`inv-cell${pct >= 100 ? ' inv-cell-full' : pct === 0 ? ' inv-cell-empty' : ''}`}>
      {ready}/{target}
    </span>
  );
}

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [storage, setStorage] = useState<StorageStats | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterLang, setFilterLang] = useState<string>('all'); // 'all' ou un code de langue

  useEffect(() => {
    getInventory()
      .then((r) => {
        if (r.ok) setInventory((r as { data: Inventory }).data);
        else setError((r as { error: string }).error);
      })
      .catch(() => setError("Erreur réseau pendant le chargement de l'inventaire."));
  }, []);

  // La volumétrie est recalculée à chaque changement de langue (et seulement une fois l'inventaire chargé,
  // pour ne pas lancer tous les comptages en même temps)
  useEffect(() => {
    if (!inventory) return;
    let cancelled = false;
    setStorageLoading(true);
    getStorageStats(filterLang)
      .then((r) => {
        if (cancelled) return;
        if (r.ok) {
          setStorage((r as { data: StorageStats }).data);
          setError('');
        } else {
          setError((r as { error: string }).error);
        }
      })
      .catch(() => {
        if (!cancelled) setError('Erreur réseau pendant le chargement de la volumétrie.');
      })
      .finally(() => {
        if (!cancelled) setStorageLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filterLang, inventory]);

  const shownLangs = filterLang === 'all' ? LANGS : LANGS.filter((l) => l.code === filterLang);
  const showKanjiColumn = shownLangs.some((l) => l.code === 'ja');
  const filterLabel = filterLang === 'all' ? 'toutes les langues' : LANGS.find((l) => l.code === filterLang)?.label ?? filterLang;

  const maxDbBar = storage ? Math.max(1, ...storage.dbByLevel.map((l) => l.bytes)) : 1;
  const maxStorageBar = storage ? Math.max(1, ...storage.storageByLevel.map((l) => l.bytes)) : 1;

  return (
    <div className="scores-overlay" onClick={onClose}>
      <div className="scores-modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="scores-header">
          <h2 style={{ margin: 0, fontFamily: 'Fraunces, Georgia, serif' }}>Réglages</h2>
          <button className="conv-mini-btn" onClick={onClose}>
            Fermer ✕
          </button>
        </div>

        <div className="cascade-row" style={{ marginBottom: '1rem' }}>
          <label className="eyebrow-free" style={{ marginBottom: 0 }} htmlFor="settings-lang">
            Afficher les volumes pour :
          </label>
          <select id="settings-lang" className="cascade-select" value={filterLang} onChange={(e) => setFilterLang(e.target.value)}>
            <option value="all">Toutes les langues</option>
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="conv-warning">{error}</p>}
        {!inventory && !error && <p className="eyebrow-free">Chargement…</p>}

        {inventory && (
          <div className="settings-section">
            <div className="sidebar-label">Contenu généré par langue et niveau</div>
            <div className="inv-table-wrap">
              <table className="inv-table">
                <thead>
                  <tr>
                    <th>Langue</th>
                    <th>Niveau</th>
                    <th>Phrases</th>
                    <th>Vocabulaire</th>
                    <th>Écoute</th>
                    <th>Écriture</th>
                    {showKanjiColumn && <th>Kanji</th>}
                  </tr>
                </thead>
                <tbody>
                  {shownLangs.map((lang) => {
                    const langRows = inventory.rows.filter((r) => r.languageCode === lang.code);
                    return langRows.map((row, i) => (
                      <tr key={`${lang.code}-${row.levelCode}`}>
                        {i === 0 && (
                          <td rowSpan={langRows.length} className="inv-lang-cell">
                            <span className="inv-lang-cell-inner">
                              <FlagIcon code={lang.code} /> {lang.label}
                            </span>
                          </td>
                        )}
                        <td>
                          <span
                            className="inv-level-badge"
                            style={{ background: LEVELS.find((l) => l.code === row.levelCode)?.color }}
                          >
                            {row.levelCode}
                          </span>
                        </td>
                        <td>
                          <CellBadge {...row.phrases} />
                        </td>
                        <td>
                          <CellBadge {...row.vocabulary} />
                        </td>
                        <td>
                          <CellBadge {...row.listening} />
                        </td>
                        <td>
                          <CellBadge {...row.writing} />
                        </td>
                        {showKanjiColumn && <td>{row.kanji ? <CellBadge {...row.kanji} /> : <span className="eyebrow-free">—</span>}</td>}
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>

            <div className="sidebar-label" style={{ marginTop: '1.25rem' }}>
              Grammaire (tous niveaux) et verbes (par niveau)
            </div>
            <div className="inv-table-wrap">
              <table className="inv-table">
                <thead>
                  <tr>
                    <th>Langue</th>
                    <th>Fiches de grammaire</th>
                    <th>Quiz de grammaire</th>
                    <th>Verbes conjugués (120 par niveau)</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.langWide.filter((r) => filterLang === 'all' || r.languageCode === filterLang).map((row) => {
                    const lang = LANGS.find((l) => l.code === row.languageCode)!;
                    return (
                      <tr key={row.languageCode}>
                        <td className="inv-lang-cell">
                          <span className="inv-lang-cell-inner">
                            <FlagIcon code={lang.code} /> {lang.label}
                          </span>
                        </td>
                        <td>
                          <CellBadge {...row.grammarTopics} />
                        </td>
                        <td>
                          <CellBadge {...row.grammarQuiz} />
                        </td>
                        <td>
                          <CellBadge {...row.conjugation} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {storage && (
          <div className="settings-section">
            <div className="sidebar-label">
              Base de données — {formatMB(storage.dbUsedBytes)} Mo / {formatMB(storage.dbQuotaBytes)} Mo utilisés (
              {formatMB(storage.dbQuotaBytes - storage.dbUsedBytes)} Mo restants)
            </div>
            <p className="eyebrow-free">
              Répartition par niveau estimée (au prorata du nombre de lignes par table) — {filterLabel} : ≈{' '}
              {formatMB(storage.dbLanguageBytes)} Mo{storageLoading ? ' (mise à jour…)' : ''}.
            </p>
            <div className="storage-bar-row">
              {storage.dbByLevel.map((l) => (
                <div key={l.level} className="storage-bar-col">
                  <div className="storage-bar-value">{formatMB(l.bytes)} Mo</div>
                  <div
                    className="storage-bar"
                    style={{
                      height: `${Math.max(4, (l.bytes / maxDbBar) * 100)}px`,
                      background: LEVELS.find((lv) => lv.code === l.level)?.color,
                    }}
                  />
                  <div className="storage-bar-label">{l.level}</div>
                </div>
              ))}
            </div>

            <div className="sidebar-label" style={{ marginTop: '1.5rem' }}>
              Stockage audio/fichiers — {formatMB(storage.storageUsedBytes)} Mo / {formatMB(storage.storageQuotaBytes)}{' '}
              Mo utilisés ({formatMB(storage.storageQuotaBytes - storage.storageUsedBytes)} Mo restants)
            </div>
            <p className="eyebrow-free">
              Répartition par niveau exacte (basée sur les chemins réels des fichiers) — {filterLabel} :{' '}
              {formatMB(storage.storageLanguageBytes)} Mo{storageLoading ? ' (mise à jour…)' : ''}. Les audios de conjugaison et de
              réécoute hors niveau ne figurent pas dans les barres.
            </p>
            <div className="storage-bar-row">
              {storage.storageByLevel.map((l) => (
                <div key={l.level} className="storage-bar-col">
                  <div className="storage-bar-value">{formatMB(l.bytes)} Mo</div>
                  <div
                    className="storage-bar"
                    style={{
                      height: `${Math.max(4, (l.bytes / maxStorageBar) * 100)}px`,
                      background: LEVELS.find((lv) => lv.code === l.level)?.color,
                    }}
                  />
                  <div className="storage-bar-label">{l.level}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
