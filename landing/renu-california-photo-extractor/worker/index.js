import { encryptText, decryptText } from "./crypto.js";
import {
  fetchAriInvoices,
  listAriClients,
  listAccountUsers,
  validateAriLogin,
} from "./ari-firebase.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function err(message, status = 400) {
  return json({ error: message }, status);
}

function uuid() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function addDays(iso, days) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function defaultReview(photos) {
  const ids = photos.map((p) => p.id);
  return {
    unsorted: [...ids],
    before: [],
    after: [],
  };
}

async function requireSession(env, request) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const row = await env.DB.prepare(
    "SELECT token, user_name, expires_at FROM sessions WHERE token = ?"
  )
    .bind(token)
    .first();
  if (!row) return null;
  if (row.expires_at < nowIso()) return null;
  return row;
}

async function getAriCredentials(env, userName) {
  const row = await env.DB.prepare(
    "SELECT email_enc, password_enc FROM ari_credentials WHERE user_name = ?"
  )
    .bind(userName)
    .first();
  if (!row) return null;
  const secret = env.ENCRYPTION_KEY;
  if (!secret) throw new Error("ENCRYPTION_KEY not configured");
  return {
    email: await decryptText(row.email_enc, secret),
    password: await decryptText(row.password_enc, secret),
  };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      const staticResponse = serveStatic(path);
      if (staticResponse) return staticResponse;

      if (path === "/health") return json({ ok: true, service: "renu-california-photo-extractor-api" });

      if (path === "/api/login" && request.method === "POST") {
        const body = await request.json();
        const shopPassword = env.SHOP_PASSWORD;
        if (!shopPassword) return err("SHOP_PASSWORD not configured", 500);
        if (!body.shopPassword || body.shopPassword !== shopPassword) {
          return err("Invalid shop password", 401);
        }
        if (!body.userName || !String(body.userName).trim()) {
          return err("userName is required");
        }
        const token = uuid();
        const created = nowIso();
        const expires = addDays(created, 30);
        await env.DB.prepare(
          "INSERT INTO sessions (token, user_name, created_at, expires_at) VALUES (?, ?, ?, ?)"
        )
          .bind(token, String(body.userName).trim(), created, expires)
          .run();
        return json({ token, userName: String(body.userName).trim(), expiresAt: expires });
      }

      const session = await requireSession(env, request);

      if (path === "/api/ari/users" && request.method === "POST") {
        if (!session) return err("Unauthorized", 401);
        const body = await request.json();
        if (!body.email || !body.password) return err("ARI email and password required");
        const result = await listAccountUsers(body.email, body.password);
        return json(result);
      }

      if (path === "/api/ari/credentials" && request.method === "POST") {
        if (!session) return err("Unauthorized", 401);
        const body = await request.json();
        if (!body.email || !body.password) return err("ARI email and password required");
        const secret = env.ENCRYPTION_KEY;
        if (!secret) return err("ENCRYPTION_KEY not configured", 500);

        const validated = await validateAriLogin(
          body.email,
          body.password,
          body.accountUserId || null,
          body.passcode || ""
        );

        const emailEnc = await encryptText(body.email, secret);
        const passEnc = await encryptText(body.password, secret);
        await env.DB.prepare(
          `INSERT INTO ari_credentials (user_name, email_enc, password_enc, ari_account_user_id, ari_account_user_name, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_name) DO UPDATE SET
             email_enc=excluded.email_enc,
             password_enc=excluded.password_enc,
             ari_account_user_id=excluded.ari_account_user_id,
             ari_account_user_name=excluded.ari_account_user_name,
             updated_at=excluded.updated_at`
        )
          .bind(
            session.user_name,
            emailEnc,
            passEnc,
            validated.accountUserId,
            validated.accountUserName,
            nowIso()
          )
          .run();
        return json({
          ok: true,
          saved: true,
          ariUserName: validated.accountUserName,
          hasSubUsers: !!validated.accountUserId,
        });
      }

      if (path === "/api/ari/clients" && request.method === "GET") {
        if (!session) return err("Unauthorized", 401);
        const creds = await getAriCredentials(env, session.user_name);
        if (!creds) return err("ARI credentials not saved. Connect ARI first.", 400);
        const clients = await listAriClients(creds.email, creds.password);
        return json({ clients });
      }

      if (path === "/api/car-tally" && request.method === "POST") {
        if (!session) return err("Unauthorized", 401);
        const body = await request.json();
        const creds = await getAriCredentials(env, session.user_name);
        if (!creds) return err("ARI credentials not saved. Connect ARI first.", 400);

        const clientName = body.clientName || "";
        const dateFrom = body.dateFrom || "";
        const dateTo = body.dateTo || "";

        const cars = await fetchAriInvoices(creds.email, creds.password, {
          clientName,
          dateFrom,
          dateTo,
          includePhotos: false,
        });

        return json({
          total: cars.length,
          clientName,
          dateFrom,
          dateTo,
          cars: cars.map((car) => ({
            year: car.year,
            make: car.make,
            model: car.model,
            vin: car.vin,
            dateOrdered: car.dateOrdered,
          })),
        });
      }

      if (path === "/api/image" && request.method === "GET") {
        if (!session) return err("Unauthorized", 401);
        const imgUrl = url.searchParams.get("url");
        if (!imgUrl) return err("url required");
        let parsed;
        try {
          parsed = new URL(imgUrl);
        } catch {
          return err("Invalid url");
        }
        const allowedHosts = [
          "firebasestorage.googleapis.com",
          "storage.googleapis.com",
          "lh3.googleusercontent.com",
        ];
        if (!allowedHosts.includes(parsed.hostname)) return err("Forbidden host", 403);
        const upstream = await fetch(imgUrl, { headers: { Accept: "image/*" } });
        if (!upstream.ok) return err("Image fetch failed", 502);
        return new Response(upstream.body, {
          headers: {
            ...CORS,
            "Content-Type": upstream.headers.get("Content-Type") || "image/jpeg",
            "Cache-Control": "private, max-age=86400",
          },
        });
      }

      if (path === "/api/batches" && request.method === "GET") {
        if (!session) return err("Unauthorized", 401);
        const rows = await env.DB.prepare(
          "SELECT id, name, client_name, date_from, date_to, created_at, updated_at FROM batches WHERE user_name = ? ORDER BY updated_at DESC"
        )
          .bind(session.user_name)
          .all();
        return json({ batches: rows.results || [] });
      }

      if (path === "/api/batches" && request.method === "POST") {
        if (!session) return err("Unauthorized", 401);
        const body = await request.json();
        if (!body.name) return err("Batch name is required");

        const creds = await getAriCredentials(env, session.user_name);
        if (!creds) return err("ARI credentials not saved. Connect ARI first.", 400);

        const batchId = uuid();
        const created = nowIso();
        const clientName = body.clientName || "";
        const dateFrom = body.dateFrom || "";
        const dateTo = body.dateTo || "";

        const invoices = await fetchAriInvoices(creds.email, creds.password, {
          clientName,
          dateFrom,
          dateTo,
        });

        await env.DB.prepare(
          `INSERT INTO batches (id, user_name, name, client_name, date_from, date_to, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(batchId, session.user_name, body.name, clientName, dateFrom, dateTo, created, created)
          .run();

        const insertCar = env.DB.prepare(
          `INSERT INTO batch_cars (id, batch_id, ari_invoice_id, invoice_number, vin, year, make, model, client_name, date_ordered, kept, photos_json, review_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
        );

        const CHUNK = 40;
        for (let i = 0; i < invoices.length; i += CHUNK) {
          const slice = invoices.slice(i, i + CHUNK);
          const statements = slice.map((inv) => {
            const review = defaultReview(inv.photos);
            return insertCar.bind(
              uuid(),
              batchId,
              inv.ariInvoiceId,
              inv.invoiceNumber,
              inv.vin,
              inv.year,
              inv.make,
              inv.model,
              inv.clientName,
              inv.dateOrdered,
              JSON.stringify(inv.photos),
              JSON.stringify(review)
            );
          });
          if (statements.length) await env.DB.batch(statements);
        }

        return json({
          batchId,
          imported: invoices.length,
          withPhotos: invoices.filter((i) => i.photos.length > 0).length,
        });
      }

      if (path === "/api/batches/delete" && request.method === "POST") {
        if (!session) return err("Unauthorized", 401);
        const body = await request.json();
        const ids = body.ids;
        if (!Array.isArray(ids) || !ids.length) return err("Select at least one batch to delete");
        let deleted = 0;
        for (const id of ids) {
          const owned = await env.DB.prepare(
            "SELECT id FROM batches WHERE id = ? AND user_name = ?"
          )
            .bind(id, session.user_name)
            .first();
          if (!owned) continue;
          await env.DB.prepare("DELETE FROM batch_cars WHERE batch_id = ?").bind(id).run();
          await env.DB.prepare("DELETE FROM batches WHERE id = ? AND user_name = ?")
            .bind(id, session.user_name)
            .run();
          deleted += 1;
        }
        return json({ deleted });
      }

      if (path.startsWith("/api/batches/") && request.method === "GET") {
        if (!session) return err("Unauthorized", 401);
        const batchId = path.split("/")[3];
        if (!batchId) return err("Batch id required");
        const batch = await env.DB.prepare(
          "SELECT * FROM batches WHERE id = ? AND user_name = ?"
        )
          .bind(batchId, session.user_name)
          .first();
        if (!batch) return err("Batch not found", 404);
        const cars = await env.DB.prepare(
          "SELECT * FROM batch_cars WHERE batch_id = ? ORDER BY date_ordered DESC"
        )
          .bind(batchId)
          .all();
        const parsed = (cars.results || []).map((car) => ({
          ...car,
          kept: !!car.kept,
          photos: JSON.parse(car.photos_json || "[]"),
          review: JSON.parse(car.review_json || "{}"),
        }));
        return json({ batch, cars: parsed });
      }

      if (path.startsWith("/api/batches/") && path.endsWith("/cars") && request.method === "PUT") {
        if (!session) return err("Unauthorized", 401);
        const batchId = path.split("/")[3];
        const batch = await env.DB.prepare(
          "SELECT id FROM batches WHERE id = ? AND user_name = ?"
        )
          .bind(batchId, session.user_name)
          .first();
        if (!batch) return err("Batch not found", 404);
        const body = await request.json();
        if (!Array.isArray(body.cars)) return err("cars array required");

        const update = env.DB.prepare(
          "UPDATE batch_cars SET kept = ?, review_json = ? WHERE id = ? AND batch_id = ?"
        );
        for (const car of body.cars) {
          await update
            .bind(car.kept ? 1 : 0, JSON.stringify(car.review || {}), car.id, batchId)
            .run();
        }
        await env.DB.prepare("UPDATE batches SET updated_at = ? WHERE id = ?")
          .bind(nowIso(), batchId)
          .run();
        return json({ ok: true, saved: body.cars.length });
      }

      if (path.startsWith("/api/batches/") && path.endsWith("/print") && request.method === "GET") {
        if (!session) return err("Unauthorized", 401);
        const batchId = path.split("/")[3];
        const batch = await env.DB.prepare(
          "SELECT * FROM batches WHERE id = ? AND user_name = ?"
        )
          .bind(batchId, session.user_name)
          .first();
        if (!batch) return err("Batch not found", 404);
        const cars = await env.DB.prepare(
          "SELECT * FROM batch_cars WHERE batch_id = ? AND kept = 1 ORDER BY date_ordered DESC"
        )
          .bind(batchId)
          .all();
        const parsed = (cars.results || []).map((car) => {
          const photos = JSON.parse(car.photos_json || "[]");
          const review = JSON.parse(car.review_json || "{}");
          const photoMap = Object.fromEntries(photos.map((p) => [String(p.id), p]));
          const beforeUrls = (review.before || [])
            .map((id) => photoMap[String(id)]?.url)
            .filter(Boolean);
          const afterUrls = (review.after || [])
            .map((id) => photoMap[String(id)]?.url)
            .filter(Boolean);
          return {
            id: car.id,
            vin: car.vin,
            year: car.year,
            make: car.make,
            model: car.model,
            invoiceNumber: car.invoice_number,
            dateOrdered: car.date_ordered,
            beforeUrls,
            afterUrls,
          };
        });
        return json({ batch, cars: parsed });
      }

      return err("Not found", 404);
    } catch (e) {
      console.error(e);
      return err(e.message || "Server error", 500);
    }
  },
};
