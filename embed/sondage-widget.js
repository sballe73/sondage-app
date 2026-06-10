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

    _authStorage() {
      return window.SondageAuthStorage;
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
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search
      );
      return accessToken;
    }

    readStoredToken() {
      const storage = this._authStorage();
      const hashToken = this.consumeOAuthHash();
      if (hashToken) return hashToken;

      if (!this.platform || !storage) return null;

      const platformToken = storage.readToken(this.platform);
      if (platformToken) return platformToken;

      const migrated = storage.migrateLegacyPollToken(
        this.pollId,
        this.platform
      );
      if (migrated) return migrated;

      const legacy = storage.findAnyLegacyToken();
      if (legacy) {
        this._legacyTokenKey = legacy.legacyKey;
        return legacy.token;
      }

      return null;
    }

    persistToken() {
      const storage = this._authStorage();
      if (storage && this.platform && this.token) {
        storage.writeToken(this.platform, this.token);
        if (this._legacyTokenKey) {
          storage.clearLegacyKey(this._legacyTokenKey);
          this._legacyTokenKey = null;
        }
      }
    }

    clearStoredToken() {
      const storage = this._authStorage();
      if (storage && this.platform) {
        storage.clearToken(this.platform);
      }
    }

    async load() {
      try {
        const healthRes = await fetch(`${this.apiBase}/health`);
        if (!healthRes.ok) throw new Error(await healthRes.text());
        this.instanceHealth = await healthRes.json();

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

        const usable =
          (this.instanceHealth && this.instanceHealth.usablePlatforms) || [];
        if (!usable.includes(this.platform)) {
          const label =
            PLATFORM_LABELS[this.platform] || this.platform;
          throw new Error(
            `Cette instance n'accepte pas les votes via ${label}. ` +
              (usable.length
                ? `Plateformes disponibles : ${usable.join(", ")}`
                : "Aucune plateforme de vote n'est activée.")
          );
        }

        const ready = await this.ensureToken();
        if (!ready) return;

        await this.loadParticipation();
        if (this.participation?.voted) {
          if (
            this.participation.pendingAggregation &&
            !this._participationVotedAt()
          ) {
            await this._syncParticipationRecord();
          }
          this.renderAlreadyVoted();
        } else {
          this.renderForm();
        }
        if (window.SondageShell && window.SondageShell.refresh) {
          await window.SondageShell.refresh();
        }
      } catch (e) {
        this.innerHTML = `<p class="error">${escapeHtml(e.message)}</p>`;
      }
    }

    async ensureToken() {
      if (this.token) return true;

      const pollPlatform = this.platform;
      this.token = this.readStoredToken();
      if (this.token) {
        await this.loadSession();
        if (this.platform !== pollPlatform) {
          this.token = null;
        } else {
          this.persistToken();
          return true;
        }
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
      this.persistToken();
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
        this.clearStoredToken();
        this.token = null;
        throw new Error("Session expirée — reconnectez-vous.");
      }
      const data = await res.json();
      this.subjectId = data.session.subjectId;
      this.displayName = data.session.displayName;
      if (data.session.platform) {
        this.platform = data.session.platform;
      }
      this.persistToken();
    }

    _legalNoticeHtml() {
      const privacyUrl = `${this.apiBase.replace(/\/$/, "")}/legal/privacy.html`;
      return `<p class="legal-notice">Nous vérifions via votre compte que vous votez une seule fois ; les totaux restent anonymes. <a href="${escapeAttr(privacyUrl)}" target="_blank" rel="noopener">Politique de confidentialité</a></p>`;
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
          ${this._legalNoticeHtml()}
          <p><a class="oauth-login-btn oauth-login-btn--${escapeAttr(this.platform)}" href="${escapeAttr(loginUrl)}">Se connecter avec ${escapeHtml(label)}</a></p>
        </article>
      `;
    }

    render() {
      this.innerHTML = "<p>Chargement du sondage…</p>";
    }

    _authHeaders() {
      return {
        Authorization: `Bearer ${this.token}`,
        "X-Data-Region": "EU",
      };
    }

    async loadParticipation() {
      const res = await fetch(
        `${this.apiBase}/polls/${this.pollId}/participation`,
        { headers: this._authHeaders() }
      );
      if (!res.ok) throw new Error(await res.text());
      this.participation = await res.json();
    }

    async _syncParticipationRecord(maxWaitMs) {
      const limit = maxWaitMs ?? 8000;
      const start = Date.now();
      do {
        await this.loadParticipation();
        if (!this.participation?.voted) return;
        if (this._participationVotedAt()) return;
        if (!this.participation.pendingAggregation) return;
        await new Promise((resolve) => setTimeout(resolve, 400));
      } while (Date.now() - start < limit);
    }

    _formatVotedAt(iso) {
      if (!iso) return null;
      if (window.SondageDateTime && window.SondageDateTime.formatDateTime) {
        return window.SondageDateTime.formatDateTime(iso);
      }
      return String(iso);
    }

    _participationVotedAt() {
      const p = this.participation || {};
      const raw =
        p.participatedAt ||
        (p.ballot && (p.ballot.votedAt || p.ballot.voted_at));
      if (raw == null || raw === "") return null;
      if (raw instanceof Date) return raw.toISOString();
      return raw;
    }

    _widgetMetaLines() {
      const min = this.poll.gradeMin;
      const max = this.poll.gradeMax;
      const labels = this.poll.gradeLabels || [];
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
      return { gradeHint, platformLabel, voterLine, windowLine };
    }

    _buildVoteGridHtml(items, options) {
      const readonly = options && options.readonly;
      const gradesByItemId =
        (options && options.gradesByItemId) || Object.create(null);
      const min = this.poll.gradeMin;
      const max = this.poll.gradeMax;
      const labels = this.poll.gradeLabels || [];
      const grades = Array.from({ length: max - min + 1 }, (_, i) => min + i);

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
          const selected = gradesByItemId[item.id];
          const cells = grades
            .map((g) => {
              const lab = labels[g - min] || String(g);
              const checked = selected === g;
              const checkedAttr = checked ? " checked" : "";
              const disabledAttr = readonly ? " disabled" : "";
              return `
                <td class="grade-cell grade-${g}">
                  <label class="grade-cell-label" title="${escapeHtml(lab)}">
                    <input
                      type="radio"
                      name="item-${item.id}"
                      value="${g}"
                      aria-label="${escapeHtml(item.label)} — ${escapeHtml(lab)}"
                      ${checkedAttr}${disabledAttr}
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

      const gridClass = readonly ? "vote-grid vote-grid--readonly" : "vote-grid";
      return `
        <div class="vote-grid-wrap">
          <table class="${gridClass}">
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
        </div>`;
    }

    renderAlreadyVoted() {
      const { gradeHint, platformLabel, voterLine, windowLine } =
        this._widgetMetaLines();
      const votedAtRaw = this._participationVotedAt();
      const votedAtFormatted = votedAtRaw
        ? this._formatVotedAt(votedAtRaw)
        : null;
      const isPublic = this.poll.voterMode === "public";
      const ballot = this.participation && this.participation.ballot;
      const pending = this.participation && this.participation.pendingAggregation;

      const noticeHtml = votedAtFormatted
        ? isPublic && this.participation && this.participation.voted
          ? `Votre vote en date du <strong>${escapeHtml(votedAtFormatted)}</strong>`
          : `Vous avez déjà voté en date du <strong>${escapeHtml(votedAtFormatted)}</strong>`
        : pending
          ? "Votre vote est enregistré — synchronisation du détail en cours…"
          : isPublic && this.participation && this.participation.voted
            ? "Votre vote a bien été enregistré."
            : "Vous avez déjà voté.";

      let body = "";
      if (
        isPublic &&
        ballot &&
        Array.isArray(ballot.grades) &&
        ballot.grades.length > 0
      ) {
        const gradesByItemId = Object.fromEntries(
          ballot.grades.map((g) => [g.itemId, g.grade])
        );
        const items = this.poll.items || [];
        body = `
          ${this._buildVoteGridHtml(items, {
            readonly: true,
            gradesByItemId,
          })}
          <p class="vote-already-notice" role="status">
            ${noticeHtml}
          </p>`;
      } else {
        body = `
          <p class="vote-already-notice" role="status">
            ${noticeHtml}
          </p>`;
      }

      this.innerHTML = `
        <article class="sondage-widget sondage-widget--already-voted">
          <h2>${escapeHtml(this.poll.name)}</h2>
          ${windowLine ? `<p class="meta poll-window">${escapeHtml(windowLine)}</p>` : ""}
          <p class="meta">Plateforme : <strong>${escapeHtml(platformLabel)}</strong>${voterLine} · ${escapeHtml(gradeHint)}</p>
          ${body}
        </article>
      `;

      if (pending && !votedAtFormatted) {
        this._pollParticipationSync();
      } else {
        this._stopParticipationPoll();
      }
    }

    _stopParticipationPoll() {
      if (this._participationPollTimer) {
        clearInterval(this._participationPollTimer);
        this._participationPollTimer = null;
      }
    }

    _pollParticipationSync() {
      this._stopParticipationPoll();
      let attempts = 0;
      this._participationPollTimer = setInterval(async () => {
        attempts += 1;
        if (attempts > 20) {
          this._stopParticipationPoll();
          return;
        }
        try {
          await this.loadParticipation();
          if (
            this._participationVotedAt() ||
            !this.participation?.pendingAggregation
          ) {
            this._stopParticipationPoll();
            this.renderAlreadyVoted();
          }
        } catch {
          this._stopParticipationPoll();
        }
      }, 500);
    }

    renderForm() {
      const sourceItems = this.poll.items || [];
      const items = window.SondageVoteCandidateOrder
        ? window.SondageVoteCandidateOrder.shuffleItems(sourceItems)
        : sourceItems;
      const { gradeHint, platformLabel, voterLine, windowLine } =
        this._widgetMetaLines();

      this.innerHTML = `
        <article class="sondage-widget">
          <h2>${escapeHtml(this.poll.name)}</h2>
          ${windowLine ? `<p class="meta poll-window">${escapeHtml(windowLine)}</p>` : ""}
          <p class="meta">Plateforme : <strong>${escapeHtml(platformLabel)}</strong>${voterLine} · ${escapeHtml(gradeHint)}</p>
          <p class="hint">Attribuez une note à chaque candidat (1 = meilleure note).</p>
          ${this._legalNoticeHtml()}
          <form id="vote-form" novalidate>
            ${this._buildVoteGridHtml(items, { readonly: false })}
            <div class="vote-submit-row">
              <button type="submit">Envoyer mon jugement</button>
              <p id="vote-form-error" class="vote-form-error" role="alert" aria-live="polite"></p>
            </div>
          </form>
          <p id="status"></p>
        </article>
      `;

      const form = this.querySelector("#vote-form");
      form.addEventListener("submit", (ev) => this.submitVote(ev));
      form.addEventListener("change", () => {
        const formError = this.querySelector("#vote-form-error");
        if (formError) formError.textContent = "";
      });
    }

    async submitVote(ev) {
      ev.preventDefault();
      const status = this.querySelector("#status");
      const formError = this.querySelector("#vote-form-error");
      if (formError) formError.textContent = "";

      const validation = window.SondageVoteFormValidate.validateVoteGrades(
        this.poll.items || [],
        (itemId) => {
          const input = this.querySelector(
            `input[name="item-${itemId}"]:checked`
          );
          return input ? Number(input.value) : null;
        }
      );

      if (!validation.ok) {
        status.textContent = "";
        if (formError) {
          formError.textContent = validation.message;
          formError.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
        return;
      }

      const grades = validation.grades;

      status.textContent = "Envoi…";
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
        await this._syncParticipationRecord();
        if (this.participation && this.participation.voted) {
          this.renderAlreadyVoted();
        } else {
          status.textContent =
            "Vote déjà enregistré — actualisation des résultats en cours…";
        }
        return;
      }
      if (!res.ok) {
        status.textContent = `Erreur : ${await res.text()}`;
        return;
      }
      await this._syncParticipationRecord();
      this.renderAlreadyVoted();
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
