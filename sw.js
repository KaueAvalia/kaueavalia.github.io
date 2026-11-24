// Kauê — funciona sem internet: guarda os arquivos do app no aparelho
const VERSAO = 'kaue-v1.0.0';
const ARQUIVOS = [
  './',
  'css/kaue.css',
  'css/prova.css',
  'fonts/atkinson-hyperlegible-mono-latin-400-normal.woff2',
  'fonts/atkinson-hyperlegible-mono-latin-700-normal.woff2',
  'fonts/atkinson-hyperlegible-next-latin-400-normal.woff2',
  'fonts/atkinson-hyperlegible-next-latin-600-normal.woff2',
  'fonts/atkinson-hyperlegible-next-latin-700-normal.woff2',
  'fonts/cal-sans-regular.woff2',
  'img/apple-touch-icon.png',
  'img/favicon-32.png',
  'img/icone-192.png',
  'img/icone-512.png',
  'img/logo-claro.png',
  'img/logo-mata.png',
  'index.html',
  'js/app.js',
  'js/backup.js',
  'js/db.js',
  'js/formato-kaue.js',
  'js/render-prova.js',
  'js/util.js',
  'js/versoes.js',
  'js/word.js',
  'manifest.webmanifest',
  'vendor/docx/docx.min.js',
  'vendor/katex/fonts/KaTeX_AMS-Regular.woff2',
  'vendor/katex/fonts/KaTeX_Caligraphic-Bold.woff2',
  'vendor/katex/fonts/KaTeX_Caligraphic-Regular.woff2',
  'vendor/katex/fonts/KaTeX_Fraktur-Bold.woff2',
  'vendor/katex/fonts/KaTeX_Fraktur-Regular.woff2',
  'vendor/katex/fonts/KaTeX_Main-Bold.woff2',
  'vendor/katex/fonts/KaTeX_Main-BoldItalic.woff2',
  'vendor/katex/fonts/KaTeX_Main-Italic.woff2',
  'vendor/katex/fonts/KaTeX_Main-Regular.woff2',
  'vendor/katex/fonts/KaTeX_Math-BoldItalic.woff2',
  'vendor/katex/fonts/KaTeX_Math-Italic.woff2',
  'vendor/katex/fonts/KaTeX_SansSerif-Bold.woff2',
  'vendor/katex/fonts/KaTeX_SansSerif-Italic.woff2',
  'vendor/katex/fonts/KaTeX_SansSerif-Regular.woff2',
  'vendor/katex/fonts/KaTeX_Script-Regular.woff2',
  'vendor/katex/fonts/KaTeX_Size1-Regular.woff2',
  'vendor/katex/fonts/KaTeX_Size2-Regular.woff2',
  'vendor/katex/fonts/KaTeX_Size3-Regular.woff2',
  'vendor/katex/fonts/KaTeX_Size4-Regular.woff2',
  'vendor/katex/fonts/KaTeX_Typewriter-Regular.woff2',
  'vendor/katex/katex.min.css',
  'vendor/katex/katex.min.js',
  'vendor/katex/mhchem.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(nomes => Promise.all(nomes.filter(n => n.startsWith('kaue-') && n !== VERSAO).map(n => caches.delete(n))))
    .then(() => self.clients.claim()));
});

// primeiro o que está guardado; se não houver, busca na internet e guarda
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(resp => {
    if (resp.ok) { const copia = resp.clone(); caches.open(VERSAO).then(c => c.put(e.request, copia)); }
    return resp;
  }).catch(() => caches.match('./'))));
});
