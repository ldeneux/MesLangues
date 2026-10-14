'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { THEME_LIST } from '@/lib/themes';
import { useTheme } from '@/lib/useTheme';
import CategoryBadge from '@/components/CategoryBadge';
import { EDIT_FLAG } from '@/lib/layout';
import { TEAM_PRESETS } from '@/lib/teamPresets';
import { getTeamBackground } from '@/lib/teamBackgrounds';
import TeamAvatar from '@/components/TeamAvatar';
import { CostEstimate, GENERATION, GEMINI_PRICING, estimateGeminiCost, formatEur, formatUsd } from '@/lib/geminiCost';

type Level = { id: string; label: string; sort_order: number; emoji?: string | null; is_school?: boolean; is_hidden?: boolean };
type Category = { id: string; name: string; emoji: string };
type Pack = { id: string; name: string; level_id: string; category_id: string };
type Profile = { id: string; name: string; is_favorite: boolean; is_default: boolean; packIds: string[] };
type Option = 'generate' | 'profiles' | 'categories' | 'levels';
type Notice = { kind: 'ok' | 'error' | 'info'; text: string; details?: string[] } | null;
type Dialog =
  | null
  | { kind: 'confirm'; title: string; message: string; label: string; onConfirm: () => void }
  | { kind: 'cost'; est: CostEstimate; keys: string[] };

const keyOf = (categoryId: string, levelId: string) => `${categoryId}|${levelId}`;
const collator = new Intl.Collator('fr', { sensitivity: 'base' });
const strip = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const slugId = (label: string) =>
  label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'NIVEAU';

