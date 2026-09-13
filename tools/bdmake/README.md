# bdmake

MP4 を、一般的な Blu-ray プレーヤーで再生できる **BD-Video**（`BDMV/` フォルダ構造と ISO
イメージ）へ変換する CLI ツールです。MP4 をそのまま焼いたデータディスクではなく、
BD-Video 規格に沿った構造を出力します。

- 実装: Python 3（標準ライブラリのみ）
- 外部依存: `ffmpeg` / `ffprobe` / `tsMuxeR`
- 想定環境: macOS（Apple Silicon）。Linux でも同じコマンドで動作します。
- **出力は常に HD（1920x1080 以下）**。UHD BD は一般プレーヤーでの互換性を確保できないため
  対応せず、4K 入力は 1920x1080 へダウンコンバートします。

---

## 1. インストール

### 1-1. 依存ツール

#### macOS（Apple Silicon）

```bash
brew install ffmpeg          # ffmpeg / ffprobe
```

tsMuxeR は Homebrew では配布されていないため、公式の zip を展開して配置します。

```bash
# https://github.com/justdan96/tsMuxer/releases から Apple Silicon 版 zip を取得
unzip tsMuxeR_*.zip
sudo install -m 755 tsMuxeR /usr/local/bin/tsMuxeR
xattr -dr com.apple.quarantine /usr/local/bin/tsMuxeR   # Gatekeeper に止められる場合
brew install freetype zlib                              # 依存ライブラリ不足のエラーが出る場合
```

#### Linux（Debian / Ubuntu）

```bash
sudo apt install ffmpeg
# tsMuxeR は同じく releases から zip を取得して配置
sudo install -m 755 tsMuxeR /usr/local/bin/tsMuxeR
```

PATH に置かない場合は、環境変数で場所を指定できます。

```bash
export BDMAKE_TSMUXER=/Applications/tsMuxerGUI.app/Contents/MacOS/tsMuxeR
```

依存ツールは起動時に確認され、不足している場合はインストール手順を表示して終了します。

### 1-2. bdmake 本体

```bash
chmod +x tools/bdmake/bdmake.py
sudo ln -s "$(pwd)/tools/bdmake/bdmake.py" /usr/local/bin/bdmake
```

---

## 2. 使い方

```bash
bdmake input.mp4 -o output_dir [--chapter-interval 5] [--bitrate 25M] [--iso] [--keep-temp]
```

```bash
# もっとも単純な例（BDMV フォルダのみ）
bdmake movie.mp4 -o ./disc

# 5分ごとにチャプターを打ち、25Mbps で、ISO も作る
bdmake movie.mp4 -o ./disc --chapter-interval 5 --bitrate 25M --iso

# 何をするかだけ確認する（エンコードしない）
bdmake movie.mp4 -o ./disc --dry-run
```

### オプション

| オプション | 既定値 | 内容 |
| --- | --- | --- |
| `-o, --output DIR` | （必須） | 出力ディレクトリ。`BDMV/` と `CERTIFICATE/` を作成します |
| `--chapter-interval MIN` | `5` | チャプターを打つ間隔（分）。`0` で無効 |
| `--bitrate RATE` | `25M` | 映像の平均ビットレート（`25M` / `20000k` / 数値）。上限は BD の VBV 上限 30Mbps |
| `--iso` | off | ISO イメージも生成する |
| `--keep-temp` | off | 中間ファイル（基本ストリーム・meta）を削除しない |
| `--preset NAME` | `medium` | x264 のプリセット |
| `--volume-label LABEL` | 入力ファイル名 | ISO のボリュームラベル |
| `--audio-lang XXX` | 入力のタグ | 音声の言語コード（ISO639 の3文字、例 `jpn`） |
| `--no-interlace` | off | 1080p50/59.94 素材を 1080i 化せず、1280x720 の進行形式で出力する |
| `--overwrite` | off | 出力先に既存の `BDMV/` があっても上書きする |
| `--dry-run` | off | 解析・プラン・実行コマンドの表示のみ行う |

### 出力

```
output_dir/
├── BDMV/
│   ├── index.bdmv
│   ├── MovieObject.bdmv
│   ├── PLAYLIST/00000.mpls
│   ├── CLIPINF/00000.clpi
│   └── STREAM/00000.m2ts
├── CERTIFICATE/
└── 入力ファイル名.iso      （--iso 指定時。ボリュームラベルは --volume-label）
```

ディスクに焼く場合は `BDMV/` と `CERTIFICATE/` を**ディスク直下**に配置してください
（`output_dir` ごと焼くとデータディスクになり、プレーヤーが認識しません）。
ISO をそのまま焼けば確実です。

