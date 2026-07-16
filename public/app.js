const state = {
  currentReview: null,
  history: [],
  loading: false,
  chatLoading: false,
  chatMessages: []
};

const steps = [...document.querySelectorAll(".step")];
const views = [...document.querySelectorAll(".view")];
const reviewForm = document.querySelector("#reviewForm");
const languageInput = document.querySelector("#language");
const codeInput = document.querySelector("#codeInput");
const inputMeta = document.querySelector("#inputMeta");
const submitButton = document.querySelector("#submitButton");
const statusText = document.querySelector("#statusText");
const progressBar = document.querySelector("#progressBar");
const toast = document.querySelector("#toast");
const chatForm = document.querySelector("#chatForm");
const chatInput = document.querySelector("#chatInput");
const chatSubmit = document.querySelector("#chatSubmit");
const chatMessages = document.querySelector("#chatMessages");
const chatContextBadge = document.querySelector("#chatContextBadge");

const scoreLabels = {
  readability: "可読性",
  maintainability: "保守性",
  efficiency: "処理効率",
  bugResistance: "バグの少なさ",
  codeQuality: "コーディング品質"
};

const numberMarks = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"];

const sampleCode = `function calculateTotal(items) {
  let total = 0
  for (let i = 0; i <= items.length; i++) {
    total = total + items[i].price
  }
  console.log(total)
  return total
}`;

steps.forEach((step) => {
  step.addEventListener("click", () => showView(step.dataset.step));
});

reviewForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await startReview();
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await sendChatMessage();
});

codeInput.addEventListener("input", updateInputMeta);
codeInput.addEventListener("input", updateChatContextBadge);

document.querySelector("#loadSample").addEventListener("click", () => {
  languageInput.value = "JavaScript";
  codeInput.value = sampleCode;
  updateInputMeta();
  updateChatContextBadge();
});

languageInput.addEventListener("change", updateChatContextBadge);

document.querySelector("#refreshHistory").addEventListener("click", loadHistory);

document.querySelectorAll("[data-chat-prompt]").forEach((button) => {
  button.addEventListener("click", () => {
    chatInput.value = button.dataset.chatPrompt;
    chatInput.focus();
  });
});

document.querySelector("#themeToggle").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("theme", next);
});

const savedTheme = localStorage.getItem("theme");
if (savedTheme) {
  document.documentElement.dataset.theme = savedTheme;
}

updateInputMeta();
updateChatContextBadge();
loadHistory();

async function startReview() {
  if (state.loading) return;

  setLoading(true);
  setStatus("AIワークフローを実行中です", 35);

  try {
    const response = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: languageInput.value,
        code: codeInput.value
      })
    });

    const payload = await response.json();
    if (!response.ok && response.status !== 202) {
      throw new Error(payload.error || "レビューに失敗しました。");
    }

    state.currentReview = payload;
    renderReview(payload);
    await loadHistory();
    setStatus("レビューが完了しました", 100);
    showView("analysis");
    showToast(payload.notice || "レビュー結果を生成しました。");
  } catch (error) {
    showToast(error.message);
    setStatus("レビューに失敗しました", 12);
  } finally {
    setLoading(false);
  }
}

