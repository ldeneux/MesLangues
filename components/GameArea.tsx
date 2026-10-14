'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabaseClient';
import { ckKeyPrimary, ckKeyDanger } from '@/lib/cockpitUi';
import { deezerTrackId, type DeezerTrack } from '@/lib/deezer';
import { loadYouTubeApi, youtubeInfo, type YouTubeInfo } from '@/lib/media';
import { useTheme } from '@/lib/useTheme';
import TeamAvatar from '@/components/TeamAvatar';
import CategoryBadge from '@/components/CategoryBadge';
import CockpitPlate from '@/components/CockpitPlate';
import CockpitCrawl from '@/components/CockpitCrawl';
import CockpitMsgBox from '@/components/CockpitMsgBox';
import CockpitTicker from '@/components/CockpitTicker';
import {
  scoreClassique,
  scoreSurvie,
  scoreDefi,
  scoreParticipatifTurnV2,
  applyCamembertAnswer,
  CAMEMBERT_POINTS_PER_WEDGE,
  CAMEMBERT_WIN_BONUS,
  CAMEMBERT_MAX_JOKERS,
  CAMEMBERT_JOKER_WINDOW_SECONDS,
} from '@/lib/scoring';
import type { RealtimeChannel } from '@supabase/supabase-js';

type Team = {
  id: string;
  name: string;
  avatar: string;
  color: string;
  score: number;
  lives: number;
  camembert_progress: Record<string, number>;
  camembert_won: string[];
  camembert_jokers: number;
};

type Category = { id: string; name: string; emoji: string };

type Question = {
  id: string;
  prompt: string;
  choice_a: string;
  choice_b: string;
  choice_c: string;
  choice_d: string;
  correct_choice: 'a' | 'b' | 'c' | 'd';
  explanation: string | null;
  category_id?: string;
  category_name?: string;
  category_emoji?: string;
  media_url?: string | null; // lien d'un morceau Deezer (blind test) ou d'une vidéo YouTube : joué sur l'écran de l'hôte
};

type RevealInfo = { choice: string | null; timeMs: number | null };

const QUESTION_TIME_SECONDS = 20;

const CHOICE_COLORS: Record<'a' | 'b' | 'c' | 'd', string> = {
  a: '#6c7bf7',
  b: '#35c2a3',
  c: '#ffb648',
  d: '#ff7a68',
};


// Variante « cockpit » : texte en cqw (1cqw = 1 % de la largeur de la scène), fond translucide néon
const cockpitStyles: Record<string, React.CSSProperties> = {
  lobbyCard: { textAlign: 'center', color: '#e8eeff', padding: '1cqw' },
  joinCode: { fontSize: '4cqw', fontWeight: 800, letterSpacing: '0.5cqw', margin: '0.8cqw 0', color: '#7fd1ff', textShadow: '0 0 1.2cqw #2aa8ff' },
  startBtn: { ...ckKeyPrimary },
  mainCard: { color: '#e8eeff', padding: '0.6cqw 1cqw', height: '100%', boxSizing: 'border-box', overflow: 'auto' },
  qHead: { display: 'flex', alignItems: 'center', gap: '0.8cqw', marginBottom: '0.7cqw' },
  qTag: { background: 'rgba(80,170,255,.18)', color: '#8fd0ff', fontWeight: 800, padding: '0.25cqw 0.8cqw', borderRadius: 999, fontSize: '1cqw', border: '1px solid rgba(120,190,255,.4)' },
  timer: { marginLeft: 'auto', fontWeight: 800, fontSize: '2cqw', color: '#ffd166', textShadow: '0 0 1cqw #ff9f1c' },
  questionText: { fontSize: '1.35cqw', fontWeight: 800, marginBottom: '0.8cqw', lineHeight: 1.2 },
  choices: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7cqw', marginBottom: '0.7cqw' },
  choice: { background: 'rgba(15,25,70,.7)', border: '1px solid rgba(120,160,255,.45)', borderRadius: '0.8cqw', padding: '0.6cqw 0.9cqw', fontWeight: 700, fontSize: '1.35cqw', lineHeight: 1.2 },
  choiceCorrect: { background: 'rgba(30,160,120,.35)', borderColor: '#35e0b0', boxShadow: '0 0 1cqw rgba(53,224,176,.6)' },
  explainBox: { background: 'rgba(30,160,120,.18)', border: '1px solid rgba(53,224,176,.5)', borderRadius: '0.6cqw', padding: '0.5cqw', fontSize: '0.95cqw', lineHeight: 1.3, color: '#dffcf3' },
  teamsRow: { display: 'flex', flexWrap: 'wrap', gap: '0.5cqw' },
  teamTile: { border: '1px solid rgba(120,160,255,.35)', borderRadius: '0.7cqw', padding: '0.3cqw 0.7cqw', fontWeight: 700, fontSize: '1cqw', background: 'rgba(10,18,50,.6)' },
  teamAnswered: { borderColor: '#7fd1ff', background: 'rgba(60,120,220,.35)' },
};

