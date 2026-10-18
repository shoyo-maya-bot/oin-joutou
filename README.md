# 押印上等!! 月末決裁デスマッチ

定時まで90秒。降ってくる書類を、ハンコ一本でねじ伏せるブラウザゲーム。

- ゲーム本体: `public/index.html`（1ファイル。画像素材なし、音もプログラムで合成）
- ランキングAPI: `src/api.js`（Cloudflare Workers + D1。入口は `src/worker.js`）
- Twitter（X）用カード画像: `public/og.png`

## 公開のしかた（Cloudflare Workers）

1. Cloudflare のダッシュボードで **Workers & Pages → Create application → Import a repository** を選び、このリポジトリを選ぶ
2. 設定はそのまま（Deploy command: `npx wrangler deploy`）で **Deploy**
   - ランキング用のデータベース `oin-ranking`（D1）は初回デプロイ時に自動で作られる
   - 公開URL: `https://oin-joutou.<アカウントのサブドメイン>.workers.dev`
3. 以後は `main` に push するたびに自動で再デプロイされる

テーブルは初回アクセス時に自動で作られる。独自ドメインにした場合は、`public/index.html` の `og:url` と `og:image` の URL も合わせて直す。

Cloudflare Pages で公開する場合は、ビルド出力ディレクトリを `public` にし、D1 を変数名 `DB` でバインドする（入口は `functions/api/[[route]].js`）。

## ランキングの仕組み

- 各プレイヤーはブラウザに保存されるランダムなIDと合言葉で識別（アカウント不要）
- ゲーム開始時に `/api/start` でプレイIDを受け取り、終了後に一度だけ `/api/scores` へ送れる
- 定時クリアは開始から88秒未満なら拒否、経過時間に対して不自然に高いスコアも拒否
- 1人1行、自己ベストだけを掲示

不正な記録を消すときは、D1 のコンソールで `DELETE FROM scores WHERE name = '…';` を実行する。

## ローカルで動かす

```
npm install
npm run dev   # http://localhost:8788（ローカル用のD1が自動で使われる）
```
