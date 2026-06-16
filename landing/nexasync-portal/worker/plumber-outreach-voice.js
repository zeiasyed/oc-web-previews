/** Inland Empire plumber outreach — Retell campaign (concatenated into index.js at deploy) */

function getDefaultOutreachPlaybook() {
  return {
    version: 3,
    agent_persona: "Alex",
    company_label: "Solena Digital",
    voice_style:
      'Sound natural, friendly, confident — not salesy or robotic. Use brief fillers ("um", "okay so", "sure"). Keep live conversations under 60 seconds when possible.',
    ivr_rules:
      "Listen first. Navigate to reception or owner. Use press_digit when needed. Prefer operator / front desk. Never pitch during hold music or menus. HARD LIMITS: If still in IVR or an automated menu after 25 seconds with no human, use end_call. Do not loop menus. If you reach voicemail, leave ONE short sentence (max 15 seconds), then end_call immediately — do not wait on the line. Never hold longer than 20 seconds waiting for a person.",
    opening:
      "Hi — uh, this is Alex with Solena Digital. I was looking at {{company_name}} in {{city}} — we put together a quick preview of a stronger local page that could bring in more plumbing calls from Google. Would you be open to taking a quick look?",
    general_rules:
      "Do NOT claim you rebuilt their live website without their permission — it's a preview/sample for discussion. Do not discuss pricing unless they ask; say the specialist can walk through options. California calls may be recorded if asked. Do NOT transfer the live call — when they want the preview, call notify_owner_hot_lead then end_call; the account owner will text or call them back.",
    paths: [
      {
        id: "interested",
        label: "Interested / wants preview",
        when: "They say yes, maybe, or ask to see the preview",
        say: "Great — uh, perfect. Our specialist will text you the preview link in the next couple of minutes. Thanks for your time.",
        enabled: true,
        sort_order: 0,
        actions: { notify_owner_sms: true, transfer_to_owner: false, end_call: true },
        sms_template:
          "HOT LEAD: {{company_name}} ({{city}})\nPhone: {{phone}}\nInterest: {{interest_level}}{{notes_line}}\nPublish preview: {{publish_url}}\nCall them back — no live transfer.",
      },
      {
        id: "not_interested",
        label: "Not interested",
        when: "They decline or are not interested",
        say: "Totally understand — thanks for your time.",
        enabled: true,
        sort_order: 1,
        actions: { notify_owner_sms: false, transfer_to_owner: false, end_call: true },
        sms_template: "",
      },
      {
        id: "callback",
        label: "Busy / callback",
        when: "They are too busy or ask to call back later",
        say: "No problem — when is a good time to call back?",
        enabled: true,
        sort_order: 2,
        actions: { notify_owner_sms: false, transfer_to_owner: false, end_call: true },
        sms_template: "",
      },
    ],
  };
}

function normalizeOutreachPlaybook(raw) {
  const base = getDefaultOutreachPlaybook();
  if (!raw || typeof raw !== "object") return base;
  const paths = Array.isArray(raw.paths) ? raw.paths : base.paths;
  const byId = Object.fromEntries(base.paths.map((p) => [p.id, p]));
  const mergedPaths = paths.map((p, i) => {
    const d = byId[p.id] || {};
    const actions = { ...(d.actions || {}), ...(p.actions || {}) };
    return {
      id: String(p.id || d.id || `path_${i}`),
      label: String(p.label || d.label || p.id || "Path"),
      when: String(p.when || d.when || ""),
      say: String(p.say || d.say || ""),
      enabled: p.enabled !== false,
      sort_order: Number.isFinite(p.sort_order) ? p.sort_order : i,
      actions: {
        notify_owner_sms: actions.notify_owner_sms === true,
        transfer_to_owner: actions.transfer_to_owner === true,
        end_call: actions.end_call === true,
      },
      sms_template: String(p.sms_template ?? d.sms_template ?? ""),
    };
  });
  mergedPaths.sort((a, b) => a.sort_order - b.sort_order);

  const version = raw.version != null ? Number(raw.version) : 2;

  let voice_style = String(raw.voice_style || base.voice_style);
  let ivr_rules = String(raw.ivr_rules || base.ivr_rules);
  let general_rules = String(raw.general_rules || base.general_rules);

  if (version < 2) {
    voice_style = base.voice_style;
    ivr_rules = base.ivr_rules;
    general_rules = base.general_rules;
    const interested = mergedPaths.find((p) => p.id === "interested");
    const baseInterested = base.paths.find((p) => p.id === "interested");
    if (interested && baseInterested) {
      interested.say = baseInterested.say;
      interested.sms_template = baseInterested.sms_template;
      interested.actions = { ...baseInterested.actions };
    }
  }

  return {
    version: 3,
    agent_persona: String(raw.agent_persona || base.agent_persona),
    company_label: String(raw.company_label || base.company_label),
    voice_style,
    ivr_rules,
    opening: String(
      raw.opening || raw.opening_has_website || raw.opening_no_website || base.opening
    ),
    general_rules,
    paths: mergedPaths.length ? mergedPaths : base.paths,
  };
}

