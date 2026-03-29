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
window.addEventListener("scroll", () => {
    if (navbar) navbar.classList.toggle("scrolled", window.scrollY > 50);
}, { passive: true });

// Toasts
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

    explanation.sections.forEach(s => {
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
        tipsDiv.innerHTML = `<strong style="display:block; margin-bottom:0.5rem; color:var(--primary);">💡 Recommendations:</strong>` +
            `<ul style="font-size:0.85rem; padding-left:1.5rem;">${explanation.tips.map(t => `<li>${t}</li>`).join("")}</ul>`;
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
        feat_avg_edit: "Phrasing"
    };

    body.innerHTML = Object.entries(shap).map(([key, val]) => {
        const isPos = val >= 0;
        const width = Math.min(100, (Math.abs(val) / (max * 0.5)) * 100);
        return `
            <div style="margin-bottom: 1rem;">
                <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:0.3rem;">
                    <span>${labels[key] || key}</span>
                    <span style="color:${isPos ? 'var(--accent1)' : 'var(--danger)'}">${val >= 0 ? '+' : ''}${val.toFixed(2)}</span>
                </div>
                <div class="ex-bar-wrap">
                    <div class="ex-bar ${isPos ? 'ex-bar-pos' : 'ex-bar-neg'}" style="width:${width}%;"></div>
                </div>
            </div>
        `;
    }).join("");
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

    body.innerHTML = sentences.map(s => {
        const isPos = s.attribution >= 0;
        return `
            <div style="padding: 0.75rem; border-bottom: 1px solid var(--border-glass); font-size: 0.85rem; display: flex; align-items: flex-start; gap: 10px;">
                <span style="flex:1;">"${s.text}"</span>
                <span class="badge" style="margin:0; background:${isPos ? 'rgba(74, 222, 128, 0.1)' : 'rgba(248, 113, 113, 0.1)'}; color:${isPos ? 'var(--accent1)' : 'var(--danger)'}; border-color:${isPos ? 'var(--accent1)' : 'var(--danger)'}; min-width:60px; text-align:center;">
                    ${s.attribution >= 0 ? '+' : ''}${s.attribution.toFixed(2)}
                </span>
            </div>
        `;
    }).join("");
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
        r: 15 + (c.similarity * 30)
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
    nodes.forEach(n => {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = n.covered ? "rgba(74, 222, 128, 0.2)" : "rgba(248, 113, 113, 0.1)";
        ctx.fill();
        ctx.strokeStyle = n.covered ? "#4ade80" : "rgba(248, 113, 113, 0.5)";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = "#fff";
        ctx.font = "600 10px Inter";
        ctx.textAlign = "center";
        ctx.fillText(n.label.substring(0, 15) + (n.label.length > 15 ? '..' : ''), n.x, n.y + 3);
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
            showToast("Please provide both answers.", "error");
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

            showToast("Grading complete!");
        } catch (err) {
            showToast("Error during grading: " + err.message, "error");
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
        demoForm.dispatchEvent(new Event('submit'));
    });
}

const btnS2 = document.getElementById("try-sample-2");
if (btnS2) {
    btnS2.addEventListener("click", () => {
        document.getElementById("ref-answer").value = SAMPLES.case2.ref;
        document.getElementById("stu-answer").value = SAMPLES.case2.stu;
        document.getElementById("max-score").value = SAMPLES.case2.max;
        demoForm.dispatchEvent(new Event('submit'));
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

function handleCsvUpload(file) {
    if (!checkLibrary("Papa")) return;
    showToast(`Processing ${file.name}...`);

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
            const data = results.data;
            const headers = results.meta.fields;

            // Auto-detect columns
            const colRef = headers.find(h => /ref|desired|model/i.test(h)) || headers[1];
            const colStu = headers.find(h => /student|stu|response/i.test(h)) || headers[2];

            const scored = data.map(row => {
                const res = gradeAnswer(row[colRef] || "", row[colStu] || "", 5);
                return {
                    ...row,
                    PredictedScore: res.scoreObj.final.toFixed(2),
                    Confidence: (res.features.feat_avg_semantic * 100).toFixed(0) + "%"
                };
            });

            renderBatchResults(scored);
        }
    });
}

function renderBatchResults(data) {
    const wrap = document.getElementById("batch-table-wrap");
    const resultsSec = document.getElementById("batch-results");
    if (!wrap) return;

    resultsSec.classList.remove("hidden");

    let html = `<table style="width:100%; border-collapse:collapse; font-size:0.85rem;"><thead><tr style="background:rgba(255,255,255,0.05);">`;
    Object.keys(data[0]).forEach(k => html += `<th style="padding:1rem; text-align:left; border-bottom:1px solid var(--border-glass);">${k}</th>`);
    html += `</tr></thead><tbody>`;

    data.forEach(row => {
        html += `<tr style="border-bottom:1px solid var(--border-glass);">`;
        Object.values(row).forEach(v => html += `<td style="padding:1rem;">${v}</td>`);
        html += `</tr>`;
    });
    html += `</tbody></table>`;

    wrap.innerHTML = html;
    showToast("Batch results loaded!");
}

// Script Eval (Docx + Xlsx)
const scriptBtn = document.getElementById("run-script-eval-btn");
const docxInput = document.getElementById("script-file-input");
const xlsxInput = document.getElementById("summary-file-input");

let teacherTranscript = "";
let studentData = [];

if (docxInput) {
    document.getElementById("script-upload-zone").addEventListener("click", () => docxInput.click());
    docxInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (file && checkLibrary("mammoth")) {
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer });
            teacherTranscript = result.value;
            showToast("Teacher transcript refined.");
            checkEvalReady();
        }
    });
}

if (xlsxInput) {
    document.getElementById("summary-upload-zone").addEventListener("click", () => xlsxInput.click());
    xlsxInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file && checkLibrary("XLSX")) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                const bstr = evt.target.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                studentData = XLSX.utils.sheet_to_json(ws);
                showToast(`Loaded ${studentData.length} students.`);
                checkEvalReady();
            };
            reader.readAsBinaryString(file);
        }
    });
}

function checkEvalReady() {
    if (teacherTranscript && studentData.length > 0) {
        scriptBtn.disabled = false;
        scriptBtn.classList.add("pulse");
    }
}

if (scriptBtn) {
    scriptBtn.addEventListener("click", () => {
        showToast("Running full class evaluation...");
        const results = studentData.map(s => {
            const summaryCol = Object.keys(s).find(k => /summary|answer|response/i.test(k)) || "summary";
            const res = gradeAnswer(teacherTranscript, s[summaryCol] || "", 10);
            return {
                Name: s.name || s.student || "Unknown",
                Email: s.emailAddress || s.email || "N/A",
                Score: res.scoreObj.final.toFixed(2),
                Drift: (res.drift.drift_score * 100).toFixed(0) + "%"
            };
        });
        renderBatchResults(results);
    });
}
