# ViFight 公式サイト

北海道 中標津・札幌の広告クリエイティブエージェンシー **ViFight** の公式サイトです。
GitHub Pages + カスタムドメイン（ https://vifight.com/ ）で公開しています。

## 構成

```
index.html        メインのSPA（タブ切り替え型ワンページ）
privacy.html      プライバシーポリシー
tokushoho.html    特定商取引法に基づく表記
refund.html       返金・キャンセルポリシー
404.html          カスタム404ページ
sitemap.xml       サイトマップ
robots.txt        クローラー設定
site.webmanifest  Webアプリマニフェスト
CNAME             カスタムドメイン設定（vifight.com）
assets/
  css/style.css   全スタイル（デザイントークンは :root に定義）
  js/main.js      全スクリプト（フレームワーク不使用の Vanilla JS）
  images/         写真素材（hero / works / 代表写真）
```

## 編集時のルール

- **キャッシュバージョン**: `style.css` / `main.js` を変更したら、全HTMLの
  `?v=YYYYMMDDx` クエリを新しい値に更新してください（例: `?v=20260703b`）。
  これを忘れると訪問者に古いファイルが配信され続けます。
- **アニメーションの方針**: 追加する動きは transform / opacity のみ
  （GPU合成可能なプロパティ）。常時走り続ける requestAnimationFrame ループは
  作らず、IntersectionObserver で画面外では停止させる。
  `prefers-reduced-motion` のユーザーには `@media` ブロックで無効化する。
- **タブ構成**: `index.html` 内の `.view` が1タブ。ハッシュ（`#about` 等）で
  ルーティングし、`main.js` の TAB ROUTER が切り替えを担当。

## お問い合わせフォーム

- [FormSubmit](https://formsubmit.co/) の AJAX エンドポイントを使用（サーバー不要）。
- 送信先アドレスは `index.html` の `<form action="...">` で指定。
  **変更した場合は、新アドレス宛の初回送信後に届く FormSubmit の
  確認メールのリンクを必ずクリックして有効化すること。**
- `_autoresponse` でお客様への自動返信（2営業日以内に返信する旨）を送信。
- プライバシーポリシー同意チェック（`privacy_consent`）は送信データに記録される。

## 公開

`main` ブランチへの push で GitHub Pages が自動デプロイします。
DNS は `vifight.com` の A/CNAME レコードで GitHub Pages を指しています。
