import * as db from './db.js';
import { seedDemoData } from './seed-data.js';
import { exportSnapshot, importSnapshot } from './sync.js';

export const TEMPERATURES = [
  { value: 'hot', label: 'Hot', class: 'temp-hot' },
  { value: 'warm', label: 'Warm', class: 'temp-warm' },
  { value: 'cool', label: 'Cool', class: 'temp-cool' },
  { value: 'dead', label: 'Dead', class: 'temp-dead' },
];

export function tempLabel(value) {
  return TEMPERATURES.find((t) => t.value === value)?.label || value;
}

export function tempClass(value) {
  return TEMPERATURES.find((t) => t.value === value)?.class || '';
}

export async function exportAllData() {
  const payload = await exportSnapshot();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `prospectus-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importAllData(file) {
  const text = await file.text();
  const payload = JSON.parse(text);
  if (!payload.leads || !Array.isArray(payload.leads)) {
    throw new Error('Invalid backup file.');
  }
  await importSnapshot(payload.version >= 2 ? payload : migrateV1(payload), { merge: false });
  return {
    leads: payload.leads.length,
    funnels: (payload.funnels || []).length,
    tasks: (payload.tasks || []).length,
  };
}

function migrateV1(payload) {
  return {
    version: 2,
    leads: payload.leads,
    funnels: payload.funnels || [],
    activities: [],
    tasks: [],
    syncUpdatedAt: payload.exportedAt || new Date().toISOString(),
  };
}

export async function loadDemoData() {
  return seedDemoData(db);
}

export async function clearAllData() {
  await db.clearAllData();
}

export async function addFunnel(name) {
  const funnels = await db.getAllFunnels();
  return db.putFunnel({ name: name.trim(), sortOrder: funnels.length });
}

export async function renameFunnel(id, name) {
  const funnel = (await db.getAllFunnels()).find((f) => f.id === id);
  if (!funnel) return null;
  return db.putFunnel({ ...funnel, name: name.trim() });
}

export async function removeFunnel(id) {
  const leads = await db.getAllLeads();
  const inUse = leads.some((l) => l.funnelId === id);
  if (inUse) throw new Error('Cannot delete a funnel that has leads assigned.');
  await db.deleteFunnel(id);
}
