import { CONFIG } from './config.js';

function pad(n) {
  return String(n).padStart(2, '0');
}

/** UTC stamp for Google Calendar / ICS: YYYYMMDDTHHmmssZ */
export function toCalStamp(date) {
  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z'
  );
}

export function buildVisitEvent(lead, { start, durationMinutes = 60, notes = '' } = {}) {
  const startDate = start instanceof Date ? start : new Date(start);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
  const location = [lead.address, lead.city, lead.state, lead.zip].filter(Boolean).join(', ');
  const title = `Site visit: ${lead.company || lead.name || 'Lead'}`;
  const details = [
    `Contact: ${lead.name || ''}`,
    lead.phone ? `Phone: ${lead.phone}` : '',
    lead.email ? `Email: ${lead.email}` : '',
    notes,
    '',
    `Scheduled via Prospectus (${CONFIG.USER_EMAIL})`,
  ]
    .filter(Boolean)
    .join('\n');

  return { title, location, details, startDate, endDate };
}

export function googleCalendarUrl(event) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${toCalStamp(event.startDate)}/${toCalStamp(event.endDate)}`,
    details: event.details,
    location: event.location || '',
    add: CONFIG.USER_EMAIL,
    src: CONFIG.USER_EMAIL,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

export function outlookCalendarUrl(event) {
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title,
    startdt: event.startDate.toISOString(),
    enddt: event.endDate.toISOString(),
    body: event.details,
    location: event.location || '',
  });
  return `https://outlook.office.com/calendar/0/deeplink/compose?${params}`;
}

export function outlookMailUrl(lead, { body = '' } = {}) {
  const first = lead.name?.split(' ')[0] || '';
  const defaultBody = body || `Hi ${first},\n\n`;
  const to = encodeURIComponent(lead.email || '');
  const encodedBody = encodeURIComponent(defaultBody);
  return `https://outlook.office.com/mail/deeplink/compose?to=${to}&body=${encodedBody}`;
}

function icsEscape(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

export function downloadIcs(event, filename = 'site-visit.ics') {
  const uid = `${Date.now()}@prospectus-crm`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Prospectus CRM//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toCalStamp(new Date())}`,
    `DTSTART:${toCalStamp(event.startDate)}`,
    `DTEND:${toCalStamp(event.endDate)}`,
    `SUMMARY:${icsEscape(event.title)}`,
    `DESCRIPTION:${icsEscape(event.details)}`,
    `LOCATION:${icsEscape(event.location)}`,
    `ORGANIZER;CN=${icsEscape(CONFIG.USER_NAME)}:mailto:${CONFIG.USER_EMAIL}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
