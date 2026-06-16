(function () {
  var TOKEN_KEY = "solena_outreach_api_token";
  var branding = window.BRANDING || {};
  var apiBase = (branding.outreach_api || "https://api.inertia-intel.com").replace(/\/+$/, "");

  var params = new URLSearchParams(window.location.search);
  var callId = params.get("call") || "";
  var slugParam = params.get("slug") || "";

  var tokenPanel = document.getElementById("token-panel");
  var leadPanel = document.getElementById("lead-panel");
  var apiTokenInput = document.getElementById("api-token");
  var saveTokenBtn = document.getElementById("save-token");
  var publishBtn = document.getElementById("publish-btn");
  var statusEl = document.getElementById("status");
  var linksEl = document.getElementById("links");
  var errorEl = document.getElementById("error");
  var companyEl = document.getElementById("company-name");
  var metaEl = document.getElementById("lead-meta");

  var queueRow = null;

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  }

  function api(path, opts) {
    return fetch(apiBase + path, {
      method: (opts && opts.method) || "GET",
      headers: {
        Authorization: "Bearer " + getToken(),
        "Content-Type": "application/json",
      },
      body: opts && opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (res) {
      if (res.status === 401) throw new Error("Invalid API token");
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
    if (!getToken()) {
      tokenPanel.classList.remove("hidden");
      return;
    }
    tokenPanel.classList.add("hidden");
    errorEl.textContent = "";

    if (callId) {
      api("/voice/plumber-outreach/publish-queue?call=" + encodeURIComponent(callId))
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

    if (slugParam) {
      companyEl.textContent = slugParam.replace(/-/g, " ");
      metaEl.textContent = "Manual publish";
      queueRow = { slug: slugParam, company_name: companyEl.textContent };
      leadPanel.classList.remove("hidden");
      return;
    }

    errorEl.textContent = "Missing ?call= or ?slug= in the URL.";
  }

  publishBtn.addEventListener("click", function () {
    if (!getToken()) return;
    publishBtn.disabled = true;
    statusEl.textContent = "Publishing…";
    errorEl.textContent = "";
    api("/voice/plumber-outreach/publish-preview", {
      method: "POST",
      body: {
        call_id: callId || undefined,
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

  saveTokenBtn.addEventListener("click", function () {
    var t = apiTokenInput.value.trim();
    if (!t) return;
    sessionStorage.setItem(TOKEN_KEY, t);
    loadLead();
  });

  if (getToken()) apiTokenInput.value = getToken();
  loadLead();
})();
