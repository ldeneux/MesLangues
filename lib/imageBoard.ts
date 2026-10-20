// Planche de 20 illustrations (5 colonnes × 4 rangées) : prompt pour ChatGPT, découpe de l'image reçue, export ZIP.
// Module sans dépendance. Les fonctions « navigateur » (canvas) ne sont appelées que depuis un composant client.

export const BOARD_COLS = 5;
export const BOARD_ROWS = 4;
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
  }
  const empty =
    clean.length < BOARD_SIZE
      ? `\n* Les cartes marquées « (carte vide) » gardent le même cadre magenta et la même ligne de séparation, mais restent entièrement vides : aucune illustration, aucun texte.`
      : '';

  return `Crée une planche éducative de vocabulaire français de ${BOARD_SIZE} cartes illustrées, au format paysage 3:2 (1536 × 1024 px, ou la plus haute résolution disponible dans ce même rapport), sur un fond blanc pur (#FFFFFF).

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
  method: 'lines' | 'grid'; // 'lines' = traits magenta retrouvés ; 'grid' = découpe approximative d'après la mise en page demandée
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

export function detectGrid(data: ArrayLike<number>, w: number, h: number): GridResult {
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

  // Cas normal : 10 traits verticaux (gauche + droite de chaque carte) et 12 horizontaux (haut, séparation, bas)
  if (vl.length === BOARD_COLS * 2 && hl.length === BOARD_ROWS * 3) {
    const rects: Rect[] = [];
    for (let j = 0; j < BOARD_ROWS; j++) {
      for (let i = 0; i < BOARD_COLS; i++) {
        const l = vl[2 * i];
        const r = vl[2 * i + 1];
        const top = hl[3 * j];
        const sep = hl[3 * j + 1];
        const x0 = Math.round(l.c + l.t / 2 + 2);
        const x1 = Math.round(r.c - r.t / 2 - 2);
        const y0 = Math.round(top.c + top.t / 2 + 2);
        const y1 = Math.round(sep.c - sep.t / 2 - 2);
        rects.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      }
    }
    if (rects.every((r) => r.w > 10 && r.h > 10)) return { rects, method: 'lines' };
  }

  // Repli : grille régulière déduite de la mise en page demandée (marge ≈ 3 %, espace ≈ 1 %, séparation à 78 %)
  let x0 = 0.03 * w;
  let x1 = 0.97 * w;
  let y0 = 0.03 * h;
  let y1 = 0.97 * h;
  if (vl.length >= 2 && hl.length >= 2) {
    x0 = vl[0].c;
    x1 = vl[vl.length - 1].c;
    y0 = hl[0].c;
    y1 = hl[hl.length - 1].c;
  }
  const gap = 0.01 * w;
  const cw = (x1 - x0 - (BOARD_COLS - 1) * gap) / BOARD_COLS;
  const ch = (y1 - y0 - (BOARD_ROWS - 1) * gap) / BOARD_ROWS;
  const pad = Math.max(4, 0.006 * w);
  const rects: Rect[] = [];
  for (let j = 0; j < BOARD_ROWS; j++) {
    for (let i = 0; i < BOARD_COLS; i++) {
      const cx = x0 + i * (cw + gap);
      const cy = y0 + j * (ch + gap);
      rects.push({
        x: Math.round(cx + pad),
        y: Math.round(cy + pad),
        w: Math.round(cw - 2 * pad),
        h: Math.round(ch * 0.78 - 2 * pad),
      });
    }
  }
  return { rects, method: 'grid' };
}

// ---------------------------------------------------------------------
// Navigateur : lecture de l'image, découpe, conversion en webp
// ---------------------------------------------------------------------
export async function loadBoard(file: File): Promise<{ canvas: HTMLCanvasElement; grid: GridResult }> {
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { canvas, grid: detectGrid(img.data, canvas.width, canvas.height) };
}

export async function cropToWebp(canvas: HTMLCanvasElement, rect: Rect, quality = 0.9): Promise<Blob> {
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
