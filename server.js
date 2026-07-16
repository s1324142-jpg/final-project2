import "dotenv/config";
import express from "express";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 3000);
const dataFile = path.join(__dirname, "data", "reviews.json");

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const reviewSchema = {
  type: "object",
  properties: {
    workflowSummary: {
      type: "object",
      properties: {
        inputSummary: { type: "string" },
        analysisSummary: { type: "string" },
        generationSummary: { type: "string" },
        evaluationSummary: { type: "string" }
      },
      required: ["inputSummary", "analysisSummary", "generationSummary", "evaluationSummary"],
      additionalProperties: false
    },
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          severity: { type: "string", enum: ["high", "medium", "low", "info"] },
          category: { type: "string" },
          lineHint: { type: "string" },
          description: { type: "string" },
          suggestion: { type: "string" }
        },
        required: ["title", "severity", "category", "lineHint", "description", "suggestion"],
        additionalProperties: false
      }
    },
    improvedCode: { type: "string" },
    improvementReasons: {
      type: "array",
      items: { type: "string" }
    },
    changePoints: {
      type: "array",
      items: {
        type: "object",
        properties: {
          before: { type: "string" },
          after: { type: "string" },
          reason: { type: "string" }
        },
        required: ["before", "after", "reason"],
        additionalProperties: false
      }
    },
    scores: {
      type: "object",
      properties: {
        readability: { type: "integer", minimum: 0, maximum: 100 },
        maintainability: { type: "integer", minimum: 0, maximum: 100 },
        efficiency: { type: "integer", minimum: 0, maximum: 100 },
        bugResistance: { type: "integer", minimum: 0, maximum: 100 },
        codeQuality: { type: "integer", minimum: 0, maximum: 100 },
        overall: { type: "integer", minimum: 0, maximum: 100 }
      },
      required: ["readability", "maintainability", "efficiency", "bugResistance", "codeQuality", "overall"],
      additionalProperties: false
    },
    difficulty: {
      type: "object",
      properties: {
        level: { type: "integer", minimum: 1, maximum: 5 },
        label: { type: "string", enum: ["初心者", "初級", "中級", "上級", "専門"] },
        reason: { type: "string" }
      },
      required: ["level", "label", "reason"],
      additionalProperties: false
    },
    requiredKnowledge: {
      type: "array",
      items: { type: "string" }
    },
    learningRoadmap: {
      type: "array",
      items: { type: "string" }
    },
    goodPoints: {
      type: "array",
      items: { type: "string" }
    },
    improvementPoints: {
      type: "array",
      items: { type: "string" }
    },
    learningAdvice: {
      type: "array",
      items: { type: "string" }
    },
    followUpQuestions: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: [
    "workflowSummary",
    "issues",
    "improvedCode",
    "improvementReasons",
    "changePoints",
    "scores",
    "difficulty",
    "requiredKnowledge",
    "learningRoadmap",
    "goodPoints",
    "improvementPoints",
    "learningAdvice",
    "followUpQuestions"
  ],
  additionalProperties: false
};

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/reviews", async (_req, res) => {
  const reviews = await readReviews();
  res.json(reviews);
});

app.get("/api/reviews/:id", async (req, res) => {
  const reviews = await readReviews();
  const review = reviews.find((item) => item.id === req.params.id);

  if (!review) {
    res.status(404).json({ error: "Review not found." });
    return;
  }

  res.json(review);
});

app.post("/api/reviews", async (req, res) => {
  const { language, code } = req.body || {};

  if (!language || typeof language !== "string") {
    res.status(400).json({ error: "プログラミング言語を選択してください。" });
    return;
  }

  if (!code || typeof code !== "string" || code.trim().length < 3) {
    res.status(400).json({ error: "レビューするコードを入力してください。" });
    return;
  }

  const apiKey = getOpenAiApiKey();

  if (!apiKey) {
    const fallback = createLocalReview(language, code);
    const saved = await saveReview(language, code, fallback, "local-fallback");
    res.status(202).json({
      ...saved,
      notice: "OPENAI_API_KEY が未設定のため、簡易レビューを返しました。.env に実際の API キーを設定すると AI レビューを実行できます。"
    });
    return;
  }

  try {
    const aiReview = await requestOpenAiReview(language, code, apiKey);
    const saved = await saveReview(language, code, aiReview, "openai");
    res.status(201).json(saved);
  } catch (error) {
    console.error(error);
    res.status(502).json({
      error: "AIレビューの実行に失敗しました。"
    });
  }
});

