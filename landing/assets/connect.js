async function loadBusinesses() {
  if (window.BUSINESSES) return window.BUSINESSES;
  const response = await fetch("businesses.json");
  if (!response.ok) throw new Error("Could not load businesses.json");
  return response.json();
}

function getSlug() {
  return new URLSearchParams(window.location.search).get("biz");
}

function withBiz(path) {
  const slug = getSlug();
  return slug ? `${path}?biz=${encodeURIComponent(slug)}` : path;
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
    { label: "Phone / text", href: `tel:${branding.phone}`, text: branding.phone_display, track: "connect:phone", trackLabel: "Phone / text" },
    { label: "Email", href: `mailto:${branding.email}`, text: branding.email_display, track: "connect:email", trackLabel: "Email us" },
  ];

  for (const item of items) {
    const block = document.createElement("div");
    block.className = "contact-strip-item";
    block.innerHTML =
      `<span class="contact-strip-label">${item.label}</span>` +
      `<a href="${item.href}">${item.text}</a>`;
    const link = block.querySelector("a");
    link.setAttribute("data-track", item.track);
    link.setAttribute("data-track-label", item.trackLabel);
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
  const registerLink = document.getElementById("register-link");
  const callbackLink = document.getElementById("callback-link-connect");
  const formBusiness = document.getElementById("form-business");

  if (pricingLink) pricingLink.href = withBiz("pricing.html");
  if (registerLink) registerLink.href = withBiz("register.html");
  if (callbackLink) callbackLink.href = withBiz("register.html#callback");

  if (match) {
    headline.textContent = `We built a free preview website for ${match.name}`;
    subtitle.textContent = "Take a look, then register online to go live — we handle the rest.";
    configurePreviewLink(
      previewLink,
      `../${match.preview_path}`,
      "View website preview",
    );
    formBusiness.value = match.name;
    document.title = `${match.name} Preview | ${branding.brand_name}`;
  } else if (slug) {
    headline.textContent = "Your free website preview";
    subtitle.textContent = "Review your preview, then register to launch with " + branding.brand_name + ".";
    configurePreviewLink(
      previewLink,
      `../previews/${slug}/index.html`,
      "View website preview",
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
      "View website preview",
    );
  }
  document.getElementById("subtitle").textContent =
    "Could not load business details. You can still register or contact us below.";
});
