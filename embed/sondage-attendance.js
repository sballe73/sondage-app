/**
 * Feuille d'émargement — liste paginée des votants (créateur uniquement).
 */
(function () {
  const DT = window.SondageDateTime;
  const formatDateTime = (iso) => DT.formatDateTime(iso);

  const TAG = "sondage-attendance-widget";
  const PAGE_SIZE = 20;

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
      this.apiBase = (this.getAttribute("data-api-base") || "").replace(
        /\/$/,
        ""
      );
      this.dataRegion = this.getAttribute("data-data-region") || "EU";
      this.authToken = this.getAttribute("data-auth-token") || "";
      this.embedded = this.getAttribute("data-embedded") === "true";
      this.offset = 0;
      this.innerHTML = "<p>Chargement…</p>";
      this.load();
    }

    _requestHeaders() {
      const headers = { "X-Data-Region": this.dataRegion };
      if (this.authToken) {
        headers.Authorization = `Bearer ${this.authToken}`;
      }
      return headers;
    }

    attendanceUrl(params) {
      const q = new URLSearchParams(params);
      return `${this.apiBase}/polls/${this.pollId}/attendance?${q}`;
    }

    async load(nextOffset) {
      if (typeof nextOffset === "number") {
        this.offset = Math.max(0, nextOffset);
      }
      try {
        const pollRes = await fetch(`${this.apiBase}/polls/${this.pollId}`, {
          headers: { "X-Data-Region": this.dataRegion },
        });
        if (!pollRes.ok) throw new Error(await pollRes.text());
        this.poll = await pollRes.json();

        const res = await fetch(
          this.attendanceUrl({
            offset: String(this.offset),
            limit: String(PAGE_SIZE),
          }),
          { headers: this._requestHeaders() }
        );
        if (!res.ok) throw new Error(await res.text());
        this.attendance = await res.json();
        this.render();
      } catch (e) {
        this.innerHTML = `<p class="error">${escapeHtml(e.message)}</p>`;
      }
    }

    async downloadTsv() {
      const btn = this.querySelector("#download-tsv");
      const filename = `emargement-${this.pollId}.tsv`;
      const originalLabel = btn?.textContent ?? "Télécharger TSV";

      if (btn) {
        btn.disabled = true;
        btn.textContent = "Préparation…";
      }

      try {
        if (typeof window.showSaveFilePicker === "function") {
          const handle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: [
              {
                description: "TSV",
                accept: { "text/tab-separated-values": [".tsv"] },
              },
            ],
          });
          if (btn) btn.textContent = "Export en cours…";
          const res = await fetch(this.attendanceUrl({ format: "tsv" }), {
            headers: this._requestHeaders(),
          });
          if (!res.ok) throw new Error(await res.text());
          if (!res.body) throw new Error("Réponse vide");
          const writable = await handle.createWritable();
          await res.body.pipeTo(writable);
          return;
        }

        const linkRes = await fetch(
          `${this.apiBase}/polls/${this.pollId}/attendance/download-url`,
          { method: "POST", headers: this._requestHeaders() }
        );
        if (!linkRes.ok) throw new Error(await linkRes.text());
        const { token } = await linkRes.json();
        const downloadUrl = this.attendanceUrl({
          format: "tsv",
          dl: token,
        });
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (e) {
        if (e?.name === "AbortError") return;
        alert(e.message || String(e));
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = originalLabel;
        }
      }
    }

    render() {
      const voters = this.attendance.voters || [];
      const total = this.attendance.total ?? voters.length;
      const isPublic = this.attendance.voterMode === "public";
      const pollName = this.poll?.name || this.pollId;
      const pageStart = total === 0 ? 0 : this.offset + 1;
      const pageEnd = this.offset + voters.length;

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
      const hasPrev = this.offset > 0;
      const hasNext = this.offset + PAGE_SIZE < total;
      const titleBlock = this.embedded
        ? ""
        : `<header class="attendance-header"><h2>${escapeHtml(pollName)}</h2></header>`;

      this.innerHTML = `
        <article class="sondage-attendance">
          ${titleBlock}
          <div class="attendance-meta">
            <p class="meta">
              Mode ${isPublic ? "public" : "anonyme"} —
              ${total} votant${total !== 1 ? "s" : ""}
              ${
                total > 0
                  ? ` — affichage ${pageStart}–${pageEnd}`
                  : ""
              }
            </p>
            ${
              !isPublic
                ? `<p class="hint">En mode anonyme, seuls les noms sont affichés (pas d'identifiant).</p>`
                : ""
            }
          </div>
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
            <div class="attendance-actions">
              <button type="button" id="prev-page" ${hasPrev ? "" : "disabled"}>Précédent</button>
              <button type="button" id="next-page" ${hasNext ? "" : "disabled"}>Suivant</button>
              <button type="button" id="download-tsv">Télécharger TSV</button>
              <button type="button" id="refresh-attendance">Actualiser</button>
            </div>
          </footer>
        </article>
      `;

      this.querySelector("#refresh-attendance").addEventListener("click", () =>
        this.load(this.offset)
      );
      this.querySelector("#download-tsv").addEventListener("click", () =>
        this.downloadTsv()
      );
      const prev = this.querySelector("#prev-page");
      if (prev) {
        prev.addEventListener("click", () =>
          this.load(this.offset - PAGE_SIZE)
        );
      }
      const next = this.querySelector("#next-page");
      if (next) {
        next.addEventListener("click", () =>
          this.load(this.offset + PAGE_SIZE)
        );
      }
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
