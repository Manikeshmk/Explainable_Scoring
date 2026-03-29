/**
 * app.js — UI Controller for Explainable Summary Score
 * Wires the DOM to scorer.js, handles dark/light toggle,
 * renders the explanation & SHAP chart, manages batch CSV scoring.
 */

"use strict";

// ─────────────────────────────────────────
// Library availability checks
// ─────────────────────────────────────────

const libs = {
  Papa: typeof Papa !== "undefined",
  mammoth: typeof mammoth !== "undefined",
  XLSX: typeof XLSX !== "undefined",
};

function checkLibrary(name) {
  if (!libs[name]) {
    console.warn(`⚠️ Library ${name} not loaded. Some features may not work.`);
    return false;
  }
  return true;
}

// ─────────────────────────────────────────
// Theme
// ─────────────────────────────────────────

const html = document.documentElement;
const themeToggle = document.getElementById("theme-toggle");
const THEME_KEY = "ess-theme";

function applyTheme(t) {
  html.setAttribute("data-theme", t);
  themeToggle.textContent = t === "dark" ? "☀️" : "🌙";
  localStorage.setItem(THEME_KEY, t);
}

themeToggle.addEventListener("click", () => {
  applyTheme(html.getAttribute("data-theme") === "dark" ? "light" : "dark");
});

const savedTheme =
  localStorage.getItem(THEME_KEY) ||
  (window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark");
applyTheme(savedTheme);

// ─────────────────────────────────────────
// Navbar scroll class
// ─────────────────────────────────────────

const navbar = document.getElementById("navbar");
window.addEventListener(
  "scroll",
  () => {
    navbar.classList.toggle("scrolled", window.scrollY > 10);
  },
  { passive: true },
);

// ─────────────────────────────────────────
// Scroll-reveal
// ─────────────────────────────────────────

const appearEls = document.querySelectorAll(".appear");
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) e.target.classList.add("in-view");
    });
  },
  { threshold: 0.1 },
);
appearEls.forEach((el) => observer.observe(el));

// ─────────────────────────────────────────
// Toast
// ─────────────────────────────────────────

function showToast(msg, type = "success") {
  const toast = document.getElementById("toast");
  toast.textContent = (type === "success" ? "✅ " : "❌ ") + msg;
  toast.className = `toast toast--${type} show`;
  setTimeout(() => toast.classList.remove("show"), 3500);
}

// ─────────────────────────────────────────
// Smooth scroll nav links
// ─────────────────────────────────────────

document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    const t = document.querySelector(a.getAttribute("href"));
    if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

// ─────────────────────────────────────────
// Score colour helpers
// ─────────────────────────────────────────

function scoreColor(score, maxScore) {
  const p = score / maxScore;
  if (p >= 0.7) return "#4ade80";
  if (p >= 0.4) return "#fbbf24";
  return "#f87171";
}

function scoreColorClass(score, maxScore) {
  const p = score / maxScore;
  if (p >= 0.7) return "score-chip--high";
  if (p >= 0.4) return "score-chip--mid";
  return "score-chip--low";
}

// ─────────────────────────────────────────
// RENDER — Semantic Drift Analysis
// ─────────────────────────────────────────

function renderDriftAnalysis(drift) {
  const el = document.getElementById("drift-analysis");
  if (!el) return; // Element may not exist yet

  if (!drift) {
    el.style.display = "none";
    return;
  }

  el.style.display = "block";

  const driftPct = Math.round((1 - drift.drift_score) * 100);
  const coverage = Math.round(drift.concept_coverage * 100);
  const consistency = Math.round(drift.topic_consistency * 100);

  const driftColor =
    drift.drift_score > 0.5
      ? "#f87171"
      : drift.drift_score > 0.3
        ? "#fbbf24"
        : "#4ade80";
  const driftIcon =
    drift.drift_score > 0.5 ? "⚠️" : drift.drift_score > 0.3 ? "📍" : "✅";

  el.innerHTML = `
        <div class="drift-container">
            <div class="drift-header">
                <h3>${driftIcon} Semantic Drift Analysis</h3>
            </div>
            
            <div class="drift-metrics">
                <div class="drift-metric">
                    <div class="drift-metric__label">Topic Alignment</div>
                    <div class="drift-metric__bar">
                        <div class="drift-metric__fill" style="width: ${consistency}%; background: ${driftColor};"></div>
                    </div>
                    <div class="drift-metric__value">${consistency}%</div>
                    <div class="drift-metric__desc">Vocabulary overlap with reference</div>
                </div>
                
                <div class="drift-metric">
                    <div class="drift-metric__label">Concept Coverage</div>
                    <div class="drift-metric__bar">
                        <div class="drift-metric__fill" style="width: ${coverage}%; background: #38bdf8;"></div>
                    </div>
                    <div class="drift-metric__value">${coverage}%</div>
                    <div class="drift-metric__desc">Key concepts from reference you addressed</div>
                </div>
                
                <div class="drift-metric">
                    <div class="drift-metric__label">Drift Score</div>
                    <div class="drift-metric__bar">
                        <div class="drift-metric__fill" style="width: ${Math.min(100, drift.drift_score * 100)}%; background: ${driftColor};"></div>
                    </div>
                    <div class="drift-metric__value">${(drift.drift_score * 100).toFixed(0)}%</div>
                    <div class="drift-metric__desc" style="color: ${driftColor};">
                        ${drift.drift_score > 0.5 ? "High drift - answer goes off-topic" : drift.drift_score > 0.3 ? "Moderate drift - some concepts missing" : "Good alignment - on topic"}
                    </div>
                </div>
            </div>
            
            ${
              drift.missing_concepts_count > 0
                ? `
            <div class="drift-missing">
                <div class="drift-box__title">❌ Missing Concepts (${drift.missing_concepts_count})</div>
                <div class="drift-concepts">
                    ${drift.missing_concepts.map((c) => `<span class="concept-tag concept-tag--missing">${c}</span>`).join("")}
                </div>
            </div>
            `
                : ""
            }
            
            ${
              drift.over_explained_count > 0
                ? `
            <div class="drift-over">
                <div class="drift-box__title">ℹ️ Over-Explained Concepts (${drift.over_explained_count})</div>
                <div class="drift-concepts">
                    ${drift.over_explained_concepts.map((c) => `<span class="concept-tag concept-tag--extra">${c}</span>`).join("")}
                </div>
            </div>
            `
                : ""
            }
        </div>
    `;
}

