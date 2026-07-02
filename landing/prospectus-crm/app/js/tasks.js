import * as db from './db.js';
import { esc } from './leads.js';

export async function createTask({ leadId = null, title, dueAt = null, notes = '' }) {
  return db.putTask({ leadId, title: title.trim(), dueAt, notes, completed: false });
}

export async function completeTask(id, completed = true) {
  const task = await db.getTask(id);
  if (!task) return null;
  return db.putTask({ ...task, completed });
}

export async function deleteTask(id) {
  return db.deleteTask(id);
}

export async function getOpenTasks() {
  const all = await db.getAllTasks();
  return all
    .filter((t) => !t.completed)
    .sort((a, b) => {
      if (!a.dueAt && !b.dueAt) return new Date(b.updatedAt) - new Date(a.updatedAt);
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return new Date(a.dueAt) - new Date(b.dueAt);
    });
}

export async function getTasksForLead(leadId) {
  const all = await db.getAllTasks();
  return all
    .filter((t) => t.leadId === leadId)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export function formatDue(dueAt) {
  if (!dueAt) return 'No due date';
  const d = new Date(dueAt);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (dueDay - today) / 86400000;
  if (diff < 0) return `Overdue · ${d.toLocaleDateString()}`;
  if (diff === 0) return 'Due today';
  if (diff === 1) return 'Due tomorrow';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export function dueClass(dueAt, completed) {
  if (completed) return 'task-done';
  if (!dueAt) return '';
  const d = new Date(dueAt);
  const now = new Date();
  if (d < now) return 'task-overdue';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (dueDay.getTime() === today.getTime()) return 'task-today';
  return '';
}

export function renderTaskItem(task, { leadName, onToggle, onOpenLead, onDelete } = {}) {
  const el = document.createElement('div');
  el.className = `task-item ${dueClass(task.dueAt, task.completed)}`;
  el.innerHTML = `
    <label class="task-check">
      <input type="checkbox" ${task.completed ? 'checked' : ''}>
      <span class="task-title">${esc(task.title)}</span>
    </label>
    <div class="task-meta">
      <span class="task-due">${esc(formatDue(task.dueAt))}</span>
      ${leadName ? `<button type="button" class="task-lead-link">${esc(leadName)}</button>` : ''}
    </div>
    ${onDelete ? '<button type="button" class="btn-ghost task-del" aria-label="Delete">×</button>' : ''}
  `;
  el.querySelector('input').addEventListener('change', (e) => onToggle?.(task, e.target.checked));
  el.querySelector('.task-lead-link')?.addEventListener('click', () => onOpenLead?.(task));
  el.querySelector('.task-del')?.addEventListener('click', () => onDelete?.(task));
  return el;
}
