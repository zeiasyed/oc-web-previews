const MIME_TYPES = {
  ".html": "text/html;charset=UTF-8",
  ".css": "text/css;charset=UTF-8",
  ".js": "application/javascript;charset=UTF-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".json": "application/json;charset=UTF-8",
  ".xml": "application/xml;charset=UTF-8",
  ".txt": "text/plain;charset=UTF-8",
};

const ROLE_LABELS = {
  site: "Clinical research site",
  sponsor: "Sponsor",
  cro: "CRO",
  other: "Other",
};

const REGION_LABELS = {
  us: "United States",
  europe: "Europe",
  gcc: "GCC (Middle East)",
  pakistan: "Pakistan",
  canada: "Canada",
  other: "Other",
};

const rateLimit = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 5;

const PRIMARY_HOST = "nexa-trials.com";
const LEGACY_HOSTS = new Set(["auctus-intl.com", "www.auctus-intl.com"]);
const TRACKER_REALM = "NexaScheduler";
const LAB_REALM = "Nexa Trials Lab";

function isTrackerPath(pathname) {
  const path = pathname.split("?")[0].replace(/\/$/, "") || "/";
  return (
    path === "/visit-schedule-tracker" ||
    path === "/visit-schedule-tracker.html" ||
    path === "/nexascheduler-app" ||
    path === "/nexascheduler-app.html"
  );
}

function isNoIndexPath(pathname) {
  const path = pathname.split("?")[0].replace(/\/$/, "") || "/";
  return (
    isTrackerPath(pathname) ||
    isLabPath(pathname) ||
    isDemoPath(pathname) ||
    path === "/nexamonitor-app" ||
    path === "/nexamonitor-app.html" ||
    path === "/nexasource-ui-demo" ||
    path === "/nexasource-ui-demo.html"
  );
}

function isLabPath(pathname) {
  const path = pathname.split("?")[0].replace(/\/$/, "") || "/";
  return path === "/lab/direct" || path === "/lab/direct.html" || path.startsWith("/lab/");
}

function labAuthChallenge() {
  return new Response("Authentication required.", {
    status: 401,
    headers: {
      "Content-Type": "text/plain; charset=UTF-8",
      "WWW-Authenticate": `Basic realm="${LAB_REALM}", charset="UTF-8"`,
      "Cache-Control": "no-store",
    },
  });
}

function checkLabAuth(request, env) {
  const expectedUser = env.NEXADIRECT_LAB_USER;
  const expectedPass = env.NEXADIRECT_LAB_PASSWORD;
  if (!expectedUser || !expectedPass) {
    return new Response("NexaDirect lab access is not configured.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=UTF-8", "Cache-Control": "no-store" },
    });
  }

  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Basic ")) return labAuthChallenge();

  let decoded = "";
  try {
    decoded = atob(auth.slice(6));
  } catch {
    return labAuthChallenge();
  }

  const colon = decoded.indexOf(":");
  const username = colon >= 0 ? decoded.slice(0, colon) : decoded;
  const password = colon >= 0 ? decoded.slice(colon + 1) : "";
  if (username !== expectedUser || password !== expectedPass) return labAuthChallenge();

  return null;
}

function trackerAuthChallenge() {
  return new Response("Authentication required.", {
    status: 401,
    headers: {
      "Content-Type": "text/plain; charset=UTF-8",
      "WWW-Authenticate": `Basic realm="${TRACKER_REALM}", charset="UTF-8"`,
      "Cache-Control": "no-store",
    },
  });
}

