import * as db from './db.js';
import { CONFIG, getSyncApiUrl, getSyncToken } from './config.js';
import { logActivity } from './activities.js';

export async function exportSnapshot() {
  const [leads, funnels, activities, tasks, syncUpdatedAt] = await Promise.all([
    db.getAllLeads(),
    db.getAllFunnels(),
    db.getAllActivities(),
    db.getAllTasks(),
    db.getMeta('syncUpdatedAt'),
  ]);
  return {
    version: 2,
    accountEmail: CONFIG.USER_EMAIL,
    syncUpdatedAt: syncUpdatedAt?.value || new Date().toISOString(),
    leads,
    funnels,
    activities,
    tasks,
  };
}

export async function importSnapshot(snapshot, { merge = true } = {}) {
  if (!snapshot || snapshot.version < 2) {
    throw new Error('Unsupported backup version.');
  }
  if (snapshot.accountEmail && snapshot.accountEmail !== CONFIG.USER_EMAIL) {
    throw new Error(`This backup belongs to ${snapshot.accountEmail}, not ${CONFIG.USER_EMAIL}.`);
  }

  if (!merge) {
    await db.clearAllData();
  }

  for (const funnel of snapshot.funnels || []) {
    await db.putFunnel(funnel, { touch: false });
  }
  for (const lead of snapshot.leads || []) {
    await db.putLead(lead, { touch: false });
  }
  for (const act of snapshot.activities || []) {
    await db.putActivity(act, { touch: false });
  }
  for (const task of snapshot.tasks || []) {
    await db.putTask(task, { touch: false });
  }
  const at = snapshot.syncUpdatedAt || new Date().toISOString();
  await db.setMeta('syncUpdatedAt', at);
  await db.setMeta('lastSyncedAt', at);
  return snapshot;
}

function mergeRecords(local, remote, idKey = 'id') {
  const map = new Map();
  for (const r of local) map.set(r[idKey], r);
  for (const r of remote) {
    const existing = map.get(r[idKey]);
    if (!existing || new Date(r.updatedAt || 0) > new Date(existing.updatedAt || 0)) {
      map.set(r[idKey], r);
    }
  }
  return [...map.values()];
}

export async function mergeSnapshots(localSnap, remoteSnap) {
  return {
    version: 2,
    accountEmail: CONFIG.USER_EMAIL,
    syncUpdatedAt: new Date().toISOString(),
    leads: mergeRecords(localSnap.leads || [], remoteSnap.leads || []),
    funnels: mergeRecords(localSnap.funnels || [], remoteSnap.funnels || []),
    activities: mergeRecords(localSnap.activities || [], remoteSnap.activities || []),
    tasks: mergeRecords(localSnap.tasks || [], remoteSnap.tasks || []),
  };
}

export async function syncNow() {
  const apiUrl = getSyncApiUrl().replace(/\/$/, '');
  const token = getSyncToken();
  if (!apiUrl) throw new Error('Set sync API URL in Settings first.');
  if (!token) throw new Error('Set sync token in Settings first.');

  const local = await exportSnapshot();
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-Account-Email': CONFIG.USER_EMAIL,
  };

  const pullRes = await fetch(`${apiUrl}/api/sync`, { headers });
  if (!pullRes.ok) {
    const err = await pullRes.json().catch(() => ({}));
    throw new Error(err.error || `Sync failed (${pullRes.status})`);
  }
  const remote = await pullRes.json();

  let merged;
  if (remote.snapshot) {
    merged = await mergeSnapshots(local, remote.snapshot);
  } else {
    merged = local;
  }

  merged.syncUpdatedAt = new Date().toISOString();
  await importSnapshot(merged, { merge: false });

  const pushRes = await fetch(`${apiUrl}/api/sync`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ snapshot: merged }),
  });
  if (!pushRes.ok) {
    const err = await pushRes.json().catch(() => ({}));
    throw new Error(err.error || `Upload failed (${pushRes.status})`);
  }

  const now = new Date().toISOString();
  await db.setMeta('lastSyncedAt', now);
  await db.setMeta('syncUpdatedAt', now);
  await logActivity({ type: 'sync', summary: 'Cloud sync completed' });
  return now;
}

export async function getLastSyncedAt() {
  const meta = await db.getMeta('lastSyncedAt');
  return meta?.value || null;
}
