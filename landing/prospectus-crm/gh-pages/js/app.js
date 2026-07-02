import * as db from './db.js';
import { getFilteredLeads, renderLeadList } from './leads.js';
import {
  emptyLead,
  renderLeadForm,
  renderLeadDetail,
  saveLeadWithGeocode,
  promptAddToContacts,
} from './lead-form.js';
import { scanBusinessCard, readFileAsDataUrl, compressImage } from './card-scan.js';
import {
  getUserLocation,
  sortLeadsByDistance,
  filterLeadsByCity,
  getUniqueCities,
} from './geo.js';
import {
  exportAllData,
  importAllData,
  loadDemoData,
  clearAllData,
  addFunnel,
  renameFunnel,
  removeFunnel,
} from './settings.js';
import { seedDemoData } from './seed-data.js';
import { getSyncApiUrl, getSyncToken, setSyncCredentials } from './config.js';
import { syncNow, getLastSyncedAt } from './sync.js';
import {
  getOpenTasks,
  createTask,
  completeTask,
  deleteTask,
  renderTaskItem,
} from './tasks.js';
import {
  getDueFollowUps,
  startReminderLoop,
  requestNotificationPermission,
  remindersEnabled,
  setRemindersEnabled,
} from './reminders.js';

const SCREENS = {
  leads: 'screen-leads',
  near: 'screen-near',
  tasks: 'screen-tasks',
  more: 'screen-more',
  add: 'screen-add',
  form: 'screen-form',
  detail: 'screen-detail',
};

let state = {
  screen: 'leads',
  funnels: [],
  formLead: null,
  userLocation: null,
  detailLeadId: null,
};

const els = {};

function $(id) {
  return document.getElementById(id);
}

function showToast(msg) {
  const t = els.toast;
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.add('hidden'), 2500);
}

function showScreen(name) {
  state.screen = name;
  Object.entries(SCREENS).forEach(([key, id]) => {
    $(id).classList.toggle('active', key === name);
  });
  const navScreens = ['leads', 'near', 'tasks', 'more', 'add'];
  document.querySelectorAll('.nav-btn[data-screen]').forEach((btn) => {
    if (navScreens.includes(btn.dataset.screen)) {
      btn.classList.toggle('active', btn.dataset.screen === name);
    }
  });
  els.appHeader.classList.toggle('hidden', ['form', 'detail', 'add'].includes(name));
  if (name === 'leads') refreshLeads();
  if (name === 'near') refreshNear();
  if (name === 'tasks') refreshTasks();
  if (name === 'more') refreshSettings();
}

async function openLeadDetail(lead) {
  state.detailLeadId = lead.id;
  const fresh = (await db.getLead(lead.id)) || lead;
  const funnelName = db.getFunnelName(state.funnels, fresh.funnelId);
  await renderLeadDetail(els.screenDetail, {
    lead: fresh,
    funnelName,
    onBack: () => {
      state.detailLeadId = null;
      showScreen('leads');
    },
    onEdit: (l) => openLeadForm(l, 'Edit lead'),
    onDelete: async (l) => {
      await db.deleteLead(l.id);
      state.detailLeadId = null;
      showToast('Lead deleted');
      showScreen('leads');
    },
    onRefresh: async (updated) => {
      const l = updated?.id ? updated : await db.getLead(state.detailLeadId);
      if (l) await openLeadDetail(l);
    },
  });
  showScreen('detail');
}

function openLeadForm(lead, title = 'New lead') {
  const isNew = !lead.id;
  const prevTemp = lead.temperature;
  state.formLead = { ...lead };
  if (!state.formLead.funnelId && state.funnels.length) {
    state.formLead.funnelId = state.funnels[0].id;
  }
  renderLeadForm(els.screenForm, {
    lead: state.formLead,
    funnels: state.funnels,
    title,
    onCancel: () => {
      if (lead.id) openLeadDetail(lead);
      else showScreen('add');
    },
    onSave: async (data) => {
      const saved = await saveLeadWithGeocode(data, { isNew, prevTemp: isNew ? null : prevTemp });
      showToast('Lead saved');
      await promptAddToContacts(saved);
      openLeadDetail(saved);
      return saved;
    },
  });
  showScreen('form');
}