function buildPlumberPromptFromPlaybook(playbook) {
  const pb = normalizeOutreachPlaybook(playbook);
  const pathBlocks = pb.paths
    .filter((p) => p.enabled)
    .map((p) => {
      const acts = [];
      if (p.actions.notify_owner_sms) acts.push("Call notify_owner_hot_lead with interest level and notes (texts the account owner).");
      if (p.actions.transfer_to_owner) acts.push("Then use transfer_to_owner to transfer the live call.");
      if (p.actions.end_call) acts.push("End politely with end_call — do not stay on the line.");
      return `## If ${p.label}\nWhen: ${p.when}\nSay: "${p.say}"\n${acts.length ? acts.map((a, i) => `${i + 1}. ${a}`).join("\n") : "End the call appropriately."}`;
    })
    .join("\n\n");

  return `You are ${pb.agent_persona}, calling from NexaSync / ${pb.company_label} — a local web team in Southern California.

You are calling {{company_name}} in {{city}}, CA about getting them more plumbing calls from Google.

Context for this business:
- Has website on file: {{has_website_label}}
- Website: {{website_or_none}}

## Voice
${pb.voice_style}

## Opening (after a live human answers — not during IVR)
"${pb.opening}"

## IVR rules
${pb.ivr_rules}

${pathBlocks}

## Rules
${pb.general_rules}`;
}

function fillOutreachTemplate(template, vars) {
  return String(template || "").replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ""));
}

async function getOutreachPlaybook(env) {
  const raw = await getPlumberOutreachConfig(env, "playbook_json");
  if (!raw) return getDefaultOutreachPlaybook();
  try {
    return normalizeOutreachPlaybook(JSON.parse(raw));
  } catch (e) {
    return getDefaultOutreachPlaybook();
  }
}

async function saveOutreachPlaybook(env, playbook) {
  const normalized = normalizeOutreachPlaybook(playbook);
  await setPlumberOutreachConfig(env, "playbook_json", JSON.stringify(normalized));
  return normalized;
}

async function syncPlumberOutreachAgentPrompt(env) {
  if (!env.RETELL_API_KEY) return { ok: false, reason: "retell_not_configured" };
  const playbook = await getOutreachPlaybook(env);
  const prompt = buildPlumberPromptFromPlaybook(playbook);
  const agentId = (await getPlumberOutreachConfig(env, "agent_id")) || String(env.RETELL_PLUMBER_AGENT_ID || "").trim();
  if (!agentId) return { ok: false, reason: "agent_not_configured" };
  const detail = await retellFetch(env, "GET", "/get-agent/" + agentId, null);
  const llmId = detail.response_engine?.llm_id;
  if (!llmId) return { ok: false, reason: "llm_not_found" };
  const tools = buildPlumberTools(env, playbook);
  const hotLeadUrl =
    (await getPlumberOutreachConfig(env, "hot_lead_url")) || "https://api.inertia-intel.com/voice/plumber-outreach/hot-lead";
  const custom = tools.find((t) => t.name === "notify_owner_hot_lead");
  if (custom) custom.url = hotLeadUrl;
  await retellFetch(env, "PATCH", "/update-retell-llm/" + llmId, {
    general_prompt: prompt,
    begin_message: PLUMBER_OUTREACH_BEGIN,
    general_tools: tools,
  });
  return { ok: true, agent_id: agentId, llm_id: llmId };
}

async function handlePlumberOutreachPlaybookGet(env) {
  const playbook = await getOutreachPlaybook(env);
  return json({
    ok: true,
    playbook,
    meta: {
      variables: ["{{company_name}}", "{{city}}", "{{phone}}", "{{interest_level}}", "{{notes_line}}", "{{publish_url}}"],
      sms_variables: ["{{company_name}}", "{{city}}", "{{phone}}", "{{interest_level}}", "{{notes_line}}", "{{publish_url}}"],
    },
  });
}

async function handlePlumberOutreachPlaybookPatch(request, env) {
  await ensurePlumberOutreachSchema(env);
  const body = await request.json().catch(() => ({}));
  if (body.reset) {
    const playbook = await saveOutreachPlaybook(env, getDefaultOutreachPlaybook());
    let sync = { ok: false };
    try {
      sync = await syncPlumberOutreachAgentPrompt(env);
    } catch (e) {
      sync = { ok: false, error: String(e.message || e) };
    }
    return json({ ok: true, playbook, sync });
  }
  const playbook = await saveOutreachPlaybook(env, body.playbook || body);
  let sync = { ok: false };
  try {
    sync = await syncPlumberOutreachAgentPrompt(env);
  } catch (e) {
    sync = { ok: false, error: String(e.message || e) };
  }
  return json({ ok: true, playbook, sync });
}

const PLUMBER_OUTREACH_BEGIN = "";

