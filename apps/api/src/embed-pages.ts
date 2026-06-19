import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { injectOpenGraphMeta, injectLegalOpenGraphMeta } from "./open-graph.js";
import type { LegalPage } from "./meta-constants.js";

const EMBED_HTML_PAGES = [
  {
    file: "creator.html",
    route: "/embed/creator.html",
    title: "Créateur — Sondage MJ",
  },
  {
    file: "vote.html",
    route: "/embed/vote.html",
    title: "Voter — Sondage MJ",
  },
  {
    file: "demo.html",
    route: "/embed/demo.html",
    title: "Voter — Sondage MJ",
  },
  {
    file: "results.html",
    route: "/embed/results.html",
    title: "Résultats — Sondage MJ",
  },
  {
    file: "attendance.html",
    route: "/embed/attendance.html",
    title: "Feuille d'émargement — Sondage MJ",
  },
] as const;

const LEGAL_HTML_PAGES: ReadonlyArray<{
  file: string;
  routes: readonly string[];
  title: string;
  page: LegalPage;
}> = [
  {
    file: "legal/privacy.html",
    routes: ["/legal/privacy.html", "/embed/legal/privacy.html"],
    title: "Politique de confidentialité — Sondage MJ",
    page: "privacy",
  },
  {
    file: "legal/terms.html",
    routes: ["/legal/terms.html", "/embed/legal/terms.html"],
    title: "Conditions d'utilisation — Sondage MJ",
    page: "terms",
  },
  {
    file: "legal/data-deletion.html",
    routes: ["/legal/data-deletion.html", "/embed/legal/data-deletion.html"],
    title: "Suppression des données — Sondage MJ",
    page: "data-deletion",
  },
];

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
    const html = readFileSync(join(embedRoot, page.file), "utf8");
    const enriched = injectLegalOpenGraphMeta(html, {
      title: page.title,
      page: page.page,
    });

    for (const route of page.routes) {
      app.get(route, async (_request, reply) => {
        return reply.type("text/html; charset=utf-8").code(200).send(enriched);
      });
    }
  }
}
