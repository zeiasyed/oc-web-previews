const FIREBASE_API_KEY = "AIzaSyCEk68Qst_GCmQLqBtAtcshXJxXISNRdJY";
const FIREBASE_PROJECT = "arikinveyproject";

export async function ariSignIn(email, password) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || "ARI login failed");
  }
  return { idToken: data.idToken, uid: data.localId, email: data.email };
}

function firestoreValue(field) {
  if (!field || typeof field !== "object") return null;
  if ("stringValue" in field) return field.stringValue;
  if ("integerValue" in field) return Number(field.integerValue);
  if ("doubleValue" in field) return Number(field.doubleValue);
  if ("booleanValue" in field) return field.booleanValue;
  if ("nullValue" in field) return null;
  if ("timestampValue" in field) return field.timestampValue;
  if ("arrayValue" in field) {
    const values = field.arrayValue.values || [];
    return values.map((v) => firestoreValue(v));
  }
  if ("mapValue" in field) {
    const out = {};
    const fields = field.mapValue.fields || {};
    for (const [k, v] of Object.entries(fields)) out[k] = firestoreValue(v);
    return out;
  }
  return null;
}

function docToObject(doc) {
  const fields = doc.fields || {};
  const out = { _id: doc.name.split("/").pop() };
  for (const [k, v] of Object.entries(fields)) out[k] = firestoreValue(v);
  return out;
}

async function listCollection(idToken, uid, collectionName) {
  const base = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/users/${uid}/${collectionName}`;
  const items = [];
  let pageToken = "";

  do {
    const url = pageToken ? `${base}?pageToken=${encodeURIComponent(pageToken)}` : base;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error?.message || `Firestore read failed (${collectionName})`);
    }
    for (const doc of data.documents || []) items.push(docToObject(doc));
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return items;
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseVehicleInfo(info) {
  if (!info || typeof info !== "string") return { year: "", make: "", model: "" };
  const parts = info.split(",").map((s) => s.trim());
  if (parts.length >= 3) {
    return { year: parts[0], make: parts[1], model: parts.slice(2).join(", ") };
  }
  return { year: "", make: "", model: info };
}

function normalizePhotos(pics) {
  if (!Array.isArray(pics)) return [];
  return pics
    .map((pic, index) => {
      const url = pic?._downloadURL || pic?.base64 || pic?.url || "";
      if (!url) return null;
      return {
        id: pic?._id || pic?.id || `pic-${index}`,
        url,
        descr: pic?.descr || pic?.description || "",
      };
    })
    .filter(Boolean);
}

export async function fetchAriInvoices(email, password, filters) {
  const { idToken, uid } = await ariSignIn(email, password);
  const invoices = await listCollection(idToken, uid, "EstimatesDB");

  const from = filters.dateFrom ? new Date(filters.dateFrom + "T00:00:00") : null;
  const to = filters.dateTo ? new Date(filters.dateTo + "T23:59:59") : null;
  const clientNeedle = (filters.clientName || "").trim().toLowerCase();

  return invoices
    .filter((inv) => (inv.TypeOfForm || "") === "Invoice")
    .filter((inv) => {
      if (!clientNeedle) return true;
      return String(inv.ClientName || "").toLowerCase().includes(clientNeedle);
    })
    .filter((inv) => {
      const ordered = parseDate(inv.DateOrdered);
      if (!ordered) return true;
      if (from && ordered < from) return false;
      if (to && ordered > to) return false;
      return true;
    })
    .map((inv) => {
      const vehicle = parseVehicleInfo(inv.VehicleInfo);
      const photos = normalizePhotos(inv.pics);
      return {
        ariInvoiceId: inv._id,
        invoiceNumber: String(inv.EstimateId || ""),
        vin: inv.vin || "",
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        clientName: inv.ClientName || "",
        dateOrdered: inv.DateOrdered || "",
        photos,
      };
    })
    .sort((a, b) => String(b.dateOrdered).localeCompare(String(a.dateOrdered)));
}

export async function listAriClients(email, password) {
  const { idToken, uid } = await ariSignIn(email, password);
  const clients = await listCollection(idToken, uid, "ClientsDB");
  const names = clients
    .map((c) => c.ClientName || c.name || c.Name || "")
    .filter(Boolean);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}
