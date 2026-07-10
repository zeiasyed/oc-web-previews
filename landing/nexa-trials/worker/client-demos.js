/** Client demo video portal — per-client logins, 2-week expiry, R2 streaming. */

const DEMO_SESSION_COOKIE = "nexa_demo_session";
const DEMO_REALM = "Nexa Trials Client Demos";
const PBKDF2_ITERATIONS = 100_000;

function isDemoPath(pathname) {
  const path = pathname.split("?")[0].replace(/\/$/, "") || "/";
  return path === "/demos" || path.startsWith("/demos/") || path.startsWith("/api/demos/");
}

function demoJson(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
  });
}

function demoText(text, status = 200, extra = {}) {
  return new Response(text, {
    status,
    headers: { "Content-Type": "text/plain; charset=UTF-8", "Cache-Control": "no-store", ...extra },
  });
}

function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  return bytesToHex(bits);
}

async function signSession(payload, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return bytesToHex(sig);
}

function parseCookies(request) {
  const raw = request.headers.get("Cookie") || "";
  const out = {};
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function sessionSecret(env) {
  return env.CLIENT_DEMO_SESSION_SECRET || env.NEXADIRECT_LAB_PASSWORD || "nexa-demo-fallback-secret";
}

async function createSessionToken(username, secret) {
  const issued = Date.now();
  const payload = `${username}|${issued}`;
  const sig = await signSession(payload, secret);
  return `${btoa(payload)}.${sig}`;
}

async function verifySessionToken(token, secret) {
  if (!token || !token.includes(".")) return null;
  const [payloadB64, sig] = token.split(".", 2);
  let payload = "";
  try {
    payload = atob(payloadB64);
  } catch {
    return null;
  }
  const expected = await signSession(payload, secret);
  if (expected !== sig) return null;
  const [username] = payload.split("|");
  return username || null;
}

function sessionCookie(token, maxAgeSec = 60 * 60 * 12) {
  return `${DEMO_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

function clearSessionCookie() {
  return `${DEMO_SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

async function getClientRecord(env, username) {
  if (!env.CLIENT_DEMOS_KV) return null;
  const raw = await env.CLIENT_DEMOS_KV.get(`client:${username.toLowerCase()}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isClientExpired(client) {
  if (!client?.expiresAt) return true;
  return Date.parse(client.expiresAt) <= Date.now();
}

async function getSessionUsername(request, env) {
  const cookies = parseCookies(request);
  const token = cookies[DEMO_SESSION_COOKIE];
  if (!token) return null;
  return verifySessionToken(token, sessionSecret(env));
}

async function requireClientSession(request, env) {
  const username = await getSessionUsername(request, env);
  if (!username) {
    return { error: demoJson({ ok: false, error: "login_required" }, 401) };
  }
  const client = await getClientRecord(env, username);
  if (!client) {
    return { error: demoJson({ ok: false, error: "login_required" }, 401) };
  }
  if (isClientExpired(client)) {
    return {
      error: demoJson(
        {
          ok: false,
          error: "expired",
          message:
            "Your login has expired. Please contact info@nexa-trials.com to request renewed access.",
        },
        403
      ),
    };
  }
  return { username, client };
}

async function getVideoMeta(env, videoId) {
  const raw = await env.CLIENT_DEMOS_KV.get(`video:${videoId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function handleDemoLogin(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return demoJson({ ok: false, error: "invalid_json" }, 400);
  }
  const username = String(body.username || "")
    .trim()
    .toLowerCase()
    .slice(0, 64);
  const password = String(body.password || "");
  if (!username || !password) {
    return demoJson({ ok: false, error: "missing_credentials" }, 400);
  }

  const client = await getClientRecord(env, username);
  if (!client) {
    return demoJson({ ok: false, error: "invalid_credentials" }, 401);
  }
  if (isClientExpired(client)) {
    return demoJson(
      {
        ok: false,
        error: "expired",
        message:
          "Your login has expired. Please contact info@nexa-trials.com to request renewed access.",
      },
      403
    );
  }

  const hash = await hashPassword(password, client.salt || "");
  if (hash !== client.passwordHash) {
    return demoJson({ ok: false, error: "invalid_credentials" }, 401);
  }

  const token = await createSessionToken(username, sessionSecret(env));
  return demoJson(
    {
      ok: true,
      username,
      label: client.label || username,
      expiresAt: client.expiresAt,
    },
    200,
    { "Set-Cookie": sessionCookie(token) }
  );
}

async function handleDemoLogout() {
  return demoJson({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
}

async function handleDemoMe(request, env) {
  const auth = await requireClientSession(request, env);
  if (auth.error) return auth.error;
  return demoJson({
    ok: true,
    username: auth.username,
    label: auth.client.label || auth.username,
    expiresAt: auth.client.expiresAt,
  });
}

async function handleDemoVideos(request, env) {
  const auth = await requireClientSession(request, env);
  if (auth.error) return auth.error;

  const allowed = new Set(auth.client.videoIds || []);
  const videos = [];
  for (const id of allowed) {
    const meta = await getVideoMeta(env, id);
    if (meta) {
      videos.push({
        id: meta.id,
        title: meta.title,
        description: meta.description || "",
      });
    }
  }
  videos.sort((a, b) => a.title.localeCompare(b.title));
  return demoJson({ ok: true, videos, expiresAt: auth.client.expiresAt });
}

async function handleDemoStream(request, env, videoId) {
  const auth = await requireClientSession(request, env);
  if (auth.error) return auth.error;

  if (!(auth.client.videoIds || []).includes(videoId)) {
    return demoText("Not found", 404);
  }
  const meta = await getVideoMeta(env, videoId);
  if (!meta) {
    return demoText("Not found", 404);
  }

  const originBase = (env.VIDEO_ORIGIN_BASE || "").replace(/\/$/, "");
  const originSecret = env.VIDEO_ORIGIN_SECRET || "";
  const objectKey = meta.r2Key || meta.objectKey || `${videoId}.mp4`;

  if (env.DEMO_VIDEOS) {
    const object = await env.DEMO_VIDEOS.get(objectKey);
    if (object) {
      return streamR2Object(object, request, meta);
    }
  }

  if (!originBase) {
    return demoText("Video unavailable", 503);
  }

  const upstreamUrl = `${originBase}/${encodeURIComponent(objectKey)}?key=${encodeURIComponent(originSecret)}`;
  const headers = new Headers();
  if (originSecret) {
    headers.set("X-Video-Origin-Secret", originSecret);
  }
  const range = request.headers.get("Range");
  if (range) headers.set("Range", range);

  const upstream = await fetch(upstreamUrl, { headers });
  if (!upstream.ok && upstream.status !== 206) {
    return demoText("Video unavailable", upstream.status === 404 ? 404 : 502);
  }

  const outHeaders = new Headers();
  const pass = ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"];
  for (const key of pass) {
    const val = upstream.headers.get(key);
    if (val) outHeaders.set(key, val);
  }
  outHeaders.set("Cache-Control", "private, no-store");
  if (!outHeaders.has("Content-Type")) {
    outHeaders.set("Content-Type", meta.contentType || "video/mp4");
  }
  return new Response(upstream.body, { status: upstream.status, headers: outHeaders });
}

async function streamR2Object(object, request, meta) {
  const range = request.headers.get("Range");
  const size = object.size;
  const contentType = meta.contentType || object.httpMetadata?.contentType || "video/mp4";

  if (range && range.startsWith("bytes=")) {
    const [startStr, endStr] = range.replace("bytes=", "").split("-");
    const start = Number.parseInt(startStr, 10);
    const end = endStr ? Number.parseInt(endStr, 10) : size - 1;
    if (Number.isNaN(start) || start >= size) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }
    const safeEnd = Math.min(end, size - 1);
    const slice = await object.slice(start, safeEnd + 1);
    return new Response(slice.body, {
      status: 206,
      headers: {
        "Content-Type": contentType,
        "Content-Range": `bytes ${start}-${safeEnd}/${size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(safeEnd - start + 1),
        "Cache-Control": "private, no-store",
      },
    });
  }

  return new Response(object.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
    },
  });
}

async function handleClientDemosRequest(request, env, url) {
  const path = url.pathname;

  if (path === "/api/demos/login" && request.method === "POST") {
    return handleDemoLogin(request, env);
  }
  if (path === "/api/demos/logout" && request.method === "POST") {
    return handleDemoLogout();
  }
  if (path === "/api/demos/me" && request.method === "GET") {
    return handleDemoMe(request, env);
  }
  if (path === "/api/demos/videos" && request.method === "GET") {
    return handleDemoVideos(request, env);
  }
  const streamMatch = path.match(/^\/api\/demos\/stream\/([a-z0-9-]+)$/i);
  if (streamMatch && request.method === "GET") {
    return handleDemoStream(request, env, streamMatch[1]);
  }

  return null;
}
