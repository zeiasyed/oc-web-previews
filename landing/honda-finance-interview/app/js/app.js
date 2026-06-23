const QUESTIONS = [
  {
    id: "mileage",
    label: "How many miles do you drive per year?",
    education:
      "<strong>Why this matters:</strong> Leases include an annual mileage allowance — often around 10,000 miles per year on Honda Financial Services (HFS) programs. Exceeding that limit triggers overage fees (roughly $0.15–$0.25 per mile). If you commute long distances or take frequent road trips, retail finance avoids those penalties entirely.",
    placeholder: "Select your annual mileage",
    options: [
      { value: "low", label: "Under 10,000 miles", lease: 2, finance: 0 },
      { value: "moderate", label: "10,000 – 12,000 miles", lease: 1, finance: 0 },
      { value: "average", label: "12,000 – 15,000 miles", lease: 0, finance: 1 },
      { value: "high", label: "Over 15,000 miles", lease: -2, finance: 2 },
    ],
  },
  {
    id: "ownership",
    label: "How long do you plan to keep your next vehicle?",
    education:
      "<strong>Why this matters:</strong> Leasing is designed for shorter cycles — typically 2–3 years — so you can move into a newer model under warranty. Retail finance rewards longer ownership: once the loan is paid off (often after 5–6 years), you can drive payment-free while the vehicle still has value.",
    placeholder: "Select your ownership timeline",
    options: [
      { value: "short", label: "2–3 years, then get something new", lease: 2, finance: -1 },
      { value: "medium", label: "About 4–5 years", lease: 0, finance: 1 },
      { value: "long", label: "5+ years — I keep cars a long time", lease: -2, finance: 2 },
      { value: "unsure", label: "Not sure yet", lease: 0, finance: 0 },
    ],
  },
  {
    id: "payment",
    label: "How important is the lowest possible monthly payment?",
    education:
      "<strong>Why this matters:</strong> Leasing usually offers a significantly lower monthly payment because you are not financing the full vehicle price — only depreciation over the lease term. For example, a 2026 Honda CR-V lease may run around $299/month vs. roughly $560/month on a 60-month retail loan at promotional APR. But a lower payment does not always mean lower <em>total</em> cost over many years.",
    placeholder: "Select your payment priority",
    options: [
      { value: "critical", label: "Very important — I need the lowest payment now", lease: 2, finance: -1 },
      { value: "important", label: "Important, but not the only factor", lease: 1, finance: 0 },
      { value: "balanced", label: "I can pay more if long-term value is better", lease: -1, finance: 1 },
      { value: "flexible", label: "Monthly payment is not my main concern", lease: -1, finance: 2 },
    ],
  },
  {
    id: "equity",
    label: "Do you want to own the vehicle and build equity?",
    education:
      "<strong>Why this matters:</strong> With retail finance, each payment moves you closer to full ownership. After the loan is paid, the car is yours — and any resale or trade-in value is equity you can use toward your next purchase. Lease payments do not build ownership; at lease-end you return the vehicle unless you choose to buy it at the preset residual value.",
    placeholder: "Select your ownership goal",
    options: [
      { value: "yes", label: "Yes — I want to own it outright", lease: -2, finance: 2 },
      { value: "maybe", label: "Maybe — ownership would be nice but isn't essential", lease: 0, finance: 1 },
      { value: "no", label: "No — I'd rather return it and move on", lease: 2, finance: -1 },
      { value: "unsure", label: "I'm not sure yet", lease: 0, finance: 0 },
    ],
  },
  {
    id: "vehicleUse",
    label: "How do you typically use your vehicle?",
    education:
      "<strong>Why this matters:</strong> Heavy use, modifications, or commercial driving can conflict with lease rules. Leased vehicles must be returned in good condition with only normal wear and tear. Retail finance gives you freedom to drive as much as you want and customize the vehicle without lease-end penalties.",
    placeholder: "Select your primary use",
    options: [
      { value: "personal", label: "Personal commuting and errands", lease: 0, finance: 0 },
      { value: "family", label: "Family trips and activities (moderate wear)", lease: 0, finance: 1 },
      { value: "heavy", label: "Heavy daily use, pets, kids, or outdoor gear", lease: -1, finance: 1 },
      { value: "modify", label: "I customize or modify my vehicles", lease: -2, finance: 2 },
      { value: "business", label: "Business use (consult a tax advisor)", lease: 1, finance: 1 },
    ],
  },
  {
    id: "tech",
    label: "How often do you want the latest features and safety technology?",
    education:
      "<strong>Why this matters:</strong> Leasing makes it easy to upgrade every 2–3 years into a new Honda with the latest Honda Sensing® safety suite, infotainment, and efficiency improvements — all while the vehicle remains under factory warranty. Buying works best when you are happy to keep one vehicle for many years even as technology advances.",
    placeholder: "Select your preference",
    options: [
      { value: "always", label: "Every 2–3 years — I want the newest tech", lease: 2, finance: -2 },
      { value: "sometimes", label: "Every few years would be nice", lease: 1, finance: -1 },
      { value: "rarely", label: "I'm fine keeping the same car for a long time", lease: -1, finance: 2 },
      { value: "indifferent", label: "Technology is not a major factor for me", lease: 0, finance: 0 },
    ],
  },
  {
    id: "totalCost",
    label: "What matters most to you over the long run?",
    education:
      "<strong>Why this matters:</strong> Smart consumers compare <strong>total cost of ownership</strong>, not just the monthly payment. Over 6 years, two back-to-back leases on the same model may cost more than one retail loan — even though each lease payment is lower — because lease payments never end if you keep cycling. Retail buyers can have payment-free years after the loan and may recover value at resale.",
    placeholder: "Select your long-term priority",
    options: [
      { value: "lowestMonthly", label: "Lowest monthly payment right now", lease: 2, finance: -1 },
      { value: "predictable", label: "Predictable costs with no surprise repairs (warranty)", lease: 1, finance: 0 },
      { value: "lowestTotal", label: "Lowest total cost over 5–7 years", lease: -1, finance: 2 },
      { value: "flexibility", label: "Maximum flexibility to sell or trade anytime", lease: -1, finance: 2 },
    ],
  },
];

