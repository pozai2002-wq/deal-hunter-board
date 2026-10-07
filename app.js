/**
 * Leo's Deal Hunter — client for static deals.json board
 * Polls deals.json every 30s; filters / search / sort client-side.
 */

(() => {
  "use strict";

  const POLL_MS = 30_000;
  const DEALS_URL = "deals.json";

  const ATL_RANK = { atl: 0, "near-atl": 1, sale: 2, stale: 3 };
  const ATL_LABEL = {
    atl: "ATL",
    "near-atl": "Near-ATL",
    sale: "Sale",
    stale: "Stale",
  };

  /** Prefer atlStatus; fall back to legacy atl. */
  function atlStatusOf(deal) {
    return deal.atlStatus || deal.atl || "near-atl";
  }

  /**
   * Leo requirement: every card shows ATL or Near-ATL AND the dollar ATL amount.
   * e.g. "ATL $55.99" or "Near-ATL · lowest $52"
   */
  function atlBadgeText(deal) {
    const status = atlStatusOf(deal);
    const label = ATL_LABEL[status] || status;
    const raw = deal.atlPrice;
    const hasPrice = raw != null && Number.isFinite(Number(raw));
    if (hasPrice) {
      const money = formatMoney(Number(raw));
      if (status === "atl") return `ATL ${money}`;
      if (status === "near-atl") return `Near-ATL · lowest ${money}`;
      return `${label} · lowest ${money}`;
    }
    if (status === "atl" || status === "near-atl") return `${label} · ATL TBD`;
    return label;
  }

  const els = {
    grid: document.getElementById("dealGrid"),
    empty: document.getElementById("emptyState"),
    resultsCount: document.getElementById("resultsCount"),
    refreshMeta: document.getElementById("refreshMeta"),
    livePill: document.getElementById("livePill"),
    search: document.getElementById("searchInput"),
    sort: document.getElementById("sortSelect"),
    chips: document.getElementById("categoryChips"),
    copyBtn: document.getElementById("copyLinkBtn"),
    resetBtn: document.getElementById("resetFiltersBtn"),
    toast: document.getElementById("toast"),
  };

  let state = {
    data: null,
    category: "all",
    query: "",
    sort: "pct-desc",
    lastFetchOk: false,
    lastRefreshAt: null,
    pollTimer: null,
  };

  function pctOff(deal) {
    if (!deal.list || deal.list <= 0) return 0;
    return ((deal.list - deal.price) / deal.list) * 100;
  }

  function formatMoney(n) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(n);
  }

  function formatTime(iso) {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleString("en-US", {
        timeZone: "America/Los_Angeles",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      });
    } catch {
      return iso;
    }
  }

  function relativeAgo(date) {
    const sec = Math.round((Date.now() - date.getTime()) / 1000);
    if (sec < 5) return "just now";
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    return `${hr}h ago`;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function filteredDeals() {
    if (!state.data?.deals) return [];
    const q = state.query.trim().toLowerCase();
    let list = state.data.deals.filter((d) => {
      if (state.category !== "all" && d.category !== state.category) return false;
      if (!q) return true;
      const hay = `${d.name} ${d.category} ${d.badge || ""} ${d.note || ""} ${d.atlNote || ""} ${d.atlStatus || d.atl || ""} ${d.id}`.toLowerCase();
      return hay.includes(q);
    });

    list = [...list].sort((a, b) => {
      switch (state.sort) {
        case "price-asc":
          return a.price - b.price;
        case "price-desc":
          return b.price - a.price;
        case "atl":
          return (ATL_RANK[atlStatusOf(a)] ?? 9) - (ATL_RANK[atlStatusOf(b)] ?? 9) || pctOff(b) - pctOff(a);
        case "pct-desc":
        default:
          return pctOff(b) - pctOff(a);
      }
    });

    return list;
  }

  function renderCard(deal, updatedAt, index) {
    const off = pctOff(deal);
    const atlClass = atlStatusOf(deal);
    const atlText = atlBadgeText(deal);
    const delay = Math.min(index * 40, 280);
    const atlTitle = deal.atlNote
      ? escapeHtml(deal.atlNote)
      : escapeHtml(atlText);

    const img = deal.image
      ? `<div class="card-media"><img src="${escapeHtml(deal.image)}" alt="${escapeHtml(deal.name)}" loading="lazy" width="400" height="400" /></div>`
      : `<div class="card-media card-media-empty" aria-hidden="true"></div>`;

    return `
      <article class="deal-card" style="animation-delay:${delay}ms" data-id="${escapeHtml(deal.id)}">
        ${img}
        <div class="card-top">
          <span class="atl-badge ${escapeHtml(atlClass)}" title="${atlTitle}">${escapeHtml(atlText)}</span>
          ${deal.badge ? `<span class="deal-badge" title="${escapeHtml(deal.badge)}">${escapeHtml(deal.badge)}</span>` : ""}
        </div>
        <h2 class="deal-name">${escapeHtml(deal.name)}</h2>
        <div class="deal-meta">
          <span class="category-tag">${escapeHtml(deal.category)}</span>
          ${deal.atlPrice != null && Number.isFinite(Number(deal.atlPrice))
            ? `<span class="atl-price-tag" title="${atlTitle}">Lowest ${formatMoney(Number(deal.atlPrice))}</span>`
            : `<span class="atl-price-tag atl-price-tbd">ATL TBD</span>`}
        </div>
        ${deal.note ? `<p class="deal-note">${escapeHtml(deal.note)}</p>` : ""}
        <div class="price-row">
          <span class="price-live">${formatMoney(deal.price)}</span>
          ${deal.list && deal.list > deal.price ? `<span class="price-list">${formatMoney(deal.list)}</span>
          <span class="pct-off">${off.toFixed(0)}% off</span>` : ""}
        </div>
        <div class="card-footer">
          <a class="btn btn-amazon" href="${escapeHtml(deal.url)}" target="_blank" rel="noopener noreferrer">
            View on Amazon ↗
          </a>
          <span class="updated-time">Prices as of ${escapeHtml(formatTime(updatedAt))}</span>
        </div>
      </article>
    `;
  }

  function render() {
    const deals = filteredDeals();
    const updatedAt = state.data?.updatedAt || "";

    if (!deals.length) {
      els.grid.innerHTML = "";
      els.empty.classList.remove("hidden");
      els.resultsCount.textContent = state.data
        ? "0 deals shown"
        : "";
    } else {
      els.empty.classList.add("hidden");
      els.grid.innerHTML = deals.map((d, i) => renderCard(d, updatedAt, i)).join("");
      els.resultsCount.textContent = `${deals.length} deal${deals.length === 1 ? "" : "s"} shown`;
    }

    updateRefreshMeta();
  }

  function updateRefreshMeta() {
    const parts = [];
    if (state.data?.updatedAt) {
      parts.push(`Deal data: ${formatTime(state.data.updatedAt)}`);
    }
    if (state.data?.eventEnds) {
      parts.push(`Event ends ${formatTime(state.data.eventEnds)}`);
    }
    if (state.lastRefreshAt) {
      parts.push(`Board refreshed ${relativeAgo(state.lastRefreshAt)}`);
    }
    els.refreshMeta.textContent = parts.join(" · ") || "Loading deals…";
  }

  function setLive(ok) {
    state.lastFetchOk = ok;
    els.livePill.classList.toggle("stale", !ok);
    els.livePill.querySelector(".live-label").textContent = ok ? "Live" : "Offline";
  }

  async function fetchDeals({ silent = false } = {}) {
    try {
      const url = `${DEALS_URL}?t=${Date.now()}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data || !Array.isArray(data.deals)) throw new Error("Invalid deals.json");
      state.data = data;
      state.lastRefreshAt = new Date();
      setLive(true);
      render();
    } catch (err) {
      console.warn("Failed to load deals.json:", err);
      if (window.__SEED_DEALS__ && !state.data) {
        state.data = window.__SEED_DEALS__;
        state.lastRefreshAt = new Date();
        setLive(true);
        render();
        return;
      }
      setLive(false);
      if (!silent && !state.data) {
        els.refreshMeta.textContent =
          "Could not load deals.json — open via a local server (see serve.sh).";
        els.resultsCount.textContent = "";
      } else {
        updateRefreshMeta();
      }
    }
  }

  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.remove("hidden");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => els.toast.classList.add("hidden"), 2200);
  }

  async function copyLink() {
    const url = window.location.href.split("#")[0];
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied");
    } catch {
      // Fallback for older browsers / file://
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        showToast("Link copied");
      } catch {
        showToast("Copy failed — copy the URL bar");
      }
      document.body.removeChild(ta);
    }
  }

  function bindControls() {
    els.chips.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      state.category = btn.dataset.category || "all";
      els.chips.querySelectorAll(".chip").forEach((c) => {
        c.classList.toggle("active", c === btn);
      });
      render();
    });

    let searchTimer;
    els.search.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.query = els.search.value;
        render();
      }, 120);
    });

    els.sort.addEventListener("change", () => {
      state.sort = els.sort.value;
      render();
    });

    els.copyBtn.addEventListener("click", copyLink);

    els.resetBtn.addEventListener("click", () => {
      state.category = "all";
      state.query = "";
      state.sort = "pct-desc";
      els.search.value = "";
      els.sort.value = "pct-desc";
      els.chips.querySelectorAll(".chip").forEach((c) => {
        c.classList.toggle("active", c.dataset.category === "all");
      });
      render();
    });

    // Keep “board refreshed Xm ago” fresh
    setInterval(updateRefreshMeta, 15_000);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        fetchDeals({ silent: true });
      }
    });
  }

  function startPolling() {
    clearInterval(state.pollTimer);
    state.pollTimer = setInterval(() => fetchDeals({ silent: true }), POLL_MS);
  }

  bindControls();
  if (location.protocol === 'file:' && window.__SEED_DEALS__) {
    state.data = window.__SEED_DEALS__;
    state.lastRefreshAt = new Date();
    setLive(true);
    render();
  } else {
    fetchDeals();
    startPolling();
  }
})();
