/**
 * Funnel analytics for QR postcard flow (?biz=SLUG).
 * Tracks page views and clicks — no QR URL changes.
 */
(function () {
  var SLUG_KEY = "oc_funnel_slug";
  var branding = window.BRANDING || {};
  var apiBase = (branding.qr_scan_api || "").replace(/\/+$/, "");
  if (!apiBase) return;

  var AUTO_TRACK = {
    "preview-link": ["connect:preview-site", "View website preview"],
    "pricing-link": ["connect:pricing-cta", "Simple Pricing"],
    "nav-brand": ["nav:logo", "Logo / Preview step"],
    "nav-connect": ["nav:preview-step", "Nav: Preview"],
    "nav-pricing": ["nav:pricing-step", "Nav: Pricing"],
    "nav-register": ["nav:register-step", "Nav: Register"],
    "nav-payment": ["nav:payment-step", "Nav: Payment"],
    "back-link": ["pricing:back-preview", "Back to preview"],
    "contact-link": ["pricing:get-started", "Get started"],
    "register-submit": ["register:continue-payment", "Continue to payment"],
    "callback-submit": ["register:call-me-back", "Call me back"],
    "pricing-back": ["register:back-pricing", "Back to pricing"],
    "pay-now": ["payment:pay-now", "Pay $300 & start plan"],
    "callback-link": ["payment:call-me-back", "Call me back instead"],
    "goto-register": ["payment:goto-register", "Go to registration"],
    "edit-registration": ["payment:edit-registration", "Edit registration"],
  };

  var params = new URLSearchParams(window.location.search);
  var slug = params.get("biz");
  if (slug) {
    try {
      sessionStorage.setItem(SLUG_KEY, slug);
    } catch (e) {}
  } else {
    try {
      slug = sessionStorage.getItem(SLUG_KEY) || "";
    } catch (e) {
      slug = "";
    }
  }
  if (!slug) return;

  function pageName() {
    var path = (window.location.pathname || "").split("/").pop() || "";
    if (path.indexOf("connect") >= 0) return "connect";
    if (path.indexOf("pricing") >= 0) return "pricing";
    if (path.indexOf("register") >= 0) return "register";
    if (path.indexOf("payment") >= 0) return "payment";
    return path.replace(".html", "") || "unknown";
  }

  function sendEvent(payload) {
    payload.slug = slug;
    payload.source = "funnel";
    var body = JSON.stringify(payload);

    if (navigator.sendBeacon) {
      var blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(apiBase + "/event", blob)) return;
    }

    fetch(apiBase + "/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body,
      keepalive: true,
      mode: "cors",
    }).catch(function () {});
  }

  function trackPageView() {
    sendEvent({
      event_type: "page_view",
      page: pageName(),
      element_id: null,
      element_label: null,
    });
  }

  function labelFor(el) {
    if (el.getAttribute("data-track-label")) {
      return el.getAttribute("data-track-label");
    }
    var text = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (text.length > 80) text = text.slice(0, 77) + "...";
    return text || el.id || "click";
  }

  function trackClick(el) {
    var trackId = el.getAttribute("data-track");
    if (!trackId) return;
    sendEvent({
      event_type: "click",
      page: pageName(),
      element_id: trackId,
      element_label: labelFor(el),
    });
  }

  function applyAutoTrack() {
    Object.keys(AUTO_TRACK).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el.getAttribute("data-track")) return;
      el.setAttribute("data-track", AUTO_TRACK[id][0]);
      el.setAttribute("data-track-label", AUTO_TRACK[id][1]);
    });
  }

  document.addEventListener(
    "click",
    function (e) {
      var el = e.target.closest("[data-track]");
      if (!el) return;
      trackClick(el);
    },
    true
  );

  function init() {
    applyAutoTrack();
    trackPageView();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
