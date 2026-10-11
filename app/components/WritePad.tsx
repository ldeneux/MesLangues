'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { loadKanjiPaths } from './kanjiPaths';
import { BOX, MIN_STEP, dist, sampleModel, sampleStroke, strokeMatches, type Pt, type Stroke, type Sample } from './strokeUtils';

export type PadResult = { ok: boolean; okCount: number; modelCount: number; strokeCount: number; skipped?: boolean };

// Zone de dessin « examen » : une case par caractère (2 cases pour une combinaison comme きゃ), avec la croix de
// repère mais SANS guide. Le modèle n'est montré qu'une fois la réponse validée ou passée (revealModel).
export default function WritePad({
  chars,
  locked,
  revealModel,
  onValidate,
  onSkip,
}: {
  chars: string[];
  locked: boolean;
  revealModel: boolean;
  onValidate: (result: PadResult) => void;
  onSkip: () => void;
}) {
  const n = Math.max(1, chars.length);
  const W = n * BOX;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentRef = useRef<Stroke | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [paths, setPaths] = useState<string[][] | null>(null);
  const [model, setModel] = useState<Sample[] | null>(null);
  const [pathError, setPathError] = useState(false);
  const [checked, setChecked] = useState<boolean[] | null>(null);
  const charsKey = chars.join('');

  // Chargement des tracés modèles (KanjiVG) de tous les caractères
  useEffect(() => {
    let cancelled = false;
    setPaths(null);
    setModel(null);
    setPathError(false);
    Promise.all(chars.map((c) => loadKanjiPaths(c)))
      .then((list) => {
        if (cancelled) return;
        setPaths(list);
        setModel(list.flatMap((ds, ci) => ds.map((d) => sampleModel(d, ci * BOX))));
      })
      .catch(() => {
        if (!cancelled) setPathError(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charsKey]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const scale = canvas.width / W;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // case + croix de repère, pour chaque caractère
    for (let ci = 0; ci < n; ci++) {
      const x0 = ci * BOX;
      ctx.strokeStyle = '#e4e1d7';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([]);
      ctx.strokeRect(x0 + 0.4, 0.4, BOX - 0.8, BOX - 0.8);
      ctx.strokeStyle = '#d9d6cc';
      ctx.lineWidth = 0.6;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x0 + BOX / 2, 0);
      ctx.lineTo(x0 + BOX / 2, BOX);
      ctx.moveTo(x0, BOX / 2);
      ctx.lineTo(x0 + BOX, BOX / 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // modèle (seulement après la réponse)
    if (paths && revealModel) {
      ctx.strokeStyle = '#b9b4a3';
      ctx.lineWidth = 3.6;
      paths.forEach((ds, ci) => {
        ctx.save();
        ctx.translate(ci * BOX, 0);
        for (const d of ds) ctx.stroke(new Path2D(d));
        ctx.restore();
      });
    }

    // traits de l'utilisateur
    const all = currentRef.current ? [...strokes, currentRef.current] : strokes;
    all.forEach((s, i) => {
      ctx.strokeStyle = checked ? (checked[i] ? '#2f6b4f' : '#a3402f') : '#23241f';
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(s[0].x, s[0].y);
      if (s.length === 1) ctx.lineTo(s[0].x + 0.01, s[0].y + 0.01);
      for (let k = 1; k < s.length; k++) ctx.lineTo(s[k].x, s[k].y);
      ctx.stroke();
    });
  }, [strokes, paths, revealModel, checked, n, W]);

  // Taille du canevas (net sur écrans haute densité) + redessin
  useEffect(() => {
    function resize() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round((canvas.width * BOX) / W));
      draw();
    }
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [draw, W]);

  function toPoint(e: React.PointerEvent<HTMLCanvasElement>): Pt {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * BOX };
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (locked) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (checked) setChecked(null);
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

  function validate() {
    if (!model || strokes.length === 0) return;
    const flags = strokes.map((s, i) => (model[i] ? strokeMatches(sampleStroke(s), model[i]) : false));
    setChecked(flags);
    const okCount = flags.filter(Boolean).length;
    onValidate({
      ok: okCount === model.length && strokes.length === model.length,
      okCount,
      modelCount: model.length,
      strokeCount: strokes.length,
    });
  }

  return (
    <div className="write-pad">
      <canvas
        ref={canvasRef}
        className="write-pad-canvas"
        style={{ aspectRatio: `${n} / 1`, maxWidth: `${n * 300}px` }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onContextMenu={(e) => e.preventDefault()}
      />

      {!locked && (
        <div className="conv-bubble-actions" style={{ marginTop: '0.5rem' }}>
          <button
            className="conv-mini-btn"
            onClick={() => {
              setStrokes([]);
              setChecked(null);
            }}
            disabled={strokes.length === 0}
          >
            🗑 Effacer
          </button>
          <button
            className="conv-mini-btn"
            onClick={() => {
              setStrokes((s) => s.slice(0, -1));
              setChecked(null);
            }}
            disabled={strokes.length === 0}
          >
            ↩ Annuler le dernier trait
          </button>
          <button className="primary" onClick={validate} disabled={strokes.length === 0 || !model}>
            ✔ Valider
          </button>
          <button className="secondary" onClick={onSkip}>
            Passer →
          </button>
        </div>
      )}

      {pathError && !locked && (
        <p className="eyebrow-free">
          Modèle indisponible pour le moment (connexion ?) : tu peux dessiner, mais la validation est impossible. Utilise « Passer ».
        </p>
      )}
    </div>
  );
}
