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

function setCallbackContext(match) {
  const slug = getSlug();
  const name = match?.name || "";
  const slugField = document.getElementById("cb-connect-slug");
  const nameField = document.getElementById("cb-connect-name");
  const subjectField = document.getElementById("cb-connect-subject");
  if (slugField) slugField.value = slug || "";
  if (nameField) nameField.value = name;
  if (subjectField) {
    subjectField.value = name
      ? `Call me back — ${name} (${slug})`
      : `Call me back — ${window.BRANDING?.brand_name || "Solena Digital"}`;
  }
}

async function submitToEndpoint(form, endpoint) {
  const response = await fetch(endpoint, {
    method: "POST",
    body: new FormData(form),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Could not send your request. Please try again.");
  }
}

function callbackApiBase() {
  return (window.BRANDING?.qr_scan_api || "").replace(/\/+$/, "");
}

function callbackPageName() {
  const path = (window.location.pathname || "").split("/").pop() || "";
  return path.replace(".html", "") || "unknown";
}

async function submitCallbackRequest(form, subject) {
  const endpoint = window.BRANDING?.formspree_callback_endpoint || "";
  if (endpoint) {
    await submitToEndpoint(form, endpoint);
    return;
  }

  const apiBase = callbackApiBase();
  if (!apiBase) {
    throw new Error("Callback service unavailable. Please use Phone / text above.");
  }

  const data = Object.fromEntries(new FormData(form).entries());
  const slug = data.business_slug || getSlug() || "";
  const response = await fetch(`${apiBase}/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      ...data,
      subject,
      slug,
      page: callbackPageName(),
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Could not send your request. Please try again.");
  }
}

function wireCallbackForm() {
  const form = document.getElementById("callback-form-connect");
  const statusEl = document.getElementById("callback-connect-status");
  if (!form || !statusEl) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    statusEl.textContent = "Sending…";
    statusEl.className = "form-status";

    const subject = document.getElementById("cb-connect-subject")?.value || "Call me back";

    try {
      await submitCallbackRequest(form, subject);
      statusEl.textContent = "Got it — we'll call you back soon!";
      statusEl.className = "form-status form-status-success";
      form.reset();
      setCallbackContext(window.__connectBusiness);
    } catch (err) {
      console.error(err);
      statusEl.textContent = err.message || "Something went wrong. Please call or email us.";
      statusEl.className = "form-status form-status-error";
    }
  });
}

async function init() {
  const branding = window.BRANDING;
  renderOffer(branding);
  renderContact(branding);

  const slug = getSlug();
  const businesses = await loadBusinesses();
  const match = businesses.find((b) => b.slug === slug);
  window.__connectBusiness = match;

  const headline = document.getElementById("headline");
  const subtitle = document.getElementById("subtitle");
  const previewLink = document.getElementById("preview-link");
  const pricingLink = document.getElementById("pricing-link");
  const registerLink = document.getElementById("register-link");
  const formBusiness = document.getElementById("form-business");

  if (pricingLink) pricingLink.href = withBiz("pricing.html");
  if (registerLink) registerLink.href = withBiz("register.html");
  setCallbackContext(match);
  wireCallbackForm();

  if (match) {
    headline.textContent = `We built a free preview website for ${match.name}`;
    subtitle.textContent = "Take a look, then register online to go live — we handle the rest.";
    configurePreviewLink(
      previewLink,
      window.PreviewLinks?.resolvePreviewHref(slug, businesses) || `../${match.preview_path}`,
      "View website preview"
    );
    formBusiness.value = match.name;
    document.title = `${match.name} Preview | ${branding.brand_name}`;
  } else if (slug) {
    headline.textContent = "Your free website preview";
    subtitle.textContent = "Review your preview, then register to launch with " + branding.brand_name + ".";
    configurePreviewLink(
      previewLink,
      window.PreviewLinks?.resolvePreviewHref(slug, businesses) || `../previews/${slug}/index.html`,
      "View website preview"
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
      window.PreviewLinks?.dynamicPreviewUrl(slug) || `../previews/${slug}/index.html`,
      "View website preview"
    );
  }
  document.getElementById("subtitle").textContent =
    "Could not load business details. You can still register or contact us below.";
});