app.post("/api/chat", async (req, res) => {
  const { question, language, code, review, activeView, messages } = req.body || {};

  if (!question || typeof question !== "string" || question.trim().length < 2) {
    res.status(400).json({ error: "質問を入力してください。" });
    return;
  }

  if (!code || typeof code !== "string" || code.trim().length < 3) {
    res.status(400).json({ error: "質問するコードを入力するか、レビュー結果を表示してください。" });
    return;
  }

  const apiKey = getOpenAiApiKey();

  if (!apiKey) {
    res.status(202).json({
      answer: createLocalChatAnswer({
        question,
        language,
        code,
        review,
        activeView
      }),
      source: "local-fallback",
      notice: "OPENAI_API_KEY が未設定のため、表示中コードとレビュー結果から簡易回答しました。"
    });
    return;
  }

  try {
    const answer = await requestOpenAiChatAnswer({
      question,
      language,
      code,
      review,
      activeView,
      messages,
      apiKey
    });
    res.status(201).json({ answer, source: "openai" });
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: "AIチャットの実行に失敗しました。" });
  }
});

function getOpenAiApiKey() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const placeholderKeys = new Set(["sk-your-api-key", "your_api_key_here", "ここにあなたのAPIキー"]);

  if (!apiKey || placeholderKeys.has(apiKey)) {
    return "";
  }

  return apiKey;
}

async function requestOpenAiReview(language, code, apiKey) {
  const model = process.env.OPENAI_MODEL || "gpt-5.5";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: [
                "あなたはプログラミング学習者向けのコードレビュー講師です。",
                "入力、分析、生成、評価の4段階が利用者に伝わるように回答してください。",
                "指摘は初心者が理解できる日本語で、具体的かつ実行可能にします。",
                "セキュリティ上の注意点は断定しすぎず、コードから判断できる範囲に限定してください。",
                "改善コードは元の意図を保ち、過度な設計変更を避けてください。",
                "難易度は1から5で判定し、必要知識はコード理解に必要な概念を短い日本語名で列挙してください。",
                "学習ロードマップは、このコードを理解するために学ぶべき順番で、基礎から応用へ5個前後の概念名を並べてください。"
              ].join("\n")
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `言語: ${language}\n\nレビュー対象コード:\n${code}`
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "code_review_workflow",
          schema: reviewSchema,
          strict: true
        }
      }
    })
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error?.message || "OpenAI API request failed.");
  }

  const outputText = payload.output_text || extractOutputText(payload);
  if (!outputText) {
    throw new Error("AI response did not include output text.");
  }

  return JSON.parse(outputText);
}

async function requestOpenAiChatAnswer({ question, language, code, review, activeView, messages, apiKey }) {
  const model = process.env.OPENAI_MODEL || "gpt-5.5";
  const recentMessages = Array.isArray(messages) ? messages.slice(-6) : [];
  const reviewContext = review
    ? {
        analysisSummary: review.workflowSummary?.analysisSummary,
        issues: review.issues,
        improvedCode: review.improvedCode,
        changePoints: review.changePoints,
        scores: review.scores,
        learningAdvice: review.learningAdvice
      }
    : null;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: [
                "あなたはプログラミング学習者を支援するコード解説チャットです。",
                "利用者が今画面に表示しているコードとレビュー結果だけを根拠に、日本語で具体的に答えてください。",
                "必要なら行番号や該当箇所を示しますが、コードにない事実は推測として明示してください。",
                "回答は短めにし、最後に次に試す操作や確認ポイントを1つだけ添えてください。",
                "改善コードを出す場合は、元の意図を保ち、過度な設計変更を避けてください。"
              ].join("\n")
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify(
                {
                  activeView,
                  language,
                  visibleCode: code,
                  reviewContext,
                  recentMessages,
                  question
                },
                null,
                2
              )
            }
          ]
        }
      ]
    })
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error?.message || "OpenAI API request failed.");
  }

  const outputText = payload.output_text || extractOutputText(payload);
  if (!outputText) {
    throw new Error("AI response did not include output text.");
  }

  return outputText.trim();
}