function renderReview(savedReview) {
  const { review, originalCode } = savedReview;

  document.querySelector("#analysisSummary").textContent =
    review.workflowSummary?.analysisSummary || "分析結果を確認してください。";
  document.querySelector("#errorPredictionList").innerHTML = listItems(buildErrorPredictions(savedReview));

  document.querySelector("#issuesList").innerHTML = review.issues
    .map(
      (issue) => `
        <article class="issue">
          <span class="severity ${escapeHtml(issue.severity)}">${escapeHtml(issue.severity)}</span>
          <div>
            <h3>${escapeHtml(issue.title)}</h3>
            <p class="issue-meta">${escapeHtml(issue.category)} / ${escapeHtml(issue.lineHint)}</p>
            <p>${escapeHtml(issue.description)}</p>
            <p><strong>提案:</strong> ${escapeHtml(issue.suggestion)}</p>
          </div>
        </article>
      `
    )
    .join("");

  document.querySelector("#originalCode").textContent = originalCode;
  document.querySelector("#improvedCode").textContent = review.improvedCode;

  document.querySelector("#reasonList").innerHTML = listItems(review.improvementReasons);
  document.querySelector("#changeList").innerHTML = review.changePoints
    .map(
      (item) => `
        <article class="change-item">
          <p><strong>Before:</strong> ${escapeHtml(item.before)}</p>
          <p><strong>After:</strong> ${escapeHtml(item.after)}</p>
          <p>${escapeHtml(item.reason)}</p>
        </article>
      `
    )
    .join("");

  document.querySelector("#overallScore").textContent = review.scores.overall;
  const learningProfile = buildLearningProfile(savedReview);
  document.querySelector("#difficultyStars").textContent = renderStars(learningProfile.difficulty.level);
  document.querySelector("#difficultyLabel").textContent = learningProfile.difficulty.label;
  document.querySelector("#difficultyReason").textContent = learningProfile.difficulty.reason;
  document.querySelector("#requiredKnowledgeList").innerHTML = learningProfile.requiredKnowledge
    .map((item) => `<li><span aria-hidden="true">○</span>${escapeHtml(item)}</li>`)
    .join("");
  document.querySelector("#roadmapStars").textContent = renderStars(learningProfile.difficulty.level);
  document.querySelector("#learningRoadmapList").innerHTML = learningProfile.learningRoadmap
    .map(
      (item, index) =>
        `<li><span aria-hidden="true">${numberMarks[index] || index + 1}</span>${escapeHtml(item)}</li>`
    )
    .join("");
  document.querySelector("#scoreBars").innerHTML = Object.entries(scoreLabels)
    .map(([key, label]) => {
      const value = review.scores[key] ?? 0;
      return `
        <article class="score-item">
          <div class="score-label">
            <span>${label}</span>
            <span>${value}</span>
          </div>
          <div class="bar-shell" aria-hidden="true">
            <div class="bar-fill" style="width: ${value}%"></div>
          </div>
        </article>
      `;
    })
    .join("");

  document.querySelector("#goodPoints").innerHTML = listItems(review.goodPoints);
  document.querySelector("#improvementPoints").innerHTML = listItems(review.improvementPoints);
  document.querySelector("#learningAdvice").innerHTML = listItems(review.learningAdvice);
  updateChatContextBadge();
}

async function loadHistory() {
  try {
    const response = await fetch("/api/reviews");
    state.history = await response.json();
    renderHistory();
  } catch {
    document.querySelector("#historyList").innerHTML =
      '<p class="summary-strip">履歴を読み込めませんでした。</p>';
  }
}

function renderHistory() {
  const target = document.querySelector("#historyList");

  if (state.history.length === 0) {
    target.innerHTML = '<p class="summary-strip">まだレビュー履歴はありません。</p>';
    return;
  }

  target.innerHTML = state.history
    .map((item) => {
      const date = new Date(item.createdAt).toLocaleString("ja-JP");
      return `
        <article class="history-card">
          <div class="history-meta">
            <span>${escapeHtml(item.language)}</span>
            <span>${date}</span>
            <span>${escapeHtml(item.source)}</span>
          </div>
          <strong>総合スコア ${item.review.scores.overall}</strong>
          <p>${escapeHtml(item.review.workflowSummary.analysisSummary)}</p>
          <button class="ghost-button" type="button" data-history-id="${escapeHtml(item.id)}">再表示</button>
        </article>
      `;
    })
    .join("");

  target.querySelectorAll("[data-history-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const found = state.history.find((item) => item.id === button.dataset.historyId);
      if (found) {
        state.currentReview = found;
        renderReview(found);
        setStatus("履歴からレビューを表示しています", 100);
        showView("analysis");
        appendChatMessage("assistant", "履歴のレビューを表示しました。このレビュー結果について質問できます。");
      }
    });
  });
}

function showView(id) {
  steps.forEach((step) => step.classList.toggle("is-active", step.dataset.step === id));
  views.forEach((view) => view.classList.toggle("is-active", view.id === id));

  const progress = {
    input: 12,
    analysis: 45,
    generation: 70,
    evaluation: 92,
    history: 100
  };

  progressBar.style.width = `${progress[id] || 12}%`;
  updateChatContextBadge();
}

function updateInputMeta() {
  const text = codeInput.value;
  const lines = text ? text.split("\n").length : 0;
  inputMeta.textContent = `${lines} 行 / ${text.length} 文字`;
}

function setLoading(loading) {
  state.loading = loading;
  submitButton.disabled = loading;
  submitButton.textContent = loading ? "レビュー中..." : "レビュー開始";
}