async function refreshDueBanner() {
  const [dueLeads, openTasks] = await Promise.all([getDueFollowUps(), getOpenTasks()]);
  const dueTasks = openTasks.filter((t) => t.dueAt && new Date(t.dueAt) <= new Date());
  const count = dueLeads.length + dueTasks.length;
  if (!count) {
    els.dueBanner.classList.add('hidden');
    return;
  }
  els.dueBanner.classList.remove('hidden');
  els.dueBanner.classList.toggle('due-urgent', dueLeads.length > 0);
  els.dueBanner.textContent =
    dueLeads.length && dueTasks.length
      ? `${dueLeads.length} follow-up${dueLeads.length > 1 ? 's' : ''} & ${dueTasks.length} task${dueTasks.length > 1 ? 's' : ''} due — tap to view`
      : dueLeads.length
        ? `${dueLeads.length} follow-up${dueLeads.length > 1 ? 's' : ''} due — tap to view`
        : `${dueTasks.length} task${dueTasks.length > 1 ? 's' : ''} due — tap to view`;
}

async function refreshLeads() {
  await refreshDueBanner();
  const search = els.leadSearch.value;
  const funnelId = els.filterFunnel.value;
  let temperature = els.filterTemp.value;
  const includeDead = temperature === 'dead' || els.showDead?.checked;

  const leads = await getFilteredLeads({
    search,
    funnelId,
    temperature: temperature || '',
    includeDead,
  });

  const showDeadToggle = els.filterTemp.value !== 'dead';
  els.deadToggleWrap.classList.toggle('hidden', !showDeadToggle);

  renderLeadList(els.leadList, leads, state.funnels, {
    onLeadClick: openLeadDetail,
    emptyTitle: els.filterTemp.value === 'dead' ? 'No dead leads' : 'No leads yet',
    emptyHint:
      els.filterTemp.value === 'dead'
        ? 'Dead leads you mark will appear here.'
        : 'Tap + to scan a business card or add a lead manually.',
  });
}

async function refreshTasks() {
  const tasks = await getOpenTasks();
  const leads = await db.getAllLeads();
  const leadMap = Object.fromEntries(leads.map((l) => [l.id, l]));
  els.taskList.innerHTML = '';
  if (!tasks.length) {
    els.taskList.innerHTML = '<div class="empty-state"><p class="empty-title">No open tasks</p><p class="empty-hint">Add tasks from a lead or tap + Task.</p></div>';
    return;
  }
  for (const task of tasks) {
    const lead = task.leadId ? leadMap[task.leadId] : null;
    els.taskList.appendChild(
      renderTaskItem(task, {
        leadName: lead ? lead.name || lead.company : null,
        onToggle: async (t, done) => {
          await completeTask(t.id, done);
          refreshTasks();
          refreshDueBanner();
        },
        onOpenLead: (t) => {
          if (t.leadId && leadMap[t.leadId]) openLeadDetail(leadMap[t.leadId]);
        },
        onDelete: async (t) => {
          await deleteTask(t.id);
          refreshTasks();
        },
      })
    );
  }
}

async function refreshNear() {
  els.nearStatus.className = 'near-status';
  els.nearStatus.textContent = 'Getting your location…';
  try {
    if (!state.userLocation) state.userLocation = await getUserLocation();
    const { lat, lng } = state.userLocation;
    els.nearStatus.textContent = `Showing leads nearest to you (${lat.toFixed(2)}, ${lng.toFixed(2)})`;
    let all = await db.getAllLeads();
    all = all.filter((l) => l.temperature !== 'dead');
    const sorted = sortLeadsByDistance(all, lat, lng);
    renderLeadList(els.nearList, sorted, state.funnels, {
      showDistance: true,
      onLeadClick: openLeadDetail,
      emptyTitle: 'No leads with addresses',
      emptyHint: 'Add leads with city and address to see them here.',
    });
  } catch (err) {
    els.nearStatus.className = 'near-status near-error';
    els.nearStatus.textContent =
      err.code === 1
        ? 'Location denied. Enable location in Settings to find nearby leads.'
        : 'Could not get location. Tap refresh to try again.';
    els.nearList.innerHTML = '';
  }
}

