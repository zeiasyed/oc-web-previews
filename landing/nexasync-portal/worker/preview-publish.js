/** One-click plumber preview publish — generate & serve sites from D1 (concat before plumber-outreach-voice.js) */

const PREVIEW_PUBLIC_BASE = "https://api.inertia-intel.com/preview";
const FUNNEL_CONNECT_BASE = "https://api.inertia-intel.com/funnel/connect";

function previewPagesOrigin(env) {
  return String(env.PREVIEW_PAGES_ORIGIN || env.PUBLIC_MARKETING_URL || "https://inertia-intel.com").replace(/\/+$/, "");
}

function dashboardPublishUrl(env, callId, publishKey) {
  const base = String(env.PREVIEW_PUBLISH_PAGE_BASE || previewPagesOrigin(env) + "/landing/scan-dashboard/publish.html").replace(
    /\/+$/,
    ""
  );
  const params = new URLSearchParams({ call: String(callId) });
  if (publishKey) params.set("k", String(publishKey));
  return `${base}?${params.toString()}`;
}

async function checkPublishKeyAuth(env, callId, publishKey) {
  const id = String(callId || "").trim();
  const key = String(publishKey || "").trim();
  if (!id || !key) return false;
  await ensurePreviewPublishSchema(env);
  const row = await env.DB.prepare("SELECT publish_key FROM plumber_publish_queue WHERE call_id = ?1").bind(id).first();
  return !!(row?.publish_key && row.publish_key === key);
}

async function authorizePlumberPublishRequest(request, env, body) {
  if (typeof checkPlumberOutreachAuth === "function" && checkPlumberOutreachAuth(request, env)) return true;
  const url = new URL(request.url);
  const callId = body?.call_id || url.searchParams.get("call");
  const publishKey = body?.k || body?.publish_key || url.searchParams.get("k");
  return checkPublishKeyAuth(env, callId, publishKey);
}

const PLUMBER_THEME = {
  primary: "#0c4a6e",
  primary_dark: "#082f49",
  accent: "#0ea5e9",
  text: "#0f172a",
  muted: "#64748b",
  bg: "#f0f9ff",
  hero_gradient: "linear-gradient(135deg, #0c4a6e 0%, #0369a1 55%, #0ea5e9 100%)",
};

const PLUMBER_SERVICES = [
  {
    title: "Emergency Plumbing Repairs",
    description: "Burst pipes, major leaks, and backed-up drains — fast response when every minute counts.",
    image: "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=600&q=80",
  },
  {
    title: "Drain Cleaning & Sewer Service",
    description: "Clear stubborn clogs and restore flow with professional equipment and lasting results.",
    image: "https://images.unsplash.com/photo-1748399132710-d509b7ef3e64?w=600&q=80",
  },
  {
    title: "Water Heater Repair & Installation",
    description: "Tank and tankless water heaters serviced, repaired, or replaced with energy-efficient options.",
    image: "https://images.unsplash.com/photo-1722604831786-656f0bac1502?w=600&q=80",
  },
  {
    title: "Fixture & Pipe Installation",
    description: "Faucets, toilets, garbage disposals, and repiping done right the first time.",
    image: "https://images.unsplash.com/photo-1739176566047-d9573b6c9fac?w=600&q=80",
  },
];

const PLUMBER_BLOG = [
  {
    title: "5 Signs You Need a Plumber Right Away",
    excerpt: "Slow drains, water stains, and low pressure often signal bigger problems.",
    date: "March 2026",
    image: "https://images.unsplash.com/photo-1763100351670-756f71d57c9f?w=600&q=80",
  },
  {
    title: "How to Prevent Costly Pipe Leaks at Home",
    excerpt: "Simple maintenance habits can save thousands in water damage.",
    date: "February 2026",
    image: "https://images.unsplash.com/photo-1771235920955-ce44a568803c?w=600&q=80",
  },
];

function previewThemeStyle() {
  const t = PLUMBER_THEME;
  return `:root{--primary:${t.primary};--primary-dark:${t.primary_dark};--accent:${t.accent};--text:${t.text};--muted:${t.muted};--bg:${t.bg};--hero-gradient:${t.hero_gradient};--white:#fff;--shadow:0 10px 30px rgba(15,23,42,.08);--shadow-lg:0 20px 50px rgba(15,23,42,.12);--radius:14px}`;
}

