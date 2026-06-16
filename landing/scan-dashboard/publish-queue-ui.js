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
    var ui = { items: [], publishing: {}, msg: "", poll: null };

    function api(path, opts) {
      var token = getToken();
      if (!token) {
        if (onTokenNeeded) onTokenNeeded();
        return Promise.reject(new Error("API token required"));
      }
      return fetch(apiBase + path, {
        method: (opts && opts.method) || "GET",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: opts && opts.body ? JSON.stringify(opts.body) : undefined,
      }).then(function (res) {
        if (res.status === 401) throw new Error("Invalid API token");
        if (!res.ok) throw new Error("API error " + res.status);
        return res.json();
      });
    }

    function publishRow(row) {
      var key = row.call_id || row.slug;
      if (ui.publishing[key]) return;
      ui.publishing[key] = true;
      draw();
      api("/voice/plumber-outreach/publish-preview", {
        method: "POST",
        body: { call_id: row.call_id || undefined, lead: row },
      })
        .then(function (result) {
          ui.publishing[key] = false;
          ui.msg = "Published " + (result.company_name || row.company_name) + " — share the preview link on your call.";
          load();
        })
        .catch(function (e) {
          ui.publishing[key] = false;
          ui.msg = "";
          draw();
          alert(e.message || "Publish failed");
        });
    }

    function rowHtml(row) {
      var key = row.call_id || row.slug;
      var busy = !!ui.publishing[key];
      var published = row.status === "published" && row.preview_url;
      var meta = [row.city, row.phone].filter(Boolean).join(" · ");
      var actions =
        published
          ? '<a class="btn btn-small" href="' +
            esc(row.preview_url) +
            '" target="_blank" rel="noopener">Open preview</a>'
          : '<button type="button" class="btn btn-small publish-queue-btn" data-call="' +
            esc(row.call_id || "") +
            '" data-slug="' +
            esc(row.slug || "") +
            '"' +
            (busy ? " disabled" : "") +
            ">" +
            (busy ? "Publishing…" : "Publish now") +
            "</button>";
      if (row.call_id) {
        actions +=
          ' <a class="muted" href="publish.html?call=' +
          encodeURIComponent(row.call_id) +
          '" target="_blank" rel="noopener">Mobile page</a>';
      }
      return (
        "<tr><td><strong>" +
        esc(row.company_name || row.slug) +
        '</strong><div class="muted">' +
        esc(meta) +
        "</div></td><td>" +
        (published ? '<span style="color:var(--accent)">Live</span>' : "Pending") +
        "</td><td>" +
        fmtWhen(row.created_at) +
        "</td><td>" +
        actions +
        "</td></tr>"
      );
    }

    function draw() {
      var manualSlug = container.querySelector("#publish-manual-slug");
      var slugVal = manualSlug ? manualSlug.value.trim() : "";
      container.innerHTML =
        '<div class="publish-queue-wrap">' +
        '<div class="publish-queue-header">' +
        "<div><h2 style=\"margin:0\">Live publish</h2>" +
        '<p class="sub" style="margin:0.35rem 0 0">When Alex flags a hot lead, publish their preview site here while you are on the phone.</p></div>' +
        '<button type="button" id="publish-queue-refresh" class="btn">Refresh</button>' +
        "</div>" +
        (ui.msg ? '<p class="outreach-msg">' + esc(ui.msg) + "</p>" : "") +
        '<div class="card" style="margin-top:1rem">' +
        "<h3 style=\"margin-top:0\">Hot leads</h3>" +
        '<table><thead><tr><th>Business</th><th>Status</th><th>When</th><th></th></tr></thead>' +
        '<tbody id="publish-queue-body">' +
        (ui.items.length
          ? ui.items.map(rowHtml).join("")
          : '<tr><td colspan="4" class="muted">No hot leads yet — they appear when Alex texts you during a call.</td></tr>') +
        "</tbody></table></div>" +
        '<div class="card">' +
        "<h3 style=\"margin-top:0\">Manual publish</h3>" +
        '<p class="sub">Publish any lead by slug (from your plumber list).</p>' +
        '<div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:flex-end">' +
        '<div style="flex:1;min-width:180px"><label for="publish-manual-slug">Slug</label>' +
        '<input id="publish-manual-slug" type="text" placeholder="first-class-plumbing-ac-riverside" value="' +
        esc(slugVal) +
        '"></div>' +
        '<button type="button" id="publish-manual-btn" class="btn">Publish</button>' +
        "</div></div></div>";

      container.querySelector("#publish-queue-refresh").onclick = load;
      container.querySelectorAll(".publish-queue-btn").forEach(function (btn) {
        btn.onclick = function () {
          var callId = btn.getAttribute("data-call");
          var slug = btn.getAttribute("data-slug");
          var row = ui.items.find(function (r) {
            return (callId && r.call_id === callId) || r.slug === slug;
          });
          if (row) publishRow(row);
        };
      });
      var manualBtn = container.querySelector("#publish-manual-btn");
      if (manualBtn) {
        manualBtn.onclick = function () {
          var slug = container.querySelector("#publish-manual-slug").value.trim();
          if (!slug) return;
          publishRow({
            slug: slug,
            company_name: slug.replace(/-/g, " "),
            city: "Inland Empire",
          });
        };
      }
    }

    function load() {
      if (!getToken()) {
        container.innerHTML =
          '<p class="muted">Enter your API token above to publish preview sites.</p>';
        return;
      }
      draw();
      api("/voice/plumber-outreach/publish-queue")
        .then(function (res) {
          ui.items = res.items || [];
          draw();
        })
        .catch(function (e) {
          container.innerHTML =
            '<p class="error">' +
            esc(e.message) +
            '</p><p class="muted">Set your API token above (same token used for lab verify / outreach campaigns).</p>';
        });
    }

    function startPoll() {
      stopPoll();
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
