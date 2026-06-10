async function loadBusinesses() {
  if (window.BUSINESSES) return window.BUSINESSES;
  const response = await fetch("businesses.json");
  if (!response.ok) throw new Error("Could not load businesses.json");
  return response.json();
}

function getSlug() {
  return new URLSearchParams(window.location.search).get("biz");
}

function isLocalFile() {
  return window.location.protocol === "file:";
}

function configurePreviewLink(link, href, label) {
  link.href = href;
  link.textContent = label;
  if (isLocalFile()) {
    link.target = "_self";
    link.removeAttribute("rel");
  } else {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }
}

function renderContact(branding) {
  const grid = document.getElementById("contact-grid");
  grid.innerHTML = "";

  const items = [
    { label: "Phone/Text", href: `tel:${branding.phone}`, text: branding.phone_display },
    { label: "Email", href: `mailto:${branding.email}`, text: branding.email_display },
  ];

  for (const item of items) {
    const block = document.createElement("div");
    block.className = "contact-item";
    block.innerHTML = `<strong>${item.label}</strong><br><a href="${item.href}">${item.text}</a>`;
    grid.appendChild(block);
  }

  const form = document.getElementById("contact-form");
  const fallback = document.getElementById("form-fallback");

  if (branding.formspree_endpoint) {
    form.action = branding.formspree_endpoint;
    form.classList.remove("hidden");
  }
  fallback.textContent = "";
}

function renderOffer(branding) {
  const list = document.getElementById("offer-list");
  list.innerHTML = "";
  for (const bullet of branding.offer_bullets) {
    const li = document.createElement("li");
    li.textContent = bullet;
    list.appendChild(li);
  }
}

async function init() {
  const branding = window.BRANDING;
  renderOffer(branding);
  renderContact(branding);

  const slug = getSlug();
  const businesses = await loadBusinesses();
  const match = businesses.find((b) => b.slug === slug);

  const headline = document.getElementById("headline");
  const subtitle = document.getElementById("subtitle");
  const previewLink = document.getElementById("preview-link");
  const pricingLink = document.getElementById("pricing-link");
  const formBusiness = document.getElementById("form-business");

  if (pricingLink) {
    pricingLink.href = slug ? `pricing.html?biz=${encodeURIComponent(slug)}` : "pricing.html";
  }

  if (match) {
    headline.textContent = `We built a free preview website for ${match.name}`;
    subtitle.textContent = "Designed to get more service calls";
    configurePreviewLink(
      previewLink,
      `../${match.preview_path}`,
      "Website preview",
    );
    formBusiness.value = match.name;
    document.title = `${match.name} Preview | ${branding.brand_name}`;
  } else if (slug) {
    headline.textContent = "Your free website preview";
    subtitle.textContent = branding.tagline;
    configurePreviewLink(
      previewLink,
      `../previews/${slug}/index.html`,
      "Website preview",
    );
    formBusiness.value = slug;
  } else {
    headline.textContent = "Your free website preview";
    subtitle.textContent = branding.tagline;
    configurePreviewLink(previewLink, "../", "Browse previews");
    formBusiness.value = "unknown";
  }
}

init().catch((err) => {
  console.error(err);
  const slug = getSlug();
  const previewLink = document.getElementById("preview-link");
  if (slug) {
    configurePreviewLink(
      previewLink,
      `../previews/${slug}/index.html`,
      "Website preview",
    );
  }
  document.getElementById("subtitle").textContent =
    "Could not load business details. Use the contact options below to reach us.";
});
