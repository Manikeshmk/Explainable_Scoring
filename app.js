/**
 * app.js — UI Controller for ExplainGrade (Overhauled)
 * Wires the Premium UI to the Scoring Engine.
 */

"use strict";

// ─────────────────────────────────────────
// 1. Initialization & Helpers
// ─────────────────────────────────────────

const libs = {
  Papa: typeof Papa !== "undefined",
  mammoth: typeof mammoth !== "undefined",
  XLSX: typeof XLSX !== "undefined",
};

function checkLibrary(name) {
  if (!libs[name]) {
    console.warn(`⚠️ Library ${name} not loaded.`);
    return false;
  }
  return true;
}

// Theme Toggle
const themeToggle = document.getElementById("theme-toggle");
if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    themeToggle.textContent = next === "dark" ? "☀️" : "🌙";
  });
}

// Navbar Scroll Effect
const navbar = document.getElementById("navbar");
window.addEventListener(
  "scroll",
  () => {
    if (navbar) navbar.classList.toggle("scrolled", window.scrollY > 50);
  },
  { passive: true },
);

// ─────────────────────────────────────────
// ENHANCED MODAL POPUP SYSTEM
// ─────────────────────────────────────────

function showPopup(title, message, type = "success") {
  let html = `
    <div style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:9999;">
        <div style="background:var(--bg-secondary); border:1px solid var(--border-glass); border-radius:12px; padding:2rem; max-width:400px; box-shadow:0 20px 60px rgba(0,0,0,0.3); animation:slideIn 0.3s ease;">
            <div style="display:flex; align-items:center; gap:1rem; margin-bottom:1rem;">
                <span style="font-size:2rem;">${
                  type === "success"
                    ? "✅"
                    : type === "error"
                      ? "❌"
                      : type === "warning"
                        ? "⚠️"
                        : "ℹ️"
                }</span>
                <h3 style="margin:0; font-size:1.2rem; color:var(--text-primary);">${title}</h3>
            </div>
            <p style="margin:1rem 0 2rem; color:var(--text-dim); line-height:1.6;">${message}</p>
            <button onclick="this.closest('[style*=z-index]').remove()" style="width:100%; padding:0.75rem; background:var(--primary); color:#fff; border:none; border-radius:8px; cursor:pointer; font-weight:600; font-size:0.9rem;">OK</button>
        </div>
    </div>
    <style>
        @keyframes slideIn {
            from { transform: translateY(-20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
    </style>
    `;
  document.body.insertAdjacentHTML("beforeend", html);
}

// Toasts (quick notifications)
function showToast(msg, type = "success") {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = (type === "success" ? "✅ " : "❌ ") + msg;
  toast.classList.remove("hidden");
  toast.style.display = "block";
  setTimeout(() => {
    toast.classList.add("hidden");
    toast.style.display = "none";
  }, 3500);
}

// ─────────────────────────────────────────
// 2. Rendering Logic (XAI Dashboard)
// ─────────────────────────────────────────

function renderScore(scoreObj, max) {
  const valEl = document.getElementById("score-val");
  const maxEl = document.getElementById("score-max-val");
  const circle = document.getElementById("score-circle");
  const verdict = document.getElementById("score-verdict");

  if (!valEl || !circle) return;

  const final = scoreObj.final;
  const pct = (final / max) * 100;

  valEl.textContent = final.toFixed(1);
  maxEl.textContent = `/ ${max}`;
  circle.style.setProperty("--pct", `${pct}%`);

  let msg = "";
  if (pct >= 85) msg = "Excellent understanding of core concepts.";
  else if (pct >= 65) msg = "Good alignment with reference material.";
  else if (pct >= 40) msg = "Partially captured the main ideas.";
  else msg = "Significant gaps in conceptual coverage.";
  verdict.textContent = msg;
}

