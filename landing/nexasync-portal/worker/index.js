/**
 * Nexasync Portal — Cloudflare Worker API (no PHI in cloud)
 */

const SESSION_DAYS = 7;
const PBKDF2_ITERATIONS = 100000;

const GLOBAL_INSURANCE_SEED = [
  { id: "plan-hmo-bcbs", carrier: "Blue Cross Blue Shield", plan_name: "HMO Select", plan_type: "HMO", network_id: "bcbs-hmo" },
  { id: "plan-ppo-bcbs", carrier: "Blue Cross Blue Shield", plan_name: "PPO Classic", plan_type: "PPO", network_id: "bcbs-ppo" },
  { id: "plan-hmo-aetna", carrier: "Aetna", plan_name: "HMO Gold", plan_type: "HMO", network_id: "aetna-hmo" },
  { id: "plan-ppo-aetna", carrier: "Aetna", plan_name: "PPO Open", plan_type: "PPO", network_id: "aetna-ppo" },
  { id: "plan-medicare", carrier: "Medicare", plan_name: "Original Medicare", plan_type: "Medicare", network_id: "medicare" },
  { id: "plan-medicaid", carrier: "Medicaid", plan_name: "State Medicaid", plan_type: "Medicaid", network_id: "medicaid" },
  { id: "plan-epo-uhc", carrier: "UnitedHealthcare", plan_name: "EPO Core", plan_type: "EPO", network_id: "uhc-epo" },
  { id: "plan-ppo-cigna", carrier: "Cigna", plan_name: "Open Access Plus", plan_type: "PPO", network_id: "cigna-ppo" },
  { id: "plan-hmo-kaiser", carrier: "Kaiser Permanente", plan_name: "HMO Southern CA", plan_type: "HMO", network_id: "kaiser-hmo" },
];

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function uid(prefix = "") {
  const hex = crypto.randomUUID().replace(/-/g, "");
  return prefix ? `${prefix}_${hex.slice(0, 12)}` : hex;
}

function getCorsOrigins(env) {
  const raw = env.CORS_ORIGINS || "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function withCors(request, env, response) {
  const origin = request.headers.get("Origin") || "";
  const allowed = getCorsOrigins(env);
  const headers = new Headers(response.headers);
  if (allowed.includes(origin) || allowed.includes("*")) {
    headers.set("Access-Control-Allow-Origin", origin || allowed[0] || "*");
  }
  headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Max-Age", "86400");
  return new Response(response.body, { status: response.status, headers });
}

function b64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function fromB64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hashPassword(password, saltB64) {
  const enc = new TextEncoder();
  const salt = saltB64 ? fromB64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256
  );
  return { hash: b64(bits), salt: b64(salt) };
}

async function verifyPassword(password, hashB64, saltB64) {
  const { hash } = await hashPassword(password, saltB64);
  return hash === hashB64;
}