function checkTrackerAuth(request, env) {
  const expected = env.VISIT_TRACKER_PASSWORD;
  if (!expected) {
    return new Response("NexaScheduler is not configured.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=UTF-8", "Cache-Control": "no-store" },
    });
  }

  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Basic ")) return trackerAuthChallenge();

  let decoded = "";
  try {
    decoded = atob(auth.slice(6));
  } catch {
    return trackerAuthChallenge();
  }

  const colon = decoded.indexOf(":");
  const password = colon >= 0 ? decoded.slice(colon + 1) : decoded;
  if (password !== expected) return trackerAuthChallenge();

  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = getCorsHeaders(request, env);

    if (url.hostname === `www.${PRIMARY_HOST}`) {
      return Response.redirect(`https://${PRIMARY_HOST}${url.pathname}${url.search}`, 301);
    }

    if (LEGACY_HOSTS.has(url.hostname)) {
      return Response.redirect(`https://${PRIMARY_HOST}${url.pathname}${url.search}`, 301);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (url.pathname === "/health" || url.pathname === "/api/health") {
      return json({ ok: true, service: "nexa-trials-api" }, 200, corsHeaders);
    }

    if (request.method === "POST" && (url.pathname === "/contact" || url.pathname === "/api/contact")) {
      return handleContact(request, env, corsHeaders);
    }

    if (request.method === "POST" && (url.pathname === "/careers" || url.pathname === "/api/careers")) {
      return handleCareersApplication(request, env, corsHeaders);
    }

    if (url.pathname.startsWith("/api/demos/")) {
      const demoRes = await handleClientDemosRequest(request, env, url);
      if (demoRes) return demoRes;
    }

    if (request.method === "GET" || request.method === "HEAD") {
      if (isTrackerPath(url.pathname)) {
        const authFail = checkTrackerAuth(request, env);
        if (authFail) return authFail;
      }
      if (isLabPath(url.pathname)) {
        const authFail = checkLabAuth(request, env);
        if (authFail) return authFail;
      }

      const staticResponse = serveStatic(url.pathname, request.method);
      if (staticResponse) {
        if (isNoIndexPath(url.pathname)) {
          const headers = new Headers(staticResponse.headers);
          if (isTrackerPath(url.pathname) || isLabPath(url.pathname)) {
            headers.set("Cache-Control", "private, no-store");
          }
          headers.set("X-Robots-Tag", "noindex, nofollow");
          return new Response(staticResponse.body, {
            status: staticResponse.status,
            headers,
          });
        }
        return staticResponse;
      }
    }

    return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });
  },
};

function cacheControlForPath(pathname, ext) {
  if (ext === ".html") return "public, max-age=0, must-revalidate";
  if (ext === ".js" || ext === ".css") return "public, max-age=3600";
  return "public, max-age=86400";
}

function serveStatic(pathname, method) {
  const path = resolveStaticPath(pathname);
  const b64 = typeof STATIC_B64 !== "undefined" ? STATIC_B64[path] : null;
  if (!b64) return null;

  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  const headers = {
    "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
    "Cache-Control": cacheControlForPath(pathname, ext),
  };

  if (method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }

  return new Response(bytes, { status: 200, headers });
}

function resolveStaticPath(pathname) {
  let path = pathname.split("?")[0];
  if (!path.startsWith("/")) path = `/${path}`;
  if (path === "/nexascheduler-app" || path === "/nexascheduler-app.html") {
    path = "/visit-schedule-tracker.html";
  }
  if (path === "/lab/direct" || path === "/lab/direct/") {
    path = "/lab/index.html";
  }
  if (path === "/lab" || path === "/lab/") {
    path = "/lab/index.html";
  }
  if (path === "/demos" || path === "/demos/" || path === "/demos/index.html") {
    path = "/demos/login.html";
  }
  if (path.endsWith("/")) path += "index.html";
  if (path !== "/" && !path.includes(".")) path += ".html";
  if (path === "/") path = "/index.html";
  return path;
}