function renderExplanation(explanation) {
  const body = document.getElementById("explanation-body");
  if (!body) return;
  body.innerHTML = "";

  explanation.sections.forEach((s) => {
    const div = document.createElement("div");
    div.className = "ex-row";
    div.innerHTML = `<span style="font-size: 1.2rem;">${s.icon}</span> <div class="ex-text">${s.text}</div>`;
    body.appendChild(div);
  });

  if (explanation.tips.length > 0) {
    const tipsDiv = document.createElement("div");
    tipsDiv.style.marginTop = "1rem";
    tipsDiv.style.padding = "1rem";
    tipsDiv.style.background = "rgba(108, 99, 255, 0.05)";
    tipsDiv.style.borderRadius = "8px";
    tipsDiv.innerHTML =
      `<strong style="display:block; margin-bottom:0.5rem; color:var(--primary);">💡 Recommendations:</strong>` +
      `<ul style="font-size:0.85rem; padding-left:1.5rem;">${explanation.tips.map((t) => `<li>${t}</li>`).join("")}</ul>`;
    body.appendChild(tipsDiv);
  }
}

function renderShap(shap, max) {
  const body = document.getElementById("shap-body");
  if (!body) return;

  const labels = {
    feat_avg_semantic: "General Meaning",
    feat_max_semantic: "Peak Concept Match",
    feat_anchors_covered: "Core Topics",
    feat_avg_jaccard: "Vocabulary",
    feat_avg_edit: "Phrasing",
  };

  body.innerHTML = Object.entries(shap)
    .map(([key, val]) => {
      const isPos = val >= 0;
      const width = Math.min(100, (Math.abs(val) / (max * 0.5)) * 100);
      return `
            <div style="margin-bottom: 1rem;">
                <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:0.3rem;">
                    <span>${labels[key] || key}</span>
                    <span style="color:${isPos ? "var(--accent1)" : "var(--danger)"}">${val >= 0 ? "+" : ""}${val.toFixed(2)}</span>
                </div>
                <div class="ex-bar-wrap">
                    <div class="ex-bar ${isPos ? "ex-bar-pos" : "ex-bar-neg"}" style="width:${width}%;"></div>
                </div>
            </div>
        `;
    })
    .join("");
}

/**
 * NEW: Advanced Semantic Drift Timeline (100x10 Matrix)
 */
function renderDriftMatrix(matrix) {
  const container = document.getElementById("drift-matrix");
  if (!container || !matrix) return;

  container.innerHTML = "";
  // X is Teacher (100 parts), Y is Student (10 parts)
  // The matrix from scorer is stuChunks[j][refChunks[i]] -> 10 rows (Y) of 100 cols (X)

  for (let j = 0; j < matrix.length; j++) {
    for (let i = 0; i < matrix[j].length; i++) {
      const cell = document.createElement("div");
      cell.className = "matrix-cell";
      const sim = matrix[j][i];
      cell.style.setProperty("--sim", sim);
      // Tooltip or title for inspection
      cell.title = `T-Chunk ${i + 1}, S-Chunk ${j + 1}: Sim ${sim.toFixed(2)}`;
      container.appendChild(cell);
    }
  }
}

function renderSentenceAttributions(sentences) {
  const body = document.getElementById("sentence-attribution-body");
  if (!body) return;

  body.innerHTML = sentences
    .map((s) => {
      const isPos = s.attribution >= 0;
      return `
            <div style="padding: 0.75rem; border-bottom: 1px solid var(--border-glass); font-size: 0.85rem; display: flex; align-items: flex-start; gap: 10px;">
                <span style="flex:1;">"${s.text}"</span>
                <span class="badge" style="margin:0; background:${isPos ? "rgba(74, 222, 128, 0.1)" : "rgba(248, 113, 113, 0.1)"}; color:${isPos ? "var(--accent1)" : "var(--danger)"}; border-color:${isPos ? "var(--accent1)" : "var(--danger)"}; min-width:60px; text-align:center;">
                    ${s.attribution >= 0 ? "+" : ""}${s.attribution.toFixed(2)}
                </span>
            </div>
        `;
    })
    .join("");
}

