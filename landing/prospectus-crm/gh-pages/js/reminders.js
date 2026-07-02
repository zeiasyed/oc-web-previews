import * as db from './db.js';
import { CONFIG } from './config.js';

const REMINDER_KEY = 'remindersEnabled';

export function remindersEnabled() {
  return localStorage.getItem(REMINDER_KEY) !== 'false';
}

export function setRemindersEnabled(on) {
  localStorage.setItem(REMINDER_KEY, on ? 'true' : 'false');
}

export async function setFollowUp(lead, followUpAt) {
  const updated = await db.putLead({ ...lead, followUpAt: followUpAt || null });
  return updated;
}

export async function getDueFollowUps() {
  const leads = await db.getAllLeads();
  const now = new Date();
  return leads
    .filter((l) => l.followUpAt && l.temperature !== 'dead')
    .filter((l) => new Date(l.followUpAt) <= now)
    .sort((a, b) => new Date(a.followUpAt) - new Date(b.followUpAt));
}

export async function getUpcomingFollowUps(withinHours = 24) {
  const leads = await db.getAllLeads();
  const now = Date.now();
  const horizon = now + withinHours * 3600000;
  return leads
    .filter((l) => l.followUpAt && l.temperature !== 'dead')
    .filter((l) => {
      const t = new Date(l.followUpAt).getTime();
      return t > now && t <= horizon;
    })
    .sort((a, b) => new Date(a.followUpAt) - new Date(b.followUpAt));
}

export function formatFollowUp(iso) {
  if (!iso) return 'Not set';
  const d = new Date(iso);
  const now = new Date();
  if (d <= now) return `Due ${d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

let reminderTimer = null;

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

async function fireReminder(title, body, tag) {
  if (!remindersEnabled()) return;
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, tag, icon: 'icon.svg' });
  }
}

export async function checkReminders(onNavigate) {
  const [dueLeads, openTasks] = await Promise.all([
    getDueFollowUps(),
    db.getAllTasks().then((t) => t.filter((x) => !x.completed && x.dueAt && new Date(x.dueAt) <= new Date())),
  ]);

  for (const lead of dueLeads.slice(0, 3)) {
    await fireReminder(
      `Follow up: ${lead.name}`,
      `${lead.company || 'Lead'} — tap to open`,
      `followup-${lead.id}`
    );
  }
  for (const task of openTasks.slice(0, 3)) {
    await fireReminder(`Task due: ${task.title}`, `Prospectus reminder for ${CONFIG.USER_EMAIL}`, `task-${task.id}`);
  }

  return { dueLeads, openTasks };
}

export function startReminderLoop(callback, intervalMs = 60000) {
  stopReminderLoop();
  const tick = async () => {
    const result = await checkReminders();
    callback?.(result);
  };
  tick();
  reminderTimer = setInterval(tick, intervalMs);
}

export function stopReminderLoop() {
  if (reminderTimer) {
    clearInterval(reminderTimer);
    reminderTimer = null;
  }
}
