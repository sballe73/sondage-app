import { config } from "./config.js";

const DEFAULT_DESCRIPTION =
  "Application de sondages par jugement majoritaire avec authentification Meta (Facebook) pour garantir un vote par personne.";

export function buildOpenGraphHead(options: {
  title: string;
  description?: string;
  urlPath: string;
}): string {
  const base = config.publicBaseUrl;
  const description = options.description ?? DEFAULT_DESCRIPTION;
  const pageUrl = `${base}${options.urlPath}`;
  const ogImage = `${base}/embed/og-image.png`;
  const appId = config.oauthFacebookAppId;

  const fbAppIdTag = appId
    ? `    <meta property="fb:app_id" content="${appId}" />\n    <meta name="fb:app_id" content="${appId}" />\n`
    : "";

  return `${fbAppIdTag}    <meta property="og:type" content="website" />
    <meta property="og:url" content="${pageUrl}" />
    <meta property="og:title" content="${options.title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:image:width" content="1536" />
    <meta property="og:image:height" content="1024" />
    <meta property="og:locale" content="fr_FR" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${options.title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${ogImage}" />
`;
}

export function injectOpenGraphMeta(
  html: string,
  options: Parameters<typeof buildOpenGraphHead>[0]
): string {
  const tags = buildOpenGraphHead(options);
  if (html.includes('property="fb:app_id"')) return html;
  return html.replace(/<head>\s*\n/i, `<head>\n${tags}`);
}
