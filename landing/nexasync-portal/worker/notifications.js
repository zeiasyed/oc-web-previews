/** Post-call SMS and optional inform calls (concat before voice-agent.js) */

async function sendTwilioSms(env, toPhone, body) {
  const sid = env.TWILIO_ACCOUNT_SID;
  const token = env.TWILIO_AUTH_TOKEN;
  const from = env.TWILIO_SMS_FROM || env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) return { sent: false, reason: "sms_not_configured" };

  const to = formatPhoneE164(toPhone);
  if (!to || to.length < 12) return { sent: false, reason: "invalid_phone" };

  const auth = btoa(`${sid}:${token}`);
  const params = new URLSearchParams({ To: to, From: from, Body: String(body).slice(0, 1500) });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { sent: false, reason: data.message || "twilio_error" };
  return { sent: true, sid: data.sid };
}

function xmlEscapeInform(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendTwilioInformCall(env, toPhone, message) {
  const sid = env.TWILIO_ACCOUNT_SID;
  const token = env.TWILIO_AUTH_TOKEN;
  const from = env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) return { sent: false, reason: "voice_not_configured" };
  const to = formatPhoneE164(toPhone);
  if (!to || to.length < 12) return { sent: false, reason: "invalid_phone" };

  const twiml =
    '<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna-Neural">' +
    xmlEscapeInform(message) +
    "</Say><Hangup/></Response>";
  const auth = btoa(`${sid}:${token}`);
  const params = new URLSearchParams({ To: to, From: from, Twiml: twiml });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { sent: false, reason: data.message || "twilio_call_error" };
  return { sent: true, sid: data.sid };
}