async function handleContact(request, env, corsHeaders) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400, corsHeaders);
  }

  if (body.website) {
    return json({ message: "Thank you — we will be in touch shortly." }, 200, corsHeaders);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (isRateLimited(ip)) {
    return json({ error: "Too many requests. Please try again in a minute." }, 429, corsHeaders);
  }

  const name = clean(body.name, 120);
  const organization = clean(body.organization, 160);
  const role = clean(body.role, 40);
  const email = clean(body.email, 160).toLowerCase();
  const region = clean(body.region, 40);
  const message = clean(body.message, 4000);

  if (!name || !email || !message) {
    return json({ error: "Name, email, and message are required." }, 400, corsHeaders);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Please enter a valid email address." }, 400, corsHeaders);
  }

  const contactTo = env.CONTACT_TO || "info@nexa-trials.com";
  const fromEmail = env.FROM_EMAIL || "noreply@nexa-trials.com";
  const subject = `Nexa Trials inquiry — ${organization || name}`;
  const text = [
    "New contact form submission",
    "",
    `Name: ${name}`,
    `Organization: ${organization || "—"}`,
    `Role: ${ROLE_LABELS[role] || role || "—"}`,
    `Email: ${email}`,
    `Region: ${REGION_LABELS[region] || region || "—"}`,
    "",
    "Message:",
    message,
    "",
    `Submitted: ${new Date().toISOString()}`,
    `IP: ${ip}`,
  ].join("\n");

  const html = `
    <h2>New Nexa Trials inquiry</h2>
    <p><strong>Name:</strong> ${escapeHtml(name)}</p>
    <p><strong>Organization:</strong> ${escapeHtml(organization || "—")}</p>
    <p><strong>Role:</strong> ${escapeHtml(ROLE_LABELS[role] || role || "—")}</p>
    <p><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>
    <p><strong>Region:</strong> ${escapeHtml(REGION_LABELS[region] || region || "—")}</p>
    <p><strong>Message:</strong></p>
    <pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(message)}</pre>
  `;

  try {
    if (env.GAS_WEBAPP_URL) {
      const gasRes = await fetch(env.GAS_WEBAPP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, organization, role, email, region, message, subject }),
      });
      const gasData = await gasRes.json().catch(() => ({}));
      if (gasRes.ok && !gasData.error) {
        return json(
          { message: gasData.message || "Thank you — we will be in touch within one business day." },
          200,
          corsHeaders
        );
      }
      console.error("GAS send failed:", gasRes.status, gasData);
    }

    await sendEmail(env, { to: contactTo, from: fromEmail, subject, text, html, replyTo: email });
  } catch (err) {
    console.error("Email send failed:", err);
    return json(
      {
        error:
          "Unable to send your message right now. Please email info@nexa-trials.com directly.",
      },
      503,
      corsHeaders
    );
  }

  return json({ message: "Thank you — we will be in touch within one business day." }, 200, corsHeaders);
}

const CAREERS_EXPERIENCE_LABELS = {
  lt1: "Less than 1 year",
  "1-3": "1–3 years",
  "3-5": "3–5 years",
  "5-8": "5–8 years",
  "8plus": "8+ years",
};

const CAREERS_AUTH_LABELS = {
  citizen: "Citizen / national",
  permanent: "Permanent resident",
  visa: "Work visa — sponsorship required",
  no: "Not authorized to work in this country",
};

const CAREERS_ARRANGEMENT_LABELS = {
  onsite: "On-site",
  hybrid: "Hybrid",
  remote: "Remote",
};

const CAREERS_NOTICE_LABELS = {
  immediate: "Available immediately",
  "2weeks": "2 weeks",
  "1month": "1 month",
  "2plus": "2+ months",
};

const CAREERS_TRAVEL_LABELS = {
  none: "None",
  "25": "Up to 25%",
  "50": "Up to 50%",
  "50plus": "50%+",
};

const CAREERS_SOURCE_LABELS = {
  linkedin: "LinkedIn",
  jobboard: "Job board",
  referral: "Employee / colleague referral",
  website: "Nexa Trials website",
  conference: "Conference or industry event",
  other: "Other",
};

const CAREERS_EDUCATION_LABELS = {
  hs: "High school / secondary",
  associate: "Associate degree",
  bachelor: "Bachelor's degree",
  master: "Master's degree",
  doctorate: "Doctorate",
};

const CAREERS_GCP_LABELS = {
  certified: "GCP certified",
  trained: "GCP trained, not certified",
  willing: "Not trained — willing to complete",
  na: "Not applicable",
};

const MAX_CAREERS_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_CAREERS_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

