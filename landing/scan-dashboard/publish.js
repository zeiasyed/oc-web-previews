(function () {
  var STORAGE_KEY = "solena_qr_scan_auth";
  var branding = window.BRANDING || {};
  var apiBase = (branding.qr_scan_api || "").replace(/\/+$/, "");

  var params = new URLSearchParams(window.location.search);
  var callId = params.get("call") || "";
  var publishKey = params.get("k") || "";
  var slugParam = params.get("slug") || "";

  var leadPanel = document.getElementById("lead-panel");
  var publishBtn = document.getElementById("publish-btn");
  var statusEl = document.getElementById("status");
  var linksEl = document.getElementById("links");
  var errorEl = document.getElementById("error");
  var companyEl = document.getElementById("company-name");
  var metaEl = document.getElementById("lead-meta");

  var queueRow = null;

  function getAuth() {
    return sessionStorage.getItem(STORAGE_KEY) || "";
  }

  function api(path, opts) {
    var headers = { "Content-Type": "application/json" };
    var auth = getAuth();
    if (auth) headers.Authorization = "Bearer " + auth;

    var url = apiBase + path;
    if (publishKey && path.indexOf("publish-queue") >= 0 && callId && url.indexOf("k=") < 0) {
      url += (url.indexOf("?") >= 0 ? "&" : "?") + "k=" + encodeURIComponent(publishKey);
    }

    var body = opts && opts.body ? Object.assign({}, opts.body) : undefined;
    if (body && publishKey && !body.k) body.k = publishKey;

    return fetch(url, {
      method: (opts && opts.method) || "GET",
      headers: headers,
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (res) {
      if (res.status === 401) throw new Error("Session expired — open the dashboard and sign in again.");
      if (!res.ok) throw new Error("API error " + res.status);
      return res.json();
    });
  }

  function showLinks(result) {
    linksEl.innerHTML =
      '<div class="copy-row"><input readonly id="preview-url" value="' +
      result.preview_url +
      '"><button type="button" id="copy-preview">Copy</button></div>' +
      '<a href="' +
      result.preview_url +
      '" target="_blank" rel="noopener">Open preview site</a>' +
      '<a href="' +
      result.connect_url +
      '" target="_blank" rel="noopener">Open connect / pricing funnel</a>';
    linksEl.classList.remove("hidden");
    document.getElementById("copy-preview").onclick = function () {
      navigator.clipboard.writeText(result.preview_url);
      statusEl.textContent = "Preview link copied — text or show the plumber now.";
    };
  }

  function loadLead() {
    errorEl.textContent = "";

    if (callId && publishKey) {
      api("/api/outreach/publish-queue?call=" + encodeURIComponent(callId))
        .then(function (data) {
          queueRow = data.queue;
          companyEl.textContent = queueRow.company_name;
          metaEl.textContent = [queueRow.city, queueRow.phone].filter(Boolean).join(" · ");
          leadPanel.classList.remove("hidden");
          if (data.site && data.site.preview_url) {
            publishBtn.textContent = "Republish preview site";
            statusEl.textContent = "Already published.";
            showLinks({ preview_url: data.site.preview_url, connect_url: data.site.connect_url || "" });
          }
        })
        .catch(function (e) {
          errorEl.textContent = e.message;
        });
      return;
    }

    if (slugParam && getAuth()) {
      companyEl.textContent = slugParam.replace(/-/g, " ");
      metaEl.textContent = "Manual publish";
      queueRow = { slug: slugParam, company_name: companyEl.textContent };
      leadPanel.classList.remove("hidden");
      return;
    }

    if (callId && !publishKey) {
      errorEl.textContent = "This publish link is missing its security key. Use the link from your hot-lead text.";
      return;
    }

    if (slugParam && !getAuth()) {
      errorEl.textContent = "Sign in on the dashboard first, then open this page again.";
      return;
    }

    errorEl.textContent = "Missing ?call= and ?k= in the URL.";
  }

  publishBtn.addEventListener("click", function () {
    publishBtn.disabled = true;
    statusEl.textContent = "Publishing…";
    errorEl.textContent = "";
    api("/api/outreach/publish-preview", {
      method: "POST",
      body: {
        call_id: callId || undefined,
        k: publishKey || undefined,
        lead: queueRow || { slug: slugParam },
      },
    })
      .then(function (result) {
        publishBtn.disabled = false;
        publishBtn.textContent = "Republish preview site";
        statusEl.textContent = "Live! Share the preview link with the plumber on your call.";
        showLinks(result);
      })
      .catch(function (e) {
        publishBtn.disabled = false;
        errorEl.textContent = e.message || "Publish failed";
        statusEl.textContent = "";
      });
  });

  loadLead();
})();