async function refreshCity() {
  const query = els.citySearch.value;
  let all = await db.getAllLeads();
  all = all.filter((l) => l.temperature !== 'dead');
  const cities = getUniqueCities(all);
  els.citySuggestions.innerHTML = '';
  for (const city of cities.slice(0, 12)) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'city-chip' + (query.toLowerCase() === city.toLowerCase() ? ' active' : '');
    chip.textContent = city;
    chip.addEventListener('click', () => {
      els.citySearch.value = city;
      refreshCity();
    });
    els.citySuggestions.appendChild(chip);
  }
  const filtered = filterLeadsByCity(all, query);
  renderLeadList(els.cityList, filtered, state.funnels, {
    onLeadClick: openLeadDetail,
    emptyTitle: query ? `No leads in "${query}"` : 'Search a city',
    emptyHint: query ? 'Try a different city.' : 'Type a city name above.',
  });
}

async function refreshSettings() {
  state.funnels = await db.getAllFunnels();
  populateFunnelFilter();
  els.syncApiUrl.value = getSyncApiUrl();
  els.syncToken.value = getSyncToken();
  els.remindersEnabled.checked = remindersEnabled();
  const last = await getLastSyncedAt();
  els.syncStatusLabel.textContent = last
    ? `Last synced ${new Date(last).toLocaleString()}`
    : 'Not synced yet — set API URL & token, then Sync now';
  refreshCity();

  els.funnelList.innerHTML = '';
  for (const funnel of state.funnels) {
    const li = document.createElement('li');
    const input = document.createElement('input');
    input.type = 'text';
    input.value = funnel.name;
    input.addEventListener('change', async () => {
      try {
        await renameFunnel(funnel.id, input.value);
        state.funnels = await db.getAllFunnels();
        populateFunnelFilter();
        showToast('Funnel updated');
      } catch (e) {
        showToast(e.message);
      }
    });
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn-ghost';
    del.textContent = '×';
    del.setAttribute('aria-label', 'Delete funnel');
    del.addEventListener('click', async () => {
      try {
        await removeFunnel(funnel.id);
        await refreshSettings();
        showToast('Funnel removed');
      } catch (e) {
        showToast(e.message);
      }
    });
    li.appendChild(input);
    li.appendChild(del);
    els.funnelList.appendChild(li);
  }
}

function populateFunnelFilter() {
  const current = els.filterFunnel.value;
  els.filterFunnel.innerHTML = '<option value="">All funnels</option>';
  for (const f of state.funnels) {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.name;
    if (f.id === current) opt.selected = true;
    els.filterFunnel.appendChild(opt);
  }
}

function showScanOverlay(show, text = 'Reading card…') {
  els.scanOverlay.classList.toggle('hidden', !show);
  els.scanStatus.textContent = text;
}

async function handleCardFile(file) {
  if (!file) return;
  showScanOverlay(true, 'Preparing image…');
  try {
    const blob = await compressImage(file);
    const thumb = await readFileAsDataUrl(blob);
    showScanOverlay(true, 'Reading card… 0%');
    const onProgress = (e) => {
      els.scanStatus.textContent = `Reading card… ${e.detail.pct}%`;
    };
    document.addEventListener('ocr-progress', onProgress);
    const fields = await scanBusinessCard(blob);
    document.removeEventListener('ocr-progress', onProgress);
    showScanOverlay(false);
    openLeadForm(
      { ...emptyLead(), ...fields, cardImage: thumb, funnelId: state.funnels[0]?.id || '' },
      'Review card'
    );
  } catch (err) {
    showScanOverlay(false);
    showToast('Could not read card. Try again or enter manually.');
    console.error(err);
  }
}

