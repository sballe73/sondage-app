/**
 * Sondage MJ embed widget — vote via mock OAuth ou redirect Google.
 *
 * Usage:
 *   <sondage-poll-widget
 *     data-poll-id="uuid"
 *     data-api-base="https://api.example.com">
 *   </sondage-poll-widget>
 *   <script src="sondage-widget.js"></script>
 */
(function () {
  const TAG = "sondage-poll-widget";

  function formatPollWindow(poll) {
    if (!poll || !window.SondageDateTime) return "";
    return window.SondageDateTime.formatPollWindow(poll.startsAt, poll.endsAt);
  }

  const PLATFORM_LABELS = {
    mock: "mock (dev)",
    google: "Google",
    apple: "Apple",
    facebook: "Meta (Facebook)",
    linkedin: "LinkedIn",
    x: "X",
  };

  const REAL_OAUTH_PLATFORMS = new Set(["facebook", "google"]);

  function shuffleArray(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  class SondagePollWidget extends HTMLElement {
    static get observedAttributes() {
      return [
        "data-poll-id",
        "data-api-base",
        "data-platform",
        "data-subject-id",
        "data-display-name",
      ];
    }

    connectedCallback() {
      this._maybeInit();
    }

    attributeChangedCallback() {
      this._maybeInit();
    }

    _maybeInit() {
      if (this._initialized) return;

      this.pollId = this.getAttribute("data-poll-id");
      this.apiBase = (this.getAttribute("data-api-base") || "").replace(
        /\/$/,
        ""
      );
      this.platform = this.getAttribute("data-platform");
      this.subjectId = this.getAttribute("data-subject-id");
      this.displayName = this.getAttribute("data-display-name");

      if (!this.pollId || !this.apiBase) return;

      this._initialized = true;
      this.render();
      this.load();
    }

    tokenStorageKey() {
      return `sondage_token_${this.pollId}`;
    }

    consumeOAuthHash() {
      const hash = window.location.hash.replace(/^#/, "");
      if (!hash) return null;
      const params = new URLSearchParams(hash);
      const oauthError = params.get("oauth_error");
      if (oauthError) {
        history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search
        );
        throw new Error(decodeURIComponent(oauthError));
      }
      const accessToken = params.get("access_token");
      if (!accessToken) return null;
      sessionStorage.setItem(this.tokenStorageKey(), accessToken);
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search
      );
      return accessToken;
    }

    readStoredToken() {
      return (
        this.consumeOAuthHash() ||
        sessionStorage.getItem(this.tokenStorageKey()) ||
        null
      );
    }

    async load() {
      try {
        const res = await fetch(`${this.apiBase}/polls/${this.pollId}`, {
          headers: { "X-Data-Region": "EU" },
        });
        if (!res.ok) throw new Error(await res.text());
        this.poll = await res.json();
        if (this.platform && this.poll.platform !== this.platform) {
          throw new Error(
            `Platform mismatch: widget=${this.platform}, poll=${this.poll.platform}`
          );
        }
        this.platform = this.poll.platform;

        const ready = await this.ensureToken();
        if (!ready) return;

        this.renderForm();
      } catch (e) {
        this.innerHTML = `<p class="error">${escapeHtml(e.message)}</p>`;
      }
    }

    async ensureToken() {
      if (this.token) return true;

      this.token = this.readStoredToken();
      if (this.token) {
        await this.loadSession();
        return true;
      }

      if (this.platform === "mock") {
        return this.mockLogin();
      }

      if (REAL_OAUTH_PLATFORMS.has(this.platform)) {
        this.renderLoginPrompt();
        return false;
      }

      throw new Error(
        `OAuth pour ${this.platform} (${PLATFORM_LABELS[this.platform] || this.platform}) n'est pas encore disponible dans le widget — plateformes prévues : Google, Apple, Meta`
      );
    }

    async mockLogin() {
      const subjectId =
        this.subjectId || `guest-${Math.random().toString(36).slice(2, 10)}`;
      const res = await fetch(`${this.apiBase}/auth/mock/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Data-Region": "EU" },
        body: JSON.stringify({
          pollId: this.pollId,
          platform: this.platform,
          subjectId,
          displayName: this.displayName || subjectId,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      this.token = data.accessToken;
      this.subjectId = subjectId;
      return true;
    }

    async loadSession() {
      const res = await fetch(`${this.apiBase}/auth/session`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          "X-Data-Region": "EU",
        },
      });
      if (!res.ok) {
        sessionStorage.removeItem(this.tokenStorageKey());
        this.token = null;
        throw new Error("Session expirée — reconnectez-vous.");
      }
      const data = await res.json();
      this.subjectId = data.session.subjectId;
      this.displayName = data.session.displayName;
    }

    renderLoginPrompt() {
      const label =
        PLATFORM_LABELS[this.platform] || this.platform;
      const returnTo = window.location.href.split("#")[0];
      const loginUrl =
        `${this.apiBase}/auth/${encodeURIComponent(this.platform)}/login` +
        `?pollId=${encodeURIComponent(this.pollId)}` +
        `&returnTo=${encodeURIComponent(returnTo)}`;

      const windowLine = formatPollWindow(this.poll);

      this.innerHTML = `
        <article class="sondage-widget">
          <h2>${escapeHtml(this.poll.name)}</h2>
          ${windowLine ? `<p class="meta poll-window">${escapeHtml(windowLine)}</p>` : ""}
          <p class="meta">Connexion <strong>${escapeHtml(label)}</strong> requise pour voter.</p>
          <p><a class="oauth-login-btn oauth-login-btn--${escapeAttr(this.platform)}" href="${escapeAttr(loginUrl)}">Se connecter avec ${escapeHtml(label)}</a></p>
        </article>
      `;
    }

    render() {
      this.innerHTML = "<p>Chargement du sondage…</p>";
    }

    renderForm() {
      const items = shuffleArray(this.poll.items || []);
      const min = this.poll.gradeMin;
      const max = this.poll.gradeMax;
      const labels = this.poll.gradeLabels || [];
      const grades = Array.from({ length: max - min + 1 }, (_, i) => min + i);
      const gradeHint =
        labels.length > 0
          ? `${labels[0]} (1) … ${labels[labels.length - 1]} (${max})`
          : `Échelle ${min}–${max}`;
      const platformLabel =
        PLATFORM_LABELS[this.platform] || this.platform;
      const voterLine = this.displayName
        ? ` · Connecté : ${escapeHtml(this.displayName)}`
        : "";

      const windowLine = formatPollWindow(this.poll);

      const headerCells = grades
        .map((g) => {
          const lab = labels[g - min] || String(g);
          return `
            <th scope="col" class="grade-col grade-${g}" title="${escapeHtml(lab)}">
              <span class="grade-num">${g}</span>
              <span class="grade-lab">${escapeHtml(lab)}</span>
            </th>`;
        })
        .join("");

      const bodyRows = items
        .map((item) => {
          const cells = grades
            .map((g, idx) => {
              const lab = labels[g - min] || String(g);
              const requiredAttr = idx === 0 ? " required" : "";
              return `
                <td class="grade-cell grade-${g}">
                  <label class="grade-cell-label" title="${escapeHtml(lab)}">
                    <input
                      type="radio"
                      name="item-${item.id}"
                      value="${g}"${requiredAttr}
                      aria-label="${escapeHtml(item.label)} — ${escapeHtml(lab)}"
                    />
                    <span class="grade-cell-mark" aria-hidden="true"></span>
                  </label>
                </td>`;
            })
            .join("");

          return `
            <tr>
              <th scope="row" class="candidate-label">${escapeHtml(item.label)}</th>
              ${cells}
            </tr>`;
        })
        .join("");

      this.innerHTML = `
        <article class="sondage-widget">
          <h2>${escapeHtml(this.poll.name)}</h2>
          ${windowLine ? `<p class="meta poll-window">${escapeHtml(windowLine)}</p>` : ""}
          <p class="meta">Plateforme : <strong>${escapeHtml(platformLabel)}</strong>${voterLine} · ${escapeHtml(gradeHint)}</p>
          <p class="hint">Attribuez une note à chaque candidat (1 = meilleure note).</p>
          <form id="vote-form">
            <div class="vote-grid-wrap">
              <table class="vote-grid">
                <thead>
                  <tr>
                    <th scope="col" class="candidate-col">Candidat</th>
                    ${headerCells}
                  </tr>
                </thead>
                <tbody>
                  ${bodyRows}
                </tbody>
              </table>
            </div>
            <button type="submit">Envoyer mon jugement</button>
          </form>
          <p id="status"></p>
        </article>
      `;

      this.querySelector("#vote-form").addEventListener("submit", (ev) =>
        this.submitVote(ev)
      );
    }

    async submitVote(ev) {
      ev.preventDefault();
      const status = this.querySelector("#status");
      status.textContent = "Envoi…";
      const grades = (this.poll.items || []).map((item) => {
        const input = this.querySelector(
          `input[name="item-${item.id}"]:checked`
        );
        return { itemId: item.id, grade: Number(input.value) };
      });
      const res = await fetch(`${this.apiBase}/polls/${this.pollId}/votes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
          "X-Data-Region": "EU",
          "Idempotency-Key": `${this.subjectId}-${Date.now()}`,
        },
        body: JSON.stringify({ grades }),
      });
      if (res.status === 409) {
        status.textContent = "Vous avez déjà voté.";
        return;
      }
      if (!res.ok) {
        status.textContent = `Erreur : ${await res.text()}`;
        return;
      }
      status.textContent =
        "Vote enregistré. Résultats selon la politique du sondage.";
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  if (!customElements.get(TAG)) {
    customElements.define(TAG, SondagePollWidget);
  }
})();
