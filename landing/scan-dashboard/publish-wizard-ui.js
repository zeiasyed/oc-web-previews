(function (global) {
  "use strict";

  // Verified TSBPE prospect — real business, real website (dry run skips SMS only).
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
      '<p class="pw-demo-tag">Dry run — Blackmon Plumbing (Baytown, TX). Step 2 builds a real preview site; step 3 does not text Shane.</p>'
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

  var PROGRESS_STEPS = [
    { at: 12, label: "Loading lead data…" },
    { at: 32, label: "Generating home page…" },
    { at: 52, label: "Building services & contact pages…" },
    { at: 72, label: "Publishing to server…" },
    { at: 88, label: "Almost ready…" },
  ];

  function mount(container, opts) {
    var state = {
      lead: opts.lead || null,
      step: 1,
      previewUrl: null,
      connectUrl: null,
      busy: false,
      progress: 0,
      progressLabel: "",
      progressTimer: null,
      msg: "",
      err: "",
      smsPreview: "",
    };

    function stopProgress() {
      if (state.progressTimer) {
        clearInterval(state.progressTimer);
        state.progressTimer = null;
      }
    }

    function startProgress() {
      stopProgress();
      state.progress = 8;
      state.progressLabel = PROGRESS_STEPS[0].label;
      state.progressTimer = setInterval(function () {
        if (state.progress < 92) {
          state.progress = Math.min(92, state.progress + Math.random() * 5 + 2);
          for (var i = PROGRESS_STEPS.length - 1; i >= 0; i--) {
            if (state.progress >= PROGRESS_STEPS[i].at) {
              state.progressLabel = PROGRESS_STEPS[i].label;
              break;
            }
          }
          draw();
        }
      }, 450);
    }

    function finishProgress(cb) {
      stopProgress();
      state.progress = 100;
      state.progressLabel = "Site is live!";
      draw();
      setTimeout(cb, 500);
    }

    function progressHtml() {
      return (
        '<div class="pw-progress" role="status" aria-live="polite">' +
        '<p class="pw-progress-label">' +
        esc(state.progressLabel || "Creating site…") +
        "</p>" +
        '<div class="pw-progress-track">' +
        '<div class="pw-progress-fill" style="width:' +
        Math.round(state.progress) +
        '%"></div>' +
        "</div>" +
        '<p class="pw-progress-pct muted">' +
        Math.round(state.progress) +
        "%</p>" +
        "</div>"
      );
    }

    function previewReadyHtml(previewUrl) {
      return (
        '<div class="pw-preview-ready">' +
        '<p class="pw-success">Your preview site is ready</p>' +
        '<a class="btn pw-preview-btn" href="' +
        esc(previewUrl) +
        '" target="_blank" rel="noopener">Preview site</a>' +
        '<div class="pw-review">' +
        '<input readonly id="pw-preview-url" value="' +
        esc(previewUrl) +
        '">' +
        '<button type="button" class="btn btn-small" id="pw-copy-preview">Copy link</button>' +
        "</div></div>"
      );
    }

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
        esc([lead.city, lead.phone].filter(Boolean).join(" · ")) +
        "</p>" +
        '<div class="pw-info-grid">' +
        '<div class="pw-info-row"><strong>Phone</strong><span>' +
        esc(lead.phone || "—") +
        "</span></div>" +
        '<div class="pw-info-row"><strong>City</strong><span>' +
        esc(lead.city || "—") +
        "</span></div>" +
        '<div class="pw-info-row"><strong>Address</strong><span>' +
        esc(lead.address || "—") +
        "</span></div>" +
        '<div class="pw-info-row"><strong>Owner</strong><span>' +
        esc(lead.contact_name || "—") +
        "</span></div>" +
        '<div class="pw-info-row"><strong>Current website</strong><span>' +
        websiteHtml(lead) +
        "</span></div>" +
        "</div>" +
        "</section>" +
        '<section class="pw-panel">' +
        "<h4 style=\"margin:0 0 0.5rem\">Step 2 — Create site</h4>" +
        '<p class="sub" style="margin:0 0 0.75rem">' +
        (isDryRun(lead)
          ? "Builds a live preview on inertia-intel.com using Blackmon's real listing data."
          : "Generate a preview site for you to review before texting the plumber.") +
        "</p>" +
        (state.busy && !hasPreview
          ? progressHtml()
          : hasPreview
          ? previewReadyHtml(previewUrl)
          : '<button type="button" id="pw-create-btn" class="btn pw-create-btn">Create site</button>') +
        "</section>" +
        '<section class="pw-panel' +
        (hasPreview ? "" : " pw-panel-disabled") +
        '">' +
        "<h4 style=\"margin:0 0 0.5rem\">Step 3 — Push to plumber</h4>" +
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
          startProgress();
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
              finishProgress(function () {
                state.busy = false;
                state.progress = 0;
                state.previewUrl = result.preview_url;
                state.connectUrl = result.connect_url || "";
                state.step = 3;
                state.msg = isDryRun(lead)
                  ? "Live preview built — open Preview site above. Push is dry-run only."
                  : "Site created — preview it, then push to the plumber.";
                lead.preview_url = result.preview_url;
                lead.status = "published";
                draw();
              });
            })
            .catch(function (e) {
              stopProgress();
              state.busy = false;
              state.progress = 0;
              state.err = e.message || "Create failed";
              draw();
            });
        };
      }

      var copyBtn = container.querySelector("#pw-copy-preview");
      if (copyBtn) {
        copyBtn.onclick = function () {
          var input = container.querySelector("#pw-preview-url");
          if (input && navigator.clipboard) {
            navigator.clipboard.writeText(input.value);
            state.msg = "Preview link copied.";
            draw();
          }
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
              " — Alex from Solena Digital. Here's the new site preview we built for " +
              lead.company_name +
              ": " +
              previewLink;
            state.msg = "Dry run complete — no text sent to " + (lead.phone || "plumber") + ".";
            state.err = "";
            draw();
            return;
          }
          if (!lead.call_id) {
            state.err = "No call ID — use a live hot lead to push via SMS.";
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
      stopProgress();
      state.lead = lead;
      state.step = 1;
      state.previewUrl = lead && lead.preview_url ? lead.preview_url : null;
      state.msg = "";
      state.err = "";
      state.smsPreview = "";
      state.busy = false;
      state.progress = 0;
      state.progressLabel = "";
      draw();
    }

    draw();
    return { setLead: setLead, redraw: draw, stopProgress: stopProgress };
  }

  global.PublishWizardUI = { DEMO_LEAD: DEMO_LEAD, DRY_RUN_LEAD: DRY_RUN_LEAD, mount: mount };
})(window);
