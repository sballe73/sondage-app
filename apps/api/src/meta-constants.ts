/** Meta App ID — public (visible in OAuth URLs). */
export const META_FACEBOOK_APP_ID = "510975820333642";

export type LegalPage = "privacy" | "terms" | "data-deletion";

export function legalPagePath(page: LegalPage): string {
  return `/legal/${page}.html`;
}

export function legalPageUrl(baseUrl: string, page: LegalPage): string {
  return `${baseUrl.replace(/\/$/, "")}${legalPagePath(page)}`;
}