export default function ParametragePage() {
  const { themeId, setTheme } = useTheme();

  // ───────── Carrousel d'habillages : aperçu seul, détail au survol ─────────
  const [hover, setHover] = useState<{ id: string; rect: DOMRect } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const viewedId = useRef<string | null>(null); // dernier habillage visualisé (point de départ des flèches)
  const quietUntil = useRef(0); // ignore les événements de défilement provoqués par les flèches
  const [teamsFor, setTeamsFor] = useState<string | null>(null); // habillage dont la fenêtre « Équipes » est ouverte
  const [bigTheme, setBigTheme] = useState<string | null>(null); // habillage dont le décor est affiché en grand (double-clic)
  const stopTimer = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  };
  const openHover = (id: string, el: HTMLElement) => {
    stopTimer();
    viewedId.current = id;
    setHover({ id, rect: el.getBoundingClientRect() });
  };
  const closeHover = () => {
    stopTimer();
    hoverTimer.current = setTimeout(() => setHover(null), 150);
  };
  // Flèches ‹ › et ← → : déplacent l'habillage visualisé (comme le survol de la souris) et le gardent visible
  const stepTheme = (dir: number) => {
    const ids = THEME_LIST.map((t) => t.id);
    const base = hover?.id ?? viewedId.current;
    const from = ids.indexOf(base ?? themeId);
    const idx = base ? Math.min(ids.length - 1, Math.max(0, from + dir)) : Math.max(0, from);
    const el = tileRefs.current[ids[idx]];
    if (!el) return;
    quietUntil.current = Date.now() + 400;
    el.scrollIntoView({ behavior: 'auto', inline: 'center', block: 'nearest' });
    requestAnimationFrame(() => openHover(ids[idx], el));
  };
  useEffect(() => {
    const close = () => {
      if (Date.now() < quietUntil.current) return;
      setHover(null);
    };
    const outside = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-theme-tile], [data-theme-popup], [data-carousel-arrow]')) return;
      setHover(null);
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('pointerdown', outside);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('pointerdown', outside);
    };
  }, []);
  const hoverTheme = hover ? THEME_LIST.find((t) => t.id === hover.id) : undefined;
  const editLayout = (id: string) => {
    setTheme(id); // la disposition modifiée est celle de l'habillage choisi
    try { window.sessionStorage.setItem(EDIT_FLAG, '1'); } catch { /* ignoré */ }
    window.location.href = '/';
  };

  // ───────── Données ─────────
  const [categories, setCategories] = useState<Category[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [hasLevelCols, setHasLevelCols] = useState(true);
  const [loading, setLoading] = useState(true);

  // ───────── Interface ─────────
  const [option, setOption] = useState<Option>('generate');
  const [notice, setNotice] = useState<Notice>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [filter, setFilter] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [selCols, setSelCols] = useState<string[]>([]);
  const [showHidden, setShowHidden] = useState(false);

  // Clavier : ← → déplacent l'habillage visualisé ; Échap ferme l'aperçu ou la fenêtre « Équipes »
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (teamsFor) setTeamsFor(null);
        else setHover(null);
        return;
      }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (teamsFor || dialog || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return; // ne pas gêner la saisie
      e.preventDefault();
      stepTheme(e.key === 'ArrowRight' ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Option 1 — génération
  const [perPack, setPerPack] = useState(30);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const abortRef = useRef(false);

  // Option 2 — profils
  const [profileSel, setProfileSel] = useState('new');
  const [pName, setPName] = useState('');
  const [pDefault, setPDefault] = useState(false);
  const [pFav, setPFav] = useState(false);

  // Option 3 — catégories
  const [catSel, setCatSel] = useState('new');
  const [cName, setCName] = useState('');
  const [cEmoji, setCEmoji] = useState('❓');

  // Option 4 — niveaux
  const [lvSel, setLvSel] = useState('new');
  const [lName, setLName] = useState('');
  const [lEmoji, setLEmoji] = useState('');
  const [lOrder, setLOrder] = useState(1);
  const [lSchool, setLSchool] = useState(false);
  const [lHidden, setLHidden] = useState(false);

  // ───────── Chargement (léger : comptage par couple en une requête) ─────────
  const loadAll = async () => {
    const [catRes, lvlRes, packRes, profRes, ppRes] = await Promise.all([
      supabase.from('categories').select('*'),
      supabase.from('difficulty_levels').select('*'),
      supabase.from('question_packs').select('id, name, level_id, category_id'),
      supabase.from('quiz_profiles').select('*'),
      supabase.from('quiz_profile_packs').select('*'),
    ]);
    const errs = [catRes.error, lvlRes.error, packRes.error, profRes.error].filter(Boolean).map((e) => e!.message);
    if (errs.length) setNotice({ kind: 'error', text: `Erreur de chargement : ${errs.join(' | ')}` });

    const cats = ((catRes.data as Category[]) ?? []).slice().sort((a, b) => collator.compare(a.name, b.name));
    const lvls = (lvlRes.data as Level[]) ?? [];
    const packRows = (packRes.data as Pack[]) ?? [];
    setCategories(cats);
    setLevels(lvls);
    setHasLevelCols(lvls.length === 0 || 'is_hidden' in lvls[0]);
    setPacks(packRows);

    // Questions par couple catégorie × niveau : une seule requête sur la vue (voir migration-014)
    const pairCounts: Record<string, number> = {};
    const view = await supabase.from('v_pair_question_counts').select('category_id, level_id, n');
    if (!view.error && view.data) {
      (view.data as any[]).forEach((r: any) => (pairCounts[keyOf(r.category_id, r.level_id)] = (pairCounts[keyOf(r.category_id, r.level_id)] ?? 0) + r.n));
    } else {
      // Repli si la migration n'est pas encore passée : comptage paginé (plus lent mais exact au-delà de 1000 questions)
      const byPack: Record<string, number> = {};
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('questions').select('pack_id').range(from, from + 999);
        if (error || !data || data.length === 0) break;
        data.forEach((q: any) => q.pack_id && (byPack[q.pack_id] = (byPack[q.pack_id] ?? 0) + 1));
        if (data.length < 1000) break;
      }
      packRows.forEach((p) => (pairCounts[keyOf(p.category_id, p.level_id)] = (pairCounts[keyOf(p.category_id, p.level_id)] ?? 0) + (byPack[p.id] ?? 0)));
    }
    setCounts(pairCounts);

    const byProfile: Record<string, string[]> = {};
    ((ppRes.data as any[]) ?? []).forEach((pp) => (byProfile[pp.profile_id] = [...(byProfile[pp.profile_id] ?? []), pp.pack_id]));
    setProfiles(
      ((profRes.data as any[]) ?? [])
        .map((p) => ({ id: p.id, name: p.name, is_favorite: !!p.is_favorite, is_default: !!p.is_default, packIds: byProfile[p.id] ?? [] }))
        .sort((a, b) => (a.is_default !== b.is_default ? (a.is_default ? -1 : 1) : a.is_favorite !== b.is_favorite ? (a.is_favorite ? -1 : 1) : collator.compare(a.name, b.name)))
    );
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  // ───────── Dérivés ─────────
  const packsByPair = useMemo(() => {
    const m: Record<string, Pack[]> = {};
    packs.forEach((p) => p.category_id && p.level_id && (m[keyOf(p.category_id, p.level_id)] = [...(m[keyOf(p.category_id, p.level_id)] ?? []), p]));
    return m;
  }, [packs]);

  // Colonnes : ordre d'affichage, puis ordre alphabétique en cas d'égalité. Les niveaux masqués restent
  // accessibles via la case « Afficher les niveaux masqués » (et apparaissent s'ils ont des cases cochées).
  const sortedLevels = useMemo(() => levels.slice().sort((a, b) => a.sort_order - b.sort_order || collator.compare(a.label, b.label)), [levels]);
  const columns = useMemo(
    () => sortedLevels.filter((l) => showHidden || !l.is_hidden || [...checked].some((k) => k.endsWith(`|${l.id}`))),
    [sortedLevels, showHidden, checked]
  );
  const rows = useMemo(() => {
    const f = strip(filter.trim());
    return f ? categories.filter((c) => strip(c.name).includes(f)) : categories;
  }, [categories, filter]);

  const hiddenCount = levels.filter((l) => l.is_hidden).length;
  const pickMode = option === 'generate' || option === 'profiles';

  // ───────── Sélection dans le tableau ─────────
  const cellEnabled = (key: string) => (option === 'generate' ? true : option === 'profiles' ? !!packsByPair[key]?.length : false);

  const toggleCell = (key: string) => {
    if (!cellEnabled(key) || running) return;
    setChecked((prev) => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  };

  const toggleCol = (id: string) => setSelCols((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // Sans colonne sélectionnée, l'action porte sur toutes les colonnes affichées
  const bulk = (select: boolean) => {
    if (!pickMode || running) return;
    const cols = selCols.length ? selCols : columns.map((c) => c.id);
    setChecked((prev) => {
      const n = new Set(prev);
      rows.forEach((c) =>
        cols.forEach((l) => {
          const k = keyOf(c.id, l);
          if (!cellEnabled(k)) return;
          select ? n.add(k) : n.delete(k);
        })
      );
      return n;
    });
  };

  const chooseOption = (o: Option) => {
    if (running) return;
    setOption(o);
    setChecked(new Set());
    setSelCols([]);
    setNotice(null);
    setProfileSel('new');
    setCatSel('new');
    setLvSel('new');
  };

  // ───────── Formulaires : chargement de l'élément choisi ─────────
  useEffect(() => {
    if (option !== 'profiles') return;
    if (profileSel === 'new') {
      setPName('');
      setPDefault(false);
      setPFav(false);
      setChecked(new Set());
      return;
    }
    const p = profiles.find((x) => x.id === profileSel);
    if (!p) return;
    setPName(p.name);
    setPDefault(p.is_default);
    setPFav(p.is_favorite);
    const packById = new Map(packs.map((x) => [x.id, x]));
    const s = new Set<string>();
    p.packIds.forEach((id) => {
      const pk = packById.get(id);
      if (pk) s.add(keyOf(pk.category_id, pk.level_id));
    });
    setChecked(s);
  }, [option, profileSel, profiles, packs]);

  useEffect(() => {
    if (option !== 'categories') return;
    const c = categories.find((x) => x.id === catSel);
    setCName(c?.name ?? '');
    setCEmoji(c?.emoji ?? '❓');
  }, [option, catSel, categories]);

  useEffect(() => {
    if (option !== 'levels') return;
    const l = levels.find((x) => x.id === lvSel);
    setLName(l?.label ?? '');
    setLEmoji(l?.emoji ?? '');
    setLOrder(l?.sort_order ?? (levels.length ? Math.max(...levels.map((x) => x.sort_order)) + 1 : 1));
    setLSchool(!!l?.is_school);
    setLHidden(!!l?.is_hidden);
  }, [option, lvSel, levels]);

  // ───────── Option 1 : génération (coût affiché AVANT, coût réel APRÈS) ─────────
  const startGenerate = () => {
    const keys = [...checked];
    if (!keys.length) return setNotice({ kind: 'error', text: 'Coche au moins une case du tableau.' });
    if (!(perPack >= 1)) return setNotice({ kind: 'error', text: 'Indique un nombre de questions par pack (1 minimum).' });
    setNotice(null);
    setDialog({ kind: 'cost', est: estimateGeminiCost(keys.map((k) => ({ existing: counts[k] ?? 0 })), perPack), keys });
  };

  const runGenerate = async (keys: string[]) => {
    setDialog(null);
    setRunning(true);
    abortRef.current = false;
    const queue = [...keys];
    const total = keys.length;
    let done = 0;
    const stats = { packs: 0, added: 0, dup: 0, invalid: 0, usd: 0, calls: 0 };
    const errors: string[] = [];
    const levelLabel = (id: string) => levels.find((l) => l.id === id)?.label ?? id;
    const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? '';

    const worker = async () => {
      while (queue.length && !abortRef.current) {
        const k = queue.shift()!;
        const [categoryId, levelId] = k.split('|');
        const label = `${levelLabel(levelId)} · ${catName(categoryId)}`;
        setProgress(`Génération ${Math.min(done + 1, total)}/${total} : ${label}…`);
        let remaining = perPack;
        let touched = false;
        while (remaining > 0 && !abortRef.current) {
          const n = Math.min(GENERATION.chunkSize, remaining);
          let data: any;
          try {
            const res = await fetch('/api/generate-pack', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ levelId, categoryId, count: n }),
            });
            data = await res.json().catch(() => ({ error: `Réponse invalide du serveur (${res.status})` }));
          } catch (e: any) {
            data = { error: e?.message ?? 'Erreur réseau' };
          }
          if (data.error) {
            errors.push(`Erreur sur ${label} : ${data.error}`);
            break; // on passe au couple suivant : aucun nouvel appel payant pour ce couple
          }
          touched = true;
          stats.added += data.added ?? 0;
          stats.dup += data.duplicatesSkipped ?? 0;
          stats.invalid += data.invalidSkipped ?? 0;
          stats.usd += data.costUsd ?? 0;
          stats.calls += data.calls ?? 1;
          remaining -= n;
        }
        if (touched) stats.packs += 1;
        done += 1;
      }
    };
    await Promise.all([worker(), worker(), worker()]);

    const aborted = abortRef.current;
    setProgress('');
    setRunning(false);
    setChecked(new Set()); // toutes les cases sont désélectionnées une fois le chargement terminé ou annulé
    await loadAll();
    const parts = [
      `${stats.added} question${stats.added > 1 ? 's' : ''} ajoutée${stats.added > 1 ? 's' : ''} dans ${stats.packs} pack${stats.packs > 1 ? 's' : ''}`,
      stats.dup ? `${stats.dup} doublon${stats.dup > 1 ? 's' : ''} écarté${stats.dup > 1 ? 's' : ''}` : '',
      stats.invalid ? `${stats.invalid} invalide${stats.invalid > 1 ? 's' : ''} écartée${stats.invalid > 1 ? 's' : ''}` : '',
      `${stats.calls} appel${stats.calls > 1 ? 's' : ''} Gemini`,
      `coût réel ≈ ${formatEur(stats.usd * GEMINI_PRICING.usdToEur)} (≈ ${formatUsd(stats.usd)})`,
    ].filter(Boolean);
    setNotice({
      kind: errors.length ? 'error' : 'ok',
      text: `${aborted ? 'Génération annulée — ' : errors.length ? 'Terminé avec des erreurs — ' : 'Terminé — '}${parts.join(' · ')}`,
      details: errors,
    });
  };

  // Libère les questions d'un pack avant sa suppression : une partie peut la garder comme « question en cours » et les réponses
  // données y sont rattachées (clés étrangères). La migration 016 règle cela côté base ; ceci fonctionne même sans elle.
  const releaseQuestionRefs = async (packIds: string[]) => {
    const ids: string[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from('questions').select('id').in('pack_id', packIds).order('id').range(from, from + 999);
      ids.push(...(data ?? []).map((q: { id: string }) => q.id));
      if (!data || data.length < 1000) break;
    }
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      await supabase.from('games').update({ current_question_id: null }).in('current_question_id', chunk);
      await supabase.from('answers').delete().in('question_id', chunk);
    }
  };

  const deletePack = (key: string) => {
    const list = packsByPair[key] ?? [];
    if (!list.length) return;
    const [categoryId, levelId] = key.split('|');
    setDialog({
      kind: 'confirm',
      title: 'Supprimer ce pack ?',
      message: `Le pack « ${levelLabelOf(levelId)} · ${categoryNameOf(categoryId)} » et ses ${counts[key] ?? 0} question(s) seront supprimés, ainsi que sa présence dans les profils.`,
      label: 'Supprimer',
      onConfirm: async () => {
        await releaseQuestionRefs(list.map((p) => p.id));
        const { error } = await supabase.from('question_packs').delete().in('id', list.map((p) => p.id));
        setNotice(error ? { kind: 'error', text: `Suppression du pack impossible : ${error.message}` } : { kind: 'ok', text: 'Pack supprimé.' });
        loadAll();
      },
    });
  };
  const levelLabelOf = (id: string) => levels.find((l) => l.id === id)?.label ?? id;
  const categoryNameOf = (id: string) => categories.find((c) => c.id === id)?.name ?? '';

  // ───────── Option 2 : profils ─────────
  const saveProfile = async () => {
    const name = pName.trim();
    if (!name) return setNotice({ kind: 'error', text: 'Donne un nom au profil.' });
    if (!checked.size) return setNotice({ kind: 'error', text: 'Coche au moins une case (catégorie × niveau) pour ce profil.' });
    const packIds = [...checked].flatMap((k) => (packsByPair[k] ?? []).map((p) => p.id));

    if (pDefault) await supabase.from('quiz_profiles').update({ is_default: false }).eq('is_default', true); // un seul profil par défaut

    let id = profileSel;
    if (profileSel === 'new') {
      const { data, error } = await supabase.from('quiz_profiles').insert({ name, is_favorite: pFav, is_default: pDefault }).select().single();
      if (error || !data) return setNotice({ kind: 'error', text: `Création du profil impossible : ${error?.message}` });
      id = data.id;
    } else {
      const { error } = await supabase.from('quiz_profiles').update({ name, is_favorite: pFav, is_default: pDefault }).eq('id', id);
      if (error) return setNotice({ kind: 'error', text: `Mise à jour impossible : ${error.message}` });
      await supabase.from('quiz_profile_packs').delete().eq('profile_id', id);
    }
    const { error: linkErr } = await supabase.from('quiz_profile_packs').insert(packIds.map((pack_id) => ({ profile_id: id, pack_id })));
    if (linkErr) return setNotice({ kind: 'error', text: `Packs du profil non enregistrés : ${linkErr.message}` });
    setNotice({ kind: 'ok', text: profileSel === 'new' ? `Profil « ${name} » créé.` : `Profil « ${name} » mis à jour.` });
    await loadAll();
    setProfileSel(id);
  };

  const deleteProfile = () => {
    const p = profiles.find((x) => x.id === profileSel);
    if (!p) return;
    setDialog({
      kind: 'confirm',
      title: 'Confirmer la suppression',
      message: `Supprimer le profil « ${p.name} » ?`,
      label: 'Supprimer',
      onConfirm: async () => {
        const { error } = await supabase.from('quiz_profiles').delete().eq('id', p.id);
        if (error) return setNotice({ kind: 'error', text: `Suppression du profil impossible : ${error.message}` });
        setNotice({ kind: 'ok', text: 'Profil supprimé.' });
        setProfileSel('new');
        loadAll();
      },
    });
  };

  // ───────── Option 3 : catégories ─────────
  const saveCategory = async () => {
    const name = cName.trim();
    if (!name) return setNotice({ kind: 'error', text: 'Donne un nom à la catégorie.' });
    if (catSel === 'new') {
      const { data, error } = await supabase.from('categories').insert({ name, emoji: cEmoji || '❓' }).select().single();
      if (error || !data) return setNotice({ kind: 'error', text: `Création impossible : ${error?.message}` });
      setNotice({ kind: 'ok', text: `Catégorie « ${name} » ajoutée au tableau.` });
      await loadAll();
      setCatSel(data.id);
    } else {
      const { error } = await supabase.from('categories').update({ name, emoji: cEmoji || '❓' }).eq('id', catSel);
      if (error) return setNotice({ kind: 'error', text: `Mise à jour impossible : ${error.message}` });
      setNotice({ kind: 'ok', text: `Catégorie « ${name} » mise à jour.` });
      loadAll();
    }
  };

  const deleteCategory = () => {
    const c = categories.find((x) => x.id === catSel);
    if (!c) return;
    const nPacks = packs.filter((p) => p.category_id === c.id).length;
    setDialog({
      kind: 'confirm',
      title: 'Confirmer la suppression',
      message: `Supprimer la catégorie « ${c.name} » ?${nPacks ? ` Ses ${nPacks} pack(s) et toutes leurs questions seront supprimés aussi.` : ''}`,
      label: 'Supprimer',
      onConfirm: async () => {
        if (nPacks) await supabase.from('question_packs').delete().eq('category_id', c.id);
        const { error } = await supabase.from('categories').delete().eq('id', c.id);
        if (error) return setNotice({ kind: 'error', text: `Suppression impossible : ${error.message}` });
        setNotice({ kind: 'ok', text: 'Catégorie supprimée.' });
        setCatSel('new');
        loadAll();
      },
    });
  };

  // ───────── Option 4 : niveaux ─────────
  const saveLevel = async () => {
    const label = lName.trim();
    if (!label) return setNotice({ kind: 'error', text: 'Donne un nom au niveau.' });
    const extra = hasLevelCols ? { emoji: lEmoji.trim() || null, is_school: lSchool, is_hidden: lHidden } : {};
    if (lvSel === 'new') {
      let id = slugId(label);
      for (let i = 2; levels.some((l) => l.id === id); i++) id = `${slugId(label)}_${i}`;
      const { error } = await supabase.from('difficulty_levels').insert({ id, label, sort_order: lOrder, ...extra });
      if (error) return setNotice({ kind: 'error', text: `Création impossible : ${error.message}` });
      setNotice({ kind: 'ok', text: `Niveau « ${label} » ajouté au tableau.` });
      await loadAll();
      setLvSel(id);
    } else {
      const { error } = await supabase.from('difficulty_levels').update({ label, sort_order: lOrder, ...extra }).eq('id', lvSel);
      if (error) return setNotice({ kind: 'error', text: `Mise à jour impossible : ${error.message}` });
      setNotice({ kind: 'ok', text: `Niveau « ${label} » mis à jour.` });
      loadAll();
    }
  };

  const deleteLevel = () => {
    const l = levels.find((x) => x.id === lvSel);
    if (!l) return;
    const nPacks = packs.filter((p) => p.level_id === l.id).length;
    setDialog({
      kind: 'confirm',
      title: 'Confirmer la suppression',
      message: `Supprimer le niveau « ${l.label} » ?${nPacks ? ` Ses ${nPacks} pack(s) et toutes leurs questions seront supprimés aussi.` : ''}`,
      label: 'Supprimer',
      onConfirm: async () => {
        if (nPacks) await supabase.from('question_packs').delete().eq('level_id', l.id);
        const { error } = await supabase.from('difficulty_levels').delete().eq('id', l.id);
        if (error) return setNotice({ kind: 'error', text: `Suppression impossible : ${error.message}` });
        setNotice({ kind: 'ok', text: 'Niveau supprimé.' });
        setLvSel('new');
        loadAll();
      },
    });
  };

  // ───────── Boutons « Mettre à jour » / « Annuler » ─────────
  const onUpdate = () => {
    if (option === 'generate') startGenerate();
    else if (option === 'profiles') saveProfile();
    else if (option === 'categories') saveCategory();
    else saveLevel();
  };
  const onCancel = () => {
    if (running) {
      abortRef.current = true; // les appels déjà partis se terminent ; plus aucun nouvel appel payant n'est lancé
      setProgress('Annulation…');
      return;
    }
    setChecked(new Set());
    setSelCols([]);
    setNotice(null);
    if (option === 'profiles') setProfileSel('new');
    if (option === 'categories') setCatSel('new');
    if (option === 'levels') setLvSel('new');
  };

  // Indicateurs du profil en cours d'édition
  const nbCats = new Set([...checked].map((k) => k.split('|')[0])).size;
  const nbLevels = new Set([...checked].map((k) => k.split('|')[1])).size;
  const selectedProfile = profiles.find((p) => p.id === profileSel);

  // ───────── Rendu ─────────
  const optionBtn = (o: Option, label: string) => (
    <button type="button" onClick={() => chooseOption(o)} style={{ ...menuBtn, ...(option === o ? menuBtnActive : {}) }}>
      {label}
    </button>
  );

  const iconToggle = (on: boolean, onIcon: string, offIcon: string, title: string, onClick: () => void) => (
    <button type="button" title={title} onClick={onClick} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, padding: 0, opacity: on ? 1 : 0.45 }}>
      {on ? onIcon : offIcon}
    </button>
  );

  const trash = (onClick: () => void, disabled: boolean, title: string) => (
    <button type="button" title={title} onClick={onClick} disabled={disabled} style={{ border: 'none', background: 'none', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 22, padding: 0, opacity: disabled ? 0.3 : 1 }}>
      🗑️
    </button>
  );

  return (
    <main
      style={{
        fontFamily: 'Inter, sans-serif',
        minHeight: '100vh',
        padding: '28px 40px',
        backgroundColor: '#050818',
        backgroundImage: 'linear-gradient(rgba(3,6,20,0.25), rgba(3,6,20,0.45)), url(/bg/parametrage.webp)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
      }}
    >
      {/* Panneau clair translucide : garde les cartes et textes lisibles sur le décor */}
      <div style={{ maxWidth: 1180, margin: '0 auto', background: 'rgba(244,246,251,0.94)', borderRadius: 24, padding: '24px 32px 40px', boxShadow: '0 0 60px rgba(40,90,220,0.45)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <a href="/" style={{ color: '#7a819c', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>← Retour</a>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>⚙️ Paramétrage</h1>
        </div>

        {/* ---- Habillage de l'écran d'accueil : carrousel sur une seule ligne ---- */}
        <section style={{ ...card, maxWidth: 'none', padding: '16px 20px' }}>
          <h2 style={{ ...sectionTitle, marginBottom: 4 }}>Habillage de l'écran d'accueil</h2>
          <p style={{ color: '#7a819c', fontSize: 13, margin: '0 0 12px' }}>
            Survole un habillage (ou utilise les flèches ← →) pour l'utiliser, modifier sa disposition ou voir ses équipes. Le choix est mémorisé sur cet appareil.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" aria-label="Précédent" data-carousel-arrow onClick={() => stepTheme(-1)} style={arrowBtn}>‹</button>
            <div ref={carouselRef} onScroll={() => { if (Date.now() >= quietUntil.current) setHover(null); }} style={{ flex: 1, minWidth: 0, display: 'flex', gap: 12, overflowX: 'auto', scrollSnapType: 'x proximity', padding: '4px 2px', scrollbarWidth: 'none' }}>
              {THEME_LIST.map((t) => {
                const selected = t.id === themeId;
                return (
                  <button
                    key={t.id}
                    ref={(el) => { tileRefs.current[t.id] = el; }}
                    data-theme-tile
                    type="button"
                    title={t.label}
                    onMouseEnter={(e) => openHover(t.id, e.currentTarget)}
                    onMouseLeave={closeHover}
                    onClick={(e) => openHover(t.id, e.currentTarget)} // tactile : un appui ouvre le détail
                    onDoubleClick={() => { setHover(null); setBigTheme(t.id); }} // double-clic : décor en grand
                    aria-pressed={selected}
                    style={{
                      flex: '0 0 auto',
                      width: 132,
                      padding: 6,
                      borderRadius: 14,
                      border: selected ? '3px solid #6c7bf7' : '3px solid #eaedf6',
                      background: selected ? '#f1f3ff' : '#fff',
                      cursor: 'pointer',
                      scrollSnapAlign: 'start',
                      position: 'relative',
                    }}
                  >
                    <div style={{ background: '#f1f3fa', borderRadius: 9, padding: 4 }}>
                      <img src={t.preview} alt={t.label} draggable={false} style={{ width: '100%', display: 'block', aspectRatio: '1 / 1', objectFit: 'contain' }} />
                    </div>
                    {selected && <span style={{ position: 'absolute', top: 4, right: 8, color: '#6c7bf7', fontWeight: 800, fontSize: 15 }}>✓</span>}
                  </button>
                );
              })}
            </div>
            <button type="button" aria-label="Suivant" data-carousel-arrow onClick={() => stepTheme(1)} style={arrowBtn}>›</button>
          </div>

          {/* Détail au survol : fond d'écran réduit, texte dessous, boutons */}
          {hover && hoverTheme && (() => {
            const W = 340;
            const left = Math.max(8, Math.min(hover.rect.left + hover.rect.width / 2 - W / 2, window.innerWidth - W - 8));
            const top = Math.max(8, Math.min(hover.rect.top - 24, window.innerHeight - 390));
            const t = hoverTheme;
            const selected = t.id === themeId;
            return (
              <div data-theme-popup onMouseEnter={stopTimer} onMouseLeave={closeHover} style={{ position: 'fixed', left, top, width: W, zIndex: 40, background: '#1b1d26', color: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 18px 50px -10px rgba(0,0,0,0.6)', ...FONT }}>
                <div onDoubleClick={() => { setHover(null); setBigTheme(t.id); }} title="Double-clic : agrandir" style={{ background: t.stage.bg, aspectRatio: '16 / 10', cursor: 'zoom-in' }}>
                  <img src={t.stage.src} alt="" draggable={false} style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }} />
                </div>
                <div style={{ padding: '12px 14px 14px' }}>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>
                    {t.emoji} {t.label} {selected && <span style={{ color: '#9aa6ff' }}>✓</span>}
                  </div>
                  <div style={{ fontSize: 12.5, color: '#b8bdd3', margin: '4px 0 12px' }}>{t.description}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => setTheme(t.id)} disabled={selected} style={{ ...hoverBtn, background: '#6c7bf7', color: '#fff', opacity: selected ? 0.6 : 1, cursor: selected ? 'default' : 'pointer' }}>
                      {selected ? 'Utilisé' : 'Utiliser'}
                    </button>
                    {t.layout !== 'sober' && <button type="button" onClick={() => editLayout(t.id)} style={{ ...hoverBtn, background: '#fff', color: '#1f2440' }}>Modifier</button>}
                    <button type="button" onClick={() => { setHover(null); setTeamsFor(t.id); }} style={{ ...hoverBtn, background: 'transparent', color: '#fff', border: '1.5px solid #5b6080' }}>Équipes</button>
                  </div>
                </div>
              </div>
            );
          })()}

          {teamsFor && <TeamsModal themeId={teamsFor} onClose={() => setTeamsFor(null)} />}

          {bigTheme && (() => {
            const bt = THEME_LIST.find((x) => x.id === bigTheme);
            return bt ? <Lightbox src={bt.stage.src} bg={bt.stage.bg} caption={`${bt.emoji} ${bt.label}`} onClose={() => setBigTheme(null)} /> : null;
          })()}
        </section>

        {/* ---- Packs, profils, catégories et niveaux : un seul écran ---- */}
        <section style={{ ...card, maxWidth: 'none' }}>
          <h2 style={sectionTitle}>Créer des packs de questions</h2>
          <p style={{ color: '#7a819c', fontSize: 13, marginBottom: 16 }}>
            Un pack est créé pour chaque case cochée (catégorie × niveau) et rempli via Gemini. Le coût estimé est toujours affiché avant de lancer.{' '}
            <a href="/blindtest" style={{ color: '#6c7bf7', fontWeight: 700, textDecoration: 'none' }}>🎵 Ajouter des questions blind test (Deezer)</a>{' · '}
            <a href="/medias" style={{ color: '#6c7bf7', fontWeight: 700, textDecoration: 'none' }}>🎬 Bandes-annonces et vidéos</a>
          </p>

          {!hasLevelCols && (
            <p style={{ ...noticeStyle('error'), marginBottom: 14 }}>
              Les nouvelles options des niveaux (niveau scolaire, masquer) demandent la migration <strong>supabase/migration-014-parametrage.sql</strong> : exécute-la dans l'éditeur SQL de Supabase.
            </p>
          )}

          {/* Menu : une colonne par option, ses réglages apparaissent sous le bouton actif */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 18, alignItems: 'start', marginBottom: 18 }}>
            <div>
              {optionBtn('generate', 'Générer les packs (Gemini)')}
              {option === 'generate' && (
                <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <label style={labelStyle}>Questions par pack</label>
                  <input type="number" min={1} max={100} value={perPack} disabled={running} onChange={(e) => setPerPack(Number(e.target.value))} style={{ ...inputStyle, width: 74 }} />
                </div>
              )}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>{optionBtn('profiles', `Gérer les profils (${profiles.length})`)}</div>
                {option === 'profiles' && (
                  <>
                    {iconToggle(pDefault, '🏠', '🏠', 'Profil par défaut', () => setPDefault((v) => !v))}
                    {iconToggle(pFav, '⭐', '☆', 'Favori', () => setPFav((v) => !v))}
                    {trash(deleteProfile, profileSel === 'new', 'Supprimer le profil')}
                  </>
                )}
              </div>
              {option === 'profiles' && (
                <div style={{ marginTop: 14 }}>
                  <select value={profileSel} onChange={(e) => setProfileSel(e.target.value)} style={inputStyle}>
                    <option value="new">-- Nouveau profil</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.is_default ? '🏠 ' : ''}{p.is_favorite ? '⭐ ' : ''}{p.name}
                      </option>
                    ))}
                  </select>
                  <input value={pName} onChange={(e) => setPName(e.target.value)} placeholder="Nom du profil" style={{ ...inputStyle, marginTop: 10 }} />
                  <div style={{ marginTop: 10, fontSize: 13, color: '#4b5270', fontWeight: 600 }}>
                    {nbCats} catégorie{nbCats > 1 ? 's' : ''} / {nbLevels} niveau{nbLevels > 1 ? 'x' : ''} · {checked.size} case{checked.size > 1 ? 's' : ''}
                  </div>
                  {nbCats >= 10 && (
                    <div title="Le mode Trivial Poursuit demande exactement 10 catégories distinctes" style={trivialBadge}>
                      🎡 Trivial Poursuit{nbCats > 10 ? ` — ${nbCats} catégories : il en faut exactement 10` : ''}
                    </div>
                  )}
                  {selectedProfile && selectedProfile.packIds.length === 0 && <div style={{ fontSize: 12, color: '#b5761f', marginTop: 6 }}>Ce profil ne contient aucun pack.</div>}
                </div>
              )}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>{optionBtn('categories', `Gérer les catégories (${categories.length})`)}</div>
                {option === 'categories' && trash(deleteCategory, catSel === 'new', 'Supprimer la catégorie')}
              </div>
              {option === 'categories' && (
                <div style={{ marginTop: 14 }}>
                  <select value={catSel} onChange={(e) => setCatSel(e.target.value)} style={inputStyle}>
                    <option value="new">-- Nouvelle catégorie</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
                    ))}
                  </select>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <input value={cEmoji} onChange={(e) => setCEmoji(e.target.value)} title="Emoji (affiché si la catégorie n'a pas de badge)" style={{ ...inputStyle, width: 52, textAlign: 'center', padding: '10px 4px' }} />
                    <input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Nom de la catégorie" style={inputStyle} />
                  </div>
                </div>
              )}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>{optionBtn('levels', `Gérer les niveaux (${levels.length})`)}</div>
                {option === 'levels' && (
                  <>
                    {iconToggle(lSchool, '📓', '📓', 'Niveau scolaire (Gemini suit le programme de cette classe)', () => setLSchool((v) => !v))}
                    <input type="checkbox" checked={lHidden} onChange={(e) => setLHidden(e.target.checked)} title="Masquer cette colonne dans le tableau" style={{ width: 18, height: 18, accentColor: '#6c7bf7' }} />
                    {trash(deleteLevel, lvSel === 'new', 'Supprimer le niveau')}
                  </>
                )}
              </div>
              {option === 'levels' && (
                <div style={{ marginTop: 14 }}>
                  <select value={lvSel} onChange={(e) => setLvSel(e.target.value)} style={inputStyle}>
                    <option value="new">-- Nouveau niveau</option>
                    {sortedLevels.map((l) => (
                      <option key={l.id} value={l.id}>{l.emoji ? `${l.emoji} ` : ''}{l.label}{l.is_hidden ? ' (masqué)' : ''}</option>
                    ))}
                  </select>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <input value={lEmoji} onChange={(e) => setLEmoji(e.target.value)} placeholder="❓" title="Icône (facultative)" style={{ ...inputStyle, width: 52, textAlign: 'center', padding: '10px 4px' }} />
                    <input value={lName} onChange={(e) => setLName(e.target.value)} placeholder="Nom du niveau" style={inputStyle} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
                    <label style={{ ...labelStyle, fontWeight: 600 }}>Ordre d'affichage</label>
                    <input type="number" value={lOrder} onChange={(e) => setLOrder(Number(e.target.value))} style={{ ...inputStyle, width: 64 }} />
                  </div>
                  <div style={{ fontSize: 12, color: '#7a819c', marginTop: 8, lineHeight: 1.4 }}>
                    📓 = niveau scolaire (CM1 = primaire, Quatrième = collège…) · case = masquer la colonne
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Messages */}
          {progress && <p style={{ ...noticeStyle('info'), marginBottom: 12 }}>{progress}</p>}
          {notice && (
            <div style={{ ...noticeStyle(notice.kind), marginBottom: 12 }}>
              {notice.text}
              {notice.details && notice.details.length > 0 && (
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {notice.details.map((d, i) => (
                    <li key={i} style={{ wordBreak: 'break-word' }}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Filtre + actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12, flexWrap: 'wrap' }}>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtre les catégories" style={{ ...inputStyle, width: 320 }} />
            {hiddenCount > 0 && (
              <label style={{ ...labelStyle, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} style={{ accentColor: '#6c7bf7' }} />
                Afficher les niveaux masqués ({hiddenCount})
              </label>
            )}
            <span style={{ flex: 1 }} />
            <button type="button" onClick={onUpdate} disabled={running || loading} style={{ ...actionBtn, opacity: running || loading ? 0.55 : 1 }}>Mettre à jour</button>
            <button type="button" onClick={onCancel} style={{ ...actionBtn, background: '#eceef6', color: '#1f2440' }}>Annuler</button>
          </div>

          {/* Tableau catégories × niveaux */}
          <div style={{ overflow: 'auto', maxHeight: 560, border: '1px solid #eaedf6', borderRadius: 14, background: '#fff' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: 'left', left: 0, zIndex: 4, minWidth: 250 }}>
                    <span style={{ ...selectAllLink, opacity: pickMode ? 1 : 0.35 }} onClick={() => bulk(true)}>Tout sélectionner</span>
                    <span style={{ ...selectAllLink, marginLeft: 14, opacity: pickMode ? 1 : 0.35 }} onClick={() => bulk(false)}>Tout désélectionner</span>
                  </th>
                  {columns.map((l) => (
                    <th key={l.id} style={thStyle}>
                      <button
                        type="button"
                        onClick={() => toggleCol(l.id)}
                        title={l.is_hidden ? 'Niveau masqué' : 'Sélectionner la colonne (pour « Tout sélectionner »)'}
                        style={{ ...colPill, ...(selCols.includes(l.id) ? colPillOn : {}), ...(option === 'levels' && lvSel === l.id ? { boxShadow: '0 0 0 3px #ffd36b' } : {}), opacity: l.is_hidden ? 0.6 : 1 }}
                      >
                        {l.emoji ? `${l.emoji} ` : ''}{l.label}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={columns.length + 1} style={{ padding: 20, color: '#7a819c' }}>Chargement…</td></tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={columns.length + 1} style={{ padding: 20, color: '#7a819c' }}>Aucune catégorie{filter ? ' ne correspond au filtre' : ''}.</td></tr>
                )}
                {rows.map((c) => (
                  <tr key={c.id} style={option === 'categories' && catSel === c.id ? { background: '#fff8e1' } : undefined}>
                    <td style={{ ...tdStyle, textAlign: 'left', position: 'sticky', left: 0, background: option === 'categories' && catSel === c.id ? '#fff8e1' : '#fff', zIndex: 1 }}>
                      <span style={catPill}>
                        <CategoryBadge name={c.name} emoji={c.emoji} height="2.2em" withName style={{ fontWeight: 700 }} />
                      </span>
                    </td>
                    {columns.map((l) => {
                      const key = keyOf(c.id, l.id);
                      const n = counts[key] ?? 0;
                      const has = !!packsByPair[key]?.length;
                      const enabled = cellEnabled(key);
                      return (
                        <td key={l.id} style={tdStyle}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {pickMode && (
                              <input
                                type="checkbox"
                                checked={checked.has(key)}
                                disabled={!enabled || running}
                                onChange={() => toggleCell(key)}
                                title={!enabled && option === 'profiles' ? "Aucun pack pour ce couple : génère-le d'abord (Générer les packs)" : undefined}
                                style={{ width: 18, height: 18, accentColor: '#6c7bf7', cursor: enabled ? 'pointer' : 'not-allowed', opacity: enabled ? 1 : 0.3 }}
                              />
                            )}
                            {has && <span style={{ color: '#8a90a8', fontSize: 11.5, whiteSpace: 'nowrap' }}>({n} question{n > 1 ? 's' : ''})</span>}
                            {option === 'generate' && has && !running && (
                              <button type="button" title="Supprimer ce pack" onClick={() => deletePack(key)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, padding: 0, opacity: 0.5 }}>🗑️</button>
                            )}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ color: '#8a90a8', fontSize: 12, marginTop: 8 }}>
            {pickMode ? `${checked.size} case${checked.size > 1 ? 's' : ''} cochée${checked.size > 1 ? 's' : ''} · ` : ''}{rows.length} catégorie{rows.length > 1 ? 's' : ''} affichée{rows.length > 1 ? 's' : ''}
          </p>
        </section>

        {/* ---- Fenêtres de confirmation ---- */}
        {dialog?.kind === 'cost' && (
          <div style={overlay}>
            <div style={{ ...modal, maxWidth: 560, textAlign: 'left', padding: '30px 34px' }}>
              <p style={{ fontSize: 15.5, lineHeight: 1.6, color: '#1f2440', margin: 0 }}>
                Cette opération va créer ou compléter <strong>{dialog.est.packs} pack{dialog.est.packs > 1 ? 's' : ''}</strong> et y ajouter jusqu'à{' '}
                <strong>{dialog.est.questions} question{dialog.est.questions > 1 ? 's' : ''}</strong> ({perPack} par pack, en {dialog.est.calls} appel{dialog.est.calls > 1 ? 's' : ''} Gemini de {GENERATION.chunkSize} questions maximum).
              </p>
              <p style={{ fontSize: 13, lineHeight: 1.5, color: '#7a819c', margin: '10px 0 0' }}>
                Les questions déjà en base ne sont jamais redemandées ni dupliquées. Aucun appel supplémentaire n'est lancé pour « compenser » une question écartée.
              </p>
              <p style={{ fontSize: 15.5, color: '#1f2440', margin: '16px 0 0' }}>
                Coût estimé : <strong>≈ {formatEur(dialog.est.eur)}</strong> (≈ {formatUsd(dialog.est.usd)})
              </p>
              <p style={{ fontSize: 12, color: '#8a90a8', margin: '4px 0 0' }}>
                ≈ {dialog.est.inputTokens.toLocaleString('fr-FR')} tokens en entrée et {dialog.est.outputTokens.toLocaleString('fr-FR')} en sortie. Le coût réel sera affiché à la fin.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
                <button type="button" onClick={() => setDialog(null)} style={{ ...dlgBtn, background: '#fff', color: '#1f2440', border: '1px solid #d9dcea' }}>Annuler</button>
                <button type="button" onClick={() => runGenerate(dialog.keys)} style={{ ...dlgBtn, background: '#1f2128', color: '#fff' }}>Confirmer et générer</button>
              </div>
            </div>
          </div>
        )}

        {dialog?.kind === 'confirm' && (
          <div style={overlay}>
            <div style={modal}>
              <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 14 }}>{dialog.title}</h2>
              <p style={{ color: '#7a819c', fontSize: 13.5, marginBottom: 22 }}>{dialog.message}</p>
              <button
                onClick={() => {
                  const action = dialog.onConfirm;
                  setDialog(null);
                  action();
                }}
                style={{ display: 'block', width: '100%', background: '#ff7a68', color: '#fff', border: 'none', borderRadius: 999, padding: '14px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer', marginBottom: 10 }}
              >
                {dialog.label}
              </button>
              <button onClick={() => setDialog(null)} style={{ background: 'none', border: 'none', color: '#7a819c', fontWeight: 700, cursor: 'pointer' }}>Annuler</button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

// ───────── Fenêtre « Équipes » : les 12 équipes d'un habillage et leurs fonds d'écran équipés ─────────
// Image affichée en grand (double-clic) : se ferme par clic, double-clic, Échap ou le bouton Fermer.
// Écoute Échap et les flèches en phase de capture : fermer l'image n'agit ni sur la fenêtre « Équipes » ni sur le carrousel derrière.
function Lightbox({ src, caption, bg, onClose }: { src: string; caption: string; bg?: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const close = (e: React.MouseEvent) => { e.stopPropagation(); onClose(); };
  return (
    <div onClick={close} onDoubleClick={close} role="dialog" aria-modal="true" aria-label={caption}
      style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(8,10,20,0.88)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16, cursor: 'zoom-out', ...FONT }}>
      <img src={src} alt={caption} draggable={false} style={{ maxWidth: '96vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: 12, background: bg, boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }} />
      <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, textAlign: 'center' }}>{caption}</div>
      <button type="button" autoFocus onClick={close} style={actionBtn}>Fermer</button>
    </div>
  );
}

function BgThumb({ src, w, h, caption, emptyText, cropped, onOpen }: { src?: string; w: number; h: number; caption: string; emptyText: string; cropped?: boolean; onOpen?: () => void }) {
  const [failed, setFailed] = useState(false);
  const box: React.CSSProperties = { width: w, height: h, borderRadius: 8, overflow: 'hidden', background: '#eef0f8', flex: '0 0 auto' };
  return (
    <div style={{ textAlign: 'center' }}>
      {src && !failed ? (
        <img src={src} alt={caption} draggable={false} onError={() => setFailed(true)} onDoubleClick={onOpen} title="Double-clic : agrandir" style={{ ...box, display: 'block', objectFit: 'cover', boxShadow: '0 0 0 1px #dfe3f0', cursor: onOpen ? 'zoom-in' : undefined }} />
      ) : (
        <div style={{ ...box, border: '1.5px dashed #c9cfe4', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4, boxSizing: 'border-box', fontSize: 10, lineHeight: 1.25, color: '#7a819c', fontWeight: 600 }}>
          {src ? 'Image introuvable' : emptyText}
        </div>
      )}
      <div style={{ fontSize: 10.5, color: '#7a819c', fontWeight: 700, marginTop: 3 }}>{caption}{cropped && src && !failed ? '*' : ''}</div>
    </div>
  );
}

function TeamsModal({ themeId, onClose }: { themeId: string; onClose: () => void }) {
  const [big, setBig] = useState<{ src: string; caption: string } | null>(null); // image affichée en grand (double-clic)
  const theme = THEME_LIST.find((t) => t.id === themeId);
  if (!theme) return null;
  const teams = TEAM_PRESETS[themeId] ?? [];
  return (
    <div onClick={onClose} style={{ ...overlay, padding: 16 }} role="dialog" aria-modal="true" aria-label={`Équipes de l'habillage ${theme.label}`}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 24, width: '100%', maxWidth: 1040, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px -12px rgba(31,36,64,0.35)', ...FONT }}>
        <div style={{ padding: '22px 28px 10px' }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#1f2440' }}>{theme.emoji} Équipes — {theme.label}</h2>
          <p style={{ color: '#7a819c', fontSize: 13, margin: '4px 0 0' }}>
            {teams.length > 0 ? `${teams.length} équipes, avec le fond d'écran équipé en paysage et en portrait.${teams.some((t) => { const b = getTeamBackground(themeId, t.name); return !!b && (!b.portrait || !b.landscape); }) ? ' * : image recadrée à partir de l\'autre format.' : ''}` : 'Aucune équipe n\'est définie pour cet habillage.'}
          </p>
        </div>

        <div style={{ overflowY: 'auto', padding: '8px 28px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(224px, 1fr))', gap: 14 }}>
          {teams.map((team) => {
            const bg = getTeamBackground(themeId, team.name);
            return (
              <div key={team.name} style={{ border: '1.5px solid #eaedf6', borderLeft: `5px solid ${team.color}`, borderRadius: 14, padding: '10px 12px 10px', background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <TeamAvatar avatar={team.avatar} size={44} style={{ verticalAlign: 'middle' }} />
                  <div style={{ fontWeight: 800, fontSize: 13.5, color: '#1f2440', lineHeight: 1.25 }}>{team.name}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <BgThumb src={bg ? bg.landscape ?? bg.portrait : undefined} w={144} h={81} caption="Paysage" cropped={!!bg && !bg.landscape} emptyText="Écran standard"
                    onOpen={() => { const src = bg ? bg.landscape ?? bg.portrait : undefined; if (src) setBig({ src, caption: `${team.name} — Paysage${bg && !bg.landscape ? ' (fond portrait complet, recadré à l\'usage)' : ''}` }); }} />
                  <BgThumb src={bg ? bg.portrait ?? bg.landscape : undefined} w={46} h={81} caption="Portrait" cropped={!!bg && !bg.portrait} emptyText="Standard"
                    onOpen={() => { const src = bg ? bg.portrait ?? bg.landscape : undefined; if (src) setBig({ src, caption: `${team.name} — Portrait${bg && !bg.portrait ? ' (fond paysage complet, recadré à l\'usage)' : ''}` }); }} />
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ padding: '12px 28px 22px', textAlign: 'center', borderTop: '1px solid #eaedf6' }}>
          <button type="button" autoFocus onClick={onClose} style={actionBtn}>Fermer</button>
        </div>
      </div>
      {big && <Lightbox src={big.src} caption={big.caption} onClose={() => setBig(null)} />}
    </div>
  );
}

// ───────── Styles (police uniforme : celle du bouton « Générer les packs (Gemini) ») ─────────
const FONT: React.CSSProperties = { fontFamily: 'Inter, sans-serif' };
const card: React.CSSProperties = { background: '#fff', borderRadius: 20, padding: 24, marginBottom: 20, maxWidth: 720, boxShadow: '0 10px 30px -16px rgba(31,36,64,0.15)', ...FONT };
const arrowBtn: React.CSSProperties = { flex: '0 0 auto', width: 34, height: 34, borderRadius: 999, border: '1.5px solid #dfe3f0', background: '#fff', color: '#4553c9', fontSize: 22, lineHeight: 1, fontWeight: 800, cursor: 'pointer', ...FONT };
const hoverBtn: React.CSSProperties = { flex: 1, border: 'none', borderRadius: 999, padding: '9px 6px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap', ...FONT };
const sectionTitle: React.CSSProperties = { fontSize: 16, fontWeight: 800, marginBottom: 10 };
const selectAllLink: React.CSSProperties = { fontSize: 12, color: '#6c7bf7', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' };
const labelStyle: React.CSSProperties = { fontSize: 13.5, fontWeight: 700, color: '#1f2440', ...FONT };
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: 12, border: '1.5px solid #dfe3f0', background: '#fff', fontSize: 13.5, fontWeight: 600, color: '#1f2440', ...FONT };
const menuBtn: React.CSSProperties = { width: '100%', background: '#eceeff', color: '#6c7bf7', border: 'none', borderRadius: 999, padding: '13px 14px', fontWeight: 700, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...FONT };
const menuBtnActive: React.CSSProperties = { background: '#6c7bf7', color: '#fff', boxShadow: '0 6px 16px -8px rgba(108,123,247,0.8)' };
const actionBtn: React.CSSProperties = { background: '#6c7bf7', color: '#fff', border: 'none', borderRadius: 999, padding: '11px 24px', fontWeight: 700, fontSize: 14, cursor: 'pointer', ...FONT };
const thStyle: React.CSSProperties = { position: 'sticky', top: 0, background: '#fff', zIndex: 3, padding: '12px 8px', borderBottom: '1px solid #eaedf6', whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 8px', borderBottom: '1px solid #f1f3fa', textAlign: 'center', verticalAlign: 'middle' };
const colPill: React.CSSProperties = { padding: '7px 16px', borderRadius: 999, border: '1.5px solid #dfe3f0', background: '#fff', fontWeight: 700, fontSize: 13, color: '#1f2440', cursor: 'pointer', ...FONT };
const colPillOn: React.CSSProperties = { border: '2px solid #6c7bf7', background: '#eceeff', color: '#4553c9' };
const catPill: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', padding: '3px 14px 3px 6px', borderRadius: 999, border: '1.5px solid #eaedf6', background: '#fff', fontSize: 13, ...FONT };
const trivialBadge: React.CSSProperties = { display: 'inline-block', marginTop: 8, background: '#fff3e0', color: '#b5761f', fontWeight: 800, fontSize: 12, padding: '4px 10px', borderRadius: 999 };
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(31,36,64,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 };
const modal: React.CSSProperties = { background: '#fff', borderRadius: 24, padding: 32, maxWidth: 420, width: '90%', textAlign: 'center', boxShadow: '0 20px 50px -12px rgba(31,36,64,0.3)', ...FONT };
const dlgBtn: React.CSSProperties = { borderRadius: 999, padding: '13px 24px', fontWeight: 700, fontSize: 14.5, cursor: 'pointer', border: 'none', ...FONT };
const noticeStyle = (kind: 'ok' | 'error' | 'info'): React.CSSProperties => ({
  fontSize: 13.5,
  fontWeight: 600,
  padding: '10px 14px',
  borderRadius: 12,
  ...(kind === 'ok' ? { background: '#e8f7ee', color: '#1f7a46' } : kind === 'error' ? { background: '#fff0ee', color: '#c4442f' } : { background: '#eceeff', color: '#4553c9' }),
  ...FONT,
});
