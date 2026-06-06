import { buildOpenGraphHead } from "./open-graph.js";

const TITLE = "Sondage MJ — Jugement majoritaire";
const DESCRIPTION =
  "Application de sondages par jugement majoritaire avec authentification Meta (Facebook) pour garantir un vote par personne.";

export function buildHomeHtml(): string {
  const ogHead = buildOpenGraphHead({
    title: TITLE,
    description: DESCRIPTION,
    urlPath: "/",
  });

  return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${TITLE}</title>
    <meta name="description" content="${DESCRIPTION}" />
${ogHead}    <style>
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
      .primary {
        display: inline-block;
        margin-top: 1.25rem;
        padding: 0.75rem 1.4rem;
        background: #2563eb;
        color: #fff;
        text-decoration: none;
        border-radius: 8px;
        font-weight: 600;
        font-size: 1rem;
      }
      .primary:hover {
        background: #1d4ed8;
      }
      nav {
        margin-top: 2rem;
        padding-top: 1.25rem;
        border-top: 1px solid #e5e7eb;
      }
      nav a {
        display: inline-block;
        margin: 0.35rem 1rem 0.35rem 0;
        color: #2563eb;
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
      <a href="/embed/demo.html">Vote (démo)</a>
      <a href="/embed/results.html">Résultats</a>
      <a href="https://sballe73.github.io/sondage-app/legal/privacy.html">Confidentialité</a>
      <a href="https://sballe73.github.io/sondage-app/legal/terms.html">Conditions</a>
    </nav>
  </body>
</html>`;
}