async function ensureSchema(env) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS agencies (id TEXT PRIMARY KEY, name TEXT NOT NULL, stripe_customer_id TEXT, subscription_status TEXT DEFAULT 'trialing', per_patient_rate_cents INTEGER DEFAULT 1000, active_patient_count INTEGER DEFAULT 0, voice_config TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, role TEXT DEFAULT 'admin', created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, agency_id TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS insurance_plans (id TEXT PRIMARY KEY, agency_id TEXT, carrier TEXT NOT NULL, plan_name TEXT NOT NULL, plan_type TEXT NOT NULL, network_id TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS providers (id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, name TEXT NOT NULL, specialty TEXT, provider_type TEXT DEFAULT 'doctor', phone TEXT, address TEXT, accepted_plan_ids TEXT DEFAULT '[]', in_network INTEGER DEFAULT 1, notes TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS appointments (id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, patient_local_ref TEXT NOT NULL, provider_id TEXT, appointment_type TEXT NOT NULL, scheduled_at TEXT NOT NULL, status TEXT DEFAULT 'draft', notes_redacted TEXT, care_group_id TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, agency_id TEXT NOT NULL, user_id TEXT, action TEXT NOT NULL, resource_type TEXT, resource_id TEXT, meta TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS billing_events (id INTEGER PRIMARY KEY AUTOINCREMENT, agency_id TEXT NOT NULL, patient_count_delta INTEGER NOT NULL, total_active INTEGER NOT NULL, created_at TEXT DEFAULT (datetime('now')))`,
  ];
  for (const stmt of statements) {
    await env.DB.prepare(stmt).run();
  }
  try {
    await env.DB.prepare("ALTER TABLE appointments ADD COLUMN care_group_id TEXT").run();
  } catch (e) { /* column exists */ }
  try {
    await env.DB.prepare("ALTER TABLE appointments ADD COLUMN prep_instructions TEXT").run();
  } catch (e) { /* column exists */ }
  await ensureVoiceCallSchema(env);
}

async function seedInsurancePlans(env) {
  const row = await env.DB.prepare("SELECT COUNT(*) AS c FROM insurance_plans WHERE agency_id IS NULL").first();
  if ((row?.c || 0) > 0) return;
  for (const plan of GLOBAL_INSURANCE_SEED) {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO insurance_plans (id, agency_id, carrier, plan_name, plan_type, network_id) VALUES (?1, NULL, ?2, ?3, ?4, ?5)"
    )
      .bind(plan.id, plan.carrier, plan.plan_name, plan.plan_type, plan.network_id)
      .run();
  }
}

async function auditLog(env, agencyId, userId, action, resourceType, resourceId, meta) {
  await env.DB.prepare(
    "INSERT INTO audit_logs (agency_id, user_id, action, resource_type, resource_id, meta) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
  )
    .bind(agencyId, userId || null, action, resourceType || null, resourceId || null, meta ? JSON.stringify(meta) : null)
    .run();
}

async function getSession(request, env) {
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7);
  const row = await env.DB.prepare(
    "SELECT s.token, s.user_id, s.agency_id, s.expires_at, u.email, u.role, a.name AS agency_name, a.subscription_status, a.per_patient_rate_cents, a.active_patient_count FROM sessions s JOIN users u ON u.id = s.user_id JOIN agencies a ON a.id = s.agency_id WHERE s.token = ?1"
  )
    .bind(token)
    .first();
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    await env.DB.prepare("DELETE FROM sessions WHERE token = ?1").bind(token).run();
    return null;
  }
  return { token, ...row };
}

async function handleRegister(request, env) {
  const body = await request.json();
  const agencyName = String(body.agencyName || "").trim().slice(0, 120);
  const email = String(body.email || "").trim().toLowerCase().slice(0, 120);
  const password = String(body.password || "");
  if (!agencyName || !email || password.length < 8) {
    return json({ error: "Agency name, email, and password (8+ chars) required" }, 400);
  }
  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?1").bind(email).first();
  if (existing) return json({ error: "Email already registered" }, 409);

  const agencyId = uid("ag");
  const userId = uid("usr");
  const { hash, salt } = await hashPassword(password, null);

  await env.DB.prepare(
    "INSERT INTO agencies (id, name) VALUES (?1, ?2)"
  ).bind(agencyId, agencyName).run();

  await env.DB.prepare(
    "INSERT INTO users (id, agency_id, email, password_hash, password_salt, role) VALUES (?1, ?2, ?3, ?4, ?5, 'admin')"
  ).bind(userId, agencyId, email, hash, salt).run();

  await seedInsurancePlans(env);
  await auditLog(env, agencyId, userId, "agency.registered", "agency", agencyId, null);

  const token = uid("tok");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  await env.DB.prepare(
    "INSERT INTO sessions (token, user_id, agency_id, expires_at) VALUES (?1, ?2, ?3, ?4)"
  ).bind(token, userId, agencyId, expires).run();

  return json({
    token,
    user: { id: userId, email, role: "admin" },
    agency: { id: agencyId, name: agencyName, subscription_status: "trialing", active_patient_count: 0 },
  });
}

async function handleLogin(request, env) {
  const body = await request.json();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const user = await env.DB.prepare(
    "SELECT u.*, a.name AS agency_name, a.subscription_status, a.per_patient_rate_cents, a.active_patient_count FROM users u JOIN agencies a ON a.id = u.agency_id WHERE u.email = ?1"
  ).bind(email).first();
  if (!user) return json({ error: "Invalid credentials" }, 401);
  const ok = await verifyPassword(password, user.password_hash, user.password_salt);
  if (!ok) return json({ error: "Invalid credentials" }, 401);

  const token = uid("tok");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  await env.DB.prepare(
    "INSERT INTO sessions (token, user_id, agency_id, expires_at) VALUES (?1, ?2, ?3, ?4)"
  ).bind(token, user.id, user.agency_id, expires).run();

  await auditLog(env, user.agency_id, user.id, "user.login", "user", user.id, null);

  return json({
    token,
    user: { id: user.id, email: user.email, role: user.role },
    agency: {
      id: user.agency_id,
      name: user.agency_name,
      subscription_status: user.subscription_status,
      per_patient_rate_cents: user.per_patient_rate_cents,
      active_patient_count: user.active_patient_count,
    },
  });
}

async function handleMe(session) {
  return json({
    user: { id: session.user_id, email: session.email, role: session.role },
    agency: {
      id: session.agency_id,
      name: session.agency_name,
      subscription_status: session.subscription_status,
      per_patient_rate_cents: session.per_patient_rate_cents,
      active_patient_count: session.active_patient_count,
    },
  });
}

async function handleInsurancePlans(env, session) {
  const { results } = await env.DB.prepare(
    "SELECT id, carrier, plan_name, plan_type, network_id FROM insurance_plans WHERE agency_id IS NULL OR agency_id = ?1 ORDER BY carrier, plan_name"
  ).bind(session.agency_id).all();
  return json({ plans: results || [] });
}

async function handleProviders(request, env, session) {
  if (request.method === "GET") {
    const url = new URL(request.url);
    const planId = url.searchParams.get("plan_id");
    const type = url.searchParams.get("type");
    let query = "SELECT * FROM providers WHERE agency_id = ?1";
    const binds = [session.agency_id];
    if (type) {
      query += " AND provider_type = ?2";
      binds.push(type);
    }
    query += " ORDER BY name";
    const { results } = await env.DB.prepare(query).bind(...binds).all();
    let providers = (results || []).map((p) => ({
      ...p,
      accepted_plan_ids: JSON.parse(p.accepted_plan_ids || "[]"),
      in_network: !!p.in_network,
    }));
    if (planId) {
      const plan = await env.DB.prepare("SELECT plan_type FROM insurance_plans WHERE id = ?1").bind(planId).first();
      if (plan?.plan_type === "HMO") {
        providers = providers.filter((p) => p.accepted_plan_ids.includes(planId) && p.in_network);
      } else if (plan?.plan_type === "PPO") {
        providers = providers.map((p) => ({
          ...p,
          out_of_network: !p.accepted_plan_ids.includes(planId) || !p.in_network,
        }));
      }
    }
    return json({ providers });
  }

  if (request.method === "POST") {
    const body = await request.json();
    const id = uid("prov");
    await env.DB.prepare(
      "INSERT INTO providers (id, agency_id, name, specialty, provider_type, phone, address, accepted_plan_ids, in_network, notes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"
    )
      .bind(
        id,
        session.agency_id,
        String(body.name || "").slice(0, 120),
        String(body.specialty || "").slice(0, 80) || null,
        String(body.provider_type || "doctor").slice(0, 40),
        String(body.phone || "").slice(0, 40) || null,
        String(body.address || "").slice(0, 200) || null,
        JSON.stringify(body.accepted_plan_ids || []),
        body.in_network === false ? 0 : 1,
        String(body.notes || "").slice(0, 500) || null
      )
      .run();
    await auditLog(env, session.agency_id, session.user_id, "provider.created", "provider", id, null);
    return json({ id }, 201);
  }

  return json({ error: "Method not allowed" }, 405);
}

async function handleAppointments(request, env, session) {
  if (request.method === "GET") {
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const patientRef = url.searchParams.get("patient_local_ref");
    let query = "SELECT * FROM appointments WHERE agency_id = ?1";
    const binds = [session.agency_id];
    if (patientRef) {
      query += " AND patient_local_ref = ?" + (binds.length + 1);
      binds.push(patientRef);
    }
    if (from) {
      query += " AND scheduled_at >= ?" + (binds.length + 1);
      binds.push(from);
    }
    if (to) {
      query += " AND scheduled_at <= ?" + (binds.length + 1);
      binds.push(to);
    }
    query += " ORDER BY scheduled_at ASC";
    const { results } = await env.DB.prepare(query).bind(...binds).all();
    return json({ appointments: results || [] });
  }

  if (request.method === "POST") {
    const body = await request.json();
    const id = uid("appt");
    const patientRef = String(body.patient_local_ref || "").slice(0, 64);
    const scheduledAt = String(body.scheduled_at || "");
    const apptType = String(body.appointment_type || "doctor").slice(0, 40);
    if (!patientRef || !scheduledAt) {
      return json({ error: "patient_local_ref and scheduled_at required" }, 400);
    }
    const careGroupId = body.care_group_id ? String(body.care_group_id).slice(0, 64) : null;
    await env.DB.prepare(
      "INSERT INTO appointments (id, agency_id, patient_local_ref, provider_id, appointment_type, scheduled_at, status, notes_redacted, care_group_id, prep_instructions) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"
    )
      .bind(
        id,
        session.agency_id,
        patientRef,
        body.provider_id || null,
        apptType,
        scheduledAt,
        body.status || "pending",
        body.notes_redacted ? String(body.notes_redacted).slice(0, 200) : null,
        careGroupId,
        body.prep_instructions ? String(body.prep_instructions).slice(0, 500) : null
      )
      .run();
    await auditLog(env, session.agency_id, session.user_id, "appointment.created", "appointment", id, { patient_local_ref: patientRef });
    return json({ id, care_group_id: careGroupId }, 201);
  }

  return json({ error: "Method not allowed" }, 405);
}

async function handleAppointmentBundle(request, env, session) {
  const body = await request.json();
  const patientRef = String(body.patient_local_ref || "").slice(0, 64);
  const doctorAt = String(body.doctor_scheduled_at || "");
  const doctorProviderId = body.doctor_provider_id || null;
  const transportProviderId = body.transport_provider_id || null;
  const beforeMin = parseInt(body.transport_before_minutes, 10) || 60;
  const afterMin = parseInt(body.transport_after_minutes, 10) || 90;
  if (!patientRef || !doctorAt) {
    return json({ error: "patient_local_ref and doctor_scheduled_at required" }, 400);
  }

  const careGroupId = uid("grp");
  const doctorTime = new Date(doctorAt);
  const ids = [];

  if (transportProviderId) {
    const t1 = new Date(doctorTime.getTime() - beforeMin * 60000).toISOString();
    const id1 = uid("appt");
    await env.DB.prepare(
      "INSERT INTO appointments (id, agency_id, patient_local_ref, provider_id, appointment_type, scheduled_at, status, care_group_id) VALUES (?1, ?2, ?3, ?4, 'transport', ?5, 'pending', ?6)"
    ).bind(id1, session.agency_id, patientRef, transportProviderId, t1, careGroupId).run();
    ids.push(id1);
  }

  const idDoc = uid("appt");
  await env.DB.prepare(
    "INSERT INTO appointments (id, agency_id, patient_local_ref, provider_id, appointment_type, scheduled_at, status, care_group_id) VALUES (?1, ?2, ?3, ?4, 'doctor', ?5, 'pending', ?6)"
  ).bind(idDoc, session.agency_id, patientRef, doctorProviderId, doctorAt, careGroupId).run();
  ids.push(idDoc);

  if (transportProviderId) {
    const t2 = new Date(doctorTime.getTime() + afterMin * 60000).toISOString();
    const id2 = uid("appt");
    await env.DB.prepare(
      "INSERT INTO appointments (id, agency_id, patient_local_ref, provider_id, appointment_type, scheduled_at, status, care_group_id) VALUES (?1, ?2, ?3, ?4, 'transport', ?5, 'pending', ?6)"
    ).bind(id2, session.agency_id, patientRef, transportProviderId, t2, careGroupId).run();
    ids.push(id2);
  }

  await auditLog(env, session.agency_id, session.user_id, "appointment.bundle_created", "care_group", careGroupId, { count: ids.length });
  return json({ care_group_id: careGroupId, appointment_ids: ids }, 201);
}

function twiml(body) {
  return new Response(body, { headers: { "Content-Type": "text/xml; charset=utf-8" } });
}

function xmlEscape(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function getVoiceConfig(env, agencyId) {
  const row = await env.DB.prepare("SELECT voice_config FROM agencies WHERE id = ?1").bind(agencyId).first();
  try {
    return { max_wait_seconds: 120, max_call_duration_seconds: 300, ...JSON.parse(row?.voice_config || "{}") };
  } catch (e) {
    return { max_wait_seconds: 120, max_call_duration_seconds: 300 };
  }
}

async function handleVoiceTwiml(request, env) {
  const url = new URL(request.url);
  const maxWait = Math.min(parseInt(url.searchParams.get("max_wait") || "120", 10), 600);
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${xmlEscape("Hello, this is Nexasync calling from a home healthcare agency. We are requesting to schedule or confirm a patient appointment. Please hold.")}</Say>
  <Pause length="${maxWait}"/>
  <Say voice="Polly.Joanna">${xmlEscape("We were unable to reach your scheduling team. We will follow up. Goodbye.")}</Say>
  <Hangup/>
</Response>`;
  return twiml(body);
}

async function handleVoiceOutbound(request, env, session) {
  const body = await request.json();
  const appointmentId = String(body.appointment_id || "");
  if (!appointmentId) return json({ error: "appointment_id required" }, 400);

  const appt = await env.DB.prepare(
    "SELECT id, provider_id FROM appointments WHERE id = ?1 AND agency_id = ?2"
  ).bind(appointmentId, session.agency_id).first();
  if (!appt?.provider_id) return json({ error: "Appointment or provider not found" }, 404);

  const provider = await env.DB.prepare("SELECT phone, name FROM providers WHERE id = ?1").bind(appt.provider_id).first();
  const toPhone = String(body.to_phone || provider?.phone || "").replace(/\D/g, "");
  if (toPhone.length < 10) return json({ error: "Provider has no valid phone number" }, 400);

  const voiceConfig = await getVoiceConfig(env, session.agency_id);
  const maxWait = voiceConfig.max_wait_seconds || 120;

  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_NUMBER) {
    await auditLog(env, session.agency_id, session.user_id, "voice.simulated", "appointment", appointmentId, { duration: 0 });
    return json({
      ok: true,
      mode: "simulated",
      call_sid: "sim_" + uid("call"),
      provider_name: provider?.name,
      message: "Twilio not configured. Call simulated — log outcome locally.",
    });
  }

  const apiOrigin = new URL(request.url).origin;
  const twimlUrl = `${apiOrigin}/voice/twiml?max_wait=${maxWait}`;
  const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);
  const params = new URLSearchParams({
    To: toPhone.length === 10 ? "+1" + toPhone : "+" + toPhone,
    From: env.TWILIO_FROM_NUMBER,
    Url: twimlUrl,
    Timeout: String(Math.min(maxWait, 120)),
  });

  const twilioRes = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Calls.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    }
  );
  const twilioData = await twilioRes.json();
  if (!twilioRes.ok) {
    return json({ error: twilioData.message || "Twilio call failed" }, 502);
  }

  await auditLog(env, session.agency_id, session.user_id, "voice.outbound", "appointment", appointmentId, { call_sid: twilioData.sid });
  return json({ ok: true, mode: "twilio", call_sid: twilioData.sid, provider_name: provider?.name });
}