function renderConceptClusters(clusters) {
  const canvas = document.getElementById("cluster-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  // Dynamic placement
  const nodes = clusters.map((c, i) => ({
    ...c,
    x: 50 + Math.random() * (w - 100),
    y: 50 + Math.random() * (h - 100),
    r: 15 + c.similarity * 30,
  }));

  // Draw lines
  ctx.strokeStyle = "rgba(108, 99, 255, 0.1)";
  ctx.lineWidth = 1;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dist = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      if (dist < 150) {
        ctx.beginPath();
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(nodes[j].x, nodes[j].y);
        ctx.stroke();
      }
    }
  }

  // Draw nodes
  nodes.forEach((n) => {
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    ctx.fillStyle = n.covered
      ? "rgba(74, 222, 128, 0.2)"
      : "rgba(248, 113, 113, 0.1)";
    ctx.fill();
    ctx.strokeStyle = n.covered ? "#4ade80" : "rgba(248, 113, 113, 0.5)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#fff";
    ctx.font = "600 10px Inter";
    ctx.textAlign = "center";
    ctx.fillText(
      n.label.substring(0, 15) + (n.label.length > 15 ? ".." : ""),
      n.x,
      n.y + 3,
    );
  });

  const legend = document.getElementById("cluster-legend");
  if (legend) {
    legend.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px;"><span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:#4ade80;"></span> Covered Component</div>
            <div style="display:flex; align-items:center; gap:8px;"><span style="display:inline-block; width:12px; height:12px; border-radius:50%; border:2px solid rgba(248, 113, 113, 0.5);"></span> Missed Component</div>
        `;
  }
}

// ─────────────────────────────────────────
// 3. User Interactions
// ─────────────────────────────────────────

// Single Ans Form
const demoForm = document.getElementById("demo-form");
if (demoForm) {
  demoForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const ref = document.getElementById("ref-answer").value.trim();
    const stu = document.getElementById("stu-answer").value.trim();
    const max = parseFloat(document.getElementById("max-score").value) || 10;

    if (!ref || !stu) {
      showPopup(
        "Input Missing",
        "Please provide both reference answer and student answer.",
        "error",
      );
      return;
    }

    try {
      const res = gradeAnswer(ref, stu, max);

      // Show result panels
      document.getElementById("results-placeholder").classList.add("hidden");
      document.getElementById("results-content").classList.remove("hidden");
      document.getElementById("xai-content").classList.remove("hidden");

      // Render stats
      renderScore(res.scoreObj, max);
      renderExplanation(res.explanation);
      renderShap(res.shap, max);
      renderDriftMatrix(res.matrix);
      renderSentenceAttributions(res.sentences);
      renderConceptClusters(res.clusters);

      const driftPct = Math.round((1 - res.drift.drift_score) * 100);
      showPopup(
        "Grading Complete",
        `Score: ${res.scoreObj.final.toFixed(2)}/${max} | Topic Alignment: ${driftPct}%`,
        "success",
      );
    } catch (err) {
      showPopup(
        "Grading Error",
        err.message || "An error occurred during grading.",
        "error",
      );
      console.error(err);
    }
  });
}

// Sample Buttons
const btnS1 = document.getElementById("try-sample");
if (btnS1) {
  btnS1.addEventListener("click", () => {
    document.getElementById("ref-answer").value = SAMPLES.case1.ref;
    document.getElementById("stu-answer").value = SAMPLES.case1.stu;
    document.getElementById("max-score").value = SAMPLES.case1.max;
    showToast("Sample 1 loaded - 1:1 similarity case");
    demoForm.dispatchEvent(new Event("submit"));
  });
}

const btnS2 = document.getElementById("try-sample-2");
if (btnS2) {
  btnS2.addEventListener("click", () => {
    document.getElementById("ref-answer").value = SAMPLES.case2.ref;
    document.getElementById("stu-answer").value = SAMPLES.case2.stu;
    document.getElementById("max-score").value = SAMPLES.case2.max;
    showToast("Sample 2 loaded - Summary vs Script case");
    demoForm.dispatchEvent(new Event("submit"));
  });
}

// ─────────────────────────────────────────
// 4. Batch Scoring (CSV/XLSX)
// ─────────────────────────────────────────

// File Upload Zones
const uploadZone = document.getElementById("upload-zone");
const batchInput = document.getElementById("batch-file-input");

if (uploadZone && batchInput) {
  uploadZone.addEventListener("click", () => batchInput.click());
  batchInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) handleCsvUpload(file);
  });
}

/**
 * Detect column name by matching variations
 * Handles: email, Email, email_address, Email Address, emailAddress, etc.
 */
function detectColumn(headers, patterns) {
  for (const pattern of patterns) {
    const found = headers.find(
      (h) =>
        h.toLowerCase().replace(/[\s_-]/g, "") ===
        pattern.toLowerCase().replace(/[\s_-]/g, ""),
    );
    if (found) return found;
  }
  return null;
}

function handleCsvUpload(file) {
  if (!checkLibrary("Papa")) {
    showPopup("Library Missing", "Papa Parse library not loaded.", "error");
    return;
  }

  const fileName = file.name;
  showToast(`Processing ${fileName}...`);

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
      const data = results.data;
      const headers = results.meta.fields;

      // Auto-detect columns with flexible matching
      const colRef =
        detectColumn(headers, [
          "reference",
          "ref",
          "desired",
          "model",
          "answer",
          "teacher",
          "expected",
        ]) || headers[1];
      const colStu =
        detectColumn(headers, [
          "student",
          "stu",
          "response",
          "answer",
          "summary",
          "submission",
        ]) || headers[2];
      const colName =
        detectColumn(headers, [
          "name",
          "student",
          "studentname",
          "studentname",
          "fullname",
        ]) || "Name";
      const colEmail =
        detectColumn(headers, ["email", "emailaddress", "e-mail"]) || "Email";
      const colRoll =
        detectColumn(headers, [
          "roll",
          "rollnumber",
          "studentid",
          "id",
          "reg",
        ]) || "Roll";

      if (!colRef || !colStu) {
        showPopup(
          "Column Detection Failed",
          `Could not find reference and student answer columns. Found: ${headers.join(", ")}`,
          "error",
        );
        return;
      }

      // Create progress container
      const progressHtml = `
      <div id="batch-progress-container" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:9998;">
          <div style="background:var(--bg-secondary); border-radius:12px; padding:2rem; width:90%; max-width:500px; box-shadow:0 20px 60px rgba(0,0,0,0.3);">
              <h3 style="margin:0 0 1rem 0; color:var(--text-primary);">⏳ Processing Batch...</h3>
              <div style="background:rgba(255,255,255,0.05); border-radius:8px; padding:0.5rem; height:24px; margin-bottom:1rem; overflow:hidden;">
                  <div id="batch-progress-bar" style="background:linear-gradient(90deg, var(--accent1), var(--accent2)); height:100%; width:0%; border-radius:6px; transition:width 0.3s ease;"></div>
              </div>
              <p id="batch-progress-text" style="margin:0; color:var(--text-dim); text-align:center; font-size:0.9rem;">0 / ${data.length} students processed</p>
          </div>
      </div>
      `;
      document.body.insertAdjacentHTML("beforeend", progressHtml);

      // Process with progress updates
      const scored = [];
      data.forEach((row, idx) => {
        try {
          const ref = row[colRef] || "";
          const stu = row[colStu] || "";

          if (ref && stu) {
            const res = gradeAnswer(ref, stu, 10);
            const driftPct = Math.round((1 - res.drift.drift_score) * 100);

            scored.push({
              Name: row[colName] || "Unknown",
              Email: row[colEmail] || "N/A",
              Roll: row[colRoll] || "N/A",
              Score: res.scoreObj.final.toFixed(2),
              "Topic Alignment": driftPct + "%",
              "Concept Coverage":
                Math.round(res.drift.concept_coverage * 100) + "%",
            });
          }
        } catch (e) {
          console.error(`Error processing row ${idx}:`, e);
        }

        // Update progress
        const progress = Math.round(((idx + 1) / data.length) * 100);
        const progressBar = document.getElementById("batch-progress-bar");
        const progressText = document.getElementById("batch-progress-text");
        if (progressBar) progressBar.style.width = progress + "%";
        if (progressText)
          progressText.textContent = `${idx + 1} / ${data.length} students processed`;
      });

      // Remove progress overlay
      const progressContainer = document.getElementById(
        "batch-progress-container",
      );
      if (progressContainer) progressContainer.remove();

      if (scored.length === 0) {
        showPopup(
          "No Results",
          "No valid data rows could be processed.",
          "warning",
        );
        return;
      }

      renderBatchResults(scored, fileName);
      showPopup(
        "Batch Processing Complete",
        `Successfully graded ${scored.length} students from ${fileName}`,
        "success",
      );
    },
    error: (error) => {
      showPopup(
        "File Parse Error",
        error.message || "Failed to parse CSV file.",
        "error",
      );
    },
  });
}

function renderBatchResults(data, fileName = "results") {
  const wrap = document.getElementById("batch-table-wrap");
  const resultsSec = document.getElementById("batch-results");
  if (!wrap) return;

  resultsSec.classList.remove("hidden");

  // Add filename header
  let html = `<div style="margin-bottom:1.5rem; padding-bottom:1rem; border-bottom:1px solid var(--border-glass);">
    <p style="margin:0 0 0.5rem 0; color:var(--text-dim); font-size:0.85rem;">📁 File: <strong>${fileName}</strong></p>
    <p style="margin:0; color:var(--text-muted); font-size:0.8rem;">Total Records: <strong>${data.length}</strong></p>
  </div>`;

  html += `<div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:0.85rem;"><thead><tr style="background:rgba(255,255,255,0.05);">`;
  Object.keys(data[0]).forEach(
    (k) =>
      (html += `<th style="padding:1rem; text-align:left; border-bottom:2px solid var(--border-glass); font-weight:600;">${k}</th>`),
  );
  html += `</tr></thead><tbody>`;

  data.forEach((row, idx) => {
    html += `<tr style="border-bottom:1px solid var(--border-glass); ${
      idx % 2 === 0 ? "background:rgba(255,255,255,0.02);" : ""
    }">`;
    Object.values(row).forEach(
      (v) => (html += `<td style="padding:1rem;">${v}</td>`),
    );
    html += `</tr>`;
  });
  html += `</tbody></table></div>`;

  wrap.innerHTML = html;
  showToast(`✅ Results loaded: ${data.length} records from ${fileName}`);
}

