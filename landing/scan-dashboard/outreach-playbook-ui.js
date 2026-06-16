(function (global) {
  "use strict";

  var OUTREACH_TOKEN_KEY = "solena_outreach_api_token";

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function actionSummary(path) {
    var a = path.actions || {};
    var parts = [];
    if (a.notify_owner_sms) parts.push("Text you");
    if (a.transfer_to_owner) parts.push("Transfer call");
    if (a.end_call) parts.push("End call");
    return parts.length ? parts.join(" · ") : "—";
  }

  function collectFromDom(root, base) {
    var playbook = JSON.parse(JSON.stringify(base));
    var persona = root.querySelector("#outreach-persona");
    var company = root.querySelector("#outreach-company");
    var voice = root.querySelector("#outreach-voice");
    var ivr = root.querySelector("#outreach-ivr");
    var openWeb = root.querySelector("#outreach-opening-web");
    var openNo = root.querySelector("#outreach-opening-no");
    var rules = root.querySelector("#outreach-rules");
    if (persona) playbook.agent_persona = persona.value;
    if (company) playbook.company_label = company.value;
    if (voice) playbook.voice_style = voice.value;
    if (ivr) playbook.ivr_rules = ivr.value;
    if (openWeb) playbook.opening_has_website = openWeb.value;
    if (openNo) playbook.opening_no_website = openNo.value;
    if (rules) playbook.general_rules = rules.value;

    root.querySelectorAll(".outreach-path").forEach(function (el) {
      var idx = parseInt(el.getAttribute("data-idx"), 10);
      if (!playbook.paths[idx]) return;
      var p = playbook.paths[idx];
      p.label = el.querySelector(".outreach-path-label")?.value || p.label;
      p.when = el.querySelector(".outreach-path-when")?.value || p.when;
      p.say = el.querySelector(".outreach-path-say")?.value || p.say;
      p.sms_template = el.querySelector(".outreach-path-sms")?.value || "";
      p.enabled = !!el.querySelector(".outreach-path-enabled")?.checked;
      p.actions = {
        notify_owner_sms: !!el.querySelector('[data-action="notify_owner_sms"]')?.checked,
        transfer_to_owner: !!el.querySelector('[data-action="transfer_to_owner"]')?.checked,
        end_call: !!el.querySelector('[data-action="end_call"]')?.checked,
      };
    });
    return playbook;
  }

  function mount(container, apiBase, getToken, onTokenNeeded) {
    var ui = { saving: false, msg: "", selected: "start", dragIdx: null, playbook: null, meta: {} };

    function api(path, opts) {
      var token = getToken();
      if (!token) {
        onTokenNeeded();
        return Promise.reject(new Error("Sign in to the dashboard first."));
      }
      return fetch(apiBase.replace(/\/+$/, "") + path, {
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

    function renderPathNode(path, idx) {
      if (!path.enabled) return "";
      var sel = ui.selected === path.id ? " outreach-node-selected" : "";
      return (
        '<div class="outreach-node' + sel + '" draggable="true" data-path-id="' + esc(path.id) + '" data-idx="' + idx + '">' +
        '<div class="outreach-drag" title="Drag to reorder">⠿</div>' +
        '<div class="outreach-node-body">' +
        '<strong>' + esc(path.label) + "</strong>" +
        '<div class="muted outreach-node-when">' + esc(path.when) + "</div>" +
        '<div class="outreach-node-actions">' + esc(actionSummary(path)) + "</div></div></div>"
      );
    }

    function renderInspector() {
      if (ui.selected === "start") {
        var pb = ui.playbook;
        return (
          '<div class="outreach-inspector">' +
          "<h3>Call opening &amp; setup</h3>" +
          '<p class="muted">What Alex says first — after a live human answers (not during IVR).</p>' +
          '<label>Agent name</label><input id="outreach-persona" type="text" value="' + esc(pb.agent_persona) + '">' +
          '<label>Company name</label><input id="outreach-company" type="text" value="' + esc(pb.company_label) + '">' +
          '<label>Voice style</label><textarea id="outreach-voice" rows="2">' + esc(pb.voice_style) + "</textarea>" +
          '<label>IVR rules</label><textarea id="outreach-ivr" rows="2">' + esc(pb.ivr_rules) + "</textarea>" +
          '<label>Opening — has website</label><textarea id="outreach-opening-web" rows="3">' + esc(pb.opening_has_website) + "</textarea>" +
          '<p class="muted">Tags: {{company_name}}, {{city}}</p>' +
          '<label>Opening — no website</label><textarea id="outreach-opening-no" rows="3">' + esc(pb.opening_no_website) + "</textarea>" +
          '<label>General rules</label><textarea id="outreach-rules" rows="3">' + esc(pb.general_rules) + "</textarea></div>"
        );
      }

      var idx = -1;
      var path = null;
      (ui.playbook.paths || []).forEach(function (p, i) {
        if (p.id === ui.selected) {
          idx = i;
          path = p;
        }
      });
      if (!path) {
        return '<div class="outreach-inspector"><p class="muted">Select a step on the flow map to edit what Alex says and when you get a text.</p></div>';
      }

      var a = path.actions || {};
      return (
        '<div class="outreach-inspector outreach-path" data-idx="' + idx + '">' +
        "<h3>" + esc(path.label) + "</h3>" +
        '<p class="muted">When: ' + esc(path.when) + "</p>" +
        '<label class="outreach-check"><input type="checkbox" class="outreach-path-enabled"' + (path.enabled !== false ? " checked" : "") + "> Use this path</label>" +
        '<label>Path label</label><input class="outreach-path-label" type="text" value="' + esc(path.label) + '">' +
        '<label>When (trigger)</label><textarea class="outreach-path-when" rows="2">' + esc(path.when) + "</textarea>" +
        '<label>What Alex says</label><textarea class="outreach-path-say" rows="3">' + esc(path.say) + "</textarea>" +
        '<h4>After this response</h4>' +
        '<label class="outreach-check"><input type="checkbox" data-action="notify_owner_sms"' + (a.notify_owner_sms ? " checked" : "") + "> Text me (SMS alert)</label>" +
        '<label class="outreach-check"><input type="checkbox" data-action="transfer_to_owner"' + (a.transfer_to_owner ? " checked" : "") + "> Transfer live call to my phone</label>" +
        '<label class="outreach-check"><input type="checkbox" data-action="end_call"' + (a.end_call ? " checked" : "") + "> End call</label>" +
        (a.notify_owner_sms
          ? '<label>SMS message to you</label><textarea class="outreach-path-sms" rows="4">' +
            esc(path.sms_template) +
            "</textarea><p class=\"muted\">Tags: {{company_name}}, {{city}}, {{phone}}, {{interest_level}}, {{notes_line}}, {{publish_url}}</p>"
          : "") +
        "</div>"
      );
    }

    function draw() {
      var pb = ui.playbook;
      if (!pb) {
        container.innerHTML = '<p class="muted">Loading outreach script…</p>';
        return;
      }
      var nodes = (pb.paths || []).map(renderPathNode).join("");
      container.innerHTML =
        '<div class="outreach-builder">' +
        '<div class="outreach-topbar">' +
        "<div><h2 style=\"margin:0\">Outreach voice script</h2>" +
        '<p class="muted" style="margin:0.25rem 0 0">Drag steps to reorder. Click a step to edit what Alex says and when you get a text.</p></div>' +
        '<div class="outreach-topbar-actions">' +
        '<button type="button" class="btn btn-ghost" id="outreach-reset">Reset defaults</button>' +
        '<button type="button" class="btn" id="outreach-save">' + (ui.saving ? "Saving…" : "Save &amp; sync agent") + "</button></div></div>" +
        (ui.msg ? '<p class="outreach-msg">' + esc(ui.msg) + "</p>" : "") +
        '<div class="outreach-layout">' +
        '<div class="outreach-flow">' +
        '<div class="outreach-start' + (ui.selected === "start" ? " outreach-node-selected" : "") + '" data-select="start">' +
        "<strong>📞 Call connects</strong><p class=\"muted\">IVR → live human → opening pitch</p></div>" +
        '<div class="outreach-connector"></div>' +
        '<div class="outreach-hub muted">They respond…</div>' +
        '<div class="outreach-connector"></div>' +
        '<div class="outreach-node-grid" id="outreach-node-grid">' +
        (nodes || '<p class="muted">No paths enabled.</p>') +
        "</div></div>" +
        '<div id="outreach-inspector-wrap">' + renderInspector() + "</div></div></div>";

      bindEvents();
    }

    function syncAndReselect() {
      ui.playbook = collectFromDom(container, ui.playbook);
    }

    function reorder(from, to) {
      var list = ui.playbook.paths;
      if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return;
      var item = list.splice(from, 1)[0];
      list.splice(to, 0, item);
      list.forEach(function (p, i) {
        p.sort_order = i;
      });
    }

    function bindEvents() {
      var saveBtn = container.querySelector("#outreach-save");
      if (saveBtn) {
        saveBtn.onclick = function () {
          if (ui.saving) return;
          ui.saving = true;
          ui.msg = "Saving…";
          draw();
          syncAndReselect();
          api("/api/outreach/playbook", { method: "PATCH", body: { playbook: ui.playbook } })
            .then(function (res) {
              ui.playbook = res.playbook || ui.playbook;
              ui.msg = res.sync && res.sync.ok ? "Saved. Alex will use this on the next call." : "Saved playbook (agent sync: check Retell).";
            })
            .catch(function (e) {
              ui.msg = e.message || "Save failed";
            })
            .finally(function () {
              ui.saving = false;
              draw();
            });
        };
      }

      var resetBtn = container.querySelector("#outreach-reset");
      if (resetBtn) {
        resetBtn.onclick = function () {
          if (!confirm("Reset outreach script to defaults?")) return;
          ui.saving = true;
          api("/api/outreach/playbook", { method: "PATCH", body: { reset: true } })
            .then(function (res) {
              ui.playbook = res.playbook;
              ui.selected = "start";
              ui.msg = "Reset to defaults.";
            })
            .catch(function (e) {
              ui.msg = e.message || "Reset failed";
            })
            .finally(function () {
              ui.saving = false;
              draw();
            });
        };
      }

      var start = container.querySelector(".outreach-start");
      if (start) {
        start.onclick = function () {
          syncAndReselect();
          ui.selected = "start";
          draw();
        };
      }

      container.querySelectorAll(".outreach-node").forEach(function (node) {
        node.onclick = function () {
          syncAndReselect();
          ui.selected = node.getAttribute("data-path-id");
          draw();
        };
        node.addEventListener("dragstart", function (e) {
          ui.dragIdx = parseInt(node.getAttribute("data-idx"), 10);
          e.dataTransfer.effectAllowed = "move";
        });
        node.addEventListener("dragover", function (e) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        });
        node.addEventListener("drop", function (e) {
          e.preventDefault();
          var to = parseInt(node.getAttribute("data-idx"), 10);
          if (ui.dragIdx != null) {
            syncAndReselect();
            reorder(ui.dragIdx, to);
            ui.dragIdx = null;
            draw();
          }
        });
      });
    }

    function load() {
      if (!getToken()) {
        container.innerHTML =
          '<p class="muted">Sign in to the dashboard to load the outreach script.</p>';
        return;
      }
      draw();
      api("/api/outreach/playbook")
        .then(function (res) {
          ui.playbook = res.playbook;
          ui.meta = res.meta || {};
          ui.msg = "";
          draw();
        })
        .catch(function (e) {
          container.innerHTML =
            '<p class="error">' +
            esc(e.message) +
            '</p><p class="muted">Sign in to the dashboard first (same password as QR activity).</p>';
        });
    }

    load();
  }

  global.OutreachPlaybookUI = {
    mount: mount,
    tokenKey: OUTREACH_TOKEN_KEY,
  };
})(window);
