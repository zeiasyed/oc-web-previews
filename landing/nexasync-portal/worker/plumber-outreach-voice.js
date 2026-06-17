/** Inland Empire plumber outreach — Retell campaign (concatenated into index.js at deploy) */

const PLUMBER_OUTREACH_VOICE_ID = "cartesia-Ethan";

function plumberOutreachVoiceId(env) {
  return String(env.PLUMBER_OUTREACH_VOICE_ID || PLUMBER_OUTREACH_VOICE_ID).trim();
}

/** Retell agent voice tuning — natural conversational pace (not slowed). */
function plumberOutreachVoiceSettings(env, voiceIdOverride) {
  const voiceId = String(voiceIdOverride || plumberOutreachVoiceId(env)).trim();
  const settings = {
    voice_id: voiceId,
    voice_speed: parseFloat(env.PLUMBER_OUTREACH_VOICE_SPEED || "1") || 1,
    voice_temperature: parseFloat(env.PLUMBER_OUTREACH_VOICE_TEMPERATURE || "0.85") || 0.85,
    enable_dynamic_voice_speed: false,
    enable_dynamic_responsiveness: true,
    responsiveness: parseFloat(env.PLUMBER_OUTREACH_RESPONSIVENESS || "0.9") || 0.9,
    interruption_sensitivity: parseFloat(env.PLUMBER_OUTREACH_INTERRUPTION || "0.55") || 0.55,
    enable_backchannel: false,
    fallback_voice_ids: ["11labs-Brian"],
  };
  const model = String(env.PLUMBER_OUTREACH_VOICE_MODEL || "").trim();
  if (voiceId.startsWith("11labs-")) {
    settings.voice_model = model || "eleven_turbo_v2_5";
  }
  return settings;
}

const PLUMBER_MALE_VOICE_PREFER = [
  "cartesia-Ethan",
  "cartesia-Andrew",
  "cartesia-Jason",
  "retell-Nico",
  "openai-echo",
  "openai-Echo",
  "11labs-Daniel",
  "11labs-Eric",
  "11labs-George",
  "11labs-Charlie",
  "11labs-Brian",
];

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

function parseOpeningSegments(opening) {
  const text = String(opening || "").trim();
  if (!text) return [];
  return text
    .split(
      /\s*[\(\[\{](?:\s*wait(?:\s+for\s+(?:response|them|human))?\s*|\s*pause\s*)[\)\]\}]|\s*(?:^|\n)\s*(?:wait|pause)\s*(?:\n|$)\s*/gi
    )
    .map((s) => s.replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, "").trim())
    .filter(Boolean);
}

const PLUMBER_OPENING_MAX_STEPS = 8;

function buildOpeningDynamicVariables(opening, templateVars) {
  const filled = fillOutreachTemplate(opening, templateVars);
  const segments = parseOpeningSegments(filled);
  const vars = {
    opening_step_count: String(segments.length || 0),
    opening_first_line: segments[0] || "",
    opening_line: segments[0] || "",
    opening_script: segments.join(" "),
  };
  for (let i = 0; i < PLUMBER_OPENING_MAX_STEPS; i++) {
    vars["opening_step_" + (i + 1)] = segments[i] || "";
  }
  return vars;
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

  const stepLines = [];
  for (let i = 2; i <= PLUMBER_OPENING_MAX_STEPS; i++) {
    stepLines.push(`- After they respond, if opening step ${i} is non-empty, say it verbatim: "{{opening_step_${i}}}" — then go silent until they speak again.`);
  }

  return `You are ${pb.agent_persona}, calling from ${pb.company_label} — a local web team in Southern California.

You are calling {{company_name}} in {{city}}, CA about getting them more plumbing calls from Google.

Context for this business:
- Has website on file: {{has_website_label}}
- Website: {{website_or_none}}

## Voice
${pb.voice_style}

## Opening (after a live human answers — not during IVR)
WAIT for the live person to speak first ("hello", "how can I help you", company name, etc.). Do NOT talk before they greet you. Never pitch during hold music, IVR, or right when the line connects.

After they have spoken, say part 1 verbatim: "{{opening_step_1}}" — then go silent until they speak again.

If {{opening_step_count}} is greater than 1, deliver the remaining parts ONE AT A TIME — only after the caller has responded since your last spoken line:
${stepLines.join("\n")}

Opening delivery rules (critical):
- Say only the spoken words — never say "wait", "pause", "(anything)", line numbers, "step", or "opening"
- Never read stage directions, separators, or instructions aloud
- Do not combine multiple parts in one turn
- Do not paraphrase — same words, same order

## IVR rules
${pb.ivr_rules}

${pathBlocks}

## Rules
${pb.general_rules}`;
}

function fillOutreachTemplate(template, vars) {
  return String(template || "").replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ""));
}

/** Legacy helper — returns flat text for logging/inspect only (no stage directions). */
function formatOpeningLineForCall(opening) {
  return parseOpeningSegments(opening).join(" / ");
}

