/**
 * Feuille d'émargement — liste des votants d'un sondage.
 */
(function () {
  const DT = window.SondageDateTime;
  const formatDateTime = (iso) => DT.formatDateTime(iso);

  const TAG = "sondage-attendance-widget";

  const PLATFORM_LABELS = {
    mock: "mock (dev)",
    google: "Google",
    apple: "Apple",
    facebook: "Meta (Facebook)",
    linkedin: "LinkedIn",
    x: "X",
  };

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  class SondageAttendanceWidget extends HTMLElement {
    connectedCallback() {
      this.pollId = this.getAttribute("data-poll-id");
      this.apiBase = this.getAttribute("data-api-base") || "";
      this.dataRegion = this.getAttribute("data-data-region") || "EU";
      this.innerHTML = "<p>Chargement…</p>";
      this.load();
    }

    async load() {
      try {
        const pollRes = await fetch(`${this.apiBase}/polls/${this.pollId}`, {
          headers: { "X-Data-Region": this.dataRegion },
        });
        if (!pollRes.ok) throw new Error(await pollRes.text());
        this.poll = await pollRes.json();

        const res = await fetch(`${this.apiBase}/polls/${this.pollId}/attendance`, {
          headers: { "X-Data-Region": this.dataRegion },
        });
        if (!res.ok) throw new Error(await res.text());
        this.attendance = await res.json();
        this.render();
      } catch (e) {
        this.innerHTML = `<p class="error">${escapeHtml(e.message)}</p>`;
      }
    }

    render() {
      const voters = this.attendance.voters || [];
      const isPublic = this.attendance.voterMode === "public";
      const pollName = this.poll?.name || this.pollId;

      let rows = "";
      if (voters.length === 0) {
        rows = `<tr><td colspan="${isPublic ? 4 : 3}">Aucun votant pour le moment.</td></tr>`;
      } else {
        rows = voters
          .map((v) => {
            const platform =
              PLATFORM_LABELS[v.platform] || v.platform || "—";
            const date = v.participatedAt
              ? formatDateTime(v.participatedAt)
              : "—";
            const ballotCell = isPublic
              ? `<td>${this.renderGrades(v.grades)}</td>`
              : "";
            return `<tr>
              <td>${escapeHtml(v.displayName || "Anonyme")}</td>
              <td>${escapeHtml(platform)}</td>
              <td>${escapeHtml(date)}</td>
              ${ballotCell}
            </tr>`;
          })
          .join("");
      }

      const ballotHeader = isPublic ? "<th>Bulletin</th>" : "";

      this.innerHTML = `
        <article class="sondage-attendance">
          <header class="attendance-header">
            <h2>${escapeHtml(pollName)}</h2>
            <p class="meta">
              Mode ${isPublic ? "public" : "anonyme"} —
              ${voters.length} votant${voters.length !== 1 ? "s" : ""}
            </p>
            ${
              !isPublic
                ? `<p class="hint">En mode anonyme, seuls les noms sont affichés (pas d'identifiant).</p>`
                : ""
            }
          </header>
          <div class="attendance-table-wrap">
            <table class="attendance-table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Plateforme</th>
                  <th>Date</th>
                  ${ballotHeader}
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          <footer class="attendance-footer">
            <button type="button" id="refresh-attendance">Actualiser</button>
          </footer>
        </article>
      `;

      this.querySelector("#refresh-attendance").addEventListener("click", () =>
        this.load()
      );
    }

    renderGrades(grades) {
      if (!grades || grades.length === 0) return "—";
      return grades
        .map((g) => {
          const label = g.gradeLabel || this.formatGradeLabel(g.grade);
          return `<span class="grade-entry">${escapeHtml(g.itemLabel || g.itemId)} : <strong>${escapeHtml(label)}</strong></span>`;
        })
        .join("<br>");
    }

    formatGradeLabel(grade) {
      const labels = this.poll?.gradeLabels || [];
      const min = this.poll?.gradeMin ?? 1;
      const index = grade - min;
      return labels[index] || String(grade);
    }
  }

  if (!customElements.get(TAG)) {
    customElements.define(TAG, SondageAttendanceWidget);
  }
})();
