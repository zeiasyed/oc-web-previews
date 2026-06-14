/**
 * Solena Digital — QR scan tracker (Cloudflare Worker + D1)
 * Printed QR codes stay unchanged; connect.html beacons here on load.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

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

async function recordScan(env, slug, request) {
  const scannedAt = new Date().toISOString();
  const userAgent = (request.headers.get("User-Agent") || "").slice(0, 512);
  const referer = (request.headers.get("Referer") || "").slice(0, 512);
  await env.DB.prepare(
    "INSERT INTO scans (slug, scanned_at, user_agent, referer) VALUES (?1, ?2, ?3, ?4)"
  )
    .bind(slug, scannedAt, userAgent, referer)
    .run();
  return scannedAt;
}

async function getSummary(env) {
  const totals = await env.DB.prepare(
    `SELECT slug, COUNT(*) AS count, MAX(scanned_at) AS last_scan
     FROM scans
     GROUP BY slug
     ORDER BY count DESC, slug ASC`
  ).all();

  const recent = await env.DB.prepare(
    `SELECT slug, scanned_at
     FROM scans
     ORDER BY scanned_at DESC
     LIMIT 50`
  ).all();

  const totalRow = await env.DB.prepare("SELECT COUNT(*) AS total FROM scans").first();

  return {
    total: totalRow?.total || 0,
    by_slug: totals.results || [],
    recent: recent.results || [],
  };
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
      try {
        const scannedAt = await recordScan(env, slug, request);
        return json({ ok: true, slug, scanned_at: scannedAt });
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

    if (path === "/health" && request.method === "GET") {
      return json({ ok: true, service: "solena-qr-scan" });
    }

    return json({ error: "Not found" }, 404);
  },
};
