import * as db from './db.js';

export const ACTIVITY_TYPES = {
  created: { label: 'Lead created', icon: '✨' },
  updated: { label: 'Lead updated', icon: '✏️' },
  call: { label: 'Call', icon: '📞' },
  email: { label: 'Email', icon: '✉️' },
  note: { label: 'Note', icon: '📝' },
  meeting: { label: 'Site visit scheduled', icon: '📅' },
  follow_up: { label: 'Follow-up set', icon: '⏰' },
  task: { label: 'Task', icon: '☑️' },
  temperature: { label: 'Status changed', icon: '🌡️' },
  sync: { label: 'Synced', icon: '☁️' },
};

export async function logActivity({ leadId, type, summary, meta = {} }) {
  return db.putActivity({
    leadId: leadId || null,
    type,
    summary,
    meta,
  });
}

export async function getLeadActivities(leadId) {
  return db.getActivitiesByLead(leadId);
}

export function formatActivityTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export function activityLabel(type) {
  return ACTIVITY_TYPES[type]?.label || type;
}

export function activityIcon(type) {
  return ACTIVITY_TYPES[type]?.icon || '•';
}
