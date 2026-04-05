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

function reRenderCanvasCharts() {
  if (!window.lastEvalResult) return;
  const { res, max } = window.lastEvalResult;
  // Re-render purely canvas charts that depend on isLight logic
  renderMetricRadar(res.features);
  renderDriftTimeline(res.timeline);
  renderConceptClusters(res.clusters);

  const temporalMetrics = TemporalDriftTracker.computeTemporalMetrics();
  if (temporalMetrics) {
    if (typeof renderTemporalDriftAnalysis === "function") {
      renderTemporalDriftAnalysis(temporalMetrics);
    }
  }
}

// Theme Toggle
const themeToggle = document.getElementById("theme-toggle");
if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    themeToggle.textContent = next === "dark" ? "☀️" : "🌙";
    if (typeof reRenderCanvasCharts === "function") reRenderCanvasCharts();
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

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function deriveSemanticDriftPercent(finalScore, maxScore) {
  const safeMax = Math.max(Number(maxScore) || 0, 1);
  const normalized = clamp01((Number(finalScore) || 0) / safeMax);
  return Math.round((1 - normalized) * 100);
}

function getCssColor(varName, fallback) {
  const styles = getComputedStyle(document.documentElement);
  const value = styles.getPropertyValue(varName);
  return value && value.trim().length ? value.trim() : fallback;
}

function prepareCanvas(canvas, fallbackWidth = 320, fallbackHeight = 220) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = rect.width || fallbackWidth;
  const height = rect.height || fallbackHeight;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, width, height };
}

