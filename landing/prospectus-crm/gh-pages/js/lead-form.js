import * as db from './db.js';
import { geocodeLead } from './geo.js';
import { downloadVcard, shareVcard } from './vcard.js';
import { TEMPERATURES, tempLabel, tempClass } from './settings.js';
import { esc } from './leads.js';
import { CONFIG } from './config.js';
import {
  getLeadActivities,
  logActivity,
  formatActivityTime,
  activityLabel,
  activityIcon,
} from './activities.js';
import { getTasksForLead, createTask, completeTask, deleteTask, renderTaskItem, formatDue } from './tasks.js';
import { setFollowUp, formatFollowUp } from './reminders.js';
import {
  buildVisitEvent,
  googleCalendarUrl,
  outlookCalendarUrl,
  outlookMailUrl,
  downloadIcs,
} from './calendar.js';

export function emptyLead() {
  return {
    name: '',
    company: '',
    title: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    lat: null,
    lng: null,
    funnelId: '',
    temperature: 'warm',
    notes: '',
    cardImage: null,
    followUpAt: null,
  };
}

export function renderLeadForm(container, { lead, funnels, title, onSave, onCancel }) {
  const funnelOptions = funnels
    .map((f) => `<option value="${f.id}" ${lead.funnelId === f.id ? 'selected' : ''}>${esc(f.name)}</option>`)
    .join('');
  const tempOptions = TEMPERATURES.map(
    (t) => `<option value="${t.value}" ${lead.temperature === t.value ? 'selected' : ''}>${t.label}</option>`
  ).join('');

  container.innerHTML = `
    <div class="screen-header">
      <button type="button" class="btn-ghost back-btn" aria-label="Back">←</button>
      <h2>${esc(title)}</h2>
      <span class="header-spacer"></span>
    </div>
    <form class="lead-form" id="lead-form">
      <div class="form-group">
        <label for="f-name">Name</label>
        <input id="f-name" name="name" type="text" autocomplete="name" value="${esc(lead.name || '')}" required>
      </div>
      <div class="form-group">
        <label for="f-company">Company</label>
        <input id="f-company" name="company" type="text" autocomplete="organization" value="${esc(lead.company || '')}">
      </div>
      <div class="form-group">
        <label for="f-title">Title</label>
        <input id="f-title" name="title" type="text" value="${esc(lead.title || '')}">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="f-phone">Phone</label>
          <input id="f-phone" name="phone" type="tel" autocomplete="tel" value="${esc(lead.phone || '')}">
        </div>
        <div class="form-group">
          <label for="f-email">Email</label>
          <input id="f-email" name="email" type="email" autocomplete="email" value="${esc(lead.email || '')}">
        </div>
      </div>
      <div class="form-group">
        <label for="f-address">Street address</label>
        <input id="f-address" name="address" type="text" autocomplete="street-address" value="${esc(lead.address || '')}">
      </div>
      <div class="form-row form-row-3">
        <div class="form-group">
          <label for="f-city">City</label>
          <input id="f-city" name="city" type="text" autocomplete="address-level2" value="${esc(lead.city || '')}">
        </div>
        <div class="form-group">
          <label for="f-state">State</label>
          <input id="f-state" name="state" type="text" maxlength="2" autocomplete="address-level1" value="${esc(lead.state || '')}">
        </div>
        <div class="form-group">
          <label for="f-zip">ZIP</label>
          <input id="f-zip" name="zip" type="text" inputmode="numeric" autocomplete="postal-code" value="${esc(lead.zip || '')}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="f-funnel">Sales funnel</label>
          <select id="f-funnel" name="funnelId" required>${funnelOptions}</select>
        </div>
        <div class="form-group">
          <label for="f-temp">Temperature</label>
          <select id="f-temp" name="temperature" required>${tempOptions}</select>
        </div>
      </div>
      <div class="form-group">
        <label for="f-notes">Notes</label>
        <textarea id="f-notes" name="notes" rows="3">${esc(lead.notes || '')}</textarea>
      </div>
      ${lead.cardImage ? `<div class="card-thumb-wrap"><img src="${lead.cardImage}" alt="Business card" class="card-thumb"></div>` : ''}
      <div class="form-actions">
        <button type="button" class="btn-secondary cancel-btn">Cancel</button>
        <button type="submit" class="btn-primary">Save lead</button>
      </div>
    </form>
  `;

  container.querySelector('.back-btn').addEventListener('click', onCancel);
  container.querySelector('.cancel-btn').addEventListener('click', onCancel);
  container.querySelector('#lead-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));
    await onSave({
      ...lead,
      ...data,
      lat: lead.lat,
      lng: lead.lng,
      cardImage: lead.cardImage,
      followUpAt: lead.followUpAt || null,
    });
  });
}

function followUpQuickDate(days, hours = 9) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hours, 0, 0, 0);
  return d.toISOString();
}

