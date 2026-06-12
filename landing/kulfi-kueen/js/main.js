(function () {
  var cfg = window.KK_CONFIG || {};
  var navToggle = document.querySelector(".nav-toggle");
  var navMenu = document.querySelector(".nav-menu");

  if (navToggle && navMenu) {
    navToggle.addEventListener("click", function () {
      var open = navMenu.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    navMenu.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        navMenu.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  document.querySelectorAll("[data-phone]").forEach(function (el) {
    if (cfg.phone) el.textContent = cfg.phone;
  });

  document.querySelectorAll("[data-phone-href]").forEach(function (el) {
    if (cfg.phoneTel) el.setAttribute("href", "tel:" + cfg.phoneTel);
  });

  document.querySelectorAll("[data-venmo]").forEach(function (el) {
    if (cfg.venmo) el.textContent = cfg.venmo;
  });

  document.querySelectorAll("[data-zelle]").forEach(function (el) {
    if (cfg.zelle) el.textContent = cfg.zelle;
  });

  var orderForm = document.getElementById("order-form");
  if (orderForm && cfg.formspreeId && cfg.formspreeId !== "YOUR_FORM_ID") {
    orderForm.action = "https://formspree.io/f/" + cfg.formspreeId;
  }

  if (orderForm) {
    orderForm.addEventListener("submit", function (e) {
      if (!cfg.formspreeId || cfg.formspreeId === "YOUR_FORM_ID") {
        e.preventDefault();
        var status = document.getElementById("form-status");
        if (status) {
          status.hidden = false;
          status.className = "form-status form-status--warn";
          status.textContent =
            "Order form is almost ready — Mary is connecting Formspree. Call " +
            (cfg.phone || "us") +
            " or use the contact form meanwhile.";
        }
      }
    });
  }

  var contactForm = document.getElementById("contact-form");
  if (contactForm && cfg.formspreeId && cfg.formspreeId !== "YOUR_FORM_ID") {
    contactForm.action = "https://formspree.io/f/" + cfg.formspreeId;
  }

  if (contactForm) {
    contactForm.addEventListener("submit", function (e) {
      if (!cfg.formspreeId || cfg.formspreeId === "YOUR_FORM_ID") {
        e.preventDefault();
        var status = document.getElementById("contact-status");
        if (status) {
          status.hidden = false;
          status.className = "form-status form-status--warn";
          status.textContent =
            "Contact form coming online soon. Reach us at " + (cfg.phone || "our phone number") + ".";
        }
      }
    });
  }

  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
})();