const PLUMBER_OUTREACH_GENERAL_TOOLS = [
  {
    type: "press_digit",
    name: "press_digit",
    description: "Press keypad digits to navigate IVR menus. Prefer operator or reception.",
    delay_ms: 1500,
  },
  {
    type: "end_call",
    name: "end_call",
    description: "End the call politely when done or if they refuse.",
  },
  {
    type: "transfer_call",
    name: "transfer_to_owner",
    description: "Transfer the interested plumber to the account owner live. Use ONLY after notify_owner_hot_lead succeeds.",
    transfer_destination: { type: "predefined", number: "{{transfer_phone}}" },
    transfer_option: { type: "cold_transfer", showTransfereeAsCaller: true },
  },
];

const PLUMBER_OUTREACH_POST_CALL = [
  {
    type: "enum",
    name: "call_outcome",
    description: "Outcome of the outreach call",
    choices: [
      "interested_transferred",
      "interested_callback",
      "not_interested",
      "voicemail",
      "no_answer",
      "wrong_number",
      "gatekeeper",
    ],
    required: true,
  },
  { type: "string", name: "contact_name", description: "Name of person spoken with", required: false },
  { type: "system-presets", name: "call_summary", required: false },
];

function plumberOutreachWebhookUrl(request, env) {
  const origin = new URL(request.url).origin;
  if (origin && origin.startsWith("http")) return origin + "/voice/plumber-outreach/webhook";
  return "https://api.inertia-intel.com/voice/plumber-outreach/webhook";
}

function plumberHotLeadUrl(request, env) {
  const origin = new URL(request.url).origin;
  if (origin && origin.startsWith("http")) return origin + "/voice/plumber-outreach/hot-lead";
  return "https://api.inertia-intel.com/voice/plumber-outreach/hot-lead";
}

async function ensurePlumberOutreachSchema(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS plumber_outreach_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS plumber_outreach_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      call_id TEXT UNIQUE,
      company_name TEXT NOT NULL,
      phone TEXT,
      city TEXT,
      has_website INTEGER,
      website TEXT,
      call_outcome TEXT,
      contact_name TEXT,
      call_summary TEXT,
      status TEXT DEFAULT 'placed',
      placed_at TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS plumber_outreach_campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'paused',
      active_item_id INTEGER,
      active_call_id TEXT,
      next_call_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS plumber_outreach_campaign_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      company_name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      zip TEXT,
      website TEXT,
      slug TEXT,
      has_website INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      call_id TEXT,
      call_outcome TEXT,
      contact_name TEXT,
      call_summary TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    )`
  ).run();
  try {
    await env.DB.prepare("ALTER TABLE plumber_outreach_campaign_items ADD COLUMN slug TEXT").run();
  } catch (e) {
    /* column exists */
  }
  try {
    await env.DB.prepare("ALTER TABLE plumber_outreach_calls ADD COLUMN alert_email_sent INTEGER DEFAULT 0").run();
  } catch (e) {
    /* column exists */
  }
  try {
    await env.DB.prepare("ALTER TABLE plumber_outreach_calls ADD COLUMN call_started_at TEXT").run();
  } catch (e) {
    /* column exists */
  }
}

async function getPlumberOutreachConfig(env, key) {
  const row = await env.DB.prepare("SELECT value FROM plumber_outreach_config WHERE key = ?1").bind(key).first();
  return row ? String(row.value) : "";
}

async function setPlumberOutreachConfig(env, key, value) {
  await env.DB.prepare(
    `INSERT INTO plumber_outreach_config (key, value, updated_at) VALUES (?1, ?2, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  )
    .bind(key, value)
    .run();
}

function checkPlumberOutreachAuth(request, env) {
  const token = String(env.PLUMBER_OUTREACH_API_TOKEN || env.LAB_VERIFY_API_TOKEN || "").trim();
  if (!token) return false;
  const auth = request.headers.get("Authorization") || "";
  if (auth === "Bearer " + token) return true;
  return request.headers.get("X-Plumber-Outreach-Token") === token;
}

function isTollFreePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  const npa = digits.length === 11 && digits[0] === "1" ? digits.slice(1, 4) : digits.slice(0, 3);
  return ["800", "888", "877", "866", "855", "844", "833"].includes(npa);
}

function filterPriorityLeads(leads) {
  return (leads || []).filter((lead) => {
    if (!lead || !lead.phone) return false;
    if (lead.has_website) return false;
    if (isTollFreePhone(lead.phone)) return false;
    return true;
  });
}

function buildPlumberTools(env, playbook) {
  const pb = normalizeOutreachPlaybook(playbook || getDefaultOutreachPlaybook());
  const allowTransfer = (pb.paths || []).some((p) => p.enabled && p.actions?.transfer_to_owner);
  const transferPhone = String(env.PLUMBER_OUTREACH_TRANSFER_PHONE || env.LAB_VERIFY_NOTIFY_PHONE || "").trim();
  const tools = PLUMBER_OUTREACH_GENERAL_TOOLS.filter((t) => allowTransfer || t.name !== "transfer_to_owner").map((t) => {
    if (t.name !== "transfer_to_owner") return t;
    return {
      ...t,
      transfer_destination: { type: "predefined", number: transferPhone || "+10000000000" },
    };
  });
  tools.push({
    type: "custom",
    name: "notify_owner_hot_lead",
    description:
      "Text the account owner and log a hot lead when the plumber agrees to see the preview site. Call this, then end_call — do NOT transfer the live call.",
    url: "", // filled at setup
    method: "POST",
    speak_during_execution: true,
    execution_message_description: "One sec — I'm pinging my colleague who built the preview...",
    parameters: {
      type: "object",
      properties: {
        interest_level: { type: "string", description: "high, medium, or low" },
        notes: { type: "string", description: "Anything useful for the owner" },
      },
      required: ["interest_level"],
    },
  });
  return tools;
}

