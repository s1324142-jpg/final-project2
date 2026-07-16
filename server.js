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
                "改善コードは元の意図を保ち、過度な設計変更を避けてください。"
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

app.listen(port, () => {
  console.log(`AI code review app is running on http://localhost:${port}`);
});
