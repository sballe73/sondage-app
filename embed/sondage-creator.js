/**
 * Sondage MJ creator widget — formulaire création + liens embed.
 *
 * Usage:
 *   <sondage-creator-widget data-api-base="https://api.example.com"></sondage-creator-widget>
 *   <script src="sondage-creator.js"></script>
 */
(function () {
  const TAG = "sondage-creator-widget";
  const STATUS_POLL_MS = 30000;
  const MIN_CANDIDATES = 1;
  const MAX_CANDIDATES = 20;

  const POLICY_LABELS = {
    end_only: "Fin du sondage uniquement",
    threshold_10: "Seuil de 10 votes",
    threshold_100: "Seuil de 100 votes",
    threshold_1000: "Seuil de 1000 votes",
  };

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
            <fieldset>
              <legend>Organisateur</legend>
              <label>
                Identifiant créateur
                <input type="text" name="creatorId" value="local-dev" required />
              </label>
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
                  <option value="linkedin">linkedin</option>
                  <option value="x">x</option>
                  <option value="facebook">facebook</option>
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

      return {
        creatorId: String(fd.get("creatorId") || "").trim(),
        name: String(fd.get("name") || "").trim(),
        candidates,
        startsAt: String(fd.get("startsAt") || ""),
        endsAt: String(fd.get("endsAt") || ""),
        platform: String(fd.get("platform") || "mock"),
        voterMode: String(fd.get("voterMode") || "public"),
        resultPolicy: String(fd.get("resultPolicy") || "threshold_10"),
      };
    }

    _validateForm(data) {
      const errors = [];
      if (!data.creatorId) errors.push("Identifiant créateur requis.");
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
        creatorId: data.creatorId,
        platform: data.platform,
        items: data.candidates.map((label, i) => ({ label, sortOrder: i })),
        startsAt: new Date(data.startsAt).toISOString(),
        endsAt: new Date(data.endsAt).toISOString(),
        visibility: "public",
        voterMode: data.voterMode,
        resultPolicy: data.resultPolicy,
        dataRegion: this.dataRegion,
      };

      try {
        const res = await fetch(`${this.apiBase}/polls`, {
          method: "POST",
          headers: this._headers(),
          body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(formatApiError(body, res.status));
        }
        this.createdPoll = body;
        this.pollId = body.id;
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

      if (resultsRes.ok) {
        this.statusInfo = {
          voteCount: resultsBody.voteCount,
          resultsState: "visible",
          snapshotVersion: resultsBody.version,
          computedAt: resultsBody.computedAt,
        };
      } else if (resultsRes.status === 403) {
        this.statusInfo = {
          voteCount: resultsBody.voteCount ?? 0,
          resultsState: "hidden",
          policy: resultsBody.policy,
        };
      } else if (resultsRes.status === 404) {
        this.statusInfo = {
          voteCount: resultsBody.voteCount ?? 0,
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
      const voteUrl = `${embedBase}/demo.html?pollId=${poll.id}`;
      const resultsUrl = `${embedBase}/results.html?pollId=${poll.id}`;
      const snippet = `<sondage-poll-widget
  data-poll-id="${poll.id}"
  data-api-base="${this.apiBase}"
  data-platform="${poll.platform}">
</sondage-poll-widget>
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

      this._maybeStartStatusPolling();
    }

    renderStatusHtml() {
      const poll = this.createdPoll;
      const info = this.statusInfo || {};
      const policyLabel =
        POLICY_LABELS[poll.resultPolicy] || poll.resultPolicy;

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
          <dt>Début</dt><dd>${formatDateTime(poll.startsAt)}</dd>
          <dt>Fin</dt><dd>${formatDateTime(poll.endsAt)}</dd>
          <dt>Candidats</dt><dd>${(poll.items || []).length}</dd>
        </dl>
        <p class="hint">Rafraîchissement automatique toutes les 30 s.</p>
      `;
    }

    async refreshStatusAndRender() {
      const panel = this.querySelector("#status-panel");
      if (panel) panel.innerHTML = "<p class='status'>Actualisation…</p>";
      try {
        await this.refreshStatus();
        if (panel) panel.innerHTML = this.renderStatusHtml();
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

  function toDatetimeLocal(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return (
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
      `T${pad(date.getHours())}:${pad(date.getMinutes())}`
    );
  }

  function formatDateTime(iso) {
    try {
      return new Date(iso).toLocaleString("fr-FR", {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return String(iso);
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
    customElements.define(TAG, SondageCreatorWidget);
  }
})();
