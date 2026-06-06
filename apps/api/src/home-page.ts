import { config } from "./config.js";

const TITLE = "Sondage MJ — Jugement majoritaire";
const DESCRIPTION =
  "Application de sondages par jugement majoritaire avec authentification Meta (Facebook) pour garantir un vote par personne.";

export function buildHomeHtml(): string {
  const base = config.publicBaseUrl;
  const ogImage = `${base}/embed/og-image.png`;

  return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${TITLE}</title>
    <meta name="description" content="${DESCRIPTION}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${base}/" />
    <meta property="og:title" content="${TITLE}" />
    <meta property="og:description" content="${DESCRIPTION}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:image:width" content="1536" />
    <meta property="og:image:height" content="1024" />
    <meta property="og:locale" content="fr_FR" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${TITLE}" />
    <meta name="twitter:description" content="${DESCRIPTION}" />
    <meta name="twitter:image" content="${ogImage}" />
    <meta http-equiv="refresh" content="0;url=/embed/creator.html" />
    <style>
      body {
        font-family: system-ui, sans-serif;
        max-width: 40rem;
        margin: 3rem auto;
        padding: 0 1rem;
        line-height: 1.5;
        color: #1a1a1a;
      }
      h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
      p { color: #444; }
      nav { margin-top: 1.5rem; }
      nav a {
        display: inline-block;
        margin: 0.35rem 1rem 0.35rem 0;
        color: #2563eb;
      }
      .primary {
        display: inline-block;
        margin-top: 1rem;
        padding: 0.6rem 1.2rem;
        background: #2563eb;
        color: #fff;
        text-decoration: none;
        border-radius: 6px;
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <h1>Sondage MJ</h1>
    <p>
      Créez et participez à des sondages par <strong>jugement majoritaire</strong>.
      L’identité des votants est vérifiée via Meta (Facebook Login).
    </p>
    <a class="primary" href="/embed/creator.html">Créer un sondage</a>
    <nav>
      <a href="/embed/creator.html">Créateur</a>
      <a href="/embed/demo.html">Vote (démo)</a>
      <a href="/embed/results.html">Résultats</a>
      <a href="https://sballe73.github.io/sondage-app/legal/privacy.html">Confidentialité</a>
      <a href="https://sballe73.github.io/sondage-app/legal/terms.html">Conditions</a>
    </nav>
    <p><small>Redirection automatique vers le créateur…</small></p>
  </body>
</html>`;
}
