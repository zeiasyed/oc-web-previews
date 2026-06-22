(function () {
  "use strict";

  const STORAGE_KEY = "renuCaliforniaPhotoExtractorAuth";
  const PAGE_SIZE = 2;
  const LOGO_URL = "renu-logo.png";

  const $ = (id) => document.getElementById(id);

  let progressTimer = null;

  const state = {
    auth: null,
    batch: null,
    cars: [],
    page: 0,
    showKeptOnly: false,
    dragPhotoId: null,
    ariUsers: [],
    ariNeedsSubUser: false,
    selectedAriUser: null,
    imageSizes: {},
    imageCache: new Set(),
    printSrc: {},
    thumbByUrl: {},
    compacting: new Set(),
    selectedBatchIds: new Set(),
    tallyCars: [],
    tallyFilters: null,
    tallyDateSort: "desc",
    invParsed: null,
    invSplits: [],
    invGroups: [],
    invSelectedIds: new Set(),
    invMultiSource: false,
    invSource: null,
    invTemplateName: "",
  };

  const PRINT_MAX_PX = 360;
  const PRINT_JPEG_QUALITY = 0.72;

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
    const input = ($("api-base").value || "").replace(/\/$/, "");
    return input || window.location.origin.replace(/\/$/, "");
  }

  async function api(path, options = {}, timeoutMs = 0) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (state.auth?.token) headers.Authorization = "Bearer " + state.auth.token;
    const controller = timeoutMs > 0 ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;
    try {
      const res = await fetch(apiBase() + path, {
        ...options,
        headers,
        signal: controller?.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText || "Request failed");
      return data;
    } catch (e) {
      if (e.name === "AbortError") {
        throw new Error("Import timed out. Try a shorter date range or fewer dealerships.");
      }
      throw e;
    } finally {
      if (timer) clearTimeout(timer);
    }
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
    $("user-label").textContent = state.auth?.userName ? " - " + state.auth.userName : "";
    defaultDates();
    showScreen("batches");
    loadBatches();
  }

  function showScreen(name) {
    ["ari", "batches", "tally", "invoice-gen", "import", "review"].forEach((s) => {
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
    return Object.fromEntries((car.photos || []).map((p) => [String(p.id), p]));
  }

  function showProgress(wrapId, fillId, labelId, label) {
    const wrap = $(wrapId);
    const fill = $(fillId);
    const labelEl = $(labelId);
    wrap.classList.remove("hidden");
    wrap.classList.add("active");
    fill.style.width = "0%";
    labelEl.textContent = label;
    if (progressTimer) clearInterval(progressTimer);
    let pct = 0;
    progressTimer = setInterval(() => {
      pct = Math.min(pct + 1.5, 92);
      fill.style.width = pct + "%";
    }, 180);
    return { wrap, fill, labelEl };
  }

  function finishProgress(wrapId, fillId, labelId, label) {
    if (progressTimer) clearInterval(progressTimer);
    progressTimer = null;
    const fill = $(fillId);
    fill.style.width = "100%";
    if (label) $(labelId).textContent = label;
    setTimeout(() => {
      $(wrapId).classList.add("hidden");
      $(wrapId).classList.remove("active");
      fill.style.width = "0%";
    }, 500);
  }

  function hideProgress(wrapId, fillId) {
    if (progressTimer) clearInterval(progressTimer);
    progressTimer = null;
    $(wrapId).classList.add("hidden");
    $(wrapId).classList.remove("active");
    $(fillId).style.width = "0%";
  }

  function bucketUrls(car) {
    const review = ensureReview(car);
    const map = photoMap(car);
    const beforeUrls = review.before.map((id) => map[String(id)]?.url).filter(Boolean);
    const afterUrls = review.after.map((id) => map[String(id)]?.url).filter(Boolean);
    return { beforeUrls, afterUrls };
  }

  function carsReadyForPrint() {
    return state.cars
      .filter((c) => c.kept)
      .map((c) => {
        const { beforeUrls, afterUrls } = bucketUrls(c);
        return {
          year: c.year,
          make: c.make,
          model: c.model,
          vin: c.vin,
          beforeUrls,
          afterUrls,
        };
      })
      .filter((c) => c.beforeUrls.length > 0 || c.afterUrls.length > 0);
  }

  function markImageLoaded(url, img) {
    if (!url) return;
    state.imageCache.add(url);
    if (img) state.thumbByUrl[url] = img;
    if (img?.naturalWidth && img.naturalHeight) {
      state.imageSizes[url] = { w: img.naturalWidth, h: img.naturalHeight };
    }
    queuePrintCompact(url, img);
  }

  function printImageSrc(url) {
    return state.printSrc[url] || url;
  }

  function printSrcReady(url) {
    return !!state.printSrc[url];
  }

  function revokePrintBlobs() {
    Object.values(state.printSrc).forEach((src) => {
      if (typeof src === "string" && src.startsWith("blob:")) URL.revokeObjectURL(src);
    });
    state.printSrc = {};
    state.thumbByUrl = {};
    state.compacting.clear();
  }

  function queuePrintCompact(url, img) {
    if (!url || state.printSrc[url] || state.compacting.has(url)) return;
    const run = () => ensurePrintSrc(url, img);
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(run, { timeout: 1500 });
    } else {
      setTimeout(run, 0);
    }
  }

  async function canvasToPrintBlob(source, srcW, srcH) {
    const scale = Math.min(1, PRINT_MAX_PX / srcW, PRINT_MAX_PX / srcH);
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(source, 0, 0, w, h);
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("blob"))),
        "image/jpeg",
        PRINT_JPEG_QUALITY
      );
    });
  }

  async function ensurePrintSrc(url, img) {
    if (!url || state.printSrc[url] || state.compacting.has(url)) return;
    state.compacting.add(url);
    try {
      const source = img?.naturalWidth ? img : state.thumbByUrl[url];
      if (source?.naturalWidth) {
        const out = await canvasToPrintBlob(source, source.naturalWidth, source.naturalHeight);
        const scale = Math.min(1, PRINT_MAX_PX / source.naturalWidth, PRINT_MAX_PX / source.naturalHeight);
        state.printSrc[url] = URL.createObjectURL(out);
        state.imageSizes[url] = {
          w: Math.max(1, Math.round(source.naturalWidth * scale)),
          h: Math.max(1, Math.round(source.naturalHeight * scale)),
        };
        state.imageCache.add(url);
        return;
      }

      const headers = {};
      if (state.auth?.token) headers.Authorization = "Bearer " + state.auth.token;
      const res = await fetch(
        apiBase() + "/api/image?url=" + encodeURIComponent(url),
        { headers }
      );
      if (!res.ok) throw new Error("proxy");
      const blob = await res.blob();
      const bitmap = await createImageBitmap(blob);
      const out = await canvasToPrintBlob(bitmap, bitmap.width, bitmap.height);
      if (bitmap.close) bitmap.close();
      const scale = Math.min(1, PRINT_MAX_PX / bitmap.width, PRINT_MAX_PX / bitmap.height);
      state.printSrc[url] = URL.createObjectURL(out);
      state.imageSizes[url] = {
        w: Math.max(1, Math.round(bitmap.width * scale)),
        h: Math.max(1, Math.round(bitmap.height * scale)),
      };
      state.imageCache.add(url);
    } catch {
      state.printSrc[url] = url;
      state.imageCache.add(url);
    } finally {
      state.compacting.delete(url);
    }
  }

  async function compactPrintImages(urls, onProgress) {
    const unique = [...new Set(urls.filter(Boolean))];
    if (!unique.length) return;
    const pending = unique
      .filter((u) => !state.printSrc[u] && !state.compacting.has(u))
      .sort((a, b) => {
        const aDom = state.thumbByUrl[a]?.naturalWidth ? 0 : 1;
        const bDom = state.thumbByUrl[b]?.naturalWidth ? 0 : 1;
        return aDom - bDom;
      });
    let done = unique.length - pending.length;
    if (onProgress) onProgress(done / unique.length);
    if (!pending.length) return;

    const CONCURRENCY = 24;
    let idx = 0;
    async function worker() {
      while (idx < pending.length) {
        const url = pending[idx++];
        await ensurePrintSrc(url, state.thumbByUrl[url]);
        done += 1;
        if (onProgress) onProgress(done / unique.length);
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, pending.length) }, () => worker())
    );
  }

  function prefetchPrintPhotos() {
    const cars = carsReadyForPrint();
    const urls = cars.flatMap((c) => [...c.beforeUrls, ...c.afterUrls]);
    compactPrintImages(urls).catch(() => {});
  }

  function printPhotoCount(car) {
    return Math.max(car.beforeUrls.length, car.afterUrls.length, 1);
  }

  function printGridClass(count) {
    if (count >= 3) return "print-cars-4";
    if (count === 2) return "print-cars-2";
    return "print-cars-1";
  }

  function paginatePrintCars(cars) {
    const MAX_PER_PAGE = 4;
    const pages = [];
    for (let i = 0; i < cars.length; i += MAX_PER_PAGE) {
      const slice = cars.slice(i, i + MAX_PER_PAGE);
      pages.push({
        gridClass: printGridClass(slice.length),
        cars: slice,
      });
    }
    return pages;
  }

  function ensureReview(car) {
    if (!car.review || typeof car.review !== "object") {
      car.review = { unsorted: [], before: [], after: [] };
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

  function formatAriDate(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(/ /g, "-");
  }

  function renderAriRoleGrid(users) {
    const grid = $("ari-role-grid");
    grid.innerHTML = "";
    users.forEach((u) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "ari-role-card";
      card.dataset.userId = u.id;
      const role = u.role || "User";
      const username = u.roleUsername || u.name;
      const created = formatAriDate(u.createdAt);
      card.innerHTML =
        '<div class="ari-role-head">' +
        '<span class="ari-role-name">' + escapeHtml(u.name) + "</span>" +
        '<span class="ari-role-badge">' + escapeHtml(role) + "</span>" +
        "</div>" +
        '<div class="ari-role-meta">Username: ' + escapeHtml(username) + "</div>" +
        (created ? '<div class="ari-role-meta">Created: ' + escapeHtml(created) + "</div>" : "") +
        '<span class="ari-role-chevron" aria-hidden="true">›</span>';
      card.addEventListener("click", () => openAriPasscodeModal(u));
      grid.appendChild(card);
    });
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function openAriPasscodeModal(user) {
    state.selectedAriUser = user;
    const username = user.roleUsername || user.name;
    $("ari-passcode-title").textContent = user.name + " (" + username + ")";
    $("ari-passcode").value = "";
    $("ari-passcode-modal").classList.remove("hidden");
    $("ari-passcode").focus();
  }

  function closeAriPasscodeModal() {
    $("ari-passcode-modal").classList.add("hidden");
    state.selectedAriUser = null;
    $("ari-passcode").value = "";
  }

  async function continueAriLogin() {
    const email = $("ari-email").value.trim();
    const password = $("ari-password").value;
    if (!email || !password) {
      $("ari-status").textContent = "Enter ARI email and password first.";
      return;
    }
    $("ari-continue-btn").disabled = true;
    $("ari-status").textContent = "Signing in to ARI…";
    try {
      const data = await api("/api/ari/users", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      state.ariUsers = data.users || [];
      state.ariNeedsSubUser = !!data.hasSubUsers;

      if (state.ariNeedsSubUser) {
        $("ari-step1").classList.add("hidden");
        $("ari-step2").classList.remove("hidden");
        renderAriRoleGrid(state.ariUsers);
        $("ari-status").textContent = "Select your role, then enter your passcode.";
      } else {
        await saveAriCreds();
      }
    } catch (e) {
      $("ari-status").textContent = e.message;
    } finally {
      $("ari-continue-btn").disabled = false;
    }
  }

  async function saveAriCreds() {
    const email = $("ari-email").value.trim();
    const password = $("ari-password").value;
    if (!email || !password) {
      $("ari-status").textContent = "Enter ARI email and password.";
      return;
    }
    if (state.ariNeedsSubUser) {
      const passcode = $("ari-passcode").value;
      if (!state.selectedAriUser) {
        $("ari-status").textContent = "Select your role first.";
        return;
      }
      if (!passcode) {
        $("ari-status").textContent = "Enter your ARI passcode.";
        return;
      }
    }
    $("ari-save-btn").disabled = true;
    try {
      const payload = {
        email,
        password,
        accountUserId: state.ariNeedsSubUser ? state.selectedAriUser.id : null,
        passcode: state.ariNeedsSubUser ? $("ari-passcode").value : "",
      };
      const data = await api("/api/ari/credentials", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const who = data.ariUserName ? " as " + data.ariUserName : "";
      closeAriPasscodeModal();
      await loadClientOptions();
      showScreen("batches");
      await loadBatches();
      $("batches-empty").textContent = "ARI connected" + who + ". Create a print batch to import photos.";
      $("batches-empty").classList.remove("hidden");
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

  function openCarTally() {
    showScreen("tally");
    loadClientOptions();
    $("tally-status").textContent = "";
    if (!$("tally-date-from").value) {
      const to = new Date();
      const from = new Date();
      from.setMonth(from.getMonth() - 3);
      $("tally-date-to").value = to.toISOString().slice(0, 10);
      $("tally-date-from").value = from.toISOString().slice(0, 10);
    }
  }

  function fmtTallyDate(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  function tallyDateValue(iso) {
    if (!iso) return 0;
    const t = new Date(iso).getTime();
    return Number.isNaN(t) ? 0 : t;
  }

  function sortedTallyCars() {
    const cars = [...state.tallyCars];
    const dir = state.tallyDateSort === "asc" ? 1 : -1;
    cars.sort((a, b) => {
      const da = tallyDateValue(a.dateOrdered);
      const db = tallyDateValue(b.dateOrdered);
      if (da === db) return 0;
      return da < db ? -dir : dir;
    });
    return cars;
  }

  function updateTallyDateSortHeader() {
    const btn = $("tally-sort-date");
    if (!btn) return;
    btn.textContent =
      "Date worked on " + (state.tallyDateSort === "asc" ? "↑" : "↓");
    btn.setAttribute("aria-sort", state.tallyDateSort === "asc" ? "ascending" : "descending");
  }

  function toggleTallyDateSort() {
    if (!state.tallyCars.length) return;
    state.tallyDateSort = state.tallyDateSort === "asc" ? "desc" : "asc";
    renderTallyResults();
  }

  function tallyVehicleLabel(car) {
    const parts = [car.year, car.make, car.model].filter(Boolean);
    return parts.join(" ").trim() || car.model || "";
  }

  function renderTallyResults() {
    const cars = state.tallyCars;
    const filters = state.tallyFilters || {};
    const total = cars.length;
    const clientLabel = filters.clientName || "All dealerships";
    const fromLabel = filters.dateFrom || "start";
    const toLabel = filters.dateTo || "today";

    $("tally-results").classList.remove("hidden");
    $("tally-summary").textContent =
      clientLabel + " | " + fromLabel + " to " + toLabel + " | " + total + " car" + (total === 1 ? "" : "s");
    $("tally-total-cell").innerHTML = "<strong>" + total + "</strong>";
    updateTallyDateSortHeader();

    $("tally-table-body").innerHTML = sortedTallyCars()
      .map(
        (car) =>
          "<tr><td>" +
          escapeHtml(tallyVehicleLabel(car)) +
          "</td><td>" +
          escapeHtml(car.vin) +
          "</td><td>" +
          escapeHtml(fmtTallyDate(car.dateOrdered)) +
          "</td></tr>"
      )
      .join("");
  }

  function setInvGenStatus(msg, isError) {
    const loadStatus = $("inv-load-status");
    const mainStatus = $("inv-gen-status");
    if (loadStatus) {
      loadStatus.textContent = msg || "";
      loadStatus.classList.toggle("error", !!isError);
    }
    if (mainStatus) {
      mainStatus.textContent = msg || "";
      mainStatus.classList.toggle("error", !!isError);
    }
    if (msg && loadStatus) {
      loadStatus.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function openInvoiceGenerator() {
    showScreen("invoice-gen");
    loadClientOptions();
    if (!$("inv-date-from").value) {
      const to = new Date();
      const from = new Date();
      from.setMonth(from.getMonth() - 3);
      $("inv-date-to").value = to.toISOString().slice(0, 10);
      $("inv-date-from").value = from.toISOString().slice(0, 10);
    }
    toggleInvSourcePanels();
    updateInvGenActions();
  }

  function toggleInvSourcePanels() {
    const src = $("inv-src-type").value;
    const isDealer = src === "ari" || src === "qbo";
    $("inv-dealer-source").classList.toggle("hidden", !isDealer);
    $("inv-pdf-source").classList.toggle("hidden", src !== "pdf");
    $("inv-qbo-import-block").classList.toggle("hidden", src !== "qbo");
    if (src === "qbo") refreshQboStatus();
  }

  async function refreshQboStatus() {
    const statusEl = $("inv-qbo-status");
    const btn = $("inv-qbo-connect-btn");
    const connectRow = $("inv-qbo-connect-row");
    const hint = $("inv-qbo-setup-hint");
    if (!connectRow) return;
    try {
      const data = await api("/api/qbo/status");
      if (!data.configured) {
        connectRow.classList.add("hidden");
        if (hint) {
          hint.classList.remove("hidden", "error");
          hint.innerHTML =
            "<strong>QuickBooks API is not configured.</strong> Upload open invoice PDFs above, export a CSV, " +
            'switch Source to <strong>ARI</strong>, or click Load to pull from ARI automatically.';
        }
        return;
      }
      connectRow.classList.remove("hidden");
      if (hint) hint.classList.add("hidden");
      if (data.connected) {
        statusEl.textContent =
          "QuickBooks connected" + (data.realmId ? " (company " + data.realmId + ")" : "");
        if (btn) {
          btn.textContent = "Reconnect QuickBooks";
          btn.disabled = false;
        }
      } else {
        statusEl.textContent = "Optional: connect QuickBooks to load open invoices automatically.";
        if (btn) {
          btn.textContent = "Connect QuickBooks";
          btn.disabled = false;
        }
      }
    } catch {
      connectRow.classList.add("hidden");
      if (hint) {
        hint.classList.remove("hidden");
        hint.textContent = "Could not check QuickBooks status. Upload PDFs or use ARI source.";
      }
    }
  }

  async function connectQuickBooks() {
    $("inv-qbo-connect-btn").disabled = true;
    $("inv-gen-status").textContent = "Opening QuickBooks sign-in…";
    try {
      const data = await api("/api/qbo/auth-url");
      window.open(data.authUrl, "qbo-oauth", "width=640,height=720,noopener");
      $("inv-gen-status").textContent = "Complete sign-in in the QuickBooks window, then load invoices.";
    } catch (e) {
      $("inv-gen-status").textContent = e.message;
    } finally {
      $("inv-qbo-connect-btn").disabled = false;
    }
  }

  function fmtInvDate(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  function invGroupLabel(g) {
    const totalLabel = g.total > 0 ? window.InvoiceGenerator.money(g.total) : g.carCount + " car(s)";
    const srcTag = g.source === "qbo" || state.invSource === "qbo" ? " | QBO open" : "";
    return (
      (g.invoiceNumber || "Invoice") +
      " | " +
      fmtInvDate(g.dateOrdered) +
      " | " +
      g.carCount +
      " car(s) | " +
      totalLabel +
      srcTag
    );
  }

  function invoiceGroupTotal(g) {
    const fromGroup = Number(g.total);
    if (Number.isFinite(fromGroup) && fromGroup > 0) return fromGroup;
    return (g.cars || []).reduce((sum, car) => sum + (Number(car.amount) || 0), 0);
  }

  function selectedInvoicesTotal() {
    return getSelectedInvIndices().reduce((sum, idx) => sum + invoiceGroupTotal(state.invGroups[idx]), 0);
  }

  function getSelectedInvIndices() {
    return [...state.invSelectedIds]
      .map((v) => Number(v))
      .filter((idx) => Number.isFinite(idx) && state.invGroups[idx]);
  }

  function syncInvSelectAll() {
    const selectAll = $("inv-select-all");
    const total = state.invGroups.length;
    const selected = state.invSelectedIds.size;
    if (!selectAll) return;
    selectAll.disabled = total === 0;
    selectAll.checked = total > 0 && selected === total;
    selectAll.indeterminate = selected > 0 && selected < total;
    const countEl = $("inv-pick-count");
    const totalEl = $("inv-pick-total");
    if (countEl) {
      countEl.textContent = total
        ? selected + " of " + total + " invoice(s) selected"
        : "";
    }
    if (totalEl) {
      if (!total || selected === 0) {
        totalEl.classList.add("hidden");
        totalEl.textContent = "";
      } else {
        const amount = selectedInvoicesTotal();
        totalEl.classList.remove("hidden");
        const label =
          state.invSource === "qbo" ? "QBO open total" : "Selected total";
        totalEl.textContent =
          label + ": " + window.InvoiceGenerator.money(amount) + " (" + selected + " invoice(s))";
      }
    }
  }

  function renderInvPickList() {
    const list = $("inv-pick-list");
    const groups = state.invGroups;
    list.innerHTML = "";
    if (!groups.length) {
      list.innerHTML = '<p class="muted small inv-pick-empty">No invoices in this range.</p>';
      state.invSelectedIds.clear();
      syncInvSelectAll();
      return;
    }
    groups.forEach((g, idx) => {
      const row = document.createElement("div");
      row.className = "inv-pick-row";
      const checked = state.invSelectedIds.has(idx);
      const cbId = "inv-pick-" + idx;
      row.innerHTML =
        '<input type="checkbox" id="' +
        cbId +
        '" data-inv-pick="' +
        idx +
        '" ' +
        (checked ? "checked " : "") +
        'aria-label="Select ' +
        escapeHtml(g.invoiceNumber || "invoice") +
        '">' +
        '<label class="inv-pick-text" for="' +
        cbId +
        '">' +
        escapeHtml(invGroupLabel(g)) +
        "</label>";
      const input = row.querySelector("input");
      input.addEventListener("change", (e) => {
        if (e.target.checked) state.invSelectedIds.add(idx);
        else state.invSelectedIds.delete(idx);
        syncInvSelectAll();
      });
      row.addEventListener("click", (e) => {
        if (e.target.tagName === "INPUT") return;
        input.checked = !input.checked;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
      list.appendChild(row);
    });
    syncInvSelectAll();
  }

  function rebuildInvSplitsFromSelection() {
    const indices = getSelectedInvIndices().sort((a, b) => a - b);
    if (!indices.length) return [];
    let allSplits = [];
    for (const idx of indices) {
      const group = state.invGroups[idx];
      if (!group?.cars?.length) continue;
      const parsed = window.InvoiceGenerator.parsedFromAriGroup(group);
      const splits = window.InvoiceGenerator.splitInvoice(parsed, invGenOptions());
      allSplits = allSplits.concat(splits);
    }
    allSplits.forEach((s, i) => {
      s.splitIndex = i + 1;
      s.splitTotal = allSplits.length;
    });
    return allSplits;
  }

  async function loadInvoicesFromAri() {
    const clientName = $("inv-client").value.trim();
    const dateFrom = $("inv-date-from").value;
    const dateTo = $("inv-date-to").value;

    if (!clientName) {
      setInvGenStatus("Enter a dealership name.", true);
      return;
    }
    if (!dateFrom || !dateTo) {
      setInvGenStatus("Choose a from and to date.", true);
      return;
    }

    $("inv-load-btn").disabled = true;
    setInvGenStatus("Loading invoices from ARI...");
    showProgress("inv-gen-progress", "inv-gen-progress-fill", "inv-gen-progress-label", "Loading from ARI...");
    state.invParsed = null;
    state.invSplits = [];
    state.invSource = "ari";
    $("inv-gen-preview").classList.add("hidden");
    updateInvGenActions();

    try {
      const data = await api(
        "/api/invoice-generator/invoices",
        {
          method: "POST",
          body: JSON.stringify({ clientName, dateFrom, dateTo }),
        },
        180000
      );
      state.invGroups = data.invoiceGroups || [];
      state.invSelectedIds = new Set(state.invGroups.map((_, idx) => idx));
      renderInvPickList();
      const multi = state.invGroups.filter((g) => g.carCount > 1).length;
      setInvGenStatus(
        "Found " +
        state.invGroups.length +
        " invoice(s) for " +
        clientName +
        (multi ? " (" + multi + " combined/multi-car)" : "") +
        "."
      );
      finishProgress("inv-gen-progress", "inv-gen-progress-fill", "inv-gen-progress-label", "Load complete");
    } catch (e) {
      state.invGroups = [];
      renderInvPickList();
      setInvGenStatus(e.message, true);
      hideProgress("inv-gen-progress", "inv-gen-progress-fill");
    } finally {
      $("inv-load-btn").disabled = false;
    }
  }

  async function loadInvoicesFromQbo() {
    const clientName = $("inv-client").value.trim();
    const dateFrom = $("inv-date-from").value;
    const dateTo = $("inv-date-to").value;
    const pdfInput = $("inv-qbo-pdfs");
    const csvInput = $("inv-qbo-csv");
    const pdfFiles = pdfInput?.files ? [...pdfInput.files] : [];
    const csvFile = csvInput?.files && csvInput.files[0];

    if (!clientName) {
      setInvGenStatus("Enter a dealership name (must match QuickBooks customer).", true);
      return;
    }
    if (!dateFrom || !dateTo) {
      setInvGenStatus("Choose a from and to date.", true);
      return;
    }

    $("inv-load-btn").disabled = true;
    state.invParsed = null;
    state.invSplits = [];
    state.invSource = "qbo";
    $("inv-gen-preview").classList.add("hidden");
    updateInvGenActions();

    try {
      let qboStatus = { configured: false, connected: false };
      try {
        qboStatus = await api("/api/qbo/status");
      } catch {
        /* optional */
      }

      if (!pdfFiles.length && !csvFile && qboStatus.connected) {
        setInvGenStatus("Loading open invoices from QuickBooks...");
        showProgress(
          "inv-gen-progress",
          "inv-gen-progress-fill",
          "inv-gen-progress-label",
          "Loading from QuickBooks..."
        );
        const data = await api(
          "/api/invoice-generator/qbo-invoices",
          {
            method: "POST",
            body: JSON.stringify({ clientName, dateFrom, dateTo }),
          },
          180000
        );
        applyLoadedInvoiceGroups(data, clientName);
        finishProgress("inv-gen-progress", "inv-gen-progress-fill", "inv-gen-progress-label", "Load complete");
        return;
      }

      if (!pdfFiles.length && !csvFile) {
        const importBlock = $("inv-qbo-import-block");
        if (importBlock) {
          importBlock.classList.add("inv-qbo-highlight");
          setTimeout(() => importBlock.classList.remove("inv-qbo-highlight"), 2500);
        }
        setInvGenStatus(
          "No QuickBooks PDFs or API connection — loading from ARI instead…",
          false
        );
        await loadInvoicesFromAri();
        return;
      }

      setInvGenStatus("Reading QuickBooks export...");
      showProgress(
        "inv-gen-progress",
        "inv-gen-progress-fill",
        "inv-gen-progress-label",
        "Importing QuickBooks data..."
      );

      let qboInvoices = [];
      if (csvFile) {
        const csvText = await csvFile.text();
        qboInvoices = window.InvoiceGenerator.parseQboOpenCsv(csvText);
        if (!qboInvoices.length) {
          throw new Error("Could not parse CSV. Export open invoices from QuickBooks with Num and Open Balance columns.");
        }
      }

      if (pdfFiles.length) {
        for (const file of pdfFiles) {
          const text = await window.InvoiceGenerator.extractPdfText(file);
          const parsed = window.InvoiceGenerator.parseInvoiceText(text);
          if (!parsed.vehicles?.length) {
            throw new Error("No vehicles in " + file.name + ". Use ReNu ATI-style QuickBooks PDFs.");
          }
          qboInvoices.push(window.InvoiceGenerator.parsedToQboInvoice(parsed));
        }
      }

      const data = await api(
        "/api/invoice-generator/import-merge",
        {
          method: "POST",
          body: JSON.stringify({ clientName, dateFrom, dateTo, qboInvoices }),
        },
        180000
      );
      applyLoadedInvoiceGroups(data, clientName);
      finishProgress("inv-gen-progress", "inv-gen-progress-fill", "inv-gen-progress-label", "Import complete");
    } catch (e) {
      state.invGroups = [];
      renderInvPickList();
      setInvGenStatus(e.message, true);
      hideProgress("inv-gen-progress", "inv-gen-progress-fill");
    } finally {
      $("inv-load-btn").disabled = false;
    }
  }

  function applyLoadedInvoiceGroups(data, clientName) {
    state.invGroups = data.invoiceGroups || [];
    state.invSelectedIds = new Set(state.invGroups.map((_, idx) => idx));
    renderInvPickList();
    const openTotal =
      data.qboOpenTotal != null
        ? window.InvoiceGenerator.money(data.qboOpenTotal)
        : window.InvoiceGenerator.money(selectedInvoicesTotal());
    const via = data.source === "qbo-import" ? "import" : data.source === "ari" ? "ARI" : "QuickBooks";
    setInvGenStatus(
      "Found " +
      state.invGroups.length +
      " invoice(s) for " +
      (data.clientName || clientName) +
      " via " +
      via +
      " — total " +
      openTotal +
      "."
    );
  }

  async function loadInvoicesFromSource() {
    const src = $("inv-src-type").value;
    if (src === "qbo") return loadInvoicesFromQbo();
    return loadInvoicesFromAri();
  }

  function splitSelectedInvoice() {
    if ($("inv-src-type").value === "pdf") {
      return parseInvoicePdf();
    }
    if (!window.InvoiceGenerator) {
      $("inv-gen-status").textContent = "Invoice generator module did not load.";
      return;
    }
    const indices = getSelectedInvIndices();
    if (!indices.length) {
      $("inv-gen-status").textContent = "Select at least one invoice to split.";
      return;
    }

    state.invMultiSource = indices.length > 1;
    state.invParsed = null;
    state.invSplits = rebuildInvSplitsFromSelection();
    if (!state.invSplits.length) {
      $("inv-gen-status").textContent = "Selected invoice(s) have no vehicles.";
      return;
    }

    const zeroAmount = state.invSplits.every((s) => !s.balanceDue);
    if (zeroAmount) {
      $("inv-gen-status").textContent =
        "Split ready — amounts were $0; check line totals or upload the QuickBooks PDF for exact amounts.";
    } else {
      const selectedTotal = selectedInvoicesTotal();
      const splitTotal = state.invSplits.reduce((s, inv) => s + (Number(inv.balanceDue) || 0), 0);
      const totalsMatch = Math.abs(selectedTotal - splitTotal) < 0.02;
      $("inv-gen-status").textContent =
        "Ready — " +
        state.invSplits.length +
        " split PDF(s) from " +
        indices.length +
        " selected invoice(s)" +
        (totalsMatch
          ? " — totals match (" + window.InvoiceGenerator.money(splitTotal) + ")."
          : " — split total " + window.InvoiceGenerator.money(splitTotal) + ".");
    }
    renderInvGenPreview();
  }

  function invGenOptions() {
    return {
      splitBy: $("inv-split-by").value,
      unassignedMode: $("inv-unassigned").value,
      numbering: $("inv-numbering").value,
    };
  }

  function updateInvGenActions() {
    const ready = state.invSplits.length > 0;
    $("inv-print-btn").disabled = !ready;
    $("inv-save-folder-btn").disabled = !ready;
    $("inv-download-btn").disabled = !ready;
  }

  function renderInvGenPreview() {
    const splits = state.invSplits;
    $("inv-gen-preview").classList.toggle("hidden", !splits.length);
    if (!splits.length) return;

    const parsed = state.invParsed || {};
    const sourceCount = getSelectedInvIndices().length;
    let summary =
      splits.length +
      " split invoice" +
      (splits.length === 1 ? "" : "s") +
      " (one per car)";
    if (state.invMultiSource && sourceCount > 1) {
      summary = sourceCount + " source invoices | " + summary;
    } else if (parsed.invoiceNumber) {
      summary =
        "Original #" +
        parsed.invoiceNumber +
        (parsed.invoiceDate
          ? " | Date " + window.InvoiceGenerator.fmtDisplayDate(parsed.invoiceDate)
          : "") +
        " | " +
        summary;
    }
    $("inv-gen-summary").textContent = summary;

    $("inv-gen-table-body").innerHTML = splits
      .map(
        (inv) =>
          "<tr><td>" +
          inv.splitIndex +
          "</td><td>" +
          escapeHtml(inv.invoiceNumber) +
          "</td><td>" +
          escapeHtml(window.InvoiceGenerator.fmtDisplayDate(inv.invoiceDate)) +
          "</td><td>" +
          escapeHtml(inv.vehicle || "—") +
          (inv.vin ? "<br><span class='muted'>" + escapeHtml(inv.vin) + "</span>" : "") +
          (inv.stockNo ? "<br><span class='muted'>Stock " + escapeHtml(inv.stockNo) + "</span>" : "") +
          "</td><td>" +
          (inv.vehicles ? inv.vehicles.length : inv.lineItems?.length || 1) +
          "</td><td>" +
          escapeHtml(window.InvoiceGenerator.money(inv.balanceDue)) +
          "</td></tr>"
      )
      .join("");

    const preview = $("inv-gen-html-preview");
    preview.innerHTML = window.InvoiceGenerator.buildPrintDocument(splits);
    preview.classList.remove("hidden");
    updateInvGenActions();
  }

  async function parseInvoicePdf() {
    const fileInput = $("inv-pdf-file");
    const file = fileInput.files && fileInput.files[0];
    if (!file) {
      $("inv-gen-status").textContent = "Choose a QuickBooks invoice PDF first.";
      return;
    }
    if (!window.InvoiceGenerator) {
      $("inv-gen-status").textContent = "Invoice generator module did not load.";
      return;
    }

    const templateInput = $("inv-template-file");
    if (templateInput) {
      const templateFile = templateInput.files && templateInput.files[0];
      if (templateFile) {
        state.invTemplateName = templateFile.name;
        $("inv-template-note").textContent =
          "Layout reference saved: " + templateFile.name + " — send this file in chat to lock exact formatting.";
        $("inv-template-note").classList.remove("hidden");
      }
    }

    $("inv-parse-btn").disabled = true;
    $("inv-gen-status").textContent = "Reading PDF...";
    showProgress("inv-gen-progress", "inv-gen-progress-fill", "inv-gen-progress-label", "Parsing invoice...");
    try {
      const text = await window.InvoiceGenerator.extractPdfText(file);
      const parsed = window.InvoiceGenerator.parseInvoiceText(text);
      if (!parsed.vehicles?.length && !parsed.lineItems?.length) {
        throw new Error(
          "No vehicles found. Use a ReNu ATI-style PDF (DATE ORDERED / VEHICLE / VIN / AMOUNT table) or send a sample to match."
        );
      }
      state.invParsed = parsed;
      state.invSplits = window.InvoiceGenerator.splitInvoice(parsed, invGenOptions());
      if (state.invSplits.length === 0) {
        throw new Error("Could not split this invoice — no VINs detected in line items.");
      }
      renderInvGenPreview();
      $("inv-gen-status").textContent =
        "Ready — " + state.invSplits.length + " invoice(s), original date preserved.";
      finishProgress("inv-gen-progress", "inv-gen-progress-fill", "inv-gen-progress-label", "Parse complete");
    } catch (e) {
      state.invParsed = null;
      state.invSplits = [];
      $("inv-gen-preview").classList.add("hidden");
      $("inv-gen-status").textContent = e.message;
      hideProgress("inv-gen-progress", "inv-gen-progress-fill");
      updateInvGenActions();
    } finally {
      $("inv-parse-btn").disabled = false;
    }
  }

  function printInvSplits() {
    if (!state.invSplits.length) return;
    $("inv-print-root").innerHTML = window.InvoiceGenerator.buildPrintDocument(state.invSplits);
    document.body.classList.add("inv-printing");
    $("inv-print-root").classList.remove("hidden");
    window.print();
    setTimeout(() => {
      document.body.classList.remove("inv-printing");
      $("inv-print-root").classList.add("hidden");
      $("inv-print-root").innerHTML = "";
    }, 500);
  }

  async function saveInvSplitsToFolder(useFolderPicker) {
    if (!state.invSplits.length || !window.InvoiceGenerator) return;
    const btn = useFolderPicker ? $("inv-save-folder-btn") : $("inv-download-btn");
    btn.disabled = true;
    $("inv-gen-status").textContent = useFolderPicker
      ? "Pick a folder on your PC, then saving PDFs..."
      : "Generating PDF downloads...";
    showProgress("inv-gen-progress", "inv-gen-progress-fill", "inv-gen-progress-label", "Creating PDFs...");
    try {
      if (useFolderPicker && !window.showDirectoryPicker) {
        $("inv-gen-status").textContent =
          "Folder picker not supported in this browser — downloading PDFs instead.";
      }
      const result = await window.InvoiceGenerator.saveSplitsToFolder(
        state.invSplits,
        null,
        { preferFolder: useFolderPicker },
        (i, total) => {
          $("inv-gen-progress-label").textContent = "PDF " + i + " of " + total;
          $("inv-gen-progress-fill").style.width = Math.round((i / total) * 100) + "%";
        }
      );
      $("inv-gen-status").textContent = result.usedFolder
        ? "Saved " + result.saved + " PDF(s) to your folder. Check the folder you picked."
        : "Downloaded " + result.saved + " PDF(s) to your Downloads folder.";
      finishProgress("inv-gen-progress", "inv-gen-progress-fill", "inv-gen-progress-label", "Done");
    } catch (e) {
      if (e.name === "AbortError") {
        $("inv-gen-status").textContent = "Folder pick cancelled.";
      } else {
        $("inv-gen-status").textContent = e.message;
      }
      hideProgress("inv-gen-progress", "inv-gen-progress-fill");
    } finally {
      btn.disabled = false;
      updateInvGenActions();
    }
  }

  async function runCarTally() {
    const clientName = $("tally-client").value.trim();
    const dateFrom = $("tally-date-from").value;
    const dateTo = $("tally-date-to").value;

    $("tally-run-btn").disabled = true;
    $("tally-results").classList.add("hidden");
    $("tally-status").textContent = "Fetching invoices from ARI...";
    showProgress("tally-progress", "tally-progress-fill", "tally-progress-label", "Loading from ARI...");
    try {
      const data = await api(
        "/api/car-tally",
        {
          method: "POST",
          body: JSON.stringify({ clientName, dateFrom, dateTo }),
        },
        180000
      );
      state.tallyCars = data.cars || [];
      state.tallyFilters = {
        clientName: data.clientName || clientName,
        dateFrom: data.dateFrom || dateFrom,
        dateTo: data.dateTo || dateTo,
      };
      state.tallyDateSort = "desc";
      renderTallyResults();
      $("tally-status").textContent =
        "Found " + (data.total || state.tallyCars.length) + " car(s) for " +
        (state.tallyFilters.clientName || "all dealerships") + ".";
      finishProgress("tally-progress", "tally-progress-fill", "tally-progress-label", "Tally complete");
    } catch (e) {
      $("tally-status").textContent = e.message;
      hideProgress("tally-progress", "tally-progress-fill");
    } finally {
      $("tally-run-btn").disabled = false;
    }
  }

  function tallyWorkbookRows() {
    const rows = [["Model", "VIN", "Date worked on"]];
    sortedTallyCars().forEach((car) => {
      rows.push([
        tallyVehicleLabel(car),
        car.vin || "",
        fmtTallyDate(car.dateOrdered),
      ]);
    });
    rows.push(["Total", "", state.tallyCars.length]);
    return rows;
  }

  function tallyExportFilename(ext) {
    const filters = state.tallyFilters || {};
    const slug = (filters.clientName || "all-dealerships")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const from = filters.dateFrom || "start";
    const to = filters.dateTo || "end";
    return "car-tally-" + slug + "-" + from + "-to-" + to + ext;
  }

  async function ensureXlsx() {
    if (window.XLSX) return window.XLSX;
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
      script.onload = resolve;
      script.onerror = () => reject(new Error("Could not load Excel export library."));
      document.head.appendChild(script);
    });
    return window.XLSX;
  }

  async function exportTallyExcel() {
    if (!state.tallyCars.length) {
      $("tally-status").textContent = "Run a tally first.";
      return;
    }
    $("tally-export-btn").disabled = true;
    $("tally-status").textContent = "Preparing Excel file...";
    try {
      const XLSX = await ensureXlsx();
      const ws = XLSX.utils.aoa_to_sheet(tallyWorkbookRows());
      ws["!cols"] = [{ wch: 32 }, { wch: 20 }, { wch: 16 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Car Tally");
      XLSX.writeFile(wb, tallyExportFilename(".xlsx"));
      $("tally-status").textContent = "Excel file downloaded.";
    } catch (e) {
      $("tally-status").textContent = e.message;
    } finally {
      $("tally-export-btn").disabled = false;
    }
  }

  function printTallyPdf() {
    if (!state.tallyCars.length) {
      $("tally-status").textContent = "Run a tally first.";
      return;
    }
    const filters = state.tallyFilters || {};
    const clientLabel = filters.clientName || "All dealerships";
    const fromLabel = filters.dateFrom || "start";
    const toLabel = filters.dateTo || "end";
    const rows = sortedTallyCars()
      .map(
        (car) =>
          "<tr><td>" +
          escapeHtml(tallyVehicleLabel(car)) +
          "</td><td>" +
          escapeHtml(car.vin) +
          "</td><td>" +
          escapeHtml(fmtTallyDate(car.dateOrdered)) +
          "</td></tr>"
      )
      .join("");

    $("tally-print-root").innerHTML =
      '<div class="tally-print-sheet">' +
      '<img src="' +
      LOGO_URL +
      '" alt="Renu Car" class="tally-print-logo">' +
      "<h1>Car Tally</h1>" +
      '<p class="tally-print-meta">' +
      escapeHtml(clientLabel) +
      " | " +
      escapeHtml(fromLabel) +
      " to " +
      escapeHtml(toLabel) +
      "</p>" +
      '<table class="tally-print-table"><thead><tr>' +
      "<th>Model</th><th>VIN</th><th>Date worked on</th>" +
      "</tr></thead><tbody>" +
      rows +
      '</tbody><tfoot><tr><td colspan="2"><strong>Total</strong></td><td><strong>' +
      state.tallyCars.length +
      "</strong></td></tr></tfoot></table></div>";

    document.body.classList.add("tally-printing");
    $("tally-print-root").classList.remove("hidden");
    window.print();
    setTimeout(() => {
      document.body.classList.remove("tally-printing");
      $("tally-print-root").classList.add("hidden");
      $("tally-print-root").innerHTML = "";
    }, 500);
  }

  async function loadBatches() {
    $("batch-list").innerHTML = "";
    $("batches-status").textContent = "";
    const selectAll = $("select-all-batches");
    if (selectAll) selectAll.checked = false;
    updateDeleteBatchesBtn();
    try {
      const data = await api("/api/batches");
      const batches = data.batches || [];
      $("batches-empty").classList.toggle("hidden", batches.length > 0);
      batches.forEach((b) => {
        const card = document.createElement("div");
        card.className = "batch-card";
        const checked = state.selectedBatchIds.has(b.id);
        card.innerHTML =
          '<label class="batch-select" title="Select batch">' +
          '<input type="checkbox" data-select-batch ' +
          (checked ? "checked " : "") +
          'aria-label="Select ' + escapeHtml(b.name) + '">' +
          "</label>" +
          '<div class="batch-card-body">' +
          "<strong>" + escapeHtml(b.name) + "</strong>" +
          "<div class='muted'>" + escapeHtml(b.client_name || "All clients") +
          " | " + escapeHtml(b.date_from || "?") + " - " + escapeHtml(b.date_to || "?") + "</div>" +
          "<div class='muted'>Updated " + escapeHtml(fmtDate(b.updated_at)) + "</div>" +
          "</div>";
        const checkbox = card.querySelector("[data-select-batch]");
        checkbox.addEventListener("click", (e) => e.stopPropagation());
        checkbox.addEventListener("change", (e) => {
          if (e.target.checked) state.selectedBatchIds.add(b.id);
          else state.selectedBatchIds.delete(b.id);
          syncSelectAllBatches(batches.length);
          updateDeleteBatchesBtn();
        });
        card.querySelector(".batch-card-body").addEventListener("click", () => openBatch(b.id, b.name));
        $("batch-list").appendChild(card);
      });
      syncSelectAllBatches(batches.length);
    } catch (e) {
      $("batches-empty").classList.remove("hidden");
      $("batches-empty").textContent = e.message;
    }
  }

  function syncSelectAllBatches(total) {
    const selectAll = $("select-all-batches");
    if (!selectAll) return;
    const selected = state.selectedBatchIds.size;
    selectAll.checked = total > 0 && selected === total;
    selectAll.indeterminate = selected > 0 && selected < total;
  }

  function updateDeleteBatchesBtn() {
    const btn = $("delete-batches-btn");
    if (!btn) return;
    const count = state.selectedBatchIds.size;
    btn.disabled = count === 0;
    btn.textContent = count ? "Delete selected (" + count + ")" : "Delete selected";
  }

  async function deleteSelectedBatches() {
    const ids = [...state.selectedBatchIds];
    if (!ids.length) return;
    const label = ids.length === 1 ? "this print batch" : ids.length + " print batches";
    if (!window.confirm("Delete " + label + "? This cannot be undone.")) return;
    $("delete-batches-btn").disabled = true;
    $("batches-status").textContent = "Deleting...";
    try {
      const data = await api("/api/batches/delete", {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
      if (state.batch && ids.includes(state.batch.id)) {
        state.batch = null;
        state.cars = [];
      }
      ids.forEach((id) => state.selectedBatchIds.delete(id));
      $("batches-status").textContent = "Deleted " + (data.deleted || ids.length) + " batch(es).";
      await loadBatches();
    } catch (e) {
      $("batches-status").textContent = e.message;
      updateDeleteBatchesBtn();
    }
  }

  async function runImport() {
    const name = $("batch-name").value.trim();
    if (!name) {
      $("import-status").textContent = "Enter a batch name.";
      return;
    }
    $("import-btn").disabled = true;
    $("import-status").textContent = "Connecting to ARI and importing invoices...";
    showProgress("import-progress", "import-progress-fill", "import-progress-label", "Importing from ARI...");
    try {
      const data = await api(
        "/api/batches",
        {
          method: "POST",
          body: JSON.stringify({
            name,
            clientName: $("client-filter").value.trim(),
            dateFrom: $("date-from").value,
            dateTo: $("date-to").value,
          }),
        },
        180000
      );
      $("import-status").textContent =
        "Imported " + data.imported + " invoices (" + data.withPhotos + " with photos).";
      finishProgress("import-progress", "import-progress-fill", "import-progress-label", "Import complete");
      await openBatch(data.batchId, name);
    } catch (e) {
      $("import-status").textContent = e.message;
      hideProgress("import-progress", "import-progress-fill");
    } finally {
      $("import-btn").disabled = false;
    }
  }

  async function openBatch(batchId, title) {
    revokePrintBlobs();
    state.imageCache.clear();
    state.imageSizes = {};
    const data = await api("/api/batches/" + batchId);
    state.batch = data.batch;
    state.cars = (data.cars || []).map((car) => {
      car.photos = (car.photos || []).map((p, i) => ({
        ...p,
        id: String(p.id ?? "pic-" + i),
      }));
      if (car.review?.starredBefore != null) delete car.review.starredBefore;
      if (car.review?.starredAfter != null) delete car.review.starredAfter;
      syncReviewIds(car);
      return car;
    });
    state.page = 0;
    $("review-title").textContent = title || data.batch.name;
    $("review-meta").textContent =
      (data.batch.client_name || "All clients") + " | " +
      (data.batch.date_from || "") + " - " + (data.batch.date_to || "");
    showScreen("review");
    renderReview();
    prefetchPrintPhotos();
  }

  function visibleCars() {
    return state.cars.filter((c) => !state.showKeptOnly || c.kept);
  }

  function updatePrintSummary() {
    const ready = carsReadyForPrint().length;
    const hint = $("review-print-hint");
    if (hint) {
      hint.textContent =
        ready +
        " vehicle(s) ready for PDF. Drag photos into Before or After and the car is included automatically.";
    }
    const printBtn = $("print-btn");
    if (printBtn) printBtn.textContent = ready ? "Print PDF (" + ready + ")" : "Print PDF";
  }

  function printBadgeHtml(car) {
    const { beforeUrls, afterUrls } = bucketUrls(car);
    const hasBucketPhotos = beforeUrls.length + afterUrls.length > 0;
    if (car.kept && hasBucketPhotos) {
      return '<span class="print-badge ready">Ready to print</span>';
    }
    if (car.kept) {
      return '<span class="print-badge waiting">Drag photos to Before/After</span>';
    }
    return '<span class="print-badge waiting">Skipped</span>';
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
        '<div class="car-head-top">' +
        '<button type="button" class="print-toggle ' + (car.kept ? "on" : "off") + '" data-keep>' +
        (car.kept ? "Included in PDF" : "Skipped - click to include") +
        "</button>" +
        printBadgeHtml(car) +
        "</div>" +
        '<div class="car-meta-row"><div class="car-meta"><strong>' + escapeHtml(ymLabel(car)) + "</strong>" +
        "<span>VIN: " + escapeHtml(car.vin || "-") + "</span>" +
        "<span>Inv #" + escapeHtml(car.invoice_number || "-") + "</span></div></div>";
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

      head.querySelector("[data-keep]").addEventListener("click", () => {
        car.kept = !car.kept;
        renderReview();
      });

      grid.appendChild(card);
    });

    $("page-label").textContent = "Page " + (state.page + 1) + " of " + totalPages;
    $("page-prev").disabled = state.page === 0;
    $("page-next").disabled = state.page >= totalPages - 1;
    updatePrintSummary();
    prefetchPrintPhotos();
  }

  function thumbEl(car, photo, binKey) {
    const el = document.createElement("div");
    el.className = "thumb";
    el.draggable = true;
    el.dataset.photoId = photo.id;
    el.dataset.carId = car.id;

    const img = document.createElement("img");
    img.src = photo.url;
    img.alt = "Photo";
    img.decoding = "async";
    if (img.complete) markImageLoaded(photo.url, img);
    else {
      img.addEventListener("load", () => markImageLoaded(photo.url, img), { once: true });
    }
    el.appendChild(img);

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
    if (targetBin === "before" || targetBin === "after") {
      car.kept = true;
      const photo = (car.photos || []).find((p) => p.id === photoId);
      if (photo?.url) ensurePrintSrc(photo.url, state.thumbByUrl[photo.url]);
    }
  }

  function saveReviewPayload() {
    return api("/api/batches/" + state.batch.id + "/cars", {
      method: "PUT",
      body: JSON.stringify({
        cars: state.cars.map((c) => ({
          id: c.id,
          kept: !!c.kept,
          review: ensureReview(c),
        })),
      }),
    });
  }

  async function saveReview() {
    if (!state.batch) return;
    $("save-review-btn").disabled = true;
    try {
      await saveReviewPayload();
      $("review-status").textContent = "Saved " + new Date().toLocaleTimeString() + ".";
    } catch (e) {
      $("review-status").textContent = e.message;
    } finally {
      $("save-review-btn").disabled = false;
    }
  }

  function saveReviewSilent() {
    if (!state.batch) return;
    saveReviewPayload().catch(() => {});
  }

  async function waitForPrintImages(root, timeoutMs) {
    const imgs = Array.from(root.querySelectorAll("img"));
    if (!imgs.length) return;
    const waitOne = (img) =>
      new Promise((resolve) => {
        const done = () => resolve();
        if (img.complete && img.naturalWidth > 0) {
          if (img.decode) img.decode().then(done).catch(done);
          else done();
          return;
        }
        img.onload = img.onerror = () => {
          if (img.decode) img.decode().then(done).catch(done);
          else done();
        };
      });
    await Promise.race([
      Promise.all(imgs.map(waitOne)),
      new Promise((resolve) => setTimeout(resolve, timeoutMs || 12000)),
    ]);
  }

  async function printPdf() {
    if (!state.batch) return;
    $("print-btn").disabled = true;
    $("review-status").textContent = "";
    const root = $("print-root");
    try {
      const cars = carsReadyForPrint();
      if (!cars.length) {
        $("review-status").textContent =
          "Drag photos into Before or After buckets. Cars are included in PDF automatically when you do.";
        return;
      }

      setTimeout(() => saveReviewSilent(), 0);

      const allUrls = [...new Set(cars.flatMap((c) => [...c.beforeUrls, ...c.afterUrls]))];
      const missing = allUrls.filter((u) => !printSrcReady(u));
      if (missing.length) {
        $("review-status").textContent = "Preparing photos...";
        await Promise.race([
          compactPrintImages(missing),
          new Promise((resolve) => setTimeout(resolve, 5000)),
        ]);
      }

      buildPrintView(cars, state.batch.name);
      root.classList.remove("hidden");
      root.setAttribute("aria-hidden", "false");
      $("review-status").textContent = "Loading print preview...";
      await waitForPrintImages(root, 12000);
      $("review-status").textContent = "Printing " + cars.length + " vehicle(s)...";
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.print();
    } catch (e) {
      $("review-status").textContent = e.message;
    } finally {
      $("print-btn").disabled = false;
    }
  }

  function buildPrintView(cars, title) {
    const root = $("print-root");
    root.innerHTML = "";
    root.classList.add("print-mode");
    const pages = paginatePrintCars(cars);

    pages.forEach((page, pageIdx) => {
      const sheet = document.createElement("section");
      sheet.className = "print-sheet " + page.gridClass;
      sheet.innerHTML =
        '<div class="print-header">' +
        '<img src="' + LOGO_URL + '" alt="Renu Car" class="print-logo">' +
        "<div class='print-header-meta'>" +
        "<strong>" + escapeHtml(title) + "</strong><br>" +
        "Page " + (pageIdx + 1) + " of " + pages.length +
        "</div></div>" +
        '<h2 class="print-page-title">Before &amp; After Pics</h2>';

      const list = document.createElement("div");
      list.className = "print-cars " + page.gridClass;

      page.cars.forEach((car) => {
        const block = document.createElement("article");
        const rows = printPhotoCount(car);
        block.className = "print-car";
        block.style.setProperty("--photo-rows", String(rows));
        block.innerHTML =
          "<div class='print-car-head'>" +
          "<div class='print-car-specs'>" +
          "<div class='ymm'>" + escapeHtml(ymLabel(car)) + "</div>" +
          "<div class='vin'>" + escapeHtml(car.vin || "") + "</div>" +
          "</div></div>" +
          "<div class='print-car-photos'>" +
          photoColumn(car.beforeUrls, "Before") +
          photoColumn(car.afterUrls, "After") +
          "</div>";
        list.appendChild(block);
      });

      sheet.appendChild(list);
      root.appendChild(sheet);
    });

    window.addEventListener(
      "afterprint",
      () => {
        root.classList.remove("print-mode");
        root.classList.add("hidden");
        root.setAttribute("aria-hidden", "true");
        root.innerHTML = "";
        $("review-status").textContent = "";
      },
      { once: true }
    );
  }

  function photoImgHtml(url) {
    const src = printImageSrc(url);
    return (
      '<div class="print-slot"><img src="' +
      escapeHtml(src) +
      '" alt="" decoding="sync" loading="eager"></div>'
    );
  }

  function photoColumn(urls, label) {
    const count = Math.max(urls.length, 1);
    if (!urls.length) {
      return (
        '<div class="print-col" style="--photo-rows:' +
        count +
        '"><span class="print-col-label">' +
        label +
        '</span><div class="print-slot print-empty"></div></div>'
      );
    }
    return (
      '<div class="print-col" style="--photo-rows:' +
      count +
      '"><span class="print-col-label">' +
      label +
      "</span>" +
      urls.map((u) => photoImgHtml(u)).join("") +
      "</div>"
    );
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
  $("ari-continue-btn").addEventListener("click", continueAriLogin);
  $("ari-save-btn").addEventListener("click", saveAriCreds);
  $("ari-passcode-close").addEventListener("click", closeAriPasscodeModal);
  $("ari-passcode-backdrop").addEventListener("click", closeAriPasscodeModal);
  $("ari-passcode").addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveAriCreds();
  });
  $("nav-home").addEventListener("click", () => { showScreen("batches"); loadBatches(); });
  $("nav-tally").addEventListener("click", openCarTally);
  $("nav-invoice-gen").addEventListener("click", openInvoiceGenerator);
  $("nav-ari").addEventListener("click", () => showScreen("ari"));
  $("new-batch-btn").addEventListener("click", () => { showScreen("import"); loadClientOptions(); });
  $("import-cancel").addEventListener("click", () => showScreen("batches"));
  $("delete-batches-btn").addEventListener("click", deleteSelectedBatches);
  $("select-all-batches").addEventListener("change", async (e) => {
    try {
      const data = await api("/api/batches");
      const batches = data.batches || [];
      if (e.target.checked) batches.forEach((b) => state.selectedBatchIds.add(b.id));
      else state.selectedBatchIds.clear();
      await loadBatches();
    } catch {
      e.target.checked = false;
    }
  });
  $("import-btn").addEventListener("click", runImport);
  $("tally-run-btn").addEventListener("click", runCarTally);
  $("tally-sort-date").addEventListener("click", toggleTallyDateSort);
  $("tally-export-btn").addEventListener("click", exportTallyExcel);
  $("tally-print-btn").addEventListener("click", printTallyPdf);
  $("inv-parse-btn").addEventListener("click", splitSelectedInvoice);
  $("inv-load-btn").addEventListener("click", loadInvoicesFromSource);
  $("inv-qbo-connect-btn").addEventListener("click", connectQuickBooks);
  window.addEventListener("message", (e) => {
    if (e.data?.type === "qbo-connected") {
      refreshQboStatus();
      $("inv-gen-status").textContent = "QuickBooks connected. Load invoices to continue.";
    }
  });
  $("inv-src-type").addEventListener("change", toggleInvSourcePanels);
  $("inv-select-all").addEventListener("change", (e) => {
    if (e.target.checked) {
      state.invGroups.forEach((_, idx) => state.invSelectedIds.add(idx));
    } else {
      state.invSelectedIds.clear();
    }
    renderInvPickList();
  });
  $("inv-print-btn").addEventListener("click", printInvSplits);
  $("inv-save-folder-btn").addEventListener("click", () => saveInvSplitsToFolder(true));
  $("inv-download-btn").addEventListener("click", () => saveInvSplitsToFolder(false));
  ["inv-split-by", "inv-unassigned", "inv-numbering"].forEach((id) => {
    $(id).addEventListener("change", () => {
      if ($("inv-src-type").value === "ari" || $("inv-src-type").value === "qbo") {
        if (getSelectedInvIndices().length) {
          state.invSplits = rebuildInvSplitsFromSelection();
          renderInvGenPreview();
          $("inv-gen-status").textContent = "Split options updated — " + state.invSplits.length + " PDF(s).";
        }
      } else if (state.invParsed && !state.invMultiSource) {
        state.invSplits = window.InvoiceGenerator.splitInvoice(state.invParsed, invGenOptions());
        renderInvGenPreview();
        $("inv-gen-status").textContent = "Split options updated — " + state.invSplits.length + " invoice(s).";
      }
    });
  });
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