// Script Eval (Docx + Xlsx)
const scriptBtn = document.getElementById("run-script-eval-btn");
const docxInput = document.getElementById("script-file-input");
const xlsxInput = document.getElementById("summary-file-input");
const docxZone = document.getElementById("script-upload-zone");
const xlsxZone = document.getElementById("summary-upload-zone");
const docxFileLabel = document.getElementById("script-upload-filename");
const xlsxFileLabel = document.getElementById("summary-upload-filename");
const uploadPlaceholderText = "No file selected yet";
const scriptBtnDefaultText = scriptBtn
  ? scriptBtn.textContent.trim()
  : "Run Class Evaluation";

let teacherTranscript = "";
let studentData = [];
let docxFileName = "";
let xlsxFileName = "";

function hasMeaningfulValue(value) {
  return value !== undefined && value !== null && `${value}`.trim() !== "";
}

function updateUploadState(zoneEl, labelEl, fileName) {
  if (labelEl) {
    labelEl.textContent = fileName || uploadPlaceholderText;
  }
  if (zoneEl) {
    zoneEl.classList.toggle("has-file", Boolean(fileName));
  }
}

function safeValue(row, key, fallback = "") {
  if (!row || !key) return fallback;
  if (hasMeaningfulValue(row[key])) {
    return row[key];
  }
  const normalizedKey = key.toString().trim().toLowerCase();
  const matchedKey = Object.keys(row).find(
    (k) => k.toString().trim().toLowerCase() === normalizedKey,
  );
  if (matchedKey && hasMeaningfulValue(row[matchedKey])) {
    return row[matchedKey];
  }
  return fallback;
}