async function handleAppointmentPatch(request, env, session, id) {
  const body = await request.json();
  const sets = [];
  const binds = [];
  if (body.status) {
    sets.push("status = ?");
    binds.push(String(body.status).slice(0, 40));
  }
  if (body.scheduled_at) {
    sets.push("scheduled_at = ?");
    binds.push(String(body.scheduled_at));
  }
  if (body.provider_id !== undefined) {
    sets.push("provider_id = ?");
    binds.push(body.provider_id || null);
  }
  if (body.appointment_type) {
    sets.push("appointment_type = ?");
    binds.push(String(body.appointment_type).slice(0, 40));
  }
  if (body.prep_instructions !== undefined) {
    sets.push("prep_instructions = ?");
    binds.push(body.prep_instructions ? String(body.prep_instructions).slice(0, 500) : null);
  }
  if (body.notes_redacted !== undefined) {
    sets.push("notes_redacted = ?");
    binds.push(body.notes_redacted ? String(body.notes_redacted).slice(0, 200) : null);
  }
  if (!sets.length) return json({ error: "No fields to update" }, 400);
  sets.push("updated_at = datetime('now')");
  await env.DB.prepare(
    `UPDATE appointments SET ${sets.join(", ")} WHERE id = ? AND agency_id = ?`
  ).bind(...binds, id, session.agency_id).run();
  await auditLog(env, session.agency_id, session.user_id, "appointment.updated", "appointment", id, null);
  return json({ ok: true });
}

