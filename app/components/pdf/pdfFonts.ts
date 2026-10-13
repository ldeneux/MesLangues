// Polices du PDF : Noto Sans (texte), Fraunces (titres), Noto Sans JP (kana et kanji, sous-ensemble JIS X 0208).
// Fichiers dans public/fonts (licence OFL, voir les fichiers LICENSE-OFL-*.txt). `base` : '/fonts' dans le navigateur,
// chemin du dossier dans Node (tests).
let registered = false;

export function registerPdfFonts(Font: any, base = '/fonts') {
  if (registered) return;
  registered = true;
  Font.register({
    family: 'NotoSans',
    fonts: [
      { src: `${base}/NotoSans-Regular.ttf`, fontWeight: 400 },
      { src: `${base}/NotoSans-Bold.ttf`, fontWeight: 700 },
      { src: `${base}/NotoSans-Italic.ttf`, fontWeight: 400, fontStyle: 'italic' },
    ],
  });
  Font.register({
    family: 'Fraunces',
    fonts: [
      { src: `${base}/Fraunces-SemiBold.ttf`, fontWeight: 600 },
      { src: `${base}/Fraunces-Bold.ttf`, fontWeight: 700 },
    ],
  });
  Font.register({
    family: 'NotoSansJP',
    fonts: [
      { src: `${base}/NotoSansJP-Regular.ttf`, fontWeight: 400 },
      { src: `${base}/NotoSansJP-Bold.ttf`, fontWeight: 700 },
    ],
  });
  // Pas de césure automatique : un mot n'est jamais coupé en fin de ligne.
  Font.registerHyphenationCallback((word: string) => [word]);
}
