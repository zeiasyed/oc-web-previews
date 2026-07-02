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

const SCREENS = {
  leads: 'screen-leads',
  near: 'screen-near',
  city: 'screen-city',
  more: 'screen-more',
  add: 'screen-add',
  form: 'screen-form',
  detail: 'screen-detail',
};

let state = {
  screen: 'leads',
  funnels: [],
  editingLead: null,
  formLead: null,
  userLocation: null,
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
  const navScreens = ['leads', 'near', 'city', 'more', 'add'];
  document.querySelectorAll('.nav-btn[data-screen]').forEach((btn) => {
    if (navScreens.includes(btn.dataset.screen)) {
      btn.classList.toggle('active', btn.dataset.screen === name);
    }
  });
  els.appHeader.classList.toggle('hidden', ['form', 'detail', 'add'].includes(name));
  if (name === 'leads') refreshLeads();
  if (name === 'near') refreshNear();
  if (name === 'city') refreshCity();
  if (name === 'more') refreshSettings();
}

function openLeadDetail(lead) {
  const funnelName = db.getFunnelName(state.funnels, lead.funnelId);
  renderLeadDetail(els.screenDetail, {
    lead,
    funnelName,
    onBack: () => showScreen('leads'),
    onEdit: (l) => openLeadForm(l, 'Edit lead'),
    onDelete: async (l) => {
      await db.deleteLead(l.id);
      showToast('Lead deleted');
      showScreen('leads');
    },
  });
  showScreen('detail');
}

function openLeadForm(lead, title = 'New lead') {
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
      else showScreen(state.editingLead ? 'leads' : 'add');
    },
    onSave: async (data) => {
      const saved = await saveLeadWithGeocode(data);
      showToast('Lead saved');
      await promptAddToContacts(saved);
      openLeadDetail(saved);
      return saved;
    },
  });
  showScreen('form');
}

async function refreshLeads() {
  const search = els.leadSearch.value;
  const funnelId = els.filterFunnel.value;
  let temperature = els.filterTemp.value;
  const includeDead = temperature === 'dead' || els.showDead?.checked;
  if (temperature === 'dead') temperature = 'dead';

  const leads = await getFilteredLeads({
    search,
    funnelId,
    temperature: temperature || '',
    includeDead,
  });

  const showDeadToggle = els.filterTemp.value !== 'dead';
  els.deadToggleWrap.classList.toggle('hidden', !showDeadToggle);
  if (els.filterTemp.value !== 'dead' && !els.showDead.checked) {
    /* dead already excluded in filterLeads */
  }

  renderLeadList(els.leadList, leads, state.funnels, {
    onLeadClick: openLeadDetail,
    emptyTitle: els.filterTemp.value === 'dead' ? 'No dead leads' : 'No leads yet',
    emptyHint:
      els.filterTemp.value === 'dead'
        ? 'Dead leads you mark will appear here.'
        : 'Tap + to scan a business card or add a lead manually.',
  });
}

async function refreshNear() {
  els.nearStatus.className = 'near-status';
  els.nearStatus.textContent = 'Getting your location…';

  try {
    if (!state.userLocation) {
      state.userLocation = await getUserLocation();
    }
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
    emptyHint: query
      ? 'Try a different city or add leads with that city.'
      : 'Type a city name or tap a suggestion above.',
  });
}

async function refreshSettings() {
  state.funnels = await db.getAllFunnels();
  populateFunnelFilter();
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
    const lead = {
      ...emptyLead(),
      ...fields,
      cardImage: thumb,
      funnelId: state.funnels[0]?.id || '',
    };
    openLeadForm(lead, 'Review card');
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

function bindEvents() {
  document.querySelectorAll('.nav-btn[data-screen]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const screen = btn.dataset.screen;
      if (screen === 'add') showScreen('add');
      else showScreen(screen);
    });
  });

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
    if (!confirm('Delete ALL leads and reset funnels? This cannot be undone.')) return;
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
}

function cacheElements() {
  els.appHeader = $('app-header');
  els.leadSearch = $('lead-search');
  els.filterFunnel = $('filter-funnel');
  els.filterTemp = $('filter-temp');
  els.showDead = $('show-dead');
  els.deadToggleWrap = $('dead-toggle-wrap');
  els.leadList = $('lead-list');
  els.nearStatus = $('near-status');
  els.nearRefresh = $('near-refresh');
  els.nearList = $('near-list');
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
  showScreen('leads');
}

init().catch((err) => {
  console.error(err);
  alert('Prospectus failed to start. Try refreshing the page.');
});