function setScriptEvalRunning(isRunning) {
  if (!scriptBtn) return;
  if (isRunning) {
    scriptBtn.dataset.defaultText =
      scriptBtn.dataset.defaultText || scriptBtnDefaultText;
    scriptBtn.textContent = "Running Evaluation...";
    scriptBtn.disabled = true;
    scriptBtn.classList.remove("pulse");
    scriptBtn.classList.add("loading");
  } else {
    const baseText = scriptBtn.dataset.defaultText || scriptBtnDefaultText;
    scriptBtn.textContent = baseText;
    scriptBtn.classList.remove("loading");
    checkEvalReady();
  }
}

if (docxInput && docxZone) {
  docxZone.addEventListener("click", () => docxInput.click());
  docxInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) {
      teacherTranscript = "";
      docxFileName = "";
      updateUploadState(docxZone, docxFileLabel, "");
      checkEvalReady();
      return;
    }

    if (checkLibrary("mammoth")) {
      docxFileName = file.name;
      updateUploadState(docxZone, docxFileLabel, docxFileName);
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      teacherTranscript = result.value;
      showPopup(
        "Script Loaded",
        `✅ Teacher transcript loaded from ${docxFileName}`,
        "success",
      );
      checkEvalReady();
    } else {
      teacherTranscript = "";
      docxFileName = "";
      updateUploadState(docxZone, docxFileLabel, "");
      showPopup(
        "Library Missing",
        "Mammoth library not loaded for DOCX processing.",
        "error",
      );
    }
  });
}

