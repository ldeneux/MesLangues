'use client';

import React, { useState } from 'react';
import ModeIcon from '@/components/ModeIcon';
import TeamAvatar from '@/components/TeamAvatar';
import CockpitQR from '@/components/CockpitQR';

// Habillage « Défaut » : disposition sobre pour jouer entre adultes, sans décor.
// Barre du haut (icône, actions, profil, statistiques, paramétrage), menu des modes à gauche, équipes puis QR à droite.
// Seuls les avatars (modes et équipes) restent ; l'écran de jeu est celui de GameArea hors cockpit.
export type SoberMode = { id: string; label: string; emoji: string; desc: string };
export type SoberTeam = { id: string; name: string; avatar: string; color: string; score?: number };
export type SoberProfile = { id: string; name: string; is_default?: boolean; is_favorite?: boolean };

const INK = '#1f1f1f';
const MUTED = '#6b665c';
const LINE = '#e4dfd2';
const BG = '#f5f2ea';
const ACCENT = '#8a7fd6';
const CARD: React.CSSProperties = { background: '#fff', border: `1.5px solid ${LINE}`, borderRadius: 14, boxShadow: '0 3px 0 #ddd7c6' };
const SERIF = "Georgia, 'Times New Roman', serif";

type Props = {
  modes: SoberMode[];
  activeMode: string;
  onSelectMode: (id: string) => void;
  teams: SoberTeam[];
  onTeamClick: (t: SoberTeam) => void;
  joinCode: string | null;
  origin: string;
  copiedJoin: boolean;
  onCopyJoin: () => void;
  profiles: SoberProfile[];
  selectedProfileId: string;
  onSelectProfile: (id: string) => void;
  gameStarted: boolean;
  canStart: boolean;
  onStart: () => void;
  onNewGame: () => void;
  onStats: () => void;
  onFullscreen: () => void;
  error: string | null;
  notice?: string | null;
  children?: React.ReactNode; // l'écran de jeu quand la partie est lancée
};

const roundBtn: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: '50%',
  border: `1.5px solid ${LINE}`,
  background: '#fff',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 17,
  cursor: 'pointer',
  textDecoration: 'none',
  color: INK,
};

function Pill({ id, label, color, onClick, disabled, href }: { id?: string; label: string; color: string; onClick?: () => void; disabled?: boolean; href?: string }) {
  const style: React.CSSProperties = {
    background: color,
    color: color === ACCENT ? '#fff' : '#2c2a24',
    border: 'none',
    borderRadius: 12,
    padding: '10px 18px',
    fontWeight: 800,
    fontSize: 14,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    boxShadow: '0 3px 0 rgba(0,0,0,0.12)',
    textDecoration: 'none',
    fontFamily: 'inherit',
  };
  return href ? (
    <a id={id} href={href} style={style}>{label}</a>
  ) : (
    <button id={id} type="button" disabled={disabled} onClick={onClick} className="sb-pill" style={style}>{label}</button>
  );
}