export default function GameArea({
  gameId,
  initialMode,
  cockpit = false,
  onExplainChange,
  onRestart,
  onClose,
}: {
  gameId: string;
  initialMode?: string;
  cockpit?: boolean;
  onExplainChange?: (active: boolean) => void;
  onRestart?: () => void;
  onClose?: () => void;
}) {
  const styles = cockpit ? cockpitStyles : baseStyles;
  const { theme } = useTheme();
  // En mode cockpit, boutons d'action et explication sont injectés dans le pupitre / l'écran droit de la page
  const [actionsEl, setActionsEl] = useState<HTMLElement | null>(null);
  const [explainEl, setExplainEl] = useState<HTMLElement | null>(null);
  const [rocketEl, setRocketEl] = useState<HTMLElement | null>(null);
  const [progressEl, setProgressEl] = useState<HTMLElement | null>(null);
  const [quitEl, setQuitEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!cockpit) return;
    setActionsEl(document.getElementById('cockpit-actions'));
    setExplainEl(document.getElementById('cockpit-explain'));
    setRocketEl(document.getElementById('cockpit-rocket'));
    setProgressEl(document.getElementById('cockpit-progress'));
    setQuitEl(document.getElementById('cockpit-quit'));
  }, [cockpit]);
  const toActions = (node: React.ReactNode) => (cockpit && actionsEl ? createPortal(node, actionsEl) : node);
  const toExplain = (node: React.ReactNode) => (cockpit && explainEl ? createPortal(node, explainEl) : node);
  const [joinCode, setJoinCode] = useState<string>('');
  const [mode, setMode] = useState<string>(initialMode ?? 'classique');
  const [teams, setTeams] = useState<Team[]>([]);
  const [answeredTeamIds, setAnsweredTeamIds] = useState<Set<string>>(new Set());
  const [question, setQuestion] = useState<Question | null>(null);
  const [phase, setPhase] = useState<
    'lobby' | 'camembert-setup' | 'choosing-category' | 'question' | 'revealed' | 'finished'
  >('lobby');
  const [secondsLeft, setSecondsLeft] = useState(QUESTION_TIME_SECONDS);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [autoAttempted, setAutoAttempted] = useState(false);
  // Choix des thèmes (camembert) : nom de l'icône survolée, affiché en info-bulle
  const [setupTip, setSetupTip] = useState<{ name: string; left: number; top: number; below: boolean } | null>(null);
  const setupWrapRef = useRef<HTMLDivElement>(null);
  const [revealedInfo, setRevealedInfo] = useState<Record<string, RevealInfo>>({});
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const askedQuestionIdsRef = useRef<string[]>([]); // questions posées pendant CETTE partie
  const previousQuestionIdsRef = useRef<string[]>([]); // questions posées lors de parties précédentes avec le même code
  const currentQuestionIdRef = useRef<string | null>(null);
  const [challengerTeamId, setChallengerTeamId] = useState<string | null>(null);
  const challengerCountsRef = useRef<Record<string, number>>({});
  const challengerIndexRef = useRef(0);
  const [participatifTurnTeamId, setParticipatifTurnTeamId] = useState<string | null>(null);
  const participatifTurnTeamIdRef = useRef<string | null>(null);
  const participatifTurnsRef = useRef<Record<string, number>>({});
  const participatifIndexRef = useRef(0);
  const participatifPotRef = useRef(0);
  const [participatifOutcome, setParticipatifOutcome] = useState<'correct' | 'rescued' | 'distributed' | null>(null);

  // --- Mode Camemberts ---
  const [wedgeCategories, setWedgeCategories] = useState<Category[]>([]);
  const wedgeCategoriesRef = useRef<Category[]>([]);
  const camembertChooserIndexRef = useRef(0);
  const [camembertChooserTeamId, setCamembertChooserTeamId] = useState<string | null>(null);
  const camembertChooserTeamIdRef = useRef<string | null>(null);
  const [camembertCategory, setCamembertCategory] = useState<Category | null>(null);
  const camembertCategoryRef = useRef<Category | null>(null);
  const [awaitingCategoryPick, setAwaitingCategoryPick] = useState(false);
  const [pendingJokerTeamIds, setPendingJokerTeamIds] = useState<string[]>([]);
  const usedJokerTeamIdsRef = useRef<Set<string>>(new Set());
  const [jokerSecondsLeft, setJokerSecondsLeft] = useState(0);
  const [camembertWinnerId, setCamembertWinnerId] = useState<string | null>(null);
  const [exhaustedInfo, setExhaustedInfo] = useState<{ total: number; asked: number } | null>(null); // pourquoi la partie s'est terminée (plus de question neuve)
  const [showProgressTable, setShowProgressTable] = useState(false);
  const proceedWithCategoryRef = useRef<((categoryId: string) => void) | null>(null);

  useEffect(() => {
    const loadGame = async () => {
      const { data: game } = await supabase.from('games').select('*').eq('id', gameId).single();
      if (game) {
        setJoinCode(game.join_code);
        // Si la console nous a passé le mode directement (source fiable,
        // déjà à jour au moment du clic sur "Démarrer"), on ne l'écrase pas
        // avec la valeur lue en base, qui peut être temporairement en retard
        // juste après un changement de mode.
        if (!initialMode) {
          setMode(game.mode ?? 'classique');
        }
      }
    };
    loadGame();

    const loadTeams = async () => {
      const { data } = await supabase.from('teams').select('*').eq('game_id', gameId);
      if (data) setTeams(data as Team[]);
    };
    loadTeams();

    supabase
      .from('answers')
      .select('question_id')
      .eq('game_id', gameId)
      .then(({ data }) => {
        if (data) {
          previousQuestionIdsRef.current = Array.from(new Set(data.map((a: any) => a.question_id)));
        }
      });

    const ch = supabase.channel(`game:${gameId}:play`, {
      config: { broadcast: { self: false } },
    });

    ch.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'teams', filter: `game_id=eq.${gameId}` },
      (payload) => {
        setTeams((prev) => [...prev, payload.new as Team]);
      }
    );

    ch.on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'teams', filter: `game_id=eq.${gameId}` },
      (payload) => {
        const removedId = (payload.old as { id: string }).id;
        setTeams((prev) => prev.filter((t) => t.id !== removedId));
      }
    );

    ch.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'answers', filter: `game_id=eq.${gameId}` },
      (payload) => {
        const row = payload.new as { team_id: string; question_id: string };
        if (row.question_id === currentQuestionIdRef.current) {
          setAnsweredTeamIds((prev) => new Set(prev).add(row.team_id));
        }
      }
    );

    // Mode Camemberts : réception du choix de catégorie fait par l'équipe désignée
    ch.on('broadcast', { event: 'choose-category:pick' }, ({ payload }) => {
      if (payload.teamId === camembertChooserTeamIdRef.current) {
        proceedWithCategoryRef.current?.(payload.categoryId);
      }
    });

    // Mode Camemberts : une équipe décide d'utiliser un Joker pour se protéger.
    // Le décompte du joker se fait immédiatement (RPC atomique), sans attendre
    // la fin du compte à rebours : sinon, si toutes les équipes concernées
    // répondent avant les 10s, le joker n'était jamais réellement débité.
    ch.on('broadcast', { event: 'joker:use' }, ({ payload }) => {
      if (usedJokerTeamIdsRef.current.has(payload.teamId)) return; // un seul joker débité par équipe et par fenêtre
      usedJokerTeamIdsRef.current.add(payload.teamId);
      setPendingJokerTeamIds((prev) => prev.filter((id) => id !== payload.teamId));
      (async () => {
        const { error: rpcError } = await supabase.rpc('decrement_team_joker', { p_team_id: payload.teamId });
        if (rpcError) {
          // Repli si la fonction SQL est absente : décrément direct
          const { data: row } = await supabase.from('teams').select('camembert_jokers').eq('id', payload.teamId).single();
          await supabase
            .from('teams')
            .update({ camembert_jokers: Math.max((row?.camembert_jokers ?? 1) - 1, 0) })
            .eq('id', payload.teamId);
        }
        const { data } = await supabase.from('teams').select('*').eq('game_id', gameId);
        if (data) setTeams(data as Team[]);
      })();
    });

    // Mode Camemberts : l'équipe refuse le Joker -> sa progression sur la catégorie est remise à zéro tout de suite
    // (inutile d'attendre la fin du compte à rebours).
    ch.on('broadcast', { event: 'joker:decline' }, ({ payload }) => {
      setPendingJokerTeamIds((prev) => prev.filter((id) => id !== payload.teamId));
      const categoryId = camembertCategoryRef.current?.id;
      if (!categoryId) return;
      (async () => {
        const { data: row } = await supabase.from('teams').select('camembert_progress').eq('id', payload.teamId).single();
        const progress = { ...(row?.camembert_progress ?? {}), [categoryId]: 0 };
        await supabase.from('teams').update({ camembert_progress: progress }).eq('id', payload.teamId);
        const { data } = await supabase.from('teams').select('*').eq('game_id', gameId);
        if (data) setTeams(data as Team[]);
      })();
    });

    ch.subscribe();
    setChannel(ch);

    return () => {
      supabase.removeChannel(ch);
    };
  }, [gameId]);

  const startQuestion = useCallback(
    async (q: Question) => {
      setQuestion(q);
      currentQuestionIdRef.current = q.id;
      askedQuestionIdsRef.current = [...askedQuestionIdsRef.current, q.id];
      setPhase('question');
      setAnsweredTeamIds(new Set());
      setRevealedInfo({});
      setParticipatifOutcome(null);
      setSecondsLeft(QUESTION_TIME_SECONDS);

      await supabase
        .from('games')
        .update({ current_question_id: q.id, status: 'question', question_started_at: new Date().toISOString() })
        .eq('id', gameId);

      channel?.send({
        type: 'broadcast',
        event: 'question:show',
        payload: {
          question: q,
          startedAt: Date.now(),
          turnTeamId: participatifTurnTeamIdRef.current,
          camembertCategory: camembertCategoryRef.current,
          mode,
        },
      });
    },
    [channel, gameId, mode]
  );

  // Désigne le prochain challenger (round-robin, 3 tours max par équipe).
  // Retourne false si toutes les équipes ont déjà défié 3 fois (fin du mode Défi).
  const pickNextChallenger = useCallback((): boolean => {
    if (teams.length === 0) return false;

    for (let i = 0; i < teams.length; i++) {
      const idx = (challengerIndexRef.current + i) % teams.length;
      const candidate = teams[idx];
      const count = challengerCountsRef.current[candidate.id] ?? 0;
      if (count < 3) {
        challengerCountsRef.current[candidate.id] = count + 1;
        challengerIndexRef.current = (idx + 1) % teams.length;
        setChallengerTeamId(candidate.id);
        return true;
      }
    }
    return false; // toutes les équipes ont défié 3 fois
  }, [teams]);

  // Désigne l'équipe qui joue le tour suivant (round-robin, 3 tours max
  // par équipe). Retourne false quand toutes les équipes ont joué 3 fois.
  const pickNextParticipatifTurn = useCallback((): boolean => {
    if (teams.length === 0) return false;
    if (participatifPotRef.current === 0) participatifPotRef.current = teams.length;

    for (let i = 0; i < teams.length; i++) {
      const idx = (participatifIndexRef.current + i) % teams.length;
      const candidate = teams[idx];
      const count = participatifTurnsRef.current[candidate.id] ?? 0;
      if (count < 3) {
        participatifTurnsRef.current[candidate.id] = count + 1;
        participatifIndexRef.current = (idx + 1) % teams.length;
        participatifTurnTeamIdRef.current = candidate.id;
        setParticipatifTurnTeamId(candidate.id);
        return true;
      }
    }
    return false;
  }, [teams]);

  // Distribue la cagnotte restante s'il y a une chaîne en cours au moment
  // où tout le monde a joué ses 3 tours, puis termine la partie.
  const finishParticipatif = useCallback(async () => {
    if (participatifPotRef.current > teams.length && teams.length > 0) {
      const share = participatifPotRef.current / teams.length;
      for (const t of teams) {
        await supabase.rpc('increment_team_score', { p_team_id: t.id, p_points: share });
      }
      const { data: refreshedTeams } = await supabase.from('teams').select('*').eq('game_id', gameId);
      if (refreshedTeams) setTeams(refreshedTeams as Team[]);
    }
    setPhase('finished');
  }, [teams, gameId]);

  // --- Mode Camemberts ---

  const [camembertSetupPool, setCamembertSetupPool] = useState<Category[]>([]);
  const [camembertSetupNeeded, setCamembertSetupNeeded] = useState(6);
  const [camembertSetupSelected, setCamembertSetupSelected] = useState<string[]>([]);

  const pickCamembertChooser = useCallback((): Team | null => {
    if (teams.length === 0) return null;
    const idx = camembertChooserIndexRef.current % teams.length;
    camembertChooserIndexRef.current = (idx + 1) % teams.length;
    const chooser = teams[idx];
    camembertChooserTeamIdRef.current = chooser.id;
    setCamembertChooserTeamId(chooser.id);
    return chooser;
  }, [teams]);

  const categoryChoiceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startCategoryChoice = useCallback(async () => {
    const chooser = pickCamembertChooser();
    if (!chooser) return;

    const won = chooser.camembert_won ?? [];
    let available = wedgeCategoriesRef.current.filter((c) => !won.includes(c.id));
    if (available.length === 0) available = wedgeCategoriesRef.current; // sécurité, ne devrait pas arriver

    setPhase('choosing-category');
    setAwaitingCategoryPick(true);

    channel?.send({
      type: 'broadcast',
      event: 'choose-category:prompt',
      payload: { chooserTeamId: chooser.id, chooserTeamName: chooser.name, categories: available },
    });

    if (categoryChoiceTimeoutRef.current) clearTimeout(categoryChoiceTimeoutRef.current);
    categoryChoiceTimeoutRef.current = setTimeout(() => {
      proceedWithCategoryRef.current?.(available[0].id);
    }, 20000);
  }, [pickCamembertChooser, channel]);

  const beginCamembertSetup = useCallback(async () => {
    const { data: game } = await supabase.from('games').select('profile_id, camembert_categories').eq('id', gameId).single();

    if (game?.camembert_categories && Array.isArray(game.camembert_categories) && game.camembert_categories.length > 0) {
      wedgeCategoriesRef.current = game.camembert_categories as Category[];
      setWedgeCategories(game.camembert_categories as Category[]);
      channel?.send({ type: 'broadcast', event: 'wedge-categories:set', payload: { categories: game.camembert_categories } });
      startCategoryChoice();
      return;
    }

    let categoryIds: string[] = [];
    if (game?.profile_id) {
      const { data: profilePacks } = await supabase.from('quiz_profile_packs').select('pack_id').eq('profile_id', game.profile_id);
      const packIds = (profilePacks ?? []).map((p) => p.pack_id);
      const { data: packs } = await supabase.from('question_packs').select('category_id').in('id', packIds);
      categoryIds = Array.from(new Set((packs ?? []).map((p: any) => p.category_id).filter(Boolean)));
    }

    const { data: categoriesData } = await supabase.from('categories').select('id, name, emoji').in('id', categoryIds);
    const pool = (categoriesData as Category[]) ?? [];
    const n = Math.min(Math.max(teams.length, 6), 10);

    if (pool.length <= n) {
      // Le profil n'a pas plus de thèmes que nécessaire : pas de vrai choix possible, on prend tout.
      wedgeCategoriesRef.current = pool;
      setWedgeCategories(pool);
      await supabase.from('games').update({ camembert_categories: pool }).eq('id', gameId);
      channel?.send({ type: 'broadcast', event: 'wedge-categories:set', payload: { categories: pool } });
      startCategoryChoice();
      return;
    }

    setCamembertSetupPool(pool);
    setCamembertSetupNeeded(n);
    setCamembertSetupSelected(pool.slice(0, n).map((c) => c.id));
    setPhase('camembert-setup');
  }, [gameId, teams.length, startCategoryChoice, channel]);

  const toggleCamembertSetupCategory = (id: string) => {
    setCamembertSetupSelected((prev) => {
      if (prev.includes(id)) return prev.filter((c) => c !== id);
      if (prev.length >= camembertSetupNeeded) return prev; // déjà au max
      return [...prev, id];
    });
  };

  const confirmCamembertSetup = useCallback(async () => {
    const chosen = camembertSetupPool.filter((c) => camembertSetupSelected.includes(c.id));
    wedgeCategoriesRef.current = chosen;
    setWedgeCategories(chosen);
    await supabase.from('games').update({ camembert_categories: chosen }).eq('id', gameId);
    channel?.send({ type: 'broadcast', event: 'wedge-categories:set', payload: { categories: chosen } });
    startCategoryChoice();
  }, [camembertSetupPool, camembertSetupSelected, gameId, startCategoryChoice, channel]);

  const proceedWithCategory = useCallback(
    (categoryId: string) => {
      if (categoryChoiceTimeoutRef.current) {
        clearTimeout(categoryChoiceTimeoutRef.current);
        categoryChoiceTimeoutRef.current = null;
      }
      setAwaitingCategoryPick(false);
      const cat = wedgeCategoriesRef.current.find((c) => c.id === categoryId) ?? null;
      setCamembertCategory(cat);
      camembertCategoryRef.current = cat;
      setLoadError(null);
      loadNextQuestion(
        gameId,
        startQuestion,
        setLoadError,
        (info) => {
          setExhaustedInfo(info);
          setPhase('finished');
        },
        askedQuestionIdsRef.current,
        previousQuestionIdsRef.current,
        categoryId
      );
    },
    [gameId, startQuestion]
  );

  useEffect(() => {
    proceedWithCategoryRef.current = proceedWithCategory;
  }, [proceedWithCategory]);

  const goToNextQuestion = useCallback(() => {
    if (mode === 'defi') {
      const hasNext = pickNextChallenger();
      if (!hasNext) {
        setPhase('finished');
        return;
      }
    }
    if (mode === 'participatif') {
      const hasNext = pickNextParticipatifTurn();
      if (!hasNext) {
        finishParticipatif();
        return;
      }
    }
    if (mode === 'camembert') {
      if (wedgeCategoriesRef.current.length === 0) {
        beginCamembertSetup();
      } else {
        startCategoryChoice();
      }
      return;
    }
    setLoadError(null);
    loadNextQuestion(
      gameId,
      startQuestion,
      setLoadError,
      (info) => {
        setExhaustedInfo(info);
        setPhase('finished');
      },
      askedQuestionIdsRef.current,
      previousQuestionIdsRef.current
    );
  }, [mode, pickNextChallenger, pickNextParticipatifTurn, finishParticipatif, startCategoryChoice, beginCamembertSetup, gameId, startQuestion]);

  // Média illisible : on abandonne la question en cours (aucun point, pas de révélation) et on en tire une autre.
  // On ne consomme pas le tour de l'équipe (Défi, Participatif) et, en Trivial Poursuit, on garde la catégorie choisie.
  const skipQuestion = useCallback(() => {
    if (phase !== 'question') return;
    setLoadError(null);
    loadNextQuestion(
      gameId,
      startQuestion,
      setLoadError,
      (info) => {
        setExhaustedInfo(info);
        setPhase('finished');
      },
      askedQuestionIdsRef.current,
      previousQuestionIdsRef.current,
      mode === 'camembert' ? camembertCategoryRef.current?.id : undefined
    );
  }, [phase, gameId, startQuestion, mode]);

  // Idem, et la question est retirée du jeu pour de bon (validated = false) : elle ne reviendra pas dans les parties suivantes.
  const disableAndSkip = useCallback(async () => {
    if (question) await supabase.from('questions').update({ validated: false }).eq('id', question.id);
    skipQuestion();
  }, [question, skipQuestion]);

  // Le parent masque le QR code tant que l'explication de la réponse occupe l'écran droit
  const explainVisible = cockpit && phase === 'revealed' && !!question?.explanation;
  useEffect(() => {
    onExplainChange?.(explainVisible);
    return () => onExplainChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explainVisible]);

  // Lancement de la partie : l'intro (mascotte + portail holographique avec la vidéo du thème) se joue sur la page d'accueil
  // AVANT le montage de ce composant. La première question s'enchaîne donc directement, sans décompte.
  useEffect(() => {
    if (!autoAttempted && channel && phase === 'lobby' && teams.length > 0) {
      setAutoAttempted(true);
      goToNextQuestion();
    }
  }, [autoAttempted, channel, phase, teams.length, gameId, goToNextQuestion]);

  useEffect(() => {
    if (phase !== 'question') return;

    const shouldReveal =
      secondsLeft <= 0 ||
      answeredTeamIds.size === (mode === 'survie' ? teams.filter((t) => (t.lives ?? 3) > 0).length : teams.length);

    if (shouldReveal) {
      reveal();
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, secondsLeft, answeredTeamIds, teams, mode, participatifTurnTeamId]);

  const reveal = useCallback(async () => {
    if (!question) return;
    setPhase('revealed');

    const { data: answers } = await supabase
      .from('answers')
      .select('team_id, choice, response_time_ms')
      .eq('question_id', question.id)
      .eq('game_id', gameId);

    const submitted = (answers ?? []).map((a) => ({
      teamId: a.team_id,
      choice: a.choice,
      responseTimeMs: a.response_time_ms,
    }));

    const infoMap: Record<string, RevealInfo> = {};
    teams.forEach((t) => {
      const found = submitted.find((s) => s.teamId === t.id);
      infoMap[t.id] = { choice: found?.choice ?? null, timeMs: found?.responseTimeMs ?? null };
    });
    setRevealedInfo(infoMap);

    if (mode === 'survie') {
      const currentLives: Record<string, number> = {};
      teams.forEach((t) => (currentLives[t.id] = t.lives ?? 3));
      const eliminatedBefore = teams.filter((t) => (t.lives ?? 3) <= 0).length;

      const survieResults = scoreSurvie(submitted as any, question.correct_choice, currentLives, eliminatedBefore);

      for (const r of survieResults) {
        await supabase.from('teams').update({ lives: r.livesRemaining }).eq('id', r.teamId);
        if (r.points > 0) {
          await supabase.rpc('increment_team_score', { p_team_id: r.teamId, p_points: r.points });
        }
      }

      channel?.send({ type: 'broadcast', event: 'answers:revealed', payload: { results: survieResults } });

      const { data: refreshedTeams } = await supabase.from('teams').select('*').eq('game_id', gameId);
      if (refreshedTeams) {
        setTeams(refreshedTeams as Team[]);
        // Fin de partie : une seule équipe (ou aucune) encore en vie
        const stillAlive = (refreshedTeams as Team[]).filter((t) => (t.lives ?? 0) > 0);
        if (stillAlive.length <= 1) {
          setTimeout(() => setPhase('finished'), 50);
        }
      }
      return;
    }

    if (mode === 'participatif') {
      const turnAnswer = submitted.find((s) => s.teamId === participatifTurnTeamId);
      const isCorrect = turnAnswer?.choice === question.correct_choice;
      const othersCorrectCount = submitted.filter(
        (s) => s.teamId !== participatifTurnTeamId && s.choice === question.correct_choice
      ).length;

      const { newState, payout, outcome } = scoreParticipatifTurnV2(isCorrect, othersCorrectCount, teams.length, {
        pot: participatifPotRef.current,
        teamCount: teams.length,
      });

      participatifPotRef.current = newState.pot;
      setParticipatifOutcome(outcome);

      if (payout !== null) {
        for (const t of teams) {
          await supabase.rpc('increment_team_score', { p_team_id: t.id, p_points: payout });
        }
      }

      channel?.send({
        type: 'broadcast',
        event: 'answers:revealed',
        payload: { results: teams.map((t) => ({ teamId: t.id, points: payout ?? 0 })) },
      });

      const { data: refreshedTeams } = await supabase.from('teams').select('*').eq('game_id', gameId);
      if (refreshedTeams) setTeams(refreshedTeams as Team[]);
      return;
    }

    if (mode === 'camembert') {
      const categoryId = camembertCategoryRef.current?.id;
      const immediateUpdates: { teamId: string; progress: Record<string, number>; won: string[]; jokers: number; pointsDelta: number }[] = [];
      const jokerCandidates: string[] = [];
      let winnerTeam: Team | null = null;

      for (const t of teams) {
        const answer = submitted.find((s) => s.teamId === t.id);
        const isCorrect = answer?.choice === question.correct_choice;
        const currentStreak = categoryId ? (t.camembert_progress?.[categoryId] ?? 0) : 0;
        const { newStreak, justWon, wouldReset } = applyCamembertAnswer(isCorrect, currentStreak);

        const newProgress = { ...(t.camembert_progress ?? {}) };
        const newWon = [...(t.camembert_won ?? [])];
        let newJokers = t.camembert_jokers ?? 0;
        let pointsDelta = 0;

        if (justWon && categoryId) {
          delete newProgress[categoryId];
          newWon.push(categoryId);
          pointsDelta += CAMEMBERT_POINTS_PER_WEDGE;
          newJokers = Math.min(newJokers + 1, CAMEMBERT_MAX_JOKERS);
          if (newWon.length === wedgeCategoriesRef.current.length) {
            winnerTeam = t;
            pointsDelta += CAMEMBERT_WIN_BONUS;
          }
        } else if (wouldReset && categoryId) {
          if ((t.camembert_jokers ?? 0) > 0) {
            jokerCandidates.push(t.id);
            continue; // décision différée : ne pas toucher à la progression tout de suite
          }
          newProgress[categoryId] = 0;
        } else if (categoryId) {
          newProgress[categoryId] = newStreak;
        }

        immediateUpdates.push({ teamId: t.id, progress: newProgress, won: newWon, jokers: newJokers, pointsDelta });
      }

      for (const u of immediateUpdates) {
        await supabase
          .from('teams')
          .update({ camembert_progress: u.progress, camembert_won: u.won, camembert_jokers: u.jokers })
          .eq('id', u.teamId);
        if (u.pointsDelta !== 0) {
          await supabase.rpc('increment_team_score', { p_team_id: u.teamId, p_points: u.pointsDelta });
        }
      }

      channel?.send({
        type: 'broadcast',
        event: 'answers:revealed',
        payload: { results: immediateUpdates.map((u) => ({ teamId: u.teamId, points: u.pointsDelta })) },
      });

      if (winnerTeam) {
        setCamembertWinnerId(winnerTeam.id);
        const { data: refreshedTeams } = await supabase.from('teams').select('*').eq('game_id', gameId);
        if (refreshedTeams) setTeams(refreshedTeams as Team[]);
        setTimeout(() => setPhase('finished'), 50);
        return;
      }

      if (jokerCandidates.length > 0 && categoryId) {
        usedJokerTeamIdsRef.current = new Set();
        setPendingJokerTeamIds(jokerCandidates);
        channel?.send({
          type: 'broadcast',
          event: 'joker:offer',
          payload: {
            teamIds: jokerCandidates,
            categoryName: camembertCategoryRef.current?.name,
            seconds: CAMEMBERT_JOKER_WINDOW_SECONDS,
          },
        });
        setJokerSecondsLeft(CAMEMBERT_JOKER_WINDOW_SECONDS);
      } else {
        const { data: refreshedTeams } = await supabase.from('teams').select('*').eq('game_id', gameId);
        if (refreshedTeams) setTeams(refreshedTeams as Team[]);
      }
      return;
    }

    const results =
      mode === 'defi' && challengerTeamId
        ? scoreDefi(submitted as any, question.correct_choice, challengerTeamId)
        : scoreClassique(submitted as any, question.correct_choice);

    for (const r of results) {
      await supabase.rpc('increment_team_score', { p_team_id: r.teamId, p_points: r.points });
    }

    channel?.send({ type: 'broadcast', event: 'answers:revealed', payload: { results } });

    const { data: refreshedTeams } = await supabase.from('teams').select('*').eq('game_id', gameId);
    if (refreshedTeams) setTeams(refreshedTeams as Team[]);
  }, [question, channel, gameId, teams, mode, challengerTeamId, participatifTurnTeamId]);

  // Finalise la fenêtre Joker à l'expiration du temps : remet à zéro la
  // progression des équipes qui n'ont PAS utilisé de joker à temps.
  // (Celles qui l'utilisent sont déjà traitées immédiatement à la réception.)
  const finalizeJokerWindow = useCallback(async () => {
    const categoryId = camembertCategoryRef.current?.id;
    if (!categoryId) {
      setPendingJokerTeamIds([]);
      return;
    }

    for (const teamId of pendingJokerTeamIds) {
      const t = teams.find((tt) => tt.id === teamId);
      if (!t) continue;
      const newProgress = { ...(t.camembert_progress ?? {}), [categoryId]: 0 };
      await supabase.from('teams').update({ camembert_progress: newProgress }).eq('id', teamId);
    }

    setPendingJokerTeamIds([]);
    usedJokerTeamIdsRef.current = new Set();

    const { data: refreshedTeams } = await supabase.from('teams').select('*').eq('game_id', gameId);
    if (refreshedTeams) setTeams(refreshedTeams as Team[]);
  }, [pendingJokerTeamIds, teams, gameId]);

  useEffect(() => {
    if (pendingJokerTeamIds.length === 0) return;
    if (jokerSecondsLeft <= 0) {
      finalizeJokerWindow();
      return;
    }
    const t = setTimeout(() => setJokerSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [pendingJokerTeamIds, jokerSecondsLeft, finalizeJokerWindow]);

  const quitKeepingScores = () => {
    setShowQuitConfirm(false);
    setPhase('finished');
  };

  const quitResettingScores = async () => {
    setShowQuitConfirm(false);
    for (const t of teams) {
      await supabase.from('teams').update({ score: 0 }).eq('id', t.id);
    }
    const { data: refreshedTeams } = await supabase.from('teams').select('*').eq('game_id', gameId);
    if (refreshedTeams) setTeams(refreshedTeams as Team[]);
    setPhase('finished');
  };

  // --- Écran : partie terminée (plus de questions disponibles) ---
  if (phase === 'finished') {
    const ranked = [...teams].sort((a, b) => b.score - a.score);
    const winner = camembertWinnerId ? teams.find((t) => t.id === camembertWinnerId) : null;
    const grayed = (el: HTMLElement | null, id: 'suivante' | 'progression' | 'quitter', label: string) =>
      cockpit && el ? createPortal(<CockpitPlate id={id} label={label} hint="Partie terminée" disabled />, el) : null;
    return (
      <>
        {grayed(rocketEl, 'suivante', 'Question suivante')}
        {grayed(progressEl, 'progression', 'Voir la progression')}
        {grayed(quitEl, 'quitter', 'Quitter la partie')}
      <div style={styles.mainCard}>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>🏁 Partie terminée</h2>
        {winner ? (
          <p style={{ color: '#35c2a3', fontSize: 14, fontWeight: 700, marginBottom: 20 }}>
            🥧 <TeamAvatar avatar={winner.avatar} /> {winner.name} a complété tous ses camemberts !
          </p>
        ) : (
          <p style={{ color: '#7a819c', fontSize: 13.5, marginBottom: 20 }}>
            Voici le classement final.
            {exhaustedInfo && ` Toutes les questions disponibles ont été posées (${exhaustedInfo.asked} sur ${exhaustedInfo.total}).`}
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {ranked.map((t, i) => (
            <div key={t.id} style={{ ...styles.teamTile, borderColor: i === 0 ? '#ffb648' : '#eaedf6' }}>
              {i === 0 ? '🏆 ' : `${i + 1}. `}
              <TeamAvatar avatar={t.avatar} /> {t.name} — <strong>{t.score} pts</strong>
              {mode === 'camembert' && (
                <span style={{ marginLeft: 8, color: '#7a819c', fontSize: 12 }}>
                  ({(t.camembert_won ?? []).length}/{wedgeCategories.length} parts)
                </span>
              )}
            </div>
          ))}
        </div>
        {onRestart && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={styles.startBtn} onClick={onRestart}>
              Nouvelle partie
            </button>
            {onClose && (
              <button
                style={{ ...styles.startBtn, background: '#eef0f8', color: '#1f2440' }}
                onClick={onClose}
              >
                Fermer
              </button>
            )}
          </div>
        )}
      </div>
      </>
    );
  }

  const progressTable = (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: cockpit ? '1.15cqw' : 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: 8 }}></th>
                    {teams.map((t) => (
                      <th key={t.id} style={{ padding: 8, fontWeight: 800, whiteSpace: 'nowrap' }}>
                        <TeamAvatar avatar={t.avatar} /> {t.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {wedgeCategories.map((c) => (
                    <tr key={c.id}>
                      <td style={{ padding: 8, fontWeight: 700, whiteSpace: 'nowrap' }}>
                        <CategoryBadge name={c.name} emoji={c.emoji} height="2.8em" withName />
                      </td>
                      {teams.map((t) => {
                        const won = (t.camembert_won ?? []).includes(c.id);
                        const progress = t.camembert_progress?.[c.id] ?? 0;
                        const icon = won ? '💚' : progress === 2 ? '🩵' : progress === 1 ? '🩶' : '';
                        return (
                          <td key={t.id} style={{ padding: 8, textAlign: 'center', fontSize: cockpit ? '1.7cqw' : 18 }}>
                            {icon}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
  );

  const quitConfirmNode = showQuitConfirm ? (
<div style={cockpit ? { position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 60, background: '#f4f6fb', color: '#1f2440', borderRadius: 14, padding: 16, boxShadow: '0 20px 50px rgba(0,0,0,.5)' } : { marginTop: 14, background: '#f4f6fb', borderRadius: 14, padding: 16 }}>
                  <p style={{ fontSize: 13.5, marginBottom: 10 }}>
                    Terminer la partie maintenant — que faire des scores actuels ?
                  </p>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={quitKeepingScores}
                      style={{ ...styles.startBtn, marginTop: 0, fontSize: 13, padding: '10px 16px' }}
                    >
                      Garder les scores
                    </button>
                    <button
                      onClick={quitResettingScores}
                      style={{
                        ...styles.startBtn,
                        marginTop: 0,
                        fontSize: 13,
                        padding: '10px 16px',
                        background: '#eef0f8',
                        color: '#1f2440',
                      }}
                    >
                      Remettre à zéro
                    </button>
                    <button
                      onClick={() => setShowQuitConfirm(false)}
                      style={{
                        marginTop: 0,
                        fontSize: 13,
                        padding: '10px 16px',
                        background: 'none',
                        border: 'none',
                        color: '#7a819c',
                        cursor: 'pointer',
                      }}
                    >
                      Annuler
                    </button>
                  </div>
                </div>
  ) : null;

  return (
    <div style={{ position: 'relative' }}>
      {cockpit && showQuitConfirm && (
        <CockpitMsgBox
          title="Terminer la partie ?"
          validateLabel="Garder les scores"
          onValidate={quitKeepingScores}
          extra={[{ label: 'Remettre à zéro', onClick: quitResettingScores }]}
          cancelLabel="Annuler"
          onCancel={() => setShowQuitConfirm(false)}
        >
          Que faire des scores actuels ?
        </CockpitMsgBox>
      )}
      {cockpit && rocketEl &&
        createPortal(
          (() => {
            const a =
              phase === 'lobby'
                ? { label: 'Démarrer la partie', ok: teams.length > 0, hint: teams.length > 0 ? 'Espace' : 'Aucune équipe connectée' }
                : phase === 'revealed'
                  ? { label: 'Question suivante', ok: pendingJokerTeamIds.length === 0, hint: pendingJokerTeamIds.length === 0 ? 'Espace' : 'Des jokers sont à régler' }
                  : { label: 'Question suivante', ok: false, hint: 'Disponible après la réponse' };
            return <CockpitPlate id={phase === 'lobby' ? 'fusee' : 'suivante'} label={a.label} hint={a.hint} disabled={!a.ok} pulse={a.ok} onClick={goToNextQuestion} />;
          })(),
          rocketEl
        )}
      {cockpit && progressEl &&
        createPortal(
          (() => {
            const ok = mode === 'camembert' && wedgeCategories.length > 0;
            return (
              <CockpitPlate
                id="progression"
                label="Voir la progression"
                hint={ok ? 'P · toutes les équipes' : 'Mode Trivial Poursuit uniquement'}
                disabled={!ok}
                onClick={() => setShowProgressTable(true)}
              />
            );
          })(),
          progressEl
        )}
      {cockpit && quitEl &&
        createPortal(
          <CockpitPlate
            id="quitter"
            label="Quitter la partie"
            hint="Garder ou remettre à zéro les scores"
            onClick={() => setShowQuitConfirm(true)}
          />,
          quitEl
        )}
      {!cockpit && mode === 'camembert' && wedgeCategories.length > 0 && (
        <button
          onClick={() => setShowProgressTable(true)}
          title="Voir la progression de toutes les équipes"
          style={{
            position: 'absolute',
            top: cockpit ? 0 : -44,
            right: 0,
            zIndex: 2,
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: '#fff',
            border: 'none',
            boxShadow: '0 4px 12px rgba(31,36,64,0.08)',
            fontSize: 16,
            cursor: 'pointer',
          }}
        >
          📈
        </button>
      )}

      {phase === 'lobby' && (
        <div style={styles.lobbyCard}>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>En attente de démarrage…</h1>
          <div style={styles.joinCode}>{joinCode}</div>

          {loadError && (
            <p style={{ color: '#ff7a68', fontSize: 14, margin: '12px 0', maxWidth: 420, marginInline: 'auto' }}>
              {loadError}
            </p>
          )}

          {teams.length > 0 && !cockpit && (
            <button style={styles.startBtn} onClick={goToNextQuestion}>
              Démarrer la partie ({teams.length} équipes)
            </button>
          )}
        </div>
      )}

      {phase === 'camembert-setup' && (() => {
        // Icônes rondes en grille (cockpit : unités de la scène ; sinon px), nom au survol
        const u = (c: number, px: number) => (cockpit ? `${c}cqw` : `${px}px`);
        const size = u(5.4, 84);
        const showTip = (e: React.SyntheticEvent<HTMLElement>, name: string) => {
          const wrap = setupWrapRef.current;
          if (!wrap) return;
          const r = e.currentTarget.getBoundingClientRect();
          const w = wrap.getBoundingClientRect();
          const half = Math.min(w.width / 2, name.length * 5 + 20);
          const left = Math.min(Math.max(r.left - w.left + r.width / 2, half), w.width - half);
          const below = r.top - w.top < 44;
          setSetupTip({ name, left, top: below ? r.bottom - w.top + 6 : r.top - w.top - 6, below });
        };
        return (
          <div style={{ ...styles.mainCard, display: 'flex', flexDirection: 'column' }}>
            <h1 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4, flexShrink: 0 }}>🥧 Choix des thèmes de la partie</h1>
            <p style={{ color: '#7a819c', fontSize: 13.5, marginBottom: 10, flexShrink: 0 }}>
              Sélectionne {camembertSetupNeeded} thème{camembertSetupNeeded > 1 ? 's' : ''} parmi les {camembertSetupPool.length}{' '}
              disponibles ({teams.length} équipe{teams.length > 1 ? 's' : ''} en jeu). Survole une icône pour voir son nom.
            </p>
            <div ref={setupWrapRef} style={{ position: 'relative', flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <div
                onScroll={() => setSetupTip(null)}
                style={{
                  flex: '1 1 auto',
                  minHeight: 0,
                  overflowY: 'auto',
                  display: 'grid',
                  gridTemplateColumns: `repeat(auto-fill, ${size})`,
                  gap: u(0.9, 12),
                  justifyContent: 'center',
                  alignContent: 'start',
                  padding: '6px 6px 10px',
                  scrollbarWidth: 'thin',
                }}
              >
                {camembertSetupPool.map((c) => {
                  const selected = camembertSetupSelected.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-label={c.name}
                      aria-pressed={selected}
                      onClick={() => toggleCamembertSetupCategory(c.id)}
                      onMouseEnter={(e) => showTip(e, c.name)}
                      onMouseLeave={() => setSetupTip(null)}
                      onFocus={(e) => showTip(e, c.name)}
                      onBlur={() => setSetupTip(null)}
                      style={{
                        width: size,
                        height: size,
                        padding: 0,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        border: selected ? '3px solid #ffb648' : '3px solid rgba(255,255,255,0.25)',
                        background: selected ? 'radial-gradient(circle, #fff3d6 0%, #ffc766 100%)' : 'rgba(255,255,255,0.92)',
                        boxShadow: selected ? '0 0 14px 3px rgba(255,182,72,0.8)' : 'none',
                        transform: selected ? 'scale(1.06)' : 'none',
                        transition: 'transform .15s, box-shadow .15s, background .15s, border-color .15s',
                      }}
                    >
                      <CategoryBadge name={c.name} emoji={c.emoji} height={`calc(${size} * 0.8)`} />
                    </button>
                  );
                })}
              </div>
              {setupTip && (
                <div
                  style={{
                    position: 'absolute',
                    left: setupTip.left,
                    top: setupTip.top,
                    transform: setupTip.below ? 'translateX(-50%)' : 'translate(-50%, -100%)',
                    background: '#0d1130',
                    color: '#fff',
                    border: '1px solid rgba(160,200,255,0.7)',
                    borderRadius: 8,
                    padding: '5px 12px',
                    fontWeight: 700,
                    fontSize: 14,
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    zIndex: 5,
                    boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
                  }}
                >
                  {setupTip.name}
                </div>
              )}
            </div>
            <button
              style={{ ...styles.startBtn, flexShrink: 0, marginTop: 10, opacity: camembertSetupSelected.length === camembertSetupNeeded ? 1 : 0.5 }}
              onClick={confirmCamembertSetup}
              disabled={camembertSetupSelected.length !== camembertSetupNeeded}
            >
              Valider ({camembertSetupSelected.length}/{camembertSetupNeeded})
            </button>
          </div>
        );
      })()}

      {phase === 'choosing-category' && (
        <div style={styles.lobbyCard}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🥧</div>
          <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>
            {teams.find((t) => t.id === camembertChooserTeamId)?.name ?? 'Une équipe'} choisit une catégorie…
          </h1>
          <p style={{ color: '#7a819c', fontSize: 13.5 }}>La sélection se fait sur son téléphone.</p>
        </div>
      )}

      {(phase === 'question' || phase === 'revealed') && question && (
        <div style={styles.mainCard}>
          <div style={styles.qHead}>
            <span style={styles.qTag}>Question</span>
            {(question.category_name || camembertCategory) && (
              <CategoryBadge
                name={question.category_name ?? camembertCategory?.name}
                emoji={question.category_emoji ?? camembertCategory?.emoji}
                height={cockpit ? '5cqw' : '84px'}
                fallbackStyle={{ ...styles.qTag, background: '#eef0f8', color: '#6c7bf7' }}
              />
            )}
            {mode === 'participatif' && (
              <span style={{ ...styles.qTag, background: '#fff3e0', color: '#b5761f' }}>
                🪙 Cagnotte : {participatifPotRef.current} pts
                {phase === 'revealed' && participatifOutcome === 'correct' && ' 👌'}
                {phase === 'revealed' && participatifOutcome === 'rescued' && ' 💓'}
              </span>
            )}
            {phase === 'question' && <div style={styles.timer}>{secondsLeft}s</div>}
          </div>
          <div style={styles.questionText}>{question.prompt}</div>
          {question.media_url && (
            <MediaClip
              key={`media-${question.id}`}
              mediaUrl={question.media_url}
              revealed={phase === 'revealed'}
              cockpit={cockpit}
              onSkip={phase === 'question' ? skipQuestion : undefined}
              onDisable={phase === 'question' ? disableAndSkip : undefined}
            />
          )}

          <div style={styles.choices} key={question.id}>
            {(['a', 'b', 'c', 'd'] as const).map((letter) => (
              <div
                key={`${question.id}-${letter}`}
                style={{
                  ...styles.choice,
                  ...(phase === 'revealed' && letter === question.correct_choice ? styles.choiceCorrect : {}),
                }}
              >
                <strong>{letter.toUpperCase()}.</strong> {question[`choice_${letter}` as const]}
              </div>
            ))}
          </div>

          {phase === 'revealed' && question.explanation &&
            (cockpit ? toExplain(<CockpitCrawl text={question.explanation} />) : <div style={styles.explainBox}>{question.explanation}</div>)}

          {/* Seules les réponses et temps sont affichés ici — les scores sont sur les tuiles équipes du menu */}
          {(() => {
            const tileList = (cockpit ? [...teams].sort((x, y) => (y.score ?? 0) - (x.score ?? 0) || x.name.localeCompare(y.name, 'fr')) : teams).map((t) => {
              const hasAnswered = answeredTeamIds.has(t.id);
              const info = revealedInfo[t.id];
              const isCorrect = phase === 'revealed' && info?.choice === question.correct_choice;
              const choiceColor = info?.choice ? CHOICE_COLORS[info.choice as 'a' | 'b' | 'c' | 'd'] : null;

              return (
                <div
                  key={t.id}
                  style={{
                    ...styles.teamTile,
                    ...(mode === 'defi' && t.id === challengerTeamId && phase === 'question'
                      ? { borderColor: '#ffb648', background: cockpit ? 'rgba(255,182,72,0.28)' : '#fff3e0' }
                      : {}),
                    ...(mode === 'participatif' && t.id === participatifTurnTeamId && phase === 'question'
                      ? { borderColor: '#ffb648', background: cockpit ? 'rgba(255,182,72,0.28)' : '#fff3e0' }
                      : {}),
                    ...(phase === 'question' && hasAnswered ? styles.teamAnswered : {}),
                    ...(phase === 'revealed' && choiceColor
                      ? { borderColor: choiceColor, background: choiceColor + '22' }
                      : {}),
                  }}
                >
                  {mode === 'defi' && t.id === challengerTeamId && <span title="Challenger">👑 </span>}
                  {mode === 'participatif' && t.id === participatifTurnTeamId && <span title="Son tour">🎙️ </span>}
                  {mode === 'camembert' && t.id === camembertChooserTeamId && <span title="Choisit la catégorie">🥧 </span>}
                  <TeamAvatar avatar={t.avatar} /> {t.name}
                  {mode === 'survie' && (
                    <span style={{ marginLeft: 6, fontSize: 12 }}>
                      {(t.lives ?? 3) > 0 ? '❤️'.repeat(t.lives ?? 3) : '💀'}
                    </span>
                  )}
                  {mode === 'camembert' && (
                    <span style={{ marginLeft: 6, fontSize: 12, color: '#7a819c' }}>
                      {(t.camembert_won ?? []).length}/{wedgeCategories.length} parts
                      {(t.camembert_jokers ?? 0) > 0 ? ` · 🤡×${t.camembert_jokers}` : ''}
                      {pendingJokerTeamIds.includes(t.id) ? ` · ⏳ décision Joker (${jokerSecondsLeft}s)` : ''}
                    </span>
                  )}
                  {phase === 'revealed' && (
                    <strong style={{ marginLeft: 6 }}>
                      {info?.choice
                        ? `· ${info.choice.toUpperCase()}${isCorrect ? ' ✓' : ' ✕'}${
                            info.timeMs ? ` (${(info.timeMs / 1000).toFixed(1)}s)` : ''
                          }`
                        : '· pas de réponse'}
                    </strong>
                  )}
                </div>
              );
            });
            return cockpit ? <CockpitTicker items={tileList} /> : <div style={styles.teamsRow}>{tileList}</div>;
          })()}

          {phase === 'revealed' && toActions(
            <>
              {loadError && (
                <p style={{ color: '#ff7a68', fontSize: 14, marginBottom: 12 }}>{loadError}</p>
              )}
              {!cockpit && (
                <button id="ck-fusee" style={styles.startBtn} onClick={goToNextQuestion} disabled={pendingJokerTeamIds.length > 0}>
                  Question suivante
                </button>
              )}
              {!cockpit && (
              <button
                onClick={() => setShowQuitConfirm(true)}
                className={cockpit ? 'ck-key' : undefined}
                style={
                  cockpit
                    ? ckKeyDanger
                    : {
                        marginLeft: 10,
                        background: 'none',
                        border: '1px solid #eaedf6',
                        borderRadius: 999,
                        padding: '13px 20px',
                        fontWeight: 700,
                        fontSize: 14,
                        color: '#7a819c',
                        cursor: 'pointer',
                      }
                }
              >
                Quitter la partie
              </button>
              )}

              {!cockpit && quitConfirmNode}
            </>
          )}
        </div>
      )}

      {cockpit && showProgressTable && (
        <div
          onClick={() => setShowProgressTable(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(2,5,25,0.68)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ position: 'relative', width: `${theme.frames.progress.width}cqw`, aspectRatio: `${theme.frames.progress.ratio}`, backgroundImage: `url(${theme.frames.progress.src})`, backgroundSize: '100% 100%', color: '#e8eeff' }}
          >
            <div style={{ position: 'absolute', left: '6%', right: '6%', top: '9%', bottom: '9%', display: 'flex', flexDirection: 'column', gap: '0.8cqw' }}>
              <div style={{ fontSize: '1.9cqw', fontWeight: 800, color: '#fff', textShadow: '0 0 1cqw rgba(90,160,255,0.9)' }}>📈 Progression des camemberts</div>
              <div className="ck-scroll" style={{ flex: 1, overflow: 'auto', background: 'rgba(3,8,35,0.62)', borderRadius: '1cqw', padding: '0.8cqw' }}>
                {progressTable}
              </div>
            </div>
            <div style={{ position: 'absolute', right: '2.4%', bottom: '3.4%' }}>
              <CockpitPlate id="annuler" label="Fermer" tipSide="above" onClick={() => setShowProgressTable(false)} height={4} />
            </div>
          </div>
        </div>
      )}

      {!cockpit && showProgressTable && (
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
              padding: 28,
              maxWidth: 720,
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto',
              position: 'relative',
              boxShadow: '0 20px 50px -12px rgba(31,36,64,0.3)',
            }}
          >
            <button
              onClick={() => setShowProgressTable(false)}
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
            <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 16 }}>📈 Progression des camemberts</h2>
            {progressTable}
          </div>
        </div>
      )}
    </div>
  );
}

// L'API Supabase ne renvoie jamais plus de 1000 lignes par requête.
const QUESTION_PAGE = 1000;

// Liste TOUS les ids de questions d'une requête, page par page. Sans cette pagination le pool était tronqué aux 1000 premières
// lignes de la table : une catégorie « tardive » (ex. Halloween, 99 questions) n'y avait plus que quelques questions et la
// partie se terminait après 3 questions.
async function fetchQuestionIds(build: () => any): Promise<{ ids: string[]; error: any }> {
  const ids: string[] = [];
  for (let from = 0; ; from += QUESTION_PAGE) {
    const { data, error } = await build().order('id', { ascending: true }).range(from, from + QUESTION_PAGE - 1);
    if (error) return { ids, error };
    (data ?? []).forEach((r: { id: string }) => ids.push(r.id));
    if (!data || data.length < QUESTION_PAGE) break;
  }
  return { ids, error: null };
}

async function loadNextQuestion(
  gameId: string,
  startQuestion: (q: Question) => void,
  onError: (msg: string) => void,
  onExhausted: (info: { total: number; asked: number }) => void,
  askedQuestionIds: string[] = [],
  previousQuestionIds: string[] = [],
  forceCategoryId?: string
) {
  const { data: game } = await supabase
    .from('games')
    .select('level_ids, category_ids, profile_id')
    .eq('id', gameId)
    .single();

  // Requête de base (ids seulement : léger) ; le filtre de catégorie se fait côté serveur
  const base = (packChunk?: string[]) => {
    let q: any = supabase.from('questions').select('id').eq('validated', true);
    if (packChunk) q = q.in('pack_id', packChunk);
    else {
      if (game?.level_ids?.length) q = q.in('level_id', game.level_ids);
      if (game?.category_ids?.length) q = q.in('category_id', game.category_ids);
    }
    if (forceCategoryId) q = q.eq('category_id', forceCategoryId);
    return q;
  };

  const idSet = new Set<string>();
  let error: any = null;

  if (game?.profile_id) {
    const { data: profilePacks } = await supabase
      .from('quiz_profile_packs')
      .select('pack_id')
      .eq('profile_id', game.profile_id);

    const packIds = (profilePacks ?? []).map((pp) => pp.pack_id);

    if (packIds.length === 0) {
      onError("Le profil sélectionné n'a aucun pack associé. Ajoute des packs à ce profil dans Paramétrage.");
      return;
    }

    // Par lots de 50 packs : l'adresse de la requête reste courte même pour un gros profil
    for (let i = 0; i < packIds.length; i += 50) {
      const res = await fetchQuestionIds(() => base(packIds.slice(i, i + 50)));
      if (res.error) {
        error = res.error;
        break;
      }
      res.ids.forEach((id) => idSet.add(id));
    }
  } else {
    const res = await fetchQuestionIds(() => base());
    error = res.error;
    res.ids.forEach((id) => idSet.add(id));
  }

  if (error) {
    onError(`Erreur lors du chargement des questions : ${error.message}`);
    return;
  }

  const all = Array.from(idSet);
  if (all.length === 0) {
    onError(
      forceCategoryId
        ? "Aucune question disponible pour cette catégorie précise. Ajoute des questions à ce pack dans Paramétrage."
        : "Aucune question disponible. Va dans Paramétrage pour créer des packs (Gemini) et un profil, ou vérifie que la table `questions` contient des lignes validées."
    );
    return;
  }

  // Trois niveaux : 1) questions jamais posées avec ce code, 2) déjà posées lors d'une partie PRÉCÉDENTE mais pas dans celle-ci,
  // 3) (Trivial seulement) réutilisation. Avant, l'historique de toutes les parties précédentes était compté comme « déjà posé » :
  // à force de rejouer avec le même code il ne restait que quelques questions neuves et la partie se terminait après 3 questions.
  const asked = new Set(askedQuestionIds);
  const before = new Set(previousQuestionIds);
  let candidates = all.filter((id) => !asked.has(id) && !before.has(id));
  if (candidates.length === 0) candidates = all.filter((id) => !asked.has(id));

  if (candidates.length === 0) {
    if (forceCategoryId) {
      // Trivial Poursuit : la catégorie choisie n'a plus de question neuve. On réutilise ses questions (sauf la dernière posée)
      // plutôt que de terminer toute la partie.
      const last = askedQuestionIds[askedQuestionIds.length - 1];
      candidates = all.length > 1 ? all.filter((id) => id !== last) : all;
    } else {
      // Toutes les questions ont été posées pendant cette partie : elle se termine proprement (pas de répétition).
      onExhausted({ total: all.length, asked: all.filter((id) => asked.has(id)).length });
      return;
    }
  }

  const pickedId = candidates[Math.floor(Math.random() * candidates.length)];
  const { data: randomQuestion, error: questionError } = await supabase.from('questions').select('*').eq('id', pickedId).single();
  if (questionError || !randomQuestion) {
    onError(`Erreur lors du chargement de la question : ${questionError?.message ?? 'question introuvable'}`);
    return;
  }

  // Attache le nom/emoji de la catégorie à la question, pour l'afficher
  // quel que soit le mode de jeu (les packs mélangent plusieurs thèmes).
  if (randomQuestion.category_id) {
    const { data: cat } = await supabase.from('categories').select('name, emoji').eq('id', randomQuestion.category_id).single();
    if (cat) {
      randomQuestion.category_name = cat.name;
      randomQuestion.category_emoji = cat.emoji;
    }
  }

  startQuestion(randomQuestion as Question);
}

// Extrait Deezer d'une question « blind test » : joué sur l'écran de l'hôte uniquement (les téléphones ne font que répondre).
// Le lien d'aperçu est demandé à Deezer au moment de jouer (il expire : on ne le stocke jamais). Titre et pochette n'apparaissent
// qu'à la révélation de la réponse.
function DeezerClip({ mediaUrl, revealed, cockpit, onSkip, onDisable }: { mediaUrl: string; revealed: boolean; cockpit: boolean; onSkip?: () => void; onDisable?: () => void }) {
  const trackId = deezerTrackId(mediaUrl);
  const [track, setTrack] = useState<DeezerTrack | null>(null);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const u = (px: number) => (cockpit ? `${(px / 10).toFixed(2)}cqw` : `${px}px`); // mêmes proportions en px (normal) ou cqw (cockpit)

  useEffect(() => {
    if (!trackId) return;
    let cancelled = false;
    setTrack(null);
    setFailed(false);
    fetch(`/api/deezer?track=${trackId}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.track?.preview) setTrack(j.track as DeezerTrack);
        else setFailed(true);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [trackId]);

  // Lecture automatique dès que l'extrait est prêt (si le navigateur la bloque, le bouton ▶ prend le relais)
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !track) return;
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [track]);

  if (!trackId) return null;

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      if (a.ended) a.currentTime = 0;
      a.play().catch(() => undefined);
    } else a.pause();
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: u(14), margin: `${u(10)} 0 ${u(14)}`, color: 'inherit', fontSize: u(14), fontWeight: 700 }}>
      {track && (
        <audio ref={audioRef} src={track.preview} preload="auto" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
      )}
      {revealed && track?.album.cover ? (
        <img src={track.album.cover} alt="" style={{ width: u(56), height: u(56), borderRadius: u(10), objectFit: 'cover', flex: '0 0 auto' }} />
      ) : (
        <button
          type="button"
          onClick={toggle}
          disabled={!track}
          aria-label={playing ? "Mettre l'extrait en pause" : "Écouter l'extrait"}
          style={{ width: u(56), height: u(56), borderRadius: '50%', border: 'none', background: '#6c7bf7', color: '#fff', fontSize: u(22), cursor: track ? 'pointer' : 'default', flex: '0 0 auto' }}
        >
          {playing ? '⏸' : '▶'}
        </button>
      )}
      <div style={{ minWidth: 0 }}>
        {failed ? (
          <ClipFailure text="Extrait indisponible." cockpit={cockpit} onSkip={onSkip} onDisable={onDisable} />
        ) : revealed && track ? (
          <>
            <div style={{ fontSize: u(16), fontWeight: 800 }}>« {track.titleShort} »</div>
            <div style={{ opacity: 0.85 }}>{track.artist.name}{track.year ? ` · ${track.year}` : ''}</div>
          </>
        ) : (
          <span>{track ? '🎧 Extrait de 30 s' : "Chargement de l'extrait…"}</span>
        )}
        <div style={{ fontSize: u(11), opacity: 0.6, fontWeight: 600 }}>Aperçu fourni par Deezer</div>
      </div>
    </div>
  );
}

// Vidéo YouTube d'une question (bande-annonce, pub, extrait) : lecteur officiel, visible, joué sur l'écran de l'hôte uniquement.
// Début/fin viennent du lien. Si la vidéo ne peut pas être lue, l'hôte peut passer la question (ou la retirer du jeu).
// Média illisible : l'hôte peut passer la question (le chrono n'a plus de raison de tourner) ou la retirer définitivement du jeu
function ClipFailure({ text, cockpit, onSkip, onDisable }: { text: string; cockpit: boolean; onSkip?: () => void; onDisable?: () => void }) {
  const u = (px: number) => (cockpit ? `${(px / 10).toFixed(2)}cqw` : `${px}px`);
  const button: React.CSSProperties = { border: 'none', borderRadius: 999, padding: `${u(8)} ${u(16)}`, fontWeight: 800, fontSize: u(14), cursor: 'pointer', fontFamily: 'inherit' };
  return (
    <div style={{ marginTop: u(8), color: cockpit ? '#ff9a9a' : '#c0392b', fontWeight: 700, fontSize: u(14) }}>
      {text}
      {onSkip && (
        <div style={{ display: 'flex', gap: u(10), marginTop: u(8), flexWrap: 'wrap' }}>
          <button type="button" onClick={onSkip} style={{ ...button, background: '#6c7bf7', color: '#fff' }}>Passer cette question</button>
          {onDisable && (
            <button type="button" onClick={onDisable} style={{ ...button, background: '#eef0f8', color: '#1f2440' }}>Retirer du jeu et passer</button>
          )}
        </div>
      )}
    </div>
  );
}

function YouTubeClip({ info, cockpit, onSkip, onDisable }: { info: YouTubeInfo; cockpit: boolean; onSkip?: () => void; onDisable?: () => void }) {
  const holderRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let player: any;
    let cancelled = false;
    setFailed(false);
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !holderRef.current) return;
        holderRef.current.innerHTML = '';
        const el = document.createElement('div');
        holderRef.current.appendChild(el);
        player = new YT.Player(el, {
          width: '100%',
          height: '100%',
          videoId: info.id,
          playerVars: { autoplay: 1, rel: 0, modestbranding: 1, playsinline: 1, ...(info.start !== undefined ? { start: info.start } : {}), ...(info.end !== undefined ? { end: info.end } : {}) },
          events: { onError: () => setFailed(true) },
        });
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      try {
        player?.destroy();
      } catch {
        /* lecteur déjà retiré */
      }
    };
  }, [info.id, info.start, info.end]);

  return (
    <div style={{ margin: '10px 0 14px' }}>
      <div ref={holderRef} style={{ width: cockpit ? '38cqw' : 'min(560px, 100%)', aspectRatio: '16 / 9', background: '#000', borderRadius: cockpit ? '1cqw' : 12, overflow: 'hidden' }} />
      {failed && <ClipFailure text="Vidéo indisponible." cockpit={cockpit} onSkip={onSkip} onDisable={onDisable} />}
    </div>
  );
}

// Extrait d'une question : morceau Deezer (blind test) ou vidéo YouTube
function MediaClip({ mediaUrl, revealed, cockpit, onSkip, onDisable }: { mediaUrl: string; revealed: boolean; cockpit: boolean; onSkip?: () => void; onDisable?: () => void }) {
  const yt = youtubeInfo(mediaUrl);
  return yt ? (
    <YouTubeClip info={yt} cockpit={cockpit} onSkip={onSkip} onDisable={onDisable} />
  ) : (
    <DeezerClip mediaUrl={mediaUrl} revealed={revealed} cockpit={cockpit} onSkip={onSkip} onDisable={onDisable} />
  );
}

const baseStyles: Record<string, React.CSSProperties> = {
  lobbyCard: {
    maxWidth: 600,
    textAlign: 'center',
    background: '#fff',
    borderRadius: 24,
    padding: 40,
    boxShadow: '0 10px 30px -12px rgba(31,36,64,0.12)',
  },
  joinCode: {
    fontSize: 40,
    fontWeight: 800,
    letterSpacing: 6,
    margin: '16px 0',
    color: '#6c7bf7',
  },
  startBtn: {
    background: '#6c7bf7',
    color: '#fff',
    border: 'none',
    borderRadius: 999,
    padding: '14px 28px',
    fontWeight: 700,
    fontSize: 15,
    cursor: 'pointer',
    marginTop: 12,
  },
  mainCard: {
    maxWidth: 900,
    background: '#fff',
    borderRadius: 24,
    padding: 32,
    boxShadow: '0 10px 30px -12px rgba(31,36,64,0.12)',
  },
  qHead: { display: 'flex', justifyContent: 'space-between', marginBottom: 16 },
  qTag: { background: '#e6f5fd', color: '#4fb0e8', fontWeight: 800, padding: '6px 12px', borderRadius: 999, fontSize: 12 },
  timer: { fontWeight: 800, fontSize: 20, color: '#6c7bf7' },
  questionText: { fontSize: 16, fontWeight: 800, marginBottom: 24 },
  choices: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 },
  choice: { background: '#f4f6fb', borderRadius: 16, padding: 16, fontWeight: 700, border: '2px solid transparent' },
  choiceCorrect: { background: '#e3f8f2', borderColor: '#35c2a3' },
  explainBox: { background: '#e3f8f2', borderRadius: 16, padding: 16, marginBottom: 24, color: '#1f2440' },
  teamsRow: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  teamTile: { border: '2px solid #eaedf6', borderRadius: 16, padding: '10px 14px', fontWeight: 700, fontSize: 14 },
  teamAnswered: { borderColor: '#d8dcec', background: '#eef0f8' },
};
