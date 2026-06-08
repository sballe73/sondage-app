/** Meta App ID — public (visible in OAuth URLs). */
export const META_FACEBOOK_APP_ID = "510975820333642";

export type LegalPage = "privacy" | "terms" | "data-deletion";

export function legalPagePath(page: LegalPage): string {
  return `/legal/${page}.html`;
}

export function legalPageUrl(baseUrl: string, page: LegalPage): string {
  return `${baseUrl.replace(/\/$/, "")}${legalPagePath(page)}`;
}

/** Canonical public page URL (`/` uses trailing slash, as Facebook does for roots). */
export function publicPageUrl(baseUrl: string, path = "/"): string {
  const base = baseUrl.replace(/\/$/, "");
  if (path === "/" || path === "") return `${base}/`;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