async function handlePlumberOutreachSetup(request, env) {
  if (!env.RETELL_API_KEY || !env.RETELL_FROM_NUMBER) {
    return json({ error: "Worker missing RETELL_API_KEY or RETELL_FROM_NUMBER" }, 503);
  }
  await ensurePlumberOutreachSchema(env);
  const webhookUrl = plumberOutreachWebhookUrl(request, env);
  const hotLeadUrl = plumberHotLeadUrl(request, env);
  let agentId = (await getPlumberOutreachConfig(env, "agent_id")) || String(env.RETELL_PLUMBER_AGENT_ID || "").trim();
  let llmId = null;
  let agentVersion = 0;
  const playbook = await getOutreachPlaybook(env);
  const outreachPrompt = buildPlumberPromptFromPlaybook(playbook);

  const tools = buildPlumberTools(env, playbook);
  const custom = tools.find((t) => t.name === "notify_owner_hot_lead");
  if (custom) custom.url = hotLeadUrl;

  if (agentId) {
    try {
      const detail = await retellFetch(env, "GET", "/get-agent/" + agentId, null);
      llmId = detail.response_engine?.llm_id;
      if (llmId) {
        await retellFetch(env, "PATCH", "/update-retell-llm/" + llmId, {
          general_prompt: outreachPrompt,
          begin_message: PLUMBER_OUTREACH_BEGIN,
          general_tools: tools,
        });
        const updated = await retellFetch(env, "PATCH", "/update-agent/" + agentId, {
          agent_name: "IE Plumber Outreach",
          voice_id: "retell-Cimo",
          webhook_url: webhookUrl,
          webhook_events: ["call_started", "call_ended", "call_analyzed", "transcript_updated"],
          post_call_analysis_data: PLUMBER_OUTREACH_POST_CALL,
          post_call_analysis_model: "gpt-4.1-mini",
        });
        agentVersion = parseInt(updated.version, 10) || 0;
      }
    } catch (e) {
      agentId = "";
    }
  }

  if (!agentId) {
    const llm = await retellFetch(env, "POST", "/create-retell-llm", {
      general_prompt: outreachPrompt,
      begin_message: PLUMBER_OUTREACH_BEGIN,
      general_tools: tools,
    });
    llmId = llm.llm_id;
    const created = await retellFetch(env, "POST", "/create-agent", {
      agent_name: "IE Plumber Outreach",
      voice_id: "retell-Cimo",
      response_engine: { type: "retell-llm", llm_id: llmId },
      webhook_url: webhookUrl,
      webhook_events: ["call_started", "call_ended", "call_analyzed", "transcript_updated"],
      post_call_analysis_data: PLUMBER_OUTREACH_POST_CALL,
      post_call_analysis_model: "gpt-4.1-mini",
    });
    agentId = created.agent_id;
    agentVersion = parseInt(created.version, 10) || 0;
  }

  if (agentVersion > 0) {
    try {
      await retellFetch(env, "POST", "/publish-agent-version/" + agentId, { version: agentVersion });
    } catch (e) {
      /* ok */
    }
  }

  await setPlumberOutreachConfig(env, "agent_id", agentId);
  await setPlumberOutreachConfig(env, "webhook_url", webhookUrl);
  await setPlumberOutreachConfig(env, "hot_lead_url", hotLeadUrl);

  return json({
    ok: true,
    agent_id: agentId,
    from_number: env.RETELL_FROM_NUMBER,
    webhook_url: webhookUrl,
    hot_lead_url: hotLeadUrl,
    transfer_phone: env.PLUMBER_OUTREACH_TRANSFER_PHONE || env.LAB_VERIFY_NOTIFY_PHONE || null,
  });
}

