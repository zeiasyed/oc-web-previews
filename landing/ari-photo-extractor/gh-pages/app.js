(function () {
  "use strict";

  const STORAGE_KEY = "ariPhotoExtractorAuth";
  const PAGE_SIZE = 4;
  const PRINT_PER_PAGE = 8;

  const $ = (id) => document.getElementById(id);

  const state = {
    auth: null,
    batch: null,
    cars: [],
    page: 0,
    showKeptOnly: false,
    dragPhotoId: null,
  };

  function loadAuth() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveAuth(auth) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
    state.auth = auth;
  }

  function clearAuth() {
    localStorage.removeItem(STORAGE_KEY);
    state.auth = null;
  }

  function apiBase() {
    return ($("api-base").value || "").replace(/\/$/, "");
  }

  async function api(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (state.auth?.token) headers.Authorization = "Bearer " + state.auth.token;
    const res = await fetch(apiBase() + path, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText || "Request failed");
    return data;
  }

  function showLogin(msg) {
    $("login-view").classList.remove("hidden");
    $("app-view").classList.add("hidden");
    const err = $("login-error");
    if (msg) {
      err.textContent = msg;
      err.classList.remove("hidden");
    } else {
      err.classList.add("hidden");
    }
  }

  function showApp() {
    $("login-view").classList.add("hidden");
    $("app-view").classList.remove("hidden");
    $("user-label").textContent = state.auth?.userName ? " · " + state.auth.userName : "";
    defaultDates();
    showScreen("batches");
    loadBatches();
  }

  function showScreen(name) {
    ["ari", "batches", "import", "review"].forEach((s) => {
      const el = $("screen-" + s);
      if (el) el.classList.toggle("hidden", s !== name);
    });
  }

  function defaultDates() {
    const to = new Date();
    const from = new Date();
    from.setMonth(from.getMonth() - 3);
    $("date-to").value = to.toISOString().slice(0, 10);
    $("date-from").value = from.toISOString().slice(0, 10);
  }

  function photoMap(car) {
    return Object.fromEntries((car.photos || []).map((p) => [p.id, p]));
  }

  function ensureReview(car) {
    if (!car.review || typeof car.review !== "object") {
      car.review = { unsorted: [], before: [], after: [], starredBefore: null, starredAfter: null };
    }
    ["unsorted", "before", "after"].forEach((k) => {
      if (!Array.isArray(car.review[k])) car.review[k] = [];
    });
    return car.review;
  }

  function syncReviewIds(car) {
    const review = ensureReview(car);
    const allIds = (car.photos || []).map((p) => p.id);
    const assigned = new Set([...review.before, ...review.after]);
    review.unsorted = allIds.filter((id) => !assigned.has(id));
    review.before = review.before.filter((id) => allIds.includes(id));
    review.after = review.after.filter((id) => allIds.includes(id));
    if (review.starredBefore && !review.before.includes(review.starredBefore)) review.starredBefore = null;
    if (review.starredAfter && !review.after.includes(review.starredAfter)) review.starredAfter = null;
  }

  async function doLogin() {
    const userName = $("user-name").value.trim();
    const shopPassword = $("shop-password").value;
    if (!apiBase() || !userName || !shopPassword) {
      showLogin("Enter API URL, your name, and shop password.");
      return;
    }
    $("login-btn").disabled = true;
    try {
      const data = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({ userName, shopPassword }),
      });
      saveAuth({ token: data.token, userName: data.userName, apiBase: apiBase() });
      showApp();
    } catch (e) {
      showLogin(e.message);
    } finally {
      $("login-btn").disabled = false;
    }
  }

  async function saveAriCreds() {
    const email = $("ari-email").value.trim();
    const password = $("ari-password").value;
    if (!email || !password) {
      $("ari-status").textContent = "Enter ARI email and password.";
      return;
    }
    $("ari-save-btn").disabled = true;
    try {
      await api("/api/ari/credentials", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      $("ari-status").textContent = "ARI credentials saved (encrypted).";
      await loadClientOptions();
    } catch (e) {
      $("ari-status").textContent = e.message;
    } finally {
      $("ari-save-btn").disabled = false;
    }
  }

  async function loadClientOptions() {
    try {
      const data = await api("/api/ari/clients");
      const list = $("client-options");
      list.innerHTML = "";
      (data.clients || []).forEach((name) => {
        const opt = document.createElement("option");
        opt.value = name;
        list.appendChild(opt);
      });
    } catch {
      /* ARI not connected yet */
    }
  }

  async function loadBatches() {
    $("batch-list").innerHTML = "";
    try {
      const data = await api("/api/batches");
      const batches = data.batches || [];
      $("batches-empty").classList.toggle("hidden", batches.length > 0);
      batches.forEach((b) => {
        const card = document.createElement("div");
        card.className = "batch-card";
        card.innerHTML =
          "<strong>" + escapeHtml(b.name) + "</strong>" +
          "<div class='muted'>" + escapeHtml(b.client_name || "All clients") +
          " · " + escapeHtml(b.date_from || "?") + " – " + escapeHtml(b.date_to || "?") + "</div>" +
          "<div class='muted'>Updated " + escapeHtml(fmtDate(b.updated_at)) + "</div>";
        card.addEventListener("click", () => openBatch(b.id, b.name));
        $("batch-list").appendChild(card);
      });
    } catch (e) {
      $("batches-empty").classList.remove("hidden");
      $("batches-empty").textContent = e.message;
    }
  }

  async function runImport() {
    const name = $("batch-name").value.trim();
    if (!name) {
      $("import-status").textContent = "Enter a batch name.";
      return;
    }
    $("import-btn").disabled = true;
    $("import-status").textContent = "Importing from ARI… this may take a minute.";
    try {
      const data = await api("/api/batches", {
        method: "POST",
        body: JSON.stringify({
          name,
          clientName: $("client-filter").value.trim(),
          dateFrom: $("date-from").value,
          dateTo: $("date-to").value,
        }),
      });
      $("import-status").textContent =
        "Imported " + data.imported + " invoices (" + data.withPhotos + " with photos).";
      await openBatch(data.batchId, name);
    } catch (e) {
      $("import-status").textContent = e.message;
    } finally {
      $("import-btn").disabled = false;
    }
  }

  async function openBatch(batchId, title) {
    const data = await api("/api/batches/" + batchId);
    state.batch = data.batch;
    state.cars = (data.cars || []).map((car) => {
      syncReviewIds(car);
      return car;
    });
    state.page = 0;
    $("review-title").textContent = title || data.batch.name;
    $("review-meta").textContent =
      (data.batch.client_name || "All clients") + " · " +
      (data.batch.date_from || "") + " – " + (data.batch.date_to || "");
    showScreen("review");
    renderReview();
  }

  function visibleCars() {
    return state.cars.filter((c) => !state.showKeptOnly || c.kept);
  }

  function renderReview() {
    const cars = visibleCars();
    const totalPages = Math.max(1, Math.ceil(cars.length / PAGE_SIZE));
    if (state.page >= totalPages) state.page = totalPages - 1;
    const slice = cars.slice(state.page * PAGE_SIZE, state.page * PAGE_SIZE + PAGE_SIZE);
    const grid = $("review-grid");
    grid.innerHTML = "";

    slice.forEach((car) => {
      syncReviewIds(car);
      const map = photoMap(car);
      const card = document.createElement("article");
      card.className = "car-card" + (car.kept ? " kept" : "");
      card.dataset.carId = car.id;

      const head = document.createElement("div");
      head.className = "car-head";
      head.innerHTML =
        "<label><input type='checkbox' " + (car.kept ? "checked" : "") + " data-keep></label>" +
        "<div class='car-meta'><strong>" + escapeHtml(ymLabel(car)) + "</strong>" +
        "<span>VIN: " + escapeHtml(car.vin || "—") + "</span>" +
        "<span>Inv #" + escapeHtml(car.invoice_number || "—") + "</span></div>";
      card.appendChild(head);

      ["unsorted", "before", "after"].forEach((binKey) => {
        const bin = document.createElement("div");
        bin.className = "bin " + binKey;
        bin.dataset.bin = binKey;
        bin.dataset.carId = car.id;
        bin.innerHTML = "<h4>" + binKey + "</h4>";
        const thumbs = document.createElement("div");
        thumbs.className = "thumbs";
        ensureReview(car)[binKey].forEach((pid) => {
          const p = map[pid];
          if (!p) return;
          thumbs.appendChild(thumbEl(car, p, binKey));
        });
        bin.appendChild(thumbs);
        wireDropZone(bin, car);
        card.appendChild(bin);
      });

      head.querySelector("[data-keep]").addEventListener("change", (e) => {
        car.kept = e.target.checked;
        card.classList.toggle("kept", car.kept);
      });

      grid.appendChild(card);
    });

    $("page-label").textContent = "Page " + (state.page + 1) + " of " + totalPages;
    $("page-prev").disabled = state.page === 0;
    $("page-next").disabled = state.page >= totalPages - 1;
  }

  function thumbEl(car, photo, binKey) {
    const review = ensureReview(car);
    const el = document.createElement("div");
    el.className = "thumb";
    el.draggable = true;
    el.dataset.photoId = photo.id;
    el.dataset.carId = car.id;
    const starred =
      (binKey === "before" && review.starredBefore === photo.id) ||
      (binKey === "after" && review.starredAfter === photo.id);
    if (starred) el.classList.add("starred");

    const img = document.createElement("img");
    img.src = photo.url;
    img.alt = "Photo";
    el.appendChild(img);

    if (binKey === "before" || binKey === "after") {
      const star = document.createElement("button");
      star.type = "button";
      star.className = "star-btn" + (starred ? " on" : "");
      star.textContent = "★";
      star.title = "Use for print";
      star.addEventListener("click", (e) => {
        e.stopPropagation();
        if (binKey === "before") {
          review.starredBefore = review.starredBefore === photo.id ? null : photo.id;
        } else {
          review.starredAfter = review.starredAfter === photo.id ? null : photo.id;
        }
        renderReview();
      });
      el.appendChild(star);
    }

    el.addEventListener("dragstart", () => {
      state.dragPhotoId = photo.id;
      state.dragCarId = car.id;
    });
    return el;
  }

  function wireDropZone(bin, car) {
    bin.addEventListener("dragover", (e) => {
      e.preventDefault();
      bin.classList.add("drag-over");
    });
    bin.addEventListener("dragleave", () => bin.classList.remove("drag-over"));
    bin.addEventListener("drop", (e) => {
      e.preventDefault();
      bin.classList.remove("drag-over");
      if (!state.dragPhotoId || state.dragCarId !== car.id) return;
      movePhoto(car, state.dragPhotoId, bin.dataset.bin);
      renderReview();
    });
  }

  function movePhoto(car, photoId, targetBin) {
    const review = ensureReview(car);
    ["unsorted", "before", "after"].forEach((k) => {
      review[k] = review[k].filter((id) => id !== photoId);
    });
    if (!review[targetBin].includes(photoId)) review[targetBin].push(photoId);
    if (targetBin !== "before" && review.starredBefore === photoId) review.starredBefore = null;
    if (targetBin !== "after" && review.starredAfter === photoId) review.starredAfter = null;
  }

  async function saveReview() {
    if (!state.batch) return;
    $("save-review-btn").disabled = true;
    try {
      await api("/api/batches/" + state.batch.id + "/cars", {
        method: "PUT",
        body: JSON.stringify({
          cars: state.cars.map((c) => ({
            id: c.id,
            kept: !!c.kept,
            review: ensureReview(c),
          })),
        }),
      });
      $("review-status").textContent = "Saved " + new Date().toLocaleTimeString() + ".";
    } catch (e) {
      $("review-status").textContent = e.message;
    } finally {
      $("save-review-btn").disabled = false;
    }
  }

  async function printPdf() {
    if (!state.batch) return;
    await saveReview();
    const data = await api("/api/batches/" + state.batch.id + "/print");
    const cars = (data.cars || []).filter((c) => c.beforeUrl || c.afterUrl);
    if (!cars.length) {
      $("review-status").textContent = "No kept cars with starred before/after photos.";
      return;
    }
    buildPrintView(cars, data.batch.name);
    setTimeout(() => window.print(), 400);
  }

  function buildPrintView(cars, title) {
    const root = $("print-root");
    root.innerHTML = "";
    root.classList.add("print-mode");
    for (let i = 0; i < cars.length; i += PRINT_PER_PAGE) {
      const pageCars = cars.slice(i, i + PRINT_PER_PAGE);
      const sheet = document.createElement("section");
      sheet.className = "print-sheet";
      sheet.innerHTML =
        "<div style='display:flex;justify-content:space-between;font-size:8pt;margin-bottom:.08in'>" +
        "<strong>" + escapeHtml(title) + "</strong>" +
        "<span>Page " + (Math.floor(i / PRINT_PER_PAGE) + 1) + "</span></div>";
      const grid = document.createElement("div");
      grid.className = "print-grid";
      for (let j = 0; j < PRINT_PER_PAGE; j++) {
        const car = pageCars[j];
        const cell = document.createElement("div");
        cell.className = "print-cell";
        if (!car) {
          cell.innerHTML = "&nbsp;";
        } else {
          cell.innerHTML =
            "<div class='ymm'>" + escapeHtml(ymLabel(car)) + "</div>" +
            "<div class='vin'>" + escapeHtml(car.vin || "") + "</div>" +
            "<div class='print-photos'>" +
            photoBlock(car.beforeUrl, "Before") +
            photoBlock(car.afterUrl, "After") +
            "</div>";
        }
        grid.appendChild(cell);
      }
      sheet.appendChild(grid);
      root.appendChild(sheet);
    }
    window.addEventListener("afterprint", () => {
      root.classList.remove("print-mode");
      root.innerHTML = "";
    }, { once: true });
  }

  function photoBlock(url, label) {
    if (!url) return "<div><span>" + label + "</span><div style='height:1.1in;background:#eee'></div></div>";
    return "<div><img src='" + escapeHtml(url) + "' alt=''><span>" + label + "</span></div>";
  }

  function ymLabel(car) {
    return [car.year, car.make, car.model].filter(Boolean).join(" ") || "Unknown vehicle";
  }

  function fmtDate(iso) {
    if (!iso) return "";
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  $("login-btn").addEventListener("click", doLogin);
  $("shop-password").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
  $("logout-btn").addEventListener("click", () => { clearAuth(); showLogin(); });
  $("ari-save-btn").addEventListener("click", saveAriCreds);
  $("nav-home").addEventListener("click", () => { showScreen("batches"); loadBatches(); });
  $("nav-ari").addEventListener("click", () => showScreen("ari"));
  $("new-batch-btn").addEventListener("click", () => { showScreen("import"); loadClientOptions(); });
  $("import-cancel").addEventListener("click", () => showScreen("batches"));
  $("import-btn").addEventListener("click", runImport);
  $("save-review-btn").addEventListener("click", saveReview);
  $("print-btn").addEventListener("click", printPdf);
  $("show-kept-only").addEventListener("change", (e) => {
    state.showKeptOnly = e.target.checked;
    state.page = 0;
    renderReview();
  });
  $("page-prev").addEventListener("click", () => { state.page--; renderReview(); });
  $("page-next").addEventListener("click", () => { state.page++; renderReview(); });

  const saved = loadAuth();
  if (saved?.apiBase) $("api-base").value = saved.apiBase;
  if (saved?.token) {
    state.auth = saved;
    api("/health").then(showApp).catch(() => showLogin("Session expired. Sign in again."));
  } else {
    showLogin();
  }
})();
