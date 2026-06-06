import { config } from "./config.js";
import {
  META_FACEBOOK_APP_ID,
  legalPagePath,
  legalPageUrl,
  type LegalPage,
} from "./meta-constants.js";

const DEFAULT_DESCRIPTION =
  "Application de sondages par jugement majoritaire avec authentification Meta (Facebook) pour garantir un vote par personne.";

export function buildFbAppIdTag(
  appId = config.oauthFacebookAppId || META_FACEBOOK_APP_ID
): string {
  if (!appId) return "";
  return `<meta property="fb:app_id" content="${appId}">`;
}

export function buildOpenGraphHead(options: {
  title: string;
  description?: string;
  urlPath: string;
  absoluteUrl?: string;
}): string {
  const base = config.publicBaseUrl;
  const description = options.description ?? DEFAULT_DESCRIPTION;
  const pageUrl = options.absoluteUrl ?? `${base}${options.urlPath}`;
  const ogImage = `${base}/embed/og-image.png`;
  const appId = config.oauthFacebookAppId || META_FACEBOOK_APP_ID;
  const fbAppId = buildFbAppIdTag(appId);

  return `${fbAppId}
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Sondage MJ">
    <meta property="og:url" content="${pageUrl}">
    <meta property="og:title" content="${options.title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${ogImage}">
    <meta property="og:image:width" content="1536">
    <meta property="og:image:height" content="1024">
    <meta property="og:locale" content="fr_FR">
`;
}

export function buildLegalOpenGraphHead(options: {
  title: string;
  description?: string;
  page: LegalPage;
}): string {
  const base = config.publicBaseUrl;
  const description =
    options.description ??
    "Sondage MJ — jugement majoritaire avec authentification Meta (Facebook).";
  const pageUrl = legalPageUrl(base, options.page);
  const ogImage = `${base}/embed/og-image.png`;

  return `${buildFbAppIdTag(META_FACEBOOK_APP_ID)}
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Sondage MJ">
    <meta property="og:url" content="${pageUrl}">
    <meta property="og:title" content="${options.title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${ogImage}">
    <meta property="og:image:width" content="1536">
    <meta property="og:image:height" content="1024">
    <meta property="og:locale" content="fr_FR">
`;
}

export function injectOpenGraphMeta(
  html: string,
  options: Parameters<typeof buildOpenGraphHead>[0]
): string {
  const tags = buildOpenGraphHead(options);
  if (html.includes('property="fb:app_id"')) return html;
  if (/<meta charset/i.test(html)) {
    return html.replace(
      /(<meta charset="[^"]+"\s*\/?>)\s*\n/i,
      `$1\n${tags}`
    );
  }
  return html.replace(/<head>\s*\n/i, `<head>\n${tags}`);
}

export function injectLegalOpenGraphMeta(
  html: string,
  options: Parameters<typeof buildLegalOpenGraphHead>[0]
): string {
  const tags = buildLegalOpenGraphHead(options);
  if (html.includes('property="fb:app_id"')) {
    return html.replace(
      /<meta property="fb:app_id"[^>]*>\s*\n?/g,
      ""
    ).replace(
      /(<meta charset="[^"]+"\s*\/?>)\s*\n/i,
      `$1\n${tags}`
    );
  }
  if (/<meta charset/i.test(html)) {
    return html.replace(
      /(<meta charset="[^"]+"\s*\/?>)\s*\n/i,
      `$1\n${tags}`
    );
  }
  return html.replace(/<head>\s*\n/i, `<head>\n${tags}`);
}

export { legalPagePath, legalPageUrl };
