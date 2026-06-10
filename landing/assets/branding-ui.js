(function () {
  const branding = window.BRANDING;
  if (!branding) return;

  const name = branding.brand_name || "Solena Digital";
  const logoBase = branding.logo_header_url || branding.logo_url || "assets/solena-digital-logo.png";
  const logoUrl = logoBase.includes("?") ? logoBase : `${logoBase}?v=4`;

  document.querySelectorAll("[data-brand-name]").forEach((el) => {
    el.textContent = name;
  });

  document.querySelectorAll("[data-brand-logo]").forEach((el) => {
    el.src = logoUrl;
    el.alt = name;
  });

  if (document.title.includes("OC Web Co")) {
    document.title = document.title.replace(/OC Web Co/g, name);
  }

  document.querySelectorAll("[data-brand-title]").forEach((el) => {
    const suffix = el.dataset.brandTitle || "";
    document.title = suffix ? `${suffix} | ${name}` : name;
  });

  document.querySelectorAll(".terms-box-scroll, .disclaimer, .payment-auth").forEach((el) => {
    el.innerHTML = el.innerHTML.replace(/OC Web Co/g, name);
  });

  const planLine = document.getElementById("pay-plan-line");
  if (planLine) planLine.textContent = `${name} — Monthly plan`;

  const navBrand = document.getElementById("nav-brand");
  if (navBrand && !navBrand.querySelector("img")) {
    navBrand.textContent = "";
    const img = document.createElement("img");
    img.src = logoUrl;
    img.alt = name;
    img.className = "landing-brand-logo";
    navBrand.appendChild(img);
  }

  const navLogo = navBrand?.querySelector(".landing-brand-logo");
  if (navLogo) {
    navLogo.src = logoUrl;
    navLogo.alt = name;
  }
})();
