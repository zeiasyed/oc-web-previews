let tesseractWorker = null;

async function getWorker() {
  if (tesseractWorker) return tesseractWorker;
  const { createWorker } = Tesseract;
  tesseractWorker = await createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        const pct = Math.round((m.progress || 0) * 100);
        document.dispatchEvent(new CustomEvent('ocr-progress', { detail: { pct } }));
      }
    },
  });
  return tesseractWorker;
}

export async function terminateOcr() {
  if (tesseractWorker) {
    await tesseractWorker.terminate();
    tesseractWorker = null;
  }
}

function parseFields(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 1);

  const joined = lines.join('\n');
  const emailMatch = joined.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const phoneMatch = joined.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  const zipMatch = joined.match(/\b(\d{5})(?:-\d{4})?\b/);
  const stateMatch = joined.match(/\b([A-Z]{2})\s+\d{5}\b/);

  let email = emailMatch ? emailMatch[0] : '';
  let phone = phoneMatch ? phoneMatch[0] : '';
  let zip = zipMatch ? zipMatch[1] : '';
  let state = stateMatch ? stateMatch[1] : '';

  const emailLine = lines.findIndex((l) => l.includes(email));
  const phoneLine = lines.findIndex((l) => phone && l.includes(phone.replace(/\D/g, '').slice(-7)));
  const addressLines = lines.filter((l, i) => {
    if (email && l.includes(email)) return false;
    if (phone && l.replace(/\D/g, '').includes(phone.replace(/\D/g, '').slice(-7))) return false;
    return /\d/.test(l) || /\b(st|street|ave|avenue|blvd|boulevard|dr|drive|rd|road|suite|ste|floor)\b/i.test(l);
  });

  let address = '';
  let city = '';
  if (addressLines.length) {
    const addrLine = addressLines[0];
    address = addrLine.replace(/,?\s*[A-Z]{2}\s+\d{5}.*$/, '').trim();
    const cityStateZip = addressLines.find((l) => /[A-Z]{2}\s+\d{5}/.test(l)) || addrLine;
    const cityMatch = cityStateZip.match(/,\s*([^,]+?)\s*,?\s*[A-Z]{2}\s+\d{5}/);
    if (cityMatch) city = cityMatch[1].trim();
    else {
      const parts = cityStateZip.split(',');
      if (parts.length >= 2) city = parts[parts.length - 2].replace(/\d/g, '').trim();
    }
  }

  const usedLines = new Set([emailLine, phoneLine].filter((i) => i >= 0));
  const nameCandidates = lines.filter((l, i) => {
    if (usedLines.has(i)) return false;
    if (email && l.includes(email)) return false;
    if (phone && l.includes(phone.slice(-4))) return false;
    if (addressLines.includes(l)) return false;
    if (/^www\.|https?:\/\//i.test(l)) return false;
    if (/@/.test(l)) return false;
    return l.length > 2 && l.length < 50;
  });

  let name = nameCandidates[0] || '';
  let title = '';
  let company = '';

  if (nameCandidates.length >= 2) {
    const second = nameCandidates[1];
    if (/director|manager|president|ceo|cto|vp|dr\.|md|phd|coordinator|investigator/i.test(second)) {
      title = second;
      company = nameCandidates[2] || '';
    } else {
      company = second;
      title = nameCandidates[2] && /director|manager|president|ceo|vp|dr\./i.test(nameCandidates[2]) ? nameCandidates[2] : '';
    }
  }

  if (!company && nameCandidates.length >= 2) {
    company = nameCandidates.find((l) => l !== name && l !== title) || '';
  }

  return { name, company, title, phone, email, address, city, state, zip, rawText: joined };
}

export async function scanBusinessCard(fileOrBlob) {
  const worker = await getWorker();
  const { data } = await worker.recognize(fileOrBlob);
  const fields = parseFields(data.text || '');
  return fields;
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function compressImage(file, maxWidth = 800) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Could not compress image'))),
        'image/jpeg',
        0.85
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not load image'));
    };
    img.src = url;
  });
}
