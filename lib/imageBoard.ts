// Planche de 60 illustrations (5 colonnes × 12 rangées) : prompt pour ChatGPT, découpe de l'image reçue, export ZIP.
// Module sans dépendance. Les fonctions « navigateur » (canvas) ne sont appelées que depuis un composant client.

export const BOARD_COLS = 5;
export const BOARD_ROWS = 12;
export const BOARD_SIZE = BOARD_COLS * BOARD_ROWS;

// ---------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------
export function buildBoardPrompt(words: string[]): string {
  const clean = words.slice(0, BOARD_SIZE).map((w) => w.replace(/;/g, ',').trim());
  const rows: string[] = [];
  for (let r = 0; r < BOARD_ROWS; r++) {
    const cells = [];
    for (let c = 0; c < BOARD_COLS; c++) cells.push(clean[r * BOARD_COLS + c] ?? '(carte vide)');
    rows.push(`Rangée ${r + 1} : ${cells.join(';')}`);
    if ((r + 1) % 4 === 0 && r + 1 < BOARD_ROWS) rows.push(''); // ligne vide tous les 4 rangs : aide ChatGPT à ne pas perdre le fil
  }
  const empty =
    clean.length < BOARD_SIZE
      ? `\n* Les cartes marquées « (carte vide) » gardent le même cadre magenta et la même ligne de séparation, mais restent entièrement vides : aucune illustration, aucun texte.`
      : '';

  return `Crée une planche éducative de vocabulaire français de ${BOARD_SIZE} cartes illustrées, au format paysage  (1536 × 3072 ou la plus haute résolution disponible dans ce même rapport), sur un fond blanc pur (#FFFFFF).

MISE EN PAGE (précision géométrique impérative)

* Grille de ${BOARD_COLS} colonnes × ${BOARD_ROWS} rangées = ${BOARD_SIZE} cartes, toutes exactement de la même taille, parfaitement alignées en colonnes et en rangées, y compris sur la dernière rangée (jamais de cartes plus petites, plus grandes ou décalées).
* Marge extérieure identique sur les 4 côtés (environ 3 %) et espace identique entre les cartes (environ 1 %).
* Chaque carte est entourée d'un rectangle à angles droits (pas de coins arrondis), en trait plein magenta pur (#FF00FF) de 3 px d'épaisseur. Pas de pointillés, pas d'ombre, pas de dégradé.
* Dans chaque carte, une ligne horizontale magenta pure (#FF00FF), de même épaisseur, sépare la zone d'illustration (environ 78 % de la hauteur) de la zone de texte (environ 22 %). Cette ligne est à la même hauteur relative dans les ${BOARD_SIZE} cartes.
* Le magenta est réservé à ces traits : aucune autre couleur magenta, fuchsia ou rose vif dans les illustrations, vêtements ou décors.${empty}

ILLUSTRATIONS

* Une seule illustration par carte, centrée et entièrement visible, qui ne touche jamais les traits magenta ni ne les dépasse : laisser une marge blanche d'au moins 3 % à l'intérieur de la zone d'illustration.
* Style : illustrations 3D de qualité, dessin animé réaliste et chaleureux, adaptées aux enfants. Rendu propre, lumineux, homogène, sans ombre excessive, sans fond noir.
* Personnages variés d'une carte à l'autre : filles et garçons, différentes couleurs de peau, coiffures, couleurs de cheveux et tenues. Style graphique cohérent, expressions naturelles et joyeuses. Chaque enfant représente clairement l'action ou le sens du mot, avec une posture expressive et des accessoires si nécessaire.

TEXTE

* Le mot en français sous chaque illustration, dans la zone de texte, centré, SUR UNE SEULE LIGNE (réduire la taille de la police si le mot est long, ne jamais le couper en deux lignes).
* Noir (#000000), sans empattement, gras, net, facile à lire.
* Respecter exactement l'orthographe, les accents, la ponctuation et les majuscules des mots donnés.
* Aucun titre, aucune numérotation, aucune décoration, aucun autre texte.

${rows.join('\n')}`;
}

// ---------------------------------------------------------------------
// Détection de la grille (fonctions pures : testables hors navigateur)
// ---------------------------------------------------------------------
export type Rect = { x: number; y: number; w: number; h: number };
export type GridResult = {
  rects: Rect[]; // zones d'illustration, de gauche à droite puis de haut en bas
  // 'lines' = tous les traits magenta retrouvés ; 'fit' = quelques traits manquent, la grille est recalculée d'après les autres ;
  // 'grid' = aucun trait retrouvé, découpe approximative d'après la mise en page demandée
  method: 'lines' | 'fit' | 'grid';
  cols: number; // colonnes réellement lues sur la planche
  rows: number; // rangées réellement lues sur la planche (cols × rows cartes)
};

function isMagenta(r: number, g: number, b: number): boolean {
  return r > 170 && b > 170 && g < 130 && r - g > 90 && b - g > 90;
}

