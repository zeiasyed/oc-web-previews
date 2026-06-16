(function () {
  var STORAGE_KEY = "solena_qr_scan_auth";
  var branding = window.BRANDING || {};
  var apiBase = (branding.qr_scan_api || "").replace(/\/+$/, "");

  var params = new URLSearchParams(window.location.search);
  var callId = params.get("call") || "";
  var publishKey = params.get("k") || "";
  var slugParam = params.get("slug") || "";

  var alertBanner = document.getElementById("alert-banner");
  var leadPanel = document.getElementById("lead-panel");
  var publishBtn = document.getElementById("publish-btn");
  var sendSmsBtn = document.getElementById("send-sms-btn");
  var statusEl = document.getElementById("status");
  var linksEl = document.getElementById("links");
  var errorEl = document.getElementById("error");
  var companyEl = document.getElementById("company-name");
  var metaEl = document.getElementById("lead-meta");
  var detailsEl = document.getElementById("prospect-details");

  var queueRow = null;
  var prospect = null;

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

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
      if (res.status === 401) throw new Error("Session expired — use the link from your email alert.");
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (d) {
          throw new Error(d.error || "API error " + res.status);
        });
      }
      return res.json();
    });
  }

  function renderProspectDetails(p) {
    if (!p || !detailsEl) return;
    var websiteHtml = p.website
      ? '<a href="' + esc(p.website) + '" target="_blank" rel="noopener">' + esc(p.website) + "</a>"
      : esc(p.website_label || "None listed");
    detailsEl.innerHTML =
      '<div class="prospect-row"><strong>Phone</strong><span>' + esc(p.phone || "—") + "</span></div>" +
      '<div class="prospect-row"><strong>City</strong><span>' + esc(p.city || "—") + "</span></div>" +
      '<div class="prospect-row"><strong>Current site</strong><span>' + websiteHtml + "</span></div>";
  }

  function showLinks(result) {
    linksEl.innerHTML =
      '<div class="copy-row"><input readonly id="preview-url" value="' +
      esc(result.preview_url) +
      '"><button type="button" id="copy-preview">Copy</button></div>' +
      '<a href="' +
      esc(result.preview_url) +
      '" target="_blank" rel="noopener">Open public preview site</a>' +
      (result.connect_url
        ? '<a href="' + esc(result.connect_url) + '" target="_blank" rel="noopener">Open connect / pricing funnel</a>'
        : "");
    linksEl.classList.remove("hidden");
    if (sendSmsBtn) {
      sendSmsBtn.classList.remove("hidden");
      sendSmsBtn.disabled = false;
    }
    document.getElementById("copy-preview").onclick = function () {
      navigator.clipboard.writeText(result.preview_url);
      statusEl.textContent = "Preview link copied.";
    };
  }

  function loadLead() {
    errorEl.textContent = "";

    if (callId && publishKey) {
      if (alertBanner) alertBanner.classList.remove("hidden");
      api("/api/outreach/publish-queue?call=" + encodeURIComponent(callId))
        .then(function (data) {
          queueRow = data.queue;
          prospect = data.prospect || {};
          companyEl.textContent = queueRow.company_name || prospect.company_name;
          metaEl.textContent = [queueRow.city || prospect.city, queueRow.phone || prospect.phone]
            .filter(Boolean)
            .join(" · ");
          renderProspectDetails(prospect);
          leadPanel.classList.remove("hidden");
          if (data.site && data.site.preview_url) {
            publishBtn.textContent = "Rebuild their new site";
            statusEl.textContent = "Preview site is live.";
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
      errorEl.textContent = "This link is missing its security key. Use the link from your 1-minute email alert.";
      return;
    }

    if (slugParam && !getAuth()) {
      errorEl.textContent = "Sign in on the main dashboard first, then open this page again.";
      return;
    }

    errorEl.textContent = "Missing ?call= and ?k= in the URL.";
  }

  publishBtn.addEventListener("click", function () {
    publishBtn.disabled = true;
    statusEl.textContent = "Building preview site…";
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
        publishBtn.textContent = "Rebuild their new site";
        statusEl.textContent = "Site is live — open it or text the link to the plumber.";
        showLinks(result);
      })
      .catch(function (e) {
        publishBtn.disabled = false;
        errorEl.textContent = e.message || "Build failed";
        statusEl.textContent = "";
      });
  });

  if (sendSmsBtn) {
    sendSmsBtn.addEventListener("click", function () {
      if (!callId || !publishKey) return;
      sendSmsBtn.disabled = true;
      statusEl.textContent = "Sending text…";
      errorEl.textContent = "";
      api("/api/outreach/send-preview-sms", {
        method: "POST",
        body: { call_id: callId, k: publishKey },
      })
        .then(function (result) {
          sendSmsBtn.disabled = false;
          if (result.ok) {
            statusEl.textContent = "Preview link sent to " + (result.to || "plumber") + ".";
          } else {
            errorEl.textContent = (result.sms && result.sms.reason) || "SMS failed";
            statusEl.textContent = "";
          }
        })
        .catch(function (e) {
          sendSmsBtn.disabled = false;
          errorEl.textContent = e.message || "SMS failed";
          statusEl.textContent = "";
        });
    });
  }

  loadLead();
})();