---

## 3. 処理の流れ

1. **`ffprobe` で入力を解析** — 解像度 / fps / SAR / 音声コーデック / カラー情報
   （transfer characteristics）を取得し、HDR（PQ・HLG）かどうかを判定します。
2. **`ffmpeg` で H.264 へ再エンコード** — 下記「4. 変換仕様」のとおりに正規化し、
   映像は H.264 基本ストリーム（`.264`）、音声は AC-3（`.ac3`）として出力します。
3. **`tsMuxeR` 用の meta ファイルを生成し、BDMV 構造へ多重化**。
4. **ISO イメージを生成**（`--iso` 指定時）。tsMuxeR が UDF で直接書き出します。

各工程の進捗と、実行した ffmpeg / tsMuxeR のコマンドはすべて標準出力に表示されます。
中間ファイルは完了後に削除されます（`--keep-temp` を除く）。

---

## 4. 変換仕様

### 4-1. 映像

| 項目 | 内容 |
| --- | --- |
| コーデック | H.264 / profile **high** / level **4.1** / `yuv420p`（8bit） |
| x264 | `bluray-compat=1` `vbv-maxrate=30000` `vbv-bufsize=30000` `open-gop=1` `slices=4` `aud=1` `nal-hrd=vbr` `b-pyramid=strict` `min-keyint=1` `keyint=（fps 相当 = 1秒）` |
| カラー | BT.709 を明示（`colorprim` / `transfer` / `colormatrix`） |
| 解像度 | `1920x1080` / `1280x720` / `720x480` のいずれかに正規化 |
| アスペクト | 常に表示 16:9。16:9 でない素材はレターボックス／ピラーボックスで補正（引き伸ばしなし） |
| フレームレート | `23.976` / `24` / `25` / `29.97` / `50` / `59.94` のうち元 fps に最も近いものへ正規化（CFR 化） |

### 4-2. 解像度の決めかた

| 入力 | 出力 |
| --- | --- |
| 4K（3840x2160 など）| **1920x1080**（lanczos でダウンスケール。ログに明示） |
| 高さ 721px 以上 | 1920x1080 |
| 高さ 577〜720px | 1280x720 |
| 高さ 576px 以下 かつ NTSC 系 fps | 720x480（SAR 40:33） |
| 高さ 576px 以下 かつ PAL 系 fps（25/50）| 1280x720（720x576 は本ツールの対象外のため） |

720x480 は NTSC 標準のアナモルフィック 16:9（H.264 の `aspect_ratio_idc=5` = SAR 40:33）
で出力します。1920x1080 / 1280x720 は SAR 1:1（正方画素）です。

### 4-3. フレームレートと走査方式

BD-Video は「解像度 × フレームレート × 走査方式」の組み合わせが規格で決まっています。
正規化した fps がその解像度に存在しない場合は、次のように**規格内の最も近い形式**へ寄せ、
理由をログに出します。

| 出力解像度 | 正規化後の fps | 実際の出力形式 | 方法 |
| --- | --- | --- | --- |
| 1920x1080 | 23.976 / 24 | 1080p23.976 / 1080p24 | そのまま |
| 1920x1080 | 25 / 29.97 | 1080i50 / 1080i59.94 | 中身は進行形式のまま インターレースとして信号化（x264 `--fake-interlaced`、画質劣化なし） |
| 1920x1080 | 50 / 59.94 | 1080i50 / 1080i59.94 | `interlace` フィルタでインターレース化（`--no-interlace` 指定時は 1280x720p50/59.94） |
| 1280x720 | 23.976 / 24 / 50 / 59.94 | 720p | そのまま |
| 1280x720 | 25 / 29.97 | 720p50 / 720p59.94 | フレーム倍化 |
| 720x480 | 29.97 | 480i59.94 | インターレースとして信号化 |
| 720x480 | 23.976 / 24 | 480i59.94 | 2:3 のパターンで 29.97fps へ変換し、インターレースとして信号化 |
| 720x480 | 59.94 | 480i59.94 | `interlace` フィルタでインターレース化 |

1080p50/59.94（BD-ROM 2.4 以降の形式）は level 4.2 が必要で、古いプレーヤーでは再生
できないため、既定では 1080i へ寄せています。

### 4-4. HDR（PQ / HLG）

入力の transfer characteristics が `smpte2084`（PQ）または `arib-std-b67`（HLG）の場合、
**SDR BT.709 へトーンマッピング**し、その旨をログに出します。

```
zscale=t=linear:npl=100 → format=gbrpf32le → zscale（lanczos で縮小）
  → zscale=p=bt709 → tonemap=tonemap=hable:desat=0 → zscale=t=bt709:m=bt709 → yuv420p
```

