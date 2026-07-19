# 実績ページ 投稿機能（Firebase）セットアップ手順

`admin.html`（スマホ用の投稿ページ）から、写真＋一言で実績を即公開できるようにする設定です。
**無料枠で十分**動きます。所要 10〜15 分。

---

## 全体像

- **写真** → Firebase **Storage** に保存
- **投稿データ**（一言・カテゴリ等）→ Firebase **Firestore** に保存
- **投稿はログインした人だけ**（Firebase **Authentication**）
- 公開ページ `works.html` は誰でも閲覧可（読み取りのみ許可）

設定キー（apiKey など）は**ブラウザに出てOKな公開値**です。安全性は下の
**セキュリティルール＋ログイン**で守ります。

---

## 手順

### 1. Firebase プロジェクトを作る
1. https://console.firebase.google.com/ にアクセス（Googleアカウントでログイン）
2. 「プロジェクトを追加」→ 名前は `vifight` などで作成（Googleアナリティクスは任意/オフでOK）

### 2. ウェブアプリを登録して「設定キー」を取得
1. プロジェクト画面の **⚙️ → プロジェクトの設定 → 全般**
2. 「マイアプリ」で **</> （ウェブ）** を選び、アプリ名 `vifight-web` で登録
3. 表示される `firebaseConfig = { ... }` の中身をコピー
4. リポジトリの **`assets/js/firebase-config.js`** を開き、`YOUR_...` の部分を貼り替える
   （`apiKey` / `authDomain` / `projectId` / `storageBucket` / `messagingSenderId` / `appId`）

### 3. ログイン（Authentication）を有効化＆自分のアカウント作成
1. 左メニュー **Authentication → 始める**
2. **Sign-in method** タブ →「メール/パスワード」を**有効**にして保存
3. **Users** タブ →「ユーザーを追加」→ あなたのメール（例：`ayumu.k@vifight.com`）とパスワードを登録
   - このメールは `firebase-config.js` の `OWNER_EMAILS` と**一致**させてください（初期値は `ayumu.k@vifight.com`）

### 4. Firestore を作成＆ルール設定
1. 左メニュー **Firestore Database → データベースを作成**（本番モード・ロケーションは `asia-northeast1`（東京）推奨）
2. **ルール**タブに、以下を貼り付けて「公開」
   - `【あなたのメール】` を手順3で作ったメールに置き換えてください

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /works/{id} {
      allow read: if true;
      allow create, update, delete: if request.auth != null
        && request.auth.token.email in ['【あなたのメール】'];
    }
  }
}
```

### 5. Storage を有効化＆ルール設定
1. 左メニュー **Storage → 始める**（ロケーションは Firestore と同じでOK）
2. **ルール**タブに、以下を貼り付けて「公開」
   - こちらも `【あなたのメール】` を置き換え

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /works/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null
        && request.auth.token.email in ['【あなたのメール】']
        && request.resource.size < 8 * 1024 * 1024
        && request.resource.contentType.matches('image/.*');
    }
  }
}
```

### 6. 反映
`firebase-config.js` の変更をコミット＆プッシュ（GitHubアプリからでもOK）すると、
`admin.html` に**ログイン画面**が出るようになります。

---

## 使い方（スマホ）
1. スマホで `https://vifight.com/admin.html` を開く
2. 手順3で作ったメール／パスワードで**ログイン**
3. **写真を選ぶ**（カメラ or ライブラリ／自動で圧縮されます）
4. **一言・カテゴリ**を入れて「**投稿する**」→ 数秒で `works.html` に反映
5. 下の一覧から**削除**もできます

> 💡 スマホのブラウザで `admin.html` を開き「**ホーム画面に追加**」しておくと、
> アプリのように1タップで投稿できます。

---

## セキュリティ・運用メモ
- 投稿できるのは **`OWNER_EMAILS` に登録し、Firebaseにアカウントがある人だけ**です。
- 他人がキーを見ても、上のルールでログインが必須なので**勝手に投稿・削除はできません**。
- 無料枠（Sparkプラン）で個人の実績投稿には十分です。画像は投稿時に自動圧縮（長辺1600px）されます。
- 複数人で運用する場合は、`OWNER_EMAILS` とルール内のメール配列に、カンマ区切りで追加してください。
  例：`in ['a@example.com', 'b@example.com']`
