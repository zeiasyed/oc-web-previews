/**
 * Solena Digital — QR scan tracker (Cloudflare Worker + D1)
 * Printed QR codes stay unchanged; connect.html beacons here on load.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

const TEST_UA_PATTERNS = [
  /powershell/i,
  /\bcurl\//i,
  /\bwget\b/i,
  /python-requests/i,
  /go-http-client/i,
  /postman/i,
  /insomnia/i,
  /httpie/i,
  /\baxios\//i,
  /node-fetch/i,
  /java\//i,
  /okhttp/i,
  /scrapy/i,
];

const REAL_SCAN_SQL_FILTER = `(
  user_agent IS NULL OR (
    user_agent NOT LIKE '%PowerShell%' AND
    user_agent NOT LIKE '%curl/%' AND
    user_agent NOT LIKE '%wget%' AND
    user_agent NOT LIKE '%python-requests%' AND
    user_agent NOT LIKE '%Go-http-client%' AND
    user_agent NOT LIKE '%Postman%' AND
    user_agent NOT LIKE '%Insomnia%' AND
    user_agent NOT LIKE '%HTTPie%' AND
    user_agent NOT LIKE '%axios/%' AND
    user_agent NOT LIKE '%node-fetch%' AND
    user_agent NOT LIKE '%okhttp%' AND
    user_agent NOT LIKE '%Scrapy%'
  )
)`;

function withCors(headers = {}) {
  return { ...CORS, ...headers };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: withCors({
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    }),
  });
}

function unauthorized() {
  return json({ error: "Unauthorized" }, 401);
}

const OUTREACH_API_BASE = "https://api.inertia-intel.com";
const OUTREACH_PROXY_PATHS = {
  "/api/outreach/playbook": "/voice/plumber-outreach/playbook",
  "/api/outreach/publish-queue": "/voice/plumber-outreach/publish-queue",
  "/api/outreach/publish-preview": "/voice/plumber-outreach/publish-preview",
  "/api/outreach/send-preview-sms": "/voice/plumber-outreach/send-preview-sms",
  "/api/outreach/tracking": "/voice/plumber-outreach/tracking",
  "/api/outreach/preflight": "/voice/plumber-outreach/preflight",
  "/api/outreach/recording": "/voice/plumber-outreach/recording",
};

async function proxyOutreachRequest(request, env, localPath, bodyText, publishKey, forwardMethod) {
  const outreachToken = String(env.OUTREACH_API_TOKEN || "").trim();
  if (!outreachToken) return json({ error: "Outreach proxy not configured" }, 503);

  const remotePath = OUTREACH_PROXY_PATHS[localPath];
  if (!remotePath) return json({ error: "Not found" }, 404);

  const url = new URL(request.url);
  const forwardUrl = OUTREACH_API_BASE + remotePath + url.search;
  const headers = {
    "Content-Type": request.headers.get("Content-Type") || "application/json",
    Authorization: "Bearer " + outreachToken,
  };

  const init = { method: forwardMethod || request.method, headers };
  if (bodyText != null) init.body = bodyText;

  const res = await fetch(forwardUrl, init);
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: withCors({
      "Content-Type": res.headers.get("Content-Type") || "application/json",
      "Cache-Control": "no-store",
    }),
  });
}

async function handleOutreachProxy(request, env, localPath) {
  const url = new URL(request.url);
  let bodyText = null;
  if (request.method !== "GET" && request.method !== "HEAD") {
    bodyText = await request.text();
  }

  let publishKey = url.searchParams.get("k") || "";
  let dryRun = false;
  if (bodyText) {
    try {
      const parsed = JSON.parse(bodyText);
      publishKey = publishKey || parsed.k || parsed.publish_key || "";
      dryRun = !!(parsed.demo || parsed.dry_run || parsed.lead?.demo || parsed.lead?.dry_run);
    } catch (e) {
      publishKey = publishKey || "";
    }
  }

  const authed = checkAuth(request, env);
  const publishKeyAccess =
    !!publishKey &&
    (localPath === "/api/outreach/publish-preview" ||
      localPath === "/api/outreach/send-preview-sms" ||
      (localPath === "/api/outreach/publish-queue" && url.searchParams.get("call")));
  const dryRunAccess = dryRun && localPath === "/api/outreach/publish-preview";

  if (!authed && !publishKeyAccess && !dryRunAccess) return unauthorized();

  let forwardMethod = request.method;
  if (localPath === "/api/outreach/playbook" && forwardMethod === "POST") {
    forwardMethod = "PATCH";
  }

  return proxyOutreachRequest(request, env, localPath, bodyText, publishKey, forwardMethod);
}

function checkAuth(request, env) {
  const expected = env.DASHBOARD_PASSWORD;
  if (!expected) return true;
  const header = request.headers.get("Authorization") || "";
  if (header.startsWith("Bearer ")) {
    return header.slice(7) === expected;
  }
  const key = new URL(request.url).searchParams.get("key");
  return key === expected;
}

function normalizeSlug(raw) {
  const slug = String(raw || "")
    .trim()
    .toLowerCase()
    .slice(0, 120);
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) return null;
  return slug;
}

function isTestScan(request) {
  const userAgent = request.headers.get("User-Agent") || "";
  if (!userAgent.trim()) return true;
  if (!TEST_UA_PATTERNS.some((pattern) => pattern.test(userAgent))) {
    return false;
  }
  return true;
}

function geoFromRequest(request) {
  const cf = request.cf || {};
  const trim = (value, max) => {
    const text = String(value || "").trim();
    return text ? text.slice(0, max) : null;
  };
  return {
    country: trim(cf.country, 8),
    region_code: trim(cf.regionCode, 16),
    region: trim(cf.region, 128),
    city: trim(cf.city, 128),
  };
}

function formatLocation(row) {
  if (!row) return null;
  const parts = [];
  if (row.city) parts.push(row.city);
  if (row.region_code) parts.push(row.region_code);
  else if (row.region) parts.push(row.region);
  if (row.country) parts.push(row.country);
  return parts.length ? parts.join(", ") : null;
}

async function recordScan(env, slug, request) {
  const scannedAt = new Date().toISOString();
  const userAgent = (request.headers.get("User-Agent") || "").slice(0, 512);
  const referer = (request.headers.get("Referer") || "").slice(0, 512);
  const geo = geoFromRequest(request);
  await env.DB.prepare(
    `INSERT INTO scans (
      slug, scanned_at, user_agent, referer,
      country, region_code, region, city
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
  )
    .bind(
      slug,
      scannedAt,
      userAgent,
      referer,
      geo.country,
      geo.region_code,
      geo.region,
      geo.city
    )
    .run();
  return { scannedAt, geo };
}

async function getSummary(env) {
  const totals = await env.DB.prepare(
    `SELECT slug, COUNT(*) AS count, MAX(scanned_at) AS last_scan
     FROM scans
     WHERE ${REAL_SCAN_SQL_FILTER}
     GROUP BY slug
     ORDER BY count DESC, slug ASC`
  ).all();

  const latestBySlug = await env.DB.prepare(
    `WITH ranked AS (
       SELECT slug, city, region_code, region, country, scanned_at,
         ROW_NUMBER() OVER (PARTITION BY slug ORDER BY scanned_at DESC) AS rn
       FROM scans
       WHERE ${REAL_SCAN_SQL_FILTER}
     )
     SELECT slug, city, region_code, region, country, scanned_at
     FROM ranked
     WHERE rn = 1`
  ).all();

  const latestMap = new Map(
    (latestBySlug.results || []).map((row) => [row.slug, row])
  );

  const bySlugRows = (totals.results || []).map((row) => {
    const latest = latestMap.get(row.slug);
    return {
      ...row,
      country: latest?.country || null,
      region_code: latest?.region_code || null,
      region: latest?.region || null,
      city: latest?.city || null,
      last_location: latest ? formatLocation(latest) : null,
    };
  });

  const recent = await env.DB.prepare(
    `SELECT slug, scanned_at, country, region_code, region, city, user_agent
     FROM scans
     WHERE ${REAL_SCAN_SQL_FILTER}
     ORDER BY scanned_at DESC
     LIMIT 50`
  ).all();

  const byState = await env.DB.prepare(
    `SELECT
       COALESCE(NULLIF(region_code, ''), NULLIF(region, ''), 'Unknown') AS state,
       country,
       COUNT(*) AS count,
       MAX(scanned_at) AS last_scan
     FROM scans
     WHERE ${REAL_SCAN_SQL_FILTER}
       AND (country IS NOT NULL OR region_code IS NOT NULL OR region IS NOT NULL OR city IS NOT NULL)
     GROUP BY state, country
     ORDER BY count DESC, state ASC`
  ).all();

  const totalRow = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM scans WHERE ${REAL_SCAN_SQL_FILTER}`
  ).first();

  const recentRows = (recent.results || []).map((row) => ({
    slug: row.slug,
    scanned_at: row.scanned_at,
    country: row.country,
    region_code: row.region_code,
    region: row.region,
    city: row.city,
    location: formatLocation(row),
    device: deviceLabel(row.user_agent),
  }));

  return {
    total: totalRow?.total || 0,
    by_slug: bySlugRows,
    by_state: byState.results || [],
    recent: recentRows,
    funnel: await getFunnelMetrics(env),
  };
}

const FUNNEL_STEP_ORDER = ["connect", "pricing", "register", "payment"];

function normalizeEventType(raw) {
  const type = String(raw || "").trim().toLowerCase();
  if (type === "page_view" || type === "click") return type;
  return null;
}

function normalizePage(raw) {
  const page = String(raw || "")
    .trim()
    .toLowerCase()
    .slice(0, 32);
  if (!page || !/^[a-z0-9_-]+$/.test(page)) return null;
  return page;
}

function normalizeElementId(raw) {
  if (raw == null || raw === "") return null;
  const id = String(raw).trim().slice(0, 120);
  return id || null;
}

async function recordFunnelEvent(env, slug, body, request) {
  const eventType = normalizeEventType(body.event_type);
  const page = normalizePage(body.page);
  if (!eventType || !page) return null;
  const eventAt = new Date().toISOString();
  const userAgent = (request.headers.get("User-Agent") || "").slice(0, 512);
  const geo = geoFromRequest(request);
  const elementId = normalizeElementId(body.element_id);
  const elementLabel = body.element_label
    ? String(body.element_label).trim().slice(0, 200)
    : null;
  await env.DB.prepare(
    `INSERT INTO funnel_events (
      slug, event_type, page, element_id, element_label, event_at,
      user_agent, country, region_code, city
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
  )
    .bind(
      slug,
      eventType,
      page,
      elementId,
      elementLabel,
      eventAt,
      userAgent,
      geo.country,
      geo.region_code,
      geo.city
    )
    .run();
  return { eventAt, geo, eventType, page };
}

async function getFunnelMetrics(env) {
  const empty = {
    total_clicks: 0,
    total_page_views: 0,
    funnel_steps: FUNNEL_STEP_ORDER.map((page) => ({
      page,
      views: 0,
      visitors: 0,
      drop_from_prev: null,
    })),
    top_clicks: [],
    recent: [],
  };
  try {
    const pageViews = await env.DB.prepare(
      `SELECT page, COUNT(*) AS views, COUNT(DISTINCT slug) AS visitors
       FROM funnel_events
       WHERE event_type = 'page_view' AND ${REAL_SCAN_SQL_FILTER}
       GROUP BY page`
    ).all();

    const topClicks = await env.DB.prepare(
      `SELECT element_id, element_label, page, COUNT(*) AS clicks, MAX(event_at) AS last_click
       FROM funnel_events
       WHERE event_type = 'click' AND ${REAL_SCAN_SQL_FILTER}
       GROUP BY element_id, element_label, page
       ORDER BY clicks DESC, last_click DESC
       LIMIT 40`
    ).all();

    const recent = await env.DB.prepare(
      `SELECT slug, event_type, page, element_id, element_label, event_at,
              country, region_code, city, user_agent
       FROM funnel_events
       WHERE ${REAL_SCAN_SQL_FILTER}
       ORDER BY event_at DESC
       LIMIT 50`
    ).all();

    const totals = await env.DB.prepare(
      `SELECT
         SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END) AS clicks,
         SUM(CASE WHEN event_type = 'page_view' THEN 1 ELSE 0 END) AS page_views
       FROM funnel_events
       WHERE ${REAL_SCAN_SQL_FILTER}`
    ).first();

    const pvMap = new Map(
      (pageViews.results || []).map((row) => [row.page, row])
    );
    let prevViews = null;
    const funnelSteps = FUNNEL_STEP_ORDER.map((page) => {
      const row = pvMap.get(page) || { views: 0, visitors: 0 };
      const views = row.views || 0;
      const step = {
        page,
        views,
        visitors: row.visitors || 0,
        drop_from_prev:
          prevViews != null && prevViews > 0
            ? Math.round((1 - views / prevViews) * 100)
            : null,
      };
      prevViews = views;
      return step;
    });

    return {
      total_clicks: totals?.clicks || 0,
      total_page_views: totals?.page_views || 0,
      funnel_steps: funnelSteps,
      top_clicks: topClicks.results || [],
      recent: (recent.results || []).map((row) => ({
        slug: row.slug,
        event_type: row.event_type,
        page: row.page,
        element_id: row.element_id,
        element_label: row.element_label,
        event_at: row.event_at,
        location: formatLocation(row),
        device: deviceLabel(row.user_agent),
      })),
    };
  } catch {
    return empty;
  }
}

function deviceLabel(userAgent) {
  const ua = String(userAgent || "");
  if (!ua) return "Unknown";
  if (/iphone|ipad|ipod/i.test(ua)) return "iPhone / iPad";
  if (/android/i.test(ua)) return "Android";
  if (/mobile/i.test(ua)) return "Mobile";
  if (/windows|macintosh|linux/i.test(ua)) return "Desktop";
  return "Browser";
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: withCors() });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/scan" && request.method === "POST") {
      let body = {};
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }
      const slug = normalizeSlug(body.slug);
      if (!slug) return json({ error: "Invalid slug" }, 400);
      if (isTestScan(request)) {
        return json({ ok: true, recorded: false, reason: "test_scan_ignored" });
      }
      try {
        const { scannedAt, geo } = await recordScan(env, slug, request);
        return json({
          ok: true,
          recorded: true,
          slug,
          scanned_at: scannedAt,
          location: formatLocation(geo),
        });
      } catch (err) {
        return json({ error: String(err?.message || err) }, 500);
      }
    }

    if (path === "/event" && request.method === "POST") {
      let body = {};
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }
      const slug = normalizeSlug(body.slug);
      if (!slug) return json({ error: "Invalid slug" }, 400);
      if (isTestScan(request)) {
        return json({ ok: true, recorded: false, reason: "test_scan_ignored" });
      }
      try {
        const result = await recordFunnelEvent(env, slug, body, request);
        if (!result) return json({ error: "Invalid event" }, 400);
        return json({
          ok: true,
          recorded: true,
          slug,
          event_type: result.eventType,
          page: result.page,
          event_at: result.eventAt,
        });
      } catch (err) {
        return json({ error: String(err?.message || err) }, 500);
      }
    }

    if (path === "/api/summary" && request.method === "GET") {
      if (!checkAuth(request, env)) return unauthorized();
      try {
        return json(await getSummary(env));
      } catch (err) {
        return json({ error: String(err?.message || err) }, 500);
      }
    }

    if (OUTREACH_PROXY_PATHS[path]) {
      try {
        return await handleOutreachProxy(request, env, path);
      } catch (err) {
        return json({ error: String(err?.message || err) }, 500);
      }
    }

    if (path === "/health" && request.method === "GET") {
      return json({ ok: true, service: "solena-qr-scan" });
    }

    return json({ error: "Not found" }, 404);
  },
};