async function handleCareersApplication(request, env, corsHeaders) {
  const contentType = request.headers.get("Content-Type") || "";
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";

  let fields;
  let resumeAttachment;
  let coverLetterAttachment;

  if (contentType.includes("application/json")) {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid submission format." }, 400, corsHeaders);
    }

    if (body.website) {
      return json({ message: "Thank you. Your application has been received." }, 200, corsHeaders);
    }

    fields = extractCareersFields(body);
    try {
      resumeAttachment = parseCareersBase64File(body.resume, "resume");
      coverLetterAttachment = parseCareersBase64File(body.coverLetter, "cover_letter", false);
    } catch (err) {
      return json({ error: err.message || "Invalid file upload." }, 400, corsHeaders);
    }
  } else if (contentType.includes("multipart/form-data")) {
    let formData;
    try {
      formData = await request.formData();
    } catch {
      return json({ error: "Unable to read application." }, 400, corsHeaders);
    }

    if (formData.get("website")) {
      return json({ message: "Thank you. Your application has been received." }, 200, corsHeaders);
    }

    fields = extractCareersFields({
      name: formData.get("name"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      linkedin: formData.get("linkedin"),
      jobId: formData.get("jobId"),
      jobTitle: formData.get("jobTitle"),
      jobLocation: formData.get("jobLocation"),
      experience: formData.get("experience"),
      workAuth: formData.get("workAuth"),
      arrangement: formData.get("arrangement"),
      notice: formData.get("notice"),
      travel: formData.get("travel"),
      source: formData.get("source"),
      education: formData.get("education"),
      gcp: formData.get("gcp"),
      coverNote: formData.get("coverNote"),
    });

    try {
      resumeAttachment = await readCareersUploadFile(formData, "resume");
      coverLetterAttachment = await readCareersUploadFile(formData, "coverLetter", false);
    } catch (err) {
      return json({ error: err.message || "Invalid file upload." }, 400, corsHeaders);
    }
  } else {
    return json({ error: "Invalid submission format." }, 400, corsHeaders);
  }

  if (isRateLimited(ip)) {
    return json({ error: "Too many requests. Please try again in a minute." }, 429, corsHeaders);
  }

  const {
    name,
    email,
    phone,
    linkedin,
    jobId,
    jobTitle,
    jobLocation,
    experience,
    workAuth,
    arrangement,
    notice,
    travel,
    source,
    education,
    gcp,
    coverNote,
  } = fields;

  if (!name || !email || !phone || !jobId || !jobTitle) {
    return json({ error: "Name, email, phone, and position are required." }, 400, corsHeaders);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Please enter a valid email address." }, 400, corsHeaders);
  }

  if (!resumeAttachment) {
    return json({ error: "Resume is required (PDF or Word, max 5 MB)." }, 400, corsHeaders);
  }

  const careersTo = env.CAREERS_TO || "zeiasyed@hotmail.com";
  const fromEmail = env.FROM_EMAIL || "noreply@nexa-trials.com";
  const subject = `Careers application — ${jobTitle} — ${name}`;
  const text = [
    "New careers application",
    "",
    `Position: ${jobTitle} (${jobId})`,
    `Location: ${jobLocation || "—"}`,
    "",
    `Name: ${name}`,
    `Email: ${email}`,
    `Phone: ${phone}`,
    `LinkedIn: ${linkedin || "—"}`,
    "",
    `Years of experience: ${CAREERS_EXPERIENCE_LABELS[experience] || experience || "—"}`,
    `Work authorization: ${CAREERS_AUTH_LABELS[workAuth] || workAuth || "—"}`,
    `Work arrangement: ${CAREERS_ARRANGEMENT_LABELS[arrangement] || arrangement || "—"}`,
    `Notice period: ${CAREERS_NOTICE_LABELS[notice] || notice || "—"}`,
    `Travel willingness: ${CAREERS_TRAVEL_LABELS[travel] || travel || "—"}`,
    `How they heard about us: ${CAREERS_SOURCE_LABELS[source] || source || "—"}`,
    `Highest education: ${CAREERS_EDUCATION_LABELS[education] || education || "—"}`,
    `GCP / clinical training: ${CAREERS_GCP_LABELS[gcp] || gcp || "—"}`,
    "",
    "Cover note:",
    coverNote || "—",
    "",
    `Resume attached: ${resumeAttachment.filename}`,
    coverLetterAttachment ? `Cover letter attached: ${coverLetterAttachment.filename}` : "Cover letter: not provided",
    "",
    `Submitted: ${new Date().toISOString()}`,
    `IP: ${ip}`,
  ].join("\n");

  const html = `
    <h2>New careers application</h2>
    <p><strong>Position:</strong> ${escapeHtml(jobTitle)} <span style="color:#64748b">(${escapeHtml(jobId)})</span></p>
    <p><strong>Location:</strong> ${escapeHtml(jobLocation || "—")}</p>
    <hr>
    <p><strong>Name:</strong> ${escapeHtml(name)}</p>
    <p><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>
    <p><strong>Phone:</strong> ${escapeHtml(phone)}</p>
    <p><strong>LinkedIn:</strong> ${linkedin ? `<a href="${escapeHtml(linkedin)}">${escapeHtml(linkedin)}</a>` : "—"}</p>
    <hr>
    <p><strong>Years of experience:</strong> ${escapeHtml(CAREERS_EXPERIENCE_LABELS[experience] || experience || "—")}</p>
    <p><strong>Work authorization:</strong> ${escapeHtml(CAREERS_AUTH_LABELS[workAuth] || workAuth || "—")}</p>
    <p><strong>Work arrangement:</strong> ${escapeHtml(CAREERS_ARRANGEMENT_LABELS[arrangement] || arrangement || "—")}</p>
    <p><strong>Notice period:</strong> ${escapeHtml(CAREERS_NOTICE_LABELS[notice] || notice || "—")}</p>
    <p><strong>Travel willingness:</strong> ${escapeHtml(CAREERS_TRAVEL_LABELS[travel] || travel || "—")}</p>
    <p><strong>How they heard about us:</strong> ${escapeHtml(CAREERS_SOURCE_LABELS[source] || source || "—")}</p>
    <p><strong>Highest education:</strong> ${escapeHtml(CAREERS_EDUCATION_LABELS[education] || education || "—")}</p>
    <p><strong>GCP / clinical training:</strong> ${escapeHtml(CAREERS_GCP_LABELS[gcp] || gcp || "—")}</p>
    <p><strong>Cover note:</strong></p>
    <pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(coverNote || "—")}</pre>
    <p><em>Resume and cover letter are attached to this email when supported by the mail provider.</em></p>
  `;

  const attachments = [resumeAttachment];
  if (coverLetterAttachment) attachments.push(coverLetterAttachment);

  try {
    await sendEmail(env, {
      to: careersTo,
      from: fromEmail,
      subject,
      text,
      html,
      replyTo: email,
      attachments,
    });
  } catch (err) {
    console.error("Careers email send failed:", err);
    return json(
      {
        error:
          "Unable to submit your application right now. Please email your resume to info@nexa-trials.com with the role title in the subject line.",
      },
      503,
      corsHeaders
    );
  }

  return json({ message: "Thank you. Your application has been received. We will contact you if your profile is a match." }, 200, corsHeaders);
}