function pickCardSource() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card">
      <h3>Business card</h3>
      <p>Take a new photo or choose one from your gallery.</p>
      <div class="modal-actions" style="flex-direction:column">
        <button type="button" class="btn-primary camera-btn">Take photo</button>
        <button type="button" class="btn-secondary gallery-btn">Choose from gallery</button>
        <button type="button" class="btn-ghost cancel-btn">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.camera-btn').addEventListener('click', () => {
    close();
    els.cardCamera.click();
  });
  overlay.querySelector('.gallery-btn').addEventListener('click', () => {
    close();
    els.cardGallery.click();
  });
  overlay.querySelector('.cancel-btn').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
}

function showGlobalTaskModal() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const localVal = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card">
      <h3>New task</h3>
      <div class="form-group">
        <label>Task</label>
        <input type="text" id="gt-title" placeholder="What needs to be done?">
      </div>
      <div class="form-group">
        <label>Due</label>
        <input type="datetime-local" id="gt-due" value="${localVal}">
      </div>
      <div class="modal-actions">
        <button type="button" class="btn-secondary cancel-btn">Cancel</button>
        <button type="button" class="btn-primary save-btn">Add</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.cancel-btn').addEventListener('click', close);
  overlay.querySelector('.save-btn').addEventListener('click', async () => {
    const title = overlay.querySelector('#gt-title').value.trim();
    const due = overlay.querySelector('#gt-due').value;
    if (!title) return;
    await createTask({ title, dueAt: due ? new Date(due).toISOString() : null });
    close();
    showToast('Task added');
    refreshTasks();
    refreshDueBanner();
  });
}

async function tryAutoSync() {
  if (!getSyncApiUrl() || !getSyncToken()) return;
  try {
    await syncNow();
    const last = await getLastSyncedAt();
    if (els.syncStatusLabel && last) {
      els.syncStatusLabel.textContent = `Last synced ${new Date(last).toLocaleString()}`;
    }
  } catch (e) {
    console.warn('Auto-sync skipped:', e.message);
  }
}

function bindEvents() {
  document.querySelectorAll('.nav-btn[data-screen]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const screen = btn.dataset.screen;
      if (screen === 'add') showScreen('add');
      else showScreen(screen);
    });
  });

  els.dueBanner.addEventListener('click', () => showScreen('tasks'));
  els.leadSearch.addEventListener('input', () => refreshLeads());
  els.filterFunnel.addEventListener('change', () => refreshLeads());
  els.filterTemp.addEventListener('change', () => refreshLeads());
  els.showDead.addEventListener('change', () => refreshLeads());
  els.nearRefresh.addEventListener('click', () => {
    state.userLocation = null;
    refreshNear();
  });
  els.citySearch.addEventListener('input', () => refreshCity());
  els.addBack.addEventListener('click', () => showScreen('leads'));
  els.optScan.addEventListener('click', pickCardSource);
  els.optManual.addEventListener('click', () => openLeadForm(emptyLead(), 'New lead'));
  els.moreScan.addEventListener('click', () => {
    showScreen('add');
    pickCardSource();
  });
  els.moreManual.addEventListener('click', () => openLeadForm(emptyLead(), 'New lead'));
  els.addTaskGlobal.addEventListener('click', showGlobalTaskModal);
  els.cardCamera.addEventListener('change', (e) => handleCardFile(e.target.files[0]));
  els.cardGallery.addEventListener('change', (e) => handleCardFile(e.target.files[0]));

  els.exportBtn.addEventListener('click', async () => {
    await exportAllData();
    showToast('Backup downloaded');
  });
  els.importFile.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const result = await importAllData(file);
      state.funnels = await db.getAllFunnels();
      populateFunnelFilter();
      showToast(`Imported ${result.leads} leads`);
      showScreen('leads');
    } catch (err) {
      showToast(err.message || 'Import failed');
    }
    e.target.value = '';
  });
  els.seedBtn.addEventListener('click', async () => {
    if (!confirm('Load demo leads? Existing leads will remain.')) return;
    const count = await loadDemoData();
    showToast(`Added ${count} demo leads`);
    refreshLeads();
  });
  els.clearBtn.addEventListener('click', async () => {
    if (!confirm('Delete ALL data? This cannot be undone.')) return;
    await clearAllData();
    state.funnels = await db.getAllFunnels();
    populateFunnelFilter();
    showToast('All data cleared');
    refreshLeads();
  });
  els.addFunnelBtn.addEventListener('click', async () => {
    const name = els.newFunnelName.value.trim();
    if (!name) return;
    await addFunnel(name);
    els.newFunnelName.value = '';
    await refreshSettings();
    showToast('Funnel added');
  });

  els.syncNowBtn.addEventListener('click', async () => {
    setSyncCredentials(els.syncApiUrl.value, els.syncToken.value);
    try {
      await requestNotificationPermission();
      const last = await syncNow();
      els.syncStatusLabel.textContent = `Last synced ${new Date(last).toLocaleString()}`;
      showToast('Synced to cloud');
      refreshLeads();
    } catch (err) {
      showToast(err.message || 'Sync failed');
    }
  });

  els.remindersEnabled.addEventListener('change', (e) => {
    setRemindersEnabled(e.target.checked);
    if (e.target.checked) requestNotificationPermission();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tryAutoSync();
  });
}