function playbookOpeningFingerprint(opening) {
  let h = 2166136261;
  const s = String(opening || "").trim();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function isDefaultPlaybookOpening(opening) {
  return String(opening || "").trim() === getDefaultOutreachPlaybook().opening.trim();
}

function openingFirstSegment(opening) {
  const parts = parseOpeningSegments(opening);
  return parts[0] || String(opening || "").trim();
}

async function getPlaybookIntegrity(env) {
  return {
    fingerprint: (await getPlumberOutreachConfig(env, "playbook_opening_fingerprint")) || null,
    saved_at: (await getPlumberOutreachConfig(env, "playbook_saved_at")) || null,
    saved_via: (await getPlumberOutreachConfig(env, "playbook_saved_via")) || null,
  };
}

async function ensurePlaybookIntegrityBackfill(env, playbook) {
  const integrity = await getPlaybookIntegrity(env);
  if (integrity.fingerprint || !playbook?.opening) return integrity;
  const fp = playbookOpeningFingerprint(playbook.opening);
  await setPlumberOutreachConfig(env, "playbook_opening_fingerprint", fp);
  await setPlumberOutreachConfig(env, "playbook_saved_at", new Date().toISOString());
  await setPlumberOutreachConfig(env, "playbook_saved_via", "backfill");
  await recordPlaybookAudit(env, "backfill", playbook.opening, "fingerprint backfill for existing script");
  return { fingerprint: fp, saved_at: new Date().toISOString(), saved_via: "backfill" };
}

async function recordPlaybookAudit(env, action, opening, detail) {
  await ensurePlumberOutreachSchema(env);
  try {
    await env.DB.prepare(
      `INSERT INTO plumber_playbook_audit (action, opening_preview, detail, created_at)
       VALUES (?1, ?2, ?3, datetime('now'))`
    )
      .bind(String(action || "save"), String(opening || "").slice(0, 500), String(detail || ""))
      .run();
  } catch (e) {
    /* audit optional */
  }
}

async function assertPlaybookReadyForCall(env, playbook) {
  const opening = String(playbook.opening || "").trim();
  if (opening.length < 15) {
    throw new Error("Playbook opening too short — save your script on the dashboard before dialing");
  }
  await ensurePlaybookIntegrityBackfill(env, playbook);
  const integrity = await getPlaybookIntegrity(env);
  if (!integrity.fingerprint) {
    throw new Error("Script not locked in — open Outreach script, click Save & sync agent, then dial");
  }
  const current = playbookOpeningFingerprint(opening);
  if (current !== integrity.fingerprint) {
    throw new Error(
      "Script changed since last save — open Outreach script and click Save & sync agent (never use Reset unless intentional)"
    );
  }
  if (isDefaultPlaybookOpening(opening)) {
    throw new Error("Opening is still the factory default — write your script and save before dialing");
  }
  return { fingerprint: current, saved_at: integrity.saved_at, opening_preview: openingFirstSegment(opening).slice(0, 120) };
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

async function saveOutreachPlaybook(env, playbook, meta) {
  const normalized = normalizeOutreachPlaybook(playbook);
  const opening = String(normalized.opening || "").trim();
  if (!opening || opening.length < 10) {
    throw new Error("Opening pitch cannot be empty — your script was not saved");
  }
  await setPlumberOutreachConfig(env, "playbook_json", JSON.stringify(normalized));
  const fp = playbookOpeningFingerprint(opening);
  await setPlumberOutreachConfig(env, "playbook_opening_fingerprint", fp);
  await setPlumberOutreachConfig(env, "playbook_saved_at", new Date().toISOString());
  await setPlumberOutreachConfig(env, "playbook_saved_via", meta?.via || "dashboard");
  await recordPlaybookAudit(env, meta?.action || "save", opening, meta?.detail || "");
  return normalized;
}

async function resolvePlumberOutreachAgentId(env) {
  const configured =
    (await getPlumberOutreachConfig(env, "agent_id")) || String(env.RETELL_PLUMBER_AGENT_ID || "").trim();
  if (configured && typeof retellFetch === "function") {
    try {
      const detail = await retellFetch(env, "GET", "/get-agent/" + configured, null);
      if (String(detail.agent_name || "").toLowerCase().includes("plumber")) {
        return { agent_id: configured, agent_name: detail.agent_name, source: "config" };
      }
    } catch (e) {
      /* try list */
    }
  }
  if (typeof retellFetch !== "function") {
    return configured ? { agent_id: configured, agent_name: null, source: "config_fallback" } : null;
  }
  try {
    const agents = await retellFetch(env, "GET", "/list-agents", null);
    const list = Array.isArray(agents) ? agents : [];
    const plumber =
      list.find((a) => String(a.agent_name || "").toLowerCase() === "ie plumber outreach") ||
      list.find((a) => String(a.agent_name || "").toLowerCase().includes("plumber outreach")) ||
      list.find((a) => String(a.agent_name || "").toLowerCase().includes("plumber"));
    if (plumber?.agent_id) {
      await setPlumberOutreachConfig(env, "agent_id", plumber.agent_id);
      return { agent_id: plumber.agent_id, agent_name: plumber.agent_name, source: "list-agents" };
    }
  } catch (e) {
    /* ok */
  }
  return configured ? { agent_id: configured, agent_name: null, source: "config_unverified" } : null;
}

async function fetchPlumberRetellLlmPrompt(env, agentId) {
  const detail = await retellFetch(env, "GET", "/get-agent/" + agentId, null);
  const llmId = detail.response_engine?.llm_id;
  if (!llmId) return { agent: detail, llm: null };
  const llm = await retellFetch(env, "GET", "/get-retell-llm/" + llmId, null);
  return { agent: detail, llm };
}

async function handlePlumberOutreachAgentDebug(request, env) {
  await ensurePlumberOutreachSchema(env);
  const resolved = await resolvePlumberOutreachAgentId(env);
  if (!resolved?.agent_id) return json({ ok: false, error: "No plumber outreach agent configured" }, 404);
  const playbook = await getOutreachPlaybook(env);
  const expectedPrompt = buildPlumberPromptFromPlaybook(playbook);
  let retell = null;
  try {
    retell = await fetchPlumberRetellLlmPrompt(env, resolved.agent_id);
  } catch (e) {
    retell = { error: String(e.message || e) };
  }
  const livePrompt = retell?.llm?.general_prompt || "";
  const opening = String(playbook.opening || "");
  return json({
    ok: true,
    agent: {
      id: resolved.agent_id,
      name: resolved.agent_name || retell?.agent?.agent_name || null,
      source: resolved.source,
      voice_id: retell?.agent?.voice_id || null,
      version: retell?.agent?.version ?? null,
    },
    playbook_opening: opening,
    prompts_match: livePrompt.length > 0 && livePrompt.includes(opening.slice(0, 40)),
    opening_on_retell: livePrompt.includes(opening),
    retell_prompt_excerpt: livePrompt.slice(0, 600),
    expected_prompt_excerpt: expectedPrompt.slice(0, 600),
    begin_message: retell?.llm?.begin_message ?? null,
  });
}

async function fetchPlumberPhoneNumberConfig(env) {
  if (!env.RETELL_FROM_NUMBER || typeof retellFetch !== "function") return null;
  try {
    const data = await retellFetch(env, "GET", "/v2/list-phone-numbers?limit=50", null);
    const items = data?.items || data || [];
    const list = Array.isArray(items) ? items : [];
    return list.find((n) => n.phone_number === env.RETELL_FROM_NUMBER) || null;
  } catch (e) {
    return null;
  }
}

async function ensurePlumberOutreachPhoneBinding(env, agentId) {
  if (!env.RETELL_FROM_NUMBER || !agentId || typeof retellFetch !== "function") {
    return { ok: false, reason: "missing_phone_or_agent" };
  }
  const phone = encodeURIComponent(env.RETELL_FROM_NUMBER);
  try {
    await retellFetch(env, "PATCH", "/update-phone-number/" + phone, {
      outbound_agents: [{ agent_id: agentId, weight: 1 }],
    });
    const cfg = await fetchPlumberPhoneNumberConfig(env);
    const bound = (cfg?.outbound_agents || []).map((a) => a.agent_id);
    return {
      ok: bound.includes(agentId) && bound.length === 1,
      phone_number: env.RETELL_FROM_NUMBER,
      outbound_agents: cfg?.outbound_agents || [],
    };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

async function fetchRetellCallInspect(env, callId) {
  const detail = await retellFetch(env, "GET", "/v2/get-call/" + callId, null);
  const transcript = detail.transcript || detail.transcript_object || "";
  const agentUtterances = [];
  if (Array.isArray(detail.transcript_object)) {
    for (const t of detail.transcript_object) {
      if (t.role === "agent" || t.speaker === "agent") {
        agentUtterances.push(t.content || t.text || "");
      }
    }
  } else if (typeof transcript === "string") {
    transcript.split("\n").forEach((line) => {
      if (/^agent:/i.test(line)) agentUtterances.push(line.replace(/^agent:\s*/i, ""));
    });
  }
  return {
    call_id: callId,
    agent_id: detail.agent_id || detail.override_agent_id || null,
    agent_name: detail.agent_name || null,
    disconnection_reason: detail.disconnection_reason || null,
    first_agent_line: agentUtterances[0] || "",
    agent_lines: agentUtterances.slice(0, 5),
    transcript_excerpt: typeof transcript === "string" ? transcript.slice(0, 1200) : JSON.stringify(transcript).slice(0, 1200),
    recording_url: detail.recording_url || detail.recording_multi_channel_url || null,
  };
}

async function fetchAndStoreCallRecording(env, callId) {
  if (!callId || !env.RETELL_API_KEY) return null;
  try {
    const detail = await retellFetch(env, "GET", "/v2/get-call/" + callId, null);
    const url = detail.recording_url || detail.recording_multi_channel_url || null;
    if (url) {
      await env.DB.prepare(
        "UPDATE plumber_outreach_calls SET recording_url = ?2, updated_at = datetime('now') WHERE call_id = ?1"
      )
        .bind(callId, url)
        .run();
    }
    return url;
  } catch (e) {
    return null;
  }
}

async function handlePlumberOutreachCallRecording(request, env) {
  const callId = new URL(request.url).searchParams.get("call_id") || "";
  if (!callId) return json({ error: "call_id required" }, 400);
  await ensurePlumberOutreachSchema(env);
  const row = await env.DB.prepare(
    "SELECT recording_url, status FROM plumber_outreach_calls WHERE call_id = ?1"
  )
    .bind(callId)
    .first();
  if (row?.recording_url) {
    return json({ ok: true, call_id: callId, recording_url: row.recording_url });
  }
  const url = await fetchAndStoreCallRecording(env, callId);
  if (!url) {
    return json({ ok: false, error: "Recording not ready yet — try again in a minute after the call ends" }, 404);
  }
  return json({ ok: true, call_id: callId, recording_url: url });
}

async function handlePlumberOutreachInspectCall(request, env) {
  const callId = new URL(request.url).searchParams.get("call_id") || "";
  if (!callId) return json({ error: "call_id required" }, 400);
  try {
    const inspect = await fetchRetellCallInspect(env, callId);
    const playbook = await getOutreachPlaybook(env);
    const row = await env.DB.prepare("SELECT * FROM plumber_outreach_calls WHERE call_id = ?1").bind(callId).first();
    const expectedOpening = fillOutreachTemplate(playbook.opening, {
      company_name: row?.company_name || "Allstar Plumbing, Heating & Air",
      city: row?.city || "Rancho Cucamonga",
    });
    let agentOnCall = null;
    if (inspect.agent_id) {
      try {
        agentOnCall = await retellFetch(env, "GET", "/get-agent/" + inspect.agent_id, null);
      } catch (e) {
        agentOnCall = { error: String(e.message || e) };
      }
    }
    return json({
      ok: true,
      inspect,
      expected_opening: expectedOpening,
      opening_matches: inspect.first_agent_line && expectedOpening
        ? inspect.first_agent_line.toLowerCase().includes("solena digital") &&
          inspect.first_agent_line.toLowerCase().includes("looking at")
        : false,
      agent_on_call: agentOnCall
        ? { agent_id: inspect.agent_id, agent_name: agentOnCall.agent_name, voice_id: agentOnCall.voice_id }
        : null,
      looks_like_nexa: /nexa|appointment|confirm that time|patient/i.test(inspect.first_agent_line || ""),
    });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 500);
  }
}

function validatePlumberOutreachPreflight(playbook, retell, sync, env, phoneBind, integrity) {
  const livePrompt = retell?.llm?.general_prompt || "";
  const expectedPrompt = buildPlumberPromptFromPlaybook(playbook);
  const opening = String(playbook.opening || "").trim();
  const firstSeg = openingFirstSegment(opening);
  const fp = playbookOpeningFingerprint(opening);
  const checks = [
    { id: "retell_configured", ok: !!env.RETELL_API_KEY, detail: env.RETELL_API_KEY ? "RETELL_API_KEY set" : "Missing RETELL_API_KEY" },
    { id: "from_number", ok: !!env.RETELL_FROM_NUMBER, detail: env.RETELL_FROM_NUMBER || "Missing RETELL_FROM_NUMBER" },
    { id: "sync_ok", ok: !!sync?.ok, detail: sync?.ok ? "Prompt synced to Retell" : sync?.reason || sync?.error || "Sync failed" },
    { id: "agent_plumber", ok: /plumber/i.test(String(retell?.agent?.agent_name || "")), detail: retell?.agent?.agent_name || "Unknown agent" },
    { id: "opening_saved", ok: opening.length > 20, detail: opening.slice(0, 80) + (opening.length > 80 ? "…" : "") },
    {
      id: "script_integrity",
      ok: !!(integrity?.fingerprint && integrity.fingerprint === fp),
      detail: integrity?.fingerprint
        ? "Fingerprint " + fp + " (saved " + (integrity.saved_at || "?") + ")"
        : "No saved fingerprint — click Save & sync agent on dashboard",
    },
    {
      id: "not_factory_default",
      ok: !isDefaultPlaybookOpening(opening),
      detail: isDefaultPlaybookOpening(opening) ? "Still factory default opening" : "Custom script locked in",
    },
    {
      id: "wait_rules",
      ok: !/\(wait\)|\(pause\)|\[WAIT FOR HUMAN\]/i.test(livePrompt) && livePrompt.includes('never say "wait"'),
      detail: "No stage directions in Retell prompt; silent pauses between parts",
    },
    {
      id: "opening_on_retell",
      ok: livePrompt.includes("opening_step_1") && livePrompt.includes("WAIT for the live person"),
      detail: "Multi-part opening; waits for caller greeting before part 1",
    },
    {
      id: "user_speaks_first",
      ok: retell?.llm?.start_speaker === "user" && (retell?.llm?.begin_message === "" || retell?.llm?.begin_message == null),
      detail:
        "start_speaker: " +
        (retell?.llm?.start_speaker || "?") +
        ", begin_message: " +
        JSON.stringify(retell?.llm?.begin_message ?? null),
    },
    { id: "no_nexa_script", ok: !/nexa calling|appointment for|scheduling_outcome/i.test(livePrompt), detail: "Not using Nexa scheduling script" },
    { id: "no_nexasync_intro", ok: !livePrompt.includes("NexaSync"), detail: "Intro says Solena Digital only" },
    { id: "prompts_equal", ok: livePrompt === expectedPrompt, detail: livePrompt === expectedPrompt ? "Retell prompt matches built prompt" : "Prompt drift — re-sync required" },
    { id: "voice_set", ok: !!retell?.agent?.voice_id, detail: retell?.agent?.voice_id || "No voice" },
    {
      id: "phone_outbound_agent",
      ok: !!phoneBind?.ok,
      detail: phoneBind?.ok
        ? "Phone " + (phoneBind.phone_number || "") + " → IE Plumber Outreach only"
        : phoneBind?.error || JSON.stringify(phoneBind?.outbound_agents || "not bound"),
    },
  ];
  const failed = checks.filter((c) => !c.ok);
  return {
    ready: failed.length === 0,
    checks,
    failed: failed.map((c) => c.id),
    agent_id: sync?.agent_id || retell?.agent?.agent_id || null,
    voice_id: sync?.voice_id || retell?.agent?.voice_id || null,
    voice_name: sync?.voice_name || null,
    voice_speed: plumberOutreachVoiceSettings(env, sync?.voice_id).voice_speed,
    from_number: env.RETELL_FROM_NUMBER || null,
    playbook_opening: opening,
    opening_fingerprint: integrity?.fingerprint || fp,
    playbook_saved_at: integrity?.saved_at || null,
    opening_preview: firstSeg.slice(0, 120),
  };
}

async function handlePlumberOutreachPreflight(request, env) {
  await ensurePlumberOutreachSchema(env);
  const playbook = await getOutreachPlaybook(env);
  const integrity = await ensurePlaybookIntegrityBackfill(env, playbook);
  const resolved = await resolvePlumberOutreachAgentId(env);
  let sync = { ok: false, reason: "not_run" };
  try {
    sync = await syncPlumberOutreachAgentPrompt(env);
  } catch (e) {
    sync = { ok: false, error: String(e.message || e), agent_id: resolved?.agent_id || null };
  }
  const agentId = sync.agent_id || resolved?.agent_id || null;
  let retell = null;
  let phoneBind = { ok: false, reason: "not_run" };
  if (agentId) {
    try {
      phoneBind = await ensurePlumberOutreachPhoneBinding(env, agentId);
    } catch (e) {
      phoneBind = { ok: false, error: String(e.message || e) };
    }
    try {
      retell = await fetchPlumberRetellLlmPrompt(env, agentId);
    } catch (e) {
      retell = { error: String(e.message || e) };
    }
  }
  const report = validatePlumberOutreachPreflight(playbook, retell, sync, env, phoneBind, integrity);
  return json({
    ok: report.ready,
    ready_to_dial: report.ready,
    message: report.ready
      ? "Preflight passed — safe to place a live test call."
      : "Preflight failed — fix issues before dialing (no call placed).",
    ...report,
    updated_at: new Date().toISOString(),
  }, report.ready ? 200 : 503);
}

async function patchPlumberOutreachRetellLlm(env, llmId, prompt, tools) {
  return retellFetch(env, "PATCH", "/update-retell-llm/" + llmId, plumberOutreachLlmPayload(prompt, tools));
}

async function syncPlumberOutreachAgentPrompt(env) {
  if (!env.RETELL_API_KEY) return { ok: false, reason: "retell_not_configured" };
  /* Reads playbook from DB only — never writes or resets playbook_json */
  const playbook = await getOutreachPlaybook(env);
  const prompt = buildPlumberPromptFromPlaybook(playbook);
  const resolved = await resolvePlumberOutreachAgentId(env);
  const agentId = resolved?.agent_id;
  if (!agentId) return { ok: false, reason: "agent_not_configured" };
  const detail = await retellFetch(env, "GET", "/get-agent/" + agentId, null);
  let llmId = detail.response_engine?.llm_id;
  if (!llmId) return { ok: false, reason: "llm_not_found" };
  const tools = buildPlumberTools(env, playbook);
  const hotLeadUrl =
    (await getPlumberOutreachConfig(env, "hot_lead_url")) || "https://api.inertia-intel.com/voice/plumber-outreach/hot-lead";
  const custom = tools.find((t) => t.name === "notify_owner_hot_lead");
  if (custom) custom.url = hotLeadUrl;
  const llmPayload = plumberOutreachLlmPayload(prompt, tools);

  let llmSynced = false;
  try {
    await patchPlumberOutreachRetellLlm(env, llmId, prompt, tools);
    llmSynced = true;
  } catch (e) {
    if (!/cannot update published/i.test(String(e.message || e))) throw e;
  }

  if (!llmSynced) {
    const baseVersion = parseInt(detail.version, 10) || 0;
    try {
      await retellFetch(env, "POST", "/create-agent-version/" + agentId, { base_version: baseVersion });
    } catch (e) {
      /* draft may already exist */
    }
    const draft = await retellFetch(env, "GET", "/get-agent/" + agentId, null);
    llmId = draft.response_engine?.llm_id || llmId;
    try {
      await patchPlumberOutreachRetellLlm(env, llmId, prompt, tools);
    } catch (e2) {
      const llm = await retellFetch(env, "POST", "/create-retell-llm", llmPayload);
      llmId = llm.llm_id;
      await retellFetch(env, "PATCH", "/update-agent/" + agentId, {
        response_engine: { type: "retell-llm", llm_id: llmId },
      });
    }
  }

  const picked = await resolvePlumberMaleVoiceId(env, plumberOutreachVoiceId(env));
  const updated = await retellFetch(env, "PATCH", "/update-agent/" + agentId, {
    agent_name: "IE Plumber Outreach",
    ...plumberOutreachVoiceSettings(env, picked.voice_id),
  });
  const agentVersion = parseInt(updated.version, 10) || 0;
  if (agentVersion > 0) {
    try {
      await retellFetch(env, "POST", "/publish-agent-version/" + agentId, { version: agentVersion });
    } catch (e) {
      /* ok */
    }
  } else {
    try {
      await retellFetch(env, "POST", "/publish-agent/" + agentId, {});
    } catch (e) {
      /* legacy publish endpoint */
    }
  }
  return {
    ok: true,
    agent_id: agentId,
    llm_id: llmId,
    agent_version: agentVersion,
    voice_id: picked.voice_id,
    voice_name: picked.voice?.voice_name || null,
    voice_model: plumberOutreachVoiceSettings(env, picked.voice_id).voice_model || null,
  };
}

async function handlePlumberOutreachPlaybookGet(env) {
  const playbook = await getOutreachPlaybook(env);
  const integrity = await ensurePlaybookIntegrityBackfill(env, playbook);
  const opening = String(playbook.opening || "").trim();
  return json({
    ok: true,
    playbook,
    integrity: {
      fingerprint: integrity.fingerprint || playbookOpeningFingerprint(opening),
      saved_at: integrity.saved_at || null,
      saved_via: integrity.saved_via || null,
      locked: !!(integrity.fingerprint && integrity.fingerprint === playbookOpeningFingerprint(opening)),
      is_factory_default: isDefaultPlaybookOpening(opening),
      opening_preview: openingFirstSegment(opening).slice(0, 120),
    },
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
    if (String(body.reset_confirm || "").trim() !== "RESET-PLAYBOOK") {
      return json(
        {
          error: 'Reset blocked — type RESET-PLAYBOOK in reset_confirm to overwrite your saved script with factory defaults',
          required: "RESET-PLAYBOOK",
        },
        403
      );
    }
    const playbook = await saveOutreachPlaybook(env, getDefaultOutreachPlaybook(), {
      action: "reset",
      via: "dashboard",
      detail: "explicit reset with RESET-PLAYBOOK confirm",
    });
    let sync = { ok: false };
    try {
      sync = await syncPlumberOutreachAgentPrompt(env);
    } catch (e) {
      sync = { ok: false, error: String(e.message || e) };
    }
    return json({ ok: true, playbook, sync, integrity: await getPlaybookIntegrity(env) });
  }
  const playbook = await saveOutreachPlaybook(env, body.playbook || body, {
    action: "save",
    via: "dashboard",
    detail: body.note || "",
  });
  let sync = { ok: false };
  try {
    sync = await syncPlumberOutreachAgentPrompt(env);
  } catch (e) {
    sync = { ok: false, error: String(e.message || e) };
  }
  return json({ ok: true, playbook, sync, integrity: await getPlaybookIntegrity(env) });
}

const PLUMBER_OUTREACH_BEGIN = "";

function plumberOutreachLlmPayload(prompt, tools) {
  return {
    general_prompt: prompt,
    begin_message: PLUMBER_OUTREACH_BEGIN,
    start_speaker: "user",
    general_tools: tools,
  };
}

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
    `CREATE TABLE IF NOT EXISTS plumber_playbook_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      opening_preview TEXT,
      detail TEXT,
      created_at TEXT DEFAULT (datetime('now'))
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
  try {
    await env.DB.prepare("ALTER TABLE plumber_outreach_calls ADD COLUMN duration_sec INTEGER").run();
  } catch (e) {
    /* column exists */
  }
  try {
    await env.DB.prepare("ALTER TABLE plumber_outreach_calls ADD COLUMN ended_at TEXT").run();
  } catch (e) {
    /* column exists */
  }
  try {
    await env.DB.prepare("ALTER TABLE plumber_outreach_calls ADD COLUMN recording_url TEXT").run();
  } catch (e) {
    /* column exists */
  }
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS outreach_notify_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      recipient TEXT,
      call_id TEXT,
      label TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`
  ).run();
}

async function logOutreachNotify(env, { kind, recipient, call_id, label }) {
  await ensurePlumberOutreachSchema(env);
  await env.DB.prepare(
    `INSERT INTO outreach_notify_log (kind, recipient, call_id, label, created_at) VALUES (?1, ?2, ?3, ?4, datetime('now'))`
  )
    .bind(String(kind || "notify"), String(recipient || ""), call_id ? String(call_id) : null, String(label || "").slice(0, 200))
    .run();
}

function callDurationSec(call) {
  const ms = Number(call?.duration_ms);
  if (Number.isFinite(ms) && ms > 0) return Math.round(ms / 1000);
  const start = Number(call?.start_timestamp);
  const end = Number(call?.end_timestamp);
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) return Math.round((end - start) / 1000);
  return null;
}

function outreachVoiceRate(env) {
  const n = parseFloat(env.PLUMBER_VOICE_COST_PER_MIN || "0.15");
  return Number.isFinite(n) && n > 0 ? n : 0.15;
}

function outreachSmsRate(env) {
  const n = parseFloat(env.PLUMBER_SMS_COST_EACH || "0.01");
  return Number.isFinite(n) && n > 0 ? n : 0.01;
}

function fmtMoney(n) {
  return "$" + (Math.round(n * 100) / 100).toFixed(2);
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

async function fetchRetellVoices(env) {
  if (!env.RETELL_API_KEY || typeof retellFetch !== "function") return [];
  try {
    const data = await retellFetch(env, "GET", "/list-voices", null);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

async function resolvePlumberMaleVoiceId(env, preferredId) {
  const voices = await fetchRetellVoices(env);
  const byId = new Map(voices.map((v) => [String(v.voice_id || ""), v]));
  const candidates = preferredId
    ? [String(preferredId).trim(), ...PLUMBER_MALE_VOICE_PREFER]
    : PLUMBER_MALE_VOICE_PREFER;
  for (const id of candidates) {
    if (!id || !byId.has(id)) continue;
    return { voice_id: id, voice: byId.get(id) };
  }
  const males = voices.filter((v) => v.gender === "male");
  const american = males.find((v) => /american/i.test(String(v.accent || "")));
  const pick = american || males[0];
  if (pick) return { voice_id: pick.voice_id, voice: pick };
  return { voice_id: plumberOutreachVoiceId(env), voice: byId.get(plumberOutreachVoiceId(env)) || null };
}

async function handlePlumberOutreachListVoices(request, env) {
  const voices = await fetchRetellVoices(env);
  const males = voices.filter((v) => v.gender === "male");
  const resolved = await resolvePlumberMaleVoiceId(env, env.PLUMBER_OUTREACH_VOICE_ID || plumberOutreachVoiceId(env));
  return json({
    ok: true,
    current_default: PLUMBER_OUTREACH_VOICE_ID,
    current_configured: plumberOutreachVoiceId(env),
    selected: resolved,
    male_voices: males.map((v) => ({
      voice_id: v.voice_id,
      voice_name: v.voice_name,
      provider: v.provider,
      accent: v.accent,
      age: v.age,
      preview_audio_url: v.preview_audio_url,
    })),
  });
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
  let agentId = (await resolvePlumberOutreachAgentId(env))?.agent_id || "";
  let llmId = null;
  let agentVersion = 0;
  const playbook = await getOutreachPlaybook(env);
  const outreachPrompt = buildPlumberPromptFromPlaybook(playbook);

  const tools = buildPlumberTools(env, playbook);
  const custom = tools.find((t) => t.name === "notify_owner_hot_lead");
  if (custom) custom.url = hotLeadUrl;

  const pickedVoice = await resolvePlumberMaleVoiceId(env, plumberOutreachVoiceId(env));

  if (agentId) {
    try {
      const detail = await retellFetch(env, "GET", "/get-agent/" + agentId, null);
      llmId = detail.response_engine?.llm_id;
      if (llmId) {
        await retellFetch(env, "PATCH", "/update-retell-llm/" + llmId, plumberOutreachLlmPayload(outreachPrompt, tools));
        const updated = await retellFetch(env, "PATCH", "/update-agent/" + agentId, {
          agent_name: "IE Plumber Outreach",
          ...plumberOutreachVoiceSettings(env, pickedVoice.voice_id),
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
    const llm = await retellFetch(env, "POST", "/create-retell-llm", plumberOutreachLlmPayload(outreachPrompt, tools));
    llmId = llm.llm_id;
    const created = await retellFetch(env, "POST", "/create-agent", {
      agent_name: "IE Plumber Outreach",
      ...plumberOutreachVoiceSettings(env, pickedVoice.voice_id),
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

  if (agentId) {
    await ensurePlumberOutreachPhoneBinding(env, agentId);
  }

  return json({
    ok: true,
    agent_id: agentId,
    voice_id: pickedVoice.voice_id,
    voice_name: pickedVoice.voice?.voice_name || null,
    ...plumberOutreachVoiceSettings(env, pickedVoice.voice_id),
    from_number: env.RETELL_FROM_NUMBER,
    webhook_url: webhookUrl,
    hot_lead_url: hotLeadUrl,
    transfer_phone: env.PLUMBER_OUTREACH_TRANSFER_PHONE || env.LAB_VERIFY_NOTIFY_PHONE || null,
  });
}

async function placePlumberOutreachCall(env, lead, extraMeta) {
  if (!env.RETELL_API_KEY || !env.RETELL_FROM_NUMBER) throw new Error("Retell not configured");
  await ensurePlumberOutreachSchema(env);

  const sync = await syncPlumberOutreachAgentPrompt(env);
  if (!sync.ok) throw new Error(sync.reason || sync.error || "Could not sync outreach agent prompt");

  const agentId = sync.agent_id;
  if (!agentId) throw new Error("Plumber outreach agent not set up");

  const phoneBind = await ensurePlumberOutreachPhoneBinding(env, agentId);
  if (!phoneBind.ok) throw new Error(phoneBind.error || "Could not bind plumber agent to outbound phone number");

  const playbook = await getOutreachPlaybook(env);
  const scriptLock = await assertPlaybookReadyForCall(env, playbook);

  const templateVars = {
    company_name: String(lead.company_name || ""),
    city: String(lead.city || ""),
  };
  const openingVars = buildOpeningDynamicVariables(playbook.opening, templateVars);

  const hasWebsite = !!(lead.has_website || lead.website);
  const website = String(lead.website || "").trim();
  const payload = {
    from_number: env.RETELL_FROM_NUMBER,
    to_number: formatPhoneE164(lead.phone),
    override_agent_id: agentId,
    retell_llm_dynamic_variables: {
      ...openingVars,
      company_name: templateVars.company_name,
      city: templateVars.city,
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
      script_fingerprint: scriptLock.fingerprint,
      script_saved_at: scriptLock.saved_at || null,
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
  return {
    call_id: callId,
    agent_id: agentId,
    opening_first_line: openingVars.opening_first_line,
    opening_step_count: openingVars.opening_step_count,
    phone_bind: phoneBind,
    sync,
  };
}

function buildPlumberOneMinuteAlertContent({ company, city, phone, website, dashboardUrl }) {
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
  return { subject, text, html };
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

  const content = buildPlumberOneMinuteAlertContent({ company, city, phone, website, dashboardUrl });
  const { subject, text, html } = content;

  let email = { sent: false, reason: "email_module_missing" };
  if (typeof sendOutreachEmail === "function") {
    email = await sendOutreachEmail(env, { subject, text, html });
    if (email.sent) {
      await logOutreachNotify(env, {
        kind: "email",
        recipient: email.to,
        call_id: callId,
        label: subject.slice(0, 200),
      });
    }
  }

  let sms = null;
  if (!email.sent && typeof sendTwilioSms === "function") {
    const notifyPhone = env.PLUMBER_OUTREACH_NOTIFY_PHONE || env.LAB_VERIFY_NOTIFY_PHONE;
    if (notifyPhone) {
      const smsBody = (
        `Live call 1+ min — ${company}${city ? ` (${city})` : ""}. ` +
        `Open dashboard: ${dashboardUrl}`
      ).slice(0, 320);
      sms = await sendTwilioSms(env, notifyPhone, smsBody);
      if (sms?.sent) {
        await logOutreachNotify(env, {
          kind: "sms",
          recipient: notifyPhone,
          call_id: callId,
          label: "1min_alert",
        });
      }
    }
  }

  const notified = !!(email.sent || sms?.sent);
  if (notified) {
    await env.DB.prepare(
      "UPDATE plumber_outreach_calls SET alert_email_sent = 1, status = 'in_progress', updated_at = datetime('now') WHERE call_id = ?1"
    )
      .bind(callId)
      .run();
  } else {
    console.warn("plumber 1min alert failed", callId, email.reason || email, sms?.reason || sms);
  }

  return { sent: notified, email, sms, publish: publishInfo, dashboard_url: dashboardUrl };
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

  const sms = await sendPlumberPreviewLinkSms(env, {
    previewUrl,
    companyName: row.company_name,
    phone: body.to || row.phone,
    message: body.message,
    callId,
  });
  if (sms.reason === "sms_not_configured") return json({ error: "SMS not configured" }, 503);
  return json({ ok: !!sms.sent, sms, preview_url: previewUrl, to: sms.to });
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
    if (sms?.sent) {
      await logOutreachNotify(env, {
        kind: "sms",
        recipient: notifyPhone,
        call_id: callId || null,
        label: "hot_lead",
      });
    }
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
    const dur = callDurationSec(call);
    if (dur != null) {
      await env.DB.prepare(
        `UPDATE plumber_outreach_calls SET duration_sec = ?2, ended_at = datetime('now'), updated_at = datetime('now') WHERE call_id = ?1`
      )
        .bind(callId, dur)
        .run();
    }
  }

  if (event === "call_analyzed") {
    const analysis = call.call_analysis || {};
    const custom = analysis.custom_analysis_data || analysis;
    const outcome = custom.call_outcome || "";
    const contactName = custom.contact_name || "";
    const summary = custom.call_summary || "";
    const dur = callDurationSec(call);
    await env.DB.prepare(
      `UPDATE plumber_outreach_calls SET call_outcome = ?2, contact_name = ?3, call_summary = ?4, status = 'done',
       duration_sec = COALESCE(?5, duration_sec), ended_at = COALESCE(ended_at, datetime('now')), updated_at = datetime('now') WHERE call_id = ?1`
    )
      .bind(callId, outcome, contactName, summary, dur)
      .run();
    ctx.waitUntil(fetchAndStoreCallRecording(env, callId));
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
    const playbook = await getOutreachPlaybook(env);
    await assertPlaybookReadyForCall(env, playbook);
  } catch (e) {
    return json({ error: String(e.message || e) }, 503);
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

  try {
    const playbook = await getOutreachPlaybook(env);
    await assertPlaybookReadyForCall(env, playbook);
    await syncPlumberOutreachAgentPrompt(env);
  } catch (e) {
    return json({ error: String(e.message || e) }, 503);
  }

  await env.DB.prepare("UPDATE plumber_outreach_campaigns SET status = 'paused', updated_at = datetime('now') WHERE status = 'running'")
    .run();
  await env.DB.prepare(
    "UPDATE plumber_outreach_campaigns SET status = 'running', next_call_at = datetime('now'), updated_at = datetime('now') WHERE id = ?1"
  )
    .bind(campaign.id)
    .run();

  let tick;
  try {
    tick = await processPlumberOutreachCampaignTick(env);
  } catch (e) {
    return json({ ok: false, campaign_id: campaign.id, status: "running", error: String(e.message || e) }, 500);
  }
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

async function handlePlumberTestAlertEmail(request, env) {
  await ensurePlumberOutreachSchema(env);
  await ensurePreviewPublishSchema(env);
  const body = await request.json().catch(() => ({}));
  const callId = String(body.call_id || "call_df87268458a783f3715a58e7893").trim();
  const row = await env.DB.prepare("SELECT * FROM plumber_outreach_calls WHERE call_id = ?1").bind(callId).first();
  const q = await env.DB.prepare("SELECT publish_key FROM plumber_publish_queue WHERE call_id = ?1").bind(callId).first();
  const company = row?.company_name || body.company_name || "Allstar Plumbing, Heating & Air";
  const city = row?.city || body.city || "Rancho Cucamonga";
  const phone = row?.phone || body.phone || "7146864196";
  const website = String(row?.website || body.website || "").trim();
  const dashboardUrl =
    q?.publish_key && typeof dashboardPublishUrl === "function"
      ? dashboardPublishUrl(env, callId, q.publish_key)
      : typeof dashboardPublishUrl === "function"
      ? dashboardPublishUrl(env, callId)
      : "";
  const { subject, text, html } = buildPlumberOneMinuteAlertContent({ company, city, phone, website, dashboardUrl });
  const email =
    typeof sendOutreachEmail === "function"
      ? await sendOutreachEmail(env, { to: body.to, subject, text, html })
      : { sent: false, reason: "email_module_missing" };
  return json({ ok: !!email.sent, email, subject, dashboard_url: dashboardUrl });
}

async function handlePlumberOutreachResendAlert(request, env) {
  const body = await request.json().catch(() => ({}));
  const callId = String(body.call_id || "").trim();
  if (!callId) return json({ error: "call_id required" }, 400);
  await ensurePlumberOutreachSchema(env);
  const row = await env.DB.prepare("SELECT * FROM plumber_outreach_calls WHERE call_id = ?1").bind(callId).first();
  if (!row) return json({ error: "Call not found" }, 404);
  await env.DB.prepare("UPDATE plumber_outreach_calls SET alert_email_sent = 0 WHERE call_id = ?1").bind(callId).run();
  try {
    const result = await sendPlumberOneMinuteAlert(env, callId, { start_timestamp: Date.now() - 120000 }, {
      company_name: row.company_name,
      city: row.city,
      website: row.website || "",
      slug: slugifyPreviewName(row.company_name, row.city),
    });
    return json({ ok: !!result.sent, ...result });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 500);
  }
}

async function handlePlumberOutreachOutbound(request, env) {
  const body = await request.json().catch(() => ({}));
  const lead = body.lead || body;
  const toPhone = String(body.to_phone || body.test_phone || "").trim();
  const dialLead = Object.assign({}, lead);
  if (toPhone) dialLead.phone = toPhone;
  if (!dialLead.company_name) return json({ error: "company_name required" }, 400);
  if (!dialLead.phone) return json({ error: "phone or to_phone required" }, 400);
  try {
    const placed = await placePlumberOutreachCall(env, dialLead, {
      outbound_test: true,
      slug: dialLead.slug || slugifyPreviewName(dialLead.company_name, dialLead.city),
      address: String(dialLead.address || ""),
      website: String(dialLead.website || ""),
      city: String(dialLead.city || ""),
    });
    return json({ ok: true, ...placed, company_name: dialLead.company_name, phone: dialLead.phone, city: dialLead.city });
  } catch (e) {
    return json({ error: String(e.message || e) }, 503);
  }
}

async function handlePlumberOutreachTracking(request, env) {
  await ensurePlumberOutreachSchema(env);
  const voiceRate = outreachVoiceRate(env);
  const smsRate = outreachSmsRate(env);
  const emailLimit = Math.max(1, parseInt(env.OUTREACH_EMAIL_DAILY_LIMIT || "100", 10) || 100);

  const callDayRows = await env.DB.prepare(
    `SELECT
       date(COALESCE(call_started_at, placed_at)) AS day,
       COUNT(*) AS total_calls,
       SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS completed,
       SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
       SUM(CASE WHEN status = 'placed' THEN 1 ELSE 0 END) AS placed,
       SUM(CASE WHEN call_outcome LIKE '%interested%' OR call_outcome = 'interested_callback' THEN 1 ELSE 0 END) AS interested,
       SUM(CASE WHEN call_outcome LIKE '%voicemail%' OR call_outcome = 'voicemail' THEN 1 ELSE 0 END) AS voicemail,
       SUM(COALESCE(duration_sec, 0)) AS total_duration_sec
     FROM plumber_outreach_calls
     WHERE COALESCE(call_started_at, placed_at) IS NOT NULL
     GROUP BY day
     ORDER BY day DESC
     LIMIT 31`
  ).all();

  const notifyDayRows = await env.DB.prepare(
    `SELECT date(created_at) AS day, kind, COUNT(*) AS n
     FROM outreach_notify_log
     WHERE kind IN ('email', 'sms')
     GROUP BY day, kind`
  ).all();

  const notifyMap = {};
  for (const row of notifyDayRows.results || []) {
    const day = row.day;
    if (!notifyMap[day]) notifyMap[day] = { emails: 0, sms: 0 };
    if (row.kind === "email") notifyMap[day].emails += row.n || 0;
    if (row.kind === "sms") notifyMap[day].sms += row.n || 0;
  }

  const daily = (callDayRows.results || []).map((row) => {
    const mins = (row.total_duration_sec || 0) / 60;
    const voiceCost = mins * voiceRate;
    const notify = notifyMap[row.day] || { emails: 0, sms: 0 };
    const smsCost = notify.sms * smsRate;
    return {
      day: row.day,
      total_calls: row.total_calls || 0,
      completed: row.completed || 0,
      in_progress: row.in_progress || 0,
      placed: row.placed || 0,
      interested: row.interested || 0,
      voicemail: row.voicemail || 0,
      total_duration_sec: row.total_duration_sec || 0,
      emails: notify.emails,
      sms: notify.sms,
      est_voice_cost: fmtMoney(voiceCost),
      est_sms_cost: fmtMoney(smsCost),
      est_total_cost: fmtMoney(voiceCost + smsCost),
    };
  });

  const today = new Date().toISOString().slice(0, 10);
  const todayRow = daily.find((d) => d.day === today) || {
    day: today,
    total_calls: 0,
    completed: 0,
    in_progress: 0,
    placed: 0,
    interested: 0,
    voicemail: 0,
    total_duration_sec: 0,
    emails: 0,
    sms: 0,
    est_voice_cost: fmtMoney(0),
    est_sms_cost: fmtMoney(0),
    est_total_cost: fmtMoney(0),
  };
  if (!daily.find((d) => d.day === today) && (todayRow.total_calls || notifyMap[today])) {
    const notify = notifyMap[today] || { emails: 0, sms: 0 };
    todayRow.emails = notify.emails;
    todayRow.sms = notify.sms;
    todayRow.est_sms_cost = fmtMoney(notify.sms * smsRate);
    todayRow.est_total_cost = fmtMoney(notify.sms * smsRate);
  }

  const emailsTodayRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM outreach_notify_log WHERE kind = 'email' AND date(created_at) = date('now')`
  ).first();
  const emailsToday = emailsTodayRow?.n || 0;

  const monthVoiceRow = await env.DB.prepare(
    `SELECT SUM(COALESCE(duration_sec, 0)) AS sec FROM plumber_outreach_calls
     WHERE strftime('%Y-%m', COALESCE(call_started_at, placed_at)) = strftime('%Y-%m', 'now')`
  ).first();
  const monthSmsRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM outreach_notify_log
     WHERE kind = 'sms' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`
  ).first();
  const monthMins = (monthVoiceRow?.sec || 0) / 60;
  const monthSms = monthSmsRow?.n || 0;
  const monthCost = monthMins * voiceRate + monthSms * smsRate;

  const activeCalls = await env.DB.prepare(
    `SELECT call_id, company_name, city, phone, status, placed_at, call_started_at, duration_sec, alert_email_sent
     FROM plumber_outreach_calls
     WHERE status IN ('placed', 'in_progress')
     ORDER BY COALESCE(call_started_at, placed_at) DESC
     LIMIT 20`
  ).all();

  const recentCalls = await env.DB.prepare(
    `SELECT call_id, company_name, city, phone, status, call_outcome, contact_name, call_summary,
            duration_sec, placed_at, call_started_at, ended_at, alert_email_sent, recording_url
     FROM plumber_outreach_calls
     ORDER BY COALESCE(ended_at, call_started_at, placed_at) DESC
     LIMIT 40`
  ).all();

  const outcomeRows = await env.DB.prepare(
    `SELECT call_outcome, COUNT(*) AS n FROM plumber_outreach_calls
     WHERE call_outcome IS NOT NULL AND call_outcome != ''
     GROUP BY call_outcome ORDER BY n DESC`
  ).all();

  return json({
    ok: true,
    updated_at: new Date().toISOString(),
    rates: { voice_per_min: voiceRate, sms_each: smsRate },
    email_limit: emailLimit,
    today: {
      ...todayRow,
      emails_today: emailsToday,
      emails_remaining: Math.max(0, emailLimit - emailsToday),
      email_pct: Math.min(100, Math.round((emailsToday / emailLimit) * 100)),
    },
    month: {
      est_total_cost: fmtMoney(monthCost),
      total_duration_sec: monthVoiceRow?.sec || 0,
      sms_count: monthSms,
    },
    daily,
    active_calls: activeCalls.results || [],
    recent_calls: recentCalls.results || [],
    outcomes: outcomeRows.results || [],
  });
}
