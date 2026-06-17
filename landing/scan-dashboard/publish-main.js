(function (global) {
  "use strict";

  // Verified TSBPE prospect â€” real business, real website (dry run skips SMS only).
  var DRY_RUN_LEAD = {
    demo: true,
    dry_run: true,
    call_id: "",
    slug: "blackmon-plumbing-services-baytown",
    company_name: "Blackmon Plumbing Services",
    city: "Baytown, TX",
    phone: "(281) 427-8325",
    address: "4315 Barkaloo Rd, Baytown, TX 77521",
    website: "https://www.blackmonplumbing.com",
    has_website: true,
    website_label: "https://www.blackmonplumbing.com",
    contact_name: "Shane Blackmon",
    status: "pending",
    preview_url: null,
  };

  var DEMO_LEAD = DRY_RUN_LEAD;

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function isDryRun(lead) {
    return !!(lead && (lead.demo || lead.dry_run));
  }

  function dryRunBanner(lead) {
    if (!isDryRun(lead)) return "";
    return (
      '<p class="pw-demo-tag">Dry run â€” Blackmon Plumbing (Baytown, TX). Step 2 builds a real preview site; step 3 does not text Shane.</p>'
    );
  }

  function dryRunPushNote(lead) {
    if (!isDryRun(lead)) return "";
    return (
      '<p class="muted" style="margin:0.5rem 0 0;font-size:0.85rem">Dry run: no SMS is sent to ' +
      esc(lead.phone || "the plumber") +
      ".</p>"
    );
  }

  function authHint(opts) {
    if (!opts || opts.hasAuth !== false || !opts.dryRunPage) return "";
    return (
      '<p class="pw-auth-hint">Sign in on the <a href="index.html">main dashboard</a> first (same tab origin), then return here to run the live site build.</p>'
    );
  }

  function stepClass(current, n) {
    if (current > n) return "pw-step pw-step-done";
    if (current === n) return "pw-step pw-step-active";
    return "pw-step";
  }

  function mount(container, opts) {
    var state = {
      lead: opts.lead || null,
      step: 1,
      previewUrl: null,
      connectUrl: null,
      busy: false,
      msg: "",
      err: "",
      smsPreview: "",
    };

    function websiteHtml(lead) {
      var url = lead.website || "";
      if (url) {
        return (
          '<a href="' +
          esc(url) +
          '" target="_blank" rel="noopener">' +
          esc(url) +
          "</a>"
        );
      }
      return '<span class="muted">' + esc(lead.website_label || "None listed on Google") + "</span>";
    }

    function draw() {
      var lead = state.lead;
      if (!lead) {
        container.innerHTML =
          '<div class="pw-empty card"><p class="muted" style="margin:0">Select a hot lead from the list above, or load the Blackmon Plumbing dry run.</p></div>';
        return;
      }

      var hasPreview = !!(state.previewUrl || (lead.preview_url && lead.status === "published"));
      var previewUrl = state.previewUrl || lead.preview_url || "";
      var currentStep = hasPreview ? 3 : state.step;

      container.innerHTML =
        '<div class="pw-wizard card">' +
        dryRunBanner(lead) +
        authHint(opts) +
        '<nav class="pw-steps" aria-label="Build flow">' +
        '<div class="' +
        stepClass(currentStep, 1) +
        '"><span class="pw-step-num">1</span><span class="pw-step-label">Lead info</span></div>' +
        '<div class="pw-step-line"></div>' +
        '<div class="' +
        stepClass(currentStep, 2) +
        '"><span class="pw-step-num">2</span><span class="pw-step-label">Create site</span></div>' +
        '<div class="pw-step-line"></div>' +
        '<div class="' +
        stepClass(currentStep, 3) +
        '"><span class="pw-step-num">3</span><span class="pw-step-label">Push to plumber</span></div>' +
        "</nav>" +
        '<section class="pw-panel">' +
        "<h3 style=\"margin:0 0 0.25rem\">" +
        esc(lead.company_name) +
        "</h3>" +
        '<p class="muted" style="margin:0 0 1rem">' +
        esc([lead.city, lead.phone].filter(Boolean).join(" Â· ")) +
        "</p>" +
        '<div class="pw-info-grid">' +
        '<div class="pw-info-row"><strong>Phone</strong><span>' +
        esc(lead.phone || "â€”") +
        "</span></div>" +
        '<div class="pw-info-row"><strong>City</strong><span>' +
        esc(lead.city || "â€”") +
        "</span></div>" +
        '<div class="pw-info-row"><strong>Address</strong><span>' +
        esc(lead.address || "â€”") +
        "</span></div>" +
        '<div class="pw-info-row"><strong>Owner</strong><span>' +
        esc(lead.contact_name || "â€”") +
        "</span></div>" +
        '<div class="pw-info-row"><strong>Current website</strong><span>' +
        websiteHtml(lead) +
        "</span></div>" +
        "</div>" +
        "</section>" +
        '<section class="pw-panel">' +
        "<h4 style=\"margin:0 0 0.5rem\">Step 2 â€” Create site</h4>" +
        '<p class="sub" style="margin:0 0 0.75rem">' +
        (isDryRun(lead)
          ? "Builds a live preview on inertia-intel.com using Blackmon's real listing data."
          : "Generate a preview site for you to review before texting the plumber.") +
        "</p>" +
        (hasPreview
          ? '<p class="pw-success">Preview ready â€” review the link below before pushing.</p>' +
            '<div class="pw-review">' +
            '<input readonly id="pw-preview-url" value="' +
            esc(previewUrl) +
            '">' +
            '<a class="btn btn-small" href="' +
            esc(previewUrl) +
            '" target="_blank" rel="noopener">Review site</a>' +
            "</div>"
          : '<button type="button" id="pw-create-btn" class="btn pw-create-btn"' +
            (state.busy ? " disabled" : "") +
            ">" +
            (state.busy ? "Creatingâ€¦" : "Create site") +
            "</button>") +
        "</section>" +
        '<section class="pw-panel' +
        (hasPreview ? "" : " pw-panel-disabled") +
        '">' +
        "<h4 style=\"margin:0 0 0.5rem\">Step 3 â€” Push to plumber</h4>" +
        '<p class="sub" style="margin:0 0 0.75rem">Text the preview link to <strong>' +
        esc(lead.phone || "their number") +
        "</strong> while you are on the call.</p>" +
        '<button type="button" id="pw-push-btn" class="btn pw-push-btn"' +
        (!hasPreview || state.busy ? " disabled" : "") +
        ">Push preview link via text</button>" +
        dryRunPushNote(lead) +
        (state.smsPreview
          ? '<div class="pw-sms-preview"><strong>Text that would send</strong><p>' +
            esc(state.smsPreview) +
            "</p></div>"
          : "") +
        "</section>" +
        (state.msg ? '<p class="pw-msg">' + esc(state.msg) + "</p>" : "") +
        (state.err ? '<p class="error">' + esc(state.err) + "</p>" : "") +
        "</div>";

      var createBtn = container.querySelector("#pw-create-btn");
      if (createBtn) {
        createBtn.onclick = function () {
          state.busy = true;
          state.err = "";
          state.msg = "";
          draw();
          var body = {
            lead: {
              slug: lead.slug,
              company_name: lead.company_name,
              phone: lead.phone,
              city: lead.city,
              address: lead.address,
            },
          };
          if (lead.call_id) body.call_id = lead.call_id;
          if (opts.publishKey) body.k = opts.publishKey;
          opts
            .api("/api/outreach/publish-preview", { method: "POST", body: body })
            .then(function (result) {
              state.busy = false;
              state.previewUrl = result.preview_url;
              state.connectUrl = result.connect_url || "";
              state.step = 3;
              state.msg = isDryRun(lead)
                ? "Live preview built â€” open it below. Push is dry-run only (no text to Shane)."
                : "Site created â€” review it, then push to the plumber.";
              lead.preview_url = result.preview_url;
              lead.status = "published";
              draw();
            })
            .catch(function (e) {
              state.busy = false;
              state.err = e.message || "Create failed";
              draw();
            });
        };
      }

      var pushBtn = container.querySelector("#pw-push-btn");
      if (pushBtn) {
        pushBtn.onclick = function () {
          if (isDryRun(lead)) {
            var previewLink = state.previewUrl || lead.preview_url || "";
            var first = (lead.contact_name || "there").split(" ")[0];
            state.smsPreview =
              "Hi " +
              first +
              " â€” Alex from Solena Digital. Here's the new site preview we built for " +
              lead.company_name +
              ": " +
              previewLink;
            state.msg = "Dry run complete â€” no text sent to " + (lead.phone || "plumber") + ".";
            state.err = "";
            draw();
            return;
          }
          if (!lead.call_id) {
            state.err = "No call ID â€” use a live hot lead to push via SMS.";
            draw();
            return;
          }
          state.busy = true;
          state.err = "";
          state.msg = "";
          draw();
          opts
            .api("/api/outreach/send-preview-sms", {
              method: "POST",
              body: { call_id: lead.call_id, k: opts.publishKey || undefined },
            })
            .then(function (result) {
              state.busy = false;
              if (result.ok) {
                state.msg = "Sent to " + (result.to || lead.phone) + ".";
              } else {
                state.err = (result.sms && result.sms.reason) || "SMS failed";
              }
              draw();
            })
            .catch(function (e) {
              state.busy = false;
              state.err = e.message || "Push failed";
              draw();
            });
        };
      }
    }

    function setLead(lead) {
      state.lead = lead;
      state.step = 1;
      state.previewUrl = lead && lead.preview_url ? lead.preview_url : null;
      state.msg = "";
      state.err = "";
      state.smsPreview = "";
      state.busy = false;
      draw();
    }

    draw();
    return { setLead: setLead, redraw: draw };
  }

  global.PublishWizardUI = { DEMO_LEAD: DEMO_LEAD, DRY_RUN_LEAD: DRY_RUN_LEAD, mount: mount };
})(window);
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
      if (res.status === 401) {
        throw new Error(
          publishKey
            ? "This alert link expired or is invalid — sign in on the main dashboard, or use the newest email alert link."
            : "Sign in on the main dashboard first (same browser tab), then open this page again."
        );
      }
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
          "Dry run with Blackmon Plumbing (Baytown, TX) â€” live site build, no text sent.";
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
