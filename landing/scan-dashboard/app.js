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
  var totalEl = document.getElementById("total-scans");
  var slugCountEl = document.getElementById("slug-count");
  var tableBody = document.getElementById("slug-table");
  var recentBody = document.getElementById("recent-table");
  var statusEl = document.getElementById("status");

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

  async function fetchSummary(token) {
    var res = await fetch(apiBase + "/api/summary", {
      headers: { Authorization: "Bearer " + token },
    });
    if (res.status === 401) throw new Error("Invalid password");
    if (!res.ok) throw new Error("API error " + res.status);
    return res.json();
  }

  function renderSummary(data) {
    totalEl.textContent = String(data.total || 0);
    slugCountEl.textContent = String((data.by_slug || []).length);
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
        fmtWhen(row.last_scan) +
        "</td>";
      tableBody.appendChild(tr);
    });
    recentBody.innerHTML = "";
    (data.recent || []).forEach(function (row) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" +
        businessName(row.slug) +
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
