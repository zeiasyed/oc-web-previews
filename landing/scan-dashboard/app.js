(function () {
  var STORAGE_KEY = "solena_qr_scan_auth";
  var branding = window.BRANDING || {};
  var apiBase = (branding.qr_scan_api || "").replace(/\/+$/, "");

  var loginEl = document.getElementById("login");
  var dashEl = document.getElementById("dashboard");
  var passwordInput = document.getElementById("password");
  var loginBtn = document.getElementById("login-btn");
  var loginError = document.getElementById("login-error");
  var refreshBtn = document.getElementById("refresh-btn");
  var logoutBtn = document.getElementById("logout-btn");
  var tabQr = document.getElementById("tab-qr");
  var tabOutreach = document.getElementById("tab-outreach");
  var tabPublish = document.getElementById("tab-publish");
  var outreachRoot = document.getElementById("outreach-playbook-root");
  var publishRoot = document.getElementById("publish-queue-root");
  var outreachMounted = false;
  var publishController = null;
  var totalEl = document.getElementById("total-scans");
  var slugCountEl = document.getElementById("slug-count");
  var funnelViewsEl = document.getElementById("funnel-views");
  var funnelClicksEl = document.getElementById("funnel-clicks");
  var funnelStepsBody = document.getElementById("funnel-steps-table");
  var clicksBody = document.getElementById("clicks-table");
  var funnelRecentBody = document.getElementById("funnel-recent-table");
  var tableBody = document.getElementById("slug-table");
  var stateBody = document.getElementById("state-table");
  var recentBody = document.getElementById("recent-table");
  var statusEl = document.getElementById("status");

  function resetOutreachPanels() {
    outreachMounted = false;
    publishController = null;
    if (outreachRoot) outreachRoot.innerHTML = "";
    if (publishRoot) publishRoot.innerHTML = "";
  }

  function switchTab(name) {
    document.querySelectorAll(".dash-tab").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === name);
    });
    if (tabQr) tabQr.classList.toggle("hidden", name !== "qr");
    if (tabOutreach) tabOutreach.classList.toggle("hidden", name !== "outreach");
    if (tabPublish) tabPublish.classList.toggle("hidden", name !== "publish");
    if (refreshBtn) refreshBtn.style.display = name === "qr" ? "" : "none";
    if (publishController && publishController.stopPoll) publishController.stopPoll();
    if (name === "outreach") mountOutreachBuilder();
    if (name === "publish") mountPublishQueue();
  }

  function mountPublishQueue() {
    if (!publishRoot || !window.PublishQueueUI || !getToken()) return;
    if (publishController) {
      publishController.refresh();
      if (publishController.startPoll) publishController.startPoll();
      return;
    }
    publishController = window.PublishQueueUI.mount(publishRoot, apiBase, getToken, function () {});
  }

  function mountOutreachBuilder() {
    if (!outreachRoot || !window.OutreachPlaybookUI || !getToken()) return;
    if (outreachMounted) return;
    outreachMounted = true;
    window.OutreachPlaybookUI.mount(outreachRoot, apiBase, getToken, function () {});
  }

  document.querySelectorAll(".dash-tab").forEach(function (btn) {
    btn.addEventListener("click", function () {
      switchTab(btn.getAttribute("data-tab"));
    });
  });

  function getToken() {
    return sessionStorage.getItem(STORAGE_KEY) || "";
  }

  function setToken(token) {
    if (token) sessionStorage.setItem(STORAGE_KEY, token);
    else sessionStorage.removeItem(STORAGE_KEY);
  }

  function showDashboard(show) {
    loginEl.classList.toggle("hidden", show);
    dashEl.classList.toggle("hidden", !show);
  }

  function businessName(slug) {
    var list = window.BUSINESSES || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].slug === slug) return list[i].name;
    }
    return slug;
  }

  function fmtWhen(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString();
    } catch (e) {
      return iso;
    }
  }

  function fmtLocation(row) {
    if (!row) return "—";
    if (row.last_location) return row.last_location;
    if (row.location) return row.location;
    var parts = [];
    if (row.city) parts.push(row.city);
    if (row.region_code) parts.push(row.region_code);
    else if (row.region) parts.push(row.region);
    if (row.country) parts.push(row.country);
    return parts.length ? parts.join(", ") : "—";
  }

  function fmtState(row) {
    if (!row) return "—";
    if (row.state && row.state !== "Unknown") return row.state;
    return "—";
  }

  var PAGE_LABELS = {
    connect: "1. Preview landing",
    pricing: "2. Pricing",
    register: "3. Register",
    payment: "4. Payment",
  };

  function fmtPage(page) {
    return PAGE_LABELS[page] || page || "—";
  }

  function fmtEvent(row) {
    if (!row) return "—";
    if (row.event_type === "page_view") return "Page view";
    return row.element_label || row.element_id || "Click";
  }

  function fmtDropOff(value) {
    if (value == null) return "—";
    if (value <= 0) return "0%";
    return value + "%";
  }

  async function fetchSummary(token) {
    var res = await fetch(apiBase + "/api/summary", {
      headers: { Authorization: "Bearer " + token },
    });
    if (res.status === 401) throw new Error("Invalid password");
    if (!res.ok) throw new Error("API error " + res.status);
    return res.json();
  }

  function renderSummary(data) {
    var funnel = data.funnel || {};
    totalEl.textContent = String(data.total || 0);
    slugCountEl.textContent = String((data.by_slug || []).length);
    funnelViewsEl.textContent = String(funnel.total_page_views || 0);
    funnelClicksEl.textContent = String(funnel.total_clicks || 0);

    funnelStepsBody.innerHTML = "";
    (funnel.funnel_steps || []).forEach(function (row) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td><strong>" +
        fmtPage(row.page) +
        "</strong></td>" +
        "<td>" +
        row.views +
        "</td>" +
        "<td>" +
        row.visitors +
        "</td>" +
        "<td>" +
        fmtDropOff(row.drop_from_prev) +
        "</td>";
      funnelStepsBody.appendChild(tr);
    });

    clicksBody.innerHTML = "";
    (funnel.top_clicks || []).forEach(function (row) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td><strong>" +
        (row.element_label || row.element_id) +
        '</strong><div class="muted">' +
        (row.element_id || "") +
        "</div></td>" +
        "<td>" +
        fmtPage(row.page) +
        "</td>" +
        "<td>" +
        row.clicks +
        "</td>" +
        "<td>" +
        fmtWhen(row.last_click) +
        "</td>";
      clicksBody.appendChild(tr);
    });

    funnelRecentBody.innerHTML = "";
    (funnel.recent || []).forEach(function (row) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" +
        businessName(row.slug) +
        "</td><td>" +
        fmtEvent(row) +
        "</td><td>" +
        fmtPage(row.page) +
        "</td><td>" +
        fmtLocation(row) +
        "</td><td>" +
        fmtWhen(row.event_at) +
        "</td>";
      funnelRecentBody.appendChild(tr);
    });

    tableBody.innerHTML = "";
    (data.by_slug || []).forEach(function (row) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" +
        businessName(row.slug) +
        '<div class="muted">' +
        row.slug +
        "</div></td>" +
        "<td><strong>" +
        row.count +
        "</strong></td>" +
        "<td>" +
        fmtLocation(row) +
        "</td>" +
        "<td>" +
        fmtWhen(row.last_scan) +
        "</td>";
      tableBody.appendChild(tr);
    });
    stateBody.innerHTML = "";
    (data.by_state || []).forEach(function (row) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td><strong>" +
        fmtState(row) +
        "</strong></td>" +
        "<td>" +
        (row.country || "—") +
        "</td>" +
        "<td>" +
        row.count +
        "</td>" +
        "<td>" +
        fmtWhen(row.last_scan) +
        "</td>";
      stateBody.appendChild(tr);
    });
    recentBody.innerHTML = "";
    (data.recent || []).forEach(function (row) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" +
        businessName(row.slug) +
        "</td><td>" +
        fmtLocation(row) +
        "</td><td>" +
        (row.device || "—") +
        "</td><td>" +
        fmtWhen(row.scanned_at) +
        "</td>";
      recentBody.appendChild(tr);
    });
    statusEl.textContent = "Updated " + new Date().toLocaleString();
  }

  async function refresh() {
    if (!apiBase) {
      statusEl.textContent = "Set qr_scan_api in branding.js after deploying the worker.";
      return;
    }
    var token = getToken();
    if (!token) {
      showDashboard(false);
      return;
    }
    try {
      statusEl.textContent = "Loading…";
      var data = await fetchSummary(token);
      renderSummary(data);
      showDashboard(true);
      resetOutreachPanels();
      var activeTab = document.querySelector(".dash-tab.active");
      switchTab(activeTab ? activeTab.getAttribute("data-tab") : "qr");
    } catch (err) {
      setToken("");
      showDashboard(false);
      loginError.textContent = err.message || "Could not load scans";
    }
  }

  loginBtn.addEventListener("click", function () {
    loginError.textContent = "";
    var token = passwordInput.value.trim();
    if (!token) return;
    setToken(token);
    refresh();
  });

  logoutBtn.addEventListener("click", function () {
    setToken("");
    passwordInput.value = "";
    resetOutreachPanels();
    showDashboard(false);
  });

  refreshBtn.addEventListener("click", refresh);

  if (!apiBase) {
    loginError.textContent =
      "Tracking API not configured yet. Deploy landing/qr-scan-worker and set qr_scan_api in branding.";
  } else if (getToken()) {
    refresh();
  }
})();
