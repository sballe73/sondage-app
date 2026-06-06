import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { injectOpenGraphMeta, injectLegalOpenGraphMeta } from "./open-graph.js";

const EMBED_HTML_PAGES = [
  {
    file: "creator.html",
    route: "/embed/creator.html",
    title: "Créateur — Sondage MJ",
  },
  {
    file: "demo.html",
    route: "/embed/demo.html",
    title: "Vote — Sondage MJ",
  },
  {
    file: "results.html",
    route: "/embed/results.html",
    title: "Résultats — Sondage MJ",
  },
] as const;

const LEGAL_HTML_PAGES = [
  {
    file: "legal/privacy.html",
    route: "/embed/legal/privacy.html",
    title: "Politique de confidentialité — Sondage MJ",
    page: "privacy" as const,
  },
  {
    file: "legal/terms.html",
    route: "/embed/legal/terms.html",
    title: "Conditions d'utilisation — Sondage MJ",
    page: "terms" as const,
  },
  {
    file: "legal/data-deletion.html",
    route: "/embed/legal/data-deletion.html",
    title: "Suppression des données — Sondage MJ",
    page: "data-deletion" as const,
  },
] as const;

export function registerEmbedHtmlRoutes(
  app: FastifyInstance,
  embedRoot: string
): void {
  for (const page of EMBED_HTML_PAGES) {
    app.get(page.route, async (_request, reply) => {
      const html = readFileSync(join(embedRoot, page.file), "utf8");
      return reply
        .type("text/html; charset=utf-8")
        .code(200)
        .send(
          injectOpenGraphMeta(html, {
            title: page.title,
            urlPath: page.route,
          })
        );
    });
  }

  for (const page of LEGAL_HTML_PAGES) {
    app.get(page.route, async (_request, reply) => {
      const html = readFileSync(join(embedRoot, page.file), "utf8");
      return reply
        .type("text/html; charset=utf-8")
        .code(200)
        .send(
          injectLegalOpenGraphMeta(html, {
            title: page.title,
            page: page.page,
          })
        );
    });
  }
}