function renderTimelineVisualization(timeline) {
  const el = document.getElementById("timeline-analysis");
  if (
    !el ||
    !timeline ||
    !timeline.timeline ||
    timeline.timeline.length === 0
  ) {
    if (el) el.style.display = "none";
    return;
  }

  el.style.display = "block";

  const data = timeline.timeline;
  const avgDrift = timeline.averageDrift || 0;
  const avgSimilarity = 1 - avgDrift;
  const driftPct = Math.round(avgDrift * 100);
  const similarityPct = Math.round(avgSimilarity * 100);

  // Create SVG timeline chart
  const width = 400;
  const height = 140;
  const padding = { top: 16, right: 16, bottom: 24, left: 35 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  // Scale functions
  const xScale = (pos) => (pos / 100) * plotWidth;
  const yScale = (sim) => plotHeight - sim * plotHeight;

  // Build SVG path for similarity curve
  const pathPoints = data.map(
    (d, i) =>
      `${padding.left + xScale(d.position)},${padding.top + yScale(d.similarity)}`,
  );
  const pathStr = pathPoints.length > 0 ? `M ${pathPoints.join(" L")}` : "";

  const driftColor =
    avgDrift > 0.5 ? "#f87171" : avgDrift > 0.3 ? "#fbbf24" : "#4ade80";

  el.innerHTML = `
    <div class="timeline-container">
      <div class="timeline-header">
        <h3>📈 Semantic Drift Analysis Over Time</h3>
      </div>
      
      <div class="timeline-chart">
        <svg class="timeline-svg" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
          <!-- Grid lines (horizontal) -->
          <line x1="${padding.left}" y1="${padding.top}" x2="${width - padding.right}" y2="${padding.top}" 
                stroke="var(--border-soft)" stroke-width="1" opacity="0.5"/>
          <line x1="${padding.left}" y1="${padding.top + plotHeight * 0.5}" x2="${width - padding.right}" y2="${padding.top + plotHeight * 0.5}" 
                stroke="var(--border-soft)" stroke-width="1" opacity="0.3"/>
          <line x1="${padding.left}" y1="${padding.top + plotHeight}" x2="${width - padding.right}" y2="${padding.top + plotHeight}" 
                stroke="var(--border)" stroke-width="1"/>
          
          <!-- Axes -->
          <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" 
                stroke="var(--border)" stroke-width="2"/>
          <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" 
                stroke="var(--border)" stroke-width="2"/>
          
          <!-- Y-axis labels -->
          <text x="${padding.left - 10}" y="${padding.top + plotHeight + 5}" text-anchor="end" font-size="9" fill="var(--text-dim)">1.0</text>
          <text x="${padding.left - 10}" y="${padding.top + plotHeight * 0.5 + 5}" text-anchor="end" font-size="9" fill="var(--text-dim)">0.5</text>
          <text x="${padding.left - 10}" y="${padding.top + 10}" text-anchor="end" font-size="9" fill="var(--text-dim)">0.0</text>
          
          <!-- X-axis labels -->
          <text x="${padding.left + plotWidth * 0.25}" y="${height - padding.bottom + 18}" text-anchor="middle" font-size="9" fill="var(--text-dim)">25%</text>
          <text x="${padding.left + plotWidth * 0.5}" y="${height - padding.bottom + 18}" text-anchor="middle" font-size="9" fill="var(--text-dim)">50%</text>
          <text x="${padding.left + plotWidth * 0.75}" y="${height - padding.bottom + 18}" text-anchor="middle" font-size="9" fill="var(--text-dim)">75%</text>
          
          <!-- Similarity curve -->
          <path d="${pathStr}" fill="none" stroke="#4ade80" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          
          <!-- Data points -->
          ${data
            .map(
              (d) => `
            <circle cx="${padding.left + xScale(d.position)}" cy="${padding.top + yScale(d.similarity)}" r="4" fill="#4ade80" opacity="0.8"/>
          `,
            )
            .join("")}
        </svg>
      </div>

      <div class="timeline-legend">
        <div class="timeline-legend-item">
          <div class="timeline-legend-color timeline-legend-color--similarity"></div>
          <span>Similarity Score (Higher = Better Match)</span>
        </div>
        <div class="timeline-legend-item">
          <span style="color: var(--text-muted); font-size: 0.8rem;">X-axis: Teacher Script Progress (0% → 100%)</span>
        </div>
      </div>

      <div class="timeline-stats">
        <div class="timeline-stat">
          <span class="timeline-stat__label">Anchor Points</span>
          <span class="timeline-stat__value">${timeline.anchorCount}</span>
        </div>
        <div class="timeline-stat">
          <span class="timeline-stat__label">Avg Similarity</span>
          <span class="timeline-stat__value" style="color: #4ade80;">${similarityPct}%</span>
        </div>
        <div class="timeline-stat">
          <span class="timeline-stat__label">Avg Drift</span>
          <span class="timeline-stat__value" style="color: ${driftColor};">${driftPct}%</span>
        </div>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────
// RENDER — Score Display (two-stage)
// ─────────────────────────────────────────

function renderScoreDisplay(scoreObj, maxScore) {
  const { stage1, stage2, final } = scoreObj;
  const el = document.getElementById("score-display");
  const color = scoreColor(final, maxScore);
  const pct = final / maxScore;

  el.querySelector("#score-value").textContent = final.toFixed(2);
  el.querySelector("#score-value").style.color = color;
  el.querySelector("#score-max").textContent = `/ ${maxScore.toFixed(1)}`;

  const fill = el.querySelector("#score-bar-fill");
  fill.style.background = `linear-gradient(90deg, ${color}, ${color}99)`;
  fill.style.transform = "scaleX(0)";
  fill.classList.remove("animate");
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      fill.style.transform = `scaleX(${pct})`;
      fill.classList.add("animate");
    }),
  );

  // ── Stage breakdown panel ──
  const breakdown = document.getElementById("stage-breakdown");

  breakdown.innerHTML = `
      <div class="stage-grid">
        <div class="stage-item">
          <div class="stage-item__icon">⚖️</div>
          <div class="stage-item__label">Rule-Based</div>
          <div class="stage-item__score" style="color:#fbbf24">+${stage1.toFixed(2)}</div>
          <div class="stage-item__sub">Direct word match floor</div>
        </div>
        <div class="stage-vs">+</div>
        <div class="stage-item">
          <div class="stage-item__icon">📄</div>
          <div class="stage-item__label">Paper NLP Grade</div>
          <div class="stage-item__score" style="color:#38bdf8">+${stage2.toFixed(2)}</div>
          <div class="stage-item__sub">Jaccard·0.15 + Edit·0.05 + Cosine·0.15 + NormWC·0.15 + Semantic·0.50</div>
        </div>
      </div>
      <div class="stage-final-note">
        Final score = <strong>min(${maxScore.toFixed(0)}, ${stage1.toFixed(2)} + ${stage2.toFixed(2)}) = ${final.toFixed(2)}</strong>
        — scores are added and capped at the maximum possible mark.
      </div>
    `;
}

// ─────────────────────────────────────────
// RENDER — Plain English Explanation
// ─────────────────────────────────────────

function renderExplanation(explanation) {
  const body = document.getElementById("explanation-body");
  body.innerHTML = "";

  explanation.sections.forEach((s) => {
    const div = document.createElement("div");
    div.className =
      "explanation-section" + (s.sub ? " explanation-section--sub" : "");
    div.innerHTML = `
            <span class="explanation-section__icon">${s.icon}</span>
            <span class="explanation-section__text">${s.text}</span>
        `;
    body.appendChild(div);
  });

  if (explanation.tips.length > 0) {
    const box = document.createElement("div");
    box.className = "tips-box";
    box.innerHTML = `
            <div class="tips-box__title">💡 How to Improve</div>
            <ul>${explanation.tips.map((t) => `<li>${t}</li>`).join("")}</ul>
        `;
    body.appendChild(box);
  }
}

// ─────────────────────────────────────────
// RENDER — SHAP Chart
// ─────────────────────────────────────────

function renderShap(shap, maxScore) {
  const body = document.getElementById("shap-body");
  const maxAbs = Math.max(0.001, ...Object.values(shap).map(Math.abs));
  const halfW = 50;

  const labels = {
    feat_avg_semantic: "Avg. Semantic Match",
    feat_max_semantic: "Peak Semantic Match",
    feat_anchors_covered: "Key Concepts Covered",
    feat_avg_jaccard: "Vocabulary Overlap",
    feat_avg_edit: "Phrasing Similarity",
  };

  const tooltips = {
    feat_avg_semantic:
      "How closely the overall meaning of your answer matched the reference",
    feat_max_semantic: "Your best-matching sentence or phrase vs the reference",
    feat_anchors_covered:
      "Fraction of key concepts from the ideal answer you addressed",
    feat_avg_jaccard: "How many of the same words you used vs the reference",
    feat_avg_edit: "How similar your sentence structure is to the reference",
  };

  body.innerHTML = Object.entries(shap)
    .map(([key, val]) => {
      const pct = (val / maxAbs) * halfW;
      const isPos = val >= 0;
      const barCls = isPos ? "shap-row__fill--pos" : "shap-row__fill--neg";
      const left = isPos ? 50 : 50 + pct;
      const width = Math.abs(pct);
      const valLabel = (val >= 0 ? "+" : "") + val.toFixed(3);
      const color = isPos ? "#4ade80" : "#f87171";

      return `
          <div class="shap-row" data-tooltip="${tooltips[key] || ""}">
            <span class="shap-row__label">${labels[key] || key}</span>
            <div class="shap-row__bar-wrap">
              <div class="shap-row__mid"></div>
              <div class="shap-row__fill ${barCls}" style="left:${left}%;width:${width}%"></div>
            </div>
            <span class="shap-row__value" style="color:${color}">${valLabel}</span>
          </div>
        `;
    })
    .join("");
}

// ─────────────────────────────────────────
// RENDER — Concept Clusters (Canvas Map)
// ─────────────────────────────────────────

function renderConceptClusters(clusters) {
  const canvas = document.getElementById("cluster-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;

  // Clear canvas
  ctx.clearRect(0, 0, width, height);

  if (!clusters || !clusters.length) {
    ctx.fillStyle = "#575a75";
    ctx.font = "14px Inter";
    ctx.textAlign = "center";
    ctx.fillText("No concepts extracted", width / 2, height / 2);
    return;
  }

  // A simple physics-free layout: distribute circles pseudo-randomly but evenly
  const nodes = [];
  const padding = 10;

  // Sort by importance (radius) descending so bigger ones get placed first easily
  const sorted = [...clusters].sort((a, b) => b.radius - a.radius);

  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i];
    let placed = false;
    let tries = 0;
    let x, y;

    while (!placed && tries < 200) {
      x =
        c.radius + padding + Math.random() * (width - 2 * (c.radius + padding));
      y =
        c.radius +
        padding +
        Math.random() * (height - 2 * (c.radius + padding));

      // Check collision
      let collision = false;
      for (const n of nodes) {
        const dist = Math.hypot(n.x - x, n.y - y);
        if (dist < c.radius + n.radius + 15) {
          // 15px minimum gap
          collision = true;
          break;
        }
      }

      if (!collision) {
        nodes.push({ ...c, x, y });
        placed = true;
      }
      tries++;
    }

    // If it failed to place without collision (too crowded), just place it somewhere overlapping
    if (!placed) {
      nodes.push({ ...c, x: width / 2, y: height / 2 });
    }
  }

  // Draw lines between nodes to look like a connected concept map
  ctx.beginPath();
  ctx.strokeStyle = "rgba(108, 99, 255, 0.15)";
  ctx.lineWidth = 1;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y) < 150) {
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(nodes[j].x, nodes[j].y);
      }
    }
  }
  ctx.stroke();

  // Draw nodes
  for (const n of nodes) {
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.radius, 0, 2 * Math.PI);

    // Color based on coverage
    if (n.covered) {
      ctx.fillStyle = "rgba(74, 222, 128, 0.15)";
      ctx.strokeStyle = "#4ade80";
    } else {
      ctx.fillStyle = "rgba(248, 113, 113, 0.1)";
      ctx.strokeStyle = "rgba(248, 113, 113, 0.6)";
    }

    ctx.fill();
    ctx.lineWidth = 2;
    ctx.stroke();

    // Label
    ctx.fillStyle =
      document.documentElement.getAttribute("data-theme") === "dark"
        ? "#e8eaf6"
        : "#1a1a3e";
    ctx.font = "600 11px Inter";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Wrapped text
    const words = n.label.split(" ");
    if (words.length <= 2) {
      ctx.fillText(n.label, n.x, n.y);
    } else {
      ctx.fillText(words.slice(0, 2).join(" "), n.x, n.y - 6);
      ctx.fillText(words.slice(2).join(" "), n.x, n.y + 8);
    }
  }

  // Legend
  document.getElementById("cluster-legend").innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:rgba(74, 222, 128, 0.15);border:2px solid #4ade80;"></span> Covered Component</div>
        <div style="display:flex;align-items:center;gap:6px;"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:rgba(248, 113, 113, 0.1);border:2px solid rgba(248, 113, 113, 0.6);"></span> Missed Component</div>
    `;
}

// ─────────────────────────────────────────
// RENDER — ExASAG Sentence Attribution
// ─────────────────────────────────────────

function renderSentenceAttributions(sentences) {
  const body = document.getElementById("sentence-attribution-body");
  if (!sentences || !sentences.length) {
    body.innerHTML = "<em>No sentences analyzed.</em>";
    return;
  }

  // Find max magnitude to scale the bars
  const maxAbs = Math.max(
    0.001,
    ...sentences.map((s) => Math.abs(s.attribution)),
  );

  body.innerHTML =
    '<div class="exasag-sentences">' +
    sentences
      .map((s) => {
        const isPos = s.attribution >= 0;
        const widthPct = Math.min(
          100,
          (Math.abs(s.attribution) / maxAbs) * 100,
        );
        const colorClass = isPos ? "exasag-bar--pos" : "exasag-bar--neg";
        const sign = isPos ? "+" : "";
        const attrStr = sign + s.attribution.toFixed(2);

        return `
            <div class="exasag-row">
                <div class="exasag-text">"${s.text}"</div>
                <div class="exasag-metrics">
                    <span class="exasag-score" style="color: ${isPos ? "var(--success)" : "var(--danger)"}; width: 45px; display: inline-block; text-align: right;">${attrStr}</span>
                    <div class="exasag-bar-track">
                        <div class="exasag-bar ${colorClass}" style="width: ${widthPct}%"></div>
                    </div>
                </div>
            </div>
        `;
      })
      .join("") +
    "</div>";
}

// ─────────────────────────────────────────
// DEMO FORM — Single answer grading
// ─────────────────────────────────────────

const demoForm = document.getElementById("demo-form");
const resultPanel = document.getElementById("result-panel");
const spinner = document.getElementById("spinner");

demoForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const ref = document.getElementById("ref-answer").value.trim();
  const stu = document.getElementById("stu-answer").value.trim();
  const maxSc = parseFloat(document.getElementById("max-score").value) || 5;

  if (!ref || !stu) {
    showToast("Please fill in both answer fields.", "error");
    return;
  }

  spinner.classList.add("active");
  resultPanel.classList.remove("visible");

  setTimeout(() => {
    try {
      const result = gradeAnswer(ref, stu, maxSc);
      const {
        scoreObj,
        features,
        drift,
        timeline,
        shap,
        explanation,
        sentences,
        clusters,
      } = result;

      renderScoreDisplay(scoreObj, maxSc);
      renderDriftAnalysis(drift);
      renderTimelineVisualization(timeline);
      renderExplanation(explanation);
      renderShap(shap, maxSc);
      renderConceptClusters(clusters);
      renderSentenceAttributions(sentences);

      spinner.classList.remove("active");
      resultPanel.classList.add("visible");
      resultPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (err) {
      spinner.classList.remove("active");
      showToast("Scoring error: " + err.message, "error");
      console.error(err);
    }
  }, 80);
});

