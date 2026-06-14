/**
 * Fire-and-forget QR scan beacon for connect.html?biz=SLUG
 * Does not change printed QR URLs — only logs visits to the tracking API.
 */
(function () {
  var branding = window.BRANDING || {};
  var apiBase = (branding.qr_scan_api || "").replace(/\/+$/, "");
  if (!apiBase) return;

  var params = new URLSearchParams(window.location.search);
  var slug = params.get("biz");
  if (!slug) return;

  var payload = JSON.stringify({ slug: slug, source: "connect" });

  if (navigator.sendBeacon) {
    var blob = new Blob([payload], { type: "application/json" });
    if (navigator.sendBeacon(apiBase + "/scan", blob)) return;
  }

  fetch(apiBase + "/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
    mode: "cors",
  }).catch(function () {});
})();