縮小をリニア光の段階で行うことで、トーンマップ前にハイライトが壊れるのを避けつつ、
4K のまま tonemap するより高速に処理します。zscale を含まない ffmpeg の場合は、
その旨を表示して停止します（Homebrew 版・主要ディストリビューション版は同梱）。

### 4-5. 音声

| 項目 | 内容 |
| --- | --- |
| コーデック | **AC-3**（AAC は BD-Video 規格外のため必ず変換） |
| サンプリング | 48kHz |
| ビットレート | 640kbps |
| チャンネル | 入力のまま（最大 5.1ch。7.1ch 以上は 5.1ch へダウンミックス） |
| 音声なしの入力 | 無音の AC-3 を生成（音声トラックのないディスクを嫌うプレーヤーがあるため） |
| 入力がすでに AC-3 の場合 | 48kHz・640kbps 以下・5.1ch 以下なら再エンコードせずそのまま使用（世代劣化を避けるため） |

音声トラックが複数ある場合は先頭のみを使用します。字幕トラックは取り込みません。

### 4-6. チャプター

`--chapter-interval`（分）で指定した間隔で自動的にチャプターを打ちます（tsMuxeR の
`--auto-chapters`）。入力 MP4 のチャプターマーカーは取り込みません。

---

## 5. 容量の目安

処理開始前に推定サイズを表示し、BD-R の容量（25GB / 50GB）を超える見込みの場合は
警告と推奨ビットレートを提示します。

| 収録時間 | 25Mbps | 20Mbps | 15Mbps |
| --- | --- | --- | --- |
| 60分 | 11.4 GiB | 9.2 GiB | 6.9 GiB |
| 120分 | 22.8 GiB | 18.3 GiB | 13.9 GiB |
| 150分 | 28.5 GiB（25GB 超）| 22.9 GiB | 17.4 GiB |

（映像ビットレート + AC-3 640kbps + 多重化オーバーヘッド 6% で概算。
BD-R 25GB = 23.3 GiB、BD-R 50GB = 46.6 GiB）

超過する場合は、次のように推奨ビットレートが表示されます。

```
  推定サイズ     : 34.17 GiB（BD-R 25GB の 146.6%）
  [警告] 推定サイズ 34.17 GiB が BD-R 25GB（1層）を超える見込みです（50GB の2層メディアには収まります）。
  [警告] 25GB に収めるなら --bitrate 16.3M を指定してください。
```

---

## 6. 出力の確認

```bash
# VLC: メディア → ディスクを開く → 「ブルーレイ」でフォルダを選ぶ（または output_dir を D&D）
vlc output_dir
vlc output_dir/映画.iso          # ISO もそのまま開けます

# macOS で ISO をマウントして中身を見る
hdiutil attach output_dir/映画.iso

# ディスク構造・タイトル・チャプターを確認（libbluray）
bd_info    output_dir            # ISO を直接渡すこともできます
bd_list_titles output_dir        # 再生時間・チャプター数・音声/映像トラック数

# BD として読めるか（VLC と同じ libbluray 経路）確認しつつデコードする
ffprobe -v error -show_streams "bluray:output_dir"
ffmpeg  -v error -i "bluray:output_dir" -f null -

# 多重化後のストリーム諸元（PID・レベル・カラー・走査方式）
ffprobe -v error -show_streams output_dir/BDMV/STREAM/00000.m2ts
```

正常な出力では、映像 PID が `0x1011`、音声 PID が `0x1100`、映像が
`h264 / High / level 41 / bt709`、音声が `ac3 48000Hz 640kbps` になります。

> `bluray:` でデコードすると libbluray が
> `no timestamp for SPN 0` を出すことがありますが、tsMuxeR が出力する
> ディスクに共通の情報メッセージで、再生・シークには影響しません。
> なお ffmpeg の `bluray:` プロトコルは 3 分未満のタイトルを無視するため、
> 短いテスト素材では `0 usable playlists` になります（VLC では再生できます）。

---

## 7. 制限事項

- UHD BD（BD-ROM v3 / HEVC）には対応しません。4K 入力は 1080p へダウンコンバートします。
- 字幕、メニュー、複数音声、複数タイトル、3D（MVC）には対応しません。1本の MP4 から
  1タイトルのシンプルなディスクを作ります。
- 入力 MP4 のチャプターは取り込みません（`--chapter-interval` による自動チャプターのみ）。
- 720x576（PAL SD）は出力しません。SD の PAL 素材は 1280x720 へ引き上げます。