// ─────────────────────────────────────────
// BATCH CSV SCORING
// ─────────────────────────────────────────

const uploadZone = document.getElementById("upload-zone");
const batchInput = document.getElementById("batch-file-input");
const batchResults = document.getElementById("batch-results");
const batchTableWrap = document.getElementById("batch-table-wrap");
const batchProgress = document.getElementById("batch-progress");

uploadZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadZone.classList.add("dragover");
});
uploadZone.addEventListener("dragleave", () =>
  uploadZone.classList.remove("dragover"),
);
uploadZone.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadZone.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file) processCsvFile(file);
});

uploadZone.addEventListener("click", () => batchInput.click());
batchInput.addEventListener("change", () => {
  if (batchInput.files[0]) processCsvFile(batchInput.files[0]);
});

function processCsvFile(file) {
  if (!file.name.endsWith(".csv")) {
    showToast("Please upload a CSV file.", "error");
    return;
  }

  if (!checkLibrary("Papa")) {
    showToast(
      "CSV parsing library not loaded. Please refresh the page.",
      "error",
    );
    return;
  }

  batchProgress.textContent = `⏳ Parsing ${file.name}…`;
  batchProgress.classList.remove("hidden");
  batchResults.classList.add("hidden");

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
      const rows = results.data;
      const headers = results.meta.fields || [];

      const colRef =
        headers.find((h) => /ref|desired|model|ideal|answer.*ref/i.test(h)) ||
        headers[1];
      const colStu =
        headers.find(
          (h) => /student|stu|response|answer.*stu/i.test(h) && h !== colRef,
        ) || headers[2];
      const colQ = headers.find((h) => /question|q$/i.test(h)) || headers[0];
      const maxScoreDefault = 5;

      if (!colRef || !colStu) {
        showToast(
          "Could not find reference/student answer columns. See format hint.",
          "error",
        );
        batchProgress.classList.add("hidden");
        return;
      }

      let scored = [];
      let processed = 0;

      function scoreChunk(start) {
        const end = Math.min(start + 10, rows.length);
        for (let i = start; i < end; i++) {
          const row = rows[i];
          const ref = (row[colRef] || "").trim();
          const stu = (row[colStu] || "").trim();
          if (!ref || !stu) continue;

          const res = gradeAnswer(ref, stu, maxScoreDefault);
          scored.push({
            question: (row[colQ] || "").slice(0, 100),
            student: stu.slice(0, 120),
            score: res.scoreObj.final,
            stage1: res.scoreObj.stage1,
            stage2: res.scoreObj.stage2,
            maxScore: maxScoreDefault,
            coverage: res.features.feat_anchors_covered,
            semantic: res.features.feat_avg_semantic,
          });
          processed++;
        }

        batchProgress.textContent = `⏳ Scoring… ${processed} / ${rows.length}`;

        if (end < rows.length) setTimeout(() => scoreChunk(end), 10);
        else renderBatchTable(scored);
      }

      scoreChunk(0);
    },
    error: (err) => {
      showToast("CSV parse error: " + err.message, "error");
      batchProgress.classList.add("hidden");
    },
  });
}

