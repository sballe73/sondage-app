import { buildOpenGraphHead } from "./open-graph.js";
import { config } from "./config.js";
import { publicPageUrl } from "./meta-constants.js";

const TITLE = "Sondage MJ — Jugement majoritaire";
const DESCRIPTION =
  "Application de sondages par jugement majoritaire avec authentification Meta (Facebook) pour garantir un vote par personne.";

export function buildHomeHtml(): string {
  const canonicalUrl = publicPageUrl(config.publicBaseUrl, "/");
  const ogHead = buildOpenGraphHead({
    title: TITLE,
    description: DESCRIPTION,
    urlPath: "/",
  });

  return `<!DOCTYPE html>
<html lang="fr">
  <head>
${ogHead}    <meta charset="UTF-8" />
    <script src="/embed/sondage-theme-init.js"></script>
    <link rel="stylesheet" href="/embed/sondage-theme.css" />
    <link rel="canonical" href="${canonicalUrl}" />    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${TITLE}</title>
    <meta name="description" content="${DESCRIPTION}" />    <style>
      body {
        font-family: system-ui, sans-serif;
        max-width: 40rem;
        margin: 0 auto;
        padding: 1rem;
        line-height: 1.5;
        color: var(--text);
        background: var(--bg);
      }
      main {
        margin-top: 1rem;
      }
      h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
      p { color: var(--text-muted); }
      .primary {
        display: inline-block;
        margin-top: 1.25rem;
        padding: 0.75rem 1.4rem;
        background: var(--primary);
        color: #fff;
        text-decoration: none;
        border-radius: 8px;
        font-weight: 600;
        font-size: 1rem;
      }
      .primary:hover {
        background: var(--primary-hover);
      }
    </style>
    <script src="/embed/sondage-shell.js"></script>
  </head>
  <body>
    <main>
      <h1>Sondage MJ</h1>
      <p>
        Créez et participez à des sondages par <strong>jugement majoritaire</strong>.
        L’identité des votants est vérifiée via Meta (Facebook Login).
      </p>
      <a class="primary" href="/embed/creator.html">Créer un sondage</a>
    </main>
    <script>SondageShell.init({ active: "home" });</script>
  </body>
</html>`;
}
