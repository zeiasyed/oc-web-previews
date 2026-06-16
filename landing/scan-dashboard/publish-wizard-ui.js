(function (global) {
  "use strict";

  var DEMO_LEAD = {
    demo: true,
    call_id: "",
    slug: "demo-acme-plumbing-riverside",
    company_name: "Acme Plumbing & Rooting",
    city: "Riverside",
    phone: "(951) 555-0142",
    address: "4200 Market St, Riverside, CA",
    website: "https://www.example-plumber.com",
    has_website: true,
    website_label: "https://www.example-plumber.com",
    status: "pending",
    preview_url: null,
  };

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
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
          '<div class="pw-empty card"><p class="muted" style="margin:0">Select a hot lead from the list above, or load demo data to walk through the steps.</p></div>';
        return;
      }

      var hasPreview = !!(state.previewUrl || (lead.preview_url && lead.status === "published"));
      var previewUrl = state.previewUrl || lead.preview_url || "";
      var currentStep = hasPreview ? 3 : state.step;

      container.innerHTML =
        '<div class="pw-wizard card">' +
        (lead.demo ? '<p class="pw-demo-tag">Demo lead — SMS push is simulated</p>' : "") +
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
        '<div class="pw-info-row"><strong>Current website</strong><span>' +
        websiteHtml(lead) +
        "</span></div>" +
        "</div>" +
        "</section>" +
        '<section class="pw-panel">' +
        "<h4 style=\"margin:0 0 0.5rem\">Step 2 — Create site</h4>" +
        '<p class="sub" style="margin:0 0 0.75rem">Generate a preview site for you to review before texting the plumber.</p>' +
        (hasPreview
          ? '<p class="pw-success">Preview ready — review the link below before pushing.</p>' +
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
            (state.busy ? "Creating…" : "Create site") +
            "</button>") +
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
        (lead.demo ? '<p class="muted" style="margin:0.5rem 0 0;font-size:0.85rem">Demo mode: no SMS is sent.</p>' : "") +
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
              state.msg = "Site created — review it, then push to the plumber.";
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
          if (lead.demo) {
            state.msg = "Demo: would text preview link to " + (lead.phone || "plumber") + ".";
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
      state.lead = lead;
      state.step = 1;
      state.previewUrl = lead && lead.preview_url ? lead.preview_url : null;
      state.msg = "";
      state.err = "";
      state.busy = false;
      draw();
    }

    draw();
    return { setLead: setLead, redraw: draw };
  }

  global.PublishWizardUI = { DEMO_LEAD: DEMO_LEAD, mount: mount };
})(window);