async function sendRetellInformCall(env, toPhone, openingMessage, metadata) {
  if (!hasRetell(env)) return { sent: false, reason: "retell_not_configured" };
  const to = formatPhoneE164(toPhone);
  if (!to || to.length < 12) return { sent: false, reason: "invalid_phone" };

  const body = {
    from_number: env.RETELL_FROM_NUMBER,
    to_number: to,
    override_agent_id: env.RETELL_AGENT_ID,
    metadata: metadata || {},
    retell_llm_dynamic_variables: {
      opening_line: openingMessage,
      agency_name: metadata?.agency_name || "Your care team",
      nexa_playbook:
        "You are Nexa. Deliver the opening_line in one or two warm sentences. " +
        "If they have a quick question, answer briefly. Otherwise thank them and end the call.",
    },
  };

  const res = await fetch("https://api.retellai.com/v2/create-phone-call", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.RETELL_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { sent: false, reason: data.message || "retell_call_error" };
  return { sent: true, sid: data.call_id || data.id };
}

async function sendInformCall(env, toPhone, message, metadata) {
  if (hasRetell(env)) return sendRetellInformCall(env, toPhone, message, metadata);
  return sendTwilioInformCall(env, toPhone, message);
}

function buildPatientSmsMessage(outcome, context, details) {
  const agency = context.agency_name || "Your care team";
  const first = context.patient_first_name || "there";
  const apptType = context.appointment_type || "appointment";
  const when = details.scheduled_at ? formatApptForSpeech(details.scheduled_at) : "the scheduled time";

  if (outcome === "confirmed") {
    return `Hi ${first}, ${agency} confirmed your ${apptType} on ${when}. Reply if you need to change it.`;
  }
  if (outcome === "rescheduled" && details.reschedule_applied) {
    const oldWhen = details.old_scheduled_at ? formatApptForSpeech(details.old_scheduled_at) : "the previous time";
    const newWhen = details.scheduled_at ? formatApptForSpeech(details.scheduled_at) : "a new time";
    return `Hi ${first}, ${agency} update: your ${apptType} moved from ${oldWhen} to ${newWhen}. Reply if this doesn't work.`;
  }
  if (outcome === "rescheduled" && !details.reschedule_applied) {
    const proposed = details.proposed_text || "a new time";
    return `Hi ${first}, ${agency} is confirming a ${apptType} change (${proposed}). We'll text you once it's finalized.`;
  }
  if (outcome === "cancelled") {
    return `Hi ${first}, ${agency} update: your ${apptType} on ${when} was cancelled. Call us if you need to reschedule.`;
  }
  if (outcome === "prep_noted" && details.prep_instructions) {
    return `Hi ${first}, ${agency} prep for your ${apptType} on ${when}: ${details.prep_instructions}`;
  }
  return `Hi ${first}, ${agency} update about your ${apptType} on ${when}. Please call us if you have questions.`;
}

function buildProviderSmsMessage(outcome, context, details) {
  const agency = context.agency_name || "Our agency";
  const patient = context.patient_label || context.patient_first_name || "the patient";
  const when = details.scheduled_at ? formatApptForSpeech(details.scheduled_at) : "the scheduled time";
  const apptType = context.appointment_type || "appointment";

  if (outcome === "confirmed") {
    return `${agency}: ${patient}'s ${apptType} is confirmed for ${when}. Thank you.`;
  }
  if (outcome === "rescheduled" && details.reschedule_applied) {
    return `${agency}: ${patient}'s ${apptType} is now scheduled for ${when}. Thank you.`;
  }
  if (outcome === "rescheduled" && !details.reschedule_applied) {
    return `${agency}: noted proposed ${apptType} time for ${patient} (${details.proposed_text || "pending"}). We'll confirm with the patient.`;
  }
  if (outcome === "cancelled") {
    return `${agency}: ${patient}'s ${apptType} on ${when} is cancelled. Thank you.`;
  }
  return `${agency} scheduling update for ${patient}'s ${apptType} on ${when}.`;
}

function buildInformCallMessage(role, outcome, context, details) {
  const agency = context.agency_name || "Your care team";
  const when = details.scheduled_at ? formatApptForSpeech(details.scheduled_at) : "the scheduled time";
  const apptType = context.appointment_type || "appointment";

  if (role === "patient") {
    const first = context.patient_first_name || "there";
    if (outcome === "confirmed") {
      return `Hi ${first}, this is Nexa from ${agency}. I'm calling to confirm your ${apptType} on ${when}. Thank you, goodbye.`;
    }
    if (outcome === "rescheduled") {
      return `Hi ${first}, this is Nexa from ${agency}. Your ${apptType} is now scheduled for ${when}. Call us if that doesn't work. Goodbye.`;
    }
    if (outcome === "cancelled") {
      return `Hi ${first}, this is Nexa from ${agency}. Your ${apptType} on ${when} has been cancelled. Please call us to reschedule. Goodbye.`;
    }
    return `Hi ${first}, this is Nexa from ${agency} with an update about your ${apptType}. Goodbye.`;
  }

  const patient = context.patient_label || "the patient";
  if (outcome === "confirmed") {
    return `Hi, this is Nexa from ${agency}. Calling to confirm ${patient}'s ${apptType} on ${when}. Thank you, goodbye.`;
  }
  if (outcome === "rescheduled") {
    return `Hi, this is Nexa from ${agency}. ${patient}'s ${apptType} is now set for ${when}. Thank you, goodbye.`;
  }
  return `Hi, this is Nexa from ${agency} with a scheduling update for ${patient}. Goodbye.`;
}

function normalizeCommPreferencesFromContext(raw) {
  const d = {
    appointment_sms: true,
    appointment_call: false,
    prep_sms: true,
    caregiver_notify: false,
    caregiver_name: "",
    caregiver_phone: "",
    notes: "",
  };
  if (!raw || typeof raw !== "object") return d;
  return {
    appointment_sms: raw.appointment_sms !== false,
    appointment_call: raw.appointment_call === true,
    prep_sms: raw.prep_sms !== false,
    caregiver_notify: raw.caregiver_notify === true,
    caregiver_name: String(raw.caregiver_name || ""),
    caregiver_phone: String(raw.caregiver_phone || ""),
    notes: String(raw.notes || ""),
  };
}

function patientAllowsNotification(context, channel, outcome) {
  const prefs = normalizeCommPreferencesFromContext(context.comm_preferences);
  if (outcome === "prep_noted") {
    return channel === "sms" ? prefs.prep_sms : false;
  }
  if (["confirmed", "rescheduled", "cancelled"].includes(outcome)) {
    if (channel === "sms") return prefs.appointment_sms;
    if (channel === "call") return prefs.appointment_call;
  }
  return channel === "sms";
}

async function sendScenarioFollowUpNotifications(env, callSession, scenario, outcome, context, details) {
  const notify = normalizeScenarioNotifications(scenario?.notifications, scenario?.id);
  const results = {
    patient_sms: { skipped: true },
    provider_sms: { skipped: true },
    patient_call: { skipped: true },
    provider_call: { skipped: true },
  };

  const meta = {
    agency_name: context.agency_name,
    follow_up: true,
    parent_session_id: callSession.id,
    appointment_id: callSession.appointment_id,
  };

  const prefs = normalizeCommPreferencesFromContext(context.comm_preferences);

  if (notify.patient_sms) {
    if (!patientAllowsNotification(context, "sms", outcome)) {
      results.patient_sms = { sent: false, reason: "patient_pref_opt_out" };
    } else {
      const phone = context.patient_phone;
      if (!phone) results.patient_sms = { sent: false, reason: "no_patient_phone" };
      else {
        const body = buildPatientSmsMessage(outcome, context, details);
        results.patient_sms = await sendTwilioSms(env, phone, body);
      }
    }
  }

  if (notify.provider_sms) {
    const phone = context.provider_phone;
    if (!phone) results.provider_sms = { sent: false, reason: "no_provider_phone" };
    else {
      const body = buildProviderSmsMessage(outcome, context, details);
      results.provider_sms = await sendTwilioSms(env, phone, body);
    }
  }

  if (notify.patient_call) {
    if (!patientAllowsNotification(context, "call", outcome)) {
      results.patient_call = { sent: false, reason: "patient_pref_opt_out" };
    } else {
      const phone = context.patient_phone;
      if (!phone) results.patient_call = { sent: false, reason: "no_patient_phone" };
      else {
        const msg = buildInformCallMessage("patient", outcome, context, details);
        results.patient_call = await sendInformCall(env, phone, msg, meta);
      }
    }
  }

  if (notify.provider_call) {
    const phone = context.provider_phone;
    if (!phone) results.provider_call = { sent: false, reason: "no_provider_phone" };
    else {
      const msg = buildInformCallMessage("provider", outcome, context, details);
      results.provider_call = await sendInformCall(env, phone, msg, meta);
    }
  }

  if (prefs.caregiver_notify && prefs.caregiver_phone && ["confirmed", "rescheduled", "cancelled", "prep_noted"].includes(outcome)) {
    const allowCg = outcome === "prep_noted" ? prefs.prep_sms : prefs.appointment_sms;
    if (allowCg) {
      const cgContext = {
        ...context,
        patient_first_name: prefs.caregiver_name || context.patient_first_name,
      };
      const body = buildPatientSmsMessage(outcome, cgContext, details);
      results.caregiver_sms = await sendTwilioSms(env, prefs.caregiver_phone, body);
    } else {
      results.caregiver_sms = { sent: false, reason: "patient_pref_opt_out" };
    }
  }

  return results;
}

async function sendPatientRescheduleNotification(env, context, rescheduleResult) {
  return sendTwilioSms(
    env,
    context.patient_phone,
    buildPatientSmsMessage("rescheduled", context, {
      reschedule_applied: true,
      scheduled_at: rescheduleResult.proposedIso,
      old_scheduled_at: rescheduleResult.oldScheduledAt,
    })
  );
}

async function twilioApiGet(env, url) {
  const sid = env.TWILIO_ACCOUNT_SID;
  const token = env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return { ok: false, error: "twilio_not_configured" };
  const auth = btoa(`${sid}:${token}`);
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.message || res.status, data };
  return { ok: true, data };
}

