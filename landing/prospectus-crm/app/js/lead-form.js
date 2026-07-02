import * as db from './db.js';
import { geocodeLead } from './geo.js';
import { downloadVcard, shareVcard } from './vcard.js';
import { TEMPERATURES, tempLabel, tempClass } from './settings.js';
import { esc } from './leads.js';

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
    const saved = await onSave({
      ...lead,
      ...data,
      lat: lead.lat,
      lng: lead.lng,
      cardImage: lead.cardImage,
    });
    return saved;
  });
}

export function renderLeadDetail(container, { lead, funnelName, onEdit, onDelete, onBack }) {
  const mapsParts = [lead.address, lead.city, lead.state, lead.zip].filter(Boolean).join(', ');
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
        </div>
      </div>
      <div class="detail-actions">
        ${lead.phone ? `<a href="tel:${esc(lead.phone)}" class="action-btn">Call</a>` : ''}
        ${lead.email ? `<a href="mailto:${esc(lead.email)}" class="action-btn">Email</a>` : ''}
        ${mapsParts ? `<a href="https://maps.google.com/?q=${encodeURIComponent(mapsParts)}" class="action-btn" target="_blank" rel="noopener">Maps</a>` : ''}
      </div>
      <dl class="detail-fields">
        ${lead.phone ? `<div><dt>Phone</dt><dd>${esc(lead.phone)}</dd></div>` : ''}
        ${lead.email ? `<div><dt>Email</dt><dd>${esc(lead.email)}</dd></div>` : ''}
        ${mapsParts ? `<div><dt>Address</dt><dd>${esc(mapsParts)}</dd></div>` : ''}
        ${lead.city ? `<div><dt>City</dt><dd>${esc(lead.city)}</dd></div>` : ''}
        ${lead.notes ? `<div><dt>Notes</dt><dd>${esc(lead.notes)}</dd></div>` : ''}
      </dl>
      <div class="detail-contact-actions">
        <button type="button" class="btn-primary vcard-btn">Add to iPhone Contacts</button>
        <button type="button" class="btn-secondary share-btn">Share contact</button>
      </div>
      <button type="button" class="btn-danger delete-btn">Delete lead</button>
    </div>
  `;

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
}

export async function saveLeadWithGeocode(leadData) {
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
      /* geocode optional */
    }
  }
  return db.putLead({ ...leadData, lat, lng });
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
