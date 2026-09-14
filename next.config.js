/** @type {import('next').NextConfig} */
const nextConfig = {
  // edge-tts s'appuie sur la librairie `ws` (WebSocket), qui casse si
  // Next.js essaie de la bundler/minifier pour les fonctions serveur
  // (erreur runtime du type "t.mask is not a function"). On l'exclut du
  // bundling pour qu'elle s'exécute comme un module Node natif normal.
  serverExternalPackages: ['@andresaya/edge-tts', 'ws'],
};

module.exports = nextConfig;
