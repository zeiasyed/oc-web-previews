const QUESTIONS = [
  {
    id: "mileage",
    label: "Miles per year?",
    education: "Leases cap mileage (~10K/yr). Going over means extra fees.",
    placeholder: "Select mileage",
    options: [
      { value: "low", label: "Under 10,000", lease: 2, finance: 0 },
      { value: "moderate", label: "10,000 – 12,000", lease: 1, finance: 0 },
      { value: "average", label: "12,000 – 15,000", lease: 0, finance: 1 },
      { value: "high", label: "Over 15,000", lease: -2, finance: 2 },
    ],
  },
  {
    id: "ownership",
    label: "How long will you keep it?",
    education: "Leasing fits 2–3 years. Buying pays off if you keep it 5+ years.",
    placeholder: "Select timeline",
    options: [
      { value: "short", label: "2–3 years", lease: 2, finance: -1 },
      { value: "medium", label: "4–5 years", lease: 0, finance: 1 },
      { value: "long", label: "5+ years", lease: -2, finance: 2 },
      { value: "unsure", label: "Not sure", lease: 0, finance: 0 },
    ],
  },
  {
    id: "payment",
    label: "How important is the lowest payment?",
    education: "Leases usually cost less per month. Total cost over many years can differ.",
    placeholder: "Select priority",
    options: [
      { value: "critical", label: "Very important", lease: 2, finance: -1 },
      { value: "important", label: "Important, not the only factor", lease: 1, finance: 0 },
      { value: "balanced", label: "I'll pay more for long-term value", lease: -1, finance: 1 },
      { value: "flexible", label: "Not my main concern", lease: -1, finance: 2 },
    ],
  },
  {
    id: "equity",
    label: "Want to own it and build equity?",
    education: "Finance builds ownership. Lease payments don't — you return or buy at lease-end.",
    placeholder: "Select goal",
    options: [
      { value: "yes", label: "Yes, I want to own it", lease: -2, finance: 2 },
      { value: "maybe", label: "Nice to have, not essential", lease: 0, finance: 1 },
      { value: "no", label: "No, I'd rather return it", lease: 2, finance: -1 },
      { value: "unsure", label: "Not sure", lease: 0, finance: 0 },
    ],
  },
  {
    id: "vehicleUse",
    label: "How do you use your vehicle?",
    education: "Heavy wear or modifications can trigger lease-end charges. Owners face no such rules.",
    placeholder: "Select use",
    options: [
      { value: "personal", label: "Commuting & errands", lease: 0, finance: 0 },
      { value: "family", label: "Family use", lease: 0, finance: 1 },
      { value: "heavy", label: "Heavy daily use", lease: -1, finance: 1 },
      { value: "modify", label: "I modify my vehicles", lease: -2, finance: 2 },
      { value: "business", label: "Business use", lease: 1, finance: 1 },
    ],
  },
  {
    id: "tech",
    label: "How often do you want new tech?",
    education: "Leasing makes upgrading every few years easy — often under warranty.",
    placeholder: "Select preference",
    options: [
      { value: "always", label: "Every 2–3 years", lease: 2, finance: -2 },
      { value: "sometimes", label: "Every few years", lease: 1, finance: -1 },
      { value: "rarely", label: "Keep cars a long time", lease: -1, finance: 2 },
      { value: "indifferent", label: "Doesn't matter much", lease: 0, finance: 0 },
    ],
  },
  {
    id: "totalCost",
    label: "What matters most long-term?",
    education: "Compare total cost over 5–7 years — not just the monthly payment.",
    placeholder: "Select priority",
    options: [
      { value: "lowestMonthly", label: "Lowest payment now", lease: 2, finance: -1 },
      { value: "predictable", label: "Predictable costs (warranty)", lease: 1, finance: 0 },
      { value: "lowestTotal", label: "Lowest total cost", lease: -1, finance: 2 },
      { value: "flexibility", label: "Freedom to sell anytime", lease: -1, finance: 2 },
    ],
  },
];

