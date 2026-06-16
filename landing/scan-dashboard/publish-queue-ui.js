(function (global) {
  "use strict";

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function fmtWhen(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString();
    } catch (e) {
      return iso;
    }
  }

  function mount(container, apiBase, getToken, onTokenNeeded) {
    var ui = { items: [], activeLead: null, poll: null };

    function api(path, opts) {
      var token = getToken();
      if (!token) {
        if (onTokenNeeded) onTokenNeeded();
        return Promise.reject(new Error("Sign in to the dashboard first."));
      }
      return fetch(apiBase + path, {
        method: (opts && opts.method) || "GET",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: opts && opts.body ? JSON.stringify(opts.body) : undefined,
      }).then(function (res) {
        if (res.status === 401) throw new Error("Session expired — sign in again.");
        if (!res.ok) {
          return res.json().catch(function () { return {}; }).then(function (d) {
            throw new Error(d.error || "API error " + res.status);
          });
        }
        return res.json();
      });
    }

    function normalizeLead(row) {
      return {
        call_id: row.call_id || "",
        slug: row.slug || "",
        company_name: row.company_name || row.slug || "Lead",
        city: row.city || "",
        phone: row.phone || "",
        address: row.address || "",
        website: row.website || "",
        has_website: !!row.has_website || !!row.website,
        website_label: row.website || "None listed on Google",
        status: row.status || "pending",
        preview_url: row.preview_url || null,
        created_at: row.created_at,
        demo: !!row.demo,
      };
    }

    function mountWizard() {
      var wizardEl = container.querySelector("#publish-wizard-root");
      if (!wizardEl || !global.PublishWizardUI || !ui.activeLead) return;
      global.PublishWizardUI.mount(wizardEl, { lead: ui.activeLead, api: api });
    }

    function selectLead(lead) {
      ui.activeLead = lead;
      draw();
      mountWizard();
    }

    function loadDemo() {
      selectLead(Object.assign({}, global.PublishWizardUI.DEMO_LEAD));
    }

    function selectFromRow(row) {
      var lead = normalizeLead(row);
      if (!row.call_id) {
        selectLead(lead);
        return;
      }
      api("/api/outreach/publish-queue?call=" + encodeURIComponent(row.call_id))
        .then(function (data) {
          var merged = normalizeLead(Object.assign({}, row, data.queue || {}, data.prospect || {}));
          if (data.site && data.site.preview_url) {
            merged.preview_url = data.site.preview_url;
            merged.status = "published";
          }
          selectLead(merged);
        })
        .catch(function (e) {
          alert(e.message || "Could not load lead");
        });
    }

    function rowHtml(row) {
      var id = row.call_id || row.slug;
      var selected =
        ui.activeLead &&
        (ui.activeLead.call_id === row.call_id || (!row.call_id && ui.activeLead.slug === row.slug));
      var meta = [row.city, row.phone].filter(Boolean).join(" · ");
      var siteHint = row.website
        ? '<div class="muted" style="font-size:0.8rem">Has site</div>'
        : '<div class="muted" style="font-size:0.8rem">No website</div>';
      var status =
        row.status === "published" && row.preview_url
          ? '<span class="pw-badge-live">Site live</span>'
          : '<span class="pw-badge-pending">Pending</span>';
      return (
        '<tr class="pw-lead-row' +
        (selected ? " pw-lead-selected" : "") +
        '" data-call="' +
        esc(row.call_id || "") +
        '" data-slug="' +
        esc(row.slug || "") +
        '">' +
        "<td><strong>" +
        esc(row.company_name || row.slug) +
        "</strong><div class=\"muted\">" +
        esc(meta) +
        "</div>" +
        siteHint +
        "</td>" +
        "<td>" +
        status +
        "</td>" +
        "<td>" +
        fmtWhen(row.created_at) +
        "</td>" +
        "<td><button type=\"button\" class=\"btn btn-small pw-open-lead\">Open</button></td></tr>"
      );
    }

    function draw() {
      container.innerHTML =
        '<div class="publish-queue-wrap">' +
        '<div class="publish-queue-header">' +
        "<div><h2 style=\"margin:0\">Live publish</h2>" +
        '<p class="sub" style="margin:0.35rem 0 0">3 steps: review lead info → create site → push link to plumber.</p></div>' +
        '<div class="pw-header-actions">' +
        '<button type="button" id="publish-demo-btn" class="btn btn-ghost">Load demo lead</button>' +
        '<button type="button" id="publish-queue-refresh" class="btn">Refresh</button>' +
        "</div></div>" +
        '<div class="card" style="margin-top:1rem">' +
        "<h3 style=\"margin-top:0\">Hot leads</h3>" +
        '<table><thead><tr><th>Business</th><th>Status</th><th>When</th><th></th></tr></thead>' +
        '<tbody id="publish-queue-body">' +
        (ui.items.length
          ? ui.items.map(rowHtml).join("")
          : '<tr><td colspan="4" class="muted">No hot leads yet — they appear after Alex flags interest or the 1-minute email fires.</td></tr>') +
        "</tbody></table></div>" +
        '<div id="publish-wizard-root"></div></div>';

      container.querySelector("#publish-queue-refresh").onclick = load;
      container.querySelector("#publish-demo-btn").onclick = loadDemo;

      container.querySelectorAll(".pw-open-lead").forEach(function (btn) {
        btn.onclick = function (e) {
          e.stopPropagation();
          var tr = btn.closest("tr");
          var callId = tr.getAttribute("data-call");
          var slug = tr.getAttribute("data-slug");
          var row = ui.items.find(function (r) {
            return (callId && r.call_id === callId) || (slug && r.slug === slug);
          });
          if (row) selectFromRow(row);
        };
      });
      container.querySelectorAll(".pw-lead-row").forEach(function (tr) {
        tr.onclick = function () {
          var callId = tr.getAttribute("data-call");
          var slug = tr.getAttribute("data-slug");
          var row = ui.items.find(function (r) {
            return (callId && r.call_id === callId) || (slug && r.slug === slug);
          });
          if (row) selectFromRow(row);
        };
      });

      mountWizard();
    }

    function load() {
      if (!getToken()) {
        container.innerHTML =
          '<p class="muted">Sign in to the dashboard to publish preview sites.</p>';
        return;
      }
      draw();
      api("/api/outreach/publish-queue")
        .then(function (res) {
          ui.items = res.items || [];
          if (ui.activeLead && ui.activeLead.call_id) {
            var updated = ui.items.find(function (r) {
              return r.call_id === ui.activeLead.call_id;
            });
            if (updated) {
              ui.activeLead = normalizeLead(Object.assign({}, ui.activeLead, updated));
            }
          }
          draw();
          if (!ui.items.length && !ui.activeLead && global.PublishWizardUI) {
            loadDemo();
          }
        })
        .catch(function (e) {
          container.innerHTML =
            '<p class="error">' +
            esc(e.message) +
            "</p><p class=\"muted\">Sign in to the dashboard first (same password as QR activity).</p>";
        });
    }

    function startPoll() {
      if (ui.poll) clearInterval(ui.poll);
      ui.poll = setInterval(load, 15000);
    }

    function stopPoll() {
      if (ui.poll) {
        clearInterval(ui.poll);
        ui.poll = null;
      }
    }

    load();
    startPoll();
    return { refresh: load, stopPoll: stopPoll, startPoll: startPoll };
  }

  global.PublishQueueUI = { mount: mount };
})(window);