let batchData = [];
let sortCol = "score";
let sortAsc = false;

function renderBatchTable(data) {
  batchData = data;
  batchProgress.classList.add("hidden");
  batchResults.classList.remove("hidden");
  renderTable(sortCol, sortAsc);
  showToast(`Scored ${data.length} answers successfully!`);
}

function renderTable(col, asc) {
  const sorted = [...batchData].sort((a, b) => {
    const va = a[col],
      vb = b[col];
    if (typeof va === "number") return asc ? va - vb : vb - va;
    return asc
      ? String(va).localeCompare(String(vb))
      : String(vb).localeCompare(String(va));
  });

  const cols = [
    { key: "question", label: "Question" },
    { key: "student", label: "Student Answer" },
    { key: "score", label: "Final Score ↕" },
    { key: "stage1", label: "Rule-Based" },
    { key: "stage2", label: "Paper NLP Grade" },
    { key: "coverage", label: "Concepts %" },
  ];

  batchTableWrap.innerHTML = `
      <div class="batch-table-wrap">
        <table class="batch-table" id="batch-tbl">
          <thead><tr>
            ${cols
              .map(
                (c) => `
              <th class="${c.key === col ? "sorted" : ""}" data-col="${c.key}">
                ${c.label}
                <span class="sort-icon">${c.key === col ? (asc ? "↑" : "↓") : "↕"}</span>
              </th>
            `,
              )
              .join("")}
          </tr></thead>
          <tbody>
            ${sorted
              .map((row) => {
                const chipClass = scoreColorClass(row.score, row.maxScore);
                const barPct = Math.round((row.score / row.maxScore) * 100);
                const covPct = Math.round(row.coverage * 100);
                return `
                  <tr>
                    <td style="max-width:180px;font-size:.82rem">${row.question || "—"}</td>
                    <td style="max-width:220px">${row.student}</td>
                    <td>
                      <span class="score-chip ${chipClass}">${row.score.toFixed(2)} / ${row.maxScore}</span>
                      <span class="mini-bar"><span class="mini-bar__fill" style="width:${barPct}%"></span></span>
                    </td>
                    <td style="color:#fbbf24;font-family:monospace">${row.stage1.toFixed(2)}</td>
                    <td style="color:#38bdf8;font-family:monospace">${row.stage2.toFixed(2)}</td>
                    <td>${covPct}%</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
      <div style="margin-top:12px;display:flex;gap:10px;justify-content:flex-end;">
        <button class="btn btn--ghost btn--sm" id="export-csv-btn">⬇ Export Results</button>
      </div>
    `;

  batchTableWrap.querySelectorAll("th[data-col]").forEach((th) => {
    th.addEventListener("click", () => {
      const newCol = th.dataset.col;
      if (newCol === sortCol) sortAsc = !sortAsc;
      else {
        sortCol = newCol;
        sortAsc = false;
      }
      renderTable(sortCol, sortAsc);
    });
  });

  document
    .getElementById("export-csv-btn")
    ?.addEventListener("click", exportCsv);
}

function exportCsv() {
  const headers = [
    "question",
    "student_answer",
    "final_score",
    "stage1_rule_based",
    "stage2_paper_nlp_grade",
    "max_score",
    "concepts_covered_%",
  ];
  const rows = batchData.map((r) =>
    [
      `"${(r.question || "").replace(/"/g, '""')}"`,
      `"${r.student.replace(/"/g, '""')}"`,
      r.score.toFixed(3),
      r.stage1.toFixed(3),
      r.stage2.toFixed(3),
      r.maxScore,
      Math.round(r.coverage * 100),
    ].join(","),
  );

  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "asag_results.csv";
  a.click();
  URL.revokeObjectURL(url);
  showToast("Results exported!");
}

