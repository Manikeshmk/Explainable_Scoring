/**
 * batch_analytics_visualizer.js
 * Renders batch analytics visualizations for ExplainGrade.
 * Provides chart helpers used by analytics-handler.js and app.js batch grading.
 */

"use strict";

// ─────────────────────────────────────────
// AdvancedAnalytics namespace
// ─────────────────────────────────────────

const AdvancedAnalytics = {
  /**
   * MultiDimensionalVisualizer — draws learning curves on a canvas element.
   */
  MultiDimensionalVisualizer: {
    /**
     * Draw multi-dimensional learning curves for a single student.
     * @param {HTMLCanvasElement} canvas
     * @param {Object} student  - Analytics data object for one student
     */
    drawLearningCurves(canvas, student) {
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      const w = canvas.offsetWidth || canvas.width;
      const h = canvas.offsetHeight || canvas.height;
      const ratio = window.devicePixelRatio || 1;

      canvas.width = w * ratio;
      canvas.height = h * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

      const pad = { top: 30, right: 20, bottom: 40, left: 44 };
      const chartW = w - pad.left - pad.right;
      const chartH = h - pad.top - pad.bottom;

      const isLight =
        document.documentElement.getAttribute("data-theme") === "light";
      const gridColor = isLight
        ? "rgba(15,23,42,0.08)"
        : "rgba(255,255,255,0.08)";
      const textColor = isLight ? "#0f172a" : "#e2e8f0";
      const mutedColor = isLight ? "#64748b" : "#64748b";

      ctx.clearRect(0, 0, w, h);

      // Grid lines
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = pad.top + (chartH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + chartW, y);
        ctx.stroke();

        ctx.fillStyle = mutedColor;
        ctx.font = "10px Inter, sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(((1 - i / 4) * 100).toFixed(0) + "%", pad.left - 6, y + 4);
      }

      // Axes
      ctx.strokeStyle = isLight ? "rgba(15,23,42,0.2)" : "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.left, pad.top);
      ctx.lineTo(pad.left, pad.top + chartH);
      ctx.lineTo(pad.left + chartW, pad.top + chartH);
      ctx.stroke();

      const curves = [
        {
          key: "accuracy_curve",
          label: "Accuracy",
          color: "#6c63ff",
          scale: 1 / 10,
        },
        {
          key: "semantic_drift_curve",
          label: "Semantic",
          color: "#5be49b",
          scale: 1,
        },
        {
          key: "consistency_curve",
          label: "Consistency",
          color: "#67b8ff",
          scale: 1,
        },
      ];

      curves.forEach((curve) => {
        const data = student[curve.key];
        if (!data || !Array.isArray(data.values) || data.values.length < 2)
          return;

        const vals = data.values;
        const n = vals.length;

        ctx.beginPath();
        ctx.strokeStyle = curve.color;
        ctx.lineWidth = 2;

        vals.forEach((v, i) => {
          const x = pad.left + (i / (n - 1)) * chartW;
          const normalised = Math.max(0, Math.min(1, v * curve.scale));
          const y = pad.top + (1 - normalised) * chartH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      });

      // Legend
      let legendX = pad.left;
      curves.forEach((curve) => {
        ctx.fillStyle = curve.color;
        ctx.fillRect(legendX, pad.top - 18, 14, 4);
        ctx.fillStyle = textColor;
        ctx.font = "10px Inter, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(curve.label, legendX + 18, pad.top - 13);
        legendX += curve.label.length * 6.5 + 30;
      });
    },
  },
};

// ─────────────────────────────────────────
// Batch result chart renderers (used by app.js)
// ─────────────────────────────────────────

/**
 * Renders a simple bar chart of batch scores into a container element.
 * @param {string} containerId  - DOM id of container
 * @param {Array<{name:string, score:number, maxScore:number}>} rows
 */
function renderBatchScoreChart(containerId, rows) {
  const container = document.getElementById(containerId);
  if (!container || !Array.isArray(rows) || rows.length === 0) return;

  const maxScore = rows.reduce((m, r) => Math.max(m, r.maxScore || 10), 10);

  container.innerHTML = rows
    .map((row) => {
      const pct = Math.min(100, Math.max(0, ((row.score || 0) / maxScore) * 100));
      const hue = Math.round((pct / 100) * 120); // red→green
      return `
        <div style="margin-bottom:0.75rem;">
          <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:0.25rem;">
            <span>${escapeHtmlBav(row.name || "Student")}</span>
            <span style="color:hsl(${hue},70%,55%)">${(row.score || 0).toFixed(1)} / ${maxScore}</span>
          </div>
          <div style="background:rgba(255,255,255,0.06);border-radius:4px;height:8px;overflow:hidden;">
            <div style="width:${pct}%;height:100%;background:hsl(${hue},70%,55%);border-radius:4px;transition:width 0.6s ease;"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

function escapeHtmlBav(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
