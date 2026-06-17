(function () {
  "use strict";

  function initShowcase(root) {
    if (!root) return;

    var tabs = root.querySelectorAll(".ns-ui-tab");
    var panels = root.querySelectorAll(".ns-panel");
    var navButtons = root.querySelectorAll(".ns-app__nav button[data-panel]");

    function activate(id) {
      tabs.forEach(function (tab) {
        tab.classList.toggle("is-active", tab.getAttribute("data-panel") === id);
      });
      panels.forEach(function (panel) {
        panel.classList.toggle("is-active", panel.getAttribute("data-panel") === id);
      });
      navButtons.forEach(function (btn) {
        btn.classList.toggle("is-active", btn.getAttribute("data-panel") === id);
      });
    }

    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        activate(tab.getAttribute("data-panel"));
      });
    });

    navButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        activate(btn.getAttribute("data-panel"));
      });
    });
  }

  document.querySelectorAll("[data-nexasource-ui]").forEach(initShowcase);
})();