type Cluster = { c: number; t: number }; // centre et épaisseur d'un trait

function clusters(sum: number[], threshold: number): Cluster[] {
  const out: Cluster[] = [];
  let start = -1;
  let last = -1;
  for (let i = 0; i < sum.length; i++) {
    if (sum[i] >= threshold) {
      if (start < 0) start = i;
      last = i;
    } else if (start >= 0 && i - last > 3) {
      out.push({ c: (start + last) / 2, t: last - start + 1 });
      start = -1;
    }
  }
  if (start >= 0) out.push({ c: (start + last) / 2, t: last - start + 1 });
  return out;
}

type Line = { c: number; t: number };

/**
 * Regroupe les traits d'un axe en paires (début, fin) de carte : le début est tout trait dont la distance au trait suivant est « grande »
 * (au moins 60 % de la grande distance typique, mesurée au 80ᵉ percentile des distances entre traits voisins).
 */
function pairLines(lines: Line[]): { a: Line; b: Line }[] {
  if (lines.length < 2) return [];
  const d = lines.slice(1).map((l, i) => l.c - lines[i].c);
  const sorted = d.slice().sort((x, y) => x - y);
  const ref = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.8))];
  const out: { a: Line; b: Line }[] = [];
  for (let i = 0; i < d.length; i++) {
    if (d[i] >= 0.6 * ref) {
      out.push({ a: lines[i], b: lines[i + 1] });
      i++; // le trait de fin appartient à cette carte : il ne peut pas être le début de la suivante
    }
  }
  return out;
}

/**
 * Lit la grille RÉELLE de la planche d'après les traits magenta : nombre de colonnes = traits verticaux / 2, nombre de rangées =
 * traits horizontaux / 3 (haut, séparation, bas de chaque carte). La planche peut donc faire 20 cartes (5 × 4), 60 (5 × 12) ou autre chose :
 * ChatGPT ne respecte pas toujours le nombre demandé. `hint` ne sert que si les traits sont trop abîmés pour être comptés.
 */