function showScheduleVisitModal(lead, onDone) {
  const defaultStart = new Date();
  defaultStart.setDate(defaultStart.getDate() + 1);
  defaultStart.setHours(10, 0, 0, 0);
  const localVal = new Date(defaultStart.getTime() - defaultStart.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card modal-wide">
      <h3>Schedule site visit</h3>
      <p class="muted small">Calendar events use <strong>${esc(CONFIG.USER_EMAIL)}</strong></p>
      <div class="form-group">
        <label>Visit date & time</label>
        <input type="datetime-local" id="visit-dt" value="${localVal}">
      </div>
      <div class="form-group">
        <label>Notes (optional)</label>
        <input type="text" id="visit-notes" placeholder="e.g. Bring protocol deck">
      </div>
      <div class="modal-actions" style="flex-direction:column">
        <button type="button" class="btn-primary gcal-btn">Add to Google Calendar</button>
        <button type="button" class="btn-secondary ocal-btn">Add to Outlook Calendar</button>
        <button type="button" class="btn-secondary ics-btn">Download .ics file</button>
        <button type="button" class="btn-ghost cancel-btn">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();

  const getEvent = () => {
    const dt = overlay.querySelector('#visit-dt').value;
    const notes = overlay.querySelector('#visit-notes').value;
    return buildVisitEvent(lead, { start: new Date(dt), notes });
  };

  overlay.querySelector('.gcal-btn').addEventListener('click', async () => {
    const event = getEvent();
    window.open(googleCalendarUrl(event), '_blank');
    await logActivity({
      leadId: lead.id,
      type: 'meeting',
      summary: `Site visit scheduled for ${event.startDate.toLocaleString()}`,
    });
    onDone?.();
    close();
  });
  overlay.querySelector('.ocal-btn').addEventListener('click', async () => {
    const event = getEvent();
    window.open(outlookCalendarUrl(event), '_blank');
    await logActivity({
      leadId: lead.id,
      type: 'meeting',
      summary: `Site visit scheduled for ${event.startDate.toLocaleString()}`,
    });
    onDone?.();
    close();
  });
  overlay.querySelector('.ics-btn').addEventListener('click', async () => {
    const event = getEvent();
    downloadIcs(event, `visit-${(lead.company || lead.name || 'lead').replace(/\W+/g, '-')}.ics`);
    await logActivity({
      leadId: lead.id,
      type: 'meeting',
      summary: `Site visit .ics downloaded for ${event.startDate.toLocaleString()}`,
    });
    onDone?.();
    close();
  });
  overlay.querySelector('.cancel-btn').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
}

function showFollowUpModal(lead, onSave) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const current = lead.followUpAt
    ? new Date(new Date(lead.followUpAt).getTime() - new Date(lead.followUpAt).getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : '';
  overlay.innerHTML = `
    <div class="modal-card">
      <h3>Set follow-up reminder</h3>
      <p class="muted small">You'll be reminded to follow up with ${esc(lead.name || 'this lead')}</p>
      <div class="quick-chips">
        <button type="button" class="city-chip" data-days="1">Tomorrow</button>
        <button type="button" class="city-chip" data-days="3">In 3 days</button>
        <button type="button" class="city-chip" data-days="7">In 1 week</button>
        <button type="button" class="city-chip" data-days="14">In 2 weeks</button>
      </div>
      <div class="form-group">
        <label>Or pick date & time</label>
        <input type="datetime-local" id="followup-dt" value="${current}">
      </div>
      <div class="modal-actions">
        <button type="button" class="btn-secondary clear-btn">Clear</button>
        <button type="button" class="btn-primary save-btn">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();

  overlay.querySelectorAll('[data-days]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const iso = followUpQuickDate(parseInt(btn.dataset.days, 10));
      onSave(iso);
      close();
    });
  });
  overlay.querySelector('.clear-btn').addEventListener('click', () => {
    onSave(null);
    close();
  });
  overlay.querySelector('.save-btn').addEventListener('click', () => {
    const val = overlay.querySelector('#followup-dt').value;
    onSave(val ? new Date(val).toISOString() : null);
    close();
  });
}

function showAddNoteModal(lead, onSave) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card">
      <h3>Add note</h3>
      <textarea id="note-text" rows="4" placeholder="What happened on the call or visit?"></textarea>
      <div class="modal-actions">
        <button type="button" class="btn-secondary cancel-btn">Cancel</button>
        <button type="button" class="btn-primary save-btn">Save note</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.cancel-btn').addEventListener('click', close);
  overlay.querySelector('.save-btn').addEventListener('click', async () => {
    const text = overlay.querySelector('#note-text').value.trim();
    if (text) await onSave(text);
    close();
  });
}

function showAddTaskModal(lead, onSave) {
  const tomorrow = followUpQuickDate(1);
  const localVal = new Date(new Date(tomorrow).getTime() - new Date(tomorrow).getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card">
      <h3>Add task</h3>
      <div class="form-group">
        <label>Task</label>
        <input type="text" id="task-title" placeholder="e.g. Send protocol deck">
      </div>
      <div class="form-group">
        <label>Due</label>
        <input type="datetime-local" id="task-due" value="${localVal}">
      </div>
      <div class="modal-actions">
        <button type="button" class="btn-secondary cancel-btn">Cancel</button>
        <button type="button" class="btn-primary save-btn">Add task</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.cancel-btn').addEventListener('click', close);
  overlay.querySelector('.save-btn').addEventListener('click', async () => {
    const title = overlay.querySelector('#task-title').value.trim();
    const due = overlay.querySelector('#task-due').value;
    if (!title) return;
    await onSave({ title, dueAt: due ? new Date(due).toISOString() : null });
    close();
  });
}

export async function renderLeadDetail(container, { lead, funnelName, onEdit, onDelete, onBack, onRefresh }) {
  const [activities, tasks] = await Promise.all([
    getLeadActivities(lead.id),
    getTasksForLead(lead.id),
  ]);
  const mapsParts = [lead.address, lead.city, lead.state, lead.zip].filter(Boolean).join(', ');
  const followUpDue = lead.followUpAt && new Date(lead.followUpAt) <= new Date();

  container.innerHTML = `
    <div class="screen-header">
      <button type="button" class="btn-ghost back-btn" aria-label="Back">←</button>
      <h2>Lead</h2>
      <button type="button" class="btn-ghost edit-btn">Edit</button>
    </div>
    <div class="detail-card">
      <div class="detail-head">
        <h1>${esc(lead.name || 'Unnamed')}</h1>
        <p class="detail-company">${esc(lead.company || '')}</p>
        ${lead.title ? `<p class="detail-title">${esc(lead.title)}</p>` : ''}
        <div class="detail-badges">
          <span class="funnel-pill">${esc(funnelName)}</span>
          <span class="temp-pill ${tempClass(lead.temperature)}">${esc(tempLabel(lead.temperature))}</span>
          ${lead.followUpAt ? `<span class="followup-pill ${followUpDue ? 'followup-due' : ''}">⏰ ${esc(formatFollowUp(lead.followUpAt))}</span>` : ''}
        </div>
      </div>
      <div class="detail-actions">
        ${lead.phone ? `<button type="button" class="action-btn call-btn">Call</button>` : ''}
        ${lead.email ? `<button type="button" class="action-btn email-btn">Email</button>` : ''}
        ${mapsParts ? `<a href="https://maps.google.com/?q=${encodeURIComponent(mapsParts)}" class="action-btn" target="_blank" rel="noopener">Maps</a>` : ''}
      </div>
      <p class="email-hint muted small">Email opens in Outlook as <strong>${esc(CONFIG.USER_EMAIL)}</strong></p>
      <div class="detail-actions">
        <button type="button" class="action-btn followup-btn">Set follow-up</button>
        <button type="button" class="action-btn schedule-btn">Schedule visit</button>
        <button type="button" class="action-btn note-btn">Add note</button>
      </div>
      <dl class="detail-fields">
        ${lead.phone ? `<div><dt>Phone</dt><dd>${esc(lead.phone)}</dd></div>` : ''}
        ${lead.email ? `<div><dt>Email</dt><dd>${esc(lead.email)}</dd></div>` : ''}
        ${mapsParts ? `<div><dt>Address</dt><dd>${esc(mapsParts)}</dd></div>` : ''}
        ${lead.notes ? `<div><dt>Notes</dt><dd>${esc(lead.notes)}</dd></div>` : ''}
      </dl>
      <div class="detail-section">
        <div class="section-head">
          <h3>Tasks</h3>
          <button type="button" class="btn-ghost add-task-btn">+ Add</button>
        </div>
        <div id="lead-tasks" class="task-list"></div>
      </div>
      <div class="detail-section">
        <h3>Activity</h3>
        <div id="lead-activity" class="activity-timeline"></div>
      </div>
      <div class="detail-contact-actions">
        <button type="button" class="btn-primary vcard-btn">Add to iPhone Contacts</button>
        <button type="button" class="btn-secondary share-btn">Share contact</button>
      </div>
      <button type="button" class="btn-danger delete-btn">Delete lead</button>
    </div>
  `;

  const tasksEl = container.querySelector('#lead-tasks');
  if (!tasks.length) {
    tasksEl.innerHTML = '<p class="empty-hint">No tasks yet.</p>';
  } else {
    for (const task of tasks) {
      tasksEl.appendChild(
        renderTaskItem(task, {
          onToggle: async (t, done) => {
            await completeTask(t.id, done);
            await logActivity({
              leadId: lead.id,
              type: 'task',
              summary: done ? `Completed: ${t.title}` : `Reopened: ${t.title}`,
            });
            onRefresh?.(lead);
          },
          onDelete: async (t) => {
            await deleteTask(t.id);
            onRefresh?.(lead);
          },
        })
      );
    }
  }

  const actEl = container.querySelector('#lead-activity');
  if (!activities.length) {
    actEl.innerHTML = '<p class="empty-hint">No activity yet.</p>';
  } else {
    actEl.innerHTML = activities
      .map(
        (a) => `
      <div class="activity-item">
        <span class="activity-icon">${activityIcon(a.type)}</span>
        <div>
          <p class="activity-summary">${esc(a.summary || activityLabel(a.type))}</p>
          <p class="activity-time">${esc(formatActivityTime(a.createdAt))}</p>
        </div>
      </div>`
      )
      .join('');
  }

  container.querySelector('.back-btn').addEventListener('click', onBack);
  container.querySelector('.edit-btn').addEventListener('click', () => onEdit(lead));
  container.querySelector('.vcard-btn').addEventListener('click', () => downloadVcard(lead));
  container.querySelector('.share-btn').addEventListener('click', async () => {
    try {
      await shareVcard(lead);
    } catch (err) {
      if (err.name !== 'AbortError') downloadVcard(lead);
    }
  });
  container.querySelector('.delete-btn').addEventListener('click', () => {
    if (confirm(`Delete ${lead.name || 'this lead'}?`)) onDelete(lead);
  });

  container.querySelector('.call-btn')?.addEventListener('click', async () => {
    await logActivity({ leadId: lead.id, type: 'call', summary: `Called ${lead.phone}` });
    window.location.href = `tel:${lead.phone}`;
  });
  container.querySelector('.email-btn')?.addEventListener('click', async () => {
    await logActivity({ leadId: lead.id, type: 'email', summary: `Email to ${lead.email}` });
    window.open(outlookMailUrl(lead), '_blank');
  });

  container.querySelector('.followup-btn').addEventListener('click', () => {
    showFollowUpModal(lead, async (iso) => {
      const updated = await setFollowUp(lead, iso);
      await logActivity({
        leadId: lead.id,
        type: 'follow_up',
        summary: iso ? `Follow-up set for ${formatFollowUp(iso)}` : 'Follow-up cleared',
      });
      onRefresh?.(updated);
    });
  });

  container.querySelector('.schedule-btn').addEventListener('click', () => {
    showScheduleVisitModal(lead, () => onRefresh?.(lead));
  });

  container.querySelector('.note-btn').addEventListener('click', () => {
    showAddNoteModal(lead, async (text) => {
      await logActivity({ leadId: lead.id, type: 'note', summary: text });
      onRefresh?.(lead);
    });
  });

  container.querySelector('.add-task-btn').addEventListener('click', () => {
    showAddTaskModal(lead, async ({ title, dueAt }) => {
      await createTask({ leadId: lead.id, title, dueAt });
      await logActivity({ leadId: lead.id, type: 'task', summary: `Task added: ${title}` });
      onRefresh?.(lead);
    });
  });
}

export async function saveLeadWithGeocode(leadData, { isNew = false, prevTemp = null } = {}) {
  let lat = leadData.lat;
  let lng = leadData.lng;
  if (lat == null || lng == null) {
    try {
      const coords = await geocodeLead(leadData);
      if (coords) {
        lat = coords.lat;
        lng = coords.lng;
      }
    } catch {
      /* optional */
    }
  }
  const saved = await db.putLead({ ...leadData, lat, lng });
  if (isNew) {
    await logActivity({
      leadId: saved.id,
      type: 'created',
      summary: `Lead created: ${saved.name || saved.company}`,
    });
  } else {
    await logActivity({
      leadId: saved.id,
      type: 'updated',
      summary: `Lead updated`,
    });
    if (prevTemp && prevTemp !== saved.temperature) {
      await logActivity({
        leadId: saved.id,
        type: 'temperature',
        summary: `Temperature: ${tempLabel(prevTemp)} → ${tempLabel(saved.temperature)}`,
      });
    }
  }
  return saved;
}

export async function promptAddToContacts(lead) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card">
        <h3>Saved!</h3>
        <p>Add <strong>${esc(lead.name || 'this contact')}</strong> to your iPhone Contacts?</p>
        <div class="modal-actions">
          <button type="button" class="btn-secondary skip-btn">Not now</button>
          <button type="button" class="btn-primary add-btn">Add to Contacts</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.skip-btn').addEventListener('click', () => {
      overlay.remove();
      resolve(false);
    });
    overlay.querySelector('.add-btn').addEventListener('click', () => {
      downloadVcard(lead);
      overlay.remove();
      resolve(true);
    });
  });
}
