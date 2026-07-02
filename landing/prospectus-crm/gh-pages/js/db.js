const DB_NAME = 'prospectus_crm';
const DB_VERSION = 2;

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
      const database = e.target.result;
      if (!database.objectStoreNames.contains('leads')) {
        const leads = database.createObjectStore('leads', { keyPath: 'id' });
        leads.createIndex('temperature', 'temperature', { unique: false });
        leads.createIndex('funnelId', 'funnelId', { unique: false });
        leads.createIndex('city', 'city', { unique: false });
        leads.createIndex('updatedAt', 'updatedAt', { unique: false });
        leads.createIndex('followUpAt', 'followUpAt', { unique: false });
      } else if (e.oldVersion < 2) {
        const leads = e.target.transaction.objectStore('leads');
        if (!leads.indexNames.contains('followUpAt')) {
          leads.createIndex('followUpAt', 'followUpAt', { unique: false });
        }
      }
      if (!database.objectStoreNames.contains('funnels')) {
        database.createObjectStore('funnels', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('meta')) {
        database.createObjectStore('meta', { keyPath: 'key' });
      }
      if (!database.objectStoreNames.contains('activities')) {
        const activities = database.createObjectStore('activities', { keyPath: 'id' });
        activities.createIndex('leadId', 'leadId', { unique: false });
        activities.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!database.objectStoreNames.contains('tasks')) {
        const tasks = database.createObjectStore('tasks', { keyPath: 'id' });
        tasks.createIndex('leadId', 'leadId', { unique: false });
        tasks.createIndex('dueAt', 'dueAt', { unique: false });
        tasks.createIndex('completed', 'completed', { unique: false });
        tasks.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
  });
  return dbPromise;
}

function tx(storeNames, mode = 'readonly') {
  return openDb().then((database) => {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    const transaction = database.transaction(names, mode);
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

async function touchSyncMeta() {
  await setMeta('syncUpdatedAt', new Date().toISOString());
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

export async function putLead(lead, { touch = true } = {}) {
  const { stores } = await tx('leads', 'readwrite');
  const now = new Date().toISOString();
  const record = {
    ...lead,
    id: lead.id || uid('lead'),
    followUpAt: lead.followUpAt || null,
    createdAt: lead.createdAt || now,
    updatedAt: now,
  };
  await promisifyRequest(stores[0].put(record));
  if (touch) await touchSyncMeta();
  return record;
}

export async function deleteLead(id) {
  const { stores } = await tx('leads', 'readwrite');
  await promisifyRequest(stores[0].delete(id));
  await touchSyncMeta();
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

export async function putFunnel(funnel, { touch = true } = {}) {
  const { stores } = await tx('funnels', 'readwrite');
  const now = new Date().toISOString();
  const record = {
    ...funnel,
    id: funnel.id || uid('funnel'),
    updatedAt: funnel.updatedAt || now,
  };
  await promisifyRequest(stores[0].put(record));
  if (touch) await touchSyncMeta();
  return record;
}

export async function deleteFunnel(id) {
  const { stores } = await tx('funnels', 'readwrite');
  await promisifyRequest(stores[0].delete(id));
  await touchSyncMeta();
}

export async function clearFunnels() {
  const { stores } = await tx('funnels', 'readwrite');
  return promisifyRequest(stores[0].clear());
}

export async function getAllActivities() {
  const { stores } = await tx('activities');
  return promisifyRequest(stores[0].getAll());
}

export async function getActivitiesByLead(leadId) {
  const { stores } = await tx('activities');
  const idx = stores[0].index('leadId');
  const all = await promisifyRequest(idx.getAll(leadId));
  return all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function putActivity(activity, { touch = true } = {}) {
  const { stores } = await tx('activities', 'readwrite');
  const now = new Date().toISOString();
  const record = {
    ...activity,
    id: activity.id || uid('act'),
    createdAt: activity.createdAt || now,
    updatedAt: now,
  };
  await promisifyRequest(stores[0].put(record));
  if (touch) await touchSyncMeta();
  return record;
}

export async function clearActivities() {
  const { stores } = await tx('activities', 'readwrite');
  return promisifyRequest(stores[0].clear());
}

export async function getAllTasks() {
  const { stores } = await tx('tasks');
  return promisifyRequest(stores[0].getAll());
}

export async function getTask(id) {
  const { stores } = await tx('tasks');
  return promisifyRequest(stores[0].get(id));
}

export async function putTask(task, { touch = true } = {}) {
  const { stores } = await tx('tasks', 'readwrite');
  const now = new Date().toISOString();
  const record = {
    ...task,
    id: task.id || uid('task'),
    completed: !!task.completed,
    createdAt: task.createdAt || now,
    updatedAt: now,
  };
  await promisifyRequest(stores[0].put(record));
  if (touch) await touchSyncMeta();
  return record;
}

export async function deleteTask(id) {
  const { stores } = await tx('tasks', 'readwrite');
  await promisifyRequest(stores[0].delete(id));
  await touchSyncMeta();
}

export async function clearTasks() {
  const { stores } = await tx('tasks', 'readwrite');
  return promisifyRequest(stores[0].clear());
}

export async function clearAll() {
  await clearLeads();
  await clearFunnels();
  await clearActivities();
  await clearTasks();
  for (const f of DEFAULT_FUNNELS) {
    await putFunnel(f, { touch: false });
  }
  await touchSyncMeta();
}

export async function clearAllData() {
  return clearAll();
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