function buildErrorPredictions(savedReview) {
  const { review, originalCode } = savedReview;
  const predictions = [];
  const code = originalCode || "";

  const highRiskIssues = (review.issues || []).filter((issue) =>
    ["high", "medium"].includes(issue.severity)
  );

  highRiskIssues.slice(0, 2).forEach((issue) => {
    predictions.push(`${issue.lineHint}: ${issue.title} が原因で、想定外の入力時に失敗する可能性があります。`);
  });

  if (/<=\s*\w+\.length|<=\s*len\(/.test(code)) {
    predictions.push("配列やリストの末尾を1つ超えて参照し、undefined参照やIndexErrorになる可能性があります。");
  }

  if (/\.\w+/.test(code) && !/if\s*\(|\?\./.test(code)) {
    predictions.push("値がnullやundefinedの場合に、プロパティ参照で実行時エラーになる可能性があります。");
  }

  if (/\bJSON\.parse\b|parseInt|Number\(/.test(code)) {
    predictions.push("入力値の形式が想定と違う場合、変換失敗やNaNによる計算結果の崩れに注意が必要です。");
  }

  if (predictions.length === 0) {
    predictions.push("大きな実行時エラーの兆候は強く出ていません。境界値、空データ、null入力で動作確認してください。");
  }

  return [...new Set(predictions)].slice(0, 4);
}

function buildLearningProfile(savedReview) {
  const { review, originalCode } = savedReview;
  const requiredKnowledge = Array.isArray(review.requiredKnowledge) && review.requiredKnowledge.length
    ? review.requiredKnowledge
    : detectRequiredKnowledge(originalCode);
  const difficulty = review.difficulty || inferDifficulty(originalCode, requiredKnowledge);
  const learningRoadmap = Array.isArray(review.learningRoadmap) && review.learningRoadmap.length
    ? review.learningRoadmap
    : buildLearningRoadmap(originalCode, requiredKnowledge);

  return {
    difficulty,
    requiredKnowledge,
    learningRoadmap
  };
}

function inferDifficulty(code, requiredKnowledge) {
  const lineCount = code.split("\n").length;
  const hasAlgorithm = /bfs|dfs|queue|stack|graph|tree|dp|memo|heap|deque|再帰/i.test(code);
  const hasAsync = /\basync\b|\bawait\b|Promise|fetch\(/.test(code);
  let level = 1;

  if (requiredKnowledge.length >= 4 || lineCount > 35) {
    level = 2;
  }
  if (requiredKnowledge.length >= 6 || lineCount > 80 || hasAlgorithm || hasAsync) {
    level = 3;
  }
  if (lineCount > 150 || /class\s+\w+|extends\s+\w+/.test(code)) {
    level = Math.max(level, 4);
  }

  const labels = ["初心者", "初級", "中級", "上級", "専門"];
  return {
    level,
    label: labels[level - 1],
    reason: `${requiredKnowledge.slice(0, 3).join("、") || "基本構文"}が主な理解ポイントです。`
  };
}

function detectRequiredKnowledge(code) {
  const checks = [
    ["関数", /function\s+\w+|\bdef\s+\w+|=>|\w+\s*\([^)]*\)\s*{/],
    ["変数", /\b(let|const|var)\b|=/],
    ["条件分岐", /\bif\b|\bswitch\b|\belse\b/],
    ["ループ", /\bfor\b|\bwhile\b|forEach|map\(|filter\(|reduce\(/],
    ["配列", /\[[^\]]*\]|\.push\(|\.map\(|\.filter\(|\.length\b|list\(/],
    ["オブジェクト", /\{[\s\S]*:|\.keys\(|\.values\(|dict\(/],
    ["クラス", /\bclass\s+\w+|\bnew\s+\w+/],
    ["非同期処理", /\basync\b|\bawait\b|Promise|fetch\(/],
    ["再帰", /function\s+(\w+)[\s\S]*\1\s*\(|def\s+(\w+)[\s\S]*\2\s*\(/],
    ["BFS", /\bbfs\b|queue|deque|shift\(\)/i],
    ["DFS", /\bdfs\b|stack/i],
    ["例外処理", /\btry\b|\bcatch\b|\bexcept\b/]
  ];
  const found = checks.filter(([, pattern]) => pattern.test(code)).map(([label]) => label);
  return found.length ? [...new Set(found)].slice(0, 8) : ["基本構文"];
}

function buildLearningRoadmap(code, requiredKnowledge) {
  const knowledge = new Set(requiredKnowledge);
  const orderedTopics = [
    ["基本構文", "基本構文"],
    ["変数", "変数"],
    ["条件分岐", "if文"],
    ["ループ", "for文"],
    ["関数", "関数"],
    ["配列", "配列"],
    ["オブジェクト", "オブジェクト"],
    ["クラス", "クラス"],
    ["再帰", "再帰"],
    ["BFS", "BFS"],
    ["DFS", "DFS"],
    ["非同期処理", "非同期処理"],
    ["例外処理", "例外処理"]
  ];
  const roadmap = orderedTopics
    .filter(([key]) => knowledge.has(key))
    .map(([, label]) => label);

  if (!roadmap.includes("基本構文")) {
    roadmap.unshift("基本構文");
  }

  if (/if\s*\(|\bif\b/.test(code) && !roadmap.includes("if文")) {
    roadmap.splice(Math.min(2, roadmap.length), 0, "if文");
  }

  return [...new Set(roadmap)].slice(0, 6);
}

function renderStars(level) {
  const filled = Math.max(1, Math.min(5, Number(level || 1)));
  return `${"★".repeat(filled)}${"☆".repeat(5 - filled)}`;
}

async function sendChatMessage() {
  if (state.chatLoading) return;

  const question = chatInput.value.trim();
  if (!question) {
    showToast("質問を入力してください。");
    return;
  }

  const context = getVisibleCodeContext();
  if (!context.code.trim()) {
    showToast("質問するコードを入力してください。");
    return;
  }

  appendChatMessage("user", question);
  chatInput.value = "";
  setChatLoading(true);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        language: context.language,
        code: context.code,
        review: state.currentReview?.review || null,
        activeView: getActiveViewId(),
        messages: state.chatMessages
      })
    });

    const payload = await response.json();
    if (!response.ok && response.status !== 202) {
      throw new Error(payload.error || "チャットに失敗しました。");
    }

    appendChatMessage("assistant", payload.answer);
    if (payload.notice) {
      showToast(payload.notice);
    }
  } catch (error) {
    appendChatMessage("assistant", error.message);
  } finally {
    setChatLoading(false);
  }
}

function getVisibleCodeContext() {
  const activeView = getActiveViewId();
  const review = state.currentReview;

  if (activeView === "generation" && review?.review?.improvedCode) {
    return {
      label: "比較コード",
      language: review.language,
      code: [`修正前:\n${review.originalCode}`, `改善版:\n${review.review.improvedCode}`].join("\n\n")
    };
  }

  if (review?.originalCode && activeView !== "input") {
    return {
      label: "レビュー済みコード",
      language: review.language,
      code: review.originalCode
    };
  }

  return {
    label: "入力コード",
    language: languageInput.value,
    code: codeInput.value
  };
}

function getActiveViewId() {
  return document.querySelector(".view.is-active")?.id || "input";
}

function updateChatContextBadge() {
  const context = getVisibleCodeContext();
  const lineCount = context.code ? context.code.split("\n").length : 0;
  chatContextBadge.textContent = `${context.label} / ${lineCount}行`;
}

function appendChatMessage(role, text) {
  const message = {
    role,
    text,
    createdAt: new Date().toISOString()
  };
  state.chatMessages.push(message);
  renderChatMessages();
}

function renderChatMessages() {
  chatMessages.innerHTML = state.chatMessages.length
    ? state.chatMessages
        .map(
          (message) => `
            <article class="chat-message ${escapeHtml(message.role)}">
              <p>${formatChatText(message.text)}</p>
            </article>
          `
        )
        .join("")
    : `
        <article class="chat-message assistant">
          <p>表示中のコードについて質問できます。レビュー後は、指摘・改善コード・評価も含めて答えます。</p>
        </article>
      `;

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function setChatLoading(loading) {
  state.chatLoading = loading;
  chatSubmit.disabled = loading;
  chatSubmit.textContent = loading ? "回答中..." : "送信";
}

function setStatus(message, progress) {
  statusText.textContent = message;
  progressBar.style.width = `${progress}%`;
}

function listItems(items = []) {
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function formatChatText(value = "") {
  return escapeHtml(value).replaceAll("\n", "<br>");
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3600);
}