async function handleTwilioStatus(env) {
  const sid = env.TWILIO_ACCOUNT_SID;
  if (!sid) return json({ error: "TWILIO_ACCOUNT_SID not on worker" }, 503);

  const numbers = await twilioApiGet(
    env,
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?PageSize=50`
  );
  const brands = await twilioApiGet(env, "https://messaging.twilio.com/v1/a2p/BrandRegistrations?PageSize=20");
  const services = await twilioApiGet(env, "https://messaging.twilio.com/v1/Services?PageSize=20");
  const recentMessages = await twilioApiGet(
    env,
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json?PageSize=10`
  );

  const brandList = brands.ok ? brands.data.data || brands.data.brand_registrations || [] : [];
  const brandSid = Array.isArray(brandList) && brandList[0] ? brandList[0].sid : null;
  const useCases = brandSid
    ? await twilioApiGet(
        env,
        `https://messaging.twilio.com/v1/a2p/BrandRegistrations/${brandSid}/UsAppToPersonUsecases?PageSize=20`
      )
    : { ok: false, error: "no_brand" };

  const phoneList = (numbers.ok ? numbers.data.incoming_phone_numbers : []).map((n) => ({
    number: n.phone_number,
    friendly_name: n.friendly_name,
    locality: n.locality,
    region: n.region,
    sms: n.capabilities?.sms,
    voice: n.capabilities?.voice,
    messaging_service_sid: n.sms_application_sid || null,
  }));

  const local = phoneList.filter((n) => {
    const d = String(n.number || "").replace(/\D/g, "");
    return d.length === 11 && d[1] !== "8" && !d.startsWith("1800") && !d.startsWith("1888");
  });
  const tollFree = phoneList.filter((n) => /\+1(800|888|877|866|855|844|833)/.test(String(n.number || "")));

  const useCaseList = useCases.ok ? useCases.data.data || useCases.data.us_app_to_person_usecases || [] : [];
  const messageList = recentMessages.ok ? recentMessages.data.messages || [] : [];

  return json({
    account_sid: sid,
    worker_from: env.TWILIO_FROM_NUMBER || null,
    worker_sms_from: env.TWILIO_SMS_FROM || null,
    effective_sms_from: env.TWILIO_SMS_FROM || env.TWILIO_FROM_NUMBER || null,
    phone_numbers: phoneList,
    local_numbers: local,
    toll_free_numbers: tollFree,
    brands: Array.isArray(brandList)
      ? brandList.map((b) => ({
          sid: b.sid,
          status: b.status || b.brand_status,
          name: b.display_name || b.company_name || b.friendly_name,
        }))
      : brandList,
    a2p_campaigns: Array.isArray(useCaseList)
      ? useCaseList.map((c) => ({
          sid: c.sid,
          status: c.campaign_status || c.status,
          use_case: c.us_app_to_person_usecase || c.description,
          messaging_service_sid: c.messaging_service_sid || null,
        }))
      : useCaseList,
    recent_messages: messageList.map((m) => ({
      sid: m.sid,
      from: m.from,
      to: m.to,
      status: m.status,
      error_code: m.error_code || null,
      error_message: m.error_message || null,
      date: m.date_sent || m.date_created,
    })),
    messaging_services: services.ok
      ? (services.data.services || []).map((s) => ({ sid: s.sid, name: s.friendly_name }))
      : [],
    api_errors: {
      numbers: numbers.ok ? null : numbers.error,
      brands: brands.ok ? null : brands.error,
      a2p_campaigns: useCases.ok ? null : useCases.error,
      messages: recentMessages.ok ? null : recentMessages.error,
    },
  });
}