// ─────────────────────────────────────────
// Sample Q&A prefill
// ─────────────────────────────────────────

document.getElementById("try-sample")?.addEventListener("click", () => {
  document.getElementById("ref-answer").value =
    "Photosynthesis is the process by which green plants use sunlight, water, and carbon dioxide to produce glucose and oxygen. Chlorophyll in the chloroplasts absorbs light energy which drives the conversion of CO2 and water into sugar and releases oxygen as a byproduct.";
  document.getElementById("stu-answer").value =
    "Plants make food using sunlight. They take in CO2 and water and produce oxygen. This happens in the leaves where chlorophyll is present.";
  document.getElementById("max-score").value = "5";
  document.getElementById("ref-answer").scrollIntoView({ behavior: "smooth" });
});

// ─────────────────────────────────────────
// CLASS EVALUATION (Script + Summaries)
// ─────────────────────────────────────────

let uploadedScriptText = null;
let uploadedSummaries = null;

const scriptInput = document.getElementById("script-file-input");
const summaryInput = document.getElementById("summary-file-input");
const scriptFileName = document.getElementById("script-file-name");
const summaryFileName = document.getElementById("summary-file-name");
const runEvalBtn = document.getElementById("run-script-eval-btn");
const evalProgress = document.getElementById("script-eval-progress");
const evalResults = document.getElementById("script-eval-results");
const refinedScriptContent = document.getElementById("refined-script-content");
const scriptTableWrap = document.getElementById("script-table-wrap");

