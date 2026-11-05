// Planche de 20 illustrations (5 colonnes × 4 rangées) : prompt, génération automatique (gpt-image-1-mini), découpe, export ZIP.
// Module sans dépendance. Les fonctions « navigateur » (canvas) ne sont appelées que depuis un composant client.

export const BOARD_COLS = 5;
export const BOARD_ROWS = 4;
export const BOARD_SIZE = BOARD_COLS * BOARD_ROWS; // 20 cartes par planche

// Génération automatique par l'API OpenAI (voir lib/imageGenServer.ts)
export const BOARD_IMAGE_SIZE = '1536x1024'; // paysage 3:2 : cartes d'environ 277 × 233 px (le portrait 1024x1536 donnerait des cartes étroites)
export const BOARD_IMAGE_QUALITY = 'medium';
export const BOARD_COST_USD = 0.015; // prix OpenAI d'une planche 1536x1024 en qualité medium (gpt-image-1-mini)
export const AUTO_BOARD_CHOICES = [1, 5, 10, 20, 30, 40, 50]; // nombres de planches proposés au lancement

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

  return `Crée une planche éducative de vocabulaire français de ${BOARD_SIZE} cartes illustrées, au format paysage 3:2 (${BOARD_IMAGE_SIZE.replace('x', ' × ')} px), sur un fond blanc pur (#FFFFFF).

MISE EN PAGE (précision géométrique impérative)

* Grille de ${BOARD_COLS} colonnes × ${BOARD_ROWS} rangées = ${BOARD_SIZE} cartes, toutes exactement de la même taille, parfaitement alignées en colonnes et en rangées, y compris sur la dernière rangée (jamais de cartes plus petites, plus grandes ou décalées).
* Chaque carte est un rectangle un peu plus large que haut (environ 277 × 233 px), jamais aplati ni étiré.
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
  suspect?: boolean[]; // par carte : true si la vignette découpée contient des traits magenta (découpe douteuse)
  rects: Rect[]; // zones d'illustration, de gauche à droite puis de haut en bas
  // 'lines' = tous les traits magenta retrouvés ; 'fit' = quelques traits manquent, la grille est recalculée d'après les autres ;
  // 'grid' = aucun trait retrouvé, découpe approximative d'après la mise en page demandée
  method: 'lines' | 'fit' | 'grid';
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

// ---------------------------------------------------------------------
// Détection carte par carte (méthode principale)
// Les planches générées par l'IA ne sont jamais parfaitement régulières (rangées de hauteurs différentes, colonnes qui bougent d'une rangée à
// l'autre) : on ne cherche donc pas de grille globale. On repère chaque ZONE FERMÉE par les traits magenta (une zone d'illustration est un
// rectangle blanc entouré de magenta), puis on les classe en rangées et en colonnes.
// ---------------------------------------------------------------------
type Comp = { x0: number; y0: number; x1: number; y1: number; area: number }; // x1, y1 inclus

function medianOf(v: number[]): number {
  const a = [...v].sort((p, q) => p - q);
  return a.length ? a[Math.floor(a.length / 2)] : 0;
}

function detectCardCells(data: ArrayLike<number>, w: number, h: number, cols: number, rows: number): { rects: Rect[]; suspect: boolean[] } | null {
  const n = w * h;
  // « Mur » = pixels magenta, avec un seuil tolérant (les traits dessinés par l'IA sont souvent un peu pâles ou mangés par le dessin)
  let wall = new Uint8Array(n);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r > 140 && b > 140 && r - g > 50 && b - g > 50) wall[p] = 1;
  }
  // Dilatation de 2 pixels (deux passes 3 × 3) : referme les petits trous dans les traits
  for (let pass = 0; pass < 2; pass++) {
    const tmp = new Uint8Array(n);
    for (let y = 0; y < h; y++) {
      const o = y * w;
      for (let x = 0; x < w; x++) tmp[o + x] = wall[o + x] | (x > 0 ? wall[o + x - 1] : 0) | (x < w - 1 ? wall[o + x + 1] : 0);
    }
    const out = new Uint8Array(n);
    for (let y = 0; y < h; y++) {
      const o = y * w;
      for (let x = 0; x < w; x++) out[o + x] = tmp[o + x] | (y > 0 ? tmp[o - w + x] : 0) | (y < h - 1 ? tmp[o + w + x] : 0);
    }
    wall = out;
  }

  // Zones connexes de pixels non magenta
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  const comps: Comp[] = [];
  for (let start = 0; start < n; start++) {
    if (wall[start] || seen[start]) continue;
    let sp = 0;
    stack[sp++] = start;
    seen[start] = 1;
    const c: Comp = { x0: w, y0: h, x1: 0, y1: 0, area: 0 };
    while (sp > 0) {
      const p = stack[--sp];
      const x = p % w;
      const y = (p - x) / w;
      c.area++;
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
      if (x > 0 && !wall[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
      if (x < w - 1 && !wall[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
      if (y > 0 && !wall[p - w] && !seen[p - w]) { seen[p - w] = 1; stack[sp++] = p - w; }
      if (y < h - 1 && !wall[p + w] && !seen[p + w]) { seen[p + w] = 1; stack[sp++] = p + w; }
    }
    comps.push(c);
  }

  // Zones qui ont la largeur d'une carte (le fond blanc extérieur, les petits morceaux et les zones d'illustration à l'intérieur des cartes sont triés par la largeur et le remplissage)
  const nomW = (0.94 * w - (cols - 1) * 0.01 * w) / cols;
  const nomH = (0.94 * h - (rows - 1) * 0.01 * h) / rows;
  const cand = comps.filter((c) => {
    const bw = c.x1 - c.x0 + 1;
    const bh = c.y1 - c.y0 + 1;
    return bw >= 0.6 * nomW && bw <= 1.4 * nomW && bh >= 8 && bh <= 2 * nomH && c.area / (bw * bh) >= 0.8;
  });

  // Zone de texte = zone étroite juste sous une zone d'illustration (séparée par le trait du milieu)
  const isText = new Array<boolean>(cand.length).fill(false);
  const hasText = new Array<boolean>(cand.length).fill(false);
  const ratios: number[] = [];
  for (let a = 0; a < cand.length; a++) {
    for (let b = 0; b < cand.length; b++) {
      if (a === b) continue;
      const A = cand[a];
      const B = cand[b];
      const gap = B.y0 - A.y1;
      if (gap > 0 && gap <= 14 && Math.abs(B.x0 - A.x0) <= 0.1 * nomW && Math.abs(B.x1 - A.x1) <= 0.1 * nomW && B.y1 - B.y0 < A.y1 - A.y0) {
        isText[b] = true;
        hasText[a] = true;
        ratios.push((A.y1 - A.y0 + 1) / (B.y1 - A.y0 + 1)); // part de l'illustration dans la carte entière
      }
    }
  }
  const ratio = ratios.length ? medianOf(ratios) : 0.78;
  const pairedH = cand.filter((_, i) => hasText[i]).map((c) => c.y1 - c.y0 + 1);
  const typicalH = pairedH.length ? medianOf(pairedH) : 0;

  const cells: Comp[] = [];
  cand.forEach((c, i) => {
    if (isText[i]) return;
    const ch = c.y1 - c.y0 + 1;
    // Zone de texte « orpheline » (son illustration n'a pas été retrouvée) : ce n'est pas une carte, on la déduira plus loin
    if (!hasText[i] && ch < (typicalH > 0 ? 0.45 * typicalH : 0.3 * nomH)) return;
    // Zone d'illustration fusionnée avec la zone de texte (le trait du milieu est caché par le dessin) : on ne garde que le haut
    if (!hasText[i] && typicalH > 0 && ch > 1.2 * typicalH) {
      cells.push({ ...c, y1: c.y0 + Math.round(ch * ratio) - 1 });
    } else if (!hasText[i] && typicalH === 0 && ch > 0.9 * nomH) {
      cells.push({ ...c, y1: c.y0 + Math.round(ch * ratio) - 1 });
    } else {
      cells.push(c);
    }
  });
  if (cells.length < Math.ceil(0.5 * cols * rows) || cells.length > cols * rows) return null;

  // Rangées : on regroupe les cartes par hauteur de départ (les planches IA ont des rangées de hauteurs différentes)
  const byY = [...cells].sort((p, q) => p.y0 - q.y0);
  const rowOf = new Map<Comp, number>();
  let rowCount = 0;
  let prevY = -1e9;
  for (const c of byY) {
    if (c.y0 - prevY > 0.3 * nomH) rowCount++;
    rowOf.set(c, rowCount - 1);
    prevY = c.y0;
  }
  // Colonnes : même principe sur la position gauche
  const byX = [...cells].sort((p, q) => p.x0 - q.x0);
  const colOf = new Map<Comp, number>();
  let colCount = 0;
  let prevX = -1e9;
  for (const c of byX) {
    if (c.x0 - prevX > 0.5 * nomW) colCount++;
    colOf.set(c, colCount - 1);
    prevX = c.x0;
  }
  if (rowCount !== rows || colCount !== cols) return null;

  const grid: (Comp | null)[][] = Array.from({ length: rows }, () => new Array<Comp | null>(cols).fill(null));
  for (const c of cells) {
    const r = rowOf.get(c)!;
    const k = colOf.get(c)!;
    if (grid[r][k]) return null; // deux zones pour la même case : on ne devine pas
    grid[r][k] = c;
  }

  // Cartes dont les traits sont trop abîmés pour être retrouvées : position déduite des autres cartes de la même colonne / rangée
  const colX0: number[] = [];
  const colW: number[] = [];
  for (let k = 0; k < cols; k++) {
    const col = grid.map((row) => row[k]).filter((c): c is Comp => !!c);
    colX0.push(medianOf(col.map((c) => c.x0)));
    colW.push(medianOf(col.map((c) => c.x1 - c.x0 + 1)));
  }
  const allH = medianOf(cells.map((c) => c.y1 - c.y0 + 1));
  const rowY0: number[] = [];
  const rowH: number[] = [];
  for (let r = 0; r < rows; r++) {
    const line = grid[r].filter((c): c is Comp => !!c);
    rowY0.push(medianOf(line.map((c) => c.y0)));
    rowH.push(medianOf(line.map((c) => c.y1 - c.y0 + 1)) || allH);
  }

  const rects: Rect[] = [];
  const suspect: boolean[] = [];
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const c = grid[r][k];
      const inferred = !c;
      const x0 = c ? c.x0 : Math.round(colX0[k]);
      const y0 = c ? c.y0 : Math.round(rowY0[r]);
      const x1 = c ? c.x1 : Math.round(colX0[k] + colW[k] - 1);
      const y1 = c ? c.y1 : Math.round(rowY0[r] + rowH[r] - 1);
      const rect: Rect = {
        x: Math.max(0, x0 + 1),
        y: Math.max(0, y0 + 1),
        w: Math.min(w, x1) - Math.max(0, x0 + 1) - 1,
        h: Math.min(h, y1) - Math.max(0, y0 + 1) - 1,
      };
      // Contrôle : une vignette correcte ne contient (presque) aucun trait magenta
      let mag = 0;
      if (rect.w > 10 && rect.h > 10) {
        for (let y = rect.y; y < rect.y + rect.h; y++) {
          for (let x = rect.x; x < rect.x + rect.w; x++) {
            const i4 = (y * w + x) * 4;
            if (isMagenta(data[i4], data[i4 + 1], data[i4 + 2])) mag++;
          }
        }
      }
      rects.push(rect);
      suspect.push(inferred || rect.w <= 10 || rect.h <= 10 || mag / Math.max(1, rect.w * rect.h) > 0.01);
    }
  }
  return { rects, suspect };
}

export function detectGrid(data: ArrayLike<number>, w: number, h: number, cols: number = BOARD_COLS, rows: number = BOARD_ROWS): GridResult {
  // Méthode principale : une zone fermée par carte (supporte les planches irrégulières)
  const cells = detectCardCells(data, w, h, cols, rows);
  if (cells) return { rects: cells.rects, suspect: cells.suspect, method: 'lines' };

  // Secours : grille globale d'après les traits (planche très régulière), puis grille théorique
  
  
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

  // Cas normal : 10 traits verticaux (gauche + droite de chaque carte) et 12 horizontaux (haut, séparation, bas de chaque rangée)
  if (vl.length === cols * 2 && hl.length === rows * 3) {
    const rects: Rect[] = [];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
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

  // Colonnes : positions exactes si les 10 traits verticaux sont là, sinon grille régulière entre les traits extrêmes (ou les marges de 3 %)
  const exactCols = vl.length === cols * 2;
  let colsX: { l: number; r: number }[];
  let gap: number;
  if (exactCols) {
    colsX = Array.from({ length: cols }, (_, i) => ({ l: vl[2 * i].c, r: vl[2 * i + 1].c }));
    // espace entre deux cartes voisines, mesuré sur l'image (la même valeur sert entre deux rangées)
    const gaps = colsX.slice(1).map((c, i) => c.l - colsX[i].r);
    gap = gaps.reduce((s2, g) => s2 + g, 0) / Math.max(1, gaps.length);
  } else {
    const x0 = vl.length >= 2 ? vl[0].c : 0.03 * w;
    const x1 = vl.length >= 2 ? vl[vl.length - 1].c : 0.97 * w;
    gap = 0.01 * w;
    const cw = (x1 - x0 - (cols - 1) * gap) / cols;
    colsX = Array.from({ length: cols }, (_, i) => ({ l: x0 + i * (cw + gap), r: x0 + i * (cw + gap) + cw }));
  }

  // Rangées : de la 1re ligne du haut à la dernière ligne du bas, réparties régulièrement ; la ligne de séparation de chaque carte
  // est celle retrouvée près de 78 % de la hauteur (sinon 78 % exactement). Un trait manquant ou en trop ne décale donc plus rien.
  const y0 = hl.length >= 2 ? hl[0].c : 0.03 * h;
  const y1 = hl.length >= 2 ? hl[hl.length - 1].c : 0.97 * h;
  const ch = (y1 - y0 - (rows - 1) * gap) / rows;
  const pad = Math.max(3, Math.min(0.006 * w, ch * 0.03));
  const rects: Rect[] = [];
  for (let j = 0; j < rows; j++) {
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
    for (let i = 0; i < cols; i++) {
      const x = colsX[i].l + pad + 1.5;
      const wd = colsX[i].r - colsX[i].l - 2 * pad - 3;
      const y = top + pad + 1.5;
      rects.push({ x: Math.round(x), y: Math.round(y), w: Math.round(wd), h: Math.round(sepY - y - pad - 1.5) });
    }
  }
  const usedLines = hasLines && hl.length >= 2 && vl.length >= 2;
  return { rects, method: usedLines ? 'fit' : 'grid' };
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