async function placePlumberOutreachCall(env, lead, extraMeta) {
  if (!env.RETELL_API_KEY || !env.RETELL_FROM_NUMBER) throw new Error("Retell not configured");
  await ensurePlumberOutreachSchema(env);
  const agentId = (await getPlumberOutreachConfig(env, "agent_id")) || String(env.RETELL_PLUMBER_AGENT_ID || "").trim();
  if (!agentId) throw new Error("Plumber outreach agent not set up");

  const hasWebsite = !!(lead.has_website || lead.website);
  const website = String(lead.website || "").trim();
  const payload = {
    from_number: env.RETELL_FROM_NUMBER,
    to_number: formatPhoneE164(lead.phone),
    override_agent_id: agentId,
    retell_llm_dynamic_variables: {
      company_name: String(lead.company_name || ""),
      city: String(lead.city || ""),
      has_website_label: hasWebsite ? "yes" : "no",
      website_or_none: website || "none listed on Google",
      transfer_phone: String(env.PLUMBER_OUTREACH_TRANSFER_PHONE || env.LAB_VERIFY_NOTIFY_PHONE || ""),
    },
    metadata: {
      campaign: "plumber_outreach",
      company_name: String(lead.company_name || ""),
      slug: String(lead.slug || slugifyPreviewName(lead.company_name, lead.city) || ""),
      address: String(lead.address || ""),
      website: website,
      city: String(lead.city || ""),
      ...(extraMeta || {}),
    },
  };

  const data = await retellFetch(env, "POST", "/v2/create-phone-call", payload);
  const callId = data.call_id || data.id;
  await env.DB.prepare(
    `INSERT INTO plumber_outreach_calls (call_id, company_name, phone, city, has_website, website, status, placed_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'placed', datetime('now'), datetime('now'))
     ON CONFLICT(call_id) DO UPDATE SET updated_at = datetime('now')`
  )
    .bind(
      callId,
      String(lead.company_name || ""),
      String(lead.phone || ""),
      String(lead.city || ""),
      hasWebsite ? 1 : 0,
      website
    )
    .run();
  return { call_id: callId };
}

async function sendPlumberOneMinuteAlert(env, callId, call, meta) {
  if (!callId) return { skipped: true, reason: "no_call_id" };
  await ensurePlumberOutreachSchema(env);
  const row = await env.DB.prepare("SELECT * FROM plumber_outreach_calls WHERE call_id = ?1").bind(callId).first();
  if (!row) return { skipped: true, reason: "call_not_found" };
  if (row.alert_email_sent) return { skipped: true, reason: "already_sent" };

  const startMs =
    (call && Number(call.start_timestamp)) ||
    (row.call_started_at ? new Date(row.call_started_at).getTime() : NaN) ||
    (row.placed_at ? new Date(row.placed_at).getTime() : NaN);
  if (!Number.isFinite(startMs)) return { skipped: true, reason: "no_start_time" };
  if (Date.now() - startMs < 60000) return { skipped: true, reason: "under_one_minute" };

  const company = row.company_name || meta.company_name || "Prospect";
  const city = row.city || meta.city || "";
  const phone = row.phone || call?.to_number || "";
  const website = String(row.website || meta.website || "").trim();
  const slug =
    meta.slug ||
    slugifyPreviewName(company, city) ||
    String(meta.item_id || callId).replace(/\W/g, "").slice(0, 40);

  let publishInfo = null;
  if (typeof queuePlumberPublish === "function") {
    try {
      publishInfo = await queuePlumberPublish(env, {
        call_id: callId,
        slug,
        company_name: company,
        phone,
        city,
        address: meta.address || "",
      });
    } catch (e) {
      publishInfo = { error: String(e.message || e) };
    }
  }

  const dashboardUrl =
    (publishInfo && publishInfo.publish_page_url) ||
    (typeof dashboardPublishUrl === "function" ? dashboardPublishUrl(env, callId) : "");

  const websiteLine = website
    ? `<p><strong>Current website:</strong> <a href="${website.replace(/"/g, "")}">${website}</a></p>`
    : "<p><strong>Current website:</strong> none listed on Google</p>";

  const subject = `Live call 1+ min — ${company}${city ? ` (${city})` : ""} — callback if hot`;
  const text =
    `Alex has been on a call with ${company}${city ? ` in ${city}` : ""} for over a minute.\n\n` +
    `Call or text them back if they become a hot lead (live transfer is off).\n\n` +
    `Plumber phone: ${phone || "—"}\n` +
    `Current website: ${website || "none listed"}\n\n` +
    `Open prospect dashboard: ${dashboardUrl}\n\n` +
    `Build their preview site from the dashboard before they ask to see it.`;

  const html =
    `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;color:#0f172a">` +
    `<h2 style="margin:0 0 0.5rem">Call running 1+ minute</h2>` +
    `<p style="color:#475569">Alex is still on the line with <strong>${company}</strong>` +
    (city ? ` in <strong>${city}</strong>` : "") +
    `. If they want the preview, text or call them back — Alex will not transfer the live call.</p>` +
    `<p><strong>Plumber phone:</strong> ${phone || "—"}</p>` +
    websiteLine +
    `<p style="margin:1.25rem 0"><a href="${dashboardUrl}" style="display:inline-block;background:#059669;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:700">Open prospect dashboard</a></p>` +
    `<p style="font-size:0.85rem;color:#64748b">Build their new site from the dashboard, then text them the preview link while you are on the call.</p></div>`;

  let email = { sent: false };
  if (typeof sendOutreachEmail === "function") {
    email = await sendOutreachEmail(env, { subject, text, html });
  }

  await env.DB.prepare(
    "UPDATE plumber_outreach_calls SET alert_email_sent = 1, status = 'in_progress', updated_at = datetime('now') WHERE call_id = ?1"
  )
    .bind(callId)
    .run();

  return { sent: true, email, publish: publishInfo, dashboard_url: dashboardUrl };
}

