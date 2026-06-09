/**
 * Sondage MJ creator widget — formulaire création + liens embed.
 *
 * Usage:
 *   <sondage-creator-widget data-api-base="https://api.example.com"></sondage-creator-widget>
 *   <script src="sondage-creator.js"></script>
 */
(function () {
  const DT = window.SondageDateTime;
  const formatDateTime = (iso) => DT.formatDateTime(iso);
  const toDatetimeLocal = (date) => DT.toDatetimeLocal(date);
  const datetimeLocalToIso = (value) => DT.datetimeLocalToIso(value);

  const TAG = "sondage-creator-widget";
  const STATUS_POLL_MS = 30000;
  const MIN_CANDIDATES = 1;
  const MAX_CANDIDATES = 20;

  const POLICY_LABELS = {
    end_only: "Fin du sondage uniquement",
    threshold_1: "Seuil de 1 vote (mock)",
    threshold_10: "Seuil de 10 votes",
    threshold_100: "Seuil de 100 votes",
    threshold_1000: "Seuil de 1000 votes",
  };

  const PLATFORM_LABELS = {
    mock: "mock (dev)",
    google: "Google",
    apple: "Apple",
    facebook: "Meta (Facebook)",
    linkedin: "LinkedIn",
    x: "X",
  };

  const REAL_OAUTH_PLATFORMS = new Set(["facebook", "google"]);

  class SondageCreatorWidget extends HTMLElement {
    static get observedAttributes() {
      return ["data-api-base", "data-poll-id", "data-data-region"];
    }

    connectedCallback() {
      this._maybeInit();
    }

    attributeChangedCallback() {
      if (this._initialized) {
        const pollId = this.getAttribute("data-poll-id");
        if (pollId && pollId !== this.pollId) {
          this.pollId = pollId;
          this.loadExistingPoll();
        }
      } else {
        this._maybeInit();
      }
    }

    disconnectedCallback() {
      this._stopStatusPolling();
    }

    _maybeInit() {
      if (this._initialized) return;

      this.apiBase = (this.getAttribute("data-api-base") || "").replace(
        /\/$/,
        ""
      );
      this.dataRegion = this.getAttribute("data-data-region") || "EU";
      this.pollId = this.getAttribute("data-poll-id");

      if (!this.apiBase) return;

      this._initialized = true;
      if (this.pollId) {
        this.loadExistingPoll();
      } else {
        this.renderForm();
      }
    }

    _headers() {
      return {
        "Content-Type": "application/json",
        "X-Data-Region": this.dataRegion,
      };
    }

    _authHeaders() {
      const headers = this._headers();
      if (this.token) {
        headers.Authorization = `Bearer ${this.token}`;
      }
      return headers;
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

    readStoredToken(platform) {
      const storage = this._authStorage();
      if (!storage || !platform) return null;
      return storage.readToken(platform);
    }

    persistToken(platform) {
      const storage = this._authStorage();
      if (storage && platform && this.token) {
        storage.writeToken(platform, this.token);
      }
    }

    clearStoredToken(platform) {
      const storage = this._authStorage();
      if (storage && platform) {
        storage.clearToken(platform);
      }
    }

    async loadSession() {
      if (!this.token) return null;
      const res = await fetch(`${this.apiBase}/auth/session`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          "X-Data-Region": this.dataRegion,
        },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.session;
    }

    async ensureAuth(platform) {
      const hashToken = this.consumeOAuthHash();
      if (hashToken) {
        this.token = hashToken;
      } else {
        this.token = this.readStoredToken(platform);
      }

      if (!this.token) {
        this.session = null;
        return false;
      }

      const session = await this.loadSession();
      if (!session || session.platform !== platform) {
        this.clearStoredToken(platform);
        this.token = null;
        this.session = null;
        return false;
      }

      this.session = session;
      this.persistToken(platform);
      return true;
    }

    _isRealOAuth(platform) {
      return REAL_OAUTH_PLATFORMS.has(platform);
    }

    _oauthLoginUrl(platform, pollId) {
      const returnTo = window.location.href.split("#")[0];
      let url =
        `${this.apiBase}/auth/${encodeURIComponent(platform)}/login` +
        `?returnTo=${encodeURIComponent(returnTo)}`;
      if (pollId) {
        url += `&pollId=${encodeURIComponent(pollId)}`;
      }
      return url;
    }

    _isPollCreator() {
      const poll = this.createdPoll;
      if (!poll || !this.session) return false;
      return (
        this.session.platform === poll.platform &&
        this.session.subjectId === poll.creatorId
      );
    }

    _embedBase() {
      const origin = window.location.origin;
      if (origin && origin !== "null") {
        return origin + "/embed";
      }
      return this.apiBase + "/embed";
    }

    async loadExistingPoll() {
      this.renderLoading("Chargement du sondage…");
      try {
        const res = await fetch(`${this.apiBase}/polls/${this.pollId}`, {
          headers: { "X-Data-Region": this.dataRegion },
        });
        if (!res.ok) throw new Error(await res.text());
        this.createdPoll = await res.json();
        if (this.createdPoll.dataRegion) {
          this.dataRegion = this.createdPoll.dataRegion;
        }
        await this.ensureAuth(this.createdPoll.platform);
        await this.refreshStatus();
        this.renderCreated();
      } catch (e) {
        this.renderError(e.message);
      }
    }

    renderLoading(message) {
      this.innerHTML = `<article class="sondage-creator"><p class="status">${escapeHtml(message || "Chargement…")}</p></article>`;
    }

    renderError(message) {
      this.innerHTML = `<article class="sondage-creator"><p class="error">${escapeHtml(message)}</p></article>`;
    }

    renderForm() {
      const now = new Date();
      const starts = new Date(now.getTime() - 60 * 60 * 1000);
      const ends = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      this.innerHTML = `
        <article class="sondage-creator">
          <form id="creator-form" class="creator-form">
            <fieldset id="organizer-fieldset">
              <legend>Organisateur</legend>
              <div id="organizer-content"></div>
            </fieldset>

            <fieldset>
              <legend>Sondage</legend>
              <label>
                Nom
                <input type="text" name="name" required maxlength="500" placeholder="Ex. Élection interne 2026" />
              </label>
            </fieldset>

            <fieldset>
              <legend>Candidats / options</legend>
              <p class="hint">Ajoutez 3 à 14 options (minimum 1). L’échelle MJ 1–7 est appliquée par défaut.</p>
              <div id="candidates-list"></div>
              <button type="button" id="add-candidate" class="btn-secondary">+ Ajouter un candidat</button>
            </fieldset>

            <fieldset>
              <legend>Fenêtre de vote</legend>
              <p class="hint">Heures saisies et affichées dans votre fuseau local (${escapeHtml(DT.userTimeZone() || "navigateur")}).</p>
              <label>
                Début
                <input type="datetime-local" name="startsAt" value="${toDatetimeLocal(starts)}" required />
              </label>
              <label>
                Fin
                <input type="datetime-local" name="endsAt" value="${toDatetimeLocal(ends)}" required />
              </label>
            </fieldset>

            <fieldset>
              <legend>Configuration</legend>
              <label>
                Plateforme OAuth
                <select name="platform">
                  <option value="mock" selected>mock (dev / tests)</option>
                  <option value="facebook">facebook / Meta — OAuth (pilote Lot 3)</option>
                  <option value="google">google — OAuth (après projet GCP)</option>
                  <option value="apple">apple — à venir</option>
                  <option value="linkedin">linkedin (Phase 2+)</option>
                  <option value="x">x (abandonné — coût API)</option>
                </select>
              </label>
              <label>
                Mode votant
                <select name="voterMode">
                  <option value="public" selected>public (bulletins visibles)</option>
                  <option value="anonymous">anonymous</option>
                </select>
              </label>
              <label>
                Politique de résultats
                <select name="resultPolicy">
                  <option value="threshold_10" selected>threshold_10 (dès 10 votes)</option>
                  <option value="threshold_100">threshold_100</option>
                  <option value="threshold_1000">threshold_1000</option>
                  <option value="end_only">end_only (à la fin)</option>
                </select>
              </label>
            </fieldset>

            <p id="form-error" class="error" hidden></p>
            <button type="submit" class="btn-primary">Créer le sondage</button>
          </form>
        </article>
      `;

      this._candidateCount = 0;
      const list = this.querySelector("#candidates-list");
      for (let i = 0; i < 3; i++) this._addCandidateRow(list);

      this.querySelector("#add-candidate").addEventListener("click", () => {
        if (this._candidateCount >= MAX_CANDIDATES) return;
        this._addCandidateRow(list);
      });

      this.querySelector("#creator-form").addEventListener("submit", (ev) =>
        this.submitForm(ev)
      );

      const platformSelect = this.querySelector('select[name="platform"]');
      const resultPolicySelect = this.querySelector('select[name="resultPolicy"]');
      const syncMockOnlyOptions = () => {
        const isMock = platformSelect.value === "mock";
        let threshold1Option = resultPolicySelect.querySelector(
          'option[value="threshold_1"]'
        );
        if (isMock && !threshold1Option) {
          threshold1Option = document.createElement("option");
          threshold1Option.value = "threshold_1";
          threshold1Option.textContent = "threshold_1 (dès 1 vote)";
          resultPolicySelect.insertBefore(
            threshold1Option,
            resultPolicySelect.firstChild
          );
        } else if (!isMock && threshold1Option) {
          if (resultPolicySelect.value === "threshold_1") {
            resultPolicySelect.value = "threshold_10";
          }
          threshold1Option.remove();
        }
      };
      const onPlatformChange = () => {
        syncMockOnlyOptions();
        this._syncOrganizerUi();
      };
      platformSelect.addEventListener("change", onPlatformChange);
      syncMockOnlyOptions();
      this._syncOrganizerUi();
    }

    _updateSubmitState(enabled) {
      const submitBtn = this.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = !enabled;
      }
    }

    async _syncOrganizerUi() {
      const platformSelect = this.querySelector('select[name="platform"]');
      const container = this.querySelector("#organizer-content");
      if (!platformSelect || !container) return;

      const platform = platformSelect.value;

      if (platform === "mock") {
        container.innerHTML = `
          <label>
            Identifiant créateur
            <input type="text" name="creatorId" value="local-dev" required />
          </label>
          <p class="hint">Identifiant libre en dev (mock uniquement).</p>
        `;
        this._updateSubmitState(true);
        if (window.SondageShell && window.SondageShell.setCreatorPlatform) {
          window.SondageShell.setCreatorPlatform(null);
        }
        return;
      }

      try {
        await this.ensureAuth(platform);
      } catch (e) {
        container.innerHTML = `<p class="error">${escapeHtml(e.message)}</p>`;
        this._updateSubmitState(false);
        return;
      }

      const label = PLATFORM_LABELS[platform] || platform;

      if (this.session) {
        const display = this.session.displayName || this.session.subjectId;
        container.innerHTML = `
          <label>
            Identifiant créateur
            <input type="text" readonly value="${escapeAttr(display)}" />
          </label>
          <p class="hint">Connecté en tant que <strong>${escapeHtml(display)}</strong> (${escapeHtml(label)}).</p>
        `;
        this._updateSubmitState(true);
      } else if (this._isRealOAuth(platform)) {
        const loginUrl = this._oauthLoginUrl(platform);
        container.innerHTML = `
          <p class="hint">Connexion <strong>${escapeHtml(label)}</strong> requise pour créer un sondage sur cette plateforme.</p>
          <p><a class="oauth-login-btn oauth-login-btn--${escapeAttr(platform)}" href="${escapeAttr(loginUrl)}">Se connecter avec ${escapeHtml(label)}</a></p>
        `;
        this._updateSubmitState(false);
      } else {
        container.innerHTML = `
          <p class="hint">La plateforme ${escapeHtml(label)} n'est pas encore disponible pour la création.</p>
        `;
        this._updateSubmitState(false);
      }

      if (window.SondageShell) {
        if (window.SondageShell.setCreatorPlatform) {
          window.SondageShell.setCreatorPlatform(platform);
        }
        if (window.SondageShell.refresh) {
          window.SondageShell.refresh();
        }
      }
    }

    _addCandidateRow(list) {
      if (this._candidateCount >= MAX_CANDIDATES) return;
      this._candidateCount += 1;
      const row = document.createElement("div");
      row.className = "candidate-row";
      row.innerHTML = `
        <input type="text" name="candidate" placeholder="Candidat ${this._candidateCount}" required maxlength="200" />
        <button type="button" class="btn-remove" title="Retirer">×</button>
      `;
      row.querySelector(".btn-remove").addEventListener("click", () => {
        if (this._candidateCount <= MIN_CANDIDATES) return;
        row.remove();
        this._candidateCount -= 1;
      });
      list.appendChild(row);
    }

    _readForm() {
      const form = this.querySelector("#creator-form");
      const fd = new FormData(form);
      const candidates = [...form.querySelectorAll('input[name="candidate"]')]
        .map((el) => el.value.trim())
        .filter(Boolean);

      const platform = String(fd.get("platform") || "mock");

      return {
        creatorId: String(fd.get("creatorId") || "").trim(),
        name: String(fd.get("name") || "").trim(),
        candidates,
        startsAt: String(fd.get("startsAt") || ""),
        endsAt: String(fd.get("endsAt") || ""),
        platform,
        voterMode: String(fd.get("voterMode") || "public"),
        resultPolicy: String(fd.get("resultPolicy") || "threshold_10"),
      };
    }

    _validateForm(data) {
      const errors = [];
      if (data.platform === "mock") {
        if (!data.creatorId) errors.push("Identifiant créateur requis.");
      } else if (!this.session) {
        errors.push("Connexion à la plateforme requise.");
      }
      if (!data.name) errors.push("Nom du sondage requis.");
      if (data.candidates.length < MIN_CANDIDATES) {
        errors.push(`Au moins ${MIN_CANDIDATES} candidat requis.`);
      }
      if (!data.startsAt || !data.endsAt) {
        errors.push("Dates de début et fin requises.");
      } else if (new Date(data.endsAt) <= new Date(data.startsAt)) {
        errors.push("La date de fin doit être postérieure au début.");
      }
      return errors;
    }

    _showFormError(message) {
      const el = this.querySelector("#form-error");
      if (!el) return;
      if (message) {
        el.textContent = message;
        el.hidden = false;
      } else {
        el.textContent = "";
        el.hidden = true;
      }
    }

    async submitForm(ev) {
      ev.preventDefault();
      this._showFormError("");

      const data = this._readForm();
      const clientErrors = this._validateForm(data);
      if (clientErrors.length) {
        this._showFormError(clientErrors.join(" "));
        return;
      }

      const submitBtn = this.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = "Création…";

      const payload = {
        name: data.name,
        platform: data.platform,
        items: data.candidates.map((label, i) => ({ label, sortOrder: i })),
        startsAt: datetimeLocalToIso(data.startsAt),
        endsAt: datetimeLocalToIso(data.endsAt),
        visibility: "public",
        voterMode: data.voterMode,
        resultPolicy: data.resultPolicy,
        dataRegion: this.dataRegion,
      };
      if (data.platform === "mock") {
        payload.creatorId = data.creatorId;
      }

      try {
        const res = await fetch(`${this.apiBase}/polls`, {
          method: "POST",
          headers: this._authHeaders(),
          body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(formatApiError(body, res.status));
        }
        this.createdPoll = body;
        this.pollId = body.id;
        if (window.SondageShell && window.SondageShell.setActivePollId) {
          window.SondageShell.setActivePollId(body.id);
        }
        if (body.dataRegion) this.dataRegion = body.dataRegion;
        await this.refreshStatus();
        this.renderCreated();
        this._updateUrl(body.id);
      } catch (e) {
        this._showFormError(e.message);
        submitBtn.disabled = false;
        submitBtn.textContent = "Créer le sondage";
      }
    }

    _updateUrl(pollId) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("pollId", pollId);
        window.history.replaceState({}, "", url);
      } catch {
        /* ignore */
      }
    }

    async refreshStatus() {
      if (!this.pollId) return;
      const pollRes = await fetch(`${this.apiBase}/polls/${this.pollId}`, {
        headers: { "X-Data-Region": this.dataRegion },
      });
      if (pollRes.ok) {
        this.createdPoll = await pollRes.json();
        if (this.createdPoll.dataRegion) {
          this.dataRegion = this.createdPoll.dataRegion;
        }
      }

      const resultsRes = await fetch(
        `${this.apiBase}/polls/${this.pollId}/results`,
        { headers: { "X-Data-Region": this.dataRegion } }
      );
      const resultsBody = await resultsRes.json().catch(() => ({}));
      const pollVoteCount = this.createdPoll?.voteCount;

      if (resultsRes.ok) {
        this.statusInfo = {
          voteCount: resultsBody.liveVoteCount ?? resultsBody.voteCount,
          snapshotVoteCount: resultsBody.voteCount,
          liveVoteCount: resultsBody.liveVoteCount,
          resultsState: "visible",
          snapshotVersion: resultsBody.version,
          computedAt: resultsBody.computedAt,
        };
      } else if (resultsRes.status === 403) {
        const info = normalizeResultsErrorBody(resultsBody);
        this.statusInfo = {
          voteCount: info.voteCount ?? pollVoteCount ?? 0,
          resultsState: "hidden",
          policy: info.policy,
        };
      } else if (resultsRes.status === 404) {
        const info = normalizeResultsErrorBody(resultsBody);
        this.statusInfo = {
          voteCount: info.voteCount ?? pollVoteCount ?? 0,
          resultsState: "pending",
        };
      } else {
        this.statusInfo = {
          voteCount: null,
          resultsState: "unknown",
          error: resultsBody.error || resultsRes.statusText,
        };
      }
    }

    renderCreated() {
      const poll = this.createdPoll;
      const embedBase = this._embedBase();
      const voteUrl = `${embedBase}/vote.html?pollId=${poll.id}`;
      const resultsUrl = `${embedBase}/results.html?pollId=${poll.id}`;
      const snippet = `<sondage-poll-widget
  data-poll-id="${poll.id}"
  data-api-base="${this.apiBase}"
  data-platform="${poll.platform}">
</sondage-poll-widget>
<script src="${embedBase}/sondage-datetime.js"><\/script>
<script src="${embedBase}/vote-form-validate.js"><\/script>
<script src="${embedBase}/vote-candidate-order.js"><\/script>
<script src="${embedBase}/sondage-widget.js"><\/script>`;

      this.innerHTML = `
        <article class="sondage-creator">
          <section class="success-banner">
            <h2>Sondage créé</h2>
            <p class="poll-id"><strong>UUID :</strong> <code>${escapeHtml(poll.id)}</code></p>
          </section>

          <section class="links-panel">
            <h3>Liens à partager</h3>
            ${copyField("Lien vote", voteUrl)}
            ${copyField("Lien résultats", resultsUrl)}
            ${copyField("Snippet embed", snippet, true)}
          </section>

          <section class="status-panel" id="status-panel">
            ${this.renderStatusHtml()}
          </section>

          <footer class="creator-footer">
            <button type="button" id="refresh-status" class="btn-secondary">Actualiser l'état</button>
            <button type="button" id="new-poll" class="btn-secondary">Créer un autre sondage</button>
          </footer>
        </article>
      `;

      this.querySelectorAll("[data-copy]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const target = btn.getAttribute("data-copy");
          const input = this.querySelector(`#${target}`);
          if (input) copyToClipboard(input.value, btn);
        });
      });

      this.querySelector("#refresh-status").addEventListener("click", () =>
        this.refreshStatusAndRender()
      );
      this.querySelector("#new-poll").addEventListener("click", () => {
        this._stopStatusPolling();
        this.pollId = null;
        this.createdPoll = null;
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete("pollId");
          window.history.replaceState({}, "", url.pathname);
        } catch {
          /* ignore */
        }
        this.renderForm();
      });

      this._bindStatusPanelHandlers();
      this._maybeStartStatusPolling();
    }

    _renderDateRow(field, pollDate, canEdit) {
      if (!canEdit) {
        return `<dd>${formatDateTime(pollDate)}</dd>`;
      }
      const localValue = toDatetimeLocal(new Date(pollDate));
      const label = field === "startsAt" ? "le début" : "la fin";
      return `
        <dd class="date-edit-row" data-field="${field}">
          <input type="datetime-local" value="${escapeAttr(localValue)}" />
          <label class="date-now-option">
            <input type="checkbox" data-now-toggle="${field}" /> Maintenant
          </label>
          <button type="button" class="btn-secondary btn-save-date" data-save="${field}">Enregistrer ${label}</button>
          <p class="date-edit-error error" hidden></p>
        </dd>`;
    }

    _renderCreatorAuthHint(poll) {
      if (poll.platform === "mock" || this._isPollCreator()) return "";
      const label = PLATFORM_LABELS[poll.platform] || poll.platform;
      if (this.session) return "";
      if (!this._isRealOAuth(poll.platform)) {
        return `<p class="hint">Seul le créateur peut modifier les dates de ce sondage.</p>`;
      }
      const loginUrl = this._oauthLoginUrl(poll.platform, poll.id);
      return `
        <p class="hint">Connectez-vous avec <strong>${escapeHtml(label)}</strong> pour gérer ce sondage.</p>
        <p><a class="oauth-login-btn oauth-login-btn--${escapeAttr(poll.platform)}" href="${escapeAttr(loginUrl)}">Se connecter avec ${escapeHtml(label)}</a></p>
      `;
    }

    renderStatusHtml() {
      const poll = this.createdPoll;
      const info = this.statusInfo || {};
      const policyLabel =
        POLICY_LABELS[poll.resultPolicy] || poll.resultPolicy;
      const now = new Date();
      const isCreator = this._isPollCreator();
      const canEditStarts = isCreator && new Date(poll.startsAt) > now;
      const canEditEnds = isCreator && new Date(poll.endsAt) > now;

      let resultsLine = "—";
      if (info.resultsState === "visible") {
        resultsLine = `Publiés (snapshot v${info.snapshotVersion})`;
        if (info.computedAt) {
          resultsLine += ` — ${formatDateTime(info.computedAt)}`;
        }
      } else if (info.resultsState === "hidden") {
        resultsLine = `Masqués (${POLICY_LABELS[info.policy] || info.policy})`;
      } else if (info.resultsState === "pending") {
        resultsLine = "Seuil atteint, snapshot en cours de calcul…";
      } else if (info.error) {
        resultsLine = `Erreur : ${escapeHtml(info.error)}`;
      }

      const voteLine =
        info.voteCount != null
          ? `${info.voteCount} vote${info.voteCount !== 1 ? "s" : ""}`
          : "—";

      return `
        <h3>État du sondage</h3>
        <dl class="status-dl">
          <dt>Nom</dt><dd>${escapeHtml(poll.name)}</dd>
          <dt>Plateforme</dt><dd>${escapeHtml(poll.platform)}</dd>
          <dt>Politique résultats</dt><dd>${escapeHtml(policyLabel)}</dd>
          <dt>Votes</dt><dd>${escapeHtml(voteLine)}</dd>
          <dt>Résultats</dt><dd>${resultsLine}</dd>
          <dt>Début</dt>${this._renderDateRow("startsAt", poll.startsAt, canEditStarts)}
          <dt>Fin</dt>${this._renderDateRow("endsAt", poll.endsAt, canEditEnds)}
          <dt>Candidats</dt><dd>${(poll.items || []).length}</dd>
        </dl>
        ${this._renderCreatorAuthHint(poll)}
        <p class="hint">Rafraîchissement automatique toutes les 30 s.</p>
      `;
    }

    _bindStatusPanelHandlers() {
      this.querySelectorAll(".btn-save-date").forEach((btn) => {
        btn.addEventListener("click", () =>
          this._savePollDate(btn.getAttribute("data-save"))
        );
      });
      this.querySelectorAll("[data-now-toggle]").forEach((cb) => {
        cb.addEventListener("change", () => {
          const field = cb.getAttribute("data-now-toggle");
          const row = this.querySelector(`[data-field="${field}"]`);
          const input = row && row.querySelector('input[type="datetime-local"]');
          if (input) input.disabled = cb.checked;
        });
      });
    }

    _showDateEditError(field, message) {
      const row = this.querySelector(`[data-field="${field}"]`);
      const el = row && row.querySelector(".date-edit-error");
      if (!el) return;
      if (message) {
        el.textContent = message;
        el.hidden = false;
      } else {
        el.textContent = "";
        el.hidden = true;
      }
    }

    async _savePollDate(field) {
      const row = this.querySelector(`[data-field="${field}"]`);
      if (!row) return;

      this._showDateEditError(field, "");
      const nowCb = row.querySelector(`[data-now-toggle="${field}"]`);
      const input = row.querySelector('input[type="datetime-local"]');
      const btn = row.querySelector(".btn-save-date");

      let value;
      if (nowCb && nowCb.checked) {
        value = "now";
      } else {
        value = datetimeLocalToIso(input.value);
        if (!value) {
          this._showDateEditError(field, "Date invalide.");
          return;
        }
        if (new Date(value) < new Date()) {
          this._showDateEditError(field, "La date ne peut pas être dans le passé.");
          return;
        }
      }

      const poll = this.createdPoll;
      const nextStarts =
        field === "startsAt" && value !== "now"
          ? new Date(value)
          : field === "startsAt"
            ? new Date()
            : new Date(poll.startsAt);
      const nextEnds =
        field === "endsAt" && value !== "now"
          ? new Date(value)
          : field === "endsAt"
            ? new Date()
            : new Date(poll.endsAt);

      if (nextEnds <= nextStarts) {
        this._showDateEditError(
          field,
          "La date de fin doit être postérieure au début."
        );
        return;
      }

      btn.disabled = true;
      try {
        const res = await fetch(
          `${this.apiBase}/polls/${this.pollId}/dates`,
          {
            method: "PATCH",
            headers: this._authHeaders(),
            body: JSON.stringify({ [field]: value }),
          }
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(formatApiError(body, res.status));
        }
        this.createdPoll = body;
        const panel = this.querySelector("#status-panel");
        if (panel) {
          panel.innerHTML = this.renderStatusHtml();
          this._bindStatusPanelHandlers();
        }
      } catch (e) {
        this._showDateEditError(field, e.message);
      } finally {
        btn.disabled = false;
      }
    }

    async refreshStatusAndRender() {
      const panel = this.querySelector("#status-panel");
      if (panel) panel.innerHTML = "<p class='status'>Actualisation…</p>";
      try {
        if (this.createdPoll) {
          await this.ensureAuth(this.createdPoll.platform);
        }
        await this.refreshStatus();
        if (panel) {
          panel.innerHTML = this.renderStatusHtml();
          this._bindStatusPanelHandlers();
        }
      } catch (e) {
        if (panel) {
          panel.innerHTML = `<p class="error">${escapeHtml(e.message)}</p>`;
        }
      }
    }

    _maybeStartStatusPolling() {
      this._stopStatusPolling();
      this._statusTimer = setInterval(
        () => this.refreshStatusAndRender(),
        STATUS_POLL_MS
      );
    }

    _stopStatusPolling() {
      if (this._statusTimer) {
        clearInterval(this._statusTimer);
        this._statusTimer = null;
      }
    }
  }

  function copyField(label, value, multiline) {
    const id = "copy-" + Math.random().toString(36).slice(2, 9);
    const control = multiline
      ? `<textarea id="${id}" rows="5" readonly>${escapeHtml(value)}</textarea>`
      : `<input id="${id}" type="text" readonly value="${escapeAttr(value)}" />`;
    return `
      <div class="copy-field">
        <label for="${id}">${escapeHtml(label)}</label>
        <div class="copy-row">
          ${control}
          <button type="button" class="btn-copy" data-copy="${id}">Copier</button>
        </div>
      </div>`;
  }

  function formatApiError(body, status) {
    const fields = body.details?.fields ?? body.details;
    if (Array.isArray(fields)) {
      return fields
        .map((d) => (d.path ? `${d.path}: ${d.message}` : d.message))
        .join(" ; ");
    }
    if (body.error) return body.error;
    return `Erreur HTTP ${status}`;
  }

  async function copyToClipboard(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
      const prev = btn.textContent;
      btn.textContent = "Copié !";
      setTimeout(() => {
        btn.textContent = prev;
      }, 1500);
    } catch {
      btn.textContent = "Échec";
    }
  }

  function normalizeResultsErrorBody(body) {
    const details =
      body.details && typeof body.details === "object" ? body.details : {};
    return {
      ...details,
      policy: details.policy ?? body.policy,
      voteCount: details.voteCount ?? body.voteCount,
      endsAt: details.endsAt ?? body.endsAt,
      code: body.code,
      error: body.error,
    };
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
    customElements.define(TAG, SondageCreatorWidget);
  }
})();
