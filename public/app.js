const state = {
  currentReview: null,
  history: [],
  loading: false
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

const scoreLabels = {
  readability: "可読性",
  maintainability: "保守性",
  efficiency: "処理効率",
  bugResistance: "バグの少なさ",
  codeQuality: "コーディング品質"
};

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

codeInput.addEventListener("input", updateInputMeta);

document.querySelector("#loadSample").addEventListener("click", () => {
  languageInput.value = "JavaScript";
  codeInput.value = sampleCode;
  updateInputMeta();
});

document.querySelector("#refreshHistory").addEventListener("click", loadHistory);

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

function setStatus(message, progress) {
  statusText.textContent = message;
  progressBar.style.width = `${progress}%`;
}

function listItems(items = []) {
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
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