function checkEvalReady() {
  if (uploadedScriptText && uploadedSummaries) {
    runEvalBtn.removeAttribute("disabled");
  } else {
    runEvalBtn.setAttribute("disabled", "true");
  }
}

// 1. Handle DOCX upload
scriptInput?.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  scriptFileName.textContent = `File: ${file.name}`;

  if (!file.name.endsWith(".docx")) {
    showToast("Please upload a .docx file for the script", "error");
    return;
  }

  if (!checkLibrary("mammoth")) {
    showToast(
      "DOCX reader library not loaded. Please refresh the page.",
      "error",
    );
    return;
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    uploadedScriptText = result.value;
    showToast("Script loaded successfully");
    checkEvalReady();
  } catch (err) {
    showToast("Error reading .docx: " + err.message, "error");
    console.error(err);
  }
});

// 2. Handle XLSX upload
summaryInput?.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  summaryFileName.textContent = `File: ${file.name}`;

  if (!file.name.endsWith(".xlsx")) {
    showToast("Please upload an .xlsx file for summaries", "error");
    return;
  }

  if (!checkLibrary("XLSX")) {
    showToast(
      "Excel reader library not loaded. Please refresh the page.",
      "error",
    );
    return;
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // Parse as JSON array
    const data = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
    uploadedSummaries = data;
    showToast(`Loaded ${data.length} student summaries`);
    checkEvalReady();
  } catch (err) {
    showToast("Error reading .xlsx: " + err.message, "error");
    console.error(err);
  }
});

