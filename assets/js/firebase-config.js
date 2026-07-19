/* =============================================================
   ViFight — Firebase 設定（実績ページ / 投稿ページ 共通）
   -------------------------------------------------------------
   ここに、あなたの Firebase プロジェクトの「ウェブアプリ設定」を
   貼り付けてください。手順は FIREBASE-SETUP.md を参照。

   ※ ここに書く apiKey などは「公開してよい値」です（Firebaseの
     仕様上、ブラウザに出ます）。安全性は Firestore / Storage の
     セキュリティルール＋ログインで守ります（手順書に記載）。
   ============================================================= */

export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

/* 投稿を許可するオーナーのメールアドレス（Firebase Auth で作成した
   アカウント）。複数人で運用する場合はカンマ区切りで追加できます。
   ※ 本当の書き込み制限は Firebase 側のセキュリティルールで行います。
      ここはフロント側の表示制御用です。 */
export const OWNER_EMAILS = ["ayumu.k@vifight.com"];

/* Firestore のコレクション名 / Storage の保存先フォルダ */
export const WORKS_COLLECTION = "works";
export const STORAGE_FOLDER = "works";

/* まだ設定キーを貼り替えていない場合は false を返す（未設定時は
   実績ページは既存実績のみ表示、投稿ページは案内を表示する） */
export const isConfigured = () =>
  !!firebaseConfig.apiKey &&
  !firebaseConfig.apiKey.startsWith("YOUR_") &&
  !!firebaseConfig.projectId &&
  !firebaseConfig.projectId.startsWith("YOUR_");