export function detectGrid(data: ArrayLike<number>, w: number, h: number, hint: { cols: number; rows: number } = { cols: BOARD_COLS, rows: BOARD_ROWS }): GridResult {
  const colSum = new Array<number>(w).fill(0);
  const rowSum = new Array<number>(h).fill(0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (isMagenta(data[i], data[i + 1], data[i + 2])) {
        colSum[x]++;
        rowSum[y]++;
      }
    }
  }
  let maxC = 0;
  for (const v of colSum) if (v > maxC) maxC = v;
  let maxR = 0;
  for (const v of rowSum) if (v > maxR) maxR = v;

  const hasLines = maxC > h * 0.2 && maxR > w * 0.2;
  const vl = hasLines ? clusters(colSum, maxC * 0.5) : [];
  const hl = hasLines ? clusters(rowSum, maxR * 0.5) : [];

  // Lecture par « grandes distances » : sur un axe, la plus grande distance entre deux traits voisins est la zone d'illustration (rangées)
  // ou la largeur d'une carte (colonnes) ; les petites distances sont la zone de texte et l'espace entre cartes. Un trait manquant, en trop
  // ou dédoublé ne décale donc plus toutes les cartes suivantes (le comptage « 3 traits par rangée » se décalait au premier accroc).
  const colPairs = pairLines(vl);
  const rowPairs = pairLines(hl);
  if (colPairs.length >= 1 && rowPairs.length >= 1) {
    const rects: Rect[] = [];
    for (const rp of rowPairs) {
      for (const cp of colPairs) {
        const x0 = Math.round(cp.a.c + cp.a.t / 2 + 4);
        const x1 = Math.round(cp.b.c - cp.b.t / 2 - 4);
        const y0 = Math.round(rp.a.c + rp.a.t / 2 + 4);
        const y1 = Math.round(rp.b.c - rp.b.t / 2 - 4);
        rects.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      }
    }
    const med = (arr: number[]) => arr.slice().sort((x, y) => x - y)[Math.floor(arr.length / 2)];
    const mw = med(rects.map((r) => r.w));
    const mh = med(rects.map((r) => r.h));
    const regular = rects.every((r) => r.w > 10 && r.h > 10 && Math.abs(r.w - mw) <= 0.15 * mw && Math.abs(r.h - mh) <= 0.18 * mh);
    if (regular) {
      const exact = vl.length === colPairs.length * 2 && hl.length === rowPairs.length * 3;
      return { rects, method: exact ? 'lines' : 'fit', cols: colPairs.length, rows: rowPairs.length };
    }
  }

  // Traits incomplets : on estime les dimensions (traits ÷ 2 ou ÷ 3, à un trait près), sinon celles attendues par l'appelant
  const guessCols = Math.round(vl.length / 2);
  const guessRows = Math.round(hl.length / 3);
  const C = vl.length >= 2 && Math.abs(vl.length - 2 * guessCols) <= 1 ? guessCols : hint.cols;
  const R = hl.length >= 3 && Math.abs(hl.length - 3 * guessRows) <= 2 ? guessRows : hint.rows;

  // Colonnes : positions exactes si tous les traits verticaux sont là, sinon grille régulière entre les traits extrêmes (ou les marges de 3 %)
  const exactCols = vl.length === C * 2;
  let colsX: { l: number; r: number }[];
  let gap: number;
  if (exactCols) {
    colsX = Array.from({ length: C }, (_, i) => ({ l: vl[2 * i].c, r: vl[2 * i + 1].c }));
    const gaps = colsX.slice(1).map((c, i) => c.l - colsX[i].r);
    gap = gaps.length ? gaps.reduce((s2, g) => s2 + g, 0) / gaps.length : 0.01 * w;
  } else {
    const x0 = vl.length >= 2 ? vl[0].c : 0.03 * w;
    const x1 = vl.length >= 2 ? vl[vl.length - 1].c : 0.97 * w;
    gap = 0.01 * w;
    const cw = (x1 - x0 - (C - 1) * gap) / C;
    colsX = Array.from({ length: C }, (_, i) => ({ l: x0 + i * (cw + gap), r: x0 + i * (cw + gap) + cw }));
  }

  // Rangées : de la 1re ligne du haut à la dernière ligne du bas, réparties régulièrement ; la ligne de séparation de chaque carte
  // est celle retrouvée près de 78 % de la hauteur (sinon 78 % exactement). Un trait manquant ou en trop ne décale donc plus rien.
  const y0 = hl.length >= 2 ? hl[0].c : 0.03 * h;
  const y1 = hl.length >= 2 ? hl[hl.length - 1].c : 0.97 * h;
  const ch = (y1 - y0 - (R - 1) * gap) / R;
  const pad = Math.max(3, Math.min(0.006 * w, ch * 0.03));
  const rects: Rect[] = [];
  for (let j = 0; j < R; j++) {
    const top = y0 + j * (ch + gap);
    const target = top + 0.78 * ch;
    let sepY = target;
    let bestD = 0.07 * ch; // tolérance : ± 7 % de la hauteur d'une carte
    for (const line of hl) {
      const d = Math.abs(line.c - target);
      if (d < bestD) {
        bestD = d;
        sepY = line.c;
      }
    }
    for (let i = 0; i < C; i++) {
      const x = colsX[i].l + pad + 1.5;
      const wd = colsX[i].r - colsX[i].l - 2 * pad - 3;
      const y = top + pad + 1.5;
      rects.push({ x: Math.round(x), y: Math.round(y), w: Math.round(wd), h: Math.round(sepY - y - pad - 1.5) });
    }
  }
  const usedLines = hasLines && hl.length >= 2 && vl.length >= 2;
  return { rects, method: usedLines ? 'fit' : 'grid', cols: C, rows: R };
}

// ---------------------------------------------------------------------
// Navigateur : lecture de l'image, découpe, conversion en webp
// ---------------------------------------------------------------------
export async function loadBoard(file: File, hint?: { cols: number; rows: number }): Promise<{ canvas: HTMLCanvasElement; grid: GridResult }> {
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { canvas, grid: detectGrid(img.data, canvas.width, canvas.height, hint) };
}

export async function cropToWebp(canvas: HTMLCanvasElement, rect: Rect, quality = 0.9): Promise<Blob> {
  if (!rect) throw new Error("La planche contient moins de cartes que de mots attendus : demande à ChatGPT le nombre exact de cartes, ou découpe seulement les premiers mots.");
  const x = Math.max(0, rect.x);
  const y = Math.max(0, rect.y);
  const w = Math.min(canvas.width - x, rect.w);
  const h = Math.min(canvas.height - y, rect.h);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  out.getContext('2d')!.drawImage(canvas, x, y, w, h, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((res) => out.toBlob(res, 'image/webp', quality));
  if (!blob || blob.type !== 'image/webp') {
    throw new Error("Ce navigateur ne sait pas créer d'images webp : utilise Chrome, Edge ou Firefox.");
  }
  return blob;
}

// ---------------------------------------------------------------------
// ZIP « stockage » (sans compression : les .webp sont déjà compressés), noms en UTF-8
// ---------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function makeZip(files: { name: string; data: Uint8Array }[], now = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);

    const lh = new Uint8Array(30 + name.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // noms en UTF-8
    lv.setUint16(8, 0, true); // méthode : stockage
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, f.data.length, true);
    lv.setUint32(22, f.data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    lh.set(name, 30);

    const ch = new Uint8Array(46 + name.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, f.data.length, true);
    cv.setUint32(24, f.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    ch.set(name, 46);

    locals.push(lh, f.data);
    centrals.push(ch);
    offset += lh.length + f.data.length;
  }

  const cdSize = centrals.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  const parts = [...locals, ...centrals, end];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}