if (xlsxInput && xlsxZone) {
  xlsxZone.addEventListener("click", () => xlsxInput.click());
  xlsxInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) {
      studentData = [];
      xlsxFileName = "";
      updateUploadState(xlsxZone, xlsxFileLabel, "");
      checkEvalReady();
      return;
    }

    if (checkLibrary("XLSX")) {
      xlsxFileName = file.name;
      updateUploadState(xlsxZone, xlsxFileLabel, xlsxFileName);
      const reader = new FileReader();
      reader.onload = (evt) => {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        studentData = XLSX.utils.sheet_to_json(ws);
        showPopup(
          "Student Data Loaded",
          `✅ Loaded ${studentData.length} students from ${xlsxFileName}`,
          "success",
        );
        checkEvalReady();
      };
      reader.readAsBinaryString(file);
    } else {
      studentData = [];
      xlsxFileName = "";
      updateUploadState(xlsxZone, xlsxFileLabel, "");
      showPopup(
        "Library Missing",
        "XLSX library not loaded for Excel processing.",
        "error",
      );
    }
  });
}

function checkEvalReady() {
  if (!scriptBtn) return;
  if (teacherTranscript && studentData.length > 0) {
    scriptBtn.disabled = false;
    scriptBtn.classList.add("pulse");
  } else {
    scriptBtn.disabled = true;
    scriptBtn.classList.remove("pulse");
  }
}

