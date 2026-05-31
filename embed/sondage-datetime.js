/**
 * Affichage des dates/heures dans le fuseau horaire du navigateur.
 * Stockage API : UTC (ISO). Affichage : locale utilisateur + abréviation fuseau.
 */
(function (global) {
  function userLocale() {
    return document.documentElement.lang || navigator.language || "fr-FR";
  }

  function userTimeZone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return undefined;
    }
  }

  /** ISO ou Date → chaîne locale (ex. « 31 mai 2026, 14:30 UTC+2 »). */
  function formatDateTime(iso) {
    if (iso == null || iso === "") return "—";
    const date = iso instanceof Date ? iso : new Date(iso);
    if (Number.isNaN(date.getTime())) return String(iso);

    const tz = userTimeZone();
    const options = {
      dateStyle: "medium",
      timeStyle: "short",
      timeZoneName: "short",
    };
    if (tz) options.timeZone = tz;

    return date.toLocaleString(userLocale(), options);
  }

  /** Date → valeur pour `<input type="datetime-local">` (heure locale). */
  function toDatetimeLocal(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return (
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
      `T${pad(date.getHours())}:${pad(date.getMinutes())}`
    );
  }

  /** datetime-local → ISO UTC pour l’API. */
  function datetimeLocalToIso(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString();
  }

  function formatPollWindow(startsAt, endsAt) {
    if (!startsAt && !endsAt) return "";
    if (startsAt && endsAt) {
      return `Du ${formatDateTime(startsAt)} au ${formatDateTime(endsAt)}`;
    }
    if (endsAt) return `Fin : ${formatDateTime(endsAt)}`;
    return `Début : ${formatDateTime(startsAt)}`;
  }

  global.SondageDateTime = {
    formatDateTime,
    toDatetimeLocal,
    datetimeLocalToIso,
    formatPollWindow,
    userTimeZone,
    userLocale,
  };
})(typeof window !== "undefined" ? window : globalThis);
