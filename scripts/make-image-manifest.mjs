// Liste les images de public/image_webp (noms réels, sans l'extension) dans lib/imageManifest.json.
// Lancé automatiquement avant `npm run dev` et `npm run build` (voir package.json) : il suffit de déposer les .webp
// dans public/image_webp et de pousser sur GitHub, la liste se met à jour au déploiement.
// Le nom du fichier = le mot français tel qu'il est écrit (« un fromage.webp ») ; la comparaison ignore casse, accents,
// apostrophes, tirets et espaces en trop (même clé que lib/imageName.ts).
import fs from 'node:fs';
import path from 'node:path';

const key = (t) =>
  t.toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

const dir = path.join(process.cwd(), 'public', 'image_webp');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.webp$/i.test(f)) : [];
const names = files.map((f) => f.replace(/\.webp$/i, '')).sort((a, b) => a.localeCompare(b, 'fr'));

fs.writeFileSync(path.join(process.cwd(), 'lib', 'imageManifest.json'), JSON.stringify(names));
console.log(`imageManifest : ${names.length} image(s) dans public/image_webp`);

// Deux fichiers pour le même mot (ex. « un fromage.webp » et « un_fromage.webp », ou « Bonjour » et « bonjour ») : un seul sera utilisé.
const byKey = new Map();
for (const n of names) byKey.set(key(n), [...(byKey.get(key(n)) ?? []), n]);
const dup = [...byKey.values()].filter((v) => v.length > 1);
if (dup.length) {
  console.warn(`ATTENTION : ${dup.length} mot(s) ont plusieurs fichiers (le premier est utilisé, supprime les autres) :`);
  for (const d of dup.slice(0, 30)) console.warn('  - ' + d.join('  |  '));
}
const oddExt = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.webp$/i.test(f) && !/\.webp$/.test(f)) : [];
if (oddExt.length) console.warn(`ATTENTION : extension en majuscules (renomme en .webp) : ${oddExt.slice(0, 10).join(', ')}`);