function extractCareersFields(body) {
  return {
    name: clean(body.name, 120),
    email: clean(body.email, 160).toLowerCase(),
    phone: clean(body.phone, 40),
    linkedin: clean(body.linkedin, 240),
    jobId: clean(body.jobId, 80),
    jobTitle: clean(body.jobTitle, 160),
    jobLocation: clean(body.jobLocation, 200),
    experience: clean(body.experience, 20),
    workAuth: clean(body.workAuth, 20),
    arrangement: clean(body.arrangement, 20),
    notice: clean(body.notice, 20),
    travel: clean(body.travel, 20),
    source: clean(body.source, 20),
    education: clean(body.education, 20),
    gcp: clean(body.gcp, 20),
    coverNote: clean(body.coverNote, 4000),
  };
}

function parseCareersBase64File(data, label, required = true) {
  if (!data || typeof data !== "object") {
    if (required) return null;
    return null;
  }

  const filename = clean(data.filename, 120) || `${label}.pdf`;
  const content = String(data.content || "").replace(/\s/g, "");
  if (!content) {
    if (required) return null;
    return null;
  }

  const mime = clean(data.mime, 120).toLowerCase();
  const ext = filename.split(".").pop().toLowerCase();
  const allowedExt = new Set(["pdf", "doc", "docx", "txt"]);
  if (mime && !ALLOWED_CAREERS_MIME.has(mime) && !allowedExt.has(ext)) {
    throw new Error(`${label} must be PDF or Word format.`);
  }

  const approxBytes = Math.floor((content.length * 3) / 4);
  if (approxBytes > MAX_CAREERS_FILE_BYTES) {
    throw new Error(`${label} must be 5 MB or smaller.`);
  }

  return {
    filename,
    content,
    mime: mime || "application/octet-stream",
  };
}

