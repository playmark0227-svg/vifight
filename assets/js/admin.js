/* =============================================================
   ViFight — 実績 投稿ページ（スマホ用）
   Firebase Auth / Firestore / Storage で「写真＋一言」を即公開。
   ============================================================= */
import { firebaseConfig, isConfigured, OWNER_EMAILS, WORKS_COLLECTION, STORAGE_FOLDER } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
const $ = (id) => document.getElementById(id);

const show = (el) => el && el.classList.remove('ad-hidden');
const hide = (el) => el && el.classList.add('ad-hidden');

if (!isConfigured()) {
  show($('config-missing'));
} else {
  boot().catch((e) => {
    console.error(e);
    show($('config-missing'));
    $('config-missing').querySelector('.ad-note').innerHTML =
      '初期化に失敗しました。設定キーが正しいかご確認ください。<br><small>' + (e && e.message ? e.message : e) + '</small>';
  });
}

async function boot() {
  const [{ initializeApp }, authMod, fsMod, stMod] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`),
    import(`${SDK}/firebase-storage.js`),
  ]);

  const app = initializeApp(firebaseConfig);
  const auth = authMod.getAuth(app);
  const db = fsMod.getFirestore(app);
  const storage = stMod.getStorage(app);

  let compressedBlob = null;
  let previewUrl = null;

  /* ---------- Auth ---------- */
  authMod.onAuthStateChanged(auth, (user) => {
    if (!user) { hide($('app-view')); show($('login-view')); return; }
    const email = (user.email || '').toLowerCase();
    const allowed = OWNER_EMAILS.map((e) => e.toLowerCase()).includes(email);
    if (!allowed) {
      $('login-msg').textContent = 'このアカウントには投稿権限がありません。';
      $('login-msg').className = 'ad-msg err';
      authMod.signOut(auth);
      return;
    }
    hide($('login-view')); show($('app-view'));
    $('who').textContent = user.email;
    loadMyPosts(user.uid);
  });

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('login-btn'); btn.disabled = true;
    $('login-msg').textContent = ''; $('login-msg').className = 'ad-msg';
    try {
      await authMod.signInWithEmailAndPassword(auth, $('login-email').value.trim(), $('login-pass').value);
    } catch (err) {
      $('login-msg').textContent = loginError(err);
      $('login-msg').className = 'ad-msg err';
    } finally { btn.disabled = false; }
  });

  $('signout').addEventListener('click', () => authMod.signOut(auth));

  /* ---------- 画像選択＋圧縮 ---------- */
  $('file-input').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    $('post-msg').textContent = '画像を処理中…'; $('post-msg').className = 'ad-msg';
    try {
      compressedBlob = await compressImage(file, 1600, 0.82);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(compressedBlob);
      $('preview-img').src = previewUrl;
      $('preview').classList.add('show');
      $('post-btn').disabled = false;
      $('post-msg').textContent = '';
    } catch (err) {
      console.error(err);
      $('post-msg').textContent = '画像の読み込みに失敗しました。別の写真でお試しください。';
      $('post-msg').className = 'ad-msg err';
    }
  });

  $('preview-clear').addEventListener('click', () => {
    compressedBlob = null;
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    $('preview').classList.remove('show');
    $('file-input').value = '';
    $('post-btn').disabled = true;
  });

  /* ---------- 投稿 ---------- */
  $('post-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user || !compressedBlob) return;
    const btn = $('post-btn'); btn.disabled = true;
    $('post-msg').textContent = ''; $('post-msg').className = 'ad-msg';
    $('progress').classList.add('show'); $('progress-bar').style.width = '0%';

    try {
      const ts = String(Date.now());
      const path = `${STORAGE_FOLDER}/${user.uid}/${ts}.jpg`;
      const sref = stMod.ref(storage, path);
      const task = stMod.uploadBytesResumable(sref, compressedBlob, { contentType: 'image/jpeg' });
      await new Promise((resolve, reject) => {
        task.on('state_changed',
          (snap) => { $('progress-bar').style.width = Math.round((snap.bytesTransferred / snap.totalBytes) * 100) + '%'; },
          reject, resolve);
      });
      const imageUrl = await stMod.getDownloadURL(sref);

      await fsMod.addDoc(fsMod.collection(db, WORKS_COLLECTION), {
        imageUrl,
        storagePath: path,
        caption: $('caption').value.trim(),
        category: $('category').value,
        client: $('client').value.trim(),
        authorUid: user.uid,
        authorEmail: user.email,
        createdAt: fsMod.serverTimestamp(),
      });

      // reset
      $('post-form').reset();
      $('preview-clear').click();
      $('post-msg').textContent = '投稿しました！実績ページに反映されます。';
      $('post-msg').className = 'ad-msg ok';
      loadMyPosts(user.uid);
    } catch (err) {
      console.error(err);
      $('post-msg').textContent = '投稿に失敗しました：' + (err && err.code ? err.code : err.message || err);
      $('post-msg').className = 'ad-msg err';
    } finally {
      btn.disabled = false;
      setTimeout(() => $('progress').classList.remove('show'), 600);
    }
  });

  /* ---------- 自分の投稿一覧 ---------- */
  async function loadMyPosts(uid) {
    const wrap = $('my-posts');
    try {
      const q = fsMod.query(
        fsMod.collection(db, WORKS_COLLECTION),
        fsMod.where('authorUid', '==', uid),
        fsMod.orderBy('createdAt', 'desc')
      );
      const snap = await fsMod.getDocs(q);
      if (snap.empty) { wrap.innerHTML = '<p class="ad-note" style="grid-column:1/-1;">まだ投稿はありません。</p>'; return; }
      wrap.innerHTML = '';
      snap.forEach((d) => {
        const v = d.data();
        const el = document.createElement('div');
        el.className = 'ad-post';
        el.innerHTML = `<img src="${v.imageUrl}" alt=""><button class="ad-post-del" aria-label="削除">×</button>`;
        el.querySelector('.ad-post-del').addEventListener('click', async () => {
          if (!confirm('この投稿を削除しますか？')) return;
          try {
            await fsMod.deleteDoc(fsMod.doc(db, WORKS_COLLECTION, d.id));
            if (v.storagePath) { try { await stMod.deleteObject(stMod.ref(storage, v.storagePath)); } catch (_) {} }
            el.remove();
          } catch (err) { alert('削除に失敗しました：' + (err.code || err.message)); }
        });
        wrap.appendChild(el);
      });
    } catch (err) {
      console.error(err);
      // orderBy に索引が必要な場合のフォールバック（索引なしで取得して手元で並べ替え）
      try {
        const q2 = fsMod.query(fsMod.collection(db, WORKS_COLLECTION), fsMod.where('authorUid', '==', uid));
        const snap2 = await fsMod.getDocs(q2);
        wrap.innerHTML = snap2.empty ? '<p class="ad-note" style="grid-column:1/-1;">まだ投稿はありません。</p>' : '';
        snap2.docs
          .sort((a, b) => (b.data().createdAt?.seconds || 0) - (a.data().createdAt?.seconds || 0))
          .forEach((d) => {
            const v = d.data();
            const el = document.createElement('div');
            el.className = 'ad-post';
            el.innerHTML = `<img src="${v.imageUrl}" alt=""><button class="ad-post-del" aria-label="削除">×</button>`;
            el.querySelector('.ad-post-del').addEventListener('click', async () => {
              if (!confirm('この投稿を削除しますか？')) return;
              await fsMod.deleteDoc(fsMod.doc(db, WORKS_COLLECTION, d.id));
              if (v.storagePath) { try { await stMod.deleteObject(stMod.ref(storage, v.storagePath)); } catch (_) {} }
              el.remove();
            });
            wrap.appendChild(el);
          });
      } catch (e2) {
        wrap.innerHTML = '<p class="ad-note err" style="grid-column:1/-1;">一覧の取得に失敗しました。</p>';
      }
    }
  }
}

/* ---------- 画像圧縮（長辺 maxPx / JPEG quality） ---------- */
async function compressImage(file, maxPx, quality) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (_) {
    bitmap = await loadViaImg(file);
  }
  const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  if (bitmap.close) bitmap.close();
  return await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', quality));
}
function loadViaImg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

function loginError(err) {
  const c = err && err.code ? err.code : '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found'))
    return 'メールアドレスまたはパスワードが違います。';
  if (c.includes('invalid-email')) return 'メールアドレスの形式が正しくありません。';
  if (c.includes('too-many-requests')) return '試行回数が多すぎます。少し時間をおいてください。';
  if (c.includes('network')) return 'ネットワークエラーです。通信環境をご確認ください。';
  return 'ログインに失敗しました：' + (c || (err && err.message) || err);
}
