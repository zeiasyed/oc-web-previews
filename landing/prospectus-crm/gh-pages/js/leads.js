import * as db from './db.js';
import { tempLabel, tempClass } from './settings.js';
import { formatDistance } from './geo.js';

export function renderLeadCard(lead, funnelName, { showDistance = false, onClick } = {}) {
  const el = document.createElement('article');
  el.className = 'lead-card';
  el.dataset.id = lead.id;
  const dist =
    showDistance && lead.distanceMiles != null
      ? `<span class="lead-distance">${formatDistance(lead.distanceMiles)}</span>`
      : '';
  const followUpDue =
    lead.followUpAt && new Date(lead.followUpAt) <= new Date() && lead.temperature !== 'dead';
  el.innerHTML = `
    <div class="lead-card-top">
      <div>
        <h3 class="lead-name">${esc(lead.name || 'Unnamed')}</h3>
        <p class="lead-company">${esc(lead.company || '')}</p>
      </div>
      ${dist}
    </div>
    <div class="lead-card-meta">
      <span class="funnel-pill">${esc(funnelName)}</span>
      <span class="temp-pill ${tempClass(lead.temperature)}">${esc(tempLabel(lead.temperature))}</span>
      ${lead.city ? `<span class="city-pill">${esc(lead.city)}</span>` : ''}
      ${followUpDue ? '<span class="followup-pill followup-due">Follow up</span>' : ''}
    </div>
  `;
  el.addEventListener('click', () => onClick?.(lead));
  return el;
}

export function renderLeadList(container, leads, funnels, options = {}) {
  container.innerHTML = '';
  if (!leads.length) {
    container.innerHTML = `
      <div class="empty-state">
        <p class="empty-title">${options.emptyTitle || 'No leads yet'}</p>
        <p class="empty-hint">${options.emptyHint || 'Tap + to scan a business card or add a lead manually.'}</p>
      </div>
    `;
    return;
  }
  const funnelMap = Object.fromEntries(funnels.map((f) => [f.id, f.name]));
  for (const lead of leads) {
    container.appendChild(
      renderLeadCard(lead, funnelMap[lead.funnelId] || 'Uncategorized', {
        showDistance: options.showDistance,
        onClick: options.onLeadClick,
      })
    );
  }
}

export async function getFilteredLeads(filters) {
  const all = await db.getAllLeads();
  return db.filterLeads(all, filters);
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

export { esc };
