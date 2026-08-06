# 合同会社Roots ポートフォリオ — 公開手順

このフォルダの中身をそのまま新しいGitHubリポジトリに置くと、
`https://roots.vifight.com/` で公開できます。所要 15〜20分（DNSの反映待ちを除く）。

---

## このフォルダの中身

```
index.html                      ← ポートフォリオ本体（Roots名義）
CNAME                           ← roots.vifight.com（消さないでください）
robots.txt / sitemap.xml        ← 検索エンジン向け
.nojekyll                       ← GitHub Pages用のおまじない
assets/css/portfolio.css        ← デザイン
assets/js/portfolio.js          ← 表示の仕組み
assets/js/portfolio-data.js     ← 掲載する制作事例のデータ（ここを編集）
assets/images/portfolio/*.jpg   ← 各事例のスクリーンショット
```

---

## 手順

### 1. 新しいリポジトリを作る
1. GitHubで「New repository」
2. リポジトリ名：`roots`（何でもOK）
3. **Public** を選択（Publicでないと無料でPages公開できません）
4. 「Create repository」

### 2. このフォルダの中身をアップロード
- GitHubの「uploading an existing file」から、**`roots/` フォルダの中身**（`index.html` や `assets` フォルダなど）をドラッグ＆ドロップ
- ※ `roots` フォルダごとではなく、**中身**を入れてください
- `CNAME` と `.nojekyll` も必ず含めてください（隠しファイルに見える場合があります）

### 3. GitHub Pages を有効化
1. リポジトリの **Settings → Pages**
2. Source：`Deploy from a branch`
3. Branch：`main` / フォルダ：`/ (root)` → Save
4. しばらくすると「Your site is live at ...」と表示されます

### 4. DNSにレコードを追加（お名前.com / Cloudflare など）
`vifight.com` を管理しているサービスの DNS 設定で、以下を追加します。

| 種類（Type） | 名前（Name / ホスト名） | 値（Value / 向き先） |
|---|---|---|
| CNAME | `roots` | `【あなたのGitHubユーザー名】.github.io` |

例：ユーザー名が `playmark0227-svg` なら、値は `playmark0227-svg.github.io`

> ※ 末尾のドット（`.`）が必要なサービスもあります。入力欄の例示に合わせてください。
> ※ Cloudflareを使っている場合、プロキシ（オレンジの雲）は **DNS only（グレー）** にしてください。

### 5. HTTPSを有効にする
DNSが反映されると（数分〜最大1時間）、Settings → Pages に
**Enforce HTTPS** のチェックが出るのでオンにします。

これで `https://roots.vifight.com/` が公開されます。

---

## 掲載内容を変えるには

`assets/js/portfolio-data.js` を編集します。

- **事例を追加**：`PROJECTS` に1件分をコピーして追記
- **事例を消す**：その `{ ... }` のブロックを削除
- **スクリーンショットを差し替え**：`assets/images/portfolio/` に
  `<slug>.jpg` の名前で画像を置く（例：`swiply.jpg`）
  ※ 画像が無い場合は、ブランドカラーのデザインカードが自動表示されます

---

## 連絡先について

現在、お問い合わせ先は `ayumu.k@vifight.com` になっています。
Roots専用のメールアドレスができたら、以下の2ファイルを置換してください。

- `index.html`（3箇所：ヘッダー・CTAボタン・フッター）
- `assets/js/portfolio.js`（1箇所：モーダル内の「似た制作を相談する」）

---

## メモ

- ViFight本体（`vifight.com`）とは**別のリポジトリ**です。片方を更新しても、もう片方には反映されません。
- 両方の内容を揃えたい場合は、`assets/` 以下のファイルをコピーし直してください。
- フッターに「ViFightとの協業により手がけたものを含みます」と記載しています。文言を変える場合は `index.html` のフッター部分を編集してください。
