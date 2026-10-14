'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import GameArea from '@/components/GameArea';
import { ckLed } from '@/lib/cockpitUi';
import CockpitMsgBox from '@/components/CockpitMsgBox';
import CockpitPlate from '@/components/CockpitPlate';
import TeamAvatar from '@/components/TeamAvatar';
import { PlateId, rectStyle } from '@/lib/themes';
import { useLayout } from '@/lib/useLayout';
import { LayoutOverlays, LayoutPanels } from '@/components/LayoutEditor';
import ModeIcon from '@/components/ModeIcon';
import { useTheme } from '@/lib/useTheme';
import MascotPortal from '@/components/MascotPortal';
import CockpitQR from '@/components/CockpitQR';
import SoberConsole, { SoberDialog } from '@/components/SoberConsole';

const MODES = [
  {
    id: 'classique',
    label: 'Classique',
    emoji: '🎯',
    color: '#6c7bf7',
    desc: '1 point par bonne réponse, avec un bonus de rapidité pour les 3 premières équipes correctes (+3/+2/+1). Objectif : 150 points.',
  },
  {
    id: 'defi',
    label: 'Défi',
    emoji: '⚔️',
    color: '#a26ce0',
    desc: "Une équipe choisit le thème et joue : elle gagne 3 pts par bonne réponse sans jamais en perdre. Les adversaires qui se trompent perdent 2 pts, reversés à l'équipe qui a lancé le défi.",
  },
  {
    id: 'survie',
    label: 'Survie',
    emoji: '❤️',
    color: '#ff7a68',
    desc: '3 vies par équipe. Une mauvaise réponse (ou pas de réponse) coûte une vie. Les points aux équipes éliminées augmentent à chaque manche.',
  },
  {
    id: 'participatif',
    label: 'Participatif',
    emoji: '🤝',
    color: '#35c2a3',
    desc: 'Une cagnotte commune double à chaque bonne réponse en chaîne. Une erreur la redistribue à toutes les équipes.',
  },
  {
    id: 'camembert',
    label: 'Trivial Poursuit',
    emoji: '🥧',
    color: '#ffb648',
    desc: "À tour de rôle, une équipe choisit une catégorie (sur son téléphone) parmi les 6 à 10 \"camemberts\" du profil. 3 bonnes réponses d'affilée dans une catégorie = 1 part gagnée définitivement. Une erreur remet à zéro la progression en cours, sauf Joker (gagné à chaque part complétée, max 3). Première équipe avec toutes ses parts : +50 pts bonus. Nécessite un profil marqué 🎡 Trivial Poursuit (10 catégories distinctes).",
  },
];


type Team = {
  id: string;
  name: string;
  avatar: string;
  color: string;
  score: number;
  camembert_won?: string[];
  camembert_jokers?: number;
};
type Profile = {
  id: string;
  name: string;
  is_favorite: boolean;
  is_default: boolean;
  distinctCategoryCount?: number;
  isTrivialEligible?: boolean;
};

const pillLabel: React.CSSProperties = {
  display: 'inline-block',
  background: '#e6f5fd',
  color: '#4fb0e8',
  fontWeight: 800,
  fontSize: 12.5,
  padding: '6px 14px',
  borderRadius: 999,
  marginBottom: 18,
};

