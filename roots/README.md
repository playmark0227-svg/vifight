# 合同会社Roots ポートフォリオ — 公開手順

## いまの状態

**すでに `https://vifight.com/roots/` で見られます。**
（このフォルダごと本番に入っているため、URLを共有すればすぐ見せられます）

`https://roots.vifight.com/` の独自サブドメインにするには、下の手順が必要です。
GitHub Pages は「1リポジトリにつき独自ドメイン1つ」のため、別リポジトリが要ります。

---

## 手順（15〜20分＋DNS反映待ち）

### 1. 新しいリポジトリを作る
1. https://github.com/new を開く
2. Repository name：`roots`
3. **Public** を選ぶ（Publicでないと無料でPages公開できません）
4. 「Add a README file」等は**チェックしない**
5. 「Create repository」

### 2. ファイルをアップロード
作成直後の画面にある **「uploading an existing file」** をクリックし、
`roots-site.zip` を展開した**中身**（`index.html`、`assets` フォルダなど）を
まとめてドラッグ＆ドロップ → 「Commit changes」

> ⚠️ `roots` フォルダごとではなく、**中身**を入れてください。
> `index.html` がリポジトリの一番上に来るのが正解です。

> ⚠️ `CNAME` と `.nojekyll` も必ず含めてください。Macでは `.nojekyll` が
> 見えないことがあります（`Command + Shift + .` で表示切替）。
> もし入れ忘れても、後から「Add file → Create new file」で
> ファイル名に `.nojekyll` と入力して空のまま保存すればOKです。

### 3. GitHub Pages を有効化
1. リポジトリの **Settings → Pages**
2. Source：`Deploy from a branch`
3. Branch：`main` ／ フォルダ：`/ (root)` → **Save**

### 4. DNSにレコードを1行追加
`vifight.com` を管理しているサービス（お名前.com、ムームードメイン、
Cloudflare など）のDNS設定で、以下を追加します。

| 種類（Type） | 名前（ホスト名） | 値（向き先） |
|---|---|---|
| `CNAME` | `roots` | `playmark0227-svg.github.io` |

- 名前は `roots` だけでOKです（`roots.vifight.com` と入れる欄の場合もあります）
- 末尾にドット（`.`）が必要なサービスもあります。入力欄の例示に合わせてください
- **Cloudflareの場合**：プロキシ（オレンジの雲）は **DNS only（グレー）** にしてください

### 5. HTTPSを有効にする
DNSが反映されると（数分〜最大1時間）、Settings → Pages に
**Enforce HTTPS** のチェックが出るのでオンにします。

これで `https://roots.vifight.com/` が公開されます。

---

## 掲載内容を変えるには

`assets/js/portfolio-data.js` を編集します。

- **事例を追加**：`PROJECTS` の中に1件分をコピーして追記
- **事例を消す**：その `{ ... }` のブロックごと削除
- **スクリーンショットを差し替え**：`assets/images/portfolio/` に
  `<slug>.jpg` の名前で画像を置く（例：`swiply.jpg`）
  ※ 画像が無い案件は、ブランドカラーのデザインカードが自動表示されます

---

## 連絡先を変えるには

現在の問い合わせ先は `ayumu.k@vifight.com` です。
Roots専用アドレスができたら、以下を置換してください。

- `index.html` … 3箇所（ヘッダー・CTAボタン・フッター）
- `assets/js/portfolio.js` … 1箇所（モーダル内「似た制作を相談する」）

---

## メモ

- ViFight本体（`vifight.com`）とは**別リポジトリ**になります。
  片方を更新しても、もう片方には反映されません。
- 内容を揃えたいときは `assets/` 以下をコピーし直してください。
- フッターに「ViFightとの協業により手がけたものを含みます」と記載しています。
  文言変更は `index.html` のフッター部分で行えます。
