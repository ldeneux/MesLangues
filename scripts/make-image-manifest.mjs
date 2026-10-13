// Liste les images de public/image_webp (sans l'extension) dans lib/imageManifest.json.
// Lancé automatiquement avant `npm run dev` et `npm run build` (voir package.json) : il suffit de déposer les .webp
// dans public/image_webp et de pousser sur GitHub, la liste se met à jour au déploiement.
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(process.cwd(), 'public', 'image_webp');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.webp$/i.test(f)) : [];
const names = files.map((f) => f.replace(/\.webp$/i, '')).sort();
const bad = files.filter((f) => !/^[a-z0-9_]+\.webp$/.test(f));

fs.writeFileSync(path.join(process.cwd(), 'lib', 'imageManifest.json'), JSON.stringify(names));
console.log(`imageManifest : ${names.length} image(s) dans public/image_webp`);
if (bad.length) {
  console.warn(`ATTENTION : ${bad.length} fichier(s) au nom invalide (minuscules, chiffres et _ uniquement, extension .webp en minuscules) :`);
  for (const b of bad.slice(0, 20)) console.warn('  - ' + b);
}
