// Indirizzo delle foto su R2 (con il percorso segreto), senza slash finale.
// Online arriva da /assets/env.js, creato dal container con la variabile PHOTO_BASE e servito
// solo dopo il login. In locale (npx serve web) si usano i file di `publish.mjs --local ../web/_r2`.
const isLocal = /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[\w-]+\.local)$/.test(location.hostname);
const envBase = window.BF_ENV && window.BF_ENV.PHOTO_BASE;

window.BF_CONFIG = {
  R2_PUBLIC_URL: envBase || (isLocal ? "/_r2" : ""),
  // Oltre questa soglia la selezione multipla suggerisce lo ZIP della cartella.
  SELECTION_WARN_BYTES: 500 * 1024 * 1024,
};
