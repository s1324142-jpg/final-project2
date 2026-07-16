# AI Code Review Studio

プログラミング学習者向けの AI コードレビュー・デバッグ支援 Web アプリです。ユーザーが言語とソースコードを入力すると、AI が `入力 -> 分析 -> 生成 -> 評価` の流れでコード品質をレビューし、改善コード、修正理由、スコア、学習アドバイスを表示します。

## 主な機能

- プログラミング言語選択とコード入力
- OpenAI API によるコード解析
- 構文、バグ可能性、可読性、命名、重複、保守性、効率、セキュリティ観点のレビュー
- 改善版コードと修正前後の比較表示
- 可読性、保守性、処理効率、バグの少なさ、品質の 100 点評価
- JSON ファイルによるレビュー履歴保存
- API キー未設定時の簡易ローカルレビュー
- ダークモード

## セットアップ

```bash
npm install
cp .env.example .env
```

`.env` に OpenAI API キーを設定します。

```bash
OPENAI_API_KEY=実際のAPIキーに置き換えてください
OPENAI_MODEL=gpt-5.5
PORT=3000
```

## 起動

```bash
npm run dev
```

ブラウザで `http://localhost:3000` を開きます。

## 画面構成

- 入力: 言語選択、コード入力、レビュー開始
- 分析: 検出した問題、重要度、説明、提案
- 生成: 元コード、改善版コード、改善理由、修正ポイント
- 評価: 総合スコア、項目別スコア、良い点、改善点、学習アドバイス
- 履歴: 保存済みレビューの一覧と再表示

## API

### `POST /api/reviews`

コードレビューを実行し、結果を履歴に保存します。

```json
{
  "language": "JavaScript",
  "code": "function add(a,b){return a+b}"
}
```

### `GET /api/reviews`

保存済みレビューを新しい順で返します。

### `GET /api/reviews/:id`

指定したレビューを返します。

## ブランチ運用例

```bash
git switch -c feature/ai-code-review-workflow
git add .
git commit -m "Build AI code review workflow app"
git push -u origin feature/ai-code-review-workflow
```

機能追加は `feature/...`、修正は `fix/...` のように分けると、GitHub 上で Pull Request によるレビュー練習がしやすくなります。
