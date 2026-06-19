/**
 * Sélecteur de sondage (recherche + pagination par 10).
 * mode: "vote" (ouverts uniquement) | "results" (tous).
 */
(function () {
  const PAGE_SIZE = 10;

  const PLATFORM_LABELS = {
    mock: "mock",
    google: "Google",
    apple: "Apple",
    facebook: "Meta",
    linkedin: "LinkedIn",
    x: "X",
  };

  const CSS = `
    .sondage-poll-picker {
      margin: 1rem 0 2rem;
    }
    .sondage-poll-picker .picker-intro {
      color: var(--text-muted);
      margin: 0 0 1rem;
    }
    .sondage-poll-picker .picker-search {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }
    .sondage-poll-picker .picker-search input {
      flex: 1;
      min-width: 12rem;
      padding: 0.5rem 0.65rem;
      border: 1px solid var(--input-border);
      border-radius: 6px;
      font: inherit;
      background: var(--input-bg);
      color: var(--input-text);
    }
    .sondage-poll-picker .picker-search button {
      padding: 0.5rem 1rem;
      border: none;
      border-radius: 6px;
      background: var(--primary);
      color: var(--on-primary);
      font: inherit;
      cursor: pointer;
    }
    .sondage-poll-picker .picker-search button:hover {
      background: var(--primary-hover);
    }
    .sondage-poll-picker .picker-meta {
      font-size: 0.85rem;
      color: var(--text-subtle);
      margin: 0 0 0.75rem;
    }
    .sondage-poll-picker .picker-list {
      list-style: none;
      margin: 0;
      padding: 0;
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }
    .sondage-poll-picker .picker-item {
      border-bottom: 1px solid var(--border);
    }
    .sondage-poll-picker .picker-item:last-child {
      border-bottom: none;
    }
    .sondage-poll-picker .picker-item button {
      display: block;
      width: 100%;
      text-align: left;
      padding: 0.85rem 1rem;
      border: none;
      background: var(--bg);
      color: var(--text);
      font: inherit;
      cursor: pointer;
    }
    .sondage-poll-picker .picker-item button:hover {
      background: var(--surface-hover);
    }
    .sondage-poll-picker .picker-item-name {
      font-weight: 600;
      color: var(--text);
      margin-bottom: 0.25rem;
    }
    .sondage-poll-picker .picker-item-meta {
      font-size: 0.8rem;
      color: var(--text-subtle);
      line-height: 1.4;
    }
    .sondage-poll-picker .picker-status {
      display: inline-block;
      margin-left: 0.35rem;
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      font-size: 0.72rem;
      font-weight: 600;
    }
    .sondage-poll-picker .picker-status--open {
      background: var(--status-open-bg);
      color: var(--status-open-text);
    }
    .sondage-poll-picker .picker-status--soon {
      background: var(--status-soon-bg);
      color: var(--status-soon-text);
    }
    .sondage-poll-picker .picker-status--ended {
      background: var(--status-ended-bg);
      color: var(--status-ended-text);
    }
    .sondage-poll-picker .picker-empty {
      padding: 1.25rem;
      text-align: center;
      color: var(--text-subtle);
      border: 1px dashed var(--border-strong);
      border-radius: 8px;
    }
    .sondage-poll-picker .picker-pager {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      margin-top: 1rem;
      flex-wrap: wrap;
    }
    .sondage-poll-picker .picker-pager button {
      padding: 0.4rem 0.85rem;
      border: 1px solid var(--btn-secondary-border);
      border-radius: 6px;
      background: var(--btn-secondary-bg);
      color: var(--btn-secondary-text);
      font: inherit;
      cursor: pointer;
    }
    .sondage-poll-picker .picker-pager button:hover:not(:disabled) {
      background: var(--surface-hover);
    }
    .sondage-poll-picker .picker-pager button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .sondage-poll-picker .picker-error {
      color: var(--error);
      margin: 0.5rem 0;
    }
  `;

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function pollStatus(poll) {
    if (poll.closedAt) return { label: "Terminé", cls: "ended" };
    const now = Date.now();
    const start = poll.startsAt ? new Date(poll.startsAt).getTime() : 0;
    const end = poll.endsAt ? new Date(poll.endsAt).getTime() : Infinity;
    if (now < start) return { label: "À venir", cls: "soon" };
    if (now >= end) return { label: "Terminé", cls: "ended" };
    return { label: "Ouvert", cls: "open" };
  }

  function formatWindow(poll) {
    if (!window.SondageDateTime) return "";
    return window.SondageDateTime.formatPollWindow(poll.startsAt, poll.endsAt);
  }

  function injectStyles() {
    if (document.getElementById("sondage-poll-picker-styles")) return;
    const style = document.createElement("style");
    style.id = "sondage-poll-picker-styles";
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  window.SondagePollPicker = {
    mount(options) {
      injectStyles();
      const host = options.host;
      const mode = options.mode === "results" ? "results" : "vote";
      const targetPage =
        options.targetPage || (mode === "results" ? "results.html" : "vote.html");
      const apiBase = (options.apiBase || window.location.origin).replace(
        /\/$/,
        ""
      );

      let search = "";
      let offset = 0;
      let debounceTimer = null;

      host.innerHTML =
        '<div class="sondage-poll-picker" id="sondage-poll-picker-root"></div>';
      const root = document.getElementById("sondage-poll-picker-root");

      function navigateToPoll(pollId) {
        if (window.SondageShell && window.SondageShell.setActivePollId) {
          window.SondageShell.setActivePollId(pollId);
        }
        const url =
          targetPage +
          "?pollId=" +
          encodeURIComponent(pollId);
        window.location.href = url;
      }

      async function load() {
        const params = new URLSearchParams({
          offset: String(offset),
          limit: String(PAGE_SIZE),
        });
        if (search.trim()) params.set("search", search.trim());
        if (mode === "vote") params.set("activeOnly", "true");

        root.innerHTML =
          '<p class="picker-intro">Chargement des sondages…</p>';

        try {
          const res = await fetch(apiBase + "/polls?" + params.toString(), {
            headers: { "X-Data-Region": "EU" },
          });
          if (!res.ok) throw new Error(await res.text());
          const data = await res.json();
          render(data);
        } catch (e) {
          root.innerHTML =
            '<p class="picker-error">Impossible de charger les sondages : ' +
            escapeHtml(e.message || String(e)) +
            "</p>";
        }
      }

      function render(data) {
        const polls = data.polls || [];
        const total = data.total ?? 0;
        const page = Math.floor(offset / PAGE_SIZE) + 1;
        const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

        const intro =
          mode === "vote"
            ? "Choisissez un sondage ouvert au vote."
            : "Choisissez un sondage pour afficher les résultats.";

        let listHtml = "";
        if (polls.length === 0) {
          listHtml =
            '<div class="picker-empty">Aucun sondage trouvé.</div>';
        } else {
          listHtml =
            '<ul class="picker-list">' +
            polls
              .map((poll) => {
                const st = pollStatus(poll);
                const platform =
                  PLATFORM_LABELS[poll.platform] || poll.platform;
                return (
                  '<li class="picker-item">' +
                  '<button type="button" data-poll-id="' +
                  escapeHtml(poll.id) +
                  '">' +
                  '<div class="picker-item-name">' +
                  escapeHtml(poll.name) +
                  '<span class="picker-status picker-status--' +
                  st.cls +
                  '">' +
                  escapeHtml(st.label) +
                  "</span></div>" +
                  '<div class="picker-item-meta">' +
                  escapeHtml(platform) +
                  " · " +
                  escapeHtml(formatWindow(poll)) +
                  "</div></button></li>"
                );
              })
              .join("") +
            "</ul>";
        }

        root.innerHTML =
          '<p class="picker-intro">' +
          escapeHtml(intro) +
          "</p>" +
          '<div class="picker-search">' +
          '<input type="search" id="sondage-picker-q" placeholder="Rechercher par nom…" value="' +
          escapeHtml(search) +
          '" />' +
          '<button type="button" id="sondage-picker-search-btn">Rechercher</button>' +
          "</div>" +
          '<p class="picker-meta">' +
          total +
          " sondage(s) — page " +
          page +
          " / " +
          pageCount +
          "</p>" +
          listHtml +
          '<div class="picker-pager">' +
          '<button type="button" id="sondage-picker-prev"' +
          (offset <= 0 ? " disabled" : "") +
          ">Précédent</button>" +
          '<button type="button" id="sondage-picker-next"' +
          (offset + PAGE_SIZE >= total ? " disabled" : "") +
          ">Suivant</button>" +
          "</div>";

        root.querySelectorAll("[data-poll-id]").forEach((btn) => {
          btn.addEventListener("click", () => {
            navigateToPoll(btn.getAttribute("data-poll-id"));
          });
        });

        const qInput = document.getElementById("sondage-picker-q");
        const searchBtn = document.getElementById("sondage-picker-search-btn");
        const prevBtn = document.getElementById("sondage-picker-prev");
        const nextBtn = document.getElementById("sondage-picker-next");

        function runSearch() {
          search = qInput.value;
          offset = 0;
          load();
        }

        searchBtn.addEventListener("click", runSearch);
        qInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") runSearch();
        });
        qInput.addEventListener("input", () => {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(runSearch, 400);
        });

        prevBtn.addEventListener("click", () => {
          offset = Math.max(0, offset - PAGE_SIZE);
          load();
        });
        nextBtn.addEventListener("click", () => {
          offset += PAGE_SIZE;
          load();
        });
      }

      load();
    },
  };
})();
