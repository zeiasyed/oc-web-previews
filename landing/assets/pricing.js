const slug = new URLSearchParams(window.location.search).get("biz");

function withBiz(path) {
  return slug ? `${path}?biz=${encodeURIComponent(slug)}` : path;
}

async function loadBusinesses() {
  if (window.BUSINESSES) return window.BUSINESSES;
  const response = await fetch("businesses.json");
  if (!response.ok) throw new Error("Could not load businesses.json");
  return response.json();
}

function previewHref(businesses) {
  if (!slug) return null;
  const match = businesses.find((b) => b.slug === slug);
  if (match?.preview_path) return `../${match.preview_path}`;
  return `../previews/${slug}/index.html`;
}

async function init() {
  const backLink = document.getElementById("back-link");
  const contactLink = document.getElementById("contact-link");

  if (contactLink) {
    contactLink.href = withBiz("register.html");
    contactLink.textContent = "Register & get started";
  }

  if (!backLink) return;

  if (!slug) {
    backLink.href = "connect.html";
    return;
  }

  try {
    const businesses = await loadBusinesses();
    const href = previewHref(businesses);
    if (href) backLink.href = href;
  } catch {
    backLink.href = `../previews/${slug}/index.html`;
  }
}

init();
