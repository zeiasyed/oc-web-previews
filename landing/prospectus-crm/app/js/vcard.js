function escapeVcard(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

export function leadToVcard(lead) {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  if (lead.name) lines.push(`FN:${escapeVcard(lead.name)}`);
  if (lead.name) {
    const parts = lead.name.trim().split(/\s+/);
    const last = parts.length > 1 ? parts.pop() : '';
    const first = parts.join(' ') || last;
    lines.push(`N:${escapeVcard(last)};${escapeVcard(first)};;;`);
  }
  if (lead.company) lines.push(`ORG:${escapeVcard(lead.company)}`);
  if (lead.title) lines.push(`TITLE:${escapeVcard(lead.title)}`);
  if (lead.phone) lines.push(`TEL;TYPE=CELL:${escapeVcard(lead.phone)}`);
  if (lead.email) lines.push(`EMAIL;TYPE=INTERNET:${escapeVcard(lead.email)}`);
  const street = lead.address || '';
  const city = lead.city || '';
  const state = lead.state || '';
  const zip = lead.zip || '';
  if (street || city || state || zip) {
    lines.push(`ADR;TYPE=WORK:;;${escapeVcard(street)};${escapeVcard(city)};${escapeVcard(state)};${escapeVcard(zip)};`);
  }
  if (lead.notes) lines.push(`NOTE:${escapeVcard(lead.notes)}`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

export function downloadVcard(lead) {
  const vcf = leadToVcard(lead);
  const blob = new Blob([vcf], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = (lead.name || 'contact').replace(/[^\w\s-]/g, '').trim() || 'contact';
  a.href = url;
  a.download = `${safeName}.vcf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function shareVcard(lead) {
  const vcf = leadToVcard(lead);
  const safeName = (lead.name || 'contact').replace(/[^\w\s-]/g, '').trim() || 'contact';
  const file = new File([vcf], `${safeName}.vcf`, { type: 'text/vcard' });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      title: lead.name || 'Contact',
      text: lead.company ? `${lead.name} — ${lead.company}` : lead.name,
      files: [file],
    });
    return true;
  }
  if (navigator.share) {
    await navigator.share({
      title: lead.name || 'Contact',
      text: vcf,
    });
    return true;
  }
  downloadVcard(lead);
  return false;
}