export default function SoberConsole(p: Props) {
  const [profileOpen, setProfileOpen] = useState(false);
  const mode = p.modes.find((m) => m.id === p.activeMode) ?? p.modes[0];
  const selectedProfile = p.profiles.find((x) => x.id === p.selectedProfileId);
  const sortedTeams = p.teams;

  return (
    <main style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: BG, color: INK, fontFamily: 'Inter, sans-serif', overflow: 'hidden' }}>
      <style>{`
        .sb-pill:hover:not(:disabled){filter:brightness(1.05)}
        .sb-item:hover{background:#ebe6d8}
        .sb-row:hover{background:#faf8f2}
        .sb-qr .ck-qr{box-shadow:none !important;border-radius:10px !important;border:1px solid ${LINE}}
      `}</style>

      {/* Barre du haut */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 28, padding: '12px 28px', borderBottom: `1px solid ${LINE}`, flex: '0 0 auto' }}>
        <img src="/icon-192.png" alt="Quiz Party" width={68} height={68} style={{ borderRadius: 16, display: 'block' }} />
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.08em', color: MUTED, marginBottom: 6 }}>PARTIE</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Pill id={p.gameStarted ? undefined : 'ck-fusee'} label="▶ Démarrer" color={ACCENT} onClick={p.onStart} disabled={!p.canStart || p.gameStarted} />
            <Pill label="Nouvelle partie" color="#92d3e1" onClick={p.onNewGame} />
            <Pill id="ck-plein" label="Plein écran" color="#bcd9a0" onClick={p.onFullscreen} />
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <a id="ck-parametrage" href="/parametrage" title="Paramétrage" aria-label="Paramétrage" style={roundBtn}>⚙️</a>
        <button id="ck-stats" type="button" title="Statistiques" aria-label="Statistiques" onClick={p.onStats} style={roundBtn}>📊</button>
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            disabled={p.gameStarted}
            title={p.gameStarted ? 'Impossible de changer en cours de partie' : 'Choisir les questions de la partie'}
            onClick={() => setProfileOpen((o) => !o)}
            style={{ ...CARD, boxShadow: 'none', minWidth: 210, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600, cursor: p.gameStarted ? 'default' : 'pointer', opacity: p.gameStarted ? 0.6 : 1, fontFamily: 'inherit', color: INK }}
          >
            <span aria-hidden>🗂️</span>
            <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedProfile ? selectedProfile.name : 'Toutes les questions'}</span>
            <span style={{ fontSize: 10, color: MUTED }}>▼</span>
          </button>
          {profileOpen && !p.gameStarted && (
            <>
              <div onClick={() => setProfileOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
              <div style={{ ...CARD, position: 'absolute', right: 0, top: 'calc(100% + 6px)', minWidth: '100%', maxHeight: 320, overflowY: 'auto', zIndex: 20, padding: 6 }}>
                {[{ id: '', name: 'Toutes les questions' } as SoberProfile, ...p.profiles].map((pr) => (
                  <div
                    key={pr.id || 'none'}
                    className="sb-item"
                    onClick={() => {
                      setProfileOpen(false);
                      p.onSelectProfile(pr.id);
                    }}
                    style={{ padding: '8px 12px', borderRadius: 8, fontSize: 14, fontWeight: pr.id === p.selectedProfileId ? 800 : 500, cursor: 'pointer', background: pr.id === p.selectedProfileId ? '#efeadc' : undefined, whiteSpace: 'nowrap' }}
                  >
                    {pr.is_default ? '🏠 ' : pr.is_favorite ? '⭐ ' : ''}{pr.name}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </header>

      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '240px minmax(0, 1fr) 240px' }}>
        {/* Menu des modes */}
        <nav style={{ borderRight: `1px solid ${LINE}`, padding: '24px 16px', overflowY: 'auto' }}>
          <div style={{ borderTop: `1px solid ${LINE}`, marginBottom: 14 }} />
          {p.modes.map((m) => {
            const active = m.id === p.activeMode;
            return (
              <button
                key={m.id}
                type="button"
                className={active ? undefined : 'sb-item'}
                disabled={p.gameStarted}
                onClick={() => p.onSelectMode(m.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '10px 12px', marginBottom: 4, border: active ? '2px solid #111' : '2px solid transparent', borderRadius: 10, background: active ? '#1f1f1f' : 'transparent', color: active ? '#fff' : '#3b3830', fontWeight: 700, fontSize: 15, cursor: p.gameStarted ? 'default' : 'pointer', opacity: p.gameStarted && !active ? 0.5 : 1, fontFamily: 'inherit' }}
              >
                <ModeIcon mode={m.id} size={22} />
                {m.label}
              </button>
            );
          })}
        </nav>

        {/* Centre : présentation du mode, puis écran de jeu */}
        <section style={{ padding: '26px 32px', overflowY: 'auto', minWidth: 0 }}>
          {p.error && <div style={{ background: '#fdeaea', border: '1.5px solid #f3b8b8', color: '#a33', borderRadius: 10, padding: '10px 14px', fontWeight: 600, fontSize: 14, marginBottom: 14 }}>{p.error}</div>}
          {p.gameStarted ? (
            <div style={{ ...CARD, padding: 24 }}>{p.children}</div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
                <h1 style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 700, margin: 0 }}>
                  <ModeIcon mode={mode.id} size={30} style={{ marginRight: 12, verticalAlign: '-0.15em' }} />
                  {mode.label}
                </h1>
                <span style={{ fontSize: 13.5, color: MUTED }}>
                  {p.teams.length} équipe{p.teams.length > 1 ? 's' : ''} connectée{p.teams.length > 1 ? 's' : ''}
                </span>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: '#ddd7c6', margin: '14px 0 22px' }} />
              <p style={{ fontSize: 16, lineHeight: 1.6, color: '#3b3830', maxWidth: 680, margin: '0 0 22px' }}>{mode.desc}</p>
              {p.notice && <p style={{ color: '#b3541e', fontWeight: 700, fontSize: 14, margin: '0 0 16px' }}>{p.notice}</p>}
              <button
                type="button"
                disabled={!p.canStart}
                onClick={p.onStart}
                style={{ background: '#1f1f1f', color: '#fff', border: 'none', borderRadius: 12, padding: '13px 26px', fontWeight: 800, fontSize: 16, cursor: p.canStart ? 'pointer' : 'default', opacity: p.canStart ? 1 : 0.45, boxShadow: '0 3px 0 rgba(0,0,0,0.25)', fontFamily: 'inherit' }}
              >
                Commencer la partie
              </button>
              {p.teams.length === 0 && <p style={{ color: MUTED, fontSize: 14, marginTop: 14 }}>En attente d'une première équipe : scanne le QR code à droite.</p>}
            </>
          )}
        </section>

        {/* Équipes puis QR */}
        <aside style={{ borderLeft: `1px solid ${LINE}`, padding: '24px 16px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ borderTop: `1px solid ${LINE}`, marginBottom: 14 }} />
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', color: MUTED, marginBottom: 10 }}>ÉQUIPES</div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sortedTeams.length === 0 && <div style={{ fontSize: 14, color: MUTED }}>Aucune équipe connectée</div>}
            {sortedTeams.map((t) => (
              <div
                key={t.id}
                className="sb-row"
                onClick={() => p.onTeamClick(t)}
                title="Clic : actions sur l'équipe"
                style={{ ...CARD, boxShadow: 'none', borderLeft: `5px solid ${t.color}`, display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}
              >
                <TeamAvatar avatar={t.avatar} size={26} />
                <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                <span style={{ color: MUTED, fontWeight: 600, fontSize: 13 }}>{t.score ?? 0}</span>
              </div>
            ))}
          </div>
          <div style={{ ...CARD, padding: 14, marginTop: 14, textAlign: 'center' }}>
            {p.joinCode ? (
              <>
                <div className="sb-qr" onClick={p.onCopyJoin} title="Clic : copier le lien pour rejoindre" style={{ width: 150, margin: '0 auto', cursor: 'pointer' }}>
                  <CockpitQR url={`${p.origin}/join?code=${p.joinCode}`} />
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.06em', color: p.copiedJoin ? '#1d8f74' : MUTED, marginTop: 10 }}>{p.copiedJoin ? 'LIEN COPIÉ ✓' : 'SCANNE POUR REJOINDRE'}</div>
                <div style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 24, fontWeight: 800, letterSpacing: '0.18em', marginTop: 4 }}>{p.joinCode}</div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 2, wordBreak: 'break-all' }}>{p.origin.replace(/^https?:\/\//, '')}/join</div>
              </>
            ) : (
              <div style={{ fontSize: 14, color: MUTED }}>Création de la partie…</div>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}

// Fenêtre de dialogue sobre (actions d'équipe, nouvelle partie)
export function SoberDialog({ title, children, actions, onClose }: { title: string; children?: React.ReactNode; actions: { label: string; onClick: () => void; kind?: 'primary' | 'danger' | 'ghost' }[]; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(31,31,31,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title} style={{ ...CARD, width: 'min(440px, 92vw)', padding: 28, fontFamily: 'Inter, sans-serif', color: INK }}>
        <h2 style={{ fontFamily: SERIF, fontSize: 22, margin: '0 0 10px' }}>{title}</h2>
        {children && <div style={{ fontSize: 14.5, lineHeight: 1.5, color: '#3b3830', marginBottom: 18 }}>{children}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              style={{ padding: '11px 16px', borderRadius: 10, fontWeight: 700, fontSize: 14.5, cursor: 'pointer', fontFamily: 'inherit', border: a.kind === 'ghost' || !a.kind ? `1.5px solid ${LINE}` : 'none', background: a.kind === 'primary' ? '#1f1f1f' : a.kind === 'danger' ? '#c0392b' : '#fff', color: a.kind === 'primary' || a.kind === 'danger' ? '#fff' : INK }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
