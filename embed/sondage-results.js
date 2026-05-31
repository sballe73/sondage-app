/**
 * Sondage MJ results widget — classement + grille de votes.
 *
 * Usage:
 *   <sondage-results-widget
 *     data-poll-id="uuid"
 *     data-api-base="https://api.example.com"
 *     data-data-region="EU">
 *   </sondage-results-widget>
 *   <script src="sondage-results.js"></script>
 */
(function () {
  const DT = window.SondageDateTime;
  const formatDateTime = (iso) => DT.formatDateTime(iso);
  const formatPollWindow = (starts, ends) => DT.formatPollWindow(starts, ends);

  const TAG = "sondage-results-widget";
  const POLL_INTERVAL_MS = 30000;

  const POLICY_LABELS = {
    end_only: "Fin du sondage uniquement",
    threshold_1: "Seuil de 1 vote (mock)",
    threshold_10: "Seuil de 10 votes",
    threshold_100: "Seuil de 100 votes",
    threshold_1000: "Seuil de 1000 votes",
  };

  const THRESHOLD_BY_POLICY = {
    threshold_1: 1,
    threshold_10: 10,
    threshold_100: 100,
    threshold_1000: 1000,
  };

  class SondageResultsWidget extends HTMLElement {
    static get observedAttributes() {
      return [
        "data-poll-id",
        "data-api-base",
        "data-data-region",
        "data-auto-refresh",
      ];
    }

    connectedCallback() {
      this._maybeInit();
    }

    attributeChangedCallback() {
      this._maybeInit();
    }

    disconnectedCallback() {
      this._stopPolling();
    }

    _maybeInit() {
      if (this._initialized) return;

      this.pollId = this.getAttribute("data-poll-id");
      this.apiBase = (this.getAttribute("data-api-base") || "").replace(
        /\/$/,
        ""
      );
      this.dataRegion = this.getAttribute("data-data-region") || "EU";
      const autoRefresh = this.getAttribute("data-auto-refresh");
      this.autoRefreshEnabled = autoRefresh !== "false";

      if (!this.pollId || !this.apiBase) return;

      this._initialized = true;
      this.renderLoading();
      this.load();
    }

    _headers() {
      return { "X-Data-Region": this.dataRegion };
    }

    async load(silent) {
      if (!silent) this.renderLoading();
      try {
        await this.loadPoll();
        const outcome = await this.loadResults();
        if (outcome === "visible") {
          this.renderResults();
          this._maybeStartPolling();
        } else if (outcome === "hidden") {
          this.renderHidden();
          this._maybeStartPolling();
        } else if (outcome === "no-snapshot") {
          this.renderNoSnapshot();
          this._maybeStartPolling();
        }
      } catch (e) {
        this.renderError(e.message);
        this._stopPolling();
      }
    }

    async loadPoll() {
      const res = await fetch(`${this.apiBase}/polls/${this.pollId}`, {
        headers: this._headers(),
      });
      if (!res.ok) throw new Error(await res.text());
      this.poll = await res.json();
      if (this.poll.dataRegion) {
        this.dataRegion = this.poll.dataRegion;
      }
      this._notifyPollStatus();
    }

    _notifyPollStatus() {
      this.dispatchEvent(
        new CustomEvent("sondage-poll-status", {
          bubbles: true,
          detail: {
            pollId: this.pollId,
            poll: this.poll,
            ended: isPollEnded(this.poll),
          },
        })
      );
    }

    async loadResults() {
      const res = await fetch(`${this.apiBase}/polls/${this.pollId}/results`, {
        headers: this._headers(),
      });

      if (res.status === 403) {
        const body = await res.json();
        this.hiddenInfo = normalizeResultsErrorBody(body);
        return "hidden";
      }
      if (res.status === 404) {
        const body = await res.json();
        this.noSnapshotInfo = normalizeResultsErrorBody(body);
        return "no-snapshot";
      }
      if (!res.ok) throw new Error(await res.text());

      this.resultsMeta = await res.json();
      this.snapshot = this.resultsMeta.results;
      return "visible";
    }

    _isThresholdPolicy() {
      const policy = this.poll?.resultPolicy || this.hiddenInfo?.policy;
      return policy && policy.startsWith("threshold_");
    }

    _maybeStartPolling() {
      this._stopPolling();
      if (
        !this.autoRefreshEnabled ||
        !this._isThresholdPolicy() ||
        isPollEnded(this.poll)
      ) {
        return;
      }
      this._pollTimer = setInterval(() => this.load(true), POLL_INTERVAL_MS);
    }

    _stopPolling() {
      if (this._pollTimer) {
        clearInterval(this._pollTimer);
        this._pollTimer = null;
      }
    }

    renderLoading() {
      this.innerHTML = `<article class="sondage-results"><p class="status">Chargement des résultats…</p></article>`;
    }

    renderError(message) {
      this.innerHTML = `<article class="sondage-results"><p class="error">${escapeHtml(message)}</p></article>`;
    }

    renderHidden() {
      const info = this.hiddenInfo || {};
      const policy = info.policy || this.poll?.resultPolicy;
      const voteCount =
        info.voteCount ?? this.poll?.voteCount ?? 0;
      const policyLabel = POLICY_LABELS[policy] || policy;
      const threshold = THRESHOLD_BY_POLICY[policy];
      const remaining =
        threshold != null ? Math.max(0, threshold - voteCount) : null;

      let detail = "";
      if (policy === "end_only" && info.endsAt) {
        detail = `Fin prévue : ${formatDateTime(info.endsAt)}.`;
      } else if (remaining != null && remaining > 0) {
        detail = `Encore ${remaining} vote${remaining > 1 ? "s" : ""} avant publication.`;
      }

      this.innerHTML = `
        <article class="sondage-results">
          ${renderPollEndedBanner(this.poll)}
          ${renderHeader(this.poll?.name, voteCount, null, null, null, this.poll)}
          <section class="notice notice-hidden">
            <h3>Résultats pas encore disponibles</h3>
            <p>Votes enregistrés : <strong>${voteCount}</strong></p>
            <p>Politique : <strong>${escapeHtml(policyLabel)}</strong></p>
            ${detail ? `<p>${escapeHtml(detail)}</p>` : ""}
          </section>
          ${renderRefreshControls(
            !isPollEnded(this.poll),
            this._isThresholdPolicy() && !isPollEnded(this.poll)
          )}
        </article>
      `;
      this._bindRefresh();
    }

    renderNoSnapshot() {
      const info = this.noSnapshotInfo || {};
      const voteCount = info.voteCount ?? this.poll?.voteCount ?? 0;

      this.innerHTML = `
        <article class="sondage-results">
          ${renderPollEndedBanner(this.poll)}
          ${renderHeader(this.poll?.name, voteCount, null, null, null, this.poll)}
          <section class="notice notice-pending">
            <h3>Calcul en cours</h3>
            <p>Le seuil est atteint (${voteCount} votes) mais aucun snapshot publié n'est encore disponible.</p>
            <p>Le worker recalcule les résultats — réessayez dans quelques secondes.</p>
          </section>
          ${renderRefreshControls(!isPollEnded(this.poll), false)}
        </article>
      `;
      this._bindRefresh();
    }

    renderResults() {
      const meta = this.resultsMeta;
      const snap = this.snapshot;
      const itemsById = Object.fromEntries(
        (snap.items || []).map((item) => [item.itemId, item])
      );
      const ranking = snap.ranking || [];

      this.innerHTML = `
        <article class="sondage-results">
          ${renderPollEndedBanner(this.poll)}
          ${renderHeader(
            this.poll?.name,
            meta.voteCount,
            meta.computedAt,
            meta.version,
            meta.liveVoteCount,
            this.poll
          )}
          ${renderLiveVoteNotice(
            meta.voteCount,
            meta.liveVoteCount,
            this.poll
          )}
          ${
            snap.tieBreakMethodDescription
              ? `<aside class="tie-break-info"><strong>Départage :</strong> ${escapeHtml(snap.tieBreakMethodDescription)}</aside>`
              : ""
          }
          <section class="ranking-section">
            <h3>Classement</h3>
            <table class="ranking-table">
              <thead>
                <tr>
                  <th scope="col">Rang</th>
                  <th scope="col">Candidat</th>
                  <th scope="col">Médiane</th>
                </tr>
              </thead>
              <tbody>
                ${ranking
                  .map(
                    (entry) => `
                  <tr>
                    <td class="rank">${entry.rank}</td>
                    <td class="label">${escapeHtml(entry.label)}</td>
                    <td class="median">${escapeHtml(entry.medianDisplay || "—")}</td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table>
          </section>
          <section class="distribution-section">
            <h3>Grille de votes</h3>
            <p class="hint">Répartition des jugements par note (1 = meilleure note). Intensité de couleur proportionnelle au pourcentage.</p>
            ${renderDistributionGrid(
              ranking,
              itemsById,
              snap.gradeMin,
              snap.gradeMax,
              snap.gradeLabels || []
            )}
          </section>
          ${renderRefreshControls(
            !isPollEnded(this.poll),
            this._isThresholdPolicy() && !isPollEnded(this.poll)
          )}
        </article>
      `;
      this._bindRefresh();
    }

    _bindRefresh() {
      const btn = this.querySelector("#refresh-btn");
      if (btn) {
        btn.addEventListener("click", () => this.load(false));
      }
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

  function isPollEnded(poll) {
    if (!poll) return false;
    if (poll.closedAt) return true;
    if (poll.endsAt && new Date() >= new Date(poll.endsAt)) return true;
    return false;
  }

  function renderPollEndedBanner(poll) {
    if (!isPollEnded(poll)) return "";
    const endedAt = poll.closedAt || poll.endsAt;
    const endedLabel = endedAt
      ? `Clôturé le ${formatDateTime(endedAt)}.`
      : "";
    return `
      <aside class="poll-ended-banner" role="status">
        <span class="poll-ended-label">Sondage terminé</span>
        <span class="poll-ended-detail">${escapeHtml(endedLabel)} Les votes ne sont plus acceptés — résultats finaux ci-dessous.</span>
      </aside>`;
  }

  function renderHeader(name, voteCount, computedAt, version, liveVoteCount, poll) {
    const parts = [];
    const live =
      liveVoteCount != null ? liveVoteCount : voteCount;
    const snapshot = voteCount;

    if (live != null) {
      if (snapshot != null && live !== snapshot) {
        parts.push(
          `${snapshot} vote${snapshot !== 1 ? "s" : ""} (résultats affichés)`
        );
        parts.push(`${live} vote${live !== 1 ? "s" : ""} en direct`);
      } else {
        const suffix = isPollEnded(poll) ? " (final)" : "";
        parts.push(`${live} vote${live !== 1 ? "s" : ""}${suffix}`);
      }
    }
    if (computedAt) {
      parts.push(`calculé le ${formatDateTime(computedAt)}`);
    }
    if (version != null) {
      parts.push(`snapshot v${version}`);
    }

    return `
      <header class="results-header">
        <h2>${escapeHtml(name || "Résultats")}</h2>
        ${poll?.startsAt || poll?.endsAt ? `<p class="meta poll-window">${escapeHtml(formatPollWindow(poll.startsAt, poll.endsAt))}</p>` : ""}
        ${parts.length ? `<p class="meta">${escapeHtml(parts.join(" · "))}</p>` : ""}
      </header>`;
  }

  function renderLiveVoteNotice(snapshotCount, liveCount, poll) {
    if (liveCount == null || snapshotCount == null || liveCount === snapshotCount) {
      return "";
    }

    const policy = poll?.resultPolicy;
    const threshold = THRESHOLD_BY_POLICY[policy];
    const pollEnded = isPollEnded(poll);

    let message;
    if (pollEnded) {
      message =
        "Le classement affiché n’inclut pas encore tous les votes reçus avant la clôture. Rechargez la page pour afficher le résultat final.";
    } else if (threshold && policy !== "end_only") {
      const nextCheckpoint = Math.ceil(liveCount / threshold) * threshold;
      message = `La grille et le classement ci-dessous correspondent au palier de ${snapshotCount} votes. Prochaine mise à jour prévue à ${nextCheckpoint} votes (${liveCount} votes enregistrés).`;
    } else {
      message = `Classement affiché basé sur ${snapshotCount} votes sur ${liveCount} enregistrés.`;
    }

    return `<aside class="live-vote-notice">${escapeHtml(message)}</aside>`;
  }

  function renderRefreshControls(showFooter, showAutoHint) {
    if (!showFooter) return "";
    return `
      <footer class="results-footer">
        <button type="button" id="refresh-btn">Actualiser</button>
        ${
          showAutoHint
            ? `<span class="auto-hint">Rafraîchissement automatique toutes les 30 s</span>`
            : ""
        }
      </footer>`;
  }

  const GRADE_RGB = {
    1: "22,163,74",
    2: "34,197,94",
    3: "132,204,22",
    4: "234,179,8",
    5: "249,115,22",
    6: "239,68,68",
    7: "185,28,28",
  };

  function gradeCellBackground(grade, count, pct) {
    if (count === 0) return "transparent";
    const rgb = GRADE_RGB[grade] || "107,114,128";
    const alpha = 0.12 + (pct / 100) * 0.88;
    return `rgba(${rgb}, ${alpha.toFixed(3)})`;
  }

  function renderDistributionGrid(
    ranking,
    itemsById,
    gradeMin,
    gradeMax,
    gradeLabels
  ) {
    const grades = Array.from(
      { length: gradeMax - gradeMin + 1 },
      (_, i) => gradeMin + i
    );

    const headerCells = grades
      .map((g) => {
        const lab = gradeLabels[g - gradeMin] || String(g);
        return `
          <th scope="col" class="grade-col grade-${g}" title="${escapeHtml(lab)}">
            <span class="grade-num">${g}</span>
            <span class="grade-lab">${escapeHtml(lab)}</span>
          </th>`;
      })
      .join("");

    const bodyRows = ranking
      .map((entry) => {
        const item = itemsById[entry.itemId];
        if (!item) return "";
        const total = item.totalJudgments || 0;
        const distribution = item.distribution || {};

        const cells = grades
          .map((g) => {
            const count = distribution[g] || 0;
            const pct = total > 0 ? (count / total) * 100 : 0;
            const lab = gradeLabels[g - gradeMin] || String(g);
            const bg = gradeCellBackground(g, count, pct);
            return `
              <td
                class="distribution-cell grade-${g}${count === 0 ? " is-empty" : ""}"
                style="background-color:${bg}"
                title="${escapeHtml(lab)} : ${count} jugement${count !== 1 ? "s" : ""} (${pct.toFixed(1)} %)"
              >
                <span class="cell-count">${count}</span><span class="cell-sep"> / </span><span class="cell-pct">${pct.toFixed(0)} %</span>
              </td>`;
          })
          .join("");

        return `
          <tr>
            <th scope="row" class="candidate-label">
              <span class="candidate-name">${escapeHtml(entry.label)}</span>
              ${
                entry.medianDisplay
                  ? `<span class="candidate-median">${escapeHtml(entry.medianDisplay)}</span>`
                  : ""
              }
            </th>
            ${cells}
          </tr>`;
      })
      .join("");

    return `
      <div class="distribution-grid-wrap">
        <table class="distribution-grid">
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

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  if (!customElements.get(TAG)) {
    customElements.define(TAG, SondageResultsWidget);
  }
})();
