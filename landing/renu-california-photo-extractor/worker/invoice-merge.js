const VIN_RE = /\b[A-HJ-NPR-Z0-9]{17}\b/i;

function parseDateOnly(value) {
  if (!value) return "";
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toISOString().slice(0, 10);
}

function extractVin(text) {
  const m = String(text || "").match(VIN_RE);
  return m ? m[0].toUpperCase() : "";
}

function lineAmount(line) {
  const n = Number(line?.Amount);
  return Number.isFinite(n) ? n : 0;
}

function parseQboInvoiceLines(invoice) {
  const lines = Array.isArray(invoice?.Line) ? invoice.Line : [];
  const rows = [];
  for (const line of lines) {
    const detail = line?.DetailType || "";
    if (detail === "SubTotalLineDetail" || detail === "DiscountLineDetail") continue;
    const amount = lineAmount(line);
    if (amount <= 0) continue;
    const desc = String(line?.Description || line?.SalesItemLineDetail?.ItemRef?.name || "").trim();
    rows.push({
      amount,
      description: desc,
      vin: extractVin(desc),
      vehicle: desc.replace(VIN_RE, "").replace(/\s+/g, " ").trim(),
    });
  }
  return rows;
}

function buildAriLookup(ariRows) {
  const byVin = new Map();
  const byDateAmount = new Map();
  for (const row of ariRows || []) {
    const vin = String(row.vin || "").toUpperCase();
    if (vin) byVin.set(vin, row);
    const date = parseDateOnly(row.dateOrdered);
    const key = date + "|" + Number(row.amount || 0).toFixed(2);
    if (!byDateAmount.has(key)) byDateAmount.set(key, []);
    byDateAmount.get(key).push(row);
  }
  return { byVin, byDateAmount };
}

function enrichLineFromAri(line, invoiceDate, lookup) {
  if (line.vin && lookup.byVin.has(line.vin)) {
    const ari = lookup.byVin.get(line.vin);
    return {
      vin: line.vin,
      vehicle: ari.vehicle || line.vehicle,
      stockNo: ari.stockNo || "",
      amount: line.amount,
      dateOrdered: ari.dateOrdered || invoiceDate,
    };
  }
  const date = parseDateOnly(invoiceDate);
  const key = date + "|" + line.amount.toFixed(2);
  const pool = lookup.byDateAmount.get(key) || [];
  const ari = pool.shift();
  if (ari) {
    return {
      vin: ari.vin || line.vin,
      vehicle: ari.vehicle || line.vehicle,
      stockNo: ari.stockNo || "",
      amount: line.amount,
      dateOrdered: ari.dateOrdered || invoiceDate,
    };
  }
  return {
    vin: line.vin,
    vehicle: line.vehicle,
    stockNo: line.vin ? line.vin.slice(-6) : "",
    amount: line.amount,
    dateOrdered: invoiceDate,
  };
}

export function mergeQboInvoicesWithAri(qboInvoices, ariRows, billToFallback) {
  const lookup = buildAriLookup(ariRows);
  const groups = [];

  for (const inv of qboInvoices || []) {
    const balance = Number(inv.Balance);
    const totalAmt = Number(inv.TotalAmt);
    const openBalance = Number.isFinite(balance) && balance > 0 ? balance : totalAmt;
    if (!openBalance || openBalance <= 0) continue;

    const invoiceDate = inv.TxnDate || "";
    const dueDate = inv.DueDate || "";
    const lines = parseQboInvoiceLines(inv);
    let cars = lines.map((line) => enrichLineFromAri(line, invoiceDate, lookup));

    if (!cars.length && openBalance > 0) {
      const date = parseDateOnly(invoiceDate);
      const ariSameDay = (ariRows || []).filter((r) => parseDateOnly(r.dateOrdered) === date);
      if (ariSameDay.length) {
        const lineSum = ariSameDay.reduce((s, r) => s + (Number(r.amount) || 0), 0);
        const scale = lineSum > 0 ? openBalance / lineSum : 1;
        cars = ariSameDay.map((r) => ({
          vin: r.vin,
          vehicle: r.vehicle,
          stockNo: r.stockNo || "",
          amount: Math.round((Number(r.amount) || 0) * scale * 100) / 100,
          dateOrdered: r.dateOrdered || invoiceDate,
        }));
        const carSum = cars.reduce((s, c) => s + c.amount, 0);
        if (cars.length && Math.abs(carSum - openBalance) > 0.02) {
          cars[cars.length - 1].amount =
            Math.round((cars[cars.length - 1].amount + (openBalance - carSum)) * 100) / 100;
        }
      }
    }

    const carSum = cars.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    if (cars.length && Math.abs(carSum - openBalance) > 0.05) {
      const scale = openBalance / carSum;
      cars = cars.map((c) => ({
        ...c,
        amount: Math.round(c.amount * scale * 100) / 100,
      }));
      const adjusted = cars.reduce((s, c) => s + c.amount, 0);
      if (cars.length) {
        cars[cars.length - 1].amount =
          Math.round((cars[cars.length - 1].amount + (openBalance - adjusted)) * 100) / 100;
      }
    }

    const customerName =
      inv.CustomerRef?.name || inv.CustomerRef?.Name || billToFallback || "";
    groups.push({
      source: "qbo",
      invoiceNumber: String(inv.DocNumber || inv.Id || ""),
      qboId: String(inv.Id || ""),
      clientName: customerName,
      billTo: customerName,
      dateOrdered: invoiceDate,
      dueDate,
      terms: "Net 30",
      carCount: cars.length,
      total: openBalance,
      qboBalance: openBalance,
      cars,
    });
  }

  return groups.sort((a, b) => String(b.dateOrdered).localeCompare(String(a.dateOrdered)));
}

export function validateSplitTotals(groups, splits) {
  const selectedTotal = groups.reduce((s, g) => s + (Number(g.total) || 0), 0);
  const splitTotal = splits.reduce((s, inv) => s + (Number(inv.balanceDue) || 0), 0);
  return {
    selectedTotal: Math.round(selectedTotal * 100) / 100,
    splitTotal: Math.round(splitTotal * 100) / 100,
    matches: Math.abs(selectedTotal - splitTotal) < 0.02,
  };
}