export default function ConsolePage() {
  const { theme } = useTheme();
  // Le thème vient du stockage local : on n'affiche la scène qu'une fois monté (évite un flash d'un mauvais décor)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [activeMode, setActiveMode] = useState('classique');

  // Fond de scène : certains habillages (Voyage) changent de décor selon le mode de jeu, avec un fondu enchaîné
  const modeStageSrc = (theme.stageByMode as Record<string, { src: string }> | undefined)?.[activeMode]?.src ?? theme.stage.src;
  const [bgPair, setBgPair] = useState<{ prev: string | null; cur: string }>({ prev: null, cur: modeStageSrc });
  useEffect(() => {
    setBgPair((p) => (p.cur === modeStageSrc ? p : { prev: p.cur, cur: modeStageSrc }));
  }, [modeStageSrc]);
  useEffect(() => {
    Object.values(theme.stageByMode ?? {}).forEach((st) => {
      if (st) new Image().src = st.src; // préchargement : pas de flash au changement de mode
    });
  }, [theme]);
  const [infoMode, setInfoMode] = useState<string | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [creating, setCreating] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const autoCreating = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [gameStarted, setGameStarted] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showNewGameChoice, setShowNewGameChoice] = useState(false);
  const [statsData, setStatsData] = useState<
    Record<string, { teamName: string; teamAvatar: string; categories: Record<string, { correct: number; wrong: number }> }>
  >({});
  const prevTeamsCount = useRef(0);

  useEffect(() => {
    setOrigin(window.location.origin);

    (async () => {
      const { data: profileRows } = await supabase.from('quiz_profiles').select('id, name, is_favorite, is_default');
      const { data: profilePackRows } = await supabase.from('quiz_profile_packs').select('*');
      const { data: packRows } = await supabase.from('question_packs').select('id, category_id');

      const categoryByPackId: Record<string, string> = {};
      (packRows ?? []).forEach((p: any) => {
        if (p.category_id) categoryByPackId[p.id] = p.category_id;
      });

      const packsByProfile: Record<string, string[]> = {};
      (profilePackRows ?? []).forEach((pp: any) => {
        packsByProfile[pp.profile_id] = [...(packsByProfile[pp.profile_id] ?? []), pp.pack_id];
      });

      const list = ((profileRows as Profile[]) ?? []).map((p) => {
        const packIds = packsByProfile[p.id] ?? [];
        const distinctCategoryCount = new Set(packIds.map((id) => categoryByPackId[id]).filter(Boolean)).size;
        return { ...p, distinctCategoryCount, isTrivialEligible: distinctCategoryCount === 10 };
      });

      const sorted = list.sort((a, b) => {
        if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
        if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      setProfiles(sorted);

      const defaultProfile = sorted.find((p) => p.is_default);
      if (defaultProfile && !selectedProfileId) {
        setSelectedProfileId(defaultProfile.id);
      }
    })();
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('quiz-party-game-id');
    if (saved) {
      supabase
        .from('games')
        .select('*')
        .eq('id', saved)
        .single()
        .then(({ data }) => {
          if (data) {
            setGameId(data.id);
            setJoinCode(data.join_code);
            setActiveMode(data.mode ?? 'classique');
          } else {
            localStorage.removeItem('quiz-party-game-id');
          }
          setBootstrapped(true);
        });
    } else {
      setBootstrapped(true);
    }
  }, []);

  // Une partie (donc un code et un QR code) est créée toute seule dès l'ouverture, et après chaque remise à zéro
  useEffect(() => {
    if (!bootstrapped || gameId || autoCreating.current) return;
    autoCreating.current = true;
    inviteTeams(false).finally(() => {
      autoCreating.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrapped, gameId]);

  // Charge + écoute les équipes (jointure, départ, ET score en direct)
  useEffect(() => {
    if (!gameId) return;

    supabase
      .from('teams')
      .select('*')
      .eq('game_id', gameId)
      .then(({ data }) => {
        setTeams((data as Team[]) ?? []);
        prevTeamsCount.current = data?.length ?? 0;
      });

    const ch = supabase.channel(`game:${gameId}:console`);
    ch.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'teams', filter: `game_id=eq.${gameId}` },
      (payload) => setTeams((prev) => [...prev, payload.new as Team])
    );
    ch.on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'teams', filter: `game_id=eq.${gameId}` },
      (payload) => setTeams((prev) => prev.filter((t) => t.id !== (payload.old as { id: string }).id))
    );
    ch.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'teams', filter: `game_id=eq.${gameId}` },
      (payload) => {
        const updated = payload.new as Team;
        setTeams((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      }
    );
    ch.subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [gameId]);

  useEffect(() => {
    if (showInvite && teams.length > prevTeamsCount.current) {
      setShowInvite(false);
    }
    prevTeamsCount.current = teams.length;
  }, [teams, showInvite]);

  // Toutes les mises à jour de la partie passent par le serveur (service role) :
  // les update directs depuis le navigateur étaient bloqués silencieusement par RLS.
  const updateGame = async (fields: { mode?: string; profileId?: string | null; resetCamembert?: boolean }) => {
    if (!gameId) return true;
    try {
      const res = await fetch('/api/update-game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, ...fields }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(`Mise à jour de la partie impossible : ${data.error ?? res.status}`);
        return false;
      }
      return true;
    } catch (e: any) {
      setError(`Mise à jour de la partie impossible : ${e?.message ?? e}`);
      return false;
    }
  };

  const selectMode = async (mode: string) => {
    setActiveMode(mode);

    if (mode === 'camembert') {
      const eligible = profiles.filter((p) => p.isTrivialEligible);
      const currentIsEligible = eligible.some((p) => p.id === selectedProfileId);
      if (!currentIsEligible && eligible.length > 0) {
        setSelectedProfileId(eligible[0].id);
        await updateGame({ profileId: eligible[0].id, resetCamembert: true });
      }
    }

    await updateGame({ mode });
  };

  const selectProfile = async (profileId: string) => {
    setSelectedProfileId(profileId);
    // On efface aussi les thèmes Trivial Poursuit déjà mémorisés pour
    // cette partie : ils appartenaient à l'ancien profil.
    await updateGame({ profileId: profileId || null, resetCamembert: true });
  };

  const fullReset = () => {
    localStorage.removeItem('quiz-party-game-id');
    setGameId(null);
    setJoinCode(null);
    setTeams([]);
    setShowInvite(false);
    setError(null);
    setGameStarted(false);
    setShowNewGameChoice(false);
  };

  // Garde le même code et les mêmes équipes : remet juste les scores à zéro
  // (et les vies, pour le mode Survie) et efface l'historique des
  // questions posées pour repartir sur un pool de questions neuf.
  const restartSameTeams = async () => {
    setShowNewGameChoice(false);
    if (!gameId) return;

    await supabase
      .from('teams')
      .update({ score: 0, lives: 3, camembert_progress: {}, camembert_won: [], camembert_jokers: 0 })
      .eq('game_id', gameId);
    await supabase.from('answers').delete().eq('game_id', gameId);
    await supabase
      .from('games')
      .update({ status: 'lobby', current_question_id: null, camembert_categories: [] })
      .eq('id', gameId);

    const { data: refreshedTeams } = await supabase.from('teams').select('*').eq('game_id', gameId);
    if (refreshedTeams) setTeams(refreshedTeams as Team[]);

    setGameStarted(false);
  };

  // Garde l'habillage de la partie en phase avec celui de la console : une partie déjà créée (reprise via le
  // stockage local) ou un changement d'habillage dans Paramétrage mettent à jour les équipes proposées aux joueurs.
  useEffect(() => {
    if (!gameId || !mounted) return;
    fetch('/api/update-game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, visualTheme: theme.id }),
    }).catch(() => {});
  }, [gameId, theme.id, mounted]);

  const inviteTeams = async (openInvite = true) => {
    setError(null);

    if (gameId) {
      if (openInvite) setShowInvite(true);
      return;
    }

    setCreating(true);
    const res = await fetch('/api/create-game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: activeMode,
        visualTheme: theme.id,
        levelIds: ['CM1'],
        categoryIds: [],
        profileId: selectedProfileId || null,
      }),
    });
    const data = await res.json();

    if (data.error) {
      setError(data.error);
      setCreating(false);
      return;
    }

    setGameId(data.game.id);
    setJoinCode(data.game.join_code);
    localStorage.setItem('quiz-party-game-id', data.game.id);
    setCreating(false);
    if (openInvite) setShowInvite(true);
  };

  const removeTeam = async (teamId: string) => {
    const { error } = await supabase.from('teams').delete().eq('id', teamId);
    if (error) {
      setError(`Impossible de déconnecter l'équipe (${error.message}).`);
      return;
    }
    // Retrait immédiat côté client : la tuile disparaît sans délai et les
    // autres remontent (flexbox column), le nom redevient aussitôt
    // disponible pour une nouvelle équipe sur l'écran de jointure.
    setTeams((prev) => prev.filter((t) => t.id !== teamId));
  };

  const [copiedTeamId, setCopiedTeamId] = useState<string | null>(null);

  const copyTeamLink = async (teamId: string) => {
    const link = `${origin}/play/${gameId}?team=${teamId}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedTeamId(teamId);
      setTimeout(() => setCopiedTeamId(null), 2000);
    } catch {
      window.prompt('Lien de récupération (copie-le manuellement) :', link);
    }
  };

  const [portalOn, setPortalOn] = useState(false);
  const startGame = async () => {
    if (!gameId || portalOn) return;
    // Filet de sécurité final : garantit qu'au moment précis où l'écran de
    // jeu se lance, la base reflète bien le mode et le profil actuellement
    // affichés dans la console, quoi qu'il ait pu se passer avant.
    const ok = await updateGame({ mode: activeMode, profileId: selectedProfileId || null });
    if (!ok) return; // on ne lance pas la partie avec un mauvais profil
    // La mascotte ouvre son portail (vidéo du thème) ; la partie démarre quand il commence à se refermer
    setPortalOn(true);
  };

  const openStats = async () => {
    if (!gameId) return;
    setShowStats(true);

    const { data: answersRows } = await supabase
      .from('answers')
      .select('team_id, choice, question_id')
      .eq('game_id', gameId);

    if (!answersRows || answersRows.length === 0) {
      setStatsData({});
      return;
    }

    const questionIds = Array.from(new Set(answersRows.map((a: any) => a.question_id)));
    const { data: questionsRows } = await supabase
      .from('questions')
      .select('id, category_id, correct_choice')
      .in('id', questionIds);

    const { data: categoriesRows } = await supabase.from('categories').select('id, name');

    const categoryNameById: Record<string, string> = {};
    (categoriesRows ?? []).forEach((c: any) => (categoryNameById[c.id] = c.name));

    const questionById: Record<string, any> = {};
    (questionsRows ?? []).forEach((q: any) => (questionById[q.id] = q));

    const result: typeof statsData = {};
    teams.forEach((t) => {
      result[t.id] = { teamName: t.name, teamAvatar: t.avatar, categories: {} };
    });

    answersRows.forEach((a: any) => {
      const q = questionById[a.question_id];
      if (!q) return;
      const catName = categoryNameById[q.category_id] ?? 'Sans catégorie';
      if (!result[a.team_id]) return; // équipe supprimée depuis
      if (!result[a.team_id].categories[catName]) {
        result[a.team_id].categories[catName] = { correct: 0, wrong: 0 };
      }
      if (a.choice === q.correct_choice) {
        result[a.team_id].categories[catName].correct++;
      } else {
        result[a.team_id].categories[catName].wrong++;
      }
    });

    setStatsData(result);
  };

  const activeModeInfo = MODES.find((m) => m.id === activeMode) ?? MODES[0];
  const [profileOpen, setProfileOpen] = useState(false);
  const [explainActive, setExplainActive] = useState(false);
  // Équipes : tri (points décroissants puis ordre alphabétique), infobulle au survol, action au clic
  const stageRef = useRef<HTMLDivElement>(null);
  const L = useLayout(theme, stageRef); // disposition personnalisable (zones, icônes, couleurs)
  const zones = L.zones;
  const [teamTip, setTeamTip] = useState<{ t: Team; left: number; top: number } | null>(null);
  const [teamAction, setTeamAction] = useState<Team | null>(null);
  const sortedTeams = [...teams].sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.name.localeCompare(b.name, 'fr'));
  const showTeamTip = (e: React.MouseEvent<HTMLElement>, t: Team) => {
    const st = stageRef.current?.getBoundingClientRect();
    const r = e.currentTarget.getBoundingClientRect();
    if (!st) return;
    setTeamTip({ t, left: ((r.right - st.left) / st.width) * 100 + 0.6, top: ((r.top - st.top) / st.height) * 100 });
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.();
  };
  const [copiedJoin, setCopiedJoin] = useState(false);
  const copyJoinUrl = async () => {
    if (!joinCode) return;
    try {
      await navigator.clipboard.writeText(`${origin}/join?code=${joinCode}`);
      setCopiedJoin(true);
      setTimeout(() => setCopiedJoin(false), 1800);
    } catch {
      setError("Impossible de copier le lien (autorisation du presse-papiers refusée)");
    }
  };
  // Emplacement fixe d'un bouton du pupitre : il ne bouge jamais, seul son état (actif / grisé) change
  const PH = 5.2;
  const slot = (id: string, plate: PlateId, children?: React.ReactNode) => {
    const pp = L.plateProps(plate);
    return (
      <div id={id} className={pp.className} onPointerDown={pp.onPointerDown} style={{ width: `${(PH * (theme.plates[plate].scale ?? 1) * theme.plates[plate].ratio).toFixed(2)}cqw`, height: `${(PH * (theme.plates[plate].scale ?? 1)).toFixed(2)}cqw`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...pp.style }}>
        {children}
      </div>
    );
  };
  // Bouton de la barre de menu (paramétrage, stats, nouvelle partie, plein écran) : même enveloppe que slot()
  const barItem = (plate: PlateId, el: React.ReactNode) => {
    const pp = L.plateProps(plate);
    return (
      <div className={pp.className} onPointerDown={pp.onPointerDown} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...pp.style }}>
        {el}
      </div>
    );
  };
  // Raccourcis clavier de l'hôte : Espace = fusée (démarrer / question suivante), S = statistiques, P = progression, F = plein écran
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable)) return;
      const ids: Record<string, string> = { ' ': 'ck-fusee', s: 'ck-stats', p: 'ck-progression', f: 'ck-plein' };
      const target = ids[e.key.toLowerCase()];
      if (!target) return;
      const btn = document.getElementById(target) as HTMLElement | null;
      if (!btn || btn.getAttribute('aria-disabled') === 'true') return;
      e.preventDefault();
      (document.activeElement as HTMLElement | null)?.blur?.();
      btn.click();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const selectedProfile = profiles.find((p) => p.id === selectedProfileId);
  const eligibleProfiles = activeMode === 'camembert' ? profiles.filter((p) => p.isTrivialEligible) : profiles;

  // Fenêtres communes aux deux dispositions (statistiques, invitation)
  const sharedModals = (
    <>
      {/* Fenêtre statistiques */}
      {showStats && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(31,36,64,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 24,
              padding: 32,
              maxWidth: 640,
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto',
              position: 'relative',
              boxShadow: '0 20px 50px -12px rgba(31,36,64,0.3)',
            }}
          >
            <button
              onClick={() => setShowStats(false)}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                border: 'none',
                background: '#f4f6fb',
                borderRadius: '50%',
                width: 32,
                height: 32,
                fontSize: 14,
                cursor: 'pointer',
                color: '#7a819c',
              }}
            >
              ✕
            </button>

            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 18 }}>📊 Réponses par équipe et par catégorie</h2>

            {Object.keys(statsData).length === 0 ? (
              <p style={{ color: '#7a819c', fontSize: 13.5 }}>Aucune réponse enregistrée pour l'instant.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {Object.entries(statsData).map(
                  ([
                    teamId,
                    data,
                  ]: [
                    string,
                    { teamName: string; teamAvatar: string; categories: Record<string, { correct: number; wrong: number }> }
                  ]) => (
                    <div key={teamId}>
                      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>
                        <TeamAvatar avatar={data.teamAvatar} /> {data.teamName}
                      </div>
                      {Object.keys(data.categories).length === 0 ? (
                        <p style={{ color: '#7a819c', fontSize: 12.5, marginLeft: 8 }}>Pas encore de réponse.</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {Object.entries(data.categories).map(([catName, counts]: [string, { correct: number; wrong: number }]) => (
                            <div
                              key={catName}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: 13,
                                background: '#f4f6fb',
                                borderRadius: 10,
                                padding: '6px 12px',
                              }}
                            >
                              <span>{catName}</span>
                              <span>
                                <span style={{ color: '#35c2a3', fontWeight: 700 }}>{counts.correct} ✓</span>
                                {'  '}
                                <span style={{ color: '#ff7a68', fontWeight: 700 }}>{counts.wrong} ✕</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fenêtre d'invitation */}
      {showInvite && joinCode && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(31,36,64,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 24,
              padding: 36,
              maxWidth: 420,
              width: '90%',
              textAlign: 'center',
              position: 'relative',
              boxShadow: '0 20px 50px -12px rgba(31,36,64,0.3)',
            }}
          >
            <button
              onClick={() => setShowInvite(false)}
              title="Fermer"
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                border: 'none',
                background: '#f4f6fb',
                borderRadius: '50%',
                width: 32,
                height: 32,
                fontSize: 14,
                cursor: 'pointer',
                color: '#7a819c',
              }}
            >
              ✕
            </button>

            <p style={{ color: '#7a819c', marginBottom: 8 }}>En attente de l'équipe…</p>
            <div style={{ color: '#7a819c', fontSize: 13, marginBottom: 16 }}>
              Rejoindre sur : <strong>{origin}/join</strong>
            </div>
            <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: 8, color: '#6c7bf7' }}>{joinCode}</div>
          </div>
        </div>
      )}
    </>
  );

  if (!mounted) return <main style={{ minHeight: '100vh', background: '#03040c' }} />;

  // Habillage « Défaut » : disposition sobre (pas de scène cockpit, pas de portail d'intro)
  if (theme.layout === 'sober') {
    const startSober = async () => {
      if (!gameId || gameStarted) return;
      const ok = await updateGame({ mode: activeMode, profileId: selectedProfileId || null });
      if (ok) setGameStarted(true);
    };
    return (
      <>
        <SoberConsole
          modes={MODES}
          activeMode={activeMode}
          onSelectMode={selectMode}
          teams={sortedTeams}
          onTeamClick={(t) => setTeamAction(teams.find((x) => x.id === t.id) ?? null)}
          joinCode={joinCode}
          origin={origin}
          copiedJoin={copiedJoin}
          onCopyJoin={copyJoinUrl}
          profiles={eligibleProfiles}
          selectedProfileId={selectedProfileId}
          onSelectProfile={selectProfile}
          gameStarted={gameStarted}
          canStart={!!gameId && teams.length > 0}
          onStart={startSober}
          onNewGame={() => setShowNewGameChoice(true)}
          onStats={openStats}
          onFullscreen={toggleFullscreen}
          error={error}
          notice={activeMode === 'camembert' && eligibleProfiles.length === 0 ? 'Aucun profil ne convient au Trivial Poursuit (il faut 10 catégories).' : null}
        >
          {gameId && <GameArea gameId={gameId} initialMode={activeMode} cockpit={false} onRestart={() => setShowNewGameChoice(true)} onClose={() => setGameStarted(false)} />}
        </SoberConsole>

        {teamAction && (
          <SoberDialog
            title={teamAction.name}
            onClose={() => setTeamAction(null)}
            actions={[
              { label: copiedTeamId === teamAction.id ? 'Lien copié ✓' : 'Copier le lien de récupération', onClick: () => copyTeamLink(teamAction.id), kind: 'ghost' },
              {
                label: "Déconnecter l'équipe",
                kind: 'danger',
                onClick: async () => {
                  await removeTeam(teamAction.id);
                  setTeamAction(null);
                },
              },
              { label: 'Fermer', onClick: () => setTeamAction(null), kind: 'ghost' },
            ]}
          >
            <TeamAvatar avatar={teamAction.avatar} size={22} /> {teamAction.score ?? 0} point{(teamAction.score ?? 0) > 1 ? 's' : ''}
          </SoberDialog>
        )}

        {showNewGameChoice && (
          <SoberDialog
            title="Nouvelle partie"
            onClose={() => setShowNewGameChoice(false)}
            actions={[
              { label: 'Garder les mêmes équipes', onClick: restartSameTeams, kind: 'primary' },
              { label: "Changer d'équipes (nouveau code)", onClick: fullReset, kind: 'ghost' },
              { label: 'Annuler', onClick: () => setShowNewGameChoice(false), kind: 'ghost' },
            ]}
          >
            Garder les mêmes équipes : même code, scores remis à zéro.
          </SoberDialog>
        )}
        {sharedModals}
      </>
    );
  }

  return (
    <main style={{ minHeight: '100vh', background: theme.stage.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
      {/* Scène cockpit : ratio fixe de l'image, tout est positionné en % (et texte en cqw) pour rester aligné */}
      <div
        ref={stageRef}
        style={
          {
            position: 'relative',
            width: `min(100vw, calc(100vh * ${theme.stage.ratio}))`,
            aspectRatio: `${theme.stage.ratio}`,
            containerType: 'size',
            backgroundImage: `url(${theme.stage.src})`,
            backgroundSize: '100% 100%',
            isolation: 'isolate',
            color: '#e8eeff',
            overflow: 'hidden',
            userSelect: 'none',
          } as React.CSSProperties
        }
      >
        {theme.stageByMode && (
          <>
            <style>{`@keyframes ck-bgfade{from{opacity:0}to{opacity:1}}`}</style>
            {bgPair.prev && <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: -2, backgroundImage: `url(${bgPair.prev})`, backgroundSize: '100% 100%', pointerEvents: 'none' }} />}
            <div key={bgPair.cur} aria-hidden style={{ position: 'absolute', inset: 0, zIndex: -1, backgroundImage: `url(${bgPair.cur})`, backgroundSize: '100% 100%', pointerEvents: 'none', animation: 'ck-bgfade .8s ease both' }} />
          </>
        )}
        <style>{`
          .ck-recolor, .ck-recolor *{color:var(--ck-color) !important}
          .ck-edit-planet *{pointer-events:none !important}
          .ck-scroll{scrollbar-width:thin;scrollbar-color:rgba(90,140,255,.75) transparent}
          .ck-scroll::-webkit-scrollbar{width:5px}
          .ck-scroll::-webkit-scrollbar-thumb{background:rgba(90,140,255,.75);border-radius:4px}
          .ck-scroll::-webkit-scrollbar-track{background:transparent}
          .ck-key:hover:not(:disabled){filter:brightness(1.25)}
          .ck-key:active:not(:disabled){transform:translateY(1px)}
          .ck-plate{background:none;border:none;padding:0;position:relative;display:block;transition:transform .15s, filter .2s}
          .ck-plate:hover:not([aria-disabled="true"]){transform:translateY(-0.2cqw) scale(1.06);filter:drop-shadow(0 0 1.1cqw rgba(110,170,255,.9))}
          .ck-plate:active:not([aria-disabled="true"]){transform:translateY(0.1cqw) scale(1)}
          .ck-plate:focus-visible{outline:2px solid #7fd1ff;outline-offset:3px;border-radius:1cqw}
          .ck-pulse{animation:ck-pulse 1.8s ease-in-out infinite}
          @keyframes ck-pulse{0%,100%{filter:drop-shadow(0 0 .3cqw rgba(160,120,255,.5))}50%{filter:drop-shadow(0 0 1.5cqw rgba(180,140,255,1))}}
        `}</style>

        {/* Écran gauche : une ligne par équipe (emoji + nom), triées par points puis par ordre alphabétique ; détails en infobulle, clic = actions */}
        <div className={`ck-scroll ${L.fx('teams').className}`} style={{ position: 'absolute', ...rectStyle(zones.teams), overflowY: 'auto', boxSizing: 'border-box', padding: '0.4cqw', ...theme.sidePanelStyle, ...L.fx('teams').style }}>
          <div style={{ fontSize: '0.9cqw', fontWeight: 800, color: '#7fd1ff', letterSpacing: '0.1cqw', marginBottom: '0.4cqw' }}>ÉQUIPES</div>
          {teams.length === 0 && <div style={{ fontSize: '0.9cqw', color: '#8a97c4' }}>Aucune équipe connectée</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3cqw' }}>
            {sortedTeams.map((t) => (
              <div
                key={t.id}
                className={L.fx('teamRows').className}
                onClick={() => {
                  setTeamTip(null);
                  setTeamAction(t);
                }}
                onMouseEnter={(e) => showTeamTip(e, t)}
                onMouseLeave={() => setTeamTip(null)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.45cqw', borderLeft: `0.3cqw solid ${t.color}`, borderRadius: '0.5cqw', padding: '0.25cqw 0.5cqw', fontWeight: 700, fontSize: '1cqw', background: 'rgba(10,18,50,0.75)', cursor: 'pointer', ...L.fx('teamRows').style }}
              >
                <TeamAvatar avatar={t.avatar} size="1.7em" />
                <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Petit afficheur sous l'écran gauche : nombre d'équipes */}
        <div className={L.fx('teamCount').className} style={{ position: 'absolute', ...rectStyle(zones.teamCount), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5cqw', background: 'rgba(3,8,30,0.9)', border: '1px solid rgba(90,170,255,0.55)', borderRadius: '0.4cqw', boxShadow: '0 0 0.8cqw rgba(60,130,255,0.4)', fontSize: '0.85cqw', fontWeight: 800, letterSpacing: '0.12cqw', color: '#9fc4ff', ...L.fx('teamCount').style }}>
          <span style={ckLed(teams.length > 0 ? '#4dffb0' : '#ff9a5a')} />
          {teams.length} ÉQUIPE{teams.length > 1 ? 'S' : ''}
        </div>

        {/* Écran droit : adresse pour rejoindre (avant la partie) puis explication de la réponse (injectée par GameArea) */}
        <div className={L.fx('join').className} style={{ position: 'absolute', ...rectStyle(zones.join), overflow: 'hidden', boxSizing: 'border-box', padding: '0.4cqw', ...theme.sidePanelStyle, ...L.fx('join').style }}>
          {!explainActive &&
            (joinCode ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4cqw', paddingTop: `${theme.joinPadTop}cqw` }}>
                <div onClick={copyJoinUrl} title="Clic : copier le lien pour rejoindre" style={{ width: `${theme.qrWidth}cqw`, cursor: 'pointer' }}>
                  <CockpitQR url={`${origin}/join?code=${joinCode}`} />
                </div>
                <div style={{ fontSize: '0.75cqw', fontWeight: 800, letterSpacing: '0.04cqw', color: copiedJoin ? '#4dffb0' : '#9fc4ff', textAlign: 'center' }}>
                  {copiedJoin ? 'LIEN COPIÉ ✓' : 'SCANNE POUR REJOINDRE'}
                </div>
                <div style={{ fontSize: '0.65cqw', color: '#8a97c4', wordBreak: 'break-all', textAlign: 'center', lineHeight: 1.3 }}>
                  ou saisis le code sur {origin.replace(/^https?:\/\//, '')}/join
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '1cqw', color: '#8a97c4', marginTop: '3cqw', textAlign: 'center' }}>Création de la partie…</div>
            ))}
          <div id="cockpit-explain" style={{ position: 'absolute', inset: 0 }} />
        </div>

        {/* Petit afficheur sous l'écran droit : code de la partie */}
        {joinCode && (
          <div className={L.fx('code').className} style={{ position: 'absolute', ...rectStyle(zones.code), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6cqw', background: 'rgba(3,8,30,0.9)', border: '1px solid rgba(90,170,255,0.55)', borderRadius: '0.4cqw', boxShadow: '0 0 0.8cqw rgba(60,130,255,0.4)', ...L.fx('code').style }}>
            <span style={{ fontSize: '0.7cqw', fontWeight: 800, letterSpacing: '0.1cqw', color: '#8a97c4' }}>CODE</span>
            <span style={{ fontSize: '1.7cqw', fontWeight: 800, letterSpacing: '0.3cqw', color: '#7fd1ff', textShadow: '0 0 0.9cqw #2aa8ff', fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}>{joinCode}</span>
          </div>
        )}

        {/* Hublot : menu des modes (planètes) ou écran de jeu */}
        <div className={L.fx('hub').className} style={{ position: 'absolute', ...rectStyle(zones.hub), boxSizing: 'border-box', ...theme.hubStyle, ...L.fx('hub').style }}>
          {!gameStarted ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: '6%', boxSizing: 'border-box' }}>
              <p style={{ textAlign: 'center', fontSize: '1.15cqw', lineHeight: 1.35, color: '#c8d3ff', margin: '1.2cqw 2cqw 0', textShadow: '0 0 0.6cqw #000' }}>
                {activeModeInfo.desc}
              </p>
            </div>
          ) : (
            gameId && (
              <GameArea gameId={gameId} initialMode={activeMode} cockpit onExplainChange={setExplainActive} onRestart={() => setShowNewGameChoice(true)} onClose={() => setGameStarted(false)} />
            )
          )}
        </div>

        {/* Icônes des modes de jeu : zone indépendante du hublot (déplaçable / redimensionnable à part) */}
        {!gameStarted && (
          <div className={L.fx('modes').className} style={{ position: 'absolute', ...rectStyle(zones.modes), boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center', ...L.fx('modes').style }}>
            <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end' }}>
                {MODES.map((m) => {
                  const sel = activeMode === m.id;
                  const tw = L.planetTweak(m.id as keyof typeof theme.planets);
                  return (
                    <div key={m.id} {...L.planetProps(m.id as keyof typeof theme.planets)}>
                    <button
                      onClick={() => selectMode(m.id)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5cqw', opacity: sel ? 1 : 0.72, transform: sel ? 'scale(1.15)' : 'scale(1)', transition: 'transform .25s, opacity .25s, filter .25s', filter: sel ? `drop-shadow(0 0 1.1cqw ${m.color})` : 'none' }}
                    >
                      {theme.planets[m.id as keyof typeof theme.planets].src ? (
                        <img src={theme.planets[m.id as keyof typeof theme.planets].src as string} alt="" draggable={false} style={{ width: `${theme.planets[m.id as keyof typeof theme.planets].width * tw.scale}cqw`, display: 'block' }} />
                      ) : (
                        <ModeIcon mode={m.id} size={`${theme.planets[m.id as keyof typeof theme.planets].width * tw.scale}cqw`} style={{ display: 'block' }} />
                      )}
                      {tw.showLabel && (
                        <span
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.45cqw', whiteSpace: 'nowrap',
                            padding: '0.4cqw 0.9cqw', borderRadius: '0.6cqw', fontWeight: 800, fontSize: `${1.05 * tw.labelScale}cqw`,
                            background: 'rgba(4,9,36,0.92)', color: sel ? '#fff' : '#dfe9ff',
                            border: sel ? '1px solid #fff' : '1px solid rgba(120,175,255,0.75)',
                            boxShadow: sel ? `0 0 1.2cqw ${m.color}` : '0 0 1.2cqw rgba(60,120,255,0.45)',
                          }}
                        >
                          <ModeIcon mode={m.id} /> {m.label}
                        </span>
                      )}
                    </button>
                    </div>
                  );
                })}
              </div>
          </div>
        )}

        {/* Choix du profil : bandeau en haut au centre, près du halo bleu du plafond */}
        <div className={L.fx('profile').className} style={{ position: 'absolute', left: `${zones.profile.left}%`, top: `${zones.profile.top}%`, transform: 'translateX(-50%)', zIndex: 15, ...L.fx('profile').style }}>
          <CockpitPlate
            id="profil"
            boxOverride={L.fx('profile').style}
            height={5.5}
            tipSide="below"
            noTip={profileOpen}
            label="Profil de jeu"
            hint={gameStarted ? 'Impossible de changer en cours de partie' : 'Choisir les questions de la partie'}
            disabled={gameStarted}
            onClick={() => setProfileOpen((o) => !o)}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5cqw', maxWidth: '100%', fontSize: '1.35cqw', fontWeight: 800, letterSpacing: '0.1cqw', textTransform: 'uppercase', color: '#e8f0ff', textShadow: '0 0 0.7cqw rgba(0,10,50,0.95), 0 0 0.3cqw #000' }}>
              <span style={ckLed(selectedProfile ? '#4dffb0' : '#ff9a5a')} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedProfile ? selectedProfile.name : 'Choisir un profil'}</span>
              <span style={{ fontSize: '1cqw' }}>▾</span>
            </span>
          </CockpitPlate>
          {profileOpen && !gameStarted && (
            <>
              <div onClick={() => setProfileOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
              <div className="ck-scroll" style={{ position: 'absolute', top: 'calc(100% + 0.6cqw)', left: '50%', transform: 'translateX(-50%)', minWidth: '60%', maxHeight: '22cqw', overflowY: 'auto', zIndex: 20, background: 'rgba(5,10,38,0.97)', border: '1px solid rgba(120,175,255,0.7)', borderRadius: '0.8cqw', boxShadow: '0 0 1.6cqw rgba(60,120,255,0.55)', padding: '0.4cqw' }}>
                {[{ id: '', name: 'Aucun profil (toutes les questions)', is_default: false, is_favorite: false } as Profile, ...eligibleProfiles].map((p) => {
                  const sel = p.id === selectedProfileId;
                  return (
                    <div
                      key={p.id || 'none'}
                      onClick={async () => {
                        setProfileOpen(false);
                        await selectProfile(p.id);
                      }}
                      style={{ padding: '0.5cqw 0.9cqw', borderRadius: '0.5cqw', fontSize: '1cqw', fontWeight: sel ? 800 : 600, color: sel ? '#fff' : '#c8d6ff', background: sel ? 'linear-gradient(90deg, rgba(80,140,255,0.55), rgba(110,90,255,0.35))' : 'transparent', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      {p.is_default ? '🏠 ' : p.is_favorite ? '⭐ ' : ''}{p.name}
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {activeMode === 'camembert' && eligibleProfiles.length === 0 && (
            <div style={{ position: 'absolute', top: 'calc(100% + 0.4cqw)', left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', color: '#ff9a8a', fontSize: '0.95cqw', fontWeight: 700 }}>Aucun profil éligible (10 catégories distinctes requises)</div>
          )}
        </div>

        {/* Mascotte (toujours visible) + portail holographique de lancement de partie */}
        <MascotPortal active={portalOn} themeId={theme.id} stageRatio={theme.stage.ratio} onLaunch={() => setGameStarted(true)} onDone={() => setPortalOn(false)} />

        {/* Pupitre du bas : emplacements fixes (les boutons ne bougent pas, ils se grisent quand ils sont inutilisables) */}
        <div className={L.fx('bar').className} style={{ position: 'absolute', ...rectStyle(zones.bar), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1cqw', boxSizing: 'border-box', padding: '0.4cqw 1.2cqw', background: theme.bar.background, border: theme.bar.border, borderRadius: '1.2cqw', boxShadow: theme.bar.boxShadow, ...L.fx('bar').style }}>
          {barItem('parametrage', <CockpitPlate id="parametrage" label="Paramétrage" href="/parametrage" />)}
          {barItem('stats', <CockpitPlate id="stats" label="Statistiques" hint="S · par équipe et par catégorie" disabled={!gameId} onClick={openStats} />)}
          {slot('cockpit-progress', 'progression', !gameStarted && <CockpitPlate id="progression" label="Voir la progression" hint="Mode Trivial Poursuit, pendant la partie" disabled />)}

          {/* Fusée : Démarrer avant la partie, puis « Question suivante » (injectée par GameArea) */}
          {slot(
            'cockpit-rocket',
            'fusee',
            !gameStarted && (
              <CockpitPlate
                id="fusee"
                label="Démarrer la partie"
                hint={teams.length > 0 ? 'Espace' : 'Aucune équipe connectée'}
                disabled={teams.length === 0 || portalOn}
                pulse={teams.length > 0 && !portalOn}
                onClick={startGame}
              />
            )
          )}

          {barItem('nouvelle', <CockpitPlate id="nouvelle" label="Nouvelle partie" hint="Oublier la partie actuelle" disabled={!gameId} onClick={() => setShowNewGameChoice(true)} />)}
          {slot('cockpit-quit', 'quitter', !gameStarted && <CockpitPlate id="quitter" label="Quitter la partie" hint="Aucune partie en cours" disabled />)}
          {barItem('plein', <CockpitPlate id="plein" label="Plein écran" hint="F" onClick={toggleFullscreen} />)}

          {/* Messages d'erreur : au-dessus du pupitre, sans décaler les boutons */}
          <div id="cockpit-actions" style={{ position: 'absolute', bottom: 'calc(100% + 0.3cqw)', left: 0, right: 0, textAlign: 'center', pointerEvents: 'none' }} />
          {error && <span style={{ position: 'absolute', bottom: 'calc(100% + 0.3cqw)', left: 0, right: 0, textAlign: 'center', color: '#ff9a8a', fontSize: '0.95cqw', fontWeight: 700 }}>{error}</span>}
        </div>

        {/* Infobulle d'équipe (détails masqués dans la liste) */}
        {teamTip && (
          <div style={{ position: 'absolute', left: `${teamTip.left}%`, top: `${teamTip.top}%`, zIndex: 40, pointerEvents: 'none', padding: '0.5cqw 0.9cqw', borderRadius: '0.6cqw', background: 'rgba(4,9,36,0.97)', border: '1px solid rgba(120,175,255,0.75)', boxShadow: '0 0 1.2cqw rgba(60,120,255,0.55)', color: '#dfe9ff', fontSize: '0.95cqw', lineHeight: 1.45, whiteSpace: 'nowrap' }}>
            <div style={{ fontWeight: 800 }}><TeamAvatar avatar={teamTip.t.avatar} /> {teamTip.t.name}</div>
            <div>{teamTip.t.score ?? 0} point{(teamTip.t.score ?? 0) > 1 ? 's' : ''}</div>
            {activeMode === 'camembert' && (
              <div>
                🥧 {(teamTip.t.camembert_won ?? []).length} part{(teamTip.t.camembert_won ?? []).length > 1 ? 's' : ''}
                {(teamTip.t.camembert_jokers ?? 0) > 0 ? ` · 🤡 ×${teamTip.t.camembert_jokers}` : ''}
              </div>
            )}
            <div style={{ fontSize: '0.8cqw', color: '#8fb4ff' }}>Clic : déconnecter ou copier le lien</div>
          </div>
        )}

        {/* MSGBOX : actions sur une équipe */}
        {teamAction && (
          <CockpitMsgBox
            title={`Déconnecter « ${teamAction.name} » ?`}
            validateLabel="Déconnecter l'équipe"
            onValidate={async () => {
              await removeTeam(teamAction.id);
              setTeamAction(null);
            }}
            extra={[{ label: copiedTeamId === teamAction.id ? 'Lien copié ✓' : 'Copier le lien de récupération', onClick: () => copyTeamLink(teamAction.id) }]}
            cancelLabel="Fermer"
            onCancel={() => setTeamAction(null)}
          >
            <span>
              <TeamAvatar avatar={teamAction.avatar} /> {teamAction.score ?? 0} point{(teamAction.score ?? 0) > 1 ? 's' : ''}
            </span>
          </CockpitMsgBox>
        )}

        {/* MSGBOX : nouvelle partie */}
        {showNewGameChoice && (
          <CockpitMsgBox
            title="Nouvelle partie"
            validateLabel="Garder les mêmes équipes"
            onValidate={restartSameTeams}
            extra={[{ label: "Changer d'équipes (nouveau code)", onClick: fullReset }]}
            cancelLabel="Annuler"
            onCancel={() => setShowNewGameChoice(false)}
          >
            Garder les mêmes équipes : même code, scores remis à zéro.
          </CockpitMsgBox>
        )}
        <LayoutOverlays L={L} theme={theme} />
      </div>
      <LayoutPanels L={L} theme={theme} />

      {sharedModals}
    </main>
  );
}