const introSection = document.getElementById("intro-section");
const quizSection = document.getElementById("quiz-section");
const resultsSection = document.getElementById("results-section");
const questionContainer = document.getElementById("question-container");
const quizForm = document.getElementById("quiz-form");
const stepCurrent = document.getElementById("step-current");
const stepTotal = document.getElementById("step-total");
const progressBar = document.getElementById("progress-bar");
const progressFill = document.getElementById("progress-fill");
const startBtn = document.getElementById("start-btn");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const restartBtn = document.getElementById("restart-btn");
const resultsContent = document.getElementById("results-content");

let currentStep = 0;
const answers = {};

stepTotal.textContent = String(QUESTIONS.length);

function showSection(section) {
  [introSection, quizSection, resultsSection].forEach((el) => {
    el.classList.remove("active");
    el.hidden = true;
  });
  section.classList.add("active");
  section.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderQuestion(index) {
  const q = QUESTIONS[index];
  const selected = answers[q.id] || "";

  questionContainer.innerHTML = `
    <div class="question-block">
      <label class="question-label" for="${q.id}">${q.label}</label>
      <div class="education-box">${q.education}</div>
      <select id="${q.id}" name="${q.id}" required>
        <option value="" disabled ${selected ? "" : "selected"}>${q.placeholder}</option>
        ${q.options
          .map(
            (o) =>
              `<option value="${o.value}" ${selected === o.value ? "selected" : ""}>${o.label}</option>`
          )
          .join("")}
      </select>
      <p class="field-error-msg" id="${q.id}-error" hidden>Please select an option.</p>
    </div>
  `;

  stepCurrent.textContent = String(index + 1);
  const progress = ((index + 1) / QUESTIONS.length) * 100;
  progressFill.style.width = `${progress}%`;
  progressBar.setAttribute("aria-valuenow", String(Math.round(progress)));

  nextBtn.textContent = index === QUESTIONS.length - 1 ? "See result" : "Next";
}

function validateCurrentStep() {
  const q = QUESTIONS[currentStep];
  const select = document.getElementById(q.id);
  const error = document.getElementById(`${q.id}-error`);
  const valid = Boolean(select.value);

  select.classList.toggle("field-error", !valid);
  error.hidden = valid;
  return valid;
}

function saveCurrentAnswer() {
  const q = QUESTIONS[currentStep];
  const select = document.getElementById(q.id);
  answers[q.id] = select.value;
}

function computeScores() {
  let leaseScore = 0;
  let financeScore = 0;

  QUESTIONS.forEach((q) => {
    const value = answers[q.id];
    const option = q.options.find((o) => o.value === value);
    if (!option) return;
    leaseScore += option.lease;
    financeScore += option.finance;
  });

  return { leaseScore, financeScore };
}

function getRecommendation(leaseScore, financeScore) {
  const diff = leaseScore - financeScore;

  if (diff >= 3) {
    return {
      type: "lease",
      title: "Leasing looks like the better fit",
      subtitle: "Lower payments, shorter ownership, and mileage within lease limits.",
    };
  }

  if (diff <= -3) {
    return {
      type: "finance",
      title: "Financing looks like the better fit",
      subtitle: "Ownership, higher mileage, and long-term value align with your answers.",
    };
  }

  return {
    type: "either",
    title: "Either could work",
    subtitle: "Run the numbers on both for your specific Honda model.",
  };
}

function buildExplanation(rec, scores) {
  const a = answers;
  const parts = [];
  const reasons = [];

  if (rec.type === "lease") {
    if (a.mileage === "low" || a.mileage === "moderate") {
      reasons.push("Your mileage fits typical lease limits.");
    }
    if (a.payment === "critical" || a.payment === "important") {
      reasons.push("You prioritize a lower monthly payment.");
    }
    if (a.ownership === "short" || a.tech === "always" || a.tech === "sometimes") {
      reasons.push("You want a newer vehicle every few years.");
    }
    if (!reasons.length) {
      reasons.push("Your answers favor lower payments and shorter terms.");
    }
  } else if (rec.type === "finance") {
    if (a.mileage === "high" || a.mileage === "average") {
      reasons.push("Your mileage could trigger lease overage fees.");
    }
    if (a.ownership === "long" || a.totalCost === "lowestTotal") {
      reasons.push("Long-term ownership often lowers total cost.");
    }
    if (a.equity === "yes") {
      reasons.push("You want to build equity through ownership.");
    }
    if (a.vehicleUse === "modify") {
      reasons.push("Modifications are easier when you own the vehicle.");
    }
    if (!reasons.length) {
      reasons.push("Your answers favor ownership and flexibility.");
    }
  } else {
    reasons.push("<strong>Lease if:</strong> lower payment now and you stay under mileage caps.");
    reasons.push("<strong>Finance if:</strong> you'll keep it 5+ years or drive a lot.");
  }

  parts.push(
    `<div class="result-section"><h3>Why</h3><ul class="reason-list">${reasons.map((r) => `<li>${r}</li>`).join("")}</ul></div>`
  );

  const prosCons =
    rec.type === "finance"
      ? {
          pros: ["Build equity", "No mileage limits", "Sell or trade anytime", "Payment-free years after payoff"],
          cons: ["Higher monthly payment", "Depreciation risk", "Repairs after warranty"],
        }
      : rec.type === "lease"
        ? {
            pros: ["Lower monthly payment", "New car every 2–3 years", "Warranty coverage", "Predictable term costs"],
            cons: ["No equity by default", "Mileage caps", "Wear-and-tear fees at turn-in"],
          }
        : {
            pros: ["Lease: lower payment, easy upgrades", "Finance: ownership, unlimited miles"],
            cons: ["Lease: caps and fees", "Finance: higher payment upfront"],
          };

  parts.push(`
    <div class="result-section">
      <h3>Pros & cons</h3>
      <div class="pros-cons-grid">
        <div class="pros">
          <h4>+</h4>
          <ul>${prosCons.pros.map((p) => `<li>${p}</li>`).join("")}</ul>
        </div>
        <div class="cons">
          <h4>−</h4>
          <ul>${prosCons.cons.map((c) => `<li>${c}</li>`).join("")}</ul>
        </div>
      </div>
    </div>
  `);

  parts.push(`
    <div class="result-section result-scores">
      <span class="score-chip lease">Lease: ${scores.leaseScore}</span>
      <span class="score-chip finance">Finance: ${scores.financeScore}</span>
    </div>
  `);

  parts.push(`
    <p class="disclaimer">Educational only — not financial advice. Confirm rates and terms with Honda Financial Services.</p>
  `);

  return parts.join("");
}

function showResults() {
  const scores = computeScores();
  const rec = getRecommendation(scores.leaseScore, scores.financeScore);

  resultsContent.innerHTML = `
    <div class="result-banner ${rec.type}">
      <p class="result-title">${rec.title}</p>
      <p class="result-sub">${rec.subtitle}</p>
    </div>
    ${buildExplanation(rec, scores)}
  `;

  showSection(resultsSection);
}

function resetApp() {
  currentStep = 0;
  Object.keys(answers).forEach((k) => delete answers[k]);
  showSection(introSection);
}

startBtn.addEventListener("click", () => {
  showSection(quizSection);
  renderQuestion(0);
});

prevBtn.addEventListener("click", () => {
  saveCurrentAnswer();
  if (currentStep === 0) {
    showSection(introSection);
    return;
  }
  currentStep -= 1;
  renderQuestion(currentStep);
});

nextBtn.addEventListener("click", () => {
  if (!validateCurrentStep()) return;
  saveCurrentAnswer();

  if (currentStep < QUESTIONS.length - 1) {
    currentStep += 1;
    renderQuestion(currentStep);
  } else {
    showResults();
  }
});

restartBtn.addEventListener("click", resetApp);

quizForm.addEventListener("submit", (e) => {
  e.preventDefault();
  nextBtn.click();
});
