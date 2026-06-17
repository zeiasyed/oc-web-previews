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

  function fmtDuration(sec) {
    var n = Number(sec);
    if (!Number.isFinite(n) || n <= 0) return "—";
    if (n < 60) return n + "s";
    var m = Math.floor(n / 60);
    var s = n % 60;
    return m + "m" + (s ? " " + s + "s" : "");
  }

  function fmtOutcome(raw) {
    if (!raw) return "—";
    return String(raw).replace(/_/g, " ");
  }

  function fmtDay(day) {
    if (!day) return "—";
    try {
      var d = new Date(day + "T12:00:00");
      return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    } catch (e) {
      return day;
    }
  }

  function mount(container, apiBase, getToken, onStatus) {
    var ui = { poll: null, data: null };

    function api(path) {
      var token = getToken();
      if (!token) return Promise.reject(new Error("Sign in to the dashboard first."));
      return fetch(apiBase + path, {
        headers: { Authorization: "Bearer " + token },
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

    function emailBarClass(pct) {
      if (pct >= 90) return "limit-warn limit-danger";
      if (pct >= 70) return "limit-warn";
      return "";
    }

    function render(data) {
      ui.data = data;
      var today = data.today || {};
      var month = data.month || {};
      var emailPct = today.email_pct || 0;
      var emailsToday = today.emails_today || 0;
      var emailLimit = data.email_limit || 100;

      var html =
        '<div class="stats tracking-stats">' +
        '<div class="stat"><strong>' +
        (today.total_calls || 0) +
        '</strong><span>Calls today</span></div>' +
        '<div class="stat"><strong>' +
        (today.est_total_cost || "$0.00") +
        '</strong><span>Est. cost today</span></div>' +
        '<div class="stat"><strong>' +
        emailsToday +
        " / " +
        emailLimit +
        '</strong><span>Emails today</span></div>' +
        '<div class="stat"><strong>' +
        (month.est_total_cost || "$0.00") +
        '</strong><span>Est. cost this month</span></div>' +
        "</div>";

      html +=
        '<div class="card tracking-limit ' +
        emailBarClass(emailPct) +
        '">' +
        '<div class="tracking-limit-head">' +
        "<strong>Resend email budget</strong>" +
        "<span>" +
        (today.emails_remaining != null ? today.emails_remaining : emailLimit - emailsToday) +
        " remaining today</span>" +
        "</div>" +
        '<div class="limit-bar"><div class="limit-fill" style="width:' +
        emailPct +
        '%"></div></div>' +
        '<p class="sub" style="margin:0.5rem 0 0">1-min call alerts and other outreach emails count toward the daily limit. SMS fallbacks do not.</p>' +
        "</div>";

      if ((data.active_calls || []).length) {
        html += '<div class="card"><h2 style="margin-top:0">Live calls</h2><table><thead><tr>' +
          "<th>Business</th><th>Status</th><th>Started</th><th>Duration</th><th>Alert</th>" +
          "</tr></thead><tbody>";
        data.active_calls.forEach(function (row) {
          html +=
            "<tr><td><strong>" +
            esc(row.company_name) +
            "</strong><div class=\"muted\">" +
            esc(row.city) +
            "</div></td><td>" +
            esc(row.status) +
            "</td><td>" +
            fmtWhen(row.call_started_at || row.placed_at) +
            "</td><td>" +
            fmtDuration(row.duration_sec) +
            "</td><td>" +
            (row.alert_email_sent ? "Sent" : "—") +
            "</td></tr>";
        });
        html += "</tbody></table></div>";
      }

      html +=
        '<div class="card"><h2 style="margin-top:0">Calls by day</h2>' +
        '<p class="sub" style="margin-top:-0.5rem;margin-bottom:0.75rem">Voice ~$' +
        (data.rates && data.rates.voice_per_min != null ? data.rates.voice_per_min : "0.15") +
        "/min · SMS ~$" +
        (data.rates && data.rates.sms_each != null ? data.rates.sms_each : "0.01") +
        " each (estimates)</p>" +
        "<table><thead><tr>" +
        "<th>Day</th><th>Calls</th><th>Done</th><th>Interested</th><th>VM</th><th>Talk time</th><th>Emails</th><th>SMS</th><th>Est. cost</th>" +
        "</tr></thead><tbody>";

      (data.daily || []).forEach(function (row) {
        html +=
          "<tr><td><strong>" +
          fmtDay(row.day) +
          "</strong></td><td>" +
          row.total_calls +
          "</td><td>" +
          row.completed +
          "</td><td>" +
          row.interested +
          "</td><td>" +
          row.voicemail +
          "</td><td>" +
          fmtDuration(row.total_duration_sec) +
          "</td><td>" +
          row.emails +
          "</td><td>" +
          row.sms +
          "</td><td>" +
          esc(row.est_total_cost) +
          "</td></tr>";
      });
      if (!(data.daily || []).length) {
        html += '<tr><td colspan="9" class="muted">No calls logged yet.</td></tr>';
      }
      html += "</tbody></table></div>";

      if ((data.outcomes || []).length) {
        html += '<div class="card"><h2 style="margin-top:0">Outcome breakdown</h2><table><thead><tr><th>Outcome</th><th>Count</th></tr></thead><tbody>';
        data.outcomes.forEach(function (row) {
          html +=
            "<tr><td>" +
            fmtOutcome(row.call_outcome) +
            "</td><td><strong>" +
            row.n +
            "</strong></td></tr>";
        });
        html += "</tbody></table></div>";
      }

      html +=
        '<div class="card"><h2 style="margin-top:0">Call summaries</h2>' +
        '<p class="sub" style="margin-top:-0.5rem;margin-bottom:0.75rem">Retell post-call analysis — refreshes every 20s.</p>' +
        "<table><thead><tr>" +
        "<th>Business</th><th>Outcome</th><th>Duration</th><th>When</th><th>Summary</th>" +
        "</tr></thead><tbody>";

      (data.recent_calls || []).forEach(function (row) {
        var summary = row.call_summary || (row.status === "in_progress" ? "Call in progress…" : "—");
        html +=
          "<tr><td><strong>" +
          esc(row.company_name) +
          "</strong><div class=\"muted\">" +
          esc(row.city) +
          (row.contact_name ? " · " + esc(row.contact_name) : "") +
          "</div></td><td>" +
          fmtOutcome(row.call_outcome || row.status) +
          "</td><td>" +
          fmtDuration(row.duration_sec) +
          "</td><td>" +
          fmtWhen(row.ended_at || row.call_started_at || row.placed_at) +
          '</td><td class="summary-cell">' +
          esc(summary) +
          "</td></tr>";
      });
      if (!(data.recent_calls || []).length) {
        html += '<tr><td colspan="5" class="muted">No calls yet.</td></tr>';
      }
      html += "</tbody></table></div>";

      container.innerHTML = html;
      if (onStatus) {
        onStatus("Tracking updated " + fmtWhen(data.updated_at));
      }
    }

    function refresh() {
      return api("/api/outreach/tracking")
        .then(render)
        .catch(function (err) {
          container.innerHTML =
            '<div class="card"><p class="error">' + esc(err.message || "Could not load tracking") + "</p></div>";
          if (onStatus) onStatus(err.message || "Tracking error");
        });
    }

    function startPoll() {
      stopPoll();
      ui.poll = setInterval(refresh, 20000);
    }

    function stopPoll() {
      if (ui.poll) {
        clearInterval(ui.poll);
        ui.poll = null;
      }
    }

    container.innerHTML = '<p class="sub">Loading tracking…</p>';
    refresh();
    startPoll();

    return {
      refresh: refresh,
      startPoll: startPoll,
      stopPoll: stopPoll,
    };
  }

  global.TrackingUI = { mount: mount };
})(window);
