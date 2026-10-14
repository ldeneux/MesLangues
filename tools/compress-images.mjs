// Réduit le poids des images .webp trop lourdes (fonds d'écran d'équipes, décors des thèmes…).
// Principe : on ne touche qu'aux fichiers au-dessus d'un seuil, on garde les dimensions, on ré-encode en qualité 85,
// et on ne remplace le fichier que si le gain est réel. Les images déjà légères restent intactes.
//
//   node tools/compress-images.mjs                      -> RAPPORT seulement (rien n'est modifié)
//   node tools/compress-images.mjs --write              -> applique (originaux copiés dans _originals-images/, hors de public/)
//   node tools/compress-images.mjs public/bg --write    -> un dossier précis
// Options : --quality=85  --min-ko=400 (seuil)  --min-gain=20 (gain mini en %)  --max-width=1920 (réduit aussi les dimensions)
// Nécessite le paquet « sharp » (déjà présent avec Next.js le plus souvent, sinon : npm i -D sharp).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

let sharp;
try {
  sharp = createRequire(import.meta.url)('sharp');
} catch {
  console.error('Le paquet « sharp » est introuvable. Installe-le avec : npm i -D sharp');
  process.exit(1);
}

const args = process.argv.slice(2);
const opt = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? Number(a.split('=')[1]) : def;
};
const write = args.includes('--write');
const quality = opt('quality', 85);
const minKo = opt('min-ko', 400);
const minGain = opt('min-gain', 20);
const maxWidth = opt('max-width', 0);
const roots = args.filter((a) => !a.startsWith('--'));
if (roots.length === 0) roots.push('public/bg', 'public/themes');

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.webp$/i.test(e.name)) yield p;
  }
}

const ko = (n) => `${Math.round(n / 1024)} Ko`;
let before = 0, after = 0, changed = 0, kept = 0;
for (const root of roots) {
  for (const file of walk(path.resolve(root))) {
    const size = fs.statSync(file).size;
    if (size < minKo * 1024) continue; // déjà léger : on n'y touche pas
    let pipeline = sharp(file);
    if (maxWidth) pipeline = pipeline.resize({ width: maxWidth, withoutEnlargement: true });
    const out = await pipeline.webp({ quality, effort: 6, smartSubsample: true }).toBuffer();
    const gain = 100 - (100 * out.length) / size;
    const rel = path.relative(process.cwd(), file);
    if (gain < minGain) { kept++; console.log(`= ${rel}  ${ko(size)}  (gain ${gain.toFixed(0)} % < ${minGain} % : conservé)`); continue; }
    console.log(`${write ? '✔' : '→'} ${rel}  ${ko(size)}  ->  ${ko(out.length)}  (-${gain.toFixed(0)} %)`);
    before += size; after += out.length; changed++;
    if (write) {
      const bak = path.join(process.cwd(), '_originals-images', rel); // sauvegarde hors de public/ : rien n'est déployé en double
      fs.mkdirSync(path.dirname(bak), { recursive: true });
      fs.copyFileSync(file, bak);
      fs.writeFileSync(file, out);
    }
  }
}
console.log(`\n${changed} image(s) ${write ? 'compressée(s)' : 'compressible(s)'}, ${kept} conservée(s) : ${ko(before)} -> ${ko(after)} (économie ${ko(before - after)}).`);
if (!write && changed) console.log('Rien n\'a été modifié : relance avec --write pour appliquer.');
if (write && changed) console.log('Originaux conservés dans _originals-images/ : supprime ce dossier (ou ajoute-le à .gitignore) une fois les images vérifiées.');
