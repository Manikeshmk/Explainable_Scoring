/**
 * scorer.js — In-browser ASAG Scoring Engine (Two-Stage)
 * * FIXES APPLIED:
 * 1. Moved to strict 2-Stage logic (Stage 1 Floor + Stage 2 Paper Method).
 * 2. Encapsulated ruleBasedScore to return metadata, fixing batch data leaks.
 * 3. Aligned semantic similarity to use Plain TF (no IDF) to fix Zero-IDF low scores.
 */

// ─────────────────────────────────────────────────────────────
// 1. TEXT UTILITIES
// ─────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "shall",
  "can",
  "to",
  "of",
  "in",
  "for",
  "on",
  "with",
  "at",
  "by",
  "from",
  "as",
  "into",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "between",
  "out",
  "off",
  "over",
  "under",
  "and",
  "but",
  "or",
  "nor",
  "so",
  "yet",
  "both",
  "either",
  "neither",
  "not",
  "no",
  "that",
  "this",
  "these",
  "those",
  "which",
  "who",
  "whom",
  "what",
  "how",
  "when",
  "where",
  "why",
  "if",
  "because",
  "while",
  "although",
  "though",
  "since",
  "unless",
  "until",
  "than",
  "i",
  "you",
  "he",
  "she",
  "it",
  "we",
  "they",
  "me",
  "him",
  "her",
  "us",
  "them",
  "my",
  "your",
  "his",
  "its",
  "our",
  "their",
  "mine",
  "yours",
  "ours",
  "theirs",
  "its",
  "all",
  "each",
  "any",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "only",
  "own",
  "same",
  "than",
  "too",
  "very",
  "just",
  "about",
  "above",
  "after",
  "again",
  "also",
  "back",
  "being",
  "between",
  "each",
  "here",
  "however",
  "into",
  "like",
  "many",
  "make",
  "much",
  "now",
  "only",
  "other",
  "our",
  "s",
  "t",
  "can",
  "will",
  "just",
  "don",
  "should",
  "now",
  "d",
  "m",
  "o",
  "re",
  "ve",
  "y",
]);