function escapeHtml(str = "") {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
      const width = Math.min(100, (Math.abs(val) / Math.max(1, max)) * 100);
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

function renderWaterfall(scoreObj, shap) {
  const canvas = document.getElementById("waterfall-canvas");
  const legend = document.getElementById("waterfall-legend");
  if (!canvas || !scoreObj || !shap) return;

  const { ctx, width, height } = prepareCanvas(canvas, 900, 340);
  const labels = {
    feat_avg_semantic: "General Meaning",
    feat_max_semantic: "Peak Concept Match",
    feat_anchors_covered: "Core Topics",
    feat_avg_jaccard: "Vocabulary",
    feat_avg_edit: "Phrasing",
  };

  const items = Object.entries(shap)
    .map(([key, value]) => ({
      key,
      label: labels[key] || key,
      value: Number(value) || 0,
    }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  const total = items.reduce((sum, item) => sum + item.value, 0);
  const margin = { top: 32, right: 28, bottom: 78, left: 28 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const barGap = 14;
  const barWidth = (chartWidth - barGap * (items.length - 1)) / items.length;
  const maxAbs = Math.max(
    ...items.map((item) => Math.abs(item.value)),
    Math.abs(total),
    1,
  );
  const zeroY = margin.top + chartHeight * 0.72;
  const scale = (chartHeight * 0.55) / maxAbs;
  const baseline = Math.max(0, scoreObj.final - total);
  let running = baseline;

  const positiveColor = getCssColor("--accent1", "#5be49b");
  const negativeColor = getCssColor("--danger", "#ff7070");
  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  const axisColor = isLight ? "rgba(15, 23, 42, 0.14)" : "rgba(255,255,255,0.14)";
  const textColor = getCssColor("--text", "#f4f5fb");
  const mutedColor = getCssColor("--text-muted", "#6d7385");

  ctx.clearRect(0, 0, width, height);
  ctx.font = "12px var(--font-sans)";
  ctx.textAlign = "center";

  // axis
  ctx.strokeStyle = axisColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(margin.left, zeroY);
  ctx.lineTo(width - margin.right, zeroY);
  ctx.stroke();

  ctx.fillStyle = mutedColor;
  ctx.fillText("Contribution path", width / 2, 18);
  ctx.fillText(
    `Final score: ${scoreObj.final.toFixed(2)}`,
    width - margin.right - 70,
    margin.top - 8,
  );

  items.forEach((item, index) => {
    const x = margin.left + index * (barWidth + barGap);
    const startY = zeroY - running * scale;
    const endValue = running + item.value;
    const endY = zeroY - endValue * scale;
    const top = Math.min(startY, endY);
    const heightPx = Math.max(4, Math.abs(endY - startY));
    const color = item.value >= 0 ? positiveColor : negativeColor;

    ctx.fillStyle = color;
    ctx.fillRect(x, top, barWidth, heightPx);

    // connector line
    ctx.strokeStyle = axisColor;
    ctx.beginPath();
    ctx.moveTo(x + barWidth / 2, endY);
    ctx.lineTo(x + barWidth + barGap / 2, endY);
    ctx.stroke();

    ctx.fillStyle = textColor;
    ctx.font = "600 11px var(--font-sans)";
    ctx.fillText(item.label, x + barWidth / 2, height - 42);

    ctx.fillStyle = mutedColor;
    ctx.font = "11px var(--font-sans)";
    ctx.fillText(
      `${item.value >= 0 ? "+" : ""}${item.value.toFixed(2)}`,
      x + barWidth / 2,
      top - 8,
    );

    running = endValue;
  });

  // final marker
  ctx.fillStyle = textColor;
  ctx.font = "700 13px var(--font-sans)";
  ctx.fillText(`Start ${baseline.toFixed(2)}`, margin.left + 30, zeroY + 26);
  ctx.fillText(
    `End ${scoreObj.final.toFixed(2)}`,
    width - margin.right - 30,
    zeroY + 26,
  );

  if (legend) {
    legend.innerHTML = `
      <div class="waterfall-legend-item"><span class="waterfall-swatch waterfall-swatch-pos"></span>Positive contribution</div>
      <div class="waterfall-legend-item"><span class="waterfall-swatch waterfall-swatch-neg"></span>Negative contribution</div>
      <div class="waterfall-legend-item"><span class="waterfall-swatch waterfall-swatch-base"></span>Baseline-to-final path</div>
    `;
  }
}

function renderMetricComparison(features) {
  const container = document.getElementById("metric-comparison");
  if (!container || !features) return;

  const metrics = {
    feat_avg_semantic: { label: "General Meaning" },
    feat_max_semantic: { label: "Peak Concept Match" },
    feat_anchors_covered: { label: "Core Topics" },
    feat_avg_jaccard: { label: "Vocabulary" },
    feat_avg_edit: { label: "Phrasing" },
  };

  const rows = Object.entries(metrics)
    .map(([key, cfg]) => {
      const studentVal = clamp01(features[key] ?? 0);
      const studentPct = Math.min(100, Math.max(4, studentVal * 100));
      return `
        <div class="dual-bar-row">
          <div class="dual-bar-header">
            <div>
              <div class="dual-bar-label">${cfg.label}</div>
              <div class="dual-bar-caption">Student coverage for this metric</div>
            </div>
            <span class="dual-bar-chip dual-bar-chip--student">${(studentVal * 100).toFixed(0)}%</span>
          </div>
          <div class="dual-bar-track" aria-label="Student ${cfg.label}">
            <div class="dual-bar dual-bar--student" style="width:${studentPct}%;"></div>
          </div>
          <div class="dual-bar-footer">
            <span>${(studentVal * 100).toFixed(1)}% coverage</span>
          </div>
        </div>
      `;
    })
    .join("");

  container.innerHTML = rows;
}

function renderMetricRadar(features) {
  const canvas = document.getElementById("metric-radar");
  if (!canvas || !features) return;

  const metrics = [
    { key: "feat_avg_semantic", label: "Meaning" },
    { key: "feat_max_semantic", label: "Peak" },
    { key: "feat_anchors_covered", label: "Concepts" },
    { key: "feat_avg_jaccard", label: "Vocab" },
    { key: "feat_avg_edit", label: "Phrasing" },
  ];

  const { ctx, width, height } = prepareCanvas(canvas, 360, 300);
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 32;
  const steps = 5;
  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  const outline = isLight ? "rgba(15, 23, 42, 0.3)" : "rgba(255, 255, 255, 0.15)";
  const accentStroke = getCssColor("--accent2", "#67b8ff");
  const accentFill = "rgba(103, 184, 255, 0.18)";

  ctx.lineWidth = 1;
  ctx.strokeStyle = outline;

  for (let step = 1; step <= steps; step++) {
    const r = (radius / steps) * step;
    ctx.beginPath();
    for (let i = 0; i < metrics.length; i++) {
      const angle = (Math.PI * 2 * i) / metrics.length - Math.PI / 2;
      const x = centerX + r * Math.cos(angle);
      const y = centerY + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  metrics.forEach((metric, idx) => {
    const angle = (Math.PI * 2 * idx) / metrics.length - Math.PI / 2;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(x, y);
    ctx.stroke();

    const labelX = centerX + (radius + 10) * Math.cos(angle);
    const labelY = centerY + (radius + 10) * Math.sin(angle);
    ctx.fillStyle = isLight ? "rgba(15, 23, 42, 0.85)" : "rgba(255, 255, 255, 0.85)";
    ctx.font = "12px var(--font-sans)";
    ctx.textAlign = labelX >= centerX ? "left" : "right";
    ctx.textBaseline = labelY >= centerY ? "top" : "bottom";
    ctx.fillText(metric.label, labelX, labelY);
  });

  ctx.beginPath();
  metrics.forEach((metric, idx) => {
    const value = clamp01(features[metric.key] ?? 0);
    const angle = (Math.PI * 2 * idx) / metrics.length - Math.PI / 2;
    const r = radius * value;
    const x = centerX + r * Math.cos(angle);
    const y = centerY + r * Math.sin(angle);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = accentFill;
  ctx.strokeStyle = accentStroke;
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = accentStroke;
  metrics.forEach((metric, idx) => {
    const value = clamp01(features[metric.key] ?? 0);
    const angle = (Math.PI * 2 * idx) / metrics.length - Math.PI / 2;
    const r = radius * value;
    const x = centerX + r * Math.cos(angle);
    const y = centerY + r * Math.sin(angle);
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });
}

/**
 * NEW: Advanced Semantic Drift Timeline (100x10 Matrix)
 */
function renderDriftMatrix(matrixData) {
  const container = document.getElementById("drift-matrix");
  if (!container) return;

  const showEmpty = () => {
    container.innerHTML = `
      <div class="drift-matrix-shell">
        <div class="drift-matrix-empty">Not enough overlapping context to visualize drift yet.</div>
      </div>
    `;
  };

  if (
    !matrixData ||
    !Array.isArray(matrixData.grid) ||
    matrixData.grid.length === 0
  ) {
    showEmpty();
    return;
  }

  const {
    grid,
    cols,
    rows,
    refLabels = [],
    stuLabels = [],
    averageSimilarity = 0,
    maxSimilarity = 0,
    minSimilarity = 0,
  } = matrixData;

  const flat = grid.flat();
  const strongCount = flat.filter((value) => value >= 0.6).length;
  const weakCount = flat.filter((value) => value < 0.25).length;
  const averageDrift = 1 - clamp01(averageSimilarity);

  const columnLabels = refLabels
    .map(
      (label, idx) => `
      <div class="drift-col-label" title="Teacher chunk ${idx + 1}">
        ${label}
      </div>
    `,
    )
    .join("");

  const rowsHtml = grid
    .map((row, rowIndex) => {
      const rowLabel = stuLabels[rowIndex] || `S${rowIndex + 1}`;
      return `
        <div class="drift-row">
          <div class="drift-row-label" title="Student chunk ${rowIndex + 1}">${rowLabel}</div>
          <div class="drift-row-cells" style="grid-template-columns: repeat(${cols}, minmax(0, 1fr));">
            ${row
              .map((value, colIndex) => {
                const safe = Number.isFinite(value)
                  ? Math.max(0, Math.min(1, value))
                  : 0;
                const drift = 1 - safe;
                const hue = Math.round(212 - safe * 140);
                return `
                  <div
                    class="matrix-cell"
                    style="--sim:${safe}; --cell-hue:${hue};"
                    title="${rowLabel} × ${refLabels[colIndex] || `T${colIndex + 1}`}: similarity ${safe.toFixed(2)}, drift ${drift.toFixed(2)}"
                  ></div>
                `;
              })
              .join("")}
          </div>
        </div>
      `;
    })
    .join("");

  container.innerHTML = `
    <div class="drift-matrix-shell">
      <div class="drift-matrix-summary">
        <div class="drift-stat">
          <span class="drift-stat-label">Avg similarity</span>
          <strong>${Math.round(averageSimilarity * 100)}%</strong>
        </div>
        <div class="drift-stat">
          <span class="drift-stat-label">Avg drift</span>
          <strong>${Math.round(averageDrift * 100)}%</strong>
        </div>
        <div class="drift-stat">
          <span class="drift-stat-label">Peak match</span>
          <strong>${Math.round(maxSimilarity * 100)}%</strong>
        </div>
        <div class="drift-stat">
          <span class="drift-stat-label">Low-sim cells</span>
          <strong>${weakCount}</strong>
        </div>
        <div class="drift-stat">
          <span class="drift-stat-label">Strong cells</span>
          <strong>${strongCount}</strong>
        </div>
      </div>
      <div class="drift-axis">
        <span>Teacher script segments</span>
        <span>${cols} chunks</span>
      </div>
      <div class="drift-column-labels" style="grid-template-columns: repeat(${cols}, minmax(72px, 1fr));">
        ${columnLabels}
      </div>
      <div class="drift-heatmap-wrap">
        ${rowsHtml}
      </div>
      <div class="drift-legend">
        <span><i class="legend-swatch legend-low"></i> Low similarity</span>
        <span><i class="legend-swatch legend-mid"></i> Moderate similarity</span>
        <span><i class="legend-swatch legend-high"></i> Strong similarity</span>
      </div>
      <div class="drift-caption">Each cell is a real similarity score between a student chunk and a teacher chunk.</div>
    </div>
  `;
}

function renderDriftTimeline(timelineData) {
  const canvas = document.getElementById("drift-timeline-canvas");
  const emptyState = document.getElementById("drift-timeline-empty");
  const meta = document.getElementById("drift-timeline-meta");
  if (!canvas) return;

  const timeline = Array.isArray(timelineData?.timeline)
    ? [...timelineData.timeline].sort((a, b) => a.position - b.position)
    : [];

  if (!timeline.length) {
    canvas.classList.add("hidden");
    if (emptyState) emptyState.classList.remove("hidden");
    if (meta)
      meta.textContent = "Need more overlapping anchors to trace drift.";
    return;
  }

  canvas.classList.remove("hidden");
  if (emptyState) emptyState.classList.add("hidden");

  const { ctx, width, height } = prepareCanvas(canvas, 640, 200);
  const padding = 32;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  ctx.strokeStyle = isLight ? "rgba(15, 23, 42, 0.2)" : "rgba(255, 255, 255, 0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, height - padding);
  ctx.lineTo(width - padding, height - padding);
  ctx.stroke();

  const points = timeline.map((entry) => {
    const safePos = clamp01(entry.position / 100);
    const safeSim = clamp01(entry.similarity ?? 0);
    return {
      x: padding + safePos * chartWidth,
      y: padding + (1 - safeSim) * chartHeight,
      similarity: safeSim,
    };
  });

  const gradient = ctx.createLinearGradient(padding, 0, width - padding, 0);
  gradient.addColorStop(0, getCssColor("--accent2", "#67b8ff"));
  gradient.addColorStop(1, getCssColor("--accent1", "#5be49b"));

  ctx.beginPath();
  points.forEach((pt, idx) => {
    if (idx === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  });
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.lineTo(width - padding, height - padding);
  ctx.lineTo(padding, height - padding);
  ctx.closePath();
  ctx.fillStyle = "rgba(118, 104, 255, 0.08)";
  ctx.fill();

  ctx.fillStyle = isLight ? "#0f172a" : "#fff";
  points.forEach((pt) => {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });

  if (meta) {
    const avgDrift = clamp01(timelineData?.averageDrift ?? 0);
    const alignment = Math.round((1 - avgDrift) * 100);
    meta.innerHTML = `<strong>${alignment}%</strong> anchor alignment · ${Math.round(avgDrift * 100)}% drift`;
  }
}

function renderSentenceAttributions(sentences) {
  const body = document.getElementById("sentence-attribution-body");
  if (!body) return;

  body.innerHTML = sentences
    .map((s) => {
      const isPos = s.attribution >= 0;
      const safeText = escapeHtml(s.text || "");
      return `
            <div style="padding: 0.75rem; border-bottom: 1px solid var(--border-glass); font-size: 0.85rem; display: flex; align-items: flex-start; gap: 10px;">
                <span style="flex:1;">"${safeText}"</span>
                <span class="badge" style="margin:0; background:${isPos ? "rgba(74, 222, 128, 0.1)" : "rgba(248, 113, 113, 0.1)"}; color:${isPos ? "var(--accent1)" : "var(--danger)"}; border-color:${isPos ? "var(--accent1)" : "var(--danger)"}; min-width:60px; text-align:center;">
                    ${s.attribution >= 0 ? "+" : ""}${s.attribution.toFixed(2)}
                </span>
            </div>
        `;
    })
    .join("");
}

function renderSentenceHeatmap(sentences) {
  const container = document.getElementById("sentence-heatmap");
  if (!container) return;

  if (!Array.isArray(sentences) || !sentences.length) {
    container.innerHTML =
      '<p class="timeline-empty">No sentences detected for attribution.</p>';
    return;
  }

  const sorted = sentences
    .slice()
    .sort((a, b) => Math.abs(b.attribution) - Math.abs(a.attribution))
    .slice(0, 8);
  const maxAbs = sorted.reduce(
    (max, s) => Math.max(max, Math.abs(s.attribution)),
    0.01,
  );

  container.innerHTML = sorted
    .map((sentence) => {
      const isPos = sentence.attribution >= 0;
      const intensity = (
        0.2 +
        0.6 * (Math.abs(sentence.attribution) / maxAbs)
      ).toFixed(2);
      const safeText = escapeHtml(sentence.text || "");
      return `
        <div class="sentence-chip ${isPos ? "pos" : "neg"}" style="--heat-intensity:${intensity};">
          <div class="sentence-chip__text">${safeText}</div>
          <span class="sentence-chip__score">${isPos ? "+" : ""}${sentence.attribution.toFixed(2)}</span>
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
  const isLight = document.documentElement.getAttribute("data-theme") === "light";

  ctx.clearRect(0, 0, w, h);

  // Deterministic pseudo-random based on fixed seed
  function seededRandom(seed) {
    return function() {
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    };
  }
  const prng = seededRandom(42);

  // Dynamic placement
  const nodes = clusters.map((c, i) => ({
    ...c,
    x: 50 + prng() * (w - 100),
    y: 50 + prng() * (h - 100),
    r: 15 + c.similarity * 30,
  }));

  // Draw lines
  ctx.strokeStyle = isLight ? "rgba(108, 99, 255, 0.4)" : "rgba(108, 99, 255, 0.25)";
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
      ? (isLight ? "rgba(74, 222, 128, 0.35)" : "rgba(74, 222, 128, 0.2)")
      : (isLight ? "rgba(248, 113, 113, 0.25)" : "rgba(248, 113, 113, 0.1)");
    ctx.fill();
    ctx.strokeStyle = n.covered 
      ? (isLight ? "#22c55e" : "#4ade80")
      : (isLight ? "rgba(239, 68, 68, 0.7)" : "rgba(248, 113, 113, 0.5)");
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = isLight ? "#0f172a" : "#fff";
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

function renderTemporalDriftAnalysis(metrics) {
  // Create or get temporal analysis card
  let card = document.getElementById("temporal-drift-card");
  if (!card) {
    const xaiContent = document.getElementById("xai-content");
    if (!xaiContent) return;

    const cardHTML = `
      <div class="viz-card glass-card xai-card span-2" id="temporal-drift-card">
        <div class="viz-header">
          <h3 class="viz-title">📈 Temporal Learning Analysis</h3>
          <span class="badge" style="margin-bottom: 0">Multi-submission tracking</span>
        </div>
        <div class="viz-body">
          <div id="temporal-content" style="display: flex; flex-direction: column; gap: 2rem; width: 100%;">
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.5rem; width: 100%; justify-items: center;">
              <div id="temporal-metrics" style="display: contents;"></div>
            </div>
            <div style="width: 100%; display: flex; justify-content: center;">
              <canvas id="temporal-chart" width="900" height="400" style="max-width: 100%; border: 1px solid var(--border-glass); border-radius: var(--radius-md);"></canvas>
            </div>
          </div>
          <div style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border-glass);">
            <button onclick="TemporalDriftTracker.clearSubmissions(); location.reload();" 
                    style="padding: 0.5rem 1rem; background: rgba(248, 113, 113, 0.1); color: var(--danger); border: 1px solid var(--danger); border-radius: var(--radius-sm); cursor: pointer; font-size: 0.85rem;">
              🗑️ Clear Submission History
            </button>
          </div>
        </div>
      </div>
    `;
    xaiContent.insertAdjacentHTML("beforeend", cardHTML);
    card = document.getElementById("temporal-drift-card");
  }

  // Fill in metrics
  const metricsDiv = document.getElementById("temporal-metrics");
  metricsDiv.innerHTML = `
    <div style="padding: 0.75rem; background: var(--bg-secondary); border-radius: var(--radius-sm); border: 1px solid var(--border-glass);">
      <span style="font-size: 0.8rem; color: var(--text-dim);">Submissions</span>
      <div style="font-size: 1.4rem; font-weight: 600; color: var(--primary);">${metrics.submissionCount}</div>
    </div>
    <div style="padding: 0.75rem; background: var(--bg-secondary); border-radius: var(--radius-sm); border: 1px solid var(--border-glass);">
      <span style="font-size: 0.8rem; color: var(--text-dim);">Improvement</span>
      <div style="font-size: 1.4rem; font-weight: 600; color: ${parseFloat(metrics.improvementScore) > 0 ? "var(--accent1)" : "var(--danger)"};">${metrics.improvementScore > 0 ? "+" : ""}${metrics.improvementScore}</div>
    </div>
    <div style="padding: 0.75rem; background: var(--bg-secondary); border-radius: var(--radius-sm); border: 1px solid var(--border-glass);">
      <span style="font-size: 0.8rem; color: var(--text-dim);">Consistency</span>
      <div style="font-size: 1.4rem; font-weight: 600; color: var(--primary);">${(parseFloat(metrics.consistencyScore) * 100).toFixed(0)}%</div>
    </div>
    <div style="padding: 0.75rem; background: var(--bg-secondary); border-radius: var(--radius-sm); border: 1px solid var(--border-glass);">
      <span style="font-size: 0.8rem; color: var(--text-dim);">Learning Trend</span>
      <div style="font-size: 1.2rem; font-weight: 600; color: var(--text-primary);">
        ${metrics.driftTrend === "improving" ? "📈 Improving" : metrics.driftTrend === "degrading" ? "📉 Degrading" : "➡️ Stable"}
      </div>
    </div>
  `;

  // Draw trajectory chart
  const canvas = document.getElementById("temporal-chart");
  if (canvas) {
    drawTemporalChart(canvas, metrics);
  }
}

function drawTemporalChart(canvas, metrics) {
  const ctx = canvas.getContext("2d");
  const scores = metrics.scoreTrajectory.map((s) => parseFloat(s));
  const width = canvas.width;
  const height = canvas.height;
  const padding = 90; // Increased padding for spacing
  const graphWidth = width - padding * 2;
  const graphHeight = height - padding * 2;
  const isLight = document.documentElement.getAttribute("data-theme") === "light";

  // ─── BACKGROUND ───
  ctx.fillStyle = isLight ? "#f0f2f5" : "rgba(12, 14, 35, 0.8)";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = isLight ? "#ffffff" : "rgba(20, 25, 50, 0.6)";
  ctx.fillRect(padding, padding, graphWidth, graphHeight);

  // ─── GRID LINES (BOLD) ───
  ctx.strokeStyle = isLight ? "rgba(15, 23, 42, 0.1)" : "rgba(100, 120, 200, 0.3)";
  ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    const y = padding + (graphHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  // ─── Y-AXIS LABELS (Score scale) ───
  ctx.fillStyle = isLight ? "rgba(15, 23, 42, 0.85)" : "rgba(200, 210, 255, 0.9)";
  ctx.font = "bold 14px Inter";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  const maxScore = Math.max(...scores, 10);
  for (let i = 0; i <= 4; i++) {
    const y = padding + (graphHeight / 4) * (4 - i);
    const scoreValue = (i / 4) * maxScore;
    ctx.fillText(scoreValue.toFixed(1), padding - 20, y);
  }

  // ─── DATA LINE (BOLD AND VISIBLE) ───
  ctx.strokeStyle = "#6366f1"; // Indigo for visibility
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();

  const minScore = 0;

  scores.forEach((score, i) => {
    const x = padding + (graphWidth / Math.max(1, scores.length - 1)) * i;
    const normalizedScore = (score - minScore) / (maxScore - minScore);
    const y = padding + graphHeight - normalizedScore * graphHeight;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  // ─── GLOW EFFECT FOR LINE ───
  ctx.strokeStyle = "rgba(99, 102, 241, 0.3)";
  ctx.lineWidth = 12;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();

  scores.forEach((score, i) => {
    const x = padding + (graphWidth / Math.max(1, scores.length - 1)) * i;
    const normalizedScore = (score - minScore) / (maxScore - minScore);
    const y = padding + graphHeight - normalizedScore * graphHeight;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  // ─── DATA POINTS (LARGE AND VISIBLE) ───
  scores.forEach((score, i) => {
    const x = padding + (graphWidth / Math.max(1, scores.length - 1)) * i;
    const normalizedScore = (score - minScore) / (maxScore - minScore);
    const y = padding + graphHeight - normalizedScore * graphHeight;

    // Outer glow
    ctx.fillStyle = "rgba(99, 102, 241, 0.2)";
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fill();

    // Main point
    ctx.fillStyle = "#6366f1";
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();

    // Highlight
    ctx.fillStyle = isLight ? "rgba(15, 23, 42, 0.5)" : "rgba(255, 255, 255, 0.5)";
    ctx.beginPath();
    ctx.arc(x - 2, y - 2, 3, 0, Math.PI * 2);
    ctx.fill();

    // Score label above point
    ctx.fillStyle = isLight ? "rgba(15, 23, 42, 0.95)" : "rgba(200, 210, 255, 0.95)";
    ctx.font = "bold 12px Inter";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(score.toFixed(1), x, y - 20);
  });

  // ─── X-AXIS LABELS (Submission numbers) ───
  ctx.fillStyle = isLight ? "rgba(15, 23, 42, 0.9)" : "rgba(200, 210, 255, 0.9)";
  ctx.font = "bold 13px Inter";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  scores.forEach((_, i) => {
    const x = padding + (graphWidth / Math.max(1, scores.length - 1)) * i;
    ctx.fillText(`#${i + 1}`, x, height - padding + 25);
  });

  // ─── AXIS LABELS ───
  ctx.fillStyle = isLight ? "rgba(15, 23, 42, 0.8)" : "rgba(200, 210, 255, 0.8)";
  ctx.font = "bold 15px Inter";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("Submission Progress →", width / 2, height - 35);

  ctx.save();
  ctx.translate(20, height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.font = "bold 15px Inter";
  ctx.fillText("← Score", 0, 0);
  ctx.restore();

  // ─── AXES (BOLD BORDERS) ───
  ctx.strokeStyle = isLight ? "rgba(15, 23, 42, 0.6)" : "rgba(150, 170, 255, 0.6)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, height - padding);
  ctx.lineTo(width - padding, height - padding);
  ctx.stroke();
}

// ─────────────────────────────────────────
// 3. User Interactions
// ─────────────────────────────────────────

// Single Ans Form
const demoForm = document.getElementById("demo-form");
const computeScoreBtn = document.getElementById("compute-score-btn");
if (demoForm) {
  demoForm.addEventListener("submit", async (e) => {
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

    setButtonRunningState(computeScoreBtn, true, "Computing...");
    await yieldToBrowser();

    try {
      const res = gradeAnswer(ref, stu, max);
      window.lastEvalResult = { res, max };

      // Track this submission for temporal analysis
      TemporalDriftTracker.addSubmission(ref, stu, res.scoreObj, res.drift);

      // Show result panels
      document.getElementById("results-placeholder").classList.add("hidden");
      document.getElementById("results-content").classList.remove("hidden");
      document.getElementById("xai-content").classList.remove("hidden");

      // Render stats
      renderScore(res.scoreObj, max);
      renderExplanation(res.explanation);
      renderShap(res.shap, max);
      renderWaterfall(res.scoreObj, res.shap);
      renderMetricComparison(res.features);
      renderMetricRadar(res.features);
      renderDriftMatrix(res.matrix);
      renderDriftTimeline(res.timeline);
      renderSentenceAttributions(res.sentences);
      renderSentenceHeatmap(res.sentences);
      renderConceptClusters(res.clusters);

      // Render temporal drift analysis if multiple submissions exist
      const temporalMetrics = TemporalDriftTracker.computeTemporalMetrics();
      if (temporalMetrics) {
        renderTemporalDriftAnalysis(temporalMetrics);
      }

      // Use CORRECT semantic drift (concept-based), not score-derived proxy
      const correctDriftPct = Math.round((res.drift?.drift_score ?? 0) * 100);
      const temporalMsg = temporalMetrics
        ? ` | Learning Trend: ${temporalMetrics.driftTrend}`
        : "";
      showPopup(
        "Grading Complete",
        `Score: ${res.scoreObj.final.toFixed(2)}/${max} | Semantic Drift: ${correctDriftPct}%${temporalMsg}`,
        "success",
      );
    } catch (err) {
      showPopup(
        "Grading Error",
        err.message || "An error occurred during grading.",
        "error",
      );
      console.error(err);
    } finally {
      setButtonRunningState(computeScoreBtn, false);
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
 * Display batch analytics visualizations
 */
function displayBatchAnalytics(analyticsData) {
  const container = document.getElementById("batch-analytics-container");
  if (!container) return;

  container.classList.remove("hidden");

  // Display anomalies
  if (analyticsData.anomalies) {
    const anomaliesSection = document.getElementById("batch-anomalies");
    if (anomaliesSection && AnalyticsHandler) {
      anomaliesSection.innerHTML =
        "<h3 style='grid-column: 1/-1; margin-bottom: 1.5rem;'>⚠️ Anomaly Detection</h3>";
      AnalyticsHandler.renderAnomalies(analyticsData.anomalies);
    }
  }

  // Display peer comparison
  if (analyticsData.peer_comparison) {
    const peerSection = document.getElementById("batch-peer-comparison");
    if (peerSection && AnalyticsHandler) {
      peerSection.innerHTML =
        "<h3 style='grid-column: 1/-1; margin-bottom: 1.5rem;'>📊 Peer Comparison</h3>";
      AnalyticsHandler.renderPeerComparison(analyticsData.peer_comparison);
    }
  }

  // Display learning curves
  if (analyticsData.learning_curves) {
    const curvesSection = document.getElementById("batch-learning-curves");
    if (curvesSection && AnalyticsHandler) {
      curvesSection.innerHTML =
        "<h3 style='grid-column: 1/-1; margin-bottom: 1.5rem;'>📈 Learning Curves</h3>";
      AnalyticsHandler.renderLearningCurves(analyticsData.learning_curves);
    }
  }

  // Display momentum
  if (analyticsData.momentum) {
    const momentumSection = document.getElementById("batch-momentum");
    if (momentumSection && AnalyticsHandler) {
      momentumSection.innerHTML =
        "<h3 style='grid-column: 1/-1; margin-bottom: 1.5rem;'>⚡ Momentum & Prediction</h3>";
      AnalyticsHandler.renderMomentum(analyticsData.momentum);
    }
  }

  // Display coverage
  if (analyticsData.semantic_coverage) {
    const coverageSection = document.getElementById("batch-coverage");
    if (coverageSection && AnalyticsHandler) {
      coverageSection.innerHTML =
        "<h3 style='grid-column: 1/-1; margin-bottom: 1.5rem;'>📏 Semantic Coverage</h3>";
      AnalyticsHandler.renderCoverage(analyticsData.semantic_coverage);
    }
  }
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
            const driftPct = Math.round(
              clamp01(res?.drift?.drift_score ?? 1) * 100,
            );
            const alignmentPct = Math.max(0, 100 - driftPct);

            scored.push({
              Name: row[colName] || "Unknown",
              Email: row[colEmail] || "N/A",
              Roll: row[colRoll] || "N/A",
              Score: res.scoreObj.final.toFixed(2),
              "Semantic Drift": driftPct + "%",
              "Topic Alignment": alignmentPct + "%",
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

let liveReplayConfig = null;

function renderBatchResults(data, fileName = "results", options = {}) {
  const wrap = document.getElementById("batch-table-wrap");
  const resultsSec = document.getElementById("batch-results");
  if (!wrap) return;

  resultsSec.classList.remove("hidden");

  // Add filename header
  let html = `<div style="margin-bottom:1.5rem; padding-bottom:1rem; border-bottom:1px solid var(--border-glass);">
    <p style="margin:0 0 0.5rem 0; color:var(--text-dim); font-size:0.85rem;">📁 File: <strong>${fileName}</strong></p>
    <p style="margin:0; color:var(--text-muted); font-size:0.8rem;">Total Records: <strong>${data.length}</strong></p>
  </div>`;

  const columns = Object.keys(data[0]).filter((key) => !key.startsWith("__"));
  const enableReplay = Boolean(options?.liveReplay);

  html += `<div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:0.85rem;"><thead><tr style="background:rgba(255,255,255,0.05);">`;
  columns.forEach(
    (k) =>
      (html += `<th style="padding:1rem; text-align:left; border-bottom:2px solid var(--border-glass); font-weight:600;">${k}</th>`),
  );
  if (enableReplay) {
    html += `<th style="padding:1rem; text-align:left; border-bottom:2px solid var(--border-glass); font-weight:600; min-width:130px;">Live Replay</th>`;
  }
  html += `</tr></thead><tbody>`;

  data.forEach((row, idx) => {
    html += `<tr style="border-bottom:1px solid var(--border-glass); ${
      idx % 2 === 0 ? "background:rgba(255,255,255,0.02);" : ""
    }">`;
    columns.forEach((col) => {
      const value = row[col];
      html += `<td style="padding:1rem;">${value}</td>`;
    });

    if (enableReplay) {
      const payload = options.liveReplay.studentAnswers?.[idx] || null;
      const hasRef = Boolean(options.liveReplay.referenceText);
      const hasSummary = Boolean(
        payload &&
        (typeof payload === "string"
          ? payload.trim()
          : (payload.text || "").trim()),
      );
      const canReplay = hasRef && hasSummary;
      html += `<td style="padding:1rem;">
        <button type="button" class="btn btn-sm btn-secondary row-replay-btn" data-row-index="${idx}" ${canReplay ? "" : "disabled"}>
          ${canReplay ? "Run Live" : "Unavailable"}
        </button>
      </td>`;
    }

    html += `</tr>`;
  });
  html += `</tbody></table></div>`;

  wrap.innerHTML = html;
  showToast(`✅ Results loaded: ${data.length} records from ${fileName}`);

  // Check if analytics data is available in options
  if (options.analyticsData) {
    displayBatchAnalytics(options.analyticsData);
  }

  if (enableReplay) {
    liveReplayConfig = {
      referenceText: options.liveReplay.referenceText || "",
      studentAnswers: options.liveReplay.studentAnswers || [],
      maxScore: options.liveReplay.maxScore || 10,
    };
    requestAnimationFrame(() => wireLiveReplayButtons());
  } else {
    liveReplayConfig = null;
  }
}

function wireLiveReplayButtons() {
  const buttons = document.querySelectorAll(".row-replay-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.processing === "1") return;
      const idx = Number(btn.dataset.rowIndex || 0);
      triggerLiveReplay(idx, btn);
    });
  });
}

function setReplayButtonState(button, isProcessing) {
  if (!button) return;
  if (isProcessing) {
    button.dataset.processing = "1";
    setButtonRunningState(button, true, "Running...");
    button.setAttribute("aria-busy", "true");
    return;
  }

  button.dataset.processing = "0";
  setButtonRunningState(button, false);
  button.removeAttribute("aria-busy");
}

function triggerLiveReplay(rowIndex, triggerBtn) {
  document
    .querySelectorAll('.row-replay-btn[data-processing="1"]')
    .forEach((btn) => setReplayButtonState(btn, false));
  setReplayButtonState(triggerBtn, true);

  if (!liveReplayConfig) {
    setReplayButtonState(triggerBtn, false);
    showPopup("Live Replay", "No replay data is available yet.", "warning");
    return;
  }

  const ref = (liveReplayConfig.referenceText || "").trim();
  const payload = liveReplayConfig.studentAnswers[rowIndex];
  const studentText = typeof payload === "string" ? payload : payload?.text;
  const studentName =
    typeof payload === "string"
      ? `Student ${rowIndex + 1}`
      : payload?.name || `Student ${rowIndex + 1}`;

  if (!ref || !studentText) {
    setReplayButtonState(triggerBtn, false);
    showPopup(
      "Live Replay",
      "Reference or student answer missing for this row.",
      "error",
    );
    return;
  }

  const refField = document.getElementById("ref-answer");
  const stuField = document.getElementById("stu-answer");
  const maxField = document.getElementById("max-score");
  if (!refField || !stuField || !maxField || !demoForm) {
    setReplayButtonState(triggerBtn, false);
    showPopup(
      "Live Replay",
      "Unable to locate the live scoring form on this page.",
      "error",
    );
    return;
  }

  refField.value = ref;
  stuField.value = studentText;
  maxField.value = liveReplayConfig.maxScore || 10;

  const demoSection = document.getElementById("demo");
  if (demoSection && typeof demoSection.scrollIntoView === "function") {
    demoSection.scrollIntoView({ behavior: "smooth" });
  }

  showToast(`🔁 Replaying ${studentName} in live demo...`);
  requestAnimationFrame(() => {
    demoForm.dispatchEvent(new Event("submit"));
    setTimeout(() => setReplayButtonState(triggerBtn, false), 900);
  });
}

// Script Eval (Docx + Xlsx)
const scriptBtn = document.getElementById("run-script-eval-btn");
const docxInput = document.getElementById("script-file-input");
const xlsxInput = document.getElementById("summary-file-input");
const docxZone = document.getElementById("script-upload-zone");
const xlsxZone = document.getElementById("summary-upload-zone");
const docxFileLabel = document.getElementById("script-upload-filename");
const xlsxFileLabel = document.getElementById("summary-upload-filename");
const scriptStatusEl = document.getElementById("script-eval-status");
const uploadPlaceholderText = "No file selected yet";
const scriptBtnDefaultText = scriptBtn
  ? scriptBtn.textContent.trim()
  : "Run Class Evaluation";
const scriptEvalYieldBatch = 1; // yield every record to keep UI responsive with large datasets

let teacherTranscript = "";
let studentData = [];
let docxFileName = "";
let xlsxFileName = "";
let evalColumnHints = {
  summary: null,
  name: null,
  email: null,
  roll: null,
};

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

function resetEvalColumnHints() {
  evalColumnHints = {
    summary: null,
    name: null,
    email: null,
    roll: null,
  };
}

function inferEvalColumns(rows) {
  resetEvalColumnHints();
  if (!Array.isArray(rows) || rows.length === 0) return;

  const richestRow = rows.reduce((best, row) => {
    const current = row || {};
    if (!best) return current;
    return Object.keys(current).length > Object.keys(best).length
      ? current
      : best;
  }, rows[0] || {});

  const keys = Object.keys(richestRow || {});
  const findKey = (regex) => keys.find((k) => regex.test(k)) || null;

  evalColumnHints = {
    summary: findKey(/summary|answer|response|essay/i),
    name: findKey(/name|student|fullname/i),
    email: findKey(/email|emailaddress|e-mail/i),
    roll: findKey(/roll|rollnumber|studentid|id/i),
  };

  if (!evalColumnHints.summary) {
    showPopup(
      "Column Not Found",
      "Couldn't detect a summary/answer column. Please ensure one header contains keywords like 'summary', 'answer', 'response', or 'essay'.",
      "error",
    );
  }
}

function yieldToBrowser() {
  return new Promise((resolve) => {
    const raf =
      typeof window !== "undefined" ? window.requestAnimationFrame : null;
    if (typeof raf === "function") {
      raf(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

function setButtonRunningState(button, isRunning, runningText) {
  if (!button) return;
  if (isRunning) {
    if (!button.dataset.defaultText) {
      button.dataset.defaultText = button.textContent.trim();
    }
    button.disabled = true;
    button.classList.add("loading");
    if (runningText) button.textContent = runningText;
    return;
  }

  button.disabled = false;
  button.classList.remove("loading");
  button.textContent = button.dataset.defaultText || button.textContent;
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
    if (scriptStatusEl) {
      scriptStatusEl.textContent = "Class evaluation in progress...";
      scriptStatusEl.classList.add("active");
      scriptStatusEl.classList.remove("hidden");
    }
  } else {
    const baseText = scriptBtn.dataset.defaultText || scriptBtnDefaultText;
    scriptBtn.textContent = baseText;
    scriptBtn.classList.remove("loading");
    if (scriptStatusEl) {
      scriptStatusEl.classList.remove("active");
      scriptStatusEl.classList.add("hidden");
    }
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
      resetEvalColumnHints();
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
        inferEvalColumns(studentData);
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
      resetEvalColumnHints();
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
  if (teacherTranscript && studentData.length > 0 && evalColumnHints.summary) {
    scriptBtn.disabled = false;
    scriptBtn.classList.add("pulse");
  } else {
    scriptBtn.disabled = true;
    scriptBtn.classList.remove("pulse");
    if (scriptStatusEl) {
      scriptStatusEl.classList.add("hidden");
      scriptStatusEl.classList.remove("active");
    }
  }
}

// ─────────────────────────────────────────
// TEMPORAL SEMANTIC DRIFT ANALYSIS (Over Time)
// ─────────────────────────────────────────

/**
 * Temporal Semantic Drift Analysis
 * Tracks how semantic drift changes across multiple submissions over time.
 * Implements research from:
 * - Kulkarni et al. (2015): Linguistic change detection
 * - Bamler & Mandt (2017): Dynamic word embeddings
 */

const TemporalDriftTracker = {
  submissions: JSON.parse(sessionStorage.getItem("submission_history") || "[]"),

  addSubmission(ref, studentAnswer, scoreObj, driftObj) {
    const entry = {
      timestamp: new Date().toISOString(),
      studentAnswer: studentAnswer,
      score: scoreObj.final,
      driftScore: driftObj.drift_score || 0,
      conceptCoverage: scoreObj.concept_coverage || 0,
    };
    this.submissions.push(entry);
    sessionStorage.setItem(
      "submission_history",
      JSON.stringify(this.submissions),
    );
    return entry;
  },

  computeTemporalMetrics() {
    if (this.submissions.length < 2) {
      return null; // Need at least 2 submissions for temporal analysis
    }

    const scores = this.submissions.map((s) => s.score);
    const drifts = this.submissions.map((s) => s.driftScore);
    const coverages = this.submissions.map((s) => s.conceptCoverage);

    // Improvement Score: raw difference between last and first submission
    const firstScore = scores[0];
    const lastScore = scores[scores.length - 1];
    const rawImprovement = lastScore - firstScore;

    // Normalize improvement to -1 to +1 scale (based on max possible difference)
    const maxPossibleImprovement = 10 - 0; // Assuming 0-10 scale
    const improvementScore = rawImprovement / maxPossibleImprovement;

    // Consistency Score: 1 = stable, 0 = volatile
    const scoreVariance = this.variance(scores);
    const maxVariance = 25; // Max expected variance
    const consistencyScore = Math.max(0, 1 - scoreVariance / maxVariance);

    // Volatility: unpredictability measure
    const volatility = Math.sqrt(scoreVariance);

    // Determine Trend based on IMPROVEMENT SCORE (not drift)
    let driftTrend = "stable";
    if (rawImprovement > 0.5) {
      driftTrend = "improving"; // Score improved significantly
    } else if (rawImprovement < -0.5) {
      driftTrend = "degrading"; // Score degraded significantly
    }
    // Otherwise remains "stable"

    // Concept Coverage Evolution
    const avgCoverage = coverages.reduce((a, b) => a + b, 0) / coverages.length;
    const coverageTrend =
      coverages[coverages.length - 1] > coverages[0]
        ? "increasing"
        : "decreasing";

    return {
      submissionCount: this.submissions.length,
      improvementScore: rawImprovement.toFixed(3),
      consistencyScore: consistencyScore.toFixed(3),
      volatility: volatility.toFixed(3),
      driftTrend: driftTrend,
      scoreTrajectory: scores.map((s) => s.toFixed(2)),
      driftTrajectory: drifts.map((d) => (d * 100).toFixed(1)),
      coverageTrajectory: coverages.map((c) => (c * 100).toFixed(1)),
      avgCoverage: (avgCoverage * 100).toFixed(1),
      latestMetrics: {
        score: scores[scores.length - 1].toFixed(2),
        drift: (drifts[drifts.length - 1] * 100).toFixed(1),
        coverage: (coverages[coverages.length - 1] * 100).toFixed(1),
      },
    };
  },

  variance(arr) {
    if (arr.length < 2) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const squaredDiffs = arr.map((x) => Math.pow(x - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / arr.length;
  },

  clearSubmissions() {
    this.submissions = [];
    sessionStorage.removeItem("submission_history");
  },
};

if (scriptBtn) {
  scriptBtn.addEventListener("click", async () => {
    if (!teacherTranscript || studentData.length === 0) {
      showPopup(
        "Missing Data",
        "Please upload both teacher script and student data.",
        "error",
      );
      return;
    }
    if (!evalColumnHints.summary) {
      showPopup(
        "Missing Column",
        "Unable to detect a summary/answer column in your sheet. Please rename it to include keywords like 'summary', 'answer', or 'response'.",
        "error",
      );
      return;
    }
    setScriptEvalRunning(true);
    await yieldToBrowser();

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
      const replayPayloads = [];
      for (let idx = 0; idx < studentData.length; idx += 1) {
        if (idx % scriptEvalYieldBatch === 0) {
          await yieldToBrowser();
        }
        const s = studentData[idx];
        try {
          const studentName = safeValue(
            s,
            evalColumnHints.name || "name",
            "Unknown",
          );
          const studentEmail = safeValue(
            s,
            evalColumnHints.email || "email",
            "N/A",
          );
          const studentRoll = safeValue(
            s,
            evalColumnHints.roll || "roll",
            "N/A",
          );
          const studentSummaryRaw = safeValue(
            s,
            evalColumnHints.summary,
            "",
          ).trim();

          if (!hasMeaningfulValue(studentSummaryRaw)) {
            results.push({
              Name: studentName,
              Email: studentEmail,
              Roll: studentRoll,
              Score: "MISSING SUMMARY",
              Drift: "-",
              "Topic Alignment": "-",
              "Concept Coverage": "-",
            });
            replayPayloads.push(null);
            continue;
          }
          const res = gradeAnswer(teacherTranscript, studentSummaryRaw, 10);

          const coverageRaw =
            typeof res?.drift?.concept_coverage === "number"
              ? res.drift.concept_coverage
              : 0;
          const coveragePct = Math.round(
            Math.min(Math.max(coverageRaw, 0), 1) * 100,
          );
          const finalScore =
            typeof res?.scoreObj?.final === "number" ? res.scoreObj.final : 0;
          const driftPct = Math.round(
            clamp01(res?.drift?.drift_score ?? 1) * 100,
          );
          const alignmentPct = Math.max(0, 100 - driftPct);

          results.push({
            Name: studentName,
            Email: studentEmail,
            Roll: studentRoll,
            Score: finalScore.toFixed(2),
            Drift: `${driftPct}%`,
            "Topic Alignment": `${alignmentPct}%`,
            "Concept Coverage": `${coveragePct}%`,
          });
          replayPayloads.push({
            text: studentSummaryRaw,
            name: studentName,
          });
        } catch (e) {
          console.error(`Error evaluating student ${idx}:`, e);
          results.push({
            Name: safeValue(s, "name", "Unknown"),
            Email: safeValue(s, "email", "N/A"),
            Roll: safeValue(s, "roll", "N/A"),
            Score: "ERROR",
            Drift: "N/A",
            "Topic Alignment": "N/A",
            "Concept Coverage": "N/A",
          });
          replayPayloads.push(null);
        }

        // Update progress
        const progress = Math.round(((idx + 1) / studentData.length) * 100);
        const progressBar = document.getElementById("eval-progress-bar");
        const progressText = document.getElementById("eval-progress-text");
        if (progressBar) progressBar.style.width = progress + "%";
        if (progressText)
          progressText.textContent = `${idx + 1} / ${studentData.length} evaluated`;
      }

      if (results.length === 0) {
        showPopup(
          "Processing Error",
          "No students could be evaluated.",
          "error",
        );
        return;
      }

      renderBatchResults(results, xlsxFileName, {
        liveReplay: {
          referenceText: teacherTranscript,
          studentAnswers: replayPayloads,
          maxScore: 10,
        },
      });
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