async function handleBillingSync(request, env, session) {
  const body = await request.json();
  const count = Math.max(0, parseInt(body.active_patients, 10) || 0);
  const prev = session.active_patient_count || 0;
  await env.DB.prepare("UPDATE agencies SET active_patient_count = ?1 WHERE id = ?2").bind(count, session.agency_id).run();
  if (count !== prev) {
    await env.DB.prepare(
      "INSERT INTO billing_events (agency_id, patient_count_delta, total_active) VALUES (?1, ?2, ?3)"
    ).bind(session.agency_id, count - prev, count).run();
    await auditLog(env, session.agency_id, session.user_id, "billing.count_sync", "agency", session.agency_id, { count });
  }
  return json({ active_patient_count: count, per_patient_rate_cents: session.per_patient_rate_cents });
}

const MARKETING_HOSTS = new Set(["inertia-intel.com", "www.inertia-intel.com"]);
const APP_HOSTS = new Set(["app.inertia-intel.com"]);

const STATIC_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

function decodeAsset(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function serveStatic(files, pathname, portalAssets = false) {
  if (!files) {
    return new Response("Site not deployed. Run deploy-cloudflare.ps1", { status: 503 });
  }
  let path = pathname || "/";
  if (path === "/" || path === "") path = "/index.html";
  if (!path.startsWith("/")) path = "/" + path;
  const pathNoQuery = path.split("?")[0];
  if (!files[pathNoQuery] && !pathNoQuery.includes(".")) path = pathNoQuery + ".html";
  else path = pathNoQuery;

  const b64 = files[path] || files["/index.html"];
  if (!b64) return new Response("Not found", { status: 404 });

  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  const cacheControl = portalAssets || path.endsWith(".html") || ext === ".js" || ext === ".css"
    ? "no-store, no-cache, must-revalidate"
    : "public, max-age=86400";
  return new Response(decodeAsset(b64), {
    headers: {
      "Content-Type": STATIC_TYPES[ext] || "application/octet-stream",
      "Cache-Control": cacheControl,
    },
  });
}

async function handleDemoSeed(env, session) {
  return handleDemoSeedAll(env, session, { replace: false, providersOnly: true });
}

async function clearDemoCloudData(env, agencyId) {
  await env.DB.prepare("DELETE FROM appointments WHERE agency_id = ?1 AND (id LIKE 'demo_appt_%' OR patient_local_ref LIKE 'demo_pat_%')").bind(agencyId).run();
  await env.DB.prepare("DELETE FROM providers WHERE agency_id = ?1 AND id LIKE 'demo_prov_%'").bind(agencyId).run();
  await env.DB.prepare("DELETE FROM insurance_plans WHERE agency_id = ?1 AND id LIKE 'demo_plan_%'").bind(agencyId).run();
  await env.DB.prepare("DELETE FROM audit_logs WHERE agency_id = ?1 AND (action LIKE 'demo.%' OR resource_id LIKE 'demo_%')").bind(agencyId).run();
  await env.DB.prepare("DELETE FROM billing_events WHERE agency_id = ?1").bind(agencyId).run();
}

async function seedDemoAgencyExtras(env, session, providerCount, apptCount) {
  for (const plan of DEMO_AGENCY_PLANS) {
    await env.DB.prepare(
      "INSERT OR REPLACE INTO insurance_plans (id, agency_id, carrier, plan_name, plan_type, network_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
    ).bind(plan.id, session.agency_id, plan.carrier, plan.plan_name, plan.plan_type, plan.network_id).run();
  }

  for (const ev of demoBillingEvents()) {
    const created = new Date(Date.now() - ev.daysAgo * 86400000).toISOString();
    await env.DB.prepare(
      "INSERT INTO billing_events (agency_id, patient_count_delta, total_active, created_at) VALUES (?1, ?2, ?3, ?4)"
    ).bind(session.agency_id, ev.patient_count_delta, ev.total_active, created).run();
  }

  for (const entry of demoAuditEntries(session.user_id)) {
    const created = new Date(Date.now() - entry.daysAgo * 86400000).toISOString();
    await env.DB.prepare(
      "INSERT INTO audit_logs (agency_id, user_id, action, resource_type, resource_id, meta, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
    ).bind(
      session.agency_id, entry.user_id, entry.action, entry.resource_type, entry.resource_id,
      entry.meta ? JSON.stringify(entry.meta) : null, created
    ).run();
  }

  await env.DB.prepare(
    "UPDATE agencies SET voice_config = ?1, active_patient_count = ?2, subscription_status = ?3 WHERE id = ?4"
  ).bind(
    JSON.stringify({ max_wait_seconds: 120, max_call_duration_seconds: 300, demo_seeded: true, outbound_enabled: true }),
    12,
    "active",
    session.agency_id
  ).run();

  await auditLog(env, session.agency_id, session.user_id, "demo.full_seeded", "agency", session.agency_id, {
    providers: providerCount,
    appointments: apptCount,
    patients: 12,
  });
}

async function handleDemoSeedAll(env, session, opts = {}) {
  const replace = !!opts.replace;
  const providersOnly = !!opts.providersOnly;

  const existing = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM providers WHERE agency_id = ?1 AND id LIKE 'demo_prov_%'"
  ).bind(session.agency_id).first();

  if ((existing?.c || 0) > 0 && !replace) {
    return json({
      ok: true,
      skipped: true,
      message: "Demo data already loaded. Use Replace demo data to refresh.",
    });
  }

  if (replace && (existing?.c || 0) > 0) {
    await clearDemoCloudData(env, session.agency_id);
  }

  let providerCount = 0;
  for (const p of DEMO_PROVIDER_DEFS) {
    await env.DB.prepare(
      "INSERT INTO providers (id, agency_id, name, specialty, provider_type, phone, address, accepted_plan_ids, in_network, notes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"
    ).bind(
      p.id, session.agency_id, p.name, p.specialty, p.provider_type, p.phone,
      p.address || null, JSON.stringify(p.accepted_plan_ids || []), p.in_network === 0 ? 0 : 1, p.notes || null
    ).run();
    providerCount++;
  }

  if (providersOnly) {
    await auditLog(env, session.agency_id, session.user_id, "demo.providers_seeded", "agency", session.agency_id, { count: providerCount });
    return json({ ok: true, providers: providerCount, appointments: 0, skipped: false });
  }

  const apptDefs = buildDemoAppointments();
  const appointmentIds = [];
  for (const a of apptDefs) {
    await env.DB.prepare(
      "INSERT INTO appointments (id, agency_id, patient_local_ref, provider_id, appointment_type, scheduled_at, status, notes_redacted, care_group_id, prep_instructions) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"
    ).bind(
      a.id, session.agency_id, a.patient_local_ref, a.provider_id, a.appointment_type,
      a.scheduled_at, a.status, a.notes_redacted, a.care_group_id, a.prep_instructions || null
    ).run();
    appointmentIds.push(a.id);
  }

  await seedDemoAgencyExtras(env, session, providerCount, apptDefs.length);

  const careGroups = new Set(apptDefs.filter((a) => a.care_group_id).map((a) => a.care_group_id)).size;

  return json({
    ok: true,
    skipped: false,
    providers: providerCount,
    appointments: apptDefs.length,
    care_groups: careGroups,
    agency_plans: DEMO_AGENCY_PLANS.length,
    appointment_ids: appointmentIds,
  });
}

