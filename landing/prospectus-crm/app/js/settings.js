import * as db from './db.js';
import { seedDemoData } from './seed-data.js';

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
  const [leads, funnels] = await Promise.all([db.getAllLeads(), db.getAllFunnels()]);
  const payload = { version: 1, exportedAt: new Date().toISOString(), leads, funnels };
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
  await db.clearLeads();
  await db.clearFunnels();
  for (const funnel of payload.funnels || []) {
    await db.putFunnel(funnel);
  }
  for (const lead of payload.leads) {
    await db.putLead(lead);
  }
  return { leads: payload.leads.length, funnels: (payload.funnels || []).length };
}

export async function loadDemoData() {
  return seedDemoData(db);
}

export async function clearAllData() {
  await db.clearAll();
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