async function maybePlumberOneMinuteAlert(env, call, meta, ctx) {
  const callId = call.call_id;
  if (!callId) return;
  ctx.waitUntil(
    sendPlumberOneMinuteAlert(env, callId, call, meta).catch((e) => {
      console.error("plumber 1min alert", callId, e);
    })
  );
}

async function processPlumberActiveCallAlerts(env) {
  await ensurePlumberOutreachSchema(env);
  const rows = await env.DB.prepare(
    `SELECT * FROM plumber_outreach_calls
     WHERE alert_email_sent = 0 AND status IN ('placed', 'in_progress')
       AND (
         (call_started_at IS NOT NULL AND datetime(call_started_at) <= datetime('now', '-60 seconds'))
         OR (call_started_at IS NULL AND placed_at IS NOT NULL AND datetime(placed_at) <= datetime('now', '-60 seconds'))
       )`
  ).all();
  const results = [];
  for (const row of rows.results || []) {
    results.push(await sendPlumberOneMinuteAlert(env, row.call_id, { start_timestamp: Date.now() - 61000 }, {}));
  }
  return results;
}

async function handlePlumberSendPreviewSms(request, env) {
  const body = await request.json().catch(() => ({}));
  if (!(await authorizePlumberPublishRequest(request, env, body))) return json({ error: "Unauthorized" }, 401);
  const callId = String(body.call_id || "").trim();
  if (!callId) return json({ error: "call_id required" }, 400);

  await ensurePreviewPublishSchema(env);
  const row = await env.DB.prepare("SELECT * FROM plumber_publish_queue WHERE call_id = ?1").bind(callId).first();
  if (!row) return json({ error: "Publish queue entry not found — build the site first" }, 404);

  const site = await env.DB.prepare("SELECT preview_url FROM preview_sites WHERE slug = ?1").bind(row.slug).first();
  const previewUrl = row.preview_url || site?.preview_url;
  if (!previewUrl) return json({ error: "Preview not published yet — tap Build their new site first" }, 400);

  const toPhone = String(body.to || row.phone || "").trim();
  if (!toPhone) return json({ error: "No plumber phone on file" }, 400);

  const company = row.company_name || "your business";
  const defaultMsg = `Hi — Alex from Solena Digital here. As promised, here's the preview site we built for ${company}: ${previewUrl}`;
  const message = String(body.message || defaultMsg).slice(0, 320);

  if (typeof sendTwilioSms !== "function") return json({ error: "SMS not configured" }, 503);
  const sms = await sendTwilioSms(env, toPhone, message);
  return json({ ok: !!sms.sent, sms, preview_url: previewUrl, to: toPhone });
}

async function handlePlumberOutreachHotLead(request, env) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-retell-signature") || request.headers.get("X-Retell-Signature");
  if (env.RETELL_API_KEY) {
    const valid = await verifyRetellWebhook(rawBody, env.RETELL_API_KEY, signature);
    if (!valid) return json({ error: "Invalid signature" }, 401);
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (e) {
    return json({ error: "Invalid JSON" }, 400);
  }

  const args = payload.args || {};
  const call = payload.call || {};
  const meta = call.metadata || {};
  const company = meta.company_name || call.retell_llm_dynamic_variables?.company_name || "Unknown plumber";
  const city = call.retell_llm_dynamic_variables?.city || "";
  const phone = call.to_number || "";
  const interest = String(args.interest_level || "high");
  const notes = String(args.notes || "").trim();
  const callId = call.call_id || "";

  let publishInfo = null;
  if (callId && typeof queuePlumberPublish === "function") {
    const slug =
      meta.slug ||
      slugifyPreviewName(company, city) ||
      String(meta.item_id || callId).replace(/\W/g, "").slice(0, 40);
    try {
      publishInfo = await queuePlumberPublish(env, {
        call_id: callId,
        slug,
        company_name: company,
        phone,
        city,
        address: meta.address || "",
      });
    } catch (e) {
      publishInfo = { error: String(e.message || e) };
    }
  }

  const notifyPhone = env.PLUMBER_OUTREACH_NOTIFY_PHONE || env.LAB_VERIFY_NOTIFY_PHONE;
  let sms = { sent: false };
  const playbook = await getOutreachPlaybook(env);
  const interestedPath = (playbook.paths || []).find((p) => p.id === "interested") || {};
  const shouldSms = interestedPath.actions?.notify_owner_sms !== false;
  if (notifyPhone && shouldSms && typeof sendTwilioSms === "function") {
    const notesLine = notes ? "\n" + notes : "";
    const body = fillOutreachTemplate(interestedPath.sms_template || getDefaultOutreachPlaybook().paths[0].sms_template, {
      company_name: company,
      city: city || "",
      phone: phone || "",
      interest_level: interest,
      notes_line: notesLine,
      notes: notes || "",
      publish_url: publishInfo?.publish_page_url || "",
    }).slice(0, 320);
    sms = await sendTwilioSms(env, notifyPhone, body);
  }

  return json({
    success: true,
    message: "Owner notified. End the call with end_call — they will text or call the plumber back.",
    sms,
    publish: publishInfo,
  });
}

