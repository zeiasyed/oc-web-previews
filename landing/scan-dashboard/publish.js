(function () {
  var STORAGE_KEY = "solena_qr_scan_auth";
  var branding = window.BRANDING || {};
  var apiBase = (branding.qr_scan_api || "").replace(/\/+$/, "");

  var params = new URLSearchParams(window.location.search);
  var callId = params.get("call") || "";
  var publishKey = params.get("k") || "";
  var slugParam = params.get("slug") || "";
  var demoRaw = (params.get("demo") || "").toLowerCase();
  var demoParam = demoRaw === "1" || demoRaw === "true" || demoRaw === "yes";

  var alertBanner = document.getElementById("alert-banner");
  var wizardRoot = document.getElementById("wizard-root");
  var errorEl = document.getElementById("error");

  var subtitleEl = document.getElementById("subtitle");

  function setError(msg) {
    if (errorEl) errorEl.textContent = msg || "";
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

  function normalizeLead(row, prospect) {
    var p = prospect || {};
    return {
      call_id: row.call_id || callId || "",
      slug: row.slug || slugParam || "",
      company_name: row.company_name || p.company_name || "",
      city: row.city || p.city || "",
      phone: row.phone || p.phone || "",
      address: row.address || p.address || "",
      website: p.website || row.website || "",
      has_website: !!(p.has_website || row.has_website || p.website || row.website),
      website_label: p.website_label || row.website || "None listed on Google",
      status: row.status || "pending",
      preview_url: row.preview_url || null,
      demo: !!row.demo,
    };
  }

  function mountWizard(lead) {
    if (!wizardRoot) return;
    if (!window.PublishWizardUI) {
      setError("Wizard scripts did not load. Hard refresh this page (Ctrl+F5 or Cmd+Shift+R).");
      return;
    }
    window.PublishWizardUI.mount(wizardRoot, {
      lead: lead,
      api: api,
      publishKey: publishKey || undefined,
      hasAuth: !!getAuth(),
      dryRunPage: demoParam,
    });
  }

  function loadLead() {
    setError("");

    if (demoParam) {
      if (subtitleEl) {
        subtitleEl.textContent =
          "Dry run with Blackmon Plumbing (Baytown, TX) — live site build, no text sent.";
      }
      if (!window.PublishWizardUI) {
        setError("Wizard scripts did not load. Hard refresh this page (Ctrl+F5 or Cmd+Shift+R).");
        return;
      }
      mountWizard(Object.assign({}, window.PublishWizardUI.DRY_RUN_LEAD || window.PublishWizardUI.DEMO_LEAD));
      return;
    }

    if (callId && publishKey) {
      if (alertBanner) alertBanner.classList.remove("hidden");
      api("/api/outreach/publish-queue?call=" + encodeURIComponent(callId))
        .then(function (data) {
          var lead = normalizeLead(data.queue || {}, data.prospect || {});
          if (data.site && data.site.preview_url) {
            lead.preview_url = data.site.preview_url;
            lead.status = "published";
          }
          mountWizard(lead);
        })
        .catch(function (e) {
          setError(e.message);
        });
      return;
    }

    if (slugParam && getAuth()) {
      mountWizard(
        normalizeLead({
          slug: slugParam,
          company_name: slugParam.replace(/-/g, " "),
        })
      );
      return;
    }

    if (callId && !publishKey) {
      setError("This link is missing its security key. Use the link from your 1-minute email alert.");
      return;
    }

    if (slugParam && !getAuth()) {
      setError("Sign in on the main dashboard first, then open this page again.");
      return;
    }

    setError("Missing ?call= and ?k= in the URL.");
  }

  try {
    loadLead();
  } catch (e) {
    setError((e && e.message) || "Page failed to load.");
  }
})();
