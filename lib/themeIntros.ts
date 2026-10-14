// Vidéo de lancement propre à chaque habillage.
// Au clic sur « Démarrer la partie », la mascotte allume son écran et ouvre un portail holographique (40 % de la scène,
// au centre) qui joue la vidéo du thème. À la fin de la vidéo, le portail reste HOLD_AFTER_VIDEO_MS sur la dernière image,
// puis se réduit vers la mascotte et la première question s'affiche.
// Chaque habillage a sa ligne ci-dessous. Si le fichier est absent (ou illisible), le portail affiche à la place un « ? »
// en halo lumineux pendant NO_VIDEO_MS ; s'il est présent, la vidéo est jouée. Rien à modifier dans le code :
// il suffit de déposer public/themes/<thème>/intro.mp4 (+ intro-poster.webp = sa première image, facultatif ;
// dans ce cas ajouter poster: '/themes/<thème>/intro-poster.webp' à la ligne du thème).

export type ThemeIntro = { src: string; poster?: string };

export const THEME_INTROS: Record<string, ThemeIntro> = {
  sucrerie: { src: '/themes/sucrerie/intro.mp4', poster: '/themes/sucrerie/intro-poster.webp' },
  multivers: { src: '/themes/multivers/intro.mp4' },
  halloween: { src: '/themes/halloween/intro.mp4' },
  noel: { src: '/themes/noel/intro.mp4' },
  espace: { src: '/themes/espace/intro.mp4' },
  art: { src: '/themes/art/intro.mp4' },
  marins: { src: '/themes/marins/intro.mp4' },
  jungle: { src: '/themes/jungle/intro.mp4' },
  egypte: { src: '/themes/egypte/intro.mp4' },
  sports: { src: '/themes/sports/intro.mp4' },
  terre: { src: '/themes/terre/intro.mp4' },
  temps: { src: '/themes/temps/intro.mp4' },
  voyage: { src: '/themes/voyage/intro.mp4' },
  peche: { src: '/themes/peche/intro.mp4' },
  aventure: { src: '/themes/aventure/intro.mp4' },
  medieval: { src: '/themes/medieval/intro.mp4' },
  mythologie: { src: '/themes/mythologie/intro.mp4' },
  fantasy: { src: '/themes/fantasy/intro.mp4' },
  astronomie: { src: '/themes/astronomie/intro.mp4' },
  sciences: { src: '/themes/sciences/intro.mp4' },
  inventions: { src: '/themes/inventions/intro.mp4' },
  civilisations: { src: '/themes/civilisations/intro.mp4' },
  iles: { src: '/themes/iles/intro.mp4' },
};

export const HOLD_AFTER_VIDEO_MS = 2000; // pause sur la dernière image, avant que le portail se referme
export const NO_VIDEO_MS = 5000; // durée du « ? » lumineux quand le thème n'a pas de vidéo