async function handlePlumberOutreachWebhook(request, env, ctx) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-retell-signature") || request.headers.get("X-Retell-Signature");
  if (env.RETELL_API_KEY) {
    const valid = await verifyRetellWebhook(rawBody, env.RETELL_API_KEY, signature);
    if (!valid) return json({ error: "Invalid signature" }, 401);
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (e) {
    return json({ error: "Invalid JSON" }, 400);
  }

  const event = payload.event;
  const call = payload.call || {};
  const meta = call.metadata || {};
  if (meta.campaign !== "plumber_outreach") return new Response(null, { status: 204 });

  await ensurePlumberOutreachSchema(env);
  const callId = call.call_id;
  if (!callId) return new Response(null, { status: 204 });

  if (event === "call_started") {
    await env.DB.prepare(
      "UPDATE plumber_outreach_calls SET status = 'in_progress', call_started_at = datetime('now'), updated_at = datetime('now') WHERE call_id = ?1"
    )
      .bind(callId)
      .run();
    return new Response(null, { status: 204 });
  }

  if (event === "transcript_updated" || event === "call_ended") {
    await maybePlumberOneMinuteAlert(env, call, meta, ctx);
  }

  if (event === "call_analyzed") {
    const analysis = call.call_analysis || {};
    const custom = analysis.custom_analysis_data || analysis;
    const outcome = custom.call_outcome || "";
    const contactName = custom.contact_name || "";
    const summary = custom.call_summary || "";
    await env.DB.prepare(
      `UPDATE plumber_outreach_calls SET call_outcome = ?2, contact_name = ?3, call_summary = ?4, status = 'done', updated_at = datetime('now') WHERE call_id = ?1`
    )
      .bind(callId, outcome, contactName, summary)
      .run();
    const itemId = meta.item_id;
    if (itemId) {
      await env.DB.prepare(
        `UPDATE plumber_outreach_campaign_items SET status = 'done', call_outcome = ?2, contact_name = ?3, call_summary = ?4, updated_at = datetime('now') WHERE id = ?1`
      )
        .bind(itemId, outcome, contactName, summary)
        .run();
      if (meta.campaign_id) {
        await env.DB.prepare(
          `UPDATE plumber_outreach_campaigns SET active_item_id = NULL, active_call_id = NULL, next_call_at = datetime('now'), updated_at = datetime('now') WHERE id = ?1`
        )
          .bind(meta.campaign_id)
          .run();
        ctx.waitUntil(processPlumberOutreachCampaignTick(env));
      }
    }
  }

  return new Response(null, { status: 204 });
}

async function getActivePlumberCampaign(env) {
  return env.DB.prepare("SELECT * FROM plumber_outreach_campaigns WHERE status = 'running' ORDER BY created_at DESC LIMIT 1").first();
}

async function processPlumberOutreachCampaignTick(env) {
  await ensurePlumberOutreachSchema(env);
  const campaign = await getActivePlumberCampaign(env);
  if (!campaign) return { ok: true, action: "no_active_campaign" };

  if (campaign.active_item_id && campaign.active_call_id) {
    return { ok: true, action: "call_in_progress", call_id: campaign.active_call_id };
  }

  const nextItem = await env.DB.prepare(
    "SELECT * FROM plumber_outreach_campaign_items WHERE campaign_id = ?1 AND status = 'pending' ORDER BY sort_order ASC LIMIT 1"
  )
    .bind(campaign.id)
    .first();

  if (!nextItem) {
    await env.DB.prepare("UPDATE plumber_outreach_campaigns SET status = 'complete', updated_at = datetime('now') WHERE id = ?1")
      .bind(campaign.id)
      .run();
    return { ok: true, action: "campaign_complete" };
  }

  if (!nextItem.phone || isTollFreePhone(nextItem.phone)) {
    await env.DB.prepare("UPDATE plumber_outreach_campaign_items SET status = 'skipped', updated_at = datetime('now') WHERE id = ?1")
      .bind(nextItem.id)
      .run();
    return processPlumberOutreachCampaignTick(env);
  }

  try {
    formatPhoneE164(nextItem.phone);
  } catch (e) {
    await env.DB.prepare("UPDATE plumber_outreach_campaign_items SET status = 'skipped', updated_at = datetime('now') WHERE id = ?1")
      .bind(nextItem.id)
      .run();
    return processPlumberOutreachCampaignTick(env);
  }

  const placed = await placePlumberOutreachCall(env, nextItem, {
    campaign_id: campaign.id,
    item_id: String(nextItem.id),
  });

  await env.DB.prepare("UPDATE plumber_outreach_campaign_items SET status = 'calling', call_id = ?2, updated_at = datetime('now') WHERE id = ?1")
    .bind(nextItem.id, placed.call_id)
    .run();
  await env.DB.prepare(
    "UPDATE plumber_outreach_campaigns SET active_item_id = ?2, active_call_id = ?3, next_call_at = NULL, updated_at = datetime('now') WHERE id = ?1"
  )
    .bind(campaign.id, nextItem.id, placed.call_id)
    .run();

  return { ok: true, action: "placed_call", company_name: nextItem.company_name, call_id: placed.call_id };
}

