/**
 * Sondage MJ embed widget — uses poll.platform OAuth via API base URL.
 *
 * Usage:
 *   <motion-poll-widget
 *     data-poll-id="uuid"
 *     data-api-base="https://api.example.com"
 *     data-platform="mock">
 *   </motion-poll-widget>
 *   <script src="sondage-widget.js" type="module"></script>
 */
(function () {
  const TAG = "sondage-poll-widget";

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
        await this.ensureToken();
        this.renderForm();
      } catch (e) {
        this.innerHTML = `<p class="error">${e.message}</p>`;
      }
    }

    async ensureToken() {
      if (this.token) return;
      if (this.platform !== "mock") {
        throw new Error(
          `OAuth for ${this.platform} must be completed by host app; only mock is built-in`
        );
      }
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
    }

    render() {
      this.innerHTML = "<p>Chargement du sondage…</p>";
    }

    renderForm() {
      const items = this.poll.items || [];
      const min = this.poll.gradeMin;
      const max = this.poll.gradeMax;
      const labels = this.poll.gradeLabels || [];
      const grades = Array.from({ length: max - min + 1 }, (_, i) => min + i);
      const gradeHint =
        labels.length > 0
          ? `${labels[0]} (1) … ${labels[labels.length - 1]} (${max})`
          : `Échelle ${min}–${max}`;

      this.innerHTML = `
        <article class="sondage-widget">
          <h2>${escapeHtml(this.poll.name)}</h2>
          <p class="meta">Plateforme : <strong>${escapeHtml(this.poll.platform)}</strong> · ${escapeHtml(gradeHint)}</p>
          <form id="vote-form">
            ${items
              .map(
                (item) => `
              <fieldset>
                <legend>${escapeHtml(item.label)}</legend>
                <div class="grade-options">
                ${grades
                  .map((g) => {
                    const lab = labels[g - min] || String(g);
                    return `
                  <label class="grade-option" title="${escapeHtml(lab)}">
                    <input type="radio" name="item-${item.id}" value="${g}" required />
                    <span class="grade-num">${g}</span>
                    <span class="grade-label">${escapeHtml(lab)}</span>
                  </label>`;
                  })
                  .join("")}
                </div>
              </fieldset>`
              )
              .join("")}
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
      status.textContent = "Vote enregistré. Résultats selon la politique du sondage.";
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  if (!customElements.get(TAG)) {
    customElements.define(TAG, SondagePollWidget);
  }
})();