async function readCareersUploadFile(formData, fieldName, required = true) {
  let file = formData.get(fieldName);
  if (!isUploadFile(file)) {
    for (const [key, value] of formData.entries()) {
      if (key === fieldName && isUploadFile(value)) {
        file = value;
        break;
      }
    }
  }
  return readCareersFile(file, fieldName === "coverLetter" ? "cover_letter" : "resume", required);
}

async function readCareersFile(file, label, required = true) {
  if (!isUploadFile(file)) {
    if (required) return null;
    return null;
  }

  const filename = clean(file.name || `${label}.pdf`, 120) || `${label}.pdf`;
  const mime = (file.type || "").toLowerCase();
  const ext = filename.split(".").pop().toLowerCase();
  const allowedExt = new Set(["pdf", "doc", "docx", "txt"]);
  if (mime && !ALLOWED_CAREERS_MIME.has(mime) && !allowedExt.has(ext)) {
    throw new Error(`${label} must be PDF or Word format.`);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.length) {
    if (required) throw new Error(`${label} file is empty.`);
    return null;
  }
  if (bytes.length > MAX_CAREERS_FILE_BYTES) {
    throw new Error(`${label} must be 5 MB or smaller.`);
  }

  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  return {
    filename,
    content: btoa(binary),
    mime: mime || "application/octet-stream",
  };
}

function isUploadFile(value) {
  return Boolean(value && typeof value === "object" && typeof value.arrayBuffer === "function");
}

async function sendEmail(env, { to, from, subject, text, html, replyTo, attachments = [] }) {
  if (env.EMAIL && typeof env.EMAIL.send === "function") {
    await env.EMAIL.send({ to, from, subject, text, html, replyTo, attachments });
    return;
  }

  if (env.RESEND_API_KEY) {
    const fromCandidates = [
      from.includes("<") ? from : `Nexa Trials <${from}>`,
      "Nexa Trials <onboarding@resend.dev>",
    ];
    let lastError = "";
    for (const fromAddr of fromCandidates) {
      const payload = {
        from: fromAddr,
        to: [to],
        reply_to: replyTo,
        subject,
        text,
        html,
      };
      if (attachments.length) {
        payload.attachments = attachments.map((file) => ({
          filename: file.filename,
          content: file.content,
        }));
      }
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) return;
      lastError = await res.text();
      console.error("Resend attempt failed:", fromAddr, lastError);
    }
    throw new Error(`Resend failed: ${lastError.slice(0, 300)}`);
  }

  const fromMatch = from.match(/<([^>]+)>/);
  const fromEmail = fromMatch ? fromMatch[1] : from;
  const fromName = from.includes("<") ? from.replace(/<[^>]+>/, "").trim() || "Nexa Trials" : "Nexa Trials";
  const personalization = { to: [{ email: to }] };
  if (replyTo) personalization.reply_to = { email: replyTo };
  const mcRes = await fetch("https://api.mailchannels.net/tx/v1/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [personalization],
      from: { email: fromEmail, name: fromName },
      subject,
      content: [
        { type: "text/plain", value: text },
        { type: "text/html", value: html },
      ],
    }),
  });
  if (mcRes.status === 202 || mcRes.ok) return;

  const mcDetail = await mcRes.text();
  console.error("Mailchannels error:", mcRes.status, mcDetail);
  throw new Error(`Mailchannels ${mcRes.status}: ${mcDetail.slice(0, 300)}`);
}

function getCorsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.CORS_ORIGINS || "https://nexa-trials.com,https://www.nexa-trials.com,https://auctus-intl.com,https://www.auctus-intl.com")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };

  const originAllowed =
    allowed.includes(origin) ||
    allowed.includes("*") ||
    (origin && origin.endsWith(".pages.dev"));

  if (originAllowed) {
    headers["Access-Control-Allow-Origin"] = origin || allowed[0];
  }

  return headers;
}

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimit.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW_MS) {
    rateLimit.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_MAX;
}

function clean(value, max) {
  return String(value || "")
    .trim()
    .slice(0, max);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function json(data, status, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}