const COMMON_VERBS = new Set([
  "use",
  "used",
  "uses",
  "using",
  "make",
  "made",
  "makes",
  "making",
  "get",
  "gets",
  "got",
  "give",
  "gives",
  "gave",
  "take",
  "takes",
  "took",
  "come",
  "goes",
  "went",
  "see",
  "seen",
  "look",
  "looked",
  "looks",
  "know",
  "knew",
  "show",
  "shows",
  "shown",
  "need",
  "needs",
  "want",
  "let",
  "like",
  "help",
  "call",
  "called",
  "keep",
  "kept",
  "put",
  "seem",
  "seems",
  "felt",
  "feel",
  "tell",
  "told",
  "mean",
  "means",
  "provide",
  "provides",
  "include",
  "includes",
  "contain",
  "contains",
  "allow",
  "allows",
  "require",
  "requires",
  "become",
  "becomes",
  "refer",
  "refers",
  "result",
  "results",
  "occur",
  "occurs",
  "describe",
  "describes",
  "define",
  "defines",
  "explain",
  "explains",
  "involve",
  "involves",
  "perform",
  "performs",
  "produce",
  "produces",
  "increase",
  "decrease",
  "change",
  "changes",
  "lead",
  "leads",
  "work",
  "works",
  "move",
  "moves",
  "form",
  "forms",
  "pass",
  "passes",
  "start",
  "starts",
  "begin",
  "begins",
  "end",
  "ends",
  "cause",
  "causes",
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function tokenizeFiltered(text) {
  return tokenize(text).filter((t) => !STOPWORDS.has(t));
}

// ─────────────────────────────────────────────────────────────
// 2. SIMILARITY METRICS
// ─────────────────────────────────────────────────────────────

function jaccardSimilarity(text1, text2) {
  const set1 = new Set(tokenize(text1));
  const set2 = new Set(tokenize(text2));
  if (set1.size === 0 || set2.size === 0) return 0;
  const intersection = [...set1].filter((t) => set2.has(t)).length;
  const union = new Set([...set1, ...set2]).size;
  return intersection / union;
}

function editSimilarity(text1, text2) {
  const a = text1.toLowerCase();
  const b = text2.toLowerCase();
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const m = a.length,
    n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return 1 - dp[m][n] / Math.max(m, n);
}

/**
 * Plain TF Cosine Similarity (Stf Proxy)
 * Avoids Zero-IDF bug by ignoring corpus-wide frequency for 1v1 comparison.
 */
function tfCosineSim(text1, text2) {
  const toks1 = tokenize(text1);
  const toks2 = tokenize(text2);
  if (!toks1.length || !toks2.length) return 0;

  const tf1 = {},
    tf2 = {};
  for (const t of toks1) tf1[t] = (tf1[t] || 0) + 1;
  for (const t of toks2) tf2[t] = (tf2[t] || 0) + 1;

  const allTerms = new Set([...Object.keys(tf1), ...Object.keys(tf2)]);
  let dot = 0,
    mag1 = 0,
    mag2 = 0;
  for (const t of allTerms) {
    const v1 = tf1[t] || 0;
    const v2 = tf2[t] || 0;
    dot += v1 * v2;
    mag1 += v1 * v1;
    mag2 += v2 * v2;
  }
  if (!mag1 || !mag2) return 0;
  return dot / (Math.sqrt(mag1) * Math.sqrt(mag2));
}

// ─────────────────────────────────────────────────────────────
// 3.5 SEMANTIC DRIFT ANALYSIS
// ─────────────────────────────────────────────────────────────

/**
 * Compute semantic drift: how much student answer deviates from reference
 *
 * Drift Score (0-1): 0 = perfect alignment, 1 = complete topic shift
 * Components:
 * - Missing concepts: key reference terms not in student answer (high penalty)
 * - Over-explained: extra concepts introduced (low penalty)
 * - Topic consistency: vocabulary overlap with reference
 */
function computeSemanticDrift(referenceAnswer, studentAnswer, refTerms = null) {
  if (!referenceAnswer.trim() || !studentAnswer.trim()) {
    return {
      drift_score: 1.0,
      concept_coverage: 0.0,
      topic_consistency: 0.0,
      missing_concepts_count: 0,
      over_explained_count: 0,
      missing_concepts: [],
      over_explained_concepts: [],
    };
  }

  // Extract tokens for analysis
  const refTokens = new Set(tokenize(referenceAnswer));
  const stuTokens = new Set(tokenize(studentAnswer));

  // Get reference terms if not provided
  if (!refTerms) {
    refTerms = extractTechnicalTerms(referenceAnswer);
  }

  // Missing concepts: reference terms not in student answer
  const missing = refTerms.filter((t) => !stuTokens.has(t));
  const missingCount = missing.length;

  // Over-explained: student used technical terms not in reference
  const stuTerms = extractTechnicalTerms(studentAnswer);
  const over = stuTerms.filter((t) => !refTerms.includes(t));
  const overCount = over.length;

  // Concept coverage: what percentage of reference concepts did student cover?
  const coveredCount = refTerms.length - missingCount;
  const conceptCoverage =
    refTerms.length > 0 ? coveredCount / refTerms.length : 0.0;

  // Topic consistency: vocabulary overlap with reference
  const intersection = [...refTokens].filter((t) => stuTokens.has(t)).length;
  const topicConsistency =
    refTokens.size > 0 ? intersection / refTokens.size : 0.0;

  // Drift formula:
  // Missing critical concepts = high drift
  // Over-explained but off-topic = moderate drift
  // Going completely off-topic = high drift
  const missingPenalty =
    refTerms.length > 0 ? missingCount / refTerms.length : 0.0;
  const overPenalty =
    (refTerms.length > 0 ? overCount / (refTerms.length + 1) : 0.0) * 0.3; // Lower weight

  const driftScore = Math.min(
    1.0,
    missingPenalty + overPenalty * (1.0 - topicConsistency),
  );

  return {
    drift_score: Math.round(driftScore * 1000) / 1000,
    concept_coverage: Math.round(conceptCoverage * 1000) / 1000,
    topic_consistency: Math.round(topicConsistency * 1000) / 1000,
    missing_concepts_count: missingCount,
    over_explained_count: overCount,
    missing_concepts: missing.slice(0, 5),
    over_explained_concepts: over.slice(0, 5),
  };
}

// ─────────────────────────────────────────────────────────────
// 3. ANCHOR EXTRACTION & FEATURES
// ─────────────────────────────────────────────────────────────

function extractTechnicalTerms(text) {
  const tokens = tokenize(text);
  const seen = new Set();
  const terms = [];
  for (const t of tokens) {
    if (t.length < 4 || STOPWORDS.has(t) || COMMON_VERBS.has(t)) continue;
    if (!seen.has(t)) {
      seen.add(t);
      terms.push(t);
    }
  }
  return terms;
}

function computeFeatures(referenceAnswer, studentAnswer, numAnchors = 5) {
  const anchorsData = extractAnchors(referenceAnswer, numAnchors);
  if (!anchorsData.length || !studentAnswer.trim()) {
    return {
      feat_avg_semantic: 0,
      feat_max_semantic: 0,
      feat_anchors_covered: 0,
      feat_avg_jaccard: 0,
      feat_avg_edit: 0,
      anchors: anchorsData.map((a) => (typeof a === "string" ? a : a.text)),
    };
  }
  // Extract text from anchor objects (new anchors return {text, position, index})
  const anchorTexts = anchorsData.map((a) =>
    typeof a === "string" ? a : a.text,
  );

  const semanticScores = anchorTexts.map((a) => tfCosineSim(studentAnswer, a));
  const jaccardScores = anchorTexts.map((a) =>
    jaccardSimilarity(studentAnswer, a),
  );
  const editScores = anchorTexts.map((a) => editSimilarity(studentAnswer, a));

  return {
    feat_avg_semantic:
      semanticScores.reduce((a, b) => a + b, 0) / anchorTexts.length,
    feat_max_semantic: Math.max(...semanticScores),
    feat_anchors_covered:
      semanticScores.filter(
        (s, i) =>
          s >= 0.35 ||
          studentAnswer.toLowerCase().includes(anchorTexts[i].toLowerCase()),
      ).length / anchorTexts.length,
    feat_avg_jaccard:
      jaccardScores.reduce((a, b) => a + b, 0) / anchorTexts.length,
    feat_avg_edit: editScores.reduce((a, b) => a + b, 0) / anchorTexts.length,
    anchors: anchorTexts,
  };
}

// ─────────────────────────────────────────────────────────────
// 4. THE TWO-STAGE ENGINE
// ─────────────────────────────────────────────────────────────

/**
 * STAGE 1: Rule-Based Floor
 * Returns metadata object to prevent data leaks in batch processing.
 */
function ruleBasedScore(referenceAnswer, studentAnswer, maxScore = 5) {
  if (!referenceAnswer.trim() || !studentAnswer.trim())
    return { score: 0, matchedCount: 0, totalCount: 0 };

  const refTerms = extractTechnicalTerms(referenceAnswer);
  if (refTerms.length === 0)
    return { score: 0, matchedCount: 0, totalCount: 0 };

  const stuAllTokens = new Set(tokenize(studentAnswer));
  const matchedTerms = refTerms.filter((t) => stuAllTokens.has(t));

  // For very long references (scripts), we only expect the summary to cover the most important terms.
  // We use a non-linear scaling if ref is way longer than student.
  const refWords = referenceAnswer.split(/\s+/).length;
  const stuWords = studentAnswer.split(/\s+/).length;
  
  let ratio = matchedTerms.length / refTerms.length;
  
  if (refWords > 1000 && stuWords < 200) {
      // Summary mode: if student covers 30% of technical terms from a 5000w script, that's excellent density.
      ratio = Math.min(1.0, ratio * 3.3); 
  }

  return {
    score: ratio * maxScore,
    matchedCount: matchedTerms.length,
    totalCount: refTerms.length,
  };
}

/**
 * STAGE 2: Paper Method (PMC12171532)
 */
function paperGradingScore(referenceAnswer, studentAnswer, maxScore = 5) {
  if (!referenceAnswer.trim() || !studentAnswer.trim()) return 0;

  const Sj = jaccardSimilarity(referenceAnswer, studentAnswer);
  const Se = editSimilarity(referenceAnswer, studentAnswer);
  const Sc = tfCosineSim(referenceAnswer, studentAnswer);
  const Sw = (() => {
    const refKw = tokenizeFiltered(referenceAnswer);
    const stuKw = tokenizeFiltered(studentAnswer);
    
    // Summary handling: if student is much shorter than ref, don't penalize harshly if density is high.
    if (refKw.length > 500 && stuKw.length < 150) {
        return Math.min(1.0, (stuKw.length * 5) / refKw.length); // Adjusted for summary
    }
    
    return stuKw.length === 0 ? 0 : Math.min(1.0, refKw.length / stuKw.length);
  })();
  const Stf = Sc; // Using TF Cosine as Semantic proxy

  const Cnlp = Math.min(
    1.0,
    Math.max(0.0, 0.15 * Sj + 0.05 * Se + 0.15 * Sc + 0.15 * Sw),
  );
  const C = Math.min(1.0, Math.max(0.0, 0.5 * Stf + 0.5 * Cnlp));

  let F = Stf < 0.2 ? 0.0 : Stf >= 0.9 && Sw >= 0.85 ? 1.0 : C;
  
  // High density bonus for summaries
  const refWords = referenceAnswer.split(/\s+/).length;
  const stuWords = studentAnswer.split(/\s+/).length;
  if (refWords > 1000 && stuWords < 150 && Stf > 0.4) {
      F = Math.min(1.0, F * 1.5);
  }

  return F * maxScore;
}

function predictScore(referenceAnswer, studentAnswer, features, maxScore = 5) {
  const s1 = ruleBasedScore(referenceAnswer, studentAnswer, maxScore);
  const s2 = paperGradingScore(referenceAnswer, studentAnswer, maxScore);
  return {
    stage1: s1.score,
    stage2: s2,
    final: Math.min(maxScore, s1.score + s2),
    matchedTerms: s1.matchedCount,
    totalTerms: s1.totalCount,
  };
}

// ─────────────────────────────────────────────────────────────
// 5. EXPLANATION & VISUALS
// ─────────────────────────────────────────────────────────────

function shapValues(features, maxScore = 5) {
  const BASELINE = 0.4;
  const weights = {
    feat_avg_semantic: 0.5,
    feat_max_semantic: 0.15,
    feat_anchors_covered: 0.15,
    feat_avg_jaccard: 0.15,
    feat_avg_edit: 0.05,
  };
  const shap = {};
  for (let k in weights)
    shap[k] = (features[k] - BASELINE) * weights[k] * maxScore;
  return shap;
}

function generateExplanation(
  scoreObj,
  features,
  drift,
  shapVals,
  maxScore = 5,
) {
  const score = scoreObj.final;
  const pct = score / maxScore;
  const sections = [];

  // Verdict
  let overall =
    pct >= 0.85
      ? `Excellent! You scored <strong>${score.toFixed(2)}/${maxScore}</strong>.`
      : pct >= 0.65
        ? `Good. You scored <strong>${score.toFixed(2)}/${maxScore}</strong>.`
        : pct >= 0.4
          ? `Partially correct: <strong>${score.toFixed(2)}/${maxScore}</strong>.`
          : `Needs improvement: <strong>${score.toFixed(2)}/${maxScore}</strong>.`;
  sections.push({ icon: "🎯", text: overall });

  // Technical match data
  const matched = scoreObj.matchedTerms || 0;
  const total = scoreObj.totalTerms || 0;
  if (total > 0) {
    sections.push({
      icon: "🔍",
      text: `Technical Term Check: Your answer included <strong>${matched}</strong> out of <strong>${total}</strong> key terms from the reference.`,
      sub: true,
    });
  }

  // Semantic Drift Analysis
  if (drift) {
    const driftPct = Math.round((1 - drift.drift_score) * 100);
    const coverage = Math.round(drift.concept_coverage * 100);

    if (drift.drift_score > 0.5) {
      sections.push({
        icon: "📍",
        text: `<strong>Semantic Drift Alert:</strong> Your answer drifts ${Math.round(drift.drift_score * 100)}% from the reference.`,
        sub: true,
      });
      if (drift.missing_concepts_count > 0) {
        sections.push({
          icon: "❌",
          text: `Missing ${drift.missing_concepts_count} key concept(s): <strong>${drift.missing_concepts.join(", ")}</strong>`,
          sub: true,
        });
      }
    } else {
      sections.push({
        icon: "✅",
        text: `Good topic alignment: You covered <strong>${coverage}%</strong> of key concepts.`,
        sub: true,
      });
    }
  }

  // Meaning & Vocab
  if (features.feat_avg_semantic >= 0.55)
    sections.push({
      icon: "✅",
      text: `Strong meaning match (${Math.round(features.feat_avg_semantic * 100)}%).`,
    });
  else sections.push({ icon: "⚠️", text: `Meaning match could be stronger.` });

  const tips = [];
  if (matched / total < 0.7)
    tips.push("Include more key terminology found in the reference.");
  if (features.feat_avg_semantic < 0.5)
    tips.push("Focus on the core concept more clearly.");
  if (drift && drift.drift_score > 0.4)
    tips.push(
      `Address missing concepts: ${drift.missing_concepts.slice(0, 2).join(", ")}`,
    );

  return { sections, tips };
}

function calculateSentenceAttributions(
  referenceAnswer,
  studentAnswer,
  maxScore,
) {
  const sentences = studentAnswer
    .replace(/([.?!])\s*(?=[A-Z])/g, "$1|")
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (sentences.length === 0) return [];
  const fullScore = predictScore(
    referenceAnswer,
    studentAnswer,
    computeFeatures(referenceAnswer, studentAnswer),
    maxScore,
  ).final;
  return sentences.map((s) => {
    const score = predictScore(
      referenceAnswer,
      s,
      computeFeatures(referenceAnswer, s),
      maxScore,
    ).final;
    return {
      text: s,
      score: score,
      attribution: score - fullScore / sentences.length,
    };
  });
}

function calculateConceptClusters(referenceAnswer, studentAnswer, anchors) {
  return anchors.map((a) => {
    const sim = tfCosineSim(studentAnswer, a);
    return {
      label: a,
      radius: 20 + a.split(" ").length * 10,
      covered:
        sim >= 0.35 || studentAnswer.toLowerCase().includes(a.toLowerCase()),
      similarity: sim,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// 6. TIMELINE & ANCHOR ANALYSIS
// ─────────────────────────────────────────────────────────────

function extractAnchors(referenceText, maxAnchors = 8) {
  /**
   * Extract meaningful anchors/snippets from reference text.
   * Anchors are sentences containing technical concepts.
   * Returns array of {text, position: 0-100, index}
   */
  // Split into sentences
  const sentences = referenceText
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length === 0) return [];

  // Filter sentences with technical terms (> 15 chars)
  const anchorsRaw = [];
  sentences.forEach((sent, idx) => {
    if (sent.length > 15) {
      const terms = extractTechnicalTerms(sent);
      if (terms.length >= 1) {
        anchorsRaw.push({
          text: sent,
          sentenceIndex: idx,
          techTerms: terms,
        });
      }
    }
  });

  if (anchorsRaw.length === 0) return [];

  // Select evenly distributed anchors if too many
  let selectedAnchors = anchorsRaw;
  if (anchorsRaw.length > maxAnchors) {
    selectedAnchors = [];
    const step = anchorsRaw.length / maxAnchors;
    for (let i = 0; i < maxAnchors; i++) {
      selectedAnchors.push(anchorsRaw[Math.floor(i * step)]);
    }
  }

  // Calculate position (0-100) in document
  const totalSentences = sentences.length;
  return selectedAnchors.map((anchor, idx) => ({
    text: anchor.text,
    position: Math.round(
      (anchor.sentenceIndex / Math.max(1, totalSentences - 1)) * 100,
    ),
    index: idx,
    techTerms: anchor.techTerms,
  }));
}

function computeTimelineDrift(referenceText, studentText) {
  /**
   * Compute semantic drift analysis over time.
   * Extracts anchors from reference and measures similarity with student text.
   * Returns timeline data for visualization: {timeline, averageDrift, anchorCount}
   */
  const anchors = extractAnchors(referenceText);
  if (anchors.length === 0) {
    return {
      timeline: [],
      averageDrift: 0.0,
      anchorCount: 0,
    };
  }

  const timeline = [];
  const driftScores = [];

  // For each anchor, calculate similarity with complete student text
  anchors.forEach((anchor) => {
    // Compute TF-based similarity between anchor and student text
    const anchorText = typeof anchor === "string" ? anchor : anchor.text;
    const similarity = tfCosineSim(anchorText, studentText);
    const drift = 1.0 - similarity; // drift = opposite of similarity

    driftScores.push(drift);
    timeline.push({
      position: anchor.position,
      similarity: Math.round(similarity * 1000) / 1000,
      drift: Math.round(drift * 1000) / 1000,
    });
  });

  const averageDrift =
    driftScores.length > 0
      ? driftScores.reduce((a, b) => a + b, 0) / driftScores.length
      : 0.0;

  return {
    timeline,
    averageDrift: Math.round(averageDrift * 1000) / 1000,
    anchorCount: anchors.length,
  };
}

// ─────────────────────────────────────────────────────────────

function gradeAnswer(referenceAnswer, studentAnswer, maxScore = 5) {
  const features = computeFeatures(referenceAnswer, studentAnswer);
  const scoreObj = predictScore(
    referenceAnswer,
    studentAnswer,
    features,
    maxScore,
  );
  const drift = computeSemanticDrift(
    referenceAnswer,
    studentAnswer,
    features.anchors,
  );

  // ── Compute timeline drift analysis ──
  const timeline = computeTimelineDrift(referenceAnswer, studentAnswer);

  // Note: Drift is used for visualization and feedback only, not for scoring
  // Final score remains unchanged based on Stage1 + Stage2 only

  const shap = shapValues(features, maxScore);
  return {
    scoreObj,
    features,
    drift,
    timeline,
    shap,
    explanation: generateExplanation(scoreObj, features, drift, shap, maxScore),
    sentences: calculateSentenceAttributions(
      referenceAnswer,
      studentAnswer,
      maxScore,
    ),
    clusters: calculateConceptClusters(
      referenceAnswer,
      studentAnswer,
      features.anchors,
    ),
  };
}

if (typeof module !== "undefined") module.exports = { gradeAnswer };