function cacheElements() {
  els.appHeader = $('app-header');
  els.dueBanner = $('due-banner');
  els.leadSearch = $('lead-search');
  els.filterFunnel = $('filter-funnel');
  els.filterTemp = $('filter-temp');
  els.showDead = $('show-dead');
  els.deadToggleWrap = $('dead-toggle-wrap');
  els.leadList = $('lead-list');
  els.nearStatus = $('near-status');
  els.nearRefresh = $('near-refresh');
  els.nearList = $('near-list');
  els.taskList = $('task-list');
  els.addTaskGlobal = $('add-task-global');
  els.citySearch = $('city-search');
  els.citySuggestions = $('city-suggestions');
  els.cityList = $('city-list');
  els.funnelList = $('funnel-list');
  els.newFunnelName = $('new-funnel-name');
  els.addFunnelBtn = $('add-funnel-btn');
  els.exportBtn = $('export-btn');
  els.importFile = $('import-file');
  els.seedBtn = $('seed-btn');
  els.clearBtn = $('clear-btn');
  els.syncApiUrl = $('sync-api-url');
  els.syncToken = $('sync-token');
  els.syncNowBtn = $('sync-now-btn');
  els.syncStatusLabel = $('sync-status-label');
  els.remindersEnabled = $('reminders-enabled');
  els.addBack = $('add-back');
  els.optScan = $('opt-scan');
  els.optManual = $('opt-manual');
  els.moreScan = $('more-scan');
  els.moreManual = $('more-manual');
  els.screenForm = $('screen-form');
  els.screenDetail = $('screen-detail');
  els.scanOverlay = $('scan-overlay');
  els.scanStatus = $('scan-status');
  els.cardCamera = $('card-camera');
  els.cardGallery = $('card-gallery');
  els.toast = $('toast');
}

async function maybeAutoSeed() {
  const leads = await db.getAllLeads();
  const seeded = await db.getMeta('seeded');
  const autoSeeded = await db.getMeta('autoSeeded');
  if (!leads.length && !seeded && !autoSeeded) {
    await seedDemoData(db);
    await db.setMeta('autoSeeded', true);
  }
}

async function init() {
  cacheElements();
  bindEvents();
  await db.initDb();
  state.funnels = await db.getAllFunnels();
  populateFunnelFilter();
  await maybeAutoSeed();
  state.funnels = await db.getAllFunnels();
  populateFunnelFilter();
  startReminderLoop(() => refreshDueBanner());
  await requestNotificationPermission();
  showScreen('leads');
  tryAutoSync();
}

init().catch((err) => {
  console.error(err);
  alert('Prospectus failed to start. Try refreshing the page.');
});