const ANSWER_LABELS = Object.fromEntries(
  QUESTIONS.flatMap((q) => q.options.map((o) => [`${q.id}:${o.value}`, o.label]))
);

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
      <select id="${q.id}" name="${q.id}" required aria-describedby="${q.id}-hint">
        <option value="" disabled ${selected ? "" : "selected"}>${q.placeholder}</option>
        ${q.options
          .map(
            (o) =>
              `<option value="${o.value}" ${selected === o.value ? "selected" : ""}>${o.label}</option>`
          )
          .join("")}
      </select>
      <p class="field-hint" id="${q.id}-hint">Choose the option that best describes your situation.</p>
      <p class="field-error-msg" id="${q.id}-error" hidden>Please select an option before continuing.</p>
    </div>
  `;

  stepCurrent.textContent = String(index + 1);
  const progress = ((index + 1) / QUESTIONS.length) * 100;
  progressFill.style.width = `${progress}%`;
  progressBar.setAttribute("aria-valuenow", String(Math.round(progress)));

  prevBtn.hidden = index === 0;
  nextBtn.textContent = index === QUESTIONS.length - 1 ? "See my recommendation" : "Next";
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
  const factors = [];

  QUESTIONS.forEach((q) => {
    const value = answers[q.id];
    const option = q.options.find((o) => o.value === value);
    if (!option) return;

    leaseScore += option.lease;
    financeScore += option.finance;

    if (option.lease > 0 || option.finance > 0) {
      factors.push({
        question: q.label,
        answer: option.label,
        lean: option.lease > option.finance ? "lease" : option.finance > option.lease ? "finance" : "neutral",
      });
    }
  });

  return { leaseScore, financeScore, factors };
}

function getRecommendation(leaseScore, financeScore) {
  const diff = leaseScore - financeScore;

  if (diff >= 3) {
    return {
      type: "lease",
      title: "Leasing is likely your better fit",
      subtitle:
        "Based on your answers, a closed-end lease through Honda Financial Services aligns well with your driving habits, timeline, and payment priorities.",
    };
  }

  if (diff <= -3) {
    return {
      type: "finance",
      title: "Retail finance (buying) is likely your better fit",
      subtitle:
        "Your profile points toward financing and owning the vehicle — you'll avoid mileage penalties and can build equity over time.",
    };
  }

  return {
    type: "either",
    title: "Either option could work — compare total cost",
    subtitle:
      "Your answers are mixed. Run the numbers on both a lease and a retail loan for the specific Honda model you want before deciding.",
  };
}

function buildExplanation(rec, scores) {
  const a = answers;
  const parts = [];

  parts.push("<div class=\"result-section\"><h3>Summary of your answers</h3><ul>");
  QUESTIONS.forEach((q) => {
    const label = ANSWER_LABELS[`${q.id}:${a[q.id]}`] || "Not answered";
    parts.push(`<li><strong>${q.label}</strong> ${label}</li>`);
  });
  parts.push("</ul></div>");

  parts.push(`<div class="result-section"><h3>Why we recommend this</h3>`);

  if (rec.type === "lease") {
    parts.push(`
      <p>Leasing fits consumers who prioritize <strong>lower monthly payments</strong>, drive within mileage limits, and prefer a <strong>new vehicle every few years</strong> under full warranty coverage.</p>
      <p>Your responses suggest you align with this profile. On a typical HFS 36-month lease, you would pay for depreciation rather than the full vehicle price — which is why payments are often substantially lower than retail finance on the same model.</p>
    `);

    if (a.mileage === "low" || a.mileage === "moderate") {
      parts.push(
        "<p>Your annual mileage is within a typical lease allowance, so you are less likely to face costly overage fees at turn-in.</p>"
      );
    }
    if (a.ownership === "short" || a.tech === "always" || a.tech === "sometimes") {
      parts.push(
        "<p>Because you plan to move to a newer vehicle within a few years, leasing lets you upgrade without managing resale or trade-in on an owned car.</p>"
      );
    }
    if (a.payment === "critical" || a.payment === "important") {
      parts.push(
        "<p>Payment sensitivity is a core strength of leasing. HFS lease programs on models like the HR-V and Civic start around $239/month (terms and eligibility apply), lowering the barrier to a new Honda.</p>"
      );
    }
  } else if (rec.type === "finance") {
    parts.push(`
      <p>Retail finance fits consumers who drive <strong>higher mileage</strong>, plan to <strong>keep the vehicle 5+ years</strong>, and want to <strong>build equity</strong> rather than cycle through perpetual payments.</p>
      <p>Your responses point in this direction. While your monthly payment will likely be higher than a lease on the same vehicle, you gain ownership, unlimited mileage, and the ability to sell or trade whenever you choose.</p>
    `);

    if (a.mileage === "high" || a.mileage === "average") {
      parts.push(
        "<p>Your driving volume makes retail finance safer — lease overage charges (often $0.15–$0.25 per mile over the allowance) can add up quickly on a high-mileage driver.</p>"
      );
    }
    if (a.ownership === "long" || a.totalCost === "lowestTotal") {
      parts.push(
        "<p>Keeping a vehicle long-term often makes buying the lower <em>total</em> cost option. After the loan is paid off, you may enjoy years without a car payment while the vehicle still holds resale value.</p>"
      );
    }
    if (a.equity === "yes" || a.totalCost === "flexibility") {
      parts.push(
        "<p>Ownership gives you an asset. On a 2026 Honda CR-V, for example, a buyer who finances at a promotional HFS APR and sells after 6 years may net a lower overall cost than completing two consecutive 36-month leases — even though each lease payment is lower month to month.</p>"
      );
    }
    if (a.vehicleUse === "modify") {
      parts.push(
        "<p>Because you modify vehicles, buying avoids lease restrictions on alterations and potential charges for non-standard equipment at inspection.</p>"
      );
    }
  } else {
    parts.push(`
      <p>Your answers include factors that favor <strong>both</strong> options. This is common — the right choice often comes down to the specific model, current HFS incentives, and exact numbers on a payment calculator.</p>
      <p><strong>Lean toward leasing if:</strong> the monthly payment gap is significant and you are confident you will stay under the mileage cap and return the vehicle in good condition.</p>
      <p><strong>Lean toward retail finance if:</strong> you might keep the car beyond 4–5 years, drive unpredictable miles, or want freedom from lease-end wear-and-tear assessments.</p>
    `);
  }

  parts.push("</div>");

  parts.push(`
    <div class="result-section">
      <h3>Decision score breakdown</h3>
      <p>Each answer contributed points toward leasing or retail finance. Higher score = stronger alignment.</p>
      <div class="score-grid">
        <div class="score-item lease">
          <span class="score-label">Lease alignment</span>
          <span class="score-value">${scores.leaseScore}</span>
        </div>
        <div class="score-item finance">
          <span class="score-label">Finance alignment</span>
          <span class="score-value">${scores.financeScore}</span>
        </div>
      </div>
    </div>
  `);

  const prosCons =
    rec.type === "finance"
      ? {
          pros: [
            "Build equity and own the vehicle after loan payoff",
            "No annual mileage limits or overage fees",
            "Freedom to sell, trade, or keep the car indefinitely",
            "Payment-free years possible after the loan term",
            "HFS promotional APRs (model-dependent) may beat national averages",
          ],
          cons: [
            "Higher monthly payment vs. leasing the same vehicle",
            "Depreciation is your risk — value drops fastest in years 1–3",
            "Maintenance costs rise after factory warranty expires",
            "Long 72+ month loans can create negative equity",
          ],
        }
      : rec.type === "lease"
        ? {
            pros: [
              "Lower monthly payment — pay for use, not full price",
              "Drive a new Honda every 2–3 years with warranty coverage",
              "Predictable costs during the lease term",
              "HFS loyalty benefits may apply at lease-end",
              "Gap coverage often included in closed-end leases",
            ],
            cons: [
              "No equity — payments do not lead to ownership by default",
              "Mileage caps with overage fees if you exceed the allowance",
              "Wear-and-tear charges possible at turn-in",
              "Continuous payments if you lease cycle after cycle",
              "Early termination can be expensive if life circumstances change",
            ],
          }
        : {
            pros: [
              "Leasing: lower payment, newest tech, warranty peace of mind",
              "Finance: ownership, unlimited miles, long-term value potential",
            ],
            cons: [
              "Leasing: mileage limits, no equity, lease-end fees",
              "Finance: higher payment now, depreciation and repair responsibility later",
            ],
          };

  parts.push(`
    <div class="result-section">
      <h3>Pros and cons for your recommended path</h3>
      <div class="pros-cons-grid">
        <div class="pros">
          <h4>Advantages</h4>
          <ul>${prosCons.pros.map((p) => `<li>${p}</li>`).join("")}</ul>
        </div>
        <div class="cons">
          <h4>Watch-outs</h4>
          <ul>${prosCons.cons.map((c) => `<li>${c}</li>`).join("")}</ul>
        </div>
      </div>
    </div>
  `);

  parts.push(`
    <div class="result-section">
      <h3>Before you sign — consumer checklist</h3>
      <ul class="checklist">
        <li>Compare <strong>total cost</strong> over your expected ownership period, not just the monthly payment</li>
        <li>Get pre-approved at <strong>HondaFinancialServices.com</strong> to understand your rate tier before visiting the dealer</li>
        <li>Ask for the lease <strong>money factor</strong>, residual value, and mileage allowance in writing</li>
        <li>For retail finance, confirm APR, term length, and total interest over the life of the loan</li>
        <li>Match the product to your actual driving habits — mileage and ownership length matter most</li>
        <li>Review current HFS programs and model-specific offers — incentives change regularly</li>
      </ul>
    </div>
  `);

  parts.push(`
    <div class="result-section">
      <p class="disclaimer">
        This tool provides general educational guidance from a consumer perspective. It is not a loan calculator, credit decision, or financial advice. Actual payments, rates, and eligibility depend on creditworthiness, vehicle model, taxes, fees, and current Honda Financial Services programs. Always review your contract and consult a qualified advisor for tax or business-use questions.
      </p>
    </div>
  `);

  return parts.join("");
}

function showResults() {
  const scores = computeScores();
  const rec = getRecommendation(scores.leaseScore, scores.financeScore);

  resultsContent.innerHTML = `
    <div class="result-banner ${rec.type}">
      <h3>Our recommendation</h3>
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
  if (currentStep > 0) {
    currentStep -= 1;
    renderQuestion(currentStep);
  }
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
