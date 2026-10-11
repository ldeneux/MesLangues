'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { loadKanjiPaths } from './kanjiPaths';
import { BOX, MIN_STEP, TOLERANCE, dist, sampleModel, sampleStroke, type Pt, type Stroke, type Sample } from './strokeUtils';

// Module de dessin : on trace le caractère (kanji ou kana) à la souris, au doigt ou au stylet (Pointer Events), avec un guide
// optionnel. « Vérifier » compare chaque trait au modèle (voir strokeUtils.ts).

export default function KanjiDraw({ char }: { char: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentRef = useRef<Stroke | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [paths, setPaths] = useState<string[] | null>(null);
  const [model, setModel] = useState<Sample[] | null>(null);
  const [pathError, setPathError] = useState(false);
  const [guide, setGuide] = useState(true);
  const [showModel, setShowModel] = useState(false);
  const [checked, setChecked] = useState<boolean[] | null>(null);

  // Nouveau kanji → on repart d'une page blanche
  useEffect(() => {
    let cancelled = false;
    setStrokes([]);
    setChecked(null);
    setShowModel(false);
    setPaths(null);
    setModel(null);
    setPathError(false);
    loadKanjiPaths(char)
      .then((ds) => {
        if (cancelled) return;
        setPaths(ds);
        setModel(ds.map(sampleModel));
      })
      .catch(() => {
        if (!cancelled) setPathError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [char]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const scale = canvas.width / BOX;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // repères en croix
    ctx.strokeStyle = '#d9d6cc';
    ctx.lineWidth = 0.6;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(BOX / 2, 0);
    ctx.lineTo(BOX / 2, BOX);
    ctx.moveTo(0, BOX / 2);
    ctx.lineTo(BOX, BOX / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // modèle : en pâle (guide) ou en gris plus marqué (« Voir le modèle »)
    if (paths && (guide || showModel)) {
      ctx.strokeStyle = showModel ? '#b9b4a3' : '#e4e1d7';
      ctx.lineWidth = 3.6;
      for (const d of paths) ctx.stroke(new Path2D(d));
    }

    // traits de l'utilisateur
    const all = currentRef.current ? [...strokes, currentRef.current] : strokes;
    all.forEach((s, i) => {
      ctx.strokeStyle = checked ? (checked[i] ? '#2f6b4f' : '#a3402f') : '#23241f';
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(s[0].x, s[0].y);
      if (s.length === 1) ctx.lineTo(s[0].x + 0.01, s[0].y + 0.01); // simple appui = un point
      for (let k = 1; k < s.length; k++) ctx.lineTo(s[k].x, s[k].y);
      ctx.stroke();
    });
  }, [strokes, paths, guide, showModel, checked]);

  // Taille du canevas (net sur écrans haute densité) + redessin
  useEffect(() => {
    function resize() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = canvas.width;
      draw();
    }
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [draw]);

  function toPoint(e: React.PointerEvent<HTMLCanvasElement>): Pt {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * BOX, y: ((e.clientY - rect.top) / rect.height) * BOX };
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (checked) setChecked(null); // on corrige après une vérification : on repart sur du noir
    currentRef.current = [toPoint(e)];
    draw();
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const cur = currentRef.current;
    if (!cur) return;
    const p = toPoint(e);
    if (dist(p, cur[cur.length - 1]) < MIN_STEP) return;
    cur.push(p);
    draw();
  }

  function onUp() {
    const cur = currentRef.current;
    currentRef.current = null;
    if (cur) setStrokes((prev) => [...prev, cur]);
  }

  function check() {
    if (!model) return;
    setChecked(
      strokes.map((s, i) => {
        const m = model[i];
        if (!m) return false;
        const u = sampleStroke(s);
        return dist(u.start, m.start) <= TOLERANCE && dist(u.mid, m.mid) <= TOLERANCE && dist(u.end, m.end) <= TOLERANCE;
      })
    );
  }

  const okCount = checked ? checked.filter(Boolean).length : 0;
  const modelCount = model?.length ?? 0;

  return (
    <div className="kanji-draw">
      <div className="sidebar-label" style={{ marginTop: '1rem' }}>
        ✍️ S'entraîner à écrire
      </div>
      <p className="eyebrow-free">
        Trace le caractère avec la souris, le doigt ou le stylet, trait par trait, dans le bon ordre. Le guide en pâle t'aide au début.
      </p>

      <canvas
        ref={canvasRef}
        className="kanji-draw-canvas"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onContextMenu={(e) => e.preventDefault()}
      />

      <div className="conv-bubble-actions" style={{ marginTop: '0.5rem' }}>
        <button className="conv-mini-btn" onClick={() => { setStrokes([]); setChecked(null); }} disabled={strokes.length === 0}>
          🗑 Effacer
        </button>
        <button className="conv-mini-btn" onClick={() => { setStrokes((s) => s.slice(0, -1)); setChecked(null); }} disabled={strokes.length === 0}>
          ↩ Annuler le dernier trait
        </button>
        <button className={`conv-mini-btn${guide ? ' active' : ''}`} onClick={() => setGuide((g) => !g)} disabled={!paths}>
          Guide : {guide ? 'oui' : 'non'}
        </button>
        <button className={`conv-mini-btn${showModel ? ' active' : ''}`} onClick={() => setShowModel((m) => !m)} disabled={!paths}>
          Voir le modèle
        </button>
        <button className="primary" onClick={check} disabled={strokes.length === 0 || !model}>
          ✔ Vérifier mes traits
        </button>
      </div>

      {pathError && <p className="eyebrow-free">Modèle indisponible pour le moment (connexion ?) : tu peux dessiner, mais sans guide ni vérification.</p>}

      {checked && (
        <div className={okCount === modelCount && strokes.length === modelCount ? 'conv-correction exercise-success' : 'conv-correction'}>
          <div className="conv-correction-text">
            {okCount} trait{okCount > 1 ? 's' : ''} bien placé{okCount > 1 ? 's' : ''} sur {modelCount}
          </div>
          {strokes.length !== modelCount && (
            <p className="eyebrow-free">
              Tu as tracé {strokes.length} trait{strokes.length > 1 ? 's' : ''}, le modèle en compte {modelCount}.
            </p>
          )}
          <p className="eyebrow-free">
            Vert : trait au bon endroit, dans le bon ordre et le bon sens. Rouge : à revoir. Vérification approximative.
          </p>
        </div>
      )}
    </div>
  );
}
