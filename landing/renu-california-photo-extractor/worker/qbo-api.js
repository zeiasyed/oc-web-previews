const QBO_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const QBO_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QBO_SCOPE = "com.intuit.quickbooks.accounting";

function qboBase(env) {
  return env.QBO_SANDBOX === "true"
    ? "https://sandbox-quickbooks.api.intuit.com"
    : "https://quickbooks.api.intuit.com";
}

export async function getQboAuthUrl(env, sessionToken) {
  const clientId = env.QBO_CLIENT_ID;
  if (!clientId) throw new Error("QuickBooks is not configured on the server (QBO_CLIENT_ID).");
  const redirectUri = env.QBO_REDIRECT_URI || `${env.PUBLIC_BASE_URL || ""}/api/qbo/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: QBO_SCOPE,
    state: sessionToken,
  });
  return `${QBO_AUTH_URL}?${params.toString()}`;
}

async function exchangeToken(env, body) {
  const clientId = env.QBO_CLIENT_ID;
  const clientSecret = env.QBO_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("QuickBooks OAuth not configured.");
  const basic = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(QBO_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(body).toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error_description || data?.error || "QBO token exchange failed");
  return data;
}

export async function saveQboTokens(env, encryptText, userName, realmId, tokenData) {
  const secret = env.ENCRYPTION_KEY;
  const refreshEnc = await encryptText(tokenData.refresh_token, secret);
  const accessEnc = tokenData.access_token
    ? await encryptText(tokenData.access_token, secret)
    : "";
  const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString();
  await env.DB.prepare(
    `INSERT INTO qbo_credentials (user_name, realm_id, refresh_token_enc, access_token_enc, access_expires_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_name) DO UPDATE SET
       realm_id=excluded.realm_id,
       refresh_token_enc=excluded.refresh_token_enc,
       access_token_enc=excluded.access_token_enc,
       access_expires_at=excluded.access_expires_at,
       updated_at=excluded.updated_at`
  )
    .bind(userName, realmId, refreshEnc, accessEnc, expiresAt, new Date().toISOString())
    .run();
}

export async function getQboCredentials(env, decryptText, userName) {
  const row = await env.DB.prepare(
    "SELECT realm_id, refresh_token_enc, access_token_enc, access_expires_at FROM qbo_credentials WHERE user_name = ?"
  )
    .bind(userName)
    .first();
  if (!row) return null;
  const secret = env.ENCRYPTION_KEY;
  return {
    realmId: row.realm_id,
    refreshToken: await decryptText(row.refresh_token_enc, secret),
    accessToken: row.access_token_enc ? await decryptText(row.access_token_enc, secret) : "",
    accessExpiresAt: row.access_expires_at,
  };
}

async function refreshAccessToken(env, encryptText, decryptText, userName, creds) {
  const tokenData = await exchangeToken(env, {
    grant_type: "refresh_token",
    refresh_token: creds.refreshToken,
  });
  await saveQboTokens(env, encryptText, userName, creds.realmId, tokenData);
  return tokenData.access_token;
}

export async function getValidAccessToken(env, encryptText, decryptText, userName) {
  const creds = await getQboCredentials(env, decryptText, userName);
  if (!creds) throw new Error("QuickBooks not connected. Click Connect QuickBooks first.");
  const stillValid = creds.accessExpiresAt && creds.accessExpiresAt > new Date().toISOString();
  if (stillValid && creds.accessToken) return { accessToken: creds.accessToken, realmId: creds.realmId };
  const accessToken = await refreshAccessToken(env, encryptText, decryptText, userName, creds);
  return { accessToken, realmId: creds.realmId };
}

function escapeQboString(value) {
  return String(value || "").replace(/'/g, "\\'");
}

async function qboQuery(accessToken, realmId, env, sql) {
  const url =
    `${qboBase(env)}/v3/company/${realmId}/query?query=` + encodeURIComponent(sql);
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data?.Fault?.Error?.[0]?.Message || data?.fault?.error?.[0]?.message || res.statusText;
    throw new Error(msg || "QuickBooks query failed");
  }
  const key = Object.keys(data?.QueryResponse || {})[0];
  return key ? data.QueryResponse[key] : [];
}

export async function findQboCustomer(accessToken, realmId, env, clientName) {
  const needle = escapeQboString(clientName.trim());
  const customers = await qboQuery(
    accessToken,
    realmId,
    env,
    `SELECT Id, DisplayName FROM Customer WHERE DisplayName LIKE '%${needle}%' MAXRESULTS 20`
  );
  if (!customers?.length) throw new Error(`No QuickBooks customer matching "${clientName}"`);
  const exact = customers.find(
    (c) => String(c.DisplayName || "").toLowerCase() === clientName.trim().toLowerCase()
  );
  return exact || customers[0];
}

export async function fetchQboOpenInvoices(accessToken, realmId, env, filters) {
  const customer = await findQboCustomer(accessToken, realmId, env, filters.clientName);
  const dateFrom = filters.dateFrom || "1970-01-01";
  const dateTo = filters.dateTo || "2099-12-31";
  const sql =
    "SELECT * FROM Invoice WHERE CustomerRef = '" +
    customer.Id +
    "' AND TxnDate >= '" +
    dateFrom +
    "' AND TxnDate <= '" +
    dateTo +
    "' AND Balance > '0' MAXRESULTS 1000";
  const invoices = await qboQuery(accessToken, realmId, env, sql);
  return {
    customerId: customer.Id,
    customerName: customer.DisplayName,
    invoices: invoices || [],
  };
}

export async function handleQboCallback(env, encryptText, code, realmId, userName) {
  const redirectUri = env.QBO_REDIRECT_URI || `${env.PUBLIC_BASE_URL || ""}/api/qbo/callback`;
  const tokenData = await exchangeToken(env, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  await saveQboTokens(env, encryptText, userName, realmId, tokenData);
}
