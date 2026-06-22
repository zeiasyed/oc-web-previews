(function (global) {
  "use strict";

  const VIN_RE = /\b[A-HJ-NPR-Z0-9]{17}\b/i;
  const DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{4}$/;

  const DEFAULT_COMPANY = {
    name: "ReNu Car",
    lines: ["17337 Aspenglow Ln", "Yorba Linda, CA  92886-2211", "www.renucar.com"],
  };

  const DEFAULT_REMIT = [
    "REMIT TO:",
    "By Wire Transfer:",
    "ReNu Car",
    "Routing No.: 021000021",
    "JPMorgan Chase Bank",
    "Account: 737779507",
    "By Check:",
    "Payable to : ReNu Car",
    "Mail to :",
    "17337 Aspenglow Lane",
    "Yorba Linda, CA 92886",
    "Point of Contact:",
    "Zeia Syed",
    "714.686.4196",
    "zeia.renucar@gmail.com",
  ];

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "$0.00";
    return v.toLocaleString("en-US", { style: "currency", currency: "USD" });
  }

  function parseMoney(text) {
    const m = String(text || "").replace(/[^0-9.\-]/g, "");
    const v = parseFloat(m);
    return Number.isFinite(v) ? v : 0;
  }

  function fmtDisplayDate(isoOrText) {
    if (!isoOrText) return "";
    const s = String(isoOrText).trim();
    if (DATE_RE.test(s)) return s;
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
    }
    return s;
  }

  function cleanLines(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !/^page \d+ of \d+$/i.test(l));
  }

  function valueAfterLabel(lines, label, startAt) {
    const needle = label.toLowerCase();
    for (let i = startAt || 0; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase();
      if (lower === needle) {
        return lines[i + 1] || "";
      }
      if (lower.startsWith(needle + " ")) {
        return line.slice(label.length).trim();
      }
    }
    return "";
  }

  function parseVehicleRows(lines, startIdx) {
    const vehicles = [];
    let i = startIdx;
    while (i < lines.length) {
      if (/^remit to/i.test(lines[i]) || /^balance due/i.test(lines[i])) break;
      if (!DATE_RE.test(lines[i])) {
        i += 1;
        continue;
      }
      const dateOrdered = lines[i];
      const vehicle = lines[i + 1] || "";
      const vinLine = lines[i + 2] || "";
      const stockLine = lines[i + 3] || "";
      const amountLine = lines[i + 4] || "";
      const vinMatch = vinLine.match(VIN_RE);
      if (!vinMatch || !/^\d/.test(amountLine)) {
        i += 1;
        continue;
      }
      vehicles.push({
        dateOrdered,
        vehicle,
        vin: vinMatch[0].toUpperCase(),
        stockNo: stockLine.replace(/^stock no\.?\s*/i, "").trim(),
        amount: parseMoney(amountLine),
      });
      i += 5;
    }
    return vehicles;
  }

  function parseRenuInvoiceText(text) {
    const lines = cleanLines(text);
    let billToLines = [];
    let companyLines = [];
    let remitLines = [];
    let invoiceNumber = "";
    let invoiceDate = "";
    let terms = "";
    let dueDate = "";
    let balanceDue = 0;

    let phase = "header";
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^bill to$/i.test(line)) {
        phase = "billto";
        continue;
      }
      if (/^invoice\b/i.test(line)) {
        phase = "meta";
        const inline = line.replace(/^invoice\s*/i, "").trim();
        if (inline) invoiceNumber = inline;
        else if (lines[i + 1] && !/^(date|terms|due date)$/i.test(lines[i + 1])) {
          invoiceNumber = lines[i + 1];
        }
        continue;
      }
      if (/^date ordered$/i.test(line) && lines[i + 1] === "VEHICLE") {
        phase = "table";
        break;
      }
      if (phase === "header" && !/^bill to$/i.test(line)) {
        companyLines.push(line);
      } else if (phase === "billto") {
        if (/^invoice\b/i.test(line)) {
          phase = "meta";
          const inline = line.replace(/^invoice\s*/i, "").trim();
          if (inline) invoiceNumber = inline;
          else if (lines[i + 1] && !/^(date|terms|due date)$/i.test(lines[i + 1])) {
            invoiceNumber = lines[i + 1];
          }
          continue;
        }
        billToLines.push(line);
      }
    }

    invoiceDate = valueAfterLabel(lines, "DATE", 0);
    terms = valueAfterLabel(lines, "TERMS", 0);
    dueDate = valueAfterLabel(lines, "DUE DATE", 0);

    if (!invoiceNumber) {
      for (let i = 0; i < lines.length; i++) {
        if (/^ATI-/i.test(lines[i])) {
          invoiceNumber = lines[i];
          break;
        }
      }
    }

    const tableStart = lines.findIndex((l, idx) => l === "AMOUNT" && lines[idx - 3] === "DATE ORDERED");
    const vehicles = tableStart >= 0 ? parseVehicleRows(lines, tableStart + 1) : [];

    let inRemit = false;
    for (let i = 0; i < lines.length; i++) {
      if (/^remit to/i.test(lines[i])) inRemit = true;
      if (/^balance due/i.test(lines[i])) {
        balanceDue = parseMoney(lines[i + 1] || lines[i]);
        inRemit = false;
        continue;
      }
      if (inRemit) remitLines.push(lines[i]);
    }

    if (!balanceDue && vehicles.length) {
      balanceDue = vehicles.reduce((s, v) => s + v.amount, 0);
    }

    const companyName = companyLines[0] || DEFAULT_COMPANY.name;
    const companyAddress = companyLines.slice(1);

    return {
      format: "renu-ati",
      rawText: text,
      invoiceNumber,
      invoiceDate,
      terms,
      dueDate,
      companyName,
      companyAddress,
      billTo: billToLines.join("\n"),
      remitTo: remitLines.length ? remitLines : DEFAULT_REMIT.slice(1),
      vehicles,
      balanceDue,
      lineItems: vehicles.map((v) => ({
        description: v.vehicle + " | VIN " + v.vin + (v.stockNo ? " | Stock " + v.stockNo : ""),
        qty: 1,
        rate: v.amount,
        amount: v.amount,
        vehicle: v,
      })),
      subtotal: balanceDue,
      tax: 0,
      total: balanceDue,
    };
  }

  function parseQuickBooksLineItems(text) {
    const lines = cleanLines(text);
    const lineItems = [];
    let invoiceNumber = "";
    let invoiceDate = "";
    let billToLines = [];
    let inBillTo = false;

    for (const line of lines) {
      if (!invoiceNumber && /invoice\s*(#|no\.?|number)?\s*[:\s]*/i.test(line)) {
        invoiceNumber = line.replace(/.*invoice\s*(#|no\.?|number)?\s*[:\s]*/i, "").trim();
        continue;
      }
      if (!invoiceDate && /^(invoice\s*)?date\s*[:\s]/i.test(line)) {
        invoiceDate = line.replace(/^(invoice\s*)?date\s*[:\s]*/i, "").trim();
        continue;
      }
      if (/^bill to/i.test(line)) {
        inBillTo = true;
        const rest = line.replace(/^bill to\s*[:\s]*/i, "").trim();
        if (rest) billToLines.push(rest);
        continue;
      }
      if (inBillTo) {
        if (/^(ship to|product|service|description|qty|amount|subtotal|total|balance|date ordered)/i.test(line)) {
          inBillTo = false;
        } else {
          billToLines.push(line);
          continue;
        }
      }
      const amountMatch = line.match(/(-?\$?\d[\d,]*\.\d{2})\s*$/);
      if (amountMatch) {
        const amount = parseMoney(amountMatch[1]);
        const left = line.slice(0, line.length - amountMatch[0].length).trim();
        if (left) lineItems.push({ description: left, qty: 1, rate: amount, amount });
      }
    }

    return {
      format: "generic",
      invoiceNumber,
      invoiceDate,
      companyName: DEFAULT_COMPANY.name,
      companyAddress: DEFAULT_COMPANY.lines,
      billTo: billToLines.join("\n"),
      remitTo: DEFAULT_REMIT.slice(1),
      vehicles: [],
      lineItems,
      subtotal: lineItems.reduce((s, li) => s + li.amount, 0),
      tax: 0,
      total: lineItems.reduce((s, li) => s + li.amount, 0),
      terms: "",
      dueDate: "",
      balanceDue: 0,
    };
  }

  function parseInvoiceText(text) {
    const renu = parseRenuInvoiceText(text);
    if (renu.vehicles.length > 0) return renu;
    const generic = parseQuickBooksLineItems(text);
    if (generic.lineItems.length) return generic;
    return renu;
  }

  function toMdy(value) {
    if (!value) return "";
    const s = String(value).trim();
    if (DATE_RE.test(s)) return s;
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return mm + "/" + dd + "/" + d.getFullYear();
    }
    return s;
  }

  function addDaysMdy(mdy, days) {
    const d = new Date(mdy);
    if (Number.isNaN(d.getTime())) {
      const m = String(mdy).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!m) return "";
      d.setFullYear(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
    }
    d.setDate(d.getDate() + days);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return mm + "/" + dd + "/" + d.getFullYear();
  }

  function parsedFromAriGroup(group) {
    const invoiceDate = toMdy(group.dateOrdered);
    const terms = group.terms || "Net 30";
    let dueDate = toMdy(group.dueDate);
    if (!dueDate && invoiceDate) dueDate = addDaysMdy(invoiceDate, 30);

    const vehicles = (group.cars || []).map((car) => ({
      dateOrdered: toMdy(car.dateOrdered || group.dateOrdered),
      vehicle: car.vehicle || [car.year, car.make, car.model].filter(Boolean).join(" "),
      vin: (car.vin || "").toUpperCase(),
      stockNo: car.stockNo || (car.vin ? car.vin.slice(-6) : ""),
      amount: Number(car.amount) || 0,
    }));

    const balanceDue = vehicles.reduce((sum, v) => sum + v.amount, 0);

    return {
      format: "renu-ati",
      invoiceNumber: group.invoiceNumber || "",
      invoiceDate,
      terms,
      dueDate,
      companyName: DEFAULT_COMPANY.name,
      companyAddress: DEFAULT_COMPANY.lines,
      billTo: group.billTo || group.clientName || "",
      clientName: group.clientName || "",
      remitTo: DEFAULT_REMIT.slice(1),
      vehicles,
      balanceDue,
      subtotal: balanceDue,
      tax: 0,
      total: balanceDue,
    };
  }

  function splitAriGroup(group, options) {
    const parsed = parsedFromAriGroup(group);
    return splitInvoice(parsed, options);
  }

  function splitInvoice(parsed, options) {
    if (parsed.format === "renu-ati" && parsed.vehicles.length) {
      return splitRenuVehicles(parsed, options);
    }
    return splitGenericLineItems(parsed, options);
  }

  function splitRenuVehicles(parsed, options) {
    const numbering = options?.numbering || "same";
    return parsed.vehicles.map((row, idx) => {
      let invoiceNumber = parsed.invoiceNumber || "Invoice";
      if (numbering === "suffix") invoiceNumber += "-" + (idx + 1);
      else if (numbering === "vin") invoiceNumber += "-" + row.vin.slice(-6);

      return {
        format: "renu-ati",
        invoiceNumber,
        invoiceDate: parsed.invoiceDate,
        terms: parsed.terms,
        dueDate: parsed.dueDate,
        companyName: parsed.companyName,
        companyAddress: parsed.companyAddress,
        billTo: parsed.billTo,
        clientName: parsed.clientName || "",
        remitTo: parsed.remitTo,
        vehicles: [row],
        balanceDue: row.amount,
        vin: row.vin,
        vehicle: row.vehicle,
        stockNo: row.stockNo || (row.vin ? row.vin.slice(-6) : ""),
        splitIndex: idx + 1,
        splitTotal: parsed.vehicles.length,
      };
    });
  }

  function splitGenericLineItems(parsed, options) {
    const splitBy = options?.splitBy || "vin";
    const unassignedMode = options?.unassignedMode || "first";
    const groups = new Map();
    const unassigned = [];

    for (const item of parsed.lineItems) {
      const vins = item.description.match(/\b[A-HJ-NPR-Z0-9]{17}\b/gi) || [];
      const vin = splitBy === "vin" || splitBy === "section" ? (vins[0] || "").toUpperCase() : "";
      if (vin) {
        if (!groups.has(vin)) groups.set(vin, []);
        groups.get(vin).push(item);
      } else {
        unassigned.push(item);
      }
    }

    if (groups.size === 0 && parsed.lineItems.length) {
      groups.set("ALL", [...parsed.lineItems]);
    }

    if (unassigned.length && groups.size) {
      const keys = [...groups.keys()];
      const target =
        unassignedMode === "last"
          ? keys[keys.length - 1]
          : unassignedMode === "duplicate" || unassignedMode === "all"
            ? keys
            : keys[0];
      if (Array.isArray(target)) {
        for (const k of target) groups.get(k).push(...unassigned.map((u) => ({ ...u })));
      } else {
        groups.get(target).push(...unassigned);
      }
    }

    const numbering = options?.numbering || "same";
    return [...groups.entries()].map(([vin, items], idx) => {
      const total = items.reduce((s, li) => s + li.amount, 0);
      let invoiceNumber = parsed.invoiceNumber || "Invoice";
      if (numbering === "suffix") invoiceNumber += "-" + (idx + 1);
      else if (numbering === "vin" && vin !== "ALL") invoiceNumber += "-" + vin.slice(-6);

      return {
        format: "generic",
        invoiceNumber,
        invoiceDate: parsed.invoiceDate,
        companyName: parsed.companyName,
        companyAddress: parsed.companyAddress,
        billTo: parsed.billTo,
        remitTo: parsed.remitTo,
        lineItems: items,
        balanceDue: total,
        vin: vin !== "ALL" ? vin : "",
        vehicle: items[0]?.description || "",
        splitIndex: idx + 1,
        splitTotal: groups.size,
      };
    });
  }

  function buildInvoiceHtml(inv) {
    if (inv.format === "renu-ati" || (inv.vehicles && inv.vehicles.length)) {
      return buildRenuInvoiceHtml(inv);
    }
    return buildGenericInvoiceHtml(inv);
  }

  const INVOICE_PRINT_CSS =
    ".inv-pdf-sheet{box-sizing:border-box;width:7.5in;margin:0;padding:0.35in 0.4in 0.45in;" +
    "background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif;font-size:10pt;line-height:1.35;}" +
    ".inv-hdr{width:100%;border-collapse:collapse;margin-bottom:0.85rem;}" +
    ".inv-hdr td{vertical-align:top;padding:0;}" +
    ".inv-brand strong{font-size:11pt;}" +
    ".inv-meta{text-align:right;font-size:10pt;}" +
    ".inv-meta div{margin:0.12rem 0;}" +
    ".inv-meta-lbl{font-weight:600;color:#333;margin-right:0.35rem;}" +
    ".inv-inv-no{font-size:11pt;font-weight:700;margin-bottom:0.25rem;}" +
    ".inv-bill{margin-bottom:0.85rem;}" +
    ".inv-lbl{font-weight:700;font-size:9pt;letter-spacing:0.04em;margin-bottom:0.2rem;}" +
    ".inv-lines{width:100%;border-collapse:collapse;margin-bottom:1rem;font-size:9.5pt;}" +
    ".inv-lines th{text-align:left;font-size:8.5pt;font-weight:700;padding:0.35rem 0.25rem;border-bottom:1px solid #222;}" +
    ".inv-lines td{padding:0.45rem 0.25rem;border-bottom:1px solid #ddd;vertical-align:top;}" +
    ".inv-lines th.amt,.inv-lines td.amt{text-align:right;white-space:nowrap;}" +
    ".inv-vin{font-family:'Courier New',Courier,monospace;font-size:9pt;}" +
    ".inv-stock{font-family:Arial,Helvetica,sans-serif;font-size:9pt;color:#333;}" +
    ".inv-foot{width:100%;border-collapse:collapse;margin-top:0.5rem;}" +
    ".inv-foot td{vertical-align:bottom;padding:0;}" +
    ".inv-remit{font-size:8.5pt;line-height:1.4;color:#222;width:62%;}" +
    ".inv-balance{text-align:right;white-space:nowrap;}" +
    ".inv-balance-lbl{font-weight:700;font-size:9pt;letter-spacing:0.03em;}" +
    ".inv-balance-amt{font-size:14pt;font-weight:700;margin-top:0.15rem;}";

  function stockLabel(vin, stockNo) {
    const stock = String(stockNo || "").trim() || (vin ? vin.slice(-6) : "");
    return stock ? "Stock No. " + stock : "";
  }

  function amountCell(amount) {
    const n = Number(amount);
    return Number.isFinite(n) ? n.toFixed(2) : "0.00";
  }

  function buildRenuInvoiceHtml(inv) {
    const companyAddr = (inv.companyAddress || DEFAULT_COMPANY.lines)
      .map((l) => escapeHtml(l))
      .join("<br>");
    const billToHtml = escapeHtml(inv.billTo || inv.clientName || "").replace(/\n/g, "<br>");
    const remitHtml = (inv.remitTo || DEFAULT_REMIT.slice(1))
      .map((l) => escapeHtml(l))
      .join("<br>");

    const rows = (inv.vehicles || [])
      .map((v) => {
        const stock = stockLabel(v.vin, v.stockNo);
        return (
          "<tr>" +
          "<td>" +
          escapeHtml(fmtDisplayDate(v.dateOrdered || inv.invoiceDate)) +
          "</td>" +
          "<td>" +
          escapeHtml(v.vehicle || inv.vehicle || "") +
          "</td>" +
          "<td class='inv-vin'>" +
          escapeHtml(v.vin || inv.vin || "") +
          (stock ? "<br><span class='inv-stock'>" + escapeHtml(stock) + "</span>" : "") +
          "</td>" +
          "<td class='amt'>" +
          escapeHtml(amountCell(v.amount != null ? v.amount : inv.balanceDue)) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

    return (
      '<article class="inv-pdf-sheet inv-renu">' +
      "<style>" +
      INVOICE_PRINT_CSS +
      "</style>" +
      '<table class="inv-hdr"><tr>' +
      '<td class="inv-brand"><strong>' +
      escapeHtml(inv.companyName || DEFAULT_COMPANY.name) +
      "</strong><br>" +
      companyAddr +
      "</td>" +
      '<td class="inv-meta">' +
      "<div class='inv-inv-no'><span class='inv-meta-lbl'>INVOICE</span> <strong>" +
      escapeHtml(inv.invoiceNumber) +
      "</strong></div>" +
      "<div><span class='inv-meta-lbl'>DATE</span> " +
      escapeHtml(fmtDisplayDate(inv.invoiceDate)) +
      "</div>" +
      (inv.terms ? "<div><span class='inv-meta-lbl'>TERMS</span> " + escapeHtml(inv.terms) + "</div>" : "") +
      (inv.dueDate ? "<div><span class='inv-meta-lbl'>DUE DATE</span> " + escapeHtml(fmtDisplayDate(inv.dueDate)) + "</div>" : "") +
      "</td></tr></table>" +
      '<div class="inv-bill"><div class="inv-lbl">BILL TO</div><div>' +
      billToHtml +
      "</div></div>" +
      '<table class="inv-lines"><thead><tr>' +
      "<th>DATE ORDERED</th><th>VEHICLE</th><th>VIN</th><th class='amt'>AMOUNT</th>" +
      "</tr></thead><tbody>" +
      rows +
      "</tbody></table>" +
      '<table class="inv-foot"><tr>' +
      '<td class="inv-remit">' +
      remitHtml +
      "</td>" +
      '<td class="inv-balance"><div class="inv-balance-lbl">BALANCE DUE</div>' +
      '<div class="inv-balance-amt">' +
      escapeHtml(money(inv.balanceDue)) +
      "</div></td></tr></table></article>"
    );
  }

  function buildGenericInvoiceHtml(inv) {
    const rows = (inv.lineItems || [])
      .map(
        (li) =>
          "<tr><td colspan='3'>" +
          escapeHtml(li.description) +
          "</td><td class='inv-cell-amt'>" +
          escapeHtml(money(li.amount)) +
          "</td></tr>"
      )
      .join("");

    return (
      '<article class="inv-pdf-sheet inv-renu">' +
      '<div class="inv-renu-top">' +
      '<div class="inv-renu-brand"><strong>' +
      escapeHtml(inv.companyName || DEFAULT_COMPANY.name) +
      "</strong></div>" +
      '<div class="inv-renu-title-block">' +
      "<div class='inv-renu-invoice-no'><span>INVOICE</span> <strong>" +
      escapeHtml(inv.invoiceNumber) +
      "</strong></div>" +
      "<div><span>DATE</span> " +
      escapeHtml(fmtDisplayDate(inv.invoiceDate)) +
      "</div></div></div>" +
      '<div class="inv-renu-billto"><div class="inv-renu-label">BILL TO</div><div>' +
      escapeHtml(inv.billTo || "").replace(/\n/g, "<br>") +
      "</div></div>" +
      '<table class="inv-renu-table"><thead><tr>' +
      "<th>DESCRIPTION</th><th></th><th></th><th>AMOUNT</th>" +
      "</tr></thead><tbody>" +
      rows +
      "</tbody></table>" +
      '<div class="inv-renu-footer"><div></div><div class="inv-renu-balance"><div>BALANCE DUE</div><strong>' +
      escapeHtml(money(inv.balanceDue)) +
      "</strong></div></div></article>"
    );
  }

  function safeFilename(base, ext) {
    return (
      String(base || "invoice")
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) + ext
    );
  }

  async function ensurePdfJs() {
    if (global.pdfjsLib) return global.pdfjsLib;
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      script.onload = resolve;
      script.onerror = () => reject(new Error("Could not load PDF reader."));
      document.head.appendChild(script);
    });
    global.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    return global.pdfjsLib;
  }

  async function ensureHtml2Pdf() {
    if (global.html2pdf) return global.html2pdf;
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
      script.onload = resolve;
      script.onerror = () => reject(new Error("Could not load PDF writer."));
      document.head.appendChild(script);
    });
    return global.html2pdf;
  }

  async function extractPdfText(file) {
    const pdfjsLib = await ensurePdfJs();
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const lines = groupTextLines(content.items);
      pages.push(lines.join("\n"));
    }
    return pages.join("\n\n");
  }

  function mdyToIso(mdy) {
    if (!mdy) return "";
    const s = String(mdy).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return s;
    return m[3] + "-" + m[1].padStart(2, "0") + "-" + m[2].padStart(2, "0");
  }

  function parsedToQboInvoice(parsed) {
    const balance = Number(parsed.balanceDue) || 0;
    const vehicles = parsed.vehicles || [];
    return {
      DocNumber: String(parsed.invoiceNumber || ""),
      TxnDate: mdyToIso(parsed.invoiceDate),
      DueDate: mdyToIso(parsed.dueDate),
      Balance: balance,
      TotalAmt: balance,
      CustomerRef: { name: (parsed.billTo || "").split(/\r?\n/)[0].trim() },
      Line: vehicles.map((v) => ({
        DetailType: "SalesItemLineDetail",
        Amount: Number(v.amount) || 0,
        Description: [v.vehicle, v.vin ? "VIN " + v.vin : ""].filter(Boolean).join(" "),
      })),
    };
  }

  function parseQboOpenCsv(text) {
    const raw = String(text || "").replace(/^\uFEFF/, "");
    const lines = raw.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];

    function splitRow(line) {
      const out = [];
      let cur = "";
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          inQ = !inQ;
          continue;
        }
        if (ch === "," && !inQ) {
          out.push(cur.trim());
          cur = "";
          continue;
        }
        cur += ch;
      }
      out.push(cur.trim());
      return out;
    }

    const header = splitRow(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
    function col(nameParts) {
      return header.findIndex((h) => nameParts.some((p) => h.includes(p)));
    }
    const idxNum = col(["num", "invoice no", "invoice number", "doc"]);
    const idxDate = col(["date", "invoice date", "txn date"]);
    const idxBalance = col(["open balance", "balance", "amount due", "open"]);
    const idxAmount = col(["amount", "total"]);
    const idxCustomer = col(["customer", "name", "client"]);
    const idxDesc = col(["memo", "description", "product"]);

    const invoices = [];
    for (let i = 1; i < lines.length; i++) {
      const row = splitRow(lines[i]);
      if (!row.length) continue;
      const num = idxNum >= 0 ? row[idxNum] : row[0];
      if (!num || /^total/i.test(num)) continue;
      const balanceRaw = idxBalance >= 0 ? row[idxBalance] : "";
      const amountRaw = idxAmount >= 0 ? row[idxAmount] : "";
      let balance = parseMoney(balanceRaw);
      if (!balance) balance = parseMoney(amountRaw);
      if (!balance) continue;
      const dateVal = idxDate >= 0 ? row[idxDate] : "";
      const customer = idxCustomer >= 0 ? row[idxCustomer] : "";
      const desc = idxDesc >= 0 ? row[idxDesc] : "";
      const linesOut = [];
      if (desc) {
        linesOut.push({
          DetailType: "SalesItemLineDetail",
          Amount: balance,
          Description: desc,
        });
      }
      invoices.push({
        DocNumber: num,
        TxnDate: mdyToIso(dateVal) || dateVal,
        Balance: balance,
        TotalAmt: balance,
        CustomerRef: { name: customer },
        Line: linesOut,
      });
    }
    return invoices;
  }

  function parsedToInvoiceGroup(parsed) {
    const vehicles = (parsed.vehicles || []).map((v) => ({
      dateOrdered: v.dateOrdered || parsed.invoiceDate,
      vehicle: v.vehicle,
      vin: (v.vin || "").toUpperCase(),
      stockNo: v.stockNo || "",
      amount: Number(v.amount) || 0,
    }));
    const total = Number(parsed.balanceDue) || vehicles.reduce((s, v) => s + v.amount, 0);
    const billToLine = (parsed.billTo || "").split(/\r?\n/)[0].trim();
    return {
      source: "qbo-pdf",
      invoiceNumber: parsed.invoiceNumber || "",
      clientName: billToLine,
      billTo: billToLine,
      dateOrdered: mdyToIso(parsed.invoiceDate) || parsed.invoiceDate,
      dueDate: mdyToIso(parsed.dueDate) || parsed.dueDate,
      terms: parsed.terms || "Net 30",
      carCount: vehicles.length,
      total,
      qboBalance: total,
      cars: vehicles,
    };
  }

  function groupTextLines(items) {
    const rows = [];
    let currentY = null;
    let current = [];
    const sorted = [...items].sort((a, b) => {
      const dy = b.transform[5] - a.transform[5];
      if (Math.abs(dy) > 2) return dy;
      return a.transform[4] - b.transform[4];
    });
    for (const item of sorted) {
      const y = Math.round(item.transform[5]);
      if (currentY === null || Math.abs(y - currentY) <= 3) {
        current.push(item.str);
        currentY = y;
      } else {
        if (current.length) rows.push(current.join(" ").replace(/\s+/g, " ").trim());
        current = [item.str];
        currentY = y;
      }
    }
    if (current.length) rows.push(current.join(" ").replace(/\s+/g, " ").trim());
    return rows.filter(Boolean);
  }

  function invoiceFilename(inv) {
    const base = String(inv.invoiceNumber || "invoice");
    const parts = [base, String(inv.splitIndex || 1).padStart(3, "0")];
    if (inv.vin) parts.push(inv.vin.slice(-6));
    return safeFilename(parts.join("-"), ".pdf");
  }

  async function renderInvoicePdfBlob(html2pdfLib, html) {
    const host = document.createElement("div");
    host.className = "inv-pdf-render-host";
    host.setAttribute("aria-hidden", "true");
    host.innerHTML = html;
    document.body.appendChild(host);
    try {
      const sheet = host.querySelector(".inv-pdf-sheet");
      if (!sheet) throw new Error("Invoice layout missing.");

      host.style.width = "8.5in";
      host.style.minHeight = "11in";
      host.style.overflow = "visible";
      sheet.style.width = "7.5in";

      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      });

      const canvasWidth = Math.max(sheet.offsetWidth, sheet.scrollWidth, 720);
      const canvasHeight = Math.max(sheet.offsetHeight, sheet.scrollHeight, 900);

      const opt = {
        margin: [0.45, 0.5, 0.45, 0.5],
        filename: "invoice.pdf",
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          scrollX: 0,
          scrollY: 0,
          x: 0,
          y: 0,
          width: canvasWidth,
          height: canvasHeight,
          windowWidth: canvasWidth,
          windowHeight: canvasHeight,
        },
        jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
        pagebreak: { mode: ["avoid-all"] },
      };

      let blob = await html2pdfLib().set(opt).from(sheet).output("blob");
      if (!(blob instanceof Blob)) {
        blob = new Blob([blob], { type: "application/pdf" });
      }
      if (!blob.size) {
        throw new Error("PDF generation produced an empty file. Try Print all, then Save as PDF.");
      }
      return blob;
    } finally {
      host.remove();
    }
  }

  async function writeBlobToFolder(dirHandle, name, blob) {
    const fh = await dirHandle.getFileHandle(name, { create: true });
    const writable = await fh.createWritable();
    const data = blob instanceof Blob ? await blob.arrayBuffer() : blob;
    await writable.write(data);
    await writable.close();
  }

  async function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function saveSplitsToFolder(splits, _logoUrl, options, onProgress) {
    const html2pdfLib = await ensureHtml2Pdf();
    const preferFolder = options?.preferFolder !== false;
    let dirHandle = null;
    if (preferFolder) {
      if (!window.showDirectoryPicker) {
        throw new Error("Folder picker is not supported in this browser. Use Download all PDFs or Chrome/Edge.");
      }
      dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
      if (dirHandle.requestPermission) {
        const perm = await dirHandle.requestPermission({ mode: "readwrite" });
        if (perm !== "granted") {
          throw new Error("Folder access was not granted.");
        }
      }
    }

    const usedNames = new Set();
    let i = 0;
    for (const inv of splits) {
      i += 1;
      if (onProgress) onProgress(i, splits.length, inv);
      const html = buildInvoiceHtml(inv);
      const blob = await renderInvoicePdfBlob(html2pdfLib, html);
      let name = invoiceFilename(inv);
      while (usedNames.has(name.toLowerCase())) {
        name = safeFilename(name.replace(/\.pdf$/i, "") + "-dup", ".pdf");
      }
      usedNames.add(name.toLowerCase());

      if (dirHandle) {
        await writeBlobToFolder(dirHandle, name, blob);
      } else {
        await downloadBlob(blob, name);
        if (splits.length > 1) {
          await new Promise((r) => setTimeout(r, 350));
        }
      }
    }
    return { saved: splits.length, usedFolder: !!dirHandle };
  }

  function buildPrintDocument(splits) {
    return splits.map((inv) => buildInvoiceHtml(inv)).join("");
  }

  global.InvoiceGenerator = {
    extractPdfText,
    parseInvoiceText,
    parseQuickBooksInvoiceText: parseInvoiceText,
    parseQboOpenCsv,
    parsedToQboInvoice,
    parsedToInvoiceGroup,
    parsedFromAriGroup,
    splitAriGroup,
    splitInvoice,
    mdyToIso,
    buildInvoiceHtml,
    buildPrintDocument,
    saveSplitsToFolder,
    ensureHtml2Pdf,
    fmtDisplayDate,
    money,
    safeFilename,
  };
})(window);
