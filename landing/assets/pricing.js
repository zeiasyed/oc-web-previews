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
    const href =
      window.PreviewLinks?.resolvePreviewHref(slug, businesses) ||
      `../previews/${slug}/index.html`;
    backLink.href = href;
    backLink.target = "_blank";
    backLink.rel = "noopener noreferrer";
  } catch {
    backLink.href =
      window.PreviewLinks?.dynamicPreviewUrl(slug) || `../previews/${slug}/index.html`;
    backLink.target = "_blank";
    backLink.rel = "noopener noreferrer";
  }
}

init();