// Refine the raw Teacher Script (remove names, timestamps, filler) and generate a summary
function refineTeacherScript(rawText) {
  const lines = rawText.split("\n");
  const refined = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;

    // Google Meet formats (heuristics):
    // Skip timestamps like "18:10", "[00:15]"
    if (/^\[?\d{1,2}:\d{2}(:\d{2})?\]?$/.test(line)) continue;

    // Skip speaker names (often just followed by timestamp on next line)
    if (
      i + 1 < lines.length &&
      /^\[?\d{1,2}:\d{2}(:\d{2})?\]?$/.test(lines[i + 1].trim())
    ) {
      continue;
    }

    // Remove inline speakers and timestamps
    line = line.replace(/^\[?\d{1,2}:\d{2}(:\d{2})?\]?\s*/, "");
    // Only strip if it matches typical speaker format "Name: "
    if (line.match(/^[A-Z][a-zA-Z\s]+:/)) {
      line = line.replace(/^.*?:(.*)/, "$1").trim();
    }

    // Skip system messages
    if (
      line.match(
        /joined the meeting|left the meeting|Attendees|Agentic AI Class/i,
      )
    )
      continue;

    // Skip short filler
    if (
      line.split(/\s+/).length < 4 &&
      /^(yes|no|okay|ok|right|yeah|yep|sure|mhmm)\.?$/i.test(line)
    ) {
      continue;
    }

    if (line) {
      refined.push(line);
    }
  }

  let cleanText = refined.join(" ");

  // Extractive Summarization: If the transcript is long, extract the most important sentences
  // This addresses the requirement to "make summary of script" handling lengthy transcripts.
  const sentences = cleanText
    .replace(/([.?!])\s*(?=[A-Z0-9])/g, "$1|")
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s.length > 5);

  if (sentences.length > 8) {
    // Extract top keywords/anchors from the entire text to evaluate sentence importance
    // extractAnchors is available globally from scorer.js
    const anchors = extractAnchors(cleanText, 25);

    const scoredSentences = sentences.map((sentence, idx) => {
      const lowerSent = sentence.toLowerCase();
      let score = 0;

      // +1 for each anchor keyphrase present
      anchors.forEach((a) => {
        if (lowerSent.includes(a)) score += 1;
      });

      // Penalize conversational pronouns & filler words (addressing "remove pronouns etc.")
      const fillerRegex =
        /\b(i|you|he|she|it|we|they|me|him|her|us|them|um|uh|ah|like|basically|so|well|anyway)\b/gi;
      const fillerCount = (sentence.match(fillerRegex) || []).length;
      score -= fillerCount * 0.5;

      // Slight boost for longer, more descriptive sentences (up to a point)
      const wordCount = sentence.split(" ").length;
      if (wordCount > 8 && wordCount < 30) score += 0.5;

      return { index: idx, text: sentence, score: score };
    });

    // Sort by score (descending) and pick the top 35% of sentences, minimum of 5
    scoredSentences.sort((a, b) => b.score - a.score);
    const topCount = Math.max(5, Math.ceil(sentences.length * 0.35));
    const topSentences = scoredSentences.slice(0, topCount);

    // Restore original chronological order of the selected sentences
    topSentences.sort((a, b) => a.index - b.index);
    cleanText = topSentences.map((s) => s.text).join(" ");
  }

  return cleanText;
}

// Convert explanation JSON to a clean plain text string
function formatExplanationText(explanation) {
  if (!explanation || !explanation.sections) return "No explanation available.";

  const parts = explanation.sections
    .filter((s) => !s.sub) // Skip substrings/sub-sections for brevity in table
    .map((s) => {
      // strip HTML tags like <strong>
      const plainText = s.text.replace(/<[^>]*>?/gm, "");
      return s.icon + " " + plainText;
    });

  return parts.join("\n\n");
}

// 3. Run Evaluation Pipeline
runEvalBtn?.addEventListener("click", () => {
  if (!uploadedScriptText || !uploadedSummaries) return;

  evalProgress.classList.remove("hidden");
  evalResults.classList.add("hidden");
  evalProgress.textContent = "⏳ Refining teacher script...";

  setTimeout(() => {
    // Step A: Refine Script
    const referenceAnswer = refineTeacherScript(uploadedScriptText);
    refinedScriptContent.textContent = referenceAnswer;

    if (!referenceAnswer || referenceAnswer.length < 20) {
      evalProgress.classList.add("hidden");
      showToast(
        "Error: Refined script is too short or empty. Check transcript format.",
        "error",
      );
      return;
    }

    // Output table data
    let evaluatedData = [];
    let processed = 0;

    // Identify columns (flexible names)
    const keys = Object.keys(uploadedSummaries[0] || {});
    const colEmail = keys.find((k) => /email|mail/i.test(k));
    const colName = keys.find((k) => /name/i.test(k));
    const colSummary = keys.find((k) => /summary|answer|response/i.test(k));

    if (!colEmail || !colSummary) {
      evalProgress.classList.add("hidden");
      showToast(
        "Error: XLSX must contain 'emailAddress' (or 'email') and 'summary' columns.",
        "error",
      );
      return;
    }

    // Default max score is 5 for the class
    const maxScoreDefault = 5;

    // Step B: Grade chunks
    function scoreChunk(start) {
      const end = Math.min(start + 5, uploadedSummaries.length);
      for (let i = start; i < end; i++) {
        const row = uploadedSummaries[i];
        const stuSummary = (row[colSummary] || "").toString().trim();
        const email = row[colEmail] || "Unknown";
        const name = colName ? row[colName] : "N/A";

        if (!stuSummary) {
          evaluatedData.push({
            email,
            name,
            score: 0,
            rawScore: 0,
            explanation: "No summary provided.",
          });
          processed++;
          continue;
        }

        // Call existing scorer logic
        const res = gradeAnswer(referenceAnswer, stuSummary, maxScoreDefault);
        if (!res || !res.scoreObj) {
          evaluatedData.push({
            email,
            name,
            rawScore: 0,
            score: "0.00 / 5",
            explanation: "Scoring error - could not process answer.",
          });
          processed++;
          continue;
        }
        const explanationText = formatExplanationText(res.explanation || {});

        evaluatedData.push({
          email,
          name,
          rawScore: res.scoreObj.final || 0,
          score: (res.scoreObj.final || 0).toFixed(2) + " / 5",
          explanation: explanationText,
        });

        processed++;
      }

      evalProgress.textContent = `⏳ Grading... ${processed} / ${uploadedSummaries.length}`;

      if (end < uploadedSummaries.length) {
        setTimeout(() => scoreChunk(end), 10);
      } else {
        renderScriptTable(evaluatedData);
      }
    }

    scoreChunk(0);
  }, 50); // small delay to allow UI to update
});

