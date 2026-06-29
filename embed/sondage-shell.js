/**
 * Barre de navigation commune + état de session OAuth (par plateforme).
 */
(function () {
  const ACTIVE_POLL_KEY = "sondage_active_poll_id";
  let creatorPlatformOverride = null;
  let activeNavId = "";

  const PLATFORM_LABELS = {
    mock: "mock (dev)",
    google: "Google",
    apple: "Apple",
    facebook: "Meta (Facebook)",
    linkedin: "LinkedIn",
    x: "X",
  };

  const NAV_ITEMS = [
    { id: "home", label: "Accueil", href: "/" },
    { id: "creator", label: "Créer", href: "/embed/creator.html" },
    { id: "vote", label: "Voter", href: "/embed/vote.html" },
    { id: "results", label: "Résultats", href: "/embed/results.html" },
  ];

  const CSS = `
    body.sondage-with-shell {
      padding-top: 3.5rem;
    }
    .sondage-shell {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 1000;
      display: flex;
      align-items: center;
      gap: 1rem;
      min-height: 3.25rem;
      padding: 0 1rem;
      background: var(--bg);
      border-bottom: 1px solid var(--border);
      box-shadow: 0 1px 3px var(--shadow);
      font-family: system-ui, sans-serif;
      font-size: 0.9rem;
    }
    .sondage-shell-brand {
      font-weight: 700;
      color: var(--text);
      text-decoration: none;
      white-space: nowrap;
      margin-right: 0.25rem;
    }
    .sondage-shell-brand:hover {
      color: var(--primary);
    }
    .sondage-shell-nav {
      display: flex;
      flex-wrap: wrap;
      gap: 0.15rem 0.5rem;
      flex: 1;
    }
    .sondage-shell-nav a {
      color: var(--text-muted);
      text-decoration: none;
      padding: 0.35rem 0.55rem;
      border-radius: 6px;
    }
    .sondage-shell-nav a:hover {
      background: var(--surface-hover);
      color: var(--text);
    }
    .sondage-shell-nav a.is-active {
      background: var(--primary-soft);
      color: var(--primary);
      font-weight: 600;
    }
    .sondage-shell-session {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-left: auto;
      flex-shrink: 0;
    }
    .sondage-shell-auth-label {
      color: var(--text-subtle);
      font-size: 0.8rem;
      text-align: right;
      line-height: 1.3;
      max-width: 14rem;
      display: none;
    }
    @media (min-width: 720px) {
      .sondage-shell-auth-label {
        display: block;
      }
    }
    .sondage-shell-auth-label strong {
      color: var(--text);
      font-weight: 600;
    }
    .sondage-shell-user-wrap {
      position: relative;
    }
    .sondage-shell-user-btn {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.25rem 0.5rem 0.25rem 0.25rem;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--bg);
      cursor: pointer;
      font: inherit;
      color: var(--text);
    }
    .sondage-shell-user-btn:hover {
      border-color: var(--border-strong);
      background: var(--surface);
    }
    .sondage-shell-avatar {
      width: 1.75rem;
      height: 1.75rem;
      border-radius: 50%;
      background: var(--primary);
      color: #fff;
      font-size: 0.75rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .sondage-shell-user-name {
      max-width: 8rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 0.85rem;
    }
    .sondage-shell-menu {
      display: none;
      position: absolute;
      right: 0;
      top: calc(100% + 0.35rem);
      min-width: 12rem;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: 0 8px 24px var(--shell-shadow);
      padding: 0.35rem 0;
      z-index: 1001;
    }
    .sondage-shell-menu.is-open {
      display: block;
    }
    .sondage-shell-menu-head {
      padding: 0.5rem 0.85rem;
      border-bottom: 1px solid var(--border);
      font-size: 0.8rem;
      color: var(--text-subtle);
      line-height: 1.35;
    }
    .sondage-shell-menu-head strong {
      display: block;
      color: var(--text);
      font-size: 0.9rem;
    }
    .sondage-shell-menu button {
      display: block;
      width: 100%;
      text-align: left;
      padding: 0.55rem 0.85rem;
      border: none;
      background: none;
      font: inherit;
      cursor: pointer;
      color: var(--error);
    }
    .sondage-shell-menu button:hover {
      background: var(--error-bg);
    }
    .sondage-shell-guest {
      font-size: 0.8rem;
      color: var(--text-subtle);
      white-space: nowrap;
    }
    .sondage-change-poll-btn {
      margin: 0.35rem 0 1rem;
      padding: 0.35rem 0.75rem;
      border: 1px solid var(--border-strong);
      border-radius: 6px;
      background: var(--bg);
      color: var(--text-muted);
      font: inherit;
      font-size: 0.85rem;
      cursor: pointer;
    }
    .sondage-change-poll-btn:hover {
      background: var(--surface);
      border-color: var(--text-subtle);
      color: var(--text);
    }
    .sondage-poll-ref {
      margin: 0 0 0.25rem;
      color: var(--text-muted);
    }
  `;

  function injectStyles() {
    if (document.getElementById("sondage-shell-styles")) return;
    const style = document.createElement("style");
    style.id = "sondage-shell-styles";
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function authStorage() {
    return window.SondageAuthStorage;
  }

  function readToken(platform, pollId) {
    const storage = authStorage();
    if (!storage || !platform) return null;
    const direct =
      storage.readToken(platform) ||
      storage.migrateLegacyPollToken(pollId, platform);
    if (direct) return direct;
    const legacy = storage.findAnyLegacyToken();
    return legacy ? legacy.token : null;
  }

  function clearToken(platform) {
    const storage = authStorage();
    if (!storage) return;
    storage.clearToken(platform);
  }

  function initials(name) {
    const parts = (name || "?").trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return (parts[0] || "?").slice(0, 2).toUpperCase();
  }

  function platformLabel(platform) {
    return PLATFORM_LABELS[platform] || platform || "—";
  }

  function resolvePollIdForNav() {
    return (
      getActivePollId() ||
      new URLSearchParams(window.location.search).get("pollId")
    );
  }

  function buildNav(active) {
    const pollId = resolvePollIdForNav();
    const q = pollId ? "?pollId=" + encodeURIComponent(pollId) : "";

    return NAV_ITEMS.map((item) => {
      let href = item.href;
      if (item.id !== "home" && pollId) {
        href += q;
      }
      const cls = item.id === active ? " is-active" : "";
      return `<a href="${href}" class="${cls.trim()}">${item.label}</a>`;
    }).join("");
  }

  function refreshNav() {
    const nav = document.querySelector(".sondage-shell-nav");
    if (!nav) return;
    nav.innerHTML = buildNav(activeNavId);
  }

  function renderGuest(sessionEl, message) {
    sessionEl.innerHTML =
      '<span class="sondage-shell-guest">' + escapeHtml(message) + "</span>";
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function loadPollPlatform(apiBase, pollId) {
    const res = await fetch(apiBase + "/polls/" + pollId, {
      headers: { "X-Data-Region": "EU" },
    });
    if (!res.ok) return null;
    const poll = await res.json();
    return poll.platform;
  }

  async function loadSession(apiBase, token) {
    const res = await fetch(apiBase + "/auth/session", {
      headers: {
        Authorization: "Bearer " + token,
        "X-Data-Region": "EU",
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.session;
  }

  function mountUserMenu(sessionEl, session, pollId, platform) {
    const name = session.displayName || session.subjectId;
    const label = platformLabel(session.platform || platform);

    sessionEl.innerHTML = `
      <div class="sondage-shell-user-wrap">
        <button type="button" class="sondage-shell-user-btn" id="sondage-shell-user-btn" aria-haspopup="true" aria-expanded="false">
          <span class="sondage-shell-avatar" aria-hidden="true">${escapeHtml(initials(name))}</span>
          <span class="sondage-shell-user-name">${escapeHtml(name)}</span>
        </button>
        <div class="sondage-shell-menu" id="sondage-shell-menu" role="menu">
          <div class="sondage-shell-menu-head">
            <strong>${escapeHtml(name)}</strong>
            ${escapeHtml(label)}
          </div>
          <button type="button" role="menuitem" id="sondage-shell-logout">Déconnexion</button>
        </div>
      </div>
    `;

    const btn = document.getElementById("sondage-shell-user-btn");
    const menu = document.getElementById("sondage-shell-menu");
    const logout = document.getElementById("sondage-shell-logout");

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = menu.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });

    document.addEventListener("click", () => {
      menu.classList.remove("is-open");
      btn.setAttribute("aria-expanded", "false");
    });

    logout.addEventListener("click", () => {
      clearToken(session.platform || platform);
      window.location.reload();
    });
  }

  async function refreshSessionForPlatform(apiBase, pollId, platform) {
    const sessionEl = document.getElementById("sondage-shell-session");
    const authLabelEl = document.getElementById("sondage-shell-auth-label");
    if (!sessionEl) return;

    if (authLabelEl) {
      authLabelEl.innerHTML = platform
        ? "Connexion <strong>" + escapeHtml(platformLabel(platform)) + "</strong>"
        : "Connexion <strong>selon le sondage</strong> (OAuth)";
    }

    const token = readToken(platform, pollId);
    if (!token) {
      renderGuest(
        sessionEl,
        platform ? "Non connecté" : "Sondage introuvable"
      );
      return;
    }

    let session = null;
    try {
      session = await loadSession(apiBase, token);
    } catch {
      /* ignore */
    }

    if (!session || session.platform !== platform) {
      if (session && session.platform !== platform) {
        renderGuest(sessionEl, "Non connecté");
        return;
      }
      clearToken(platform);
      renderGuest(sessionEl, "Session expirée");
      return;
    }

    if (authStorage()) {
      authStorage().writeToken(session.platform, token);
    }

    mountUserMenu(sessionEl, session, pollId, platform);
  }

  async function refreshSession(apiBase, pollId) {
    const sessionEl = document.getElementById("sondage-shell-session");
    const authLabelEl = document.getElementById("sondage-shell-auth-label");
    if (!sessionEl) return;

    if (!pollId) {
      if (creatorPlatformOverride) {
        return refreshSessionForPlatform(
          apiBase,
          null,
          creatorPlatformOverride
        );
      }
      if (authLabelEl) {
        authLabelEl.innerHTML =
          "Connexion <strong>selon le sondage</strong> (OAuth)";
      }
      renderGuest(sessionEl, "Non connecté");
      return;
    }

    let platform = null;
    try {
      platform = await loadPollPlatform(apiBase, pollId);
    } catch {
      /* ignore */
    }

    return refreshSessionForPlatform(apiBase, pollId, platform);
  }

  function getActivePollId() {
    return sessionStorage.getItem(ACTIVE_POLL_KEY);
  }

  function setActivePollId(pollId) {
    if (pollId) {
      sessionStorage.setItem(ACTIVE_POLL_KEY, pollId);
    } else {
      sessionStorage.removeItem(ACTIVE_POLL_KEY);
    }
    refreshNav();
  }

  function clearActivePoll() {
    sessionStorage.removeItem(ACTIVE_POLL_KEY);
    refreshNav();
  }

  function goToPollPicker(targetPage) {
    clearActivePoll();
    const base = targetPage.split("?")[0];
    window.location.href = base;
  }

  function syncActivePollFromUrl() {
    const pollId = new URLSearchParams(window.location.search).get("pollId");
    if (pollId) {
      setActivePollId(pollId);
    }
    return pollId;
  }

  function setCreatorPlatform(platform) {
    creatorPlatformOverride = platform || null;
  }

  function themeToggleLabel(theme) {
    return theme === "dark" ? "Mode clair" : "Mode sombre";
  }

  function themeToggleIcon(theme) {
    return theme === "dark" ? "☀" : "☾";
  }

  function mountThemeToggle() {
    const btn = document.getElementById("sondage-theme-toggle");
    if (!btn || !window.SondageTheme) return;
    const update = () => {
      const theme = window.SondageTheme.getTheme();
      btn.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
      btn.title = themeToggleLabel(theme);
      btn.textContent = themeToggleIcon(theme);
    };
    btn.addEventListener("click", () => {
      window.SondageTheme.toggleTheme();
      update();
    });
    update();
  }

  window.SondageShell = {
    getActivePollId,
    setActivePollId,
    setCreatorPlatform,
    clearActivePoll,
    goToPollPicker,
    syncActivePollFromUrl,
    refreshNav,
    init(options) {
      activeNavId = (options && options.active) || "";
      injectStyles();

      if (document.querySelector(".sondage-shell")) return;

      const header = document.createElement("header");
      header.className = "sondage-shell";
      header.innerHTML = `
        <a class="sondage-shell-brand" href="/">Sondage MJ</a>
        <nav class="sondage-shell-nav" aria-label="Navigation principale">
          ${buildNav(activeNavId)}
        </nav>
        <div class="sondage-shell-session">
          <button type="button" class="sondage-theme-toggle" id="sondage-theme-toggle" aria-label="Basculer le mode sombre" aria-pressed="false">☾</button>
          <div class="sondage-shell-auth-label" id="sondage-shell-auth-label"></div>
          <div id="sondage-shell-session">
            <span class="sondage-shell-guest">…</span>
          </div>
        </div>
      `;
      document.body.prepend(header);
      document.body.classList.add("sondage-with-shell");
      mountThemeToggle();

      const apiBase = (options && options.apiBase) || window.location.origin;
      syncActivePollFromUrl();
      refreshSession(apiBase, resolvePollIdForNav());

      window.SondageShell.refresh = function () {
        refreshNav();
        return refreshSession(apiBase, resolvePollIdForNav());
      };
    },
  };
})();
