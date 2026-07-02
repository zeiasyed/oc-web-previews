const DB_NAME = 'prospectus_crm';
const DB_VERSION = 1;

const DEFAULT_FUNNELS = [
  { id: 'funnel-clinical', name: 'Clinical Trial Sites', sortOrder: 0 },
  { id: 'funnel-lab', name: 'Lab Sites', sortOrder: 1 },
];

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('leads')) {
        const leads = db.createObjectStore('leads', { keyPath: 'id' });
        leads.createIndex('temperature', 'temperature', { unique: false });
        leads.createIndex('funnelId', 'funnelId', { unique: false });
        leads.createIndex('city', 'city', { unique: false });
        leads.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('funnels')) {
        db.createObjectStore('funnels', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
  });
  return dbPromise;
}

function tx(storeNames, mode = 'readonly') {
  return openDb().then((db) => {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    const transaction = db.transaction(names, mode);
    return { transaction, stores: names.map((n) => transaction.objectStore(n)) };
  });
}

function promisifyRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function uid(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function initDb() {
  await openDb();
  const funnels = await getAllFunnels();
  if (!funnels.length) {
    for (const f of DEFAULT_FUNNELS) {
      await putFunnel(f);
    }
  }
}

export async function getMeta(key) {
  const { stores } = await tx('meta');
  return promisifyRequest(stores[0].get(key));
}

export async function setMeta(key, value) {
  const { stores } = await tx('meta', 'readwrite');
  return promisifyRequest(stores[0].put({ key, value }));
}

export async function getAllLeads() {
  const { stores } = await tx('leads');
  return promisifyRequest(stores[0].getAll());
}

export async function getLead(id) {
  const { stores } = await tx('leads');
  return promisifyRequest(stores[0].get(id));
}

export async function putLead(lead) {
  const { stores } = await tx('leads', 'readwrite');
  const now = new Date().toISOString();
  const record = {
    ...lead,
    id: lead.id || uid('lead'),
    createdAt: lead.createdAt || now,
    updatedAt: now,
  };
  await promisifyRequest(stores[0].put(record));
  return record;
}

export async function deleteLead(id) {
  const { stores } = await tx('leads', 'readwrite');
  return promisifyRequest(stores[0].delete(id));
}

export async function clearLeads() {
  const { stores } = await tx('leads', 'readwrite');
  return promisifyRequest(stores[0].clear());
}

export async function getAllFunnels() {
  const { stores } = await tx('funnels');
  const all = await promisifyRequest(stores[0].getAll());
  return all.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export async function putFunnel(funnel) {
  const { stores } = await tx('funnels', 'readwrite');
  const record = { ...funnel, id: funnel.id || uid('funnel') };
  await promisifyRequest(stores[0].put(record));
  return record;
}

export async function deleteFunnel(id) {
  const { stores } = await tx('funnels', 'readwrite');
  return promisifyRequest(stores[0].delete(id));
}

export async function clearFunnels() {
  const { stores } = await tx('funnels', 'readwrite');
  return promisifyRequest(stores[0].clear());
}

export async function clearAll() {
  await clearLeads();
  await clearFunnels();
  for (const f of DEFAULT_FUNNELS) {
    await putFunnel(f);
  }
}

export function filterLeads(leads, { search = '', funnelId = '', temperature = '', includeDead = false } = {}) {
  const q = search.trim().toLowerCase();
  return leads
    .filter((l) => {
      if (!includeDead && l.temperature === 'dead' && temperature !== 'dead') return false;
      if (temperature && l.temperature !== temperature) return false;
      if (funnelId && l.funnelId !== funnelId) return false;
      if (!q) return true;
      const hay = [l.name, l.company, l.city, l.email, l.phone, l.title]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export function getFunnelName(funnels, funnelId) {
  return funnels.find((f) => f.id === funnelId)?.name || 'Uncategorized';
}

export { uid };