function extractOutputText(payload) {
  return payload.output
    ?.flatMap((item) => item.content || [])
    .find((content) => content.type === "output_text")?.text;
}

async function readReviews() {
  try {
    const raw = await fs.readFile(dataFile, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function saveReview(language, code, review, source) {
  const reviews = await readReviews();
  const saved = {
    id: randomUUID(),
    source,
    language,
    originalCode: code,
    createdAt: new Date().toISOString(),
    review
  };

  reviews.unshift(saved);
  await fs.mkdir(path.dirname(dataFile), { recursive: true });
  await fs.writeFile(dataFile, JSON.stringify(reviews.slice(0, 30), null, 2));
  return saved;
}

function createLocalReview(language, code) {
  const lines = code.split("\n");
  const longLines = lines
    .map((line, index) => ({ line, index }))
    .filter((item) => item.line.length > 100);
  const hasConsole = /\bconsole\.log\b|print\(|System\.out\.println/.test(code);
  const hasTodo = /TODO|FIXME/i.test(code);
  const issueCount = longLines.length + Number(hasConsole) + Number(hasTodo);
  const baseScore = Math.max(55, 88 - issueCount * 8);

  const issues = [];

  if (longLines.length > 0) {
    issues.push({
      title: "長い行があります",
      severity: "medium",
      category: "可読性",
      lineHint: `${longLines[0].index + 1}行目付近`,
      description: "1行が長いと処理のまとまりを把握しづらくなります。",
      suggestion: "条件式や引数を複数行に分け、名前のある変数へ切り出してください。"
    });
  }

  if (hasConsole) {
    issues.push({
      title: "デバッグ出力が残っている可能性があります",
      severity: "low",
      category: "保守性",
      lineHint: "コード全体",
      description: "学習中は有効ですが、提出用や本番コードでは不要な出力になることがあります。",
      suggestion: "必要なログだけを残し、処理結果の確認はテストに置き換えてください。"
    });
  }

  if (hasTodo) {
    issues.push({
      title: "未完了コメントがあります",
      severity: "info",
      category: "品質",
      lineHint: "コメント付近",
      description: "TODOやFIXMEは作業漏れのサインになることがあります。",
      suggestion: "対応内容をタスク化するか、具体的な修正方針を書き足してください。"
    });
  }

  if (issues.length === 0) {
    issues.push({
      title: "AIキー未設定のため詳細解析は未実行です",
      severity: "info",
      category: "実行環境",
      lineHint: "全体",
      description: "OPENAI_API_KEY を設定すると構文、バグ、設計、効率まで踏み込んだレビューを実行できます。",
      suggestion: ".env に API キーを設定して、もう一度レビューを開始してください。"
    });
  }

  return {
    workflowSummary: {
      inputSummary: `${language} のコード ${lines.length} 行を受け取りました。`,
      analysisSummary: "ローカルの簡易ルールで可読性と提出前チェックを確認しました。",
      generationSummary: "APIキー未設定のため、改善コードは元コードを保持しています。",
      evaluationSummary: "簡易評価として行の長さ、デバッグ出力、未完了コメントを採点しました。"
    },
    issues,
    improvedCode: code,
    improvementReasons: [
      "AIキー設定後は、構文エラー、バグの可能性、命名、重複、効率、セキュリティ観点まで含めた改善案を生成します。"
    ],
    changePoints: [
      {
        before: "元コード",
        after: "AI改善コード",
        reason: "OPENAI_API_KEY 未設定のため、現在は差分生成を行っていません。"
      }
    ],
    scores: {
      readability: baseScore,
      maintainability: baseScore,
      efficiency: Math.min(92, baseScore + 4),
      bugResistance: Math.max(50, baseScore - 5),
      codeQuality: baseScore,
      overall: baseScore
    },
    difficulty: createLocalDifficulty(code),
    requiredKnowledge: detectRequiredKnowledge(code),
    learningRoadmap: createLocalLearningRoadmap(code),
    goodPoints: ["コードを入力してレビューの流れを実行できています。"],
    improvementPoints: issues.map((issue) => issue.suggestion),
    learningAdvice: [
      "関数の責務を小さく分ける練習をしてください。",
      "変数名で意図を表現し、コメントに頼りすぎないコードを目指してください。",
      "小さな入力例で期待結果を確認するテストを書く習慣をつけてください。"
    ],
    followUpQuestions: [
      "このコードで一番不安な動作はどこですか。",
      "処理速度と読みやすさのどちらを優先したいですか。"
    ]
  };
}

function createLocalDifficulty(code) {
  const knowledge = detectRequiredKnowledge(code);
  const hasNestedLoops = /for\s*\([^)]*\)[\s\S]*for\s*\(/.test(code) || /while\s*\([^)]*\)[\s\S]*while\s*\(/.test(code);
  const hasAdvancedAlgorithm = /queue|stack|bfs|dfs|dp|memo|graph|tree|heap|deque/i.test(code);
  const hasAsync = /\basync\b|\bawait\b|Promise|fetch\(/.test(code);
  const lineCount = code.split("\n").length;
  let level = 1;

  if (knowledge.length >= 4 || lineCount > 35 || hasNestedLoops) {
    level = 2;
  }
  if (knowledge.length >= 6 || lineCount > 80 || hasAdvancedAlgorithm || hasAsync) {
    level = 3;
  }
  if (lineCount > 150 || /class\s+\w+|extends\s+\w+|implements\s+\w+/.test(code)) {
    level = Math.max(level, 4);
  }

  const labels = ["初心者", "初級", "中級", "上級", "専門"];
  return {
    level,
    label: labels[level - 1],
    reason: `${knowledge.slice(0, 3).join("、") || "基本構文"}を理解できれば読み進められるコードです。`
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

function createLocalLearningRoadmap(code) {
  const knowledge = new Set(detectRequiredKnowledge(code));
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

  return [...new Set(roadmap)].slice(0, 6);
}

function createLocalChatAnswer({ question, language, code, review, activeView }) {
  const lines = code.split("\n");
  const issues = Array.isArray(review?.issues) ? review.issues : [];
  const lowerQuestion = question.toLowerCase();
  const questionWantsFix = /修正|改善|直|fix|better|リファクタ/.test(lowerQuestion);
  const questionWantsBug = /バグ|エラー|原因|bug|error|例外|動か/.test(lowerQuestion);
  const contextLabel = activeView === "generation" ? "改善コード表示" : "現在の表示";

  if (issues.length > 0 && (questionWantsBug || questionWantsFix)) {
    const issue = issues[0];
    return [
      `${contextLabel}の ${language || "コード"} について、まず「${issue.title}」を確認するとよさそうです。`,
      `${issue.lineHint} が対象で、理由は ${issue.description}`,
      `具体的には ${issue.suggestion}`,
      "OPENAI_API_KEY を設定すると、この質問に対して表示中コードを読んだ詳しい会話回答を返せます。"
    ].join("\n\n");
  }

  if (review?.workflowSummary?.analysisSummary) {
    return [
      `${contextLabel}のコードは ${lines.length} 行です。レビュー結果では「${review.workflowSummary.analysisSummary}」と分析されています。`,
      issues.length > 0
        ? `目立つ確認ポイントは「${issues[0].title}」です。${issues[0].suggestion}`
        : "レビュー上の大きな指摘はまだ見つかっていません。",
      "質問を「何行目の処理が分からない」「この改善案の理由は？」のように具体化すると、より答えやすくなります。"
    ].join("\n\n");
  }

  return [
    `${language || "この"}コードは ${lines.length} 行あります。まだAIレビュー結果がないため、チャットは入力中コードだけを手がかりに簡易回答しています。`,
    "先に「レビュー開始」を押すと、指摘・改善コード・スコアを文脈に含めて質問できます。",
    "OPENAI_API_KEY を設定すると、表示中コードに対する詳しいAI回答を利用できます。"
  ].join("\n\n");
}

startServer(port);

function startServer(candidatePort, attemptsLeft = 10) {
  const server = app.listen(candidatePort, () => {
    console.log(`AI code review app is running on http://localhost:${candidatePort}`);
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" && attemptsLeft > 0) {
      const nextPort = candidatePort + 1;
      console.warn(`Port ${candidatePort} is already in use. Trying ${nextPort}...`);
      startServer(nextPort, attemptsLeft - 1);
      return;
    }

    console.error(error);
    process.exitCode = 1;
  });
}