function renderScriptTable(data) {
  evalProgress.classList.add("hidden");
  evalResults.classList.remove("hidden");

  // Sort by score descending
  const sorted = [...data].sort((a, b) => b.rawScore - a.rawScore);

  // Calculate summary statistics
  const totalStudents = data.length;
  const presentCount = data.filter((d) => d.rawScore > 0).length;
  const absentCount = totalStudents - presentCount;
  const avgScore = data.reduce((sum, d) => sum + d.rawScore, 0) / totalStudents;
  const maxScore = Math.max(...data.map((d) => d.rawScore));
  const minScore = Math.min(...data.map((d) => d.rawScore));
  const highCount = data.filter((d) => d.rawScore >= 4).length; // 80%+
  const passCount = data.filter((d) => d.rawScore >= 2.5).length; // 50%+

  // Summary section HTML
  const summaryHTML = `
    <div class="card" style="margin-bottom: 20px; border: 2px solid var(--primary);">
      <h3 style="margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
        📊 Evaluation Summary
      </h3>
      
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; margin-bottom: 20px;">
        <div style="text-align: center; padding: 12px; background: var(--bg2); border-radius: 8px;">
          <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-dim); text-transform: uppercase; margin-bottom: 8px;">Total Students</div>
          <div style="font-size: 2rem; font-weight: 800; color: var(--primary);">${totalStudents}</div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">${presentCount} present, ${absentCount} absent</div>
        </div>
        
        <div style="text-align: center; padding: 12px; background: var(--bg2); border-radius: 8px;">
          <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-dim); text-transform: uppercase; margin-bottom: 8px;">Average Score</div>
          <div style="font-size: 2rem; font-weight: 800; color: #4ade80;">${avgScore.toFixed(2)} / 5</div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">${((avgScore / 5) * 100).toFixed(0)}% average</div>
        </div>
        
        <div style="text-align: center; padding: 12px; background: var(--bg2); border-radius: 8px;">
          <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-dim); text-transform: uppercase; margin-bottom: 8px;">Performance</div>
          <div style="font-size: 2rem; font-weight: 800;">⭐</div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">${highCount} excellent, ${passCount} pass</div>
        </div>
        
        <div style="text-align: center; padding: 12px; background: var(--bg2); border-radius: 8px;">
          <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-dim); text-transform: uppercase; margin-bottom: 8px;">Score Range</div>
          <div style="font-size: 2rem; font-weight: 800; color: var(--accent2);">${minScore.toFixed(2)}–${maxScore.toFixed(2)}</div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">Lowest to highest</div>
        </div>
      </div>

      <div style="display: flex; gap: 8px; justify-content: flex-start; flex-wrap: wrap;">
        <button class="btn btn--primary btn--sm" id="toggle-detailed-results">📋 View Detailed Results</button>
        <button class="btn btn--ghost btn--sm" id="export-eval-csv">⬇ Export Results</button>
      </div>
    </div>
  `;

  // Detailed results section HTML (hidden by default)
  const cols = ["Student Email", "Name", "Score", "Explanation of Grade"];
  const detailedHTML = `
    <div id="detailed-results-section" style="display: none;">
      <div class="card" style="margin-bottom: 20px;">
        <h3 style="margin-bottom: 16px; display: flex; align-items: center; gap: 8px; justify-content: space-between;">
          <span>👥 Individual Grades</span>
          <button class="btn btn--ghost btn--sm" id="hide-detailed-results">Hide Details</button>
        </h3>
        <div class="batch-table-wrap">
          <table class="batch-table" id="script-eval-tbl">
            <thead>
              <tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr>
            </thead>
            <tbody>
              ${sorted
                .map((row) => {
                  const chipClass = scoreColorClass(row.rawScore, 5);
                  return `
                    <tr>
                      <td><strong>${row.email}</strong></td>
                      <td>${row.name}</td>
                      <td><span class="score-chip ${chipClass}">${row.score}</span></td>
                      <td style="white-space: pre-line; font-size: 0.85rem; max-width: 400px; line-height: 1.4;">${row.explanation}</td>
                    </tr>
                  `;
                })
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  scriptTableWrap.innerHTML = summaryHTML + detailedHTML;

  // Setup toggle button handlers
  document
    .getElementById("toggle-detailed-results")
    ?.addEventListener("click", () => {
      document.getElementById("detailed-results-section").style.display =
        "block";
      document.getElementById("toggle-detailed-results").style.display = "none";
    });

  document
    .getElementById("hide-detailed-results")
    ?.addEventListener("click", () => {
      document.getElementById("detailed-results-section").style.display =
        "none";
      document.getElementById("toggle-detailed-results").style.display =
        "inline-flex";
    });

  // Export functionality
  document.getElementById("export-eval-csv")?.addEventListener("click", () => {
    const headers = ["Student Email", "Name", "Score", "Explanation of Grade"];
    const rows = sorted.map((r) =>
      [
        `"${r.email}"`,
        `"${r.name}"`,
        r.rawScore.toFixed(3),
        `"${r.explanation.replace(/"/g, '""')}"`,
      ].join(","),
    );

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "class_evaluation_results.csv";
    a.click();
    URL.revokeObjectURL(url);
    showToast("Results exported!");
  });

  showToast(
    `Successfully graded ${data.length} students. Average: ${avgScore.toFixed(2)}/5`,
  );
}