async function handleDemoClear(env, session) {
  await clearDemoCloudData(env, session.agency_id);
  await auditLog(env, session.agency_id, session.user_id, "demo.cleared", "agency", session.agency_id, null);
  return json({ ok: true, cleared: true });
}

async function handleBillingEvents(env, session) {
  const { results } = await env.DB.prepare(
    "SELECT id, patient_count_delta, total_active, created_at FROM billing_events WHERE agency_id = ?1 ORDER BY created_at DESC LIMIT 24"
  ).bind(session.agency_id).all();
  return json({ events: results || [] });
}

async function handleAuditLogs(env, session) {
  const { results } = await env.DB.prepare(
    "SELECT id, action, resource_type, resource_id, meta, created_at FROM audit_logs WHERE agency_id = ?1 ORDER BY created_at DESC LIMIT 40"
  ).bind(session.agency_id).all();
  const logs = (results || []).map((r) => {
    let meta = null;
    try { meta = r.meta ? JSON.parse(r.meta) : null; } catch (e) { meta = null; }
    return { ...r, meta };
  });
  return json({ logs });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (MARKETING_HOSTS.has(url.hostname)) {
      return serveStatic(typeof MARKETING_B64 !== "undefined" ? MARKETING_B64 : null, url.pathname);
    }
    if (APP_HOSTS.has(url.hostname)) {
      return serveStatic(typeof PORTAL_B64 !== "undefined" ? PORTAL_B64 : null, url.pathname, true);
    }

    if (request.method === "OPTIONS") {
      return withCors(request, env, new Response(null, { status: 204 }));
    }

    try {
      await ensureSchema(env);
      await seedInsurancePlans(env);

      const path = url.pathname.replace(/\/$/, "") || "/";

      if (path === "/health") {
        const release = typeof PORTAL_RELEASE !== "undefined" ? PORTAL_RELEASE : null;
        return withCors(request, env, json({ ok: true, service: "nexasync-api", release }));
      }

      if (path === "/funnel/connect" && request.method === "GET") {
        return handleFunnelConnect(request, env);
      }
      const previewMatch = path.match(/^\/preview\/([^/]+)(?:\/(.*))?$/);
      if (previewMatch && request.method === "GET") {
        return handlePreviewAssetRequest(request, env, decodeURIComponent(previewMatch[1]), previewMatch[2] || "index.html");
      }

      if (path === "/voice/twiml" && request.method === "GET") {
        return handleVoiceTwiml(request, env);
      }
      if (path === "/voice/agent/start" && request.method === "GET") {
        return handleVoiceAgentStart(request, env);
      }
      if (path === "/voice/agent/step" && request.method === "POST") {
        return handleVoiceAgentStep(request, env);
      }
      if (path === "/voice/agent/status" && request.method === "POST") {
        return handleVoiceAgentStatus(request, env);
      }
      if (path.startsWith("/voice/tts/") && request.method === "GET") {
        const clipId = path.replace("/voice/tts/", "").replace(/\.mp3$/, "");
        return handleVoiceTtsAudio(request, env, clipId);
      }
      if (path === "/voice/retell/webhook" && request.method === "POST") {
        return handleRetellWebhook(request, env);
      }
      if (path === "/voice/lab-verify/webhook" && request.method === "POST") {
        return handleLabVerifyWebhook(request, env, ctx);
      }
      if (path === "/voice/lab-verify/setup" && request.method === "POST") {
        if (!checkLabVerifyAuth(request, env)) return withCors(request, env, json({ error: "Unauthorized" }, 401));
        return withCors(request, env, await handleLabVerifySetup(request, env));
      }
      if (path === "/voice/lab-verify/outbound" && request.method === "POST") {
        if (!checkLabVerifyAuth(request, env)) return withCors(request, env, json({ error: "Unauthorized" }, 401));
        return withCors(request, env, await handleLabVerifyOutbound(request, env));
      }
      if (path === "/voice/lab-verify/results" && request.method === "GET") {
        if (!checkLabVerifyAuth(request, env)) return withCors(request, env, json({ error: "Unauthorized" }, 401));
        return withCors(request, env, await handleLabVerifyResults(request, env));
      }
      if (path === "/voice/lab-verify/campaign/start" && request.method === "POST") {
        if (!checkLabVerifyAuth(request, env)) return withCors(request, env, json({ error: "Unauthorized" }, 401));
        return withCors(request, env, await handleLabVerifyCampaignStart(request, env));
      }
      if (path === "/voice/lab-verify/campaign/status" && request.method === "GET") {
        if (!checkLabVerifyAuth(request, env)) return withCors(request, env, json({ error: "Unauthorized" }, 401));
        return withCors(request, env, await handleLabVerifyCampaignStatus(request, env));
      }
      if (path === "/voice/lab-verify/campaign/pause" && request.method === "POST") {
        if (!checkLabVerifyAuth(request, env)) return withCors(request, env, json({ error: "Unauthorized" }, 401));
        return withCors(request, env, await handleLabVerifyCampaignPause(request, env));
      }
      if (path === "/voice/lab-verify/campaign/export.csv" && request.method === "GET") {
        if (!checkLabVerifyAuth(request, env)) return withCors(request, env, json({ error: "Unauthorized" }, 401));
        return withCors(request, env, await handleLabVerifyCampaignExport(request, env));
      }
      if (path === "/voice/lab-verify/campaign/tick" && request.method === "POST") {
        if (!checkLabVerifyAuth(request, env)) return withCors(request, env, json({ error: "Unauthorized" }, 401));
        return withCors(request, env, json(await handleLabVerifyCampaignCron(env)));
      }

      if (path === "/voice/plumber-outreach/webhook" && request.method === "POST") {
        return handlePlumberOutreachWebhook(request, env, ctx);
      }
      if (path === "/voice/plumber-outreach/hot-lead" && request.method === "POST") {
        return handlePlumberOutreachHotLead(request, env);
      }
      if (path === "/voice/plumber-outreach/setup" && request.method === "POST") {
        if (!checkPlumberOutreachAuth(request, env)) return withCors(request, env, json({ error: "Unauthorized" }, 401));
        return withCors(request, env, await handlePlumberOutreachSetup(request, env));
      }
      if (path === "/voice/plumber-outreach/campaign/start" && request.method === "POST") {
        if (!checkPlumberOutreachAuth(request, env)) return withCors(request, env, json({ error: "Unauthorized" }, 401));
        return withCors(request, env, await handlePlumberOutreachCampaignStart(request, env));
      }
      if (path === "/voice/plumber-outreach/campaign/pause" && request.method === "POST") {
        if (!checkPlumberOutreachAuth(request, env)) return withCors(request, env, json({ error: "Unauthorized" }, 401));
        return withCors(request, env, await handlePlumberOutreachCampaignPause(request, env));
      }
      if (path === "/voice/plumber-outreach/campaign/resume" && request.method === "POST") {
        if (!checkPlumberOutreachAuth(request, env)) return withCors(request, env, json({ error: "Unauthorized" }, 401));
        return withCors(request, env, await handlePlumberOutreachCampaignResume(request, env));
      }
      if (path === "/voice/plumber-outreach/campaign/status" && request.method === "GET") {
        if (!checkPlumberOutreachAuth(request, env)) return withCors(request, env, json({ error: "Unauthorized" }, 401));
        return withCors(request, env, await handlePlumberOutreachCampaignStatus(request, env));
      }
      if (path === "/voice/plumber-outreach/outbound" && request.method === "POST") {
        if (!checkPlumberOutreachAuth(request, env)) return withCors(request, env, json({ error: "Unauthorized" }, 401));
        return withCors(request, env, await handlePlumberOutreachOutbound(request, env));
      }
      if (path === "/voice/plumber-outreach/resend-alert" && request.method === "POST") {
        if (!checkPlumberOutreachAuth(request, env)) return withCors(request, env, json({ error: "Unauthorized" }, 401));
        return withCors(request, env, await handlePlumberOutreachResendAlert(request, env));
      }
      if (path === "/voice/plumber-outreach/test-alert-email" && request.method === "POST") {
        if (!checkPlumberOutreachAuth(request, env)) return withCors(request, env, json({ error: "Unauthorized" }, 401));
        return withCors(request, env, await handlePlumberTestAlertEmail(request, env));
      }
      if (path === "/voice/plumber-outreach/tracking" && request.method === "GET") {
        if (!checkPlumberOutreachAuth(request, env)) return withCors(request, env, json({ error: "Unauthorized" }, 401));
        return withCors(request, env, await handlePlumberOutreachTracking(request, env));
      }
      if (path === "/voice/plumber-outreach/voices" && request.method === "GET") {
        if (!checkPlumberOutreachAuth(request, env)) return withCors(request, env, json({ error: "Unauthorized" }, 401));
        return withCors(request, env, await handlePlumberOutreachListVoices(request, env));
      }
      if (path === "/voice/plumber-outreach/agent-debug" && request.method === "GET") {
        if (!checkPlumberOutreachAuth(request, env)) return withCors(request, env, json({ error: "Unauthorized" }, 401));
        return withCors(request, env, await handlePlumberOutreachAgentDebug(request, env));
      }
      if (path === "/voice/plumber-outreach/preflight" && request.method === "GET") {
        if (!checkPlumberOutreachAuth(request, env)) return withCors(request, env, json({ error: "Unauthorized" }, 401));
        return withCors(request, env, await handlePlumberOutreachPreflight(request, env));
      }
      if (path === "/voice/plumber-outreach/inspect-call" && request.method === "GET") {
        if (!checkPlumberOutreachAuth(request, env)) return withCors(request, env, json({ error: "Unauthorized" }, 401));
        return withCors(request, env, await handlePlumberOutreachInspectCall(request, env));
      }
      if (path === "/voice/plumber-outreach/recording" && request.method === "GET") {
        if (!checkPlumberOutreachAuth(request, env)) return withCors(request, env, json({ error: "Unauthorized" }, 401));
        return withCors(request, env, await handlePlumberOutreachCallRecording(request, env));
      }
      if (path === "/voice/test-email" && request.method === "POST") {
        if (!checkLabVerifyAuth(request, env) && !checkPlumberOutreachAuth(request, env)) {
          return withCors(request, env, json({ error: "Unauthorized" }, 401));
        }
        const body = await request.json().catch(() => ({}));
        const result =
          typeof sendOutreachEmail === "function"
            ? await sendOutreachEmail(env, {
                to: body.to,
                subject: String(body.subject || "Solena outreach email test"),
                text: String(body.message || "If you received this, 1-minute call alerts are working."),
                html: `<p>${String(body.message || "If you received this, 1-minute call alerts are working.")}</p>`,
              })
            : { sent: false, reason: "email_module_missing" };
        return withCors(
          request,
          env,
          json({
            ok: !!result.sent,
            to: result.to || env.PLUMBER_OUTREACH_NOTIFY_EMAIL || null,
            from: env.OUTREACH_EMAIL_FROM || null,
            result,
          })
        );
      }
      if (path === "/voice/plumber-outreach/playbook" && request.method === "GET") {
        if (!checkPlumberOutreachAuth(request, env)) return withCors(request, env, json({ error: "Unauthorized" }, 401));
        return withCors(request, env, await handlePlumberOutreachPlaybookGet(env));
      }
      if (path === "/voice/plumber-outreach/playbook" && request.method === "PATCH") {
        if (!checkPlumberOutreachAuth(request, env)) return withCors(request, env, json({ error: "Unauthorized" }, 401));
        return withCors(request, env, await handlePlumberOutreachPlaybookPatch(request, env));
      }
      if (path === "/voice/plumber-outreach/publish-preview" && request.method === "POST") {
        return withCors(request, env, await handlePlumberPublishPreview(request, env));
      }
      if (path === "/voice/plumber-outreach/publish-queue" && request.method === "GET") {
        const publishCallId = url.searchParams.get("call");
        if (!publishCallId && !checkPlumberOutreachAuth(request, env)) {
          return withCors(request, env, json({ error: "Unauthorized" }, 401));
        }
        return withCors(request, env, await handlePlumberPublishQueueGet(request, env));
      }
      if (path === "/voice/plumber-outreach/send-preview-sms" && request.method === "POST") {
        return withCors(request, env, await handlePlumberSendPreviewSms(request, env));
      }
      if (path === "/voice/twilio-status" && request.method === "GET") {
        if (!checkLabVerifyAuth(request, env) && !checkPlumberOutreachAuth(request, env)) {
          return withCors(request, env, json({ error: "Unauthorized" }, 401));
        }
        return withCors(request, env, await handleTwilioStatus(env));
      }
      if (path === "/voice/test-sms" && request.method === "POST") {
        if (!checkLabVerifyAuth(request, env) && !checkPlumberOutreachAuth(request, env)) {
          return withCors(request, env, json({ error: "Unauthorized" }, 401));
        }
        const body = await request.json().catch(() => ({}));
        const to = body.to || env.LAB_VERIFY_NOTIFY_PHONE || env.PLUMBER_OUTREACH_NOTIFY_PHONE;
        if (!to) return withCors(request, env, json({ error: "No destination phone configured" }, 400));
        const message = String(body.message || "NexaSync SMS test — your Twilio number is working.").slice(0, 320);
        const result =
          typeof sendTwilioSms === "function"
            ? await sendTwilioSms(env, to, message)
            : { sent: false, reason: "sms_module_missing" };
        return withCors(
          request,
          env,
          json({
            ok: !!result.sent,
            to,
            from: env.TWILIO_SMS_FROM || env.TWILIO_FROM_NUMBER || null,
            result,
          })
        );
      }

      if (path === "/auth/register" && request.method === "POST") {
        return withCors(request, env, await handleRegister(request, env));
      }
      if (path === "/auth/login" && request.method === "POST") {
        return withCors(request, env, await handleLogin(request, env));
      }

      const session = await getSession(request, env);
      if (path === "/auth/me" && request.method === "GET") {
        if (!session) return withCors(request, env, json({ error: "Unauthorized" }, 401));
        return withCors(request, env, await handleMe(session));
      }

      if (!session) {
        return withCors(request, env, json({ error: "Unauthorized" }, 401));
      }

      if (path === "/insurance-plans" && request.method === "GET") {
        return withCors(request, env, await handleInsurancePlans(env, session));
      }
      if (path === "/providers") {
        return withCors(request, env, await handleProviders(request, env, session));
      }
      if (path === "/appointments") {
        return withCors(request, env, await handleAppointments(request, env, session));
      }
      if (path === "/appointments/bundle" && request.method === "POST") {
        return withCors(request, env, await handleAppointmentBundle(request, env, session));
      }
      if (path.startsWith("/appointments/") && request.method === "PATCH") {
        const id = path.split("/")[2];
        return withCors(request, env, await handleAppointmentPatch(request, env, session, id));
      }
      if (path === "/billing/sync-count" && request.method === "POST") {
        return withCors(request, env, await handleBillingSync(request, env, session));
      }
      if (path === "/billing/events" && request.method === "GET") {
        return withCors(request, env, await handleBillingEvents(env, session));
      }
      if (path === "/audit-logs" && request.method === "GET") {
        return withCors(request, env, await handleAuditLogs(env, session));
      }
      if (path === "/demo/seed-providers" && request.method === "POST") {
        return withCors(request, env, await handleDemoSeed(env, session));
      }
      if (path === "/demo/seed-all" && request.method === "POST") {
        const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
        return withCors(request, env, await handleDemoSeedAll(env, session, { replace: !!body.replace }));
      }
      if (path === "/demo/clear" && request.method === "POST") {
        return withCors(request, env, await handleDemoClear(env, session));
      }
      if (path === "/voice/playbook" && request.method === "GET") {
        return withCors(request, env, await handleVoicePlaybookGet(env, session));
      }
      if (path === "/voice/playbook" && request.method === "PATCH") {
        return withCors(request, env, await handleVoicePlaybookPatch(request, env, session));
      }
      if (path === "/voice/outbound" && request.method === "POST") {
        return withCors(request, env, await handleVoiceOutboundAgent(request, env, session));
      }
      if (path.startsWith("/voice/sessions/") && request.method === "GET") {
        const vsId = path.split("/")[3];
        return withCors(request, env, await handleVoiceSessionGet(env, session, vsId));
      }
      if (path === "/voice/agent/simulate" && request.method === "POST") {
        return withCors(request, env, await handleVoiceSimulateTurn(request, env, session));
      }
      if (path === "/voice/tts/preview" && request.method === "POST") {
        return withCors(request, env, await handleVoiceTtsPreview(request, env, session));
      }

      return withCors(request, env, json({ error: "Not found" }, 404));
    } catch (err) {
      console.error(err);
      return withCors(request, env, json({ error: "Server error" }, 500));
    }
  },

  async scheduled(event, env, ctx) {
    try {
      await ensureSchema(env);
      await handleLabVerifyCampaignCron(env);
      await handlePlumberOutreachCampaignCron(env);
    } catch (err) {
      console.error("scheduled campaigns", err);
    }
  },
};