async function sendOutreachEmail(env, { to, subject, text, html }) {
  const recipient = String(to || env.PLUMBER_OUTREACH_NOTIFY_EMAIL || "").trim();
  if (!recipient) return { sent: false, reason: "no_recipient" };

  const fromRaw = String(env.OUTREACH_EMAIL_FROM || "alerts@inertia-intel.com").trim();
  const fromMatch = fromRaw.match(/<([^>]+)>/);
  const fromEmail = fromMatch ? fromMatch[1] : fromRaw.replace(/^[^<]*$/, fromRaw).trim();
  const fromName = fromRaw.includes("<") ? fromRaw.replace(/<[^>]+>/, "").trim() || "NexaSync" : "NexaSync";
  const fromHeader = fromRaw.includes("<") ? fromRaw : `NexaSync <${fromEmail}>`;

  if (env.EMAIL && typeof env.EMAIL.send === "function") {
    await env.EMAIL.send({ to: recipient, from: fromHeader, subject, text, html });
    return { sent: true, to: recipient, provider: "email_binding" };
  }

  if (env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: fromHeader, to: [recipient], subject, text, html }),
    });
    if (res.ok) return { sent: true, to: recipient, provider: "resend" };
    const detail = await res.text();
    console.warn("resend failed", detail);
  }

  const mcRes = await fetch("https://api.mailchannels.net/tx/v1/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: recipient }] }],
      from: { email: fromEmail, name: fromName },
      subject,
      content: [
        { type: "text/plain", value: text },
        ...(html ? [{ type: "text/html", value: html }] : []),
      ],
    }),
  });
  if (mcRes.status === 202 || mcRes.ok) return { sent: true, to: recipient, provider: "mailchannels" };
  const mcDetail = await mcRes.text();
  return { sent: false, reason: `email_failed: ${mcDetail}`.slice(0, 220) };
}
