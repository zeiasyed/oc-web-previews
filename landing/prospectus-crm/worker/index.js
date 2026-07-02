const ALLOWED = 'zeiasyed@nexa-care.com';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Account-Email',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function err(message, status = 400) {
  return json({ error: message }, status);
}

function auth(req, env) {
  const email = req.headers.get('X-Account-Email');
  if (email !== ALLOWED && email !== env.ALLOWED_EMAIL) return false;
  const header = req.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) return false;
  const token = header.slice(7);
  return token && token === env.SYNC_TOKEN;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/sync')) {
      return err('Not found', 404);
    }

    if (!auth(request, env)) {
      return err('Unauthorized', 401);
    }

    const email = request.headers.get('X-Account-Email') || ALLOWED;

    if (request.method === 'GET') {
      const row = await env.DB.prepare(
        'SELECT payload, updated_at FROM sync_store WHERE account_email = ?'
      )
        .bind(email)
        .first();
      if (!row) {
        return json({ snapshot: null, updatedAt: null });
      }
      return json({
        snapshot: JSON.parse(row.payload),
        updatedAt: row.updated_at,
      });
    }

    if (request.method === 'PUT') {
      const body = await request.json();
      if (!body.snapshot) return err('Missing snapshot');
      if (body.snapshot.accountEmail && body.snapshot.accountEmail !== ALLOWED) {
        return err('Invalid account email', 403);
      }
      const updatedAt = body.snapshot.syncUpdatedAt || new Date().toISOString();
      await env.DB.prepare(
        `INSERT INTO sync_store (account_email, payload, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(account_email) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`
      )
        .bind(email, JSON.stringify(body.snapshot), updatedAt)
        .run();
      return json({ ok: true, updatedAt });
    }

    return err('Method not allowed', 405);
  },
};