if (scriptBtn) {
  scriptBtn.addEventListener("click", () => {
    if (!teacherTranscript || studentData.length === 0) {
      showPopup(
        "Missing Data",
        "Please upload both teacher script and student data.",
        "error",
      );
      return;
    }
    setScriptEvalRunning(true);

    try {
      // Create progress overlay
      const progressHtml = `
      <div id="eval-progress-container" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:9998;">
          <div style="background:var(--bg-secondary); border-radius:12px; padding:2rem; width:90%; max-width:500px; box-shadow:0 20px 60px rgba(0,0,0,0.3);">
              <h3 style="margin:0 0 1rem 0; color:var(--text-primary);">⏳ Evaluating Class...</h3>
              <div style="background:rgba(255,255,255,0.05); border-radius:8px; padding:0.5rem; height:24px; margin-bottom:1rem; overflow:hidden;">
                  <div id="eval-progress-bar" style="background:linear-gradient(90deg, var(--accent1), var(--accent2)); height:100%; width:0%; border-radius:6px; transition:width 0.3s ease;"></div>
              </div>
              <p id="eval-progress-text" style="margin:0; color:var(--text-dim); text-align:center; font-size:0.9rem;">0 / ${studentData.length} evaluated</p>
          </div>
      </div>
      `;
      document.body.insertAdjacentHTML("beforeend", progressHtml);

      const results = [];
      studentData.forEach((s, idx) => {
        try {
          const rowKeys = Object.keys(s);
          const summaryCol =
            rowKeys.find((k) =>
              /summary|answer|response|essay/i.test(k),
            ) || rowKeys[rowKeys.length - 1];

          const nameCol =
            rowKeys.find((k) => /name|student|fullname/i.test(k)) || "name";
          const emailCol =
            rowKeys.find((k) => /email|emailaddress|e-mail/i.test(k)) ||
            "email";
          const rollCol =
            rowKeys.find((k) => /roll|rollnumber|studentid|id/i.test(k)) ||
            "roll";

          const studentSummary = safeValue(s, summaryCol, "");
          const res = gradeAnswer(teacherTranscript, studentSummary, 10);

          const driftScoreRaw =
            typeof res?.drift?.drift_score === "number"
              ? res.drift.drift_score
              : 0;
          const driftScore = Math.min(Math.max(driftScoreRaw, 0), 1);
          const coverageRaw =
            typeof res?.drift?.concept_coverage === "number"
              ? res.drift.concept_coverage
              : 0;
          const coveragePct = Math.round(
            Math.min(Math.max(coverageRaw, 0), 1) * 100,
          );
          const alignmentPct = Math.round((1 - driftScore) * 100);
          const finalScore =
            typeof res?.scoreObj?.final === "number"
              ? res.scoreObj.final
              : 0;

          results.push({
            Name: safeValue(s, nameCol, "Unknown"),
            Email: safeValue(s, emailCol, "N/A"),
            Roll: safeValue(s, rollCol, "N/A"),
            Score: finalScore.toFixed(2),
            "Actual Drift": driftScore.toFixed(2),
            "Topic Alignment": `${alignmentPct}%`,
            "Concept Coverage": `${coveragePct}%`,
          });
        } catch (e) {
          console.error(`Error evaluating student ${idx}:`, e);
          results.push({
            Name: safeValue(s, "name", "Unknown"),
            Email: safeValue(s, "email", "N/A"),
            Roll: safeValue(s, "roll", "N/A"),
            Score: "ERROR",
            "Actual Drift": "N/A",
            "Topic Alignment": "N/A",
            "Concept Coverage": "N/A",
          });
        }

        // Update progress
        const progress = Math.round(((idx + 1) / studentData.length) * 100);
        const progressBar = document.getElementById("eval-progress-bar");
        const progressText = document.getElementById("eval-progress-text");
        if (progressBar) progressBar.style.width = progress + "%";
        if (progressText)
          progressText.textContent = `${idx + 1} / ${studentData.length} evaluated`;
      });

      if (results.length === 0) {
        showPopup(
          "Processing Error",
          "No students could be evaluated.",
          "error",
        );
        return;
      }

      renderBatchResults(results, xlsxFileName);
      showPopup(
        "Class Evaluation Complete",
        `Successfully evaluated ${results.length} students from ${xlsxFileName}`,
        "success",
      );
    } catch (error) {
      console.error("Class evaluation failed:", error);
      showPopup(
        "Class Evaluation Failed",
        error.message || "Unable to evaluate class right now.",
        "error",
      );
    } finally {
      const progressContainer = document.getElementById(
        "eval-progress-container",
      );
      if (progressContainer) progressContainer.remove();
      setScriptEvalRunning(false);
    }
  });
}
