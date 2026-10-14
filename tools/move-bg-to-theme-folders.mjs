// Range les fonds d'équipe existants de public/bg/ dans un sous-dossier par thème (public/bg/<thème>/),
// comme pour les avatars. À lancer UNE fois depuis la racine du projet :
//   node tools/move-bg-to-theme-folders.mjs --dry-run   (aperçu, ne déplace rien)
//   node tools/move-bg-to-theme-folders.mjs             (déplace les fichiers)
// Ne remplace jamais un fichier déjà présent à destination ; sans effet si les fichiers sont déjà rangés.
import fs from 'node:fs';
import path from 'node:path';

const dry = process.argv.includes('--dry-run');
const BG = path.join(process.cwd(), 'public', 'bg');

// thème -> fichiers (sans suffixe -portrait / -paysage) : même liste que lib/teamBackgrounds.ts
const SLUGS = {
  espace: ['explorateurs', 'nova', 'galaxie', 'lune', 'saturne', 'martiens', 'astronautes', 'meteores', 'zenith'],
  marins: ['coral-knights', 'abyss-serpents', 'pearl-keepers', 'tide-guardians', 'kraken-squad', 'sea-lantern-tribe', 'sharkriders', 'bubble-rangers', 'trident-force', 'starfish-crew', 'deepshell-clan', 'manta-spirits'],
};

if (!fs.existsSync(BG)) {
  console.error(`Dossier introuvable : ${BG} (lance la commande depuis la racine du projet)`);
  process.exit(1);
}

let moved = 0, skipped = 0, missing = 0;
for (const [theme, slugs] of Object.entries(SLUGS)) {
  for (const slug of slugs) {
    for (const suffix of ['portrait', 'paysage']) {
      const name = `${slug}-${suffix}.webp`;
      const from = path.join(BG, name);
      const to = path.join(BG, theme, name);
      if (!fs.existsSync(from)) { if (!fs.existsSync(to)) missing++; continue; }
      if (fs.existsSync(to)) { console.log(`déjà présent, ignoré : ${theme}/${name}`); skipped++; continue; }
      console.log(`${dry ? '[aperçu] ' : ''}${name}  ->  ${theme}/${name}`);
      if (!dry) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.renameSync(from, to); }
      moved++;
    }
  }
}
console.log(`\n${dry ? 'À déplacer' : 'Déplacés'} : ${moved} · ignorés : ${skipped} · introuvables : ${missing}`);
