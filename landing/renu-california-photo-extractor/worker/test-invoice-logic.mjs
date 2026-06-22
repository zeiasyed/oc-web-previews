import { mergeQboInvoicesWithAri, validateSplitTotals } from "./invoice-merge.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "Assertion failed");
}

function approx(a, b, tol = 0.02) {
  return Math.abs(a - b) <= tol;
}

const ariRows = [
  {
    vin: "1HGCM82633A004352",
    vehicle: "2023 Toyota Camry",
    amount: 130,
    dateOrdered: "2026-04-29",
    stockNo: "004352",
  },
  {
    vin: "2T1BURHE0JC123456",
    vehicle: "2024 Toyota Corolla",
    amount: 130,
    dateOrdered: "2026-04-29",
    stockNo: "123456",
  },
  {
    vin: "3VWDX7AJ5DM123789",
    vehicle: "2022 Honda Accord",
    amount: 130,
    dateOrdered: "2026-04-29",
    stockNo: "123789",
  },
  {
    vin: "4T1BF1FK5EU555555",
    vehicle: "2021 Toyota RAV4",
    amount: 130,
    dateOrdered: "2026-04-29",
    stockNo: "555555",
  },
  {
    vin: "5YFBURHE5LP666666",
    vehicle: "2023 Toyota Prius",
    amount: 90,
    dateOrdered: "2026-04-29",
    stockNo: "666666",
  },
];

const qboInvoices = [
  {
    Id: "1005",
    DocNumber: "AT-1005",
    TxnDate: "2026-04-29",
    DueDate: "2026-05-29",
    Balance: 610,
    TotalAmt: 610,
    CustomerRef: { name: "Autonation Toyota Irvine" },
    Line: [
      {
        DetailType: "SalesItemLineDetail",
        Amount: 130,
        Description: "2023 Toyota Camry VIN 1HGCM82633A004352",
      },
      {
        DetailType: "SalesItemLineDetail",
        Amount: 130,
        Description: "2024 Toyota Corolla VIN 2T1BURHE0JC123456",
      },
      {
        DetailType: "SalesItemLineDetail",
        Amount: 130,
        Description: "2022 Honda Accord VIN 3VWDX7AJ5DM123789",
      },
      {
        DetailType: "SalesItemLineDetail",
        Amount: 130,
        Description: "2021 Toyota RAV4 VIN 4T1BF1FK5EU555555",
      },
      {
        DetailType: "SalesItemLineDetail",
        Amount: 90,
        Description: "2023 Toyota Prius VIN 5YFBURHE5LP666666",
      },
      { DetailType: "SubTotalLineDetail", Amount: 610 },
    ],
  },
  {
    Id: "1006",
    DocNumber: "AT-1006",
    TxnDate: "2026-05-01",
    Balance: 1165,
    TotalAmt: 1200,
    CustomerRef: { name: "Autonation Toyota Irvine" },
    Line: [
      { DetailType: "SalesItemLineDetail", Amount: 130, Description: "Vehicle A" },
      { DetailType: "SalesItemLineDetail", Amount: 130, Description: "Vehicle B" },
      { DetailType: "SalesItemLineDetail", Amount: 130, Description: "Vehicle C" },
    ],
  },
];

console.log("Test 1: QBO balance preserved with VIN match + ARI enrichment");
const groups = mergeQboInvoicesWithAri(qboInvoices, ariRows, "Autonation Toyota Irvine");
assert(groups.length === 2, "expected 2 invoice groups");
const g1005 = groups.find((g) => g.invoiceNumber === "AT-1005");
assert(g1005, "AT-1005 missing");
assert(g1005.total === 610, "AT-1005 total should be 610");
const carSum1005 = g1005.cars.reduce((s, c) => s + c.amount, 0);
assert(approx(carSum1005, 610), "AT-1005 car sum should match open balance");
assert(g1005.cars[0].vehicle.includes("Toyota"), "ARI vehicle name should win");
assert(g1005.cars[0].vin === "1HGCM82633A004352", "VIN should match");

console.log("Test 2: Partial payment scales line amounts to open balance");
const g1006 = groups.find((g) => g.invoiceNumber === "AT-1006");
assert(g1006, "AT-1006 missing");
assert(g1006.total === 1165, "AT-1006 should use Balance not TotalAmt");
const carSum1006 = g1006.cars.reduce((s, c) => s + c.amount, 0);
assert(approx(carSum1006, 1165), "scaled car lines should sum to open balance");

console.log("Test 3: Split totals match selected QBO open total");
const splits = groups.flatMap((g) =>
  g.cars.map((c) => ({
    balanceDue: c.amount,
    invoiceNumber: g.invoiceNumber,
  }))
);
const validation = validateSplitTotals(groups, splits);
assert(validation.matches, "split total should match selected total");
assert(validation.selectedTotal === 1775, "selected total 610+1165");

console.log("Test 4: Fallback to ARI same-day when QBO has no line detail");
const bareQbo = [
  {
    DocNumber: "AT-2000",
    TxnDate: "2026-04-29",
    Balance: 520,
    Line: [],
  },
];
const fallbackGroups = mergeQboInvoicesWithAri(bareQbo, ariRows.slice(0, 4), "Test Dealer");
assert(fallbackGroups.length === 1, "fallback group expected");
assert(fallbackGroups[0].total === 520, "fallback uses QBO balance");
const fbSum = fallbackGroups[0].cars.reduce((s, c) => s + c.amount, 0);
assert(approx(fbSum, 520), "fallback scaled ARI rows to QBO balance");

console.log("\nAll invoice merge tests passed.");
