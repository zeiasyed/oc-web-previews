const STORAGE_KEY = "oc_registration";
const params = new URLSearchParams(window.location.search);
const slug = params.get("biz");

function withBiz(path) {
  return slug ? `${path}?biz=${encodeURIComponent(slug)}` : path;
}

function findBusiness() {
  const list = window.BUSINESSES || [];
  return slug ? list.find((b) => b.slug === slug) : null;
}

function saveRegistration(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      business: data.business,
      contact_name: data.contact_name,
      email: data.email,
      phone: data.phone,
      business_slug: slug || "",
      business_name: data.business_name || data.business,
      submitted_at: new Date().toISOString(),
    }),
  );
}

function setBusinessContext(match) {
  const name = match?.name || "";
  const displayName = name || (slug ? slug.replace(/-/g, " ") : "");

  const fields = {
    "reg-business-slug": slug || "",
    "reg-business-name": name,
    "reg-business-display": displayName,
    "cb-business-slug": slug || "",
    "cb-business-name": name,
    "sidebar-business-name": displayName || "Your business",
    "sidebar-business-slug": slug ? `QR code: ${slug}` : "",
  };

  for (const [id, value] of Object.entries(fields)) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (el.tagName === "INPUT") el.value = value;
    else el.textContent = value;
  }

  const regSubject = document.getElementById("reg-subject");
  const cbSubject = document.getElementById("cb-subject");
  if (regSubject) {
    regSubject.value = name
      ? `New registration — ${name} (${slug})`
      : `New registration — ${window.BRANDING?.brand_name || "Solena Digital"}`;
  }
  if (cbSubject) {
    cbSubject.value = name
      ? `Call me back — ${name} (${slug})`
      : `Call me back — ${window.BRANDING?.brand_name || "Solena Digital"}`;
  }
}

async function submitToEndpoint(form, endpoint) {
  const formData = new FormData(form);
  const response = await fetch(endpoint, {
    method: "POST",
    body: formData,
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
    throw new Error("Callback service unavailable. Please call us at " + (window.BRANDING?.phone_display || "714-686-4196") + ".");
  }

  const data = Object.fromEntries(new FormData(form).entries());
  const response = await fetch(`${apiBase}/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      ...data,
      subject,
      slug: data.business_slug || slug || "",
      page: callbackPageName(),
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Could not send your request. Please try again.");
  }
}

function showCallbackSuccess(form, statusEl) {
  const phone = new FormData(form).get("phone") || "";
  const phoneDisplay = window.BRANDING?.phone_display || "714-686-4196";
  const phoneHref = window.BRANDING?.phone || "7146864196";

  form.classList.add("is-submitted");
  statusEl.className = "callback-success-banner";
  statusEl.innerHTML =
    "<strong>Request received — we'll call you back soon!</strong>" +
    `<p>Thanks for reaching out. A Solena team member will call ${phone ? `<strong>${phone}</strong>` : "the number you provided"} as soon as we can.` +
    ` Our team has been notified by text and email. If it's urgent, call us at <a href="tel:${phoneHref}">${phoneDisplay}</a>.</p>`;
  statusEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function wireCallbackForm() {
  const form = document.getElementById("callback-form");
  const statusEl = document.getElementById("callback-status");
  if (!form || !statusEl) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    statusEl.textContent = "Sending your request…";
    statusEl.className = "form-status";

    const subject = document.getElementById("cb-subject")?.value || "Call me back";

    try {
      await submitCallbackRequest(form, subject);
      showCallbackSuccess(form, statusEl);
      form.reset();
      setBusinessContext(findBusiness());
    } catch (err) {
      console.error(err);
      statusEl.textContent = err.message || "Something went wrong. Please call or email us.";
      statusEl.className = "form-status form-status-error";
    }
  });
}

function wireRegisterForm() {
  const form = document.getElementById("register-form");
  const statusEl = document.getElementById("register-status");
  if (!form || !statusEl) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    statusEl.textContent = "Saving your registration…";
    statusEl.className = "form-status";

    saveRegistration(form);

    const endpoint = window.BRANDING?.formspree_register_endpoint || "";
    const subject = document.getElementById("reg-subject")?.value || "New registration";

    try {
      if (endpoint) {
        await submitToEndpoint(form, endpoint);
      }
    } catch (err) {
      console.error(err);
      statusEl.textContent = "Saved locally. Continuing to payment…";
      statusEl.className = "form-status";
      await new Promise((r) => setTimeout(r, 800));
    }

    statusEl.textContent = "Registration complete! Redirecting to secure payment…";
    statusEl.className = "form-status form-status-success";

    setTimeout(() => {
      window.location.href = withBiz("payment.html");
    }, 900);
  });
}

const match = findBusiness();
setBusinessContext(match);

const pricingBack = document.getElementById("pricing-back");
if (pricingBack) pricingBack.href = withBiz("pricing.html");

wireRegisterForm();
wireCallbackForm();
