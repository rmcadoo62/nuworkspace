/* ============================================================
   crr.js — EMI Quote Workup (Customer Request Review)
   Phase 2: list-first panel backed by the crr_workups table.
     - Jordan creates a line (quote #, company, date) -> draft
     - any access_crr user opens it, fills it, Save Draft (resumable)
     - Finished moves it to the collapsed Closed list
     - nav badge counts open (draft) workups
   The form-rendering logic below is ported verbatim from CRRv4.html
   (data tables, spec rendering, collectFormData/applyFormData). The
   Word export + embedded fflate ZIP lib are intentionally dropped.
   Everything is wrapped in an IIFE; the only exports are
   window.openCrrPanel and window.refreshCrrBadge.
   ============================================================ */

(function(){
'use strict';

/* ---- ported form logic (verbatim, document-wide selectors scoped to #crrRoot) ---- */
const LOGO_B64="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";

// === Pre-populated test row data, extracted from .docm templates ===
// === EMI 461F test rows (10 tests) ===
const EMI_461F_ROWS = [
  [
    "CE101",
    "Conducted Emissions, Power Leads, 30 Hz to 10 kHz",
    "6",
    "Tested on each AC power input lead for a total of two (2) tests. Tested to MIL-STD-461F Figure CE101-2 input power < 1 kVA."
  ],
  [
    "CE102",
    "Conducted Emissions, Power Leads, 10 kHz to 10 MHz",
    "8",
    "Tested on each AC power input leads for a total of two (2) tests. Tested to MIL-STD-461F Figure CE102-1 from 10 kHz to 10 MHz with 6 dB relaxation."
  ],
  [
    "CS101",
    "Conducted Susceptibility, Power Leads, 30 Hz to 150 kHz",
    "6",
    "≤100A/phase. Tested on each AC high side for a total of one (1) test. Tested to MIL-STD-461F Figure CS101-1. curve 1 and Figure CS101-2."
  ],
  [
    "CS106",
    "Conducted Susceptibility, Transients, Power Leads",
    "6",
    "Tested on each AC high side for a total of two (2) tests. Tested to MIL-STD-461F Figure CS106-1. Testing performed with a test generator compliant with CS06. The overshoot on this generator is slightly higher than specified in CS106 but the test results are generally accepted because this is considered worst case. Tested in charged mode of operation only"
  ],
  [
    "CS114",
    "Conducted Susceptibility, Bulk Cable Injection, 10 kHz to 200 MHz and from 4 kHz to 1 MHz at 77 dB µA",
    "1 day calibration 4 tests per day",
    "Bulk injection on the AC power input lead and on one (1) lead individually. Common mode test on the input leads for a total of three (3) tests for the power leads. One  (1) test on the signal leads for a total of four (4) tests. Tested to MIL-STD-461F Figure CS114-1 curve 2 from 10 kHz to 200 MHz and from 4 kHz to 1 MHz at 77 dB µA."
  ],
  [
    "CS116",
    "Conducted Susceptibility, Damped Sinusoidal Transients, Cables and\nPower Leads, 10 kHz to 100 MHz",
    "4 hrs setup and calibration\n6 tests per day",
    "Bulk injection on the AC power input lead and on each lead individually for a total of three (3) tests for the power leads. One (1) tests on the signal leads for a total of four (4) tests. Tested to MIL-STD-461F Figure CS116-2. Tested at the required discrete frequencies of 10 kHz, 100 kHz, 1 MHz, 10 MHz, 30 MHz and 100 MHz only."
  ],
  [
    "RE101",
    "Radiated Emissions, Magnetic Field, 30 Hz to 100 kHz",
    "",
    "Applicable to all enclosures including electrical cable interfaces.\nTested to MIL-STD-461F Figure RE101-2 from 30 Hz to 100 kHz"
  ],
  [
    "RE102",
    "Radiated Emissions, Electric Field, 10 kHz to 18 GHz",
    "",
    "Tested to MIL-STD-461F Figure RE102-1 for Metallic Ships below deck applications.\nAntenna positions:\n10 kHz to 30 MHz - 1 position\n30 MHz to 200 MHz - 1 position\n200 MHz to 1 GHz - 2 positions\n1 GHz to 15 GHz – 2 positions\n15 GHz to 18 GHz – 16 positions\nTested at width and cables only. Highest operating frequency not  known? Testing required to 10 times the highest operating frequency or 1 GHz (whichever is greater) or if not known, to 18 GHz."
  ],
  [
    "RS101",
    "Radiated Susceptibility, Magnetic Field, 30 Hz to 100 kHz",
    "22 minutes x number of positions. Reduced by 0.7 if two probes used. Allow 4 hrs setup and calibration. Allow time to position the sensors",
    "Applicable to all equipment enclosures including electrical cable interfaces for operating frequency 100 kHz or less and sensitivity better than 1 uV. Tested to MIL-STD-461F Figure RS101-1 from 30 Hz to 100 kHz at approximately 18 positions. Applicability depends on application."
  ],
  [
    "RS103",
    "Radiated Susceptibility, Electric Field, 2 MHz to 40 GHz",
    "",
    "Tested to MIL-STD-461F Table VII for Ships metallic below deck from 2 MHz to 18 GHz at 10 V/m.\nAntenna positions:\n2 MHz to 30 MHz 2 positions\n30 MHz to 200 MHz 1 position\n200 MHz to 1 GHz 1 positions\n1 GHz to 4 GHz 1 position\n4 GHz to 18 GHz 2 positions"
  ]
];

// === EMI 461G test rows (11 tests) ===
const EMI_461G_ROWS = [
  [
    "CE101",
    "Conducted Emissions, Audio Frequency Currents, Power Leads",
    "6",
    "Tested on each AC power input lead for a total of two (2) tests. Tested to MIL-STD-461G Figure CE101-2 input power ≥ 1 kVA from 30 Hz to 10 kHz limit relaxed by 20 log (I/3)."
  ],
  [
    "CE102",
    "Conducted Emissions, Radio Frequency Potentials, Power Leads",
    "8",
    "Tested on each AC power input lead for a total of two (2) tests. Tested to MIL-STD-461G Figure CE102-1 from 10 kHz to 10 MHz with 6 dB relaxation."
  ],
  [
    "CS101",
    "Conducted Susceptibility, Power Leads",
    "6",
    "Tested on the AC high side for a total of one (1) test. Tested to MIL-STD-461G Figure CS101-1 from 30 Hz to 150 kHz curve 1 and Figure CS101-2. Exempt from testing for normal operating current >30A per phase, or if >30A per phase with sensitivity worse than 1 uV or operating frequency >150 kHz."
  ],
  [
    "CS109",
    "Conducted Susceptibility, structure current",
    "0",
    "Test not applicable to handheld equipment or equipment with an operating sensitivity worse than 1 uV or operating frequency >100 kHz."
  ],
  [
    "CS114",
    "Conducted Susceptibility, Bulk Cable Injection",
    "1 day calibration, 2 tests per day",
    "Bulk injection on the AC power input and on the high side of the AC input leads. Common mode test on the input leads for a total of three (3) tests for the power leads. Five (5) tests on the signal leads for a total of eight (8) tests. Tested to MIL-STD-461G Figure CS114-1 curve 2 from 10 kHz to 200 MHz and from 4 kHz to 1 MHz at 77 dB µA."
  ],
  [
    "CS115",
    "Conducted susceptibility, bulk cable injection, impulse excitation.",
    "If applicable",
    "Bulk injection on the AC power input and on the high side individually for a total of two (2) tests for the power leads. One (1) tests on the signal leads for a total of three (3) tests. Tested to MIL-STD-461G Figure CS115-1 for one minute using 30 ns pulse at 5 amps, 30 Hz."
  ],
  [
    "CS116",
    "Conducted Susceptibility, Damped Sinusoidal Transients, Cables and Power Leads",
    "",
    "Bulk injection on the AC power input and on the high side and return individually for a total of three (3) tests for the power leads. Five (5) tests on the signal leads for a total of eight (8) tests. Tested to MIL-STD-461G Figure CS116-2. Tested at the required discrete frequencies of 10 kHz, 100 kHz, 1 MHz, 10 MHz, 30 MHz and 100 MHz only."
  ],
  [
    "RE101",
    "Radiated Emissions, Magnetic Field",
    "",
    "Applicable to all enclosures including\nelectrical cable interfaces\nTested to MIL-STD-461G Figure RE101-2 from 30 Hz to 100 kHz"
  ],
  [
    "RE102",
    "Radiated Emissions, Electric Field",
    "",
    "Tested to MIL-STD-461G Figure RE102-1 for Metallic Ships below deck applications\nAntenna positions:\n10 kHz to 30 MHz - 1 position\n30 MHz to 200 MHz - 1 position\n200 MHz to 1 GHz - 2 positions\n1 GHz to 15 GHz – 2 positions\n15 GHz to 18 GHz – 20 positions"
  ],
  [
    "RS101",
    "Radiated susceptibility, magnetic field",
    "22 minutes x number of positions. Reduced by 0.7 if two probes used. Allow 4 hrs setup and calibration. Allow time to position the sensors",
    "Applicable to all equipment enclosures including electrical cable interfaces. Applicability depends on application. Tested to MIL-STD-461G Figure RS101-1 from 30 Hz to 100 kHz at approximately 24 positions. Test not applicable to equipment with an operating sensitivity worse than 1 uV or operating frequency >100 kHz."
  ],
  [
    "RS103",
    "Radiated Susceptibility, Electric Field",
    "",
    "Tested to MIL-STD-461G Table XI for Ships metallic below deck from 2 MHz 18 GHz at 10 V/m.\nAntenna positions:\n2 MHz to 30 MHz 3 positions\n30 MHz to 200 MHz 1 position\n200 MHz to 1 GHz 2 positions\n1 GHz to 15 GHz 1 position\n15 GHz to 18 GHz 2 positions"
  ]
];

// === PQ 300B test rows ===
const PQ_300B_ROWS = [
  [
    "Voltage and frequency tolerance test",
    "8",
    "5.3.1",
    "Type 1 single phase (123/107) V ac,  (62/57) Hz",
    "Table II for shipboard and submarine applications"
  ],
  [
    "Voltage and frequency transient tolerance and recovery test",
    "8",
    "5.3.2",
    "138 V ac / 63.3 Hz; 92 V ac / 56.7 Hz",
    "Table III"
  ],
  [
    "Voltage spike test",
    "12",
    "5.3.3",
    "900 to 1000V peak\nline to line and line to ground or\n2400 to 2500V peak\nline to line and line to ground",
    "Set up to Figure 23, 24 or 25??\nVoltage spike impulse wave shape using the IEC 61000-4-5 1.2/50 uS open circuit waveform definition instead of the MIL-STD waveform. Overshoot may exceed figure. Or Voltage spike impulse wave shape of Figure 6 NAVSEA deviation for light fixture found in MIL-DTL-16377 (SSL)"
  ],
  [
    "Emergency condition test",
    "16",
    "5.3.4",
    "70 ms dropout, 2 minute dropout, voltage and frequency decay characteristics for half-load curve, frequency and voltage tolerance 67.2 Hz  for 2 minutes / 155.25 V ac for 2 min",
    "Figure 8\nTable VI"
  ],
  [
    "Grounding test",
    "4",
    "5.3.5",
    "100,000-ohm",
    "Each lead grounded individually for 5 minutes"
  ],
  [
    "User equipment power profile test",
    "8",
    "5.3.6",
    "User voltage and power characteristics",
    "Section 5.3.6 a. through m. as required\nNOTE: Inrush current measurement may be limited by the capabilities of the AC source used, which may not cover 10x nominal current or higher.  If inrush exceeds the capability of the source the measurement cannot be made as desired. We will report what is measured and make a best effort attempt using facility power directly (5 attempts)."
  ],
  [
    "Current waveform test",
    "3(6 if no 461)",
    "5.3.7",
    "120 Hz to 20 kHz <  than 1 kVA limits as applicable",
    "Requirement met using MIL-STD-461F/G test method CE101 with the frequency extended to 20 kHz. (A non-regulated power source may be needed for this test as regulated power source switching produces inconsistent current waveform data, but usually this is for <1A where testing is not required) If strictly followed this could prove to be difficult for us.\nRequirement for THD could be imposed in the procurement specification for devices that have unusual waveform. Not required for currents <1A per NAVSEA."
  ],
  [
    "Voltage and frequency modulation test",
    "16",
    "5.3.8",
    "Frequency modulation 0.5%\nVoltage modulation 2%\nVoltage modulation, Frequency modulation and Combined voltage and frequency modulation for periods of 17 msec, 75 msec, 250 msec, 500 msec, 1 sec, 5 sec and 10 sec each repeated ten consecutive times",
    "Table VII"
  ],
  [
    "Simulated human body leakage current test for personnel safety",
    "6",
    "5.3.9",
    "60 Hz to 700 Hz < 5 mA\n700 Hz to 100 kHz < 70 mA",
    "Figure 28\nFigure 31"
  ],
  [
    "Equipment insulation resistance test",
    "4",
    "5.3.10.1",
    "500 V dc for 60 seconds\nResistance to ground > 10 MΩ",
    "Insulation resistance test."
  ],
  [
    "Active ground",
    "4",
    "5.3.10.2",
    "Active ground test\nFor a 440-Vrms EUT, the AC source voltage shall be:\n440 × 1.414 = 622.2 Vpeak\nThe DC source voltage shall be: 505 VDC\nFor a 115-Vrms EUT, the AC source voltage shall be:\n115 × 1.414 = 162.6 Vpeak\nThe DC source voltage shall be: 155 VDC",
    "AGD is run on one line only per NAVSEA direction. Check if legacy requirements apply."
  ]
];

// === PQ 300 Part 1 test rows ===
const PQ_300P1_ROWS = [
  [
    "Grounding (susceptibility) test",
    "4",
    "5.3.1",
    "100,000-ohm",
    "Each lead grounded individually for 5 minutes"
  ],
  [
    "User equipment power profile test",
    "8",
    "5.3.2",
    "User voltage and power characteristics",
    "Section 5.3.2 a. through o. as required\nNOTE: Inrush current measurement may be limited by the capabilities of the AC source used, which may not cover 10x nominal current or higher.  If inrush exceeds the capability of the source the measurement cannot be made as desired. We will report what is measured and make a best effort attempt using facility power directly (5 attempts)."
  ],
  [
    "Voltage and frequency maximum departure tolerance test",
    "8",
    "5.3.3",
    "Type 1 singe phase (127/104) VAC,  (63/57) Hz or\nType 1 singe phase (484/396) VAC,  (63/57) Hz",
    "Table III for shipboard and submarine applications  Tested for 30 minutes in four (4) modes after temperature stability."
  ],
  [
    "Voltage and frequency transient tolerance and recovery (susceptibility) test",
    "8",
    "5.3.4",
    "138 VAC / 63.3 Hz; 92 VAC / 56.7 Hz  or\n528 VAC / 63.3 Hz; 352 VAC / 56.7 Hz",
    "Table IV duration for 2 seconds"
  ],
  [
    "Voltage spike (susceptibility) test",
    "12",
    "5.3.5",
    "900 to 1000V peak\nline to line and line to ground or\n2400 to 2500V peak\nline to line and line to ground",
    "Setup to Figure 28, 29 or Figure 30?\nVoltage spike impulse wave shape using the IEC 61000-4-5 1.2/50 uS open circuit waveform definition instead of the MIL-STD waveform. Overshoot may exceed figure. Or Voltage spike impulse wave shape of Figure 6 NAVSEA deviation for light fixture found in MIL-DTL-16377 (SSL)"
  ],
  [
    "Emergency conditions (susceptibility) test",
    "16",
    "5.3.6",
    "70 ms dropout, 2 minute dropout, voltage and frequency decay characteristics for half-load curve, frequency and voltage tolerance 67.2 Hz  for 2 minutes / 155.25 VAC for 2 minutes or\ntolerance 67.2 Hz  for 2 minutes / 594 VAC for 2 minutes",
    "Figure 9\nTable VII\nTc time to be provided by supplier or else default times shall be used."
  ],
  [
    "Current waveform (emission) test",
    "3 (6 if no 461)",
    "5.3.7",
    "Section 5.3.7 performed  in accordance with CE101 testing",
    "Requirement met using MIL-STD-461G test method CE101 with the frequency extended to 20 kHz.\n(A non-regulated power source may be needed for this test as regulated power source switching produces inconsistent current waveform data, but usually this is for <1A where testing is not required) If strictly followed this could prove to be difficult for us.\nRequirement for THD could be imposed in the procurement specification for devices that have unusual waveform. Not required for currents <1A per NAVSEA."
  ],
  [
    "Voltage and frequency modulation (susceptibility) test.",
    "16",
    "5.3.8",
    "Frequency modulation 0.5%\nVoltage modulation 2%\nVoltage modulation, Frequency modulation and Combined voltage and frequency modulation for periods of 50 msec, 500 msec, 1 sec, and 10 sec each repeated ten consecutive times",
    "Table VIII"
  ],
  [
    "Simulated human body impedance ground current test.",
    "6",
    "5.3.9",
    "60 Hz to 700 Hz < 5 mA\n700 Hz to 100 kHz < 70 mA",
    "Figure 33 through  Figure 36 depending on source of voltage"
  ],
  [
    "Equipment line-to-ground voltage (susceptibility) test.",
    "4",
    "5.3.10.1",
    "150 VDC (for 115 VAC) or 500 VDC (for 440 VAC) for 60 seconds\nResistance to ground > 10 MΩ",
    "Insulation resistance test"
  ],
  [
    "Equipment line-to-ground voltage (susceptibility) test AGD",
    "4",
    "5.3.10.2",
    "Active ground test\nFor a 440-Vrms EUT, the AC source voltage shall be:\n440 × 1.414 = 622.2 Vpeak\nThe DC source voltage shall be: 505 VDC\nFor a 115-Vrms EUT, the AC source voltage shall be:\n115 × 1.414 = 162.6 Vpeak\nThe DC source voltage shall be: 155 VDC",
    "AGD is run on one line only per NAVSEA direction. Check if legacy requirements apply."
  ]
];

// === DC Mag (single row) ===
const DC_MAG_ROWS = [
  [
    "DC Magnetics",
    "DOD-STD-1399 Section 070",
    "",
    "1600 A/m three orthogonal positions"
  ]
];

// === Spec definitions: which test data + how to render ===
const SPECS = {
  emi461f: {
    label: "MIL-STD-461F",
    columns: ["Test", "Description", "Time", "Comments"],
    columnClasses: ["col-key", "", "col-time", ""],
    initialRows: () => EMI_461F_ROWS.map(r => r.slice()),
  },
  emi461g: {
    label: "MIL-STD-461G",
    columns: ["Test", "Description", "Time", "Comments"],
    columnClasses: ["col-key", "", "col-time", ""],
    initialRows: () => EMI_461G_ROWS.map(r => r.slice()),
  },
  pq300b: {
    label: "MIL-STD-1399 Section 300B",
    columns: ["Requirement", "Time (hr)", "1399 Paragraph", "Test Requirement", "Tables / Figures"],
    columnClasses: ["", "col-time", "col-key", "", ""],
    initialRows: () => PQ_300B_ROWS.map(r => r.slice()),
  },
  pq300p1: {
    label: "MIL-STD-1399-300 Part 1",
    columns: ["Requirement", "Time (hr)", "1399 Paragraph", "Test Requirement", "Tables / Figures"],
    columnClasses: ["", "col-time", "col-key", "", ""],
    initialRows: () => PQ_300P1_ROWS.map(r => r.slice()),
  },
  dcmag: {
    label: "DC Magnetics",
    columns: ["Test", "Description", "Time", "Comments"],
    columnClasses: ["col-key", "", "col-time", ""],
    initialRows: () => DC_MAG_ROWS.map(r => r.slice()),
  },
};

// === State ===
// Form fields are read directly from DOM at save/export time.
// Spec tables hold their row data here (so toggling off/on doesn't reset edits).
const state = {
  enabledSpecs: {},   // { emi461f: true, ... }
  specRows: {},       // { emi461f: [[...], [...]], ... }
};

// === DOM helpers ===
const $ = (id) => document.getElementById(id);
const tablesContainer = $('tablesContainer');
const statusEl = $('status');

// === Init logo ===
$('logoImg').src = 'data:image/png;base64,' + LOGO_B64;

// === Status flash ===
let statusTimer = 0;
function setStatus(msg, kind) {
  statusEl.textContent = msg;
  statusEl.className = 'status' + (kind ? (' ' + kind) : '');
  clearTimeout(statusTimer);
  if (kind) statusTimer = setTimeout(() => { statusEl.textContent = 'Ready.'; statusEl.className = 'status'; }, 4000);
}

// === Render a single spec table ===
function renderSpecTable(specKey) {
  const spec = SPECS[specKey];
  const rows = state.specRows[specKey] || [];
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.spec = specKey;

  const h2 = document.createElement('h2');
  h2.textContent = spec.label;
  card.appendChild(h2);

  const wrap = document.createElement('div');
  wrap.className = 'testtable-wrap';
  const tbl = document.createElement('table');
  tbl.className = 'testtable';

  // Header row
  const thead = document.createElement('thead');
  const htr = document.createElement('tr');
  const gut = document.createElement('th'); gut.className = 'gut'; gut.textContent = '#';
  htr.appendChild(gut);
  spec.columns.forEach((col, i) => {
    const th = document.createElement('th');
    th.textContent = col;
    if (spec.columnClasses[i]) th.className = spec.columnClasses[i];
    htr.appendChild(th);
  });
  thead.appendChild(htr);
  tbl.appendChild(thead);

  // Body rows
  const tbody = document.createElement('tbody');
  rows.forEach((row, ri) => {
    tbody.appendChild(buildRow(specKey, row, ri, spec));
  });
  tbl.appendChild(tbody);

  wrap.appendChild(tbl);
  card.appendChild(wrap);

  // Time total + shift total — recomputed on every cell edit via refreshTotal
  const totalsBar = document.createElement('div');
  totalsBar.className = 'time-totals';
  totalsBar.dataset.spec = specKey;
  totalsBar.style.cssText = 'margin-top:8px;padding:8px 12px;background:#f0f4f7;border:1px solid var(--line);border-radius:5px;font-size:12.5px;display:flex;gap:18px;align-items:center;flex-wrap:wrap';
  card.appendChild(totalsBar);
  refreshTimeTotal(specKey, totalsBar);

  // Add-row + clear actions
  const actions = document.createElement('div');
  actions.className = 'table-actions';
  const addBtn = document.createElement('button');
  addBtn.textContent = '+ Add row';
  addBtn.addEventListener('click', () => {
    const blank = new Array(spec.columns.length).fill('');
    state.specRows[specKey].push(blank);
    refreshTable(specKey);
  });
  actions.appendChild(addBtn);
  card.appendChild(actions);

  tablesContainer.appendChild(card);
}

// Render the time/shift total into the bar element for one spec
function refreshTimeTotal(specKey, bar) {
  if (!bar) {
    bar = document.querySelector(`#crrRoot .time-totals[data-spec="${specKey}"]`);
    if (!bar) return;
  }
  const t = computeTimeTotal(specKey);
  const hrs = (Math.round(t.hours * 10) / 10).toString();
  const skippedNote = t.skipped > 0
    ? ` <span style="color:var(--muted);font-size:11px">(${t.skipped} row${t.skipped!==1?'s':''} skipped: non-numeric or blank)</span>`
    : '';
  bar.innerHTML =
    '<span><strong>Total hours:</strong> ' + hrs + '</span>' +
    '<span><strong>Shifts (8 hr):</strong> ' + t.shifts + '</span>' +
    skippedNote;
}

// === Build a single row TR ===
function buildRow(specKey, row, ri, spec) {
  const tr = document.createElement('tr');
  // gutter with row # + delete button
  const gut = document.createElement('td');
  gut.className = 'gut';
  const num = document.createElement('div'); num.textContent = ri + 1;
  const del = document.createElement('button');
  del.textContent = '×';
  del.title = 'Remove row';
  del.addEventListener('click', () => {
    state.specRows[specKey].splice(ri, 1);
    refreshTable(specKey);
  });
  gut.appendChild(num); gut.appendChild(del);
  tr.appendChild(gut);

  // Data cells
  spec.columns.forEach((_, ci) => {
    const td = document.createElement('td');
    if (spec.columnClasses[ci]) td.className = spec.columnClasses[ci];
    const ta = document.createElement('textarea');
    // Initial rows = newline count in value (gives correct starting height)
    ta.rows = Math.max(1, String(row[ci] || '').split(/\r?\n/).length);
    ta.value = row[ci] || '';
    ta.addEventListener('input', (e) => {
      state.specRows[specKey][ri][ci] = e.target.value;
      autosize(ta);
      // Only refresh totals if this is the Time column — cheap optimization
      if (ci === timeColumnIndex(specKey)) refreshTimeTotal(specKey);
    });
    td.appendChild(ta);
    tr.appendChild(td);
    // Two-pass autosize: once now, once after layout settles
    requestAnimationFrame(() => autosize(ta));
    setTimeout(() => autosize(ta), 50);
  });

  return tr;
}

function autosize(ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }

// === Size: inches → cm live conversion ===
function fmtCm(n) {
  if (n === null || n === undefined || n === '' || isNaN(n)) return '—';
  return (parseFloat(n) * 2.54).toFixed(1);
}
function updateSizeCm() {
  const L = $('eqSizeL').value, W = $('eqSizeW').value, H = $('eqSizeH').value;
  const any = (L !== '' || W !== '' || H !== '');
  if (!any) { $('eqSizeCm').textContent = '— cm —'; return; }
  $('eqSizeCm').textContent = '→ ' + fmtCm(L) + ' × ' + fmtCm(W) + ' × ' + fmtCm(H) + ' cm';
}
['eqSizeL','eqSizeW','eqSizeH'].forEach(id => {
  $(id).addEventListener('input', updateSizeCm);
});
updateSizeCm();

// === Section VII boilerplate fragments ===
// Assembled from the .docm templates' "Special requirements for quote" texts.
// Each spec contributes a fragment when checked. Common preamble + postamble
// always appear. User can freely edit the result; auto-overwrite is opt-in.
const QUOTE_REQ_FRAGMENTS = {
  preamble: 'Customer to supply cables and all peripheral and monitoring equipment (unless we already have it), one mode of operation.',
  emi:      'This quote is valid for ships, metallic below deck. This quote assumes that the susceptibility criteria can be determined in less than 3 seconds during the real-time operation of the EUT, and that if additional monitoring personnel are needed, they would be provided by the customer. Susceptibility determination provided by customer. Customer supplies ambient load if needed (depends on load).',
  pq:       'Customer to specify the best location for the thermocouple for 1399 temperature stability monitoring.',
  dcmag:    '', // No unique fragment in the source templates
  postamble:'Pricing is based on customer supplied information, the assumptions listed here, and acceptance of an approved test procedure. Specify any deviations here if known.',
};
function buildSuggestedQuoteReq() {
  const parts = [QUOTE_REQ_FRAGMENTS.preamble];
  const hasEmi = state.enabledSpecs.emi461f || state.enabledSpecs.emi461g;
  const hasPq  = state.enabledSpecs.pq300b  || state.enabledSpecs.pq300p1;
  const hasDc  = state.enabledSpecs.dcmag;
  if (hasEmi && QUOTE_REQ_FRAGMENTS.emi)    parts.push(QUOTE_REQ_FRAGMENTS.emi);
  if (hasPq  && QUOTE_REQ_FRAGMENTS.pq)     parts.push(QUOTE_REQ_FRAGMENTS.pq);
  if (hasDc  && QUOTE_REQ_FRAGMENTS.dcmag)  parts.push(QUOTE_REQ_FRAGMENTS.dcmag);
  parts.push(QUOTE_REQ_FRAGMENTS.postamble);
  return parts.join(' ');
}
function refreshQuoteReqHint() {
  // If textarea is empty, hint suggests applying. If non-empty AND differs
  // from current suggested, hint mentions update available.
  const current = $('quoteReq').value.trim();
  const suggested = buildSuggestedQuoteReq();
  const hint = $('suggestedReqHint');
  if (!current) {
    hint.textContent = '(empty — click to populate from selected specs)';
  } else if (current !== suggested.trim()) {
    hint.textContent = '(suggested text changed — click to overwrite your edits)';
  } else {
    hint.textContent = '(matches suggested text)';
  }
}
$('applySuggestedReq').addEventListener('click', () => {
  // Guard: nothing checked → no suggested text to apply
  const anySpec = Object.values(state.enabledSpecs).some(v => v);
  if (!anySpec) {
    setStatus('Select at least one spec table above before applying.', 'warn');
    return;
  }
  const current = $('quoteReq').value.trim();
  const suggested = buildSuggestedQuoteReq();
  // Case 1: already matches → no-op
  if (current === suggested.trim()) {
    setStatus('Text already matches the suggestion — nothing to apply.', 'ok');
    return;
  }
  // Case 2: textarea has content that doesn't match the suggestion → confirm
  // before destroying it (covers both unrelated edits AND prior partial applies)
  if (current.length > 0) {
    if (!confirm('Replace the current Section VII text with the freshly suggested text for your selected specs? Your existing text will be overwritten.')) {
      return;
    }
  }
  $('quoteReq').value = suggested;
  autosize($('quoteReq'));
  refreshQuoteReqHint();
  setStatus('Applied suggested text for selected specs.', 'ok');
});
$('quoteReq').addEventListener('input', () => { refreshQuoteReqHint(); autosize($('quoteReq')); });

// === Time totals per spec table ===
// Sum only pure-number cells (anything matching ^\s*\d+(\.\d+)?\s*$).
// Shifts = ceil(sum / 8). Skipped rows are reported so user knows what's missing.
function timeColumnIndex(specKey) {
  // EMI/DCMag: col 0=Test, 1=Description, 2=Time, 3=Comments  → time at index 2
  // PQ: col 0=Requirement, 1=Time, 2=Paragraph, 3=Test Req, 4=Tables → time at index 1
  const cols = SPECS[specKey].columns;
  return cols.findIndex(c => /^time/i.test(c));
}
function computeTimeTotal(specKey) {
  const rows = state.specRows[specKey] || [];
  const colIdx = timeColumnIndex(specKey);
  if (colIdx < 0 || rows.length === 0) return { hours: 0, shifts: 0, counted: 0, skipped: 0 };
  let counted = 0, skipped = 0, hours = 0;
  rows.forEach(r => {
    const raw = String(r[colIdx] || '').trim();
    if (!raw) { skipped++; return; }
    const m = raw.match(/^\s*(\d+(?:\.\d+)?)\s*$/);
    if (m) { hours += parseFloat(m[1]); counted++; }
    else { skipped++; }
  });
  return { hours, shifts: Math.ceil(hours / 8), counted, skipped };
}

// === Re-render a single table without rebuilding everything ===
function refreshTable(specKey) {
  const oldCard = tablesContainer.querySelector(`[data-spec="${specKey}"]`);
  if (!oldCard) return;
  const newCard = (() => {
    const tmp = document.createElement('div');
    tablesContainer.appendChild(tmp);
    renderSpecTable(specKey);
    const out = tablesContainer.lastElementChild;
    tablesContainer.removeChild(tmp);
    return out;
  })();
  tablesContainer.insertBefore(newCard, oldCard);
  tablesContainer.removeChild(oldCard);
}

// === Re-render all enabled spec tables in selector order ===
function renderAllTables() {
  tablesContainer.innerHTML = '';
  Object.keys(SPECS).forEach(key => {
    if (state.enabledSpecs[key]) renderSpecTable(key);
  });
}

// === Toggle spec on/off ===
function setSpecEnabled(specKey, enabled) {
  state.enabledSpecs[specKey] = enabled;
  // Update pill visual
  const lbl = document.querySelector(`#specOpts label[data-spec="${specKey}"]`);
  if (lbl) lbl.classList.toggle('on', enabled);
  // Initialize row data if first enable
  if (enabled && !state.specRows[specKey]) {
    state.specRows[specKey] = SPECS[specKey].initialRows();
  }
  renderAllTables();
  refreshQuoteReqHint();
}

// === Wire up spec selector checkboxes ===
document.querySelectorAll('#specOpts input[type=checkbox]').forEach(cb => {
  cb.addEventListener('change', (e) => setSpecEnabled(e.target.dataset.spec, e.target.checked));
});

// === Form field collection ===
function collectFormData() {
  // Simple text/email/tel/date/textarea fields, gathered by id
  const ids = ['quoteNo','quoteDate','custCompany','custAddress','custName','custTitle',
               'custEmail','custPhone','custFax','eqCables','eqModes','eqReaction',
               'eqSizeL','eqSizeW','eqSizeH','eqWeight','eqCurrent','eqVoltage',
               'specOtherText','specialReq','quoteReq'];
  const fields = {};
  ids.forEach(id => { const el = $(id); if (el) fields[id] = el.value; });
  // Checkboxes
  const checks = {};
  document.querySelectorAll('#crrRoot input[type=checkbox][data-key]').forEach(cb => { checks[cb.dataset.key] = cb.checked; });
  checks.govWitness = $('govWitness').checked;
  checks.cuiReq = $('cuiReq').checked;
  // Specs + their rows (only enabled ones; preserve disabled rows in state too)
  return {
    version: 1,
    fields, checks,
    enabledSpecs: { ...state.enabledSpecs },
    specRows: { ...state.specRows },
  };
}

function applyFormData(d) {
  if (!d || typeof d !== 'object') return;
  // Fields
  Object.entries(d.fields || {}).forEach(([id, val]) => { const el = $(id); if (el) el.value = val; });
  // Checkboxes
  Object.entries(d.checks || {}).forEach(([key, val]) => {
    const cb = document.querySelector(`#crrRoot input[type=checkbox][data-key="${key}"]`);
    if (cb) cb.checked = !!val;
  });
  if (d.checks && 'govWitness' in d.checks) $('govWitness').checked = !!d.checks.govWitness;
  if (d.checks && 'cuiReq' in d.checks) $('cuiReq').checked = !!d.checks.cuiReq;
  // Specs
  state.enabledSpecs = { ...(d.enabledSpecs || {}) };
  state.specRows = { ...(d.specRows || {}) };
  // Sync spec selector pills + checkboxes
  document.querySelectorAll('#specOpts input[type=checkbox]').forEach(cb => {
    const enabled = !!state.enabledSpecs[cb.dataset.spec];
    cb.checked = enabled;
    const lbl = document.querySelector(`#specOpts label[data-spec="${cb.dataset.spec}"]`);
    if (lbl) lbl.classList.toggle('on', enabled);
  });
  renderAllTables();
  // Refresh derived UI elements that depend on loaded values
  updateSizeCm();
  refreshQuoteReqHint();
  if ($('quoteReq')) { autosize($('quoteReq')); }
  if ($('specialReq')) { autosize($('specialReq')); }
}


// === Default the date to today ===
(function defaultDate() {
  const d = new Date();
  const iso = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  $('quoteDate').value = iso;
})();

// Set initial Section VII hint
refreshQuoteReqHint();


/* ============================================================
   Phase 2 — Supabase persistence, list view, draft/finished
   lifecycle, and the open-count badge. Uses the page globals
   sb, currentEmployee, employees (available because this is a
   native module, not an iframe). Reuses collectFormData() /
   applyFormData() from the form logic above as the lossless
   serialize / restore pair against the crr_workups.data blob.
   ============================================================ */

let crrCurrentQuote = null;   // quote_number open in the form (null = list view)
let crrDirty       = false;   // unsaved edits in the open form
let crrList        = [];      // cached crr_workups rows for the list

function crrEmpId() {
  return (typeof currentEmployee !== 'undefined' && currentEmployee) ? currentEmployee.id : null;
}
function crrEmpName(id) {
  if (id == null) return '';
  try {
    if (typeof employees !== 'undefined' && Array.isArray(employees)) {
      const e = employees.find(x => x.id === id);
      if (e) return e.name || e.initials || '';
    }
  } catch (_) {}
  return '';
}
function crrFmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function crrEscHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ---- view switching ----
function crrShowForm() {
  const lv = document.getElementById('crrListView');
  const fv = document.getElementById('crrFormView');
  if (lv) lv.style.display = 'none';
  if (fv) fv.style.display = 'flex';
}
function crrShowList() {
  const lv = document.getElementById('crrListView');
  const fv = document.getElementById('crrFormView');
  if (fv) fv.style.display = 'none';
  if (lv) lv.style.display = '';
}

// ---- list ----
async function crrLoadList() {
  if (typeof sb === 'undefined' || !sb) return;
  const { data, error } = await sb.from('crr_workups')
    .select('quote_number,customer_company,status,updated_at,updated_by')
    .order('updated_at', { ascending: false });
  if (error) { console.error('crr list:', error); setStatus('Could not load workups', 'warn'); return; }
  crrList = data || [];
  crrRenderList();
  refreshCrrBadge();
}

function crrRowHtml(r) {
  return '<tr class="crr-li" data-q="' + crrEscHtml(r.quote_number) + '">'
       + '<td class="crr-q">' + crrEscHtml(r.quote_number) + '</td>'
       + '<td>' + crrEscHtml(r.customer_company) + '</td>'
       + '<td>' + crrEscHtml(crrEmpName(r.updated_by)) + '</td>'
       + '<td>' + crrEscHtml(crrFmtDate(r.updated_at)) + '</td>'
       + '</tr>';
}

function crrRenderList() {
  const wrap = document.getElementById('crrListBody');
  if (!wrap) return;
  const open   = crrList.filter(r => r.status !== 'finished');
  const closed = crrList.filter(r => r.status === 'finished');
  const head = '<thead><tr><th>Quote #</th><th>Company</th><th>Last edited by</th><th>Updated</th></tr></thead>';

  let html = '';
  html += '<div class="crr-list-head"><h2>Open Workups <span class="crr-count">' + open.length + '</span></h2>'
        + '<button type="button" class="crr-btn primary" id="crrNewBtn">+ New Workup</button></div>';
  html += '<div id="crrNewForm" class="crr-newform" style="display:none">'
        + '<input type="text" id="crrNewQuote" placeholder="Quote # (e.g. 26-160)" autocomplete="off"/>'
        + '<input type="text" id="crrNewCompany" placeholder="Company" autocomplete="off"/>'
        + '<input type="date" id="crrNewDate"/>'
        + '<button type="button" class="crr-btn primary" id="crrCreateBtn">Create</button>'
        + '<button type="button" class="crr-btn" id="crrCancelNewBtn">Cancel</button>'
        + '<span class="crr-newmsg" id="crrNewMsg"></span></div>';
  html += open.length
        ? '<table class="crr-list">' + head + '<tbody>' + open.map(crrRowHtml).join('') + '</tbody></table>'
        : '<div class="crr-empty">No open workups.</div>';
  html += '<div class="crr-closed-head" id="crrClosedToggle">'
        + '<span class="crr-caret">&#9656;</span> Closed Workups <span class="crr-count">' + closed.length + '</span></div>';
  html += '<div id="crrClosedWrap" style="display:none">'
        + (closed.length
            ? '<table class="crr-list">' + head + '<tbody>' + closed.map(crrRowHtml).join('') + '</tbody></table>'
            : '<div class="crr-empty">No closed workups.</div>')
        + '</div>';
  wrap.innerHTML = html;

  // default the new-workup date to today
  const nd = document.getElementById('crrNewDate');
  if (nd) {
    const d = new Date();
    nd.value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  // wire controls
  document.getElementById('crrNewBtn').addEventListener('click', crrShowNewForm);
  document.getElementById('crrCreateBtn').addEventListener('click', crrCreateWorkup);
  document.getElementById('crrCancelNewBtn').addEventListener('click', crrHideNewForm);
  const toggle = document.getElementById('crrClosedToggle');
  toggle.addEventListener('click', () => {
    const cw = document.getElementById('crrClosedWrap');
    const show = cw.style.display === 'none';
    cw.style.display = show ? '' : 'none';
    toggle.querySelector('.crr-caret').innerHTML = show ? '&#9662;' : '&#9656;';
  });
  wrap.querySelectorAll('tr.crr-li').forEach(tr => {
    tr.addEventListener('click', () => crrOpenWorkup(tr.dataset.q));
  });
}

function crrShowNewForm() {
  const f = document.getElementById('crrNewForm');
  if (f) { f.style.display = 'flex'; const q = document.getElementById('crrNewQuote'); if (q) q.focus(); }
}
function crrHideNewForm() {
  const f = document.getElementById('crrNewForm');
  if (f) { f.style.display = 'none'; const m = document.getElementById('crrNewMsg'); if (m) m.textContent = ''; }
}

async function crrCreateWorkup() {
  if (typeof sb === 'undefined' || !sb) return;
  const q       = document.getElementById('crrNewQuote').value.trim();
  const company = document.getElementById('crrNewCompany').value.trim();
  const date    = document.getElementById('crrNewDate').value;
  const msg     = document.getElementById('crrNewMsg');
  if (!q) { msg.textContent = 'Quote # is required.'; return; }
  if (crrList.some(r => r.quote_number === q)) { msg.textContent = 'That quote # already exists.'; return; }

  // Seed an empty form with the three creation fields, then snapshot it.
  crrClearForm();
  const qn = document.getElementById('quoteNo');     if (qn) qn.value = q;
  const cc = document.getElementById('custCompany'); if (cc) cc.value = company;
  const qd = document.getElementById('quoteDate');   if (qd && date) qd.value = date;

  const payload = {
    quote_number: q,
    customer_company: company || null,
    status: 'draft',
    data: collectFormData(),
    created_by: crrEmpId(),
    updated_by: crrEmpId()
  };
  const { error } = await sb.from('crr_workups').insert(payload);
  if (error) { console.error('crr create:', error); msg.textContent = 'Create failed: ' + (error.message || error); return; }
  crrHideNewForm();
  await crrLoadList();
  crrOpenWorkup(q);
}

async function crrOpenWorkup(quoteNo) {
  if (typeof sb === 'undefined' || !sb) return;
  const { data, error } = await sb.from('crr_workups').select('*').eq('quote_number', quoteNo).single();
  if (error || !data) { console.error('crr open:', error); setStatus('Could not open workup', 'warn'); return; }

  if (data.data) { applyFormData(data.data); } else { crrClearForm(); }

  // Quote # is owned by whoever created the line — lock it.
  const qn = document.getElementById('quoteNo');
  if (qn) { qn.value = data.quote_number; qn.readOnly = true; }

  crrCurrentQuote = data.quote_number;
  crrDirty = false;

  const lbl = document.getElementById('crrFormQuote');
  if (lbl) lbl.textContent = 'Quote #' + data.quote_number;
  const finBtn  = document.getElementById('crrFinishBtn');
  const saveBtn = document.getElementById('crrSaveDraftBtn');
  const isFinished = data.status === 'finished';
  if (finBtn)  finBtn.style.display  = isFinished ? 'none' : '';
  if (saveBtn) saveBtn.style.display = isFinished ? 'none' : '';

  crrShowForm();
  setStatus(isFinished ? 'Finished workup (view only).' : 'Draft loaded.', 'ok');
}

// Clear every form field/checkbox/spec back to empty (was the old Reset).
function crrClearForm() {
  document.querySelectorAll('#crrRoot input[type=text],#crrRoot input[type=email],#crrRoot input[type=tel],#crrRoot input[type=date],#crrRoot input[type=number],#crrRoot textarea').forEach(el => { el.value = ''; });
  document.querySelectorAll('#crrRoot input[type=checkbox]').forEach(cb => { cb.checked = false; });
  state.enabledSpecs = {};
  state.specRows = {};
  document.querySelectorAll('#specOpts label').forEach(l => l.classList.remove('on'));
  renderAllTables();
  updateSizeCm();
  refreshQuoteReqHint();
}

async function crrSave(finish) {
  if (typeof sb === 'undefined' || !sb || !crrCurrentQuote) return;
  const cc = document.getElementById('custCompany');
  const payload = {
    quote_number: crrCurrentQuote,
    customer_company: cc ? (cc.value.trim() || null) : null,
    data: collectFormData(),
    status: finish ? 'finished' : 'draft',
    updated_by: crrEmpId(),
    updated_at: new Date().toISOString()
  };
  if (finish) { payload.closed_by = crrEmpId(); payload.closed_at = new Date().toISOString(); }

  const { error } = await sb.from('crr_workups').upsert(payload, { onConflict: 'quote_number' });
  if (error) { console.error('crr save:', error); setStatus('Save failed: ' + (error.message || error), 'warn'); return; }

  crrDirty = false;
  if (finish) {
    setStatus('Workup finished.', 'ok');
    await crrBackToList(true);
  } else {
    setStatus('Draft saved.', 'ok');
    crrLoadList(); // refresh cache + badge in the background
  }
}

async function crrBackToList(skipDirtyCheck) {
  if (!skipDirtyCheck && crrDirty) {
    if (!window.confirm('You have unsaved changes. Leave without saving?')) return;
  }
  crrCurrentQuote = null;
  crrDirty = false;
  crrShowList();
  await crrLoadList();
}

// ---- open-count badge (drafts) ----
function refreshCrrBadge() {
  const badge = document.getElementById('crrBadge');
  if (!badge) return;
  if (typeof sb === 'undefined' || !sb) return;
  sb.from('crr_workups')
    .select('quote_number', { count: 'exact', head: true })
    .neq('status', 'finished')
    .then(({ count }) => {
      const n = count || 0;
      badge.textContent = n;
      badge.style.display = n > 0 ? '' : 'none';
    })
    .catch(() => {});
}
window.refreshCrrBadge = refreshCrrBadge;

// ---- one-time form wiring: dirty tracking + the form-bar buttons ----
(function crrWireForm() {
  const root = document.getElementById('crrRoot');
  if (root) {
    root.addEventListener('input',  () => { crrDirty = true; });
    root.addEventListener('change', () => { crrDirty = true; });
  }
  const save = document.getElementById('crrSaveDraftBtn'); if (save) save.addEventListener('click', () => crrSave(false));
  const fin  = document.getElementById('crrFinishBtn');    if (fin)  fin.addEventListener('click',  () => crrSave(true));
  const back = document.getElementById('crrBackBtn');      if (back) back.addEventListener('click', () => crrBackToList(false));
})();

// Keep the badge live without needing to open the panel (like Surveys/Tasks).
setInterval(() => { try { refreshCrrBadge(); } catch (_) {} }, 60000);

// ===== Workspace panel entry point =====
window.openCrrPanel = function (el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  (el || document.getElementById('navCrr'))?.classList.add('active');
  const tb = document.getElementById('topbarName');
  if (tb) tb.textContent = 'EMI Quote WU';
  if (typeof showProjectView === 'function') showProjectView('panel-crr');
  crrShowList();
  crrLoadList();
};

})();
