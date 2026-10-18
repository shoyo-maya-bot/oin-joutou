# 押印上等!! 月末決裁デスマッチ

定時まで90秒。降ってくる書類を、ハンコ一本でねじ伏せるブラウザゲーム。

- ゲーム本体: `public/index.html`（1ファイル。画像素材なし、音もプログラムで合成）
- ランキングAPI: `functions/api/[[route]].js`（Cloudflare Pages Functions + D1）
- Twitter（X）用カード画像: `public/og.png`

## 公開のしかた（Cloudflare Pages）

1. Cloudflare のダッシュボードで **Workers & Pages → 作成 → Pages → Git に接続** を選び、このリポジトリを選ぶ
   - プロジェクト名: `oin-joutou`（URL が `https://oin-joutou.pages.dev` になる）
   - フレームワーク: なし / ビルドコマンド: 空欄 / ビルド出力ディレクトリ: `public`
2. **ストレージとデータベース → D1 → データベースを作成** で `oin-ranking` を作る
3. Pages プロジェクトの **設定 → バインディング → 追加 → D1 データベース** で
   - 変数名: `DB` / データベース: `oin-ranking`
4. **デプロイ → 最新のデプロイを再試行** で再デプロイ（バインディングを反映するため）

テーブルは初回アクセス時に自動で作られる。プロジェクト名を変えた場合は、`public/index.html` の `og:url` と `og:image` の URL も合わせて直す。

## ランキングの仕組み

- 各プレイヤーはブラウザに保存されるランダムなIDと合言葉で識別（アカウント不要）
- ゲーム開始時に `/api/start` でプレイIDを受け取り、終了後に一度だけ `/api/scores` へ送れる
- 定時クリアは開始から88秒未満なら拒否、経過時間に対して不自然に高いスコアも拒否
- 1人1行、自己ベストだけを掲示

不正な記録を消すときは、D1 のコンソールで `DELETE FROM scores WHERE name = '…';` を実行する。

## ローカルで動かす

```
npm install
npm run dev   # http://localhost:8788
```