async function handlePlumberOutreachCampaignStart(request, env) {
  await ensurePlumberOutreachSchema(env);
  const body = await request.json().catch(() => ({}));
  let leads = body.leads;
  if (!Array.isArray(leads) || !leads.length) return json({ error: "leads array required" }, 400);

  const usePriority =
    body.filter === "priority_no_website" || body.priority_only === true || body.priority_only === "1";
  if (usePriority) {
    leads = filterPriorityLeads(leads);
    if (!leads.length) return json({ error: "No priority leads (need no-website, non-toll-free phones)" }, 400);
  }

  try {
    await syncPlumberOutreachAgentPrompt(env);
  } catch (e) {
    console.warn("playbook sync before campaign", e);
  }

  await env.DB.prepare("UPDATE plumber_outreach_campaigns SET status = 'paused', updated_at = datetime('now') WHERE status = 'running'").run();

  const campaignId = "poc_" + Date.now();
  const name = String(body.name || (usePriority ? "IE priority — no website" : "IE plumber outreach"));
  await env.DB.prepare(
    "INSERT INTO plumber_outreach_campaigns (id, name, status, next_call_at) VALUES (?1, ?2, 'paused', NULL)"
  )
    .bind(campaignId, name)
    .run();

  let n = 0;
  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    if (!lead.phone) continue;
    await env.DB.prepare(
      `INSERT INTO plumber_outreach_campaign_items
       (campaign_id, sort_order, company_name, phone, address, city, state, zip, website, slug, has_website)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
    )
      .bind(
        campaignId,
        lead.sort_order ?? i + 1,
        String(lead.company_name || ""),
        String(lead.phone || ""),
        String(lead.address || ""),
        String(lead.city || ""),
        String(lead.state || "CA"),
        String(lead.zip || ""),
        String(lead.website || ""),
        String(lead.slug || slugifyPreviewName(lead.company_name, lead.city) || ""),
        lead.has_website ? 1 : 0
      )
      .run();
    n++;
  }

  return json({
    ok: true,
    campaign_id: campaignId,
    items: n,
    filtered: usePriority,
    status: "paused",
    message: "Campaign loaded — no calls placed. POST /campaign/resume when ready to dial.",
  });
}

async function handlePlumberOutreachCampaignResume(request, env) {
  await ensurePlumberOutreachSchema(env);
  const body = await request.json().catch(() => ({}));
  const campaignId = String(body.campaign_id || "").trim();

  let campaign;
  if (campaignId) {
    campaign = await env.DB.prepare("SELECT * FROM plumber_outreach_campaigns WHERE id = ?1").bind(campaignId).first();
  } else {
    campaign = await env.DB.prepare(
      "SELECT * FROM plumber_outreach_campaigns WHERE status = 'paused' ORDER BY created_at DESC LIMIT 1"
    ).first();
  }

  if (!campaign) return json({ error: "No paused campaign to resume" }, 404);
  if (campaign.status === "complete") return json({ error: "Campaign already complete" }, 400);
  if (campaign.status === "running") {
    return json({ ok: true, campaign_id: campaign.id, status: "running", already_running: true });
  }

  await env.DB.prepare("UPDATE plumber_outreach_campaigns SET status = 'paused', updated_at = datetime('now') WHERE status = 'running'")
    .run();
  await env.DB.prepare(
    "UPDATE plumber_outreach_campaigns SET status = 'running', next_call_at = datetime('now'), updated_at = datetime('now') WHERE id = ?1"
  )
    .bind(campaign.id)
    .run();

  const tick = await processPlumberOutreachCampaignTick(env);
  return json({ ok: true, campaign_id: campaign.id, status: "running", tick });
}

async function handlePlumberOutreachCampaignPause(request, env) {
  await ensurePlumberOutreachSchema(env);
  await env.DB.prepare("UPDATE plumber_outreach_campaigns SET status = 'paused', updated_at = datetime('now') WHERE status = 'running'").run();
  return json({ ok: true, paused: true });
}

async function handlePlumberOutreachCampaignStatus(request, env) {
  await ensurePlumberOutreachSchema(env);
  const campaign = await getActivePlumberCampaign(env);
  if (!campaign) {
    const last = await env.DB.prepare("SELECT * FROM plumber_outreach_campaigns ORDER BY created_at DESC LIMIT 1").first();
    return json({ active: false, last_campaign: last || null });
  }
  const counts = await env.DB.prepare(
    "SELECT status, COUNT(*) AS n FROM plumber_outreach_campaign_items WHERE campaign_id = ?1 GROUP BY status"
  )
    .bind(campaign.id)
    .all();
  return json({ active: true, campaign, counts: counts.results || [] });
}

async function handlePlumberOutreachCampaignCron(env) {
  await processPlumberActiveCallAlerts(env);
  return processPlumberOutreachCampaignTick(env);
}