function previewPhoneRaw(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function previewPhoneDisplay(phone) {
  const d = previewPhoneRaw(phone);
  if (d.length === 11 && d[0] === "1") {
    return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return String(phone || "").trim();
}

function previewEsc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function previewNav(slug, active) {
  const pages = [
    ["index.html", "Home"],
    ["services.html", "Services"],
    ["about.html", "About"],
    ["blog.html", "Tips & Guides"],
    ["contact.html", "Contact"],
  ];
  return pages
    .map(([href, label]) => {
      const cls = active === href ? ' class="active"' : "";
      if (label === "Contact") return `<a href="${href}" class="btn btn-small">${label}</a>`;
      return `<a href="${href}"${cls}>${label}</a>`;
    })
    .join("\n        ");
}

function previewBar(slug) {
  const connect = `${FUNNEL_CONNECT_BASE}?biz=${encodeURIComponent(slug)}`;
  return `<div class="preview-bar" role="complementary"><div class="container preview-bar-inner"><p class="preview-bar-text"><strong>Like this site?</strong> Make it yours with Solena Digital.</p><a href="${connect}" class="btn btn-preview">Next steps — no obligation →</a></div></div>`;
}

function previewHead(name, desc, slug, env) {
  const cssUrl = `${previewPagesOrigin(env)}/previews/donnie-underwood-plumbing-abilene/styles.css`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${previewEsc(name)} | Plumbing Services</title><meta name="description" content="${previewEsc(desc)}"><style>${previewThemeStyle()}</style><link rel="stylesheet" href="${cssUrl}"></head>`;
}

function previewFooter(name, slug) {
  return `<footer class="site-footer"><div class="container footer-inner"><div><strong>${previewEsc(name)}</strong><p class="preview-note">Preview site by <a href="${FUNNEL_CONNECT_BASE}?biz=${encodeURIComponent(slug)}">Solena Digital</a></p></div></div></footer>${previewBar(slug)}</body></html>`;
}

function buildPreviewContext(lead) {
  const name = String(lead.company_name || lead.name || "Local Plumber").trim();
  const city = String(lead.city || "Inland Empire").trim();
  const slug = String(lead.slug || "").trim() || slugifyPreviewName(name, city);
  const phone = previewPhoneDisplay(lead.phone);
  const phoneRaw = previewPhoneRaw(lead.phone);
  const address = String(lead.address || `${city}, CA`).trim();
  const tagline = `Trusted plumbing professionals serving ${city} and surrounding cities.`;
  const about = `${name} is a local plumbing company dedicated to reliable repairs, clean installations, and honest service for homeowners and businesses in ${city}.`;
  return { name, city, slug, phone, phoneRaw, address, tagline, about };
}

function slugifyPreviewName(name, city) {
  return String(name + " " + city)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function generatePreviewFiles(lead, env) {
  const c = buildPreviewContext(lead);
  const header = (active) =>
    `<header class="site-header"><div class="container header-inner"><div class="logo">${previewEsc(c.name)}</div><nav>${previewNav(c.slug, active)}</nav></div></header>`;
  const tel = c.phoneRaw ? `<a href="tel:${c.phoneRaw}" class="btn btn-outline">${previewEsc(c.phone)}</a>` : "";
  const servicesHtml = PLUMBER_SERVICES.map(
    (s) =>
      `<article class="service-tile"><img src="${s.image}" alt="${previewEsc(s.title)}" class="service-tile-image"><div class="service-tile-body"><h3>${previewEsc(s.title)}</h3><p>${previewEsc(s.description)}</p></div></article>`
  ).join("");
  const blogHtml = PLUMBER_BLOG.map(
    (b) =>
      `<article class="blog-card"><img src="${b.image}" alt="" class="blog-card-image"><div class="blog-card-body"><p class="blog-date">${previewEsc(b.date)}</p><h3>${previewEsc(b.title)}</h3><p>${previewEsc(b.excerpt)}</p></div></article>`
  ).join("");

  const index = `${previewHead(c.name, c.tagline, c.slug, env)}<body>${header("index.html")}<main><section class="hero hero-trade"><div class="container hero-grid"><div class="hero-copy"><p class="hero-badge">24/7 Emergency Service Available</p><p class="eyebrow">Plumbing Services</p><h1>${previewEsc(c.name)}</h1><p class="lead">${previewEsc(c.tagline)}</p><ul class="trust-badges"><li>Licensed & Insured</li><li>Free Estimates</li><li>Same-Day Service</li></ul><div class="hero-actions"><a href="contact.html" class="btn">Get a Free Estimate</a>${tel}</div></div><div class="hero-image"><img src="https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=1200&q=80" alt=""></div></div></section><section class="section"><div class="container"><div class="section-heading"><p class="eyebrow-dark">What we do</p><h2>Professional plumbing services</h2><p class="section-intro">Serving ${previewEsc(c.city)} and surrounding cities.</p></div><div class="service-grid">${servicesHtml}</div></div></section></main>${previewFooter(c.name, c.slug)}`;

  const services = `${previewHead(c.name, "Plumbing services", c.slug, env)}<body>${header("services.html")}<main><section class="page-hero"><div class="container"><p class="eyebrow-dark">Services</p><h1>How we help ${previewEsc(c.city)} homeowners</h1></div></section><section class="section"><div class="container service-grid service-grid-page">${PLUMBER_SERVICES.map((s) => `<article class="service-tile service-tile-large"><img src="${s.image}" class="service-tile-image" alt=""><div class="service-tile-body"><h2>${previewEsc(s.title)}</h2><p>${previewEsc(s.description)}</p></div></article>`).join("")}</div></section></main>${previewFooter(c.name, c.slug)}`;

  const about = `${previewHead(c.name, c.about, c.slug, env)}<body>${header("about.html")}<main><section class="page-hero"><div class="container"><h1>About ${previewEsc(c.name)}</h1><p class="lead">${previewEsc(c.about)}</p></div></section></main>${previewFooter(c.name, c.slug)}`;

  const contact = `${previewHead(c.name, "Contact us", c.slug, env)}<body>${header("contact.html")}<main><section class="page-hero"><div class="container"><h1>Contact ${previewEsc(c.name)}</h1></div></section><section class="section"><div class="container contact-grid"><div class="contact-card"><h2>Phone</h2><p>${c.phone ? `<a href="tel:${c.phoneRaw}">${previewEsc(c.phone)}</a>` : "Call for a free estimate"}</p></div><div class="contact-card"><h2>Service area</h2><p>${previewEsc(c.address)}</p></div></div></section></main>${previewFooter(c.name, c.slug)}`;

  const blog = `${previewHead(c.name, "Plumbing tips", c.slug, env)}<body>${header("blog.html")}<main><section class="page-hero"><div class="container"><h1>Tips &amp; Guides</h1></div></section><section class="section"><div class="container blog-grid">${blogHtml}</div></section></main>${previewFooter(c.name, c.slug)}`;

  return {
    context: c,
    files: [
      { path: "index.html", content: index, content_type: "text/html; charset=utf-8" },
      { path: "services.html", content: services, content_type: "text/html; charset=utf-8" },
      { path: "about.html", content: about, content_type: "text/html; charset=utf-8" },
      { path: "contact.html", content: contact, content_type: "text/html; charset=utf-8" },
      { path: "blog.html", content: blog, content_type: "text/html; charset=utf-8" },
    ],
  };
}

async function ensurePreviewPublishSchema(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS preview_site_files (
      slug TEXT NOT NULL,
      file_path TEXT NOT NULL,
      content TEXT NOT NULL,
      content_type TEXT DEFAULT 'text/html; charset=utf-8',
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (slug, file_path)
    )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS preview_sites (
      slug TEXT PRIMARY KEY,
      company_name TEXT,
      city TEXT,
      phone TEXT,
      address TEXT,
      preview_url TEXT,
      connect_url TEXT,
      published_at TEXT,
      call_id TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS plumber_publish_queue (
      call_id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      company_name TEXT,
      phone TEXT,
      city TEXT,
      address TEXT,
      status TEXT DEFAULT 'pending',
      preview_url TEXT,
      publish_key TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      published_at TEXT
    )`
  ).run();
  try {
    await env.DB.prepare("ALTER TABLE plumber_publish_queue ADD COLUMN publish_key TEXT").run();
  } catch (e) {
    /* column exists */
  }
}

async function publishPreviewSite(env, lead, callId) {
  await ensurePreviewPublishSchema(env);
  const { context, files } = generatePreviewFiles(lead, env);
  for (const f of files) {
    await env.DB.prepare(
      `INSERT INTO preview_site_files (slug, file_path, content, content_type, updated_at)
       VALUES (?1, ?2, ?3, ?4, datetime('now'))
       ON CONFLICT(slug, file_path) DO UPDATE SET content = excluded.content, content_type = excluded.content_type, updated_at = datetime('now')`
    )
      .bind(context.slug, f.path, f.content, f.content_type)
      .run();
  }
  const previewUrl = `${PREVIEW_PUBLIC_BASE}/${encodeURIComponent(context.slug)}/index.html`;
  const connectUrl = `${FUNNEL_CONNECT_BASE}?biz=${encodeURIComponent(context.slug)}`;
  await env.DB.prepare(
    `INSERT INTO preview_sites (slug, company_name, city, phone, address, preview_url, connect_url, published_at, call_id, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'), ?8, datetime('now'))
     ON CONFLICT(slug) DO UPDATE SET company_name=excluded.company_name, city=excluded.city, phone=excluded.phone,
       address=excluded.address, preview_url=excluded.preview_url, connect_url=excluded.connect_url,
       published_at=datetime('now'), call_id=excluded.call_id, updated_at=datetime('now')`
  )
    .bind(context.slug, context.name, context.city, context.phone, context.address, previewUrl, connectUrl, callId || null)
    .run();
  if (callId) {
    await env.DB.prepare(
      `UPDATE plumber_publish_queue SET status = 'published', preview_url = ?2, published_at = datetime('now') WHERE call_id = ?1`
    )
      .bind(callId, previewUrl)
      .run();
  }
  return { slug: context.slug, preview_url: previewUrl, connect_url: connectUrl, company_name: context.name };
}

async function queuePlumberPublish(env, row) {
  await ensurePreviewPublishSchema(env);
  const slug = String(row.slug || slugifyPreviewName(row.company_name, row.city));
  const publishKey = crypto.randomUUID().replace(/-/g, "");
  await env.DB.prepare(
    `INSERT INTO plumber_publish_queue (call_id, slug, company_name, phone, city, address, status, publish_key)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', ?7)
     ON CONFLICT(call_id) DO UPDATE SET slug=excluded.slug, company_name=excluded.company_name, phone=excluded.phone,
       city=excluded.city, address=excluded.address, status='pending', preview_url=NULL, published_at=NULL, publish_key=excluded.publish_key`
  )
    .bind(
      String(row.call_id),
      slug,
      String(row.company_name || ""),
      String(row.phone || ""),
      String(row.city || ""),
      String(row.address || ""),
      publishKey
    )
    .run();
  return {
    call_id: row.call_id,
    slug,
    publish_page_url: dashboardPublishUrl(env, row.call_id, publishKey),
  };
}

async function servePreviewFile(env, slug, filePath) {
  await ensurePreviewPublishSchema(env);
  const safePath = filePath || "index.html";
  if (safePath.includes("..")) return null;
  const row = await env.DB.prepare(
    "SELECT content, content_type FROM preview_site_files WHERE slug = ?1 AND file_path = ?2"
  )
    .bind(slug, safePath)
    .first();
  if (!row) return null;
  return new Response(row.content, {
    headers: {
      "Content-Type": row.content_type || "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}

async function handleFunnelConnect(request, env) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("biz") || "";
  await ensurePreviewPublishSchema(env);
  const site = slug
    ? await env.DB.prepare("SELECT * FROM preview_sites WHERE slug = ?1").bind(slug).first()
    : null;
  const previewUrl = site?.preview_url || `${PREVIEW_PUBLIC_BASE}/${encodeURIComponent(slug)}/index.html`;
  const name = site?.company_name || slug.replace(/-/g, " ");
  const pages = previewPagesOrigin(env);
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${previewEsc(name)} Preview | Solena Digital</title><link rel="stylesheet" href="${pages}/landing/assets/landing.css?v=18"></head><body class="page-connect"><main class="wrap"><div class="landing-shell"><section class="card card-hero"><h1>We built a free preview website for ${previewEsc(name)}</h1><p class="lead">Take a look, then register online to go live — we handle the rest.</p><div class="actions actions-connect"><a class="btn btn-outline" href="${previewEsc(previewUrl)}">View website preview</a><a class="btn" href="${pages}/landing/pricing.html?biz=${encodeURIComponent(slug)}">See pricing</a></div></section></div></main></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

async function handlePlumberPublishPreview(request, env) {
  await ensurePreviewPublishSchema(env);
  const body = await request.json().catch(() => ({}));
  if (!(await authorizePlumberPublishRequest(request, env, body))) return json({ error: "Unauthorized" }, 401);
  const callId = String(body.call_id || "").trim();
  let lead = body.lead || body;
  if (callId) {
    const q = await env.DB.prepare("SELECT * FROM plumber_publish_queue WHERE call_id = ?1").bind(callId).first();
    if (q) {
      lead = {
        slug: q.slug,
        company_name: q.company_name,
        phone: q.phone,
        city: q.city,
        address: q.address,
      };
    }
  }
  if (!lead.company_name && !lead.name) return json({ error: "company_name required" }, 400);
  const result = await publishPreviewSite(env, lead, callId || null);
  return json({ ok: true, ...result });
}

async function handlePlumberPublishQueueGet(request, env) {
  await ensurePreviewPublishSchema(env);
  const url = new URL(request.url);
  const callId = url.searchParams.get("call");
  if (callId) {
    if (!(await authorizePlumberPublishRequest(request, env, { call_id: callId, k: url.searchParams.get("k") }))) {
      return json({ error: "Unauthorized" }, 401);
    }
    let row = await env.DB.prepare("SELECT * FROM plumber_publish_queue WHERE call_id = ?1").bind(callId).first();
    const callRow = await env.DB.prepare("SELECT * FROM plumber_outreach_calls WHERE call_id = ?1").bind(callId).first();
    if (!row && callRow && typeof queuePlumberPublish === "function") {
      await queuePlumberPublish(env, {
        call_id: callId,
        slug: slugifyPreviewName(callRow.company_name, callRow.city),
        company_name: callRow.company_name,
        phone: callRow.phone,
        city: callRow.city,
        address: "",
      });
      row = await env.DB.prepare("SELECT * FROM plumber_publish_queue WHERE call_id = ?1").bind(callId).first();
    }
    if (!row) return json({ error: "Not found" }, 404);
    const site = await env.DB.prepare("SELECT preview_url, connect_url, published_at FROM preview_sites WHERE slug = ?1")
      .bind(row.slug)
      .first();
    const website = String(callRow?.website || "").trim();
    return json({
      ok: true,
      queue: row,
      site: site || null,
      prospect: {
        call_id: callId,
        company_name: row.company_name || callRow?.company_name,
        city: row.city || callRow?.city,
        phone: row.phone || callRow?.phone,
        address: row.address || "",
        website: website,
        has_website: !!(callRow?.has_website || website),
        website_label: website || "None listed on Google",
        dashboard_url: dashboardPublishUrl(env, callId, row.publish_key),
        call_status: callRow?.status || null,
      },
    });
  }
  const rows = await env.DB.prepare(
    "SELECT call_id, slug, company_name, phone, city, address, status, preview_url, created_at, published_at FROM plumber_publish_queue ORDER BY created_at DESC LIMIT 20"
  ).all();
  return json({ ok: true, items: rows.results || [] });
}

async function handlePreviewAssetRequest(request, env, slug, restPath) {
  if (!slug) return json({ error: "Not found" }, 404);
  const filePath = restPath || "index.html";
  const res = await servePreviewFile(env, slug, filePath);
  if (res) return res;
  if (filePath === "index.html" || filePath === "") {
    return json({ error: "Preview not published yet", slug }, 404);
  }
  return json({ error: "Not found" }, 404);
}
