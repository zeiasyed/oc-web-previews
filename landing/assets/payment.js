const STORAGE_KEY = "oc_registration";
const params = new URLSearchParams(window.location.search);
const slug = params.get("biz");

function withBiz(path) {
  return slug ? `${path}?biz=${encodeURIComponent(slug)}` : path;
}

function loadRegistration() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function findBusiness() {
  const list = window.BUSINESSES || [];
  return slug ? list.find((b) => b.slug === slug) : null;
}

function showCheckout(reg) {
  const missing = document.getElementById("missing-registration");
  const content = document.getElementById("checkout-content");
  if (!reg) {
    missing?.classList.remove("hidden");
    content?.classList.add("hidden");
    return;
  }

  missing?.classList.add("hidden");
  content?.classList.remove("hidden");

  const match = findBusiness();
  const businessName = reg.business || match?.name || "Your business";

  document.getElementById("pay-business-name").textContent = businessName;
  document.getElementById("pay-business-slug").textContent = slug
    ? `Preview site: ${slug}`
    : "";
  document.getElementById("pay-contact-name").textContent = reg.contact_name || "";
  document.getElementById("pay-contact-email").textContent = reg.email || "";
  document.getElementById("pay-contact-phone").textContent = reg.phone || "";
}

function buildStripeUrl(baseUrl, email) {
  if (!baseUrl) return "";
  try {
    const url = new URL(baseUrl);
    if (email) url.searchParams.set("prefilled_email", email);
    if (slug) url.searchParams.set("client_reference_id", slug);
    return url.toString();
  } catch {
    return baseUrl;
  }
}

const reg = loadRegistration();
showCheckout(reg);

const gotoRegister = document.getElementById("goto-register");
const editRegistration = document.getElementById("edit-registration");
const callbackLink = document.getElementById("callback-link");
if (gotoRegister) gotoRegister.href = withBiz("register.html");
if (editRegistration) editRegistration.href = withBiz("register.html");
if (callbackLink) callbackLink.href = `${withBiz("register.html")}#callback`;

const authorize = document.getElementById("authorize-billing");
const payBtn = document.getElementById("pay-now");
const statusEl = document.getElementById("payment-status");
const setupNote = document.getElementById("stripe-setup-note");
const stripeLink = window.BRANDING?.stripe_payment_link || "";

if (!stripeLink && setupNote) {
  setupNote.classList.remove("hidden");
}

if (authorize && payBtn) {
  authorize.addEventListener("change", () => {
    payBtn.disabled = !authorize.checked || !stripeLink;
  });
}

if (payBtn) {
  payBtn.addEventListener("click", () => {
    if (!authorize?.checked) {
      statusEl.textContent = "Please authorize billing to continue.";
      statusEl.className = "form-status form-status-error";
      return;
    }

    if (!stripeLink) {
      statusEl.textContent = "Payment link not configured. Use Call me back or contact us.";
      statusEl.className = "form-status form-status-error";
      return;
    }

    statusEl.textContent = "Redirecting to secure Stripe checkout…";
    statusEl.className = "form-status form-status-success";

    const checkoutUrl = buildStripeUrl(stripeLink, reg?.email);
    setTimeout(() => {
      window.location.href = checkoutUrl;
    }, 600);
  });
}
