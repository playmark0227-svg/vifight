#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""bdmake — MP4 を一般的な Blu-ray プレーヤーで再生できる BD-Video へ変換する CLI。

    bdmake input.mp4 -o output_dir [--chapter-interval 5] [--bitrate 25M] [--iso] [--keep-temp]

出力は BDMV フォルダ構造（および --iso 指定時は ISO イメージ）。
データディスクではなく、BD-Video 規格に沿った構造を生成する。

外部依存: ffmpeg / ffprobe / tsMuxeR

出力は常に HD（1920x1080 以下）。UHD BD は一般プレーヤーでの互換性を確保できないため
対応せず、4K 入力は 1920x1080 へダウンコンバートする。
"""

from __future__ import annotations

import argparse
import json
import math
import os
import platform
import re
import shlex
import shutil
import subprocess
import sys
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from fractions import Fraction
from pathlib import Path

VERSION = "1.0.0"

# --------------------------------------------------------------------------
# BD-Video の制約（BD-ROM Part3 / AVCHD の映像フォーマット）
# --------------------------------------------------------------------------

RES_1080 = (1920, 1080)
RES_720 = (1280, 720)
RES_480 = (720, 480)

# fps の正規化先。キーは meta ファイル / ログ表記、値は実際のフレームレート。
FPS_CANDIDATES: dict[str, Fraction] = {
    "23.976": Fraction(24000, 1001),
    "24": Fraction(24, 1),
    "25": Fraction(25, 1),
    "29.97": Fraction(30000, 1001),
    "50": Fraction(50, 1),
    "59.94": Fraction(60000, 1001),
}

# NTSC 系（525/60）と PAL 系（625/50）の区別。SD 出力の可否判定に使う。
NTSC_RATES = {"23.976", "24", "29.97", "59.94"}

# インターレース表記（符号化フレームレート → フィールドレート表記）
FIELD_RATE_LABEL = {"25": "50", "29.97": "59.94", "23.976": "47.95", "24": "48"}

# 走査方式
SCAN_PROGRESSIVE = "progressive"  # 進行形式
SCAN_PSF = "psf"                  # 進行形式のまま interlaced フラグを立てる（x264 --fake-interlaced）
SCAN_INTERLACED = "interlaced"    # 真のインターレース符号化（x264 --tff）

# x264 / VBV まわり（BD 準拠）
H264_PROFILE = "high"
H264_LEVEL = "4.1"
VBV_MAXRATE_KBPS = 30000
VBV_BUFSIZE_KBIT = 30000
VBV_LEN_MS = 500

# 音声は AC-3 48kHz 640kbps 固定（AAC は BD-Video 規格外）
AC3_BITRATE_KBPS = 640
AC3_SAMPLE_RATE = 48000
AC3_MAX_CHANNELS = 6

# BD-R の実容量（バイト）
BD_R_SL_BYTES = 25_025_314_816   # 片面1層 25GB
BD_R_DL_BYTES = 50_050_629_632   # 片面2層 50GB

# M2TS 化（192バイト/TSパケット）と BDMV メタデータのオーバーヘッド見込み
MUX_OVERHEAD = 1.06

DEFAULT_BITRATE = "25M"
MIN_BITRATE_BPS = 2_000_000
MAX_BITRATE_BPS = VBV_MAXRATE_KBPS * 1000

TSMUXER_NAMES = ("tsMuxeR", "tsmuxer", "tsMuxer", "tsmuxeR")

# tsMuxeR が見つからないときに追加で探す場所（macOS の GUI 同梱バイナリなど）
TSMUXER_EXTRA_PATHS = (
    "/Applications/tsMuxerGUI.app/Contents/MacOS/tsMuxeR",
    "~/Applications/tsMuxerGUI.app/Contents/MacOS/tsMuxeR",
    "/opt/homebrew/bin/tsMuxeR",
    "/usr/local/bin/tsMuxeR",
    "/usr/bin/tsMuxeR",
)


# --------------------------------------------------------------------------
# ログ出力
# --------------------------------------------------------------------------


class Log:
    """標準出力への進捗表示。"""

    def __init__(self, stream=sys.stdout) -> None:
        self.stream = stream
        self.color = stream.isatty() and os.environ.get("NO_COLOR") is None
        self.tty = stream.isatty()
        self.total_steps = 0
        self._step = 0

    def _c(self, code: str, text: str) -> str:
        return f"\033[{code}m{text}\033[0m" if self.color else text

    def _write(self, text: str = "") -> None:
        self.stream.write(text + "\n")
        self.stream.flush()

    def banner(self, text: str) -> None:
        self._write()
        self._write(self._c("1;35", f"bdmake {VERSION} — {text}"))

    def step(self, title: str) -> None:
        self._step += 1
        self._write()
        head = f"[{self._step}/{self.total_steps}] {title}"
        self._write(self._c("1;36", head))

    def info(self, text: str) -> None:
        self._write(f"  {text}")

    def item(self, key: str, value: str) -> None:
        self._write(f"  {key:<10}: {value}")

    def note(self, text: str) -> None:
        self._write(self._c("36", f"  * {text}"))

    def warn(self, text: str) -> None:
        self._write(self._c("1;33", f"  [警告] {text}"))

    def error(self, text: str) -> None:
        self._write(self._c("1;31", f"[エラー] {text}"))

    def cmd(self, argv) -> None:
        """実行するコマンドラインをそのまま表示する（再現・検証用）。"""
        self._write(self._c("2", "  $ " + " ".join(shlex.quote(str(a)) for a in argv)))


class Progress:
    """ffmpeg / tsMuxeR の進捗を 1 行で更新表示する。"""

    def __init__(self, log: Log, label: str, total_sec: float | None) -> None:
        self.log = log
        self.label = label
        self.total = total_sec or 0.0
        self.start = time.monotonic()
        self._last_render = 0.0
        self._last_pct = -10.0
        self._active = False

    def update(self, current_sec: float, extra: str = "") -> None:
        now = time.monotonic()
        pct = (current_sec / self.total * 100.0) if self.total > 0 else 0.0
        pct = max(0.0, min(100.0, pct))
        if self.log.tty:
            if now - self._last_render < 0.2:
                return
        else:
            # 非 tty（ログへのリダイレクト）では 5% 刻みでのみ出す
            if pct - self._last_pct < 5.0:
                return
        self._last_render = now
        self._last_pct = pct
        elapsed = now - self.start
        eta = ""
        if pct > 0.5 and self.total > 0:
            remain = elapsed * (100.0 - pct) / pct
            eta = f" 残り {fmt_hms(remain)}"
        bar = ""
        if self.log.tty:
            filled = int(pct / 5)
            bar = "[" + "#" * filled + "-" * (20 - filled) + "] "
        line = f"  {self.label} {bar}{pct:5.1f}%  {fmt_hms(current_sec)}/{fmt_hms(self.total)}"
        if extra:
            line += f"  {extra}"
        line += eta
        if self.log.tty:
            width = shutil.get_terminal_size((100, 24)).columns
            self.log.stream.write("\r" + line[: width - 1].ljust(width - 1))
            self._active = True
        else:
            self.log.stream.write(line + "\n")
        self.log.stream.flush()

    def text(self, message: str) -> None:
        """進捗率が取れない処理向けに、最新行をそのまま表示する。"""
        now = time.monotonic()
        if self.log.tty:
            if now - self._last_render < 0.2:
                return
            self._last_render = now
            width = shutil.get_terminal_size((100, 24)).columns
            line = f"  {self.label} {message}"
            self.log.stream.write("\r" + line[: width - 1].ljust(width - 1))
            self._active = True
            self.log.stream.flush()

    def finish(self, ok: bool = True) -> None:
        elapsed = time.monotonic() - self.start
        if self._active:
            self.log.stream.write("\r" + " " * (shutil.get_terminal_size((100, 24)).columns - 1) + "\r")
            self.log.stream.flush()
            self._active = False
        if ok:
            self.log.info(f"{self.label} 完了（所要 {fmt_hms(elapsed)}）")


def fmt_hms(seconds: float) -> str:
    seconds = max(0, int(seconds))
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    return f"{h:d}:{m:02d}:{s:02d}"


def fmt_bytes(size: float) -> str:
    units = ["B", "KiB", "MiB", "GiB", "TiB"]
    value = float(size)
    for unit in units:
        if value < 1024 or unit == units[-1]:
            return f"{value:.2f} {unit}" if unit not in ("B", "KiB") else f"{value:.0f} {unit}"
        value /= 1024
    return f"{value:.2f} TiB"


# --------------------------------------------------------------------------
# エラー
# --------------------------------------------------------------------------


class BdMakeError(Exception):
    """工程名つきのエラー。原因と該当工程を明示して停止するために使う。"""

    def __init__(self, stage: str, reason: str, detail: str = "", hint: str = "") -> None:
        super().__init__(reason)
        self.stage = stage
        self.reason = reason
        self.detail = detail
        self.hint = hint

    def report(self, log: Log) -> None:
        log._write()
        log._write(log._c("1;31", "=" * 70))
        log.error(f"工程「{self.stage}」で失敗しました")
        log._write(f"  原因: {self.reason}")
        if self.detail:
            log._write("  詳細:")
            for line in self.detail.strip().splitlines()[-30:]:
                log._write(f"    {line}")
        if self.hint:
            log._write("  対処:")
            for line in self.hint.strip().splitlines():
                log._write(f"    {line}")
        log._write(log._c("1;31", "=" * 70))


# --------------------------------------------------------------------------
# 外部プロセス実行
# --------------------------------------------------------------------------


def run_capture(argv, stage: str, timeout: int = 120) -> str:
    """出力を取得するだけの短時間コマンド（ffprobe など）。"""
    try:
        proc = subprocess.run(
            argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, errors="replace", timeout=timeout,
        )
    except FileNotFoundError as exc:
        raise BdMakeError(stage, f"コマンドが見つかりません: {argv[0]}", str(exc)) from exc
    except subprocess.TimeoutExpired as exc:
        raise BdMakeError(stage, f"{argv[0]} が {timeout} 秒以内に終了しませんでした") from exc
    if proc.returncode != 0:
        raise BdMakeError(stage, f"{argv[0]} が終了コード {proc.returncode} で失敗しました", proc.stderr)
    return proc.stdout


def run_ffmpeg(argv, *, stage: str, label: str, total_sec: float, log: Log) -> float:
    """ffmpeg を -progress で監視しながら実行し、出力された尺（秒）を返す。"""
    log.cmd(argv)
    try:
        proc = subprocess.Popen(
            argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, errors="replace", bufsize=1,
        )
    except FileNotFoundError as exc:
        raise BdMakeError(stage, f"コマンドが見つかりません: {argv[0]}", str(exc)) from exc

    err_tail: deque[str] = deque(maxlen=80)

    def drain_stderr() -> None:
        assert proc.stderr is not None
        for line in proc.stderr:
            line = line.rstrip()
            if line:
                err_tail.append(line)

    thread = threading.Thread(target=drain_stderr, daemon=True)
    thread.start()

    progress = Progress(log, label, total_sec)
    stats: dict[str, str] = {}
    encoded_sec = 0.0
    assert proc.stdout is not None
    for line in proc.stdout:
        line = line.strip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        stats[key] = value
        if key != "progress":
            continue
        current = 0.0
        # out_time_us / out_time_ms はどちらもマイクロ秒（ffmpeg の歴史的な仕様）
        raw = stats.get("out_time_us") or stats.get("out_time_ms") or ""
        if raw.isdigit():
            current = int(raw) / 1_000_000.0
        encoded_sec = max(encoded_sec, current)
        extra_bits = []
        fps_value = stats.get("fps", "").strip()
        if fps_value not in ("", "0", "0.00", "N/A"):
            extra_bits.append(f"{fps_value}fps")
        speed_value = stats.get("speed", "").strip()
        if speed_value not in ("", "0", "N/A"):
            extra_bits.append(f"速度 {speed_value}")
        progress.update(current, " ".join(extra_bits))
        if value == "end":
            break

    proc.wait()
    thread.join(timeout=3)
    progress.finish(ok=proc.returncode == 0)
    if proc.returncode != 0:
        raise BdMakeError(
            stage,
            f"ffmpeg が終了コード {proc.returncode} で失敗しました",
            "\n".join(err_tail),
            "上記の ffmpeg コマンドをそのまま実行すると同じエラーを再現できます。",
        )
    for line in err_tail:
        if "deprecated" in line.lower():
            continue
        log.note(f"ffmpeg: {line}")
    return encoded_sec


def run_tsmuxer(argv, *, stage: str, label: str, log: Log) -> str:
    """tsMuxeR を実行し、進捗行をその場で更新表示する。"""
    log.cmd(argv)
    try:
        proc = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, bufsize=0)
    except FileNotFoundError as exc:
        raise BdMakeError(stage, f"コマンドが見つかりません: {argv[0]}", str(exc)) from exc

    progress = Progress(log, label, None)
    tail: deque[str] = deque(maxlen=80)
    full: list[str] = []
    buf = ""
    assert proc.stdout is not None
    while True:
        chunk = proc.stdout.read(256)
        if not chunk:
            break
        buf += chunk.decode("utf-8", errors="replace")
        parts = re.split(r"[\r\n]", buf)
        buf = parts.pop()
        for part in parts:
            part = part.strip()
            if not part:
                continue
            tail.append(part)
            full.append(part)
            progress.text(part)
    if buf.strip():
        tail.append(buf.strip())
        full.append(buf.strip())
    proc.wait()
    progress.finish(ok=proc.returncode == 0)
    if proc.returncode != 0:
        raise BdMakeError(
            stage,
            f"tsMuxeR が終了コード {proc.returncode} で失敗しました",
            "\n".join(tail),
            "meta ファイルを --keep-temp で残し、tsMuxeR に直接渡すと詳細を確認できます。",
        )
    return "\n".join(full)


# --------------------------------------------------------------------------
# 依存ツールの確認
# --------------------------------------------------------------------------


@dataclass
class Tools:
    ffmpeg: str
    ffprobe: str
    tsmuxer: str
    filters: set[str] = field(default_factory=set)
    encoders: set[str] = field(default_factory=set)


def install_hint() -> str:
    system = platform.system()
    if system == "Darwin":
        return (
            "ffmpeg / ffprobe:\n"
            "  brew install ffmpeg\n"
            "tsMuxeR（Homebrew では配布されていないため、公式の zip を展開して配置します）:\n"
            "  1. https://github.com/justdan96/tsMuxer/releases から\n"
            "     Apple Silicon 版（tsMuxeR_mac_arm.zip など）をダウンロード\n"
            "  2. unzip して tsMuxeR を PATH の通った場所へ:\n"
            "       sudo install -m 755 tsMuxeR /usr/local/bin/tsMuxeR\n"
            "  3. 依存ライブラリが不足する場合: brew install freetype zlib\n"
            "  4. Gatekeeper に止められる場合:\n"
            "       xattr -dr com.apple.quarantine /usr/local/bin/tsMuxeR\n"
            "PATH に置かず、場所を直接指定することもできます:\n"
            "  export BDMAKE_TSMUXER=/Applications/tsMuxerGUI.app/Contents/MacOS/tsMuxeR"
        )
    if system == "Linux":
        return (
            "ffmpeg / ffprobe:\n"
            "  sudo apt install ffmpeg       # Debian / Ubuntu\n"
            "  sudo dnf install ffmpeg       # Fedora\n"
            "tsMuxeR:\n"
            "  https://github.com/justdan96/tsMuxer/releases から Linux 版 zip を取得し、\n"
            "  展開した tsMuxeR に実行権限を付けて PATH の通った場所に置いてください:\n"
            "    sudo install -m 755 tsMuxeR /usr/local/bin/tsMuxeR\n"
            "場所を直接指定する場合:\n"
            "  export BDMAKE_TSMUXER=/opt/tsMuxeR/tsMuxeR"
        )
    return (
        "ffmpeg / ffprobe: https://ffmpeg.org/download.html\n"
        "tsMuxeR:          https://github.com/justdan96/tsMuxer/releases\n"
        "場所を直接指定する場合は環境変数 BDMAKE_TSMUXER を設定してください。"
    )


def find_tsmuxer() -> str | None:
    env = os.environ.get("BDMAKE_TSMUXER")
    if env:
        path = Path(os.path.expanduser(env))
        if path.is_file() and os.access(path, os.X_OK):
            return str(path)
        return None
    for name in TSMUXER_NAMES:
        found = shutil.which(name)
        if found:
            return found
    for candidate in TSMUXER_EXTRA_PATHS:
        path = Path(os.path.expanduser(candidate))
        if path.is_file() and os.access(path, os.X_OK):
            return str(path)
    return None


def check_dependencies(log: Log) -> Tools:
    stage = "依存ツールの確認"
    missing: list[str] = []

    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    tsmuxer = find_tsmuxer()
    for name, path in (("ffmpeg", ffmpeg), ("ffprobe", ffprobe), ("tsMuxeR", tsmuxer)):
        if path:
            log.item(name, path)
        else:
            missing.append(name)

    if missing:
        raise BdMakeError(
            stage,
            "必要な外部ツールが見つかりません: " + " / ".join(missing),
            hint=install_hint(),
        )

    assert ffmpeg and ffprobe and tsmuxer
    tools = Tools(ffmpeg=ffmpeg, ffprobe=ffprobe, tsmuxer=tsmuxer)

    version_line = run_capture([ffmpeg, "-hide_banner", "-version"], stage).splitlines()[0]
    log.item("ffmpeg版", version_line)

    filters_out = run_capture([ffmpeg, "-hide_banner", "-filters"], stage)
    tools.filters = {m.group(1) for m in re.finditer(r"^\s*\S+\s+(\S+)\s+\S+->\S+", filters_out, re.M)}
    encoders_out = run_capture([ffmpeg, "-hide_banner", "-encoders"], stage)
    tools.encoders = {m.group(1) for m in re.finditer(r"^\s*[VAS][^\s]*\s+(\S+)", encoders_out, re.M)}

    for encoder, why in (("libx264", "H.264 映像エンコード"), ("ac3", "AC-3 音声エンコード")):
        if encoder not in tools.encoders:
            raise BdMakeError(
                stage,
                f"ffmpeg に {encoder} エンコーダ（{why}）が含まれていません",
                hint=install_hint(),
            )
    return tools


# --------------------------------------------------------------------------
# 入力の解析
# --------------------------------------------------------------------------


@dataclass
class SourceInfo:
    path: Path
    duration: float
    size: int
    video_index: int
    width: int
    height: int
    sar: Fraction
    dar: Fraction
    fps: Fraction
    codec: str
    pix_fmt: str
    bit_depth: int
    color_trc: str
    color_primaries: str
    color_space: str
    color_range: str
    field_order: str
    hdr_kind: str            # "PQ" / "HLG" / ""
    audio_index: int | None
    audio_codec: str
    audio_channels: int
    audio_layout: str
    audio_rate: int
    audio_bit_rate: int
    audio_lang: str
    audio_count: int
    subtitle_count: int

    @property
    def is_hdr(self) -> bool:
        return bool(self.hdr_kind)

    @property
    def is_4k(self) -> bool:
        return self.width >= 3840 or self.height >= 2160


def parse_fraction(value, default: Fraction) -> Fraction:
    if not value:
        return default
    try:
        frac = Fraction(str(value).replace(":", "/"))
    except (ValueError, ZeroDivisionError):
        return default
    return frac if frac > 0 else default


def probe_source(path: Path, tools: Tools, log: Log) -> SourceInfo:
    stage = "入力の解析"
    if not path.is_file():
        raise BdMakeError(stage, f"入力ファイルがありません: {path}")

    raw = run_capture(
        [tools.ffprobe, "-v", "error", "-print_format", "json",
         "-show_format", "-show_streams", str(path)],
        stage,
    )
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise BdMakeError(stage, "ffprobe の出力を解釈できませんでした", raw[:2000]) from exc

    streams = data.get("streams", [])
    fmt = data.get("format", {})

    videos = [s for s in streams
              if s.get("codec_type") == "video"
              and s.get("disposition", {}).get("attached_pic", 0) != 1]
    if not videos:
        raise BdMakeError(stage, "映像トラックが見つかりません（静止画や音声のみのファイルは変換できません）")
    video = videos[0]

    audios = [s for s in streams if s.get("codec_type") == "audio"]
    subtitles = [s for s in streams if s.get("codec_type") == "subtitle"]
    audio = audios[0] if audios else None

    width = int(video.get("width") or 0)
    height = int(video.get("height") or 0)
    if width <= 0 or height <= 0:
        raise BdMakeError(stage, "映像の解像度を取得できませんでした")

    sar = parse_fraction(video.get("sample_aspect_ratio"), Fraction(1, 1))
    dar = parse_fraction(video.get("display_aspect_ratio"), Fraction(width, height) * sar)
    fps = parse_fraction(video.get("avg_frame_rate"), Fraction(0))
    if fps <= 0:
        fps = parse_fraction(video.get("r_frame_rate"), Fraction(24000, 1001))

    duration = 0.0
    for candidate in (fmt.get("duration"), video.get("duration")):
        try:
            duration = float(candidate)
            break
        except (TypeError, ValueError):
            continue
    if duration <= 0:
        raise BdMakeError(stage, "再生時間を取得できませんでした（破損したファイルの可能性があります）")

    trc = (video.get("color_transfer") or "").lower()
    hdr_kind = ""
    if trc in ("smpte2084", "smpte-st-2084", "pq"):
        hdr_kind = "PQ"
    elif trc in ("arib-std-b67", "hlg"):
        hdr_kind = "HLG"

    pix_fmt = video.get("pix_fmt") or "yuv420p"
    bit_depth = int(video.get("bits_per_raw_sample") or (10 if "10" in pix_fmt else 8))

    lang = ""
    if audio:
        lang = str((audio.get("tags") or {}).get("language", "")).lower()
    if not re.fullmatch(r"[a-z]{3}", lang or ""):
        lang = "und"

    info = SourceInfo(
        path=path,
        duration=duration,
        size=int(fmt.get("size") or path.stat().st_size),
        video_index=int(video.get("index", 0)),
        width=width,
        height=height,
        sar=sar,
        dar=dar,
        fps=fps,
        codec=video.get("codec_name", "?"),
        pix_fmt=pix_fmt,
        bit_depth=bit_depth,
        color_trc=trc or "unknown",
        color_primaries=(video.get("color_primaries") or "unknown").lower(),
        color_space=(video.get("color_space") or "unknown").lower(),
        color_range=(video.get("color_range") or "tv").lower(),
        field_order=(video.get("field_order") or "progressive").lower(),
        hdr_kind=hdr_kind,
        audio_index=int(audio["index"]) if audio else None,
        audio_codec=audio.get("codec_name", "") if audio else "",
        audio_channels=int(audio.get("channels") or 0) if audio else 0,
        audio_layout=audio.get("channel_layout", "") if audio else "",
        audio_rate=int(audio.get("sample_rate") or 0) if audio else 0,
        audio_bit_rate=int(audio.get("bit_rate") or 0) if audio else 0,
        audio_lang=lang,
        audio_count=len(audios),
        subtitle_count=len(subtitles),
    )

    log.item("ファイル", f"{path.name}（{fmt_bytes(info.size)}）")
    log.item("再生時間", fmt_hms(duration))
    log.item("映像", f"{info.codec} {width}x{height} {float(fps):.3f}fps "
                     f"{pix_fmt}({bit_depth}bit) SAR {sar.numerator}:{sar.denominator} "
                     f"DAR {dar.numerator}:{dar.denominator}")
    log.item("カラー", f"transfer={info.color_trc} primaries={info.color_primaries} "
                       f"matrix={info.color_space} range={info.color_range}"
                       + (f" → {hdr_kind} (HDR) と判定" if hdr_kind else ""))
    if audio:
        rate_text = f" {info.audio_bit_rate // 1000}kbps" if info.audio_bit_rate else ""
        log.item("音声", f"{info.audio_codec} {info.audio_channels}ch "
                         f"{info.audio_layout or '?'} {info.audio_rate}Hz{rate_text} "
                         f"lang={info.audio_lang}")
    else:
        log.item("音声", "なし")
    if info.audio_count > 1:
        log.note(f"音声トラックが {info.audio_count} 本あります。先頭のみを使用します。")
    if info.subtitle_count:
        log.note(f"字幕トラックが {info.subtitle_count} 本ありますが、本ツールでは取り込みません。")
    return info


# --------------------------------------------------------------------------
# 変換プランの決定
# --------------------------------------------------------------------------


@dataclass
class Plan:
    width: int
    height: int
    fps_label: str
    coded_fps: Fraction
    input_rate: Fraction          # フィルタチェーン先頭で揃えるフレームレート
    scan: str
    sar: Fraction
    scale_w: int
    scale_h: int
    pad_x: int
    pad_y: int
    keyint: int
    refs: int
    tonemap: bool
    video_bps: int
    notes: list[str] = field(default_factory=list)

    @property
    def display_format(self) -> str:
        """1080p23.976 / 1080i59.94 のような表示用の形式名。"""
        if self.scan == SCAN_PROGRESSIVE:
            return f"{self.height}p{self.fps_label}"
        return f"{self.height}i{FIELD_RATE_LABEL.get(self.fps_label, self.fps_label)}"

    @property
    def letterboxed(self) -> bool:
        return self.pad_x > 0 or self.pad_y > 0


def choose_fps_label(src_fps: Fraction) -> str:
    """元 fps に最も近い候補を選ぶ（比率の対数距離で比較）。"""
    src = float(src_fps)
    best = min(FPS_CANDIDATES, key=lambda k: abs(math.log(src / float(FPS_CANDIDATES[k]))))
    return best


def choose_resolution(src: SourceInfo, fps_label: str) -> tuple[int, int]:
    if src.height > 720 or src.width > 1280:
        return RES_1080
    if src.height > 576 or src.width > 720:
        return RES_720
    # SD 素材。720x480 は NTSC（59.94i）専用のため、PAL 系 fps は 720p へ引き上げる。
    if fps_label in NTSC_RATES:
        return RES_480
    return RES_720


def resolve_scan(resolution: tuple[int, int], fps_label: str, no_interlace: bool
                 ) -> tuple[tuple[int, int], str, str, Fraction, list[str]]:
    """(解像度, 符号化fpsラベル) を BD が許容する組み合わせへ寄せる。

    戻り値: (解像度, 符号化fpsラベル, 走査方式, フィルタ入力fps, メモ)
    """
    notes: list[str] = []
    width, height = resolution

    if resolution == RES_1080:
        if fps_label in ("23.976", "24"):
            return resolution, fps_label, SCAN_PROGRESSIVE, FPS_CANDIDATES[fps_label], notes
        if fps_label in ("25", "29.97"):
            # BD の 1920x1080 に 25p/29.97p は存在しないため、
            # 中身は進行形式のままインターレースとして信号化する（x264 --fake-interlaced）。
            field_rate = "50" if fps_label == "25" else "59.94"
            notes.append(f"1080p{fps_label} は BD 規格に無いため、"
                         f"進行形式のまま 1080i{field_rate} として信号化します（画質劣化なし）")
            return resolution, fps_label, SCAN_PSF, FPS_CANDIDATES[fps_label], notes
        # 50 / 59.94
        if no_interlace:
            new_res = RES_720
            notes.append(f"1080p{fps_label} は BD 規格外（level 4.2 相当）のため、"
                         f"--no-interlace 指定により 1280x720p{fps_label} へ変更します")
            return new_res, fps_label, SCAN_PROGRESSIVE, FPS_CANDIDATES[fps_label], notes
        coded = "25" if fps_label == "50" else "29.97"
        notes.append(f"1080p{fps_label} は BD 規格外（level 4.2 相当）のため、"
                     f"1080i{fps_label} へインターレース化します"
                     f"（--no-interlace 指定時は 1280x720p{fps_label} を選択）")
        return resolution, coded, SCAN_INTERLACED, FPS_CANDIDATES[fps_label], notes

    if resolution == RES_720:
        if fps_label in ("23.976", "24", "50", "59.94"):
            return resolution, fps_label, SCAN_PROGRESSIVE, FPS_CANDIDATES[fps_label], notes
        # 720p25 / 720p29.97 は BD に無いので倍のフレームレートへ（フレーム二度打ち）
        doubled = "50" if fps_label == "25" else "59.94"
        notes.append(f"1280x720p{fps_label} は BD 規格に無いため、{doubled}fps へフレーム倍化します")
        return resolution, doubled, SCAN_PROGRESSIVE, FPS_CANDIDATES[doubled], notes

    # 720x480 は 59.94i（符号化 29.97fps）のみ
    if fps_label in ("23.976", "24"):
        notes.append(f"720x480 は 59.94i のみのため、{fps_label}fps を 2:3 のパターンで "
                     "29.97fps へ変換し、480i59.94 として信号化します")
        return resolution, "29.97", SCAN_PSF, FPS_CANDIDATES["29.97"], notes
    if fps_label == "59.94":
        notes.append("720x480 は 59.94i のみのため、59.94fps をインターレース化します")
        return resolution, "29.97", SCAN_INTERLACED, FPS_CANDIDATES["59.94"], notes
    notes.append("720x480 は 59.94i のみのため、進行形式のまま 480i59.94 として信号化します")
    return resolution, "29.97", SCAN_PSF, FPS_CANDIDATES["29.97"], notes


def compute_scale_pad(src: SourceInfo, width: int, height: int, sar: Fraction
                      ) -> tuple[int, int, int, int]:
    """ストレッチせずに 16:9 の枠へ収める拡縮サイズと余白位置を求める。"""
    src_dar = Fraction(src.width, src.height) * src.sar
    effective = src_dar / sar                      # 符号化画素空間での縦横比
    frame = Fraction(width, height)
    if effective > frame:                          # 横長 → 上下に黒帯
        scale_w = width
        scale_h = int(round(width / float(effective)))
    else:                                          # 縦長 → 左右に黒帯
        scale_h = height
        scale_w = int(round(height * float(effective)))
    scale_w = max(2, min(width, scale_w - (scale_w % 2)))
    scale_h = max(2, min(height, scale_h - (scale_h % 2)))
    pad_x = ((width - scale_w) // 2) & ~1
    pad_y = ((height - scale_h) // 2) & ~1
    return scale_w, scale_h, pad_x, pad_y


def build_plan(src: SourceInfo, args, tools: Tools, log: Log) -> Plan:
    stage = "変換プランの決定"
    notes: list[str] = []

    fps_label = choose_fps_label(src.fps)
    if abs(float(src.fps) - float(FPS_CANDIDATES[fps_label])) > 0.01:
        notes.append(f"フレームレートを {float(src.fps):.3f}fps → {fps_label}fps へ正規化します")

    resolution = choose_resolution(src, fps_label)
    resolution, coded_label, scan, input_rate, scan_notes = resolve_scan(
        resolution, fps_label, args.no_interlace
    )
    notes.extend(scan_notes)
    width, height = resolution

    sar = Fraction(40, 33) if resolution == RES_480 else Fraction(1, 1)
    scale_w, scale_h, pad_x, pad_y = compute_scale_pad(src, width, height, sar)

    frame_note = "" if (scale_w, scale_h) == (width, height) else f"（{width}x{height} の枠内）"
    if src.is_4k:
        notes.append(f"4K 入力（{src.width}x{src.height}）を検出したため、"
                     f"lanczos で {scale_w}x{scale_h}{frame_note} へダウンスケールします。"
                     "UHD BD は一般プレーヤーとの互換性を確保できないため非対応です")
    elif (src.width, src.height) != (scale_w, scale_h):
        direction = "縮小" if src.width * src.height > scale_w * scale_h else "拡大"
        notes.append(f"映像を {src.width}x{src.height} → {scale_w}x{scale_h} へ{direction}し、"
                     f"{width}x{height} の枠に収めます（lanczos）")
    else:
        notes.append(f"映像は {src.width}x{src.height} のまま {width}x{height} の枠に配置します")

    if pad_y > 0:
        notes.append(f"16:9 ではないため、上下に {pad_y}px ずつ黒帯を追加します（レターボックス／引き伸ばしなし）")
    if pad_x > 0:
        notes.append(f"16:9 ではないため、左右に {pad_x}px ずつ黒帯を追加します（ピラーボックス／引き伸ばしなし）")

    tonemap = src.is_hdr
    if tonemap:
        if "zscale" not in tools.filters:
            raise BdMakeError(
                stage,
                "HDR 入力ですが、この ffmpeg には zscale フィルタが含まれていません",
                hint=("libzimg 付きの ffmpeg が必要です。\n"
                      "  macOS:  brew install ffmpeg\n"
                      "  Linux:  ディストリビューションの ffmpeg（--enable-libzimg 付き）を利用してください"),
            )
        if "tonemap" not in tools.filters:
            raise BdMakeError(
                stage, "HDR 入力ですが、この ffmpeg には tonemap フィルタが含まれていません",
                hint="ffmpeg を再インストールしてください。",
            )
        notes.append(f"HDR（{src.hdr_kind}）入力を検出したため、zscale + tonemap(hable) で "
                     "SDR BT.709 へトーンマッピングします")

    coded_fps = FPS_CANDIDATES[coded_label]
    keyint = max(1, int(round(float(coded_fps))))
    refs = 4 if height >= 1080 else 6

    plan = Plan(
        width=width, height=height,
        fps_label=coded_label, coded_fps=coded_fps, input_rate=input_rate,
        scan=scan, sar=sar,
        scale_w=scale_w, scale_h=scale_h, pad_x=pad_x, pad_y=pad_y,
        keyint=keyint, refs=refs, tonemap=tonemap,
        video_bps=args.bitrate, notes=notes,
    )

    scan_label = {
        SCAN_PROGRESSIVE: "プログレッシブ",
        SCAN_PSF: "プログレッシブ（インターレース信号化 / PsF）",
        SCAN_INTERLACED: "インターレース",
    }[scan]
    log.item("映像", f"H.264 High@L4.1 {width}x{height} {coded_label}fps {scan_label} "
                     f"SAR {sar.numerator}:{sar.denominator} / 表示 16:9")
    log.item("ビットレート", f"{plan.video_bps / 1_000_000:.1f} Mbps"
                             f"（VBV maxrate {VBV_MAXRATE_KBPS}kbps / bufsize {VBV_BUFSIZE_KBIT}kbit）")
    log.item("音声", audio_summary(src))
    for note in notes:
        log.note(note)
    return plan


# --------------------------------------------------------------------------
# 容量の見積もり
# --------------------------------------------------------------------------


def estimate_and_warn(src: SourceInfo, plan: Plan, out_dir: Path, want_iso: bool, log: Log) -> int:
    total_bps = plan.video_bps + AC3_BITRATE_KBPS * 1000
    estimated = int(total_bps / 8 * src.duration * MUX_OVERHEAD)
    log.item("推定サイズ", f"{fmt_bytes(estimated)}"
                           f"（BD-R 25GB の {estimated / BD_R_SL_BYTES * 100:.1f}%）")

    def recommend(capacity: int) -> float:
        usable = capacity * 0.97
        bps = usable * 8 / src.duration / MUX_OVERHEAD - AC3_BITRATE_KBPS * 1000
        return max(0.0, bps / 1_000_000)

    if estimated > BD_R_DL_BYTES:
        log.warn(f"推定サイズ {fmt_bytes(estimated)} が BD-R 50GB（2層）を超える見込みです。")
        log.warn(f"推奨ビットレート: 25GB に収めるなら --bitrate {recommend(BD_R_SL_BYTES):.1f}M / "
                 f"50GB なら --bitrate {recommend(BD_R_DL_BYTES):.1f}M")
    elif estimated > BD_R_SL_BYTES:
        log.warn(f"推定サイズ {fmt_bytes(estimated)} が BD-R 25GB（1層）を超える見込みです"
                 "（50GB の2層メディアには収まります）。")
        log.warn(f"25GB に収めるなら --bitrate {recommend(BD_R_SL_BYTES):.1f}M を指定してください。")
    else:
        log.info("BD-R 25GB（1層）に収まる見込みです。")

    # 中間ファイル + BDMV（+ ISO）分の空き容量を確認する
    needed = int(estimated * (3 if want_iso else 2))
    try:
        free = shutil.disk_usage(out_dir).free
    except OSError:
        return estimated
    if free < needed:
        log.warn(f"出力先の空き容量が不足する可能性があります"
                 f"（必要 約{fmt_bytes(needed)} / 空き {fmt_bytes(free)}）。")
    return estimated


# --------------------------------------------------------------------------
# エンコード
# --------------------------------------------------------------------------


def fps_filter_value(rate: Fraction) -> str:
    return f"{rate.numerator}/{rate.denominator}"


def build_video_filters(src: SourceInfo, plan: Plan) -> str:
    parts: list[str] = []

    # 1) 可変フレームレート素材も含めて、まず目的のレートへ揃える（BD は CFR 必須）
    parts.append(f"fps=fps={fps_filter_value(plan.input_rate)}")

    if plan.tonemap:
        # 2) HDR → SDR。リニア光で縮小してからトーンマップする（画質・速度の両面で有利）
        tin = "smpte2084" if src.hdr_kind == "PQ" else "arib-std-b67"
        pin = src.color_primaries if src.color_primaries in ("bt2020", "bt709") else "bt2020"
        matrix_in = {"bt2020nc": "bt2020nc", "bt2020_ncl": "bt2020nc", "bt709": "bt709"}
        min_ = matrix_in.get(src.color_space, "bt2020nc")
        rin = "full" if src.color_range in ("pc", "full") else "limited"
        parts.append(f"zscale=tin={tin}:min={min_}:pin={pin}:rin={rin}:t=linear:npl=100")
        parts.append("format=gbrpf32le")
        if (plan.scale_w, plan.scale_h) != (src.width, src.height):
            parts.append(f"zscale=w={plan.scale_w}:h={plan.scale_h}:f=lanczos")
        parts.append("zscale=p=bt709")
        parts.append("tonemap=tonemap=hable:desat=0")
        parts.append("zscale=t=bt709:m=bt709:r=limited")
        parts.append("format=yuv420p")
    else:
        scale = f"scale={plan.scale_w}:{plan.scale_h}:flags=lanczos"
        # BT.601 など BT.709 以外で符号化された素材は、拡縮と同時に BT.709 へ変換する
        matrix_map = {"bt470bg": "bt470bg", "smpte170m": "smpte170m", "bt601": "bt470bg"}
        if src.color_space in matrix_map:
            scale += f":in_color_matrix={matrix_map[src.color_space]}:out_color_matrix=bt709"
        parts.append(scale)
        parts.append("format=yuv420p")

    # 3) 黒帯の付加（ストレッチはしない）
    if plan.letterboxed:
        parts.append(f"pad={plan.width}:{plan.height}:{plan.pad_x}:{plan.pad_y}:color=black")

    parts.append(f"setsar={plan.sar.numerator}/{plan.sar.denominator}")

    # 4) インターレース化は、すべての空間処理のあとに行う
    #    （入力レートが符号化レートの 2 倍のときだけ、2 フレーム → 1 フレーム 2 フィールド）
    if plan.scan == SCAN_INTERLACED and plan.input_rate != plan.coded_fps:
        parts.append("interlace=scan=tff:lowpass=complex")

    return ",".join(parts)


def build_x264_params(plan: Plan) -> str:
    params = [
        "bluray-compat=1",
        f"vbv-maxrate={VBV_MAXRATE_KBPS}",
        f"vbv-bufsize={VBV_BUFSIZE_KBIT}",
        "open-gop=1",
        "slices=4",
        "aud=1",
        "nal-hrd=vbr",
        f"level={H264_LEVEL}",
        f"keyint={plan.keyint}",
        "min-keyint=1",
        "bframes=3",
        "b-pyramid=strict",
        f"ref={plan.refs}",
        "weightp=1",
        "colorprim=bt709",
        "transfer=bt709",
        "colormatrix=bt709",
    ]
    if plan.scan == SCAN_INTERLACED:
        params.append("tff=1")
    elif plan.scan == SCAN_PSF:
        params.append("fake-interlaced=1")
    return ":".join(params)


def encode_video(src: SourceInfo, plan: Plan, tools: Tools, out_path: Path,
                 preset: str, log: Log) -> None:
    stage = "映像エンコード"
    filters = build_video_filters(src, plan)
    log.item("フィルタ", filters)
    argv = [
        tools.ffmpeg, "-hide_banner", "-nostdin", "-y",
        "-loglevel", "warning", "-nostats", "-progress", "pipe:1",
        "-i", str(src.path),
        "-map", f"0:{src.video_index}", "-an", "-sn", "-dn",
        "-vf", filters,
        "-c:v", "libx264",
        "-preset", preset,
        "-profile:v", H264_PROFILE,
        "-level:v", H264_LEVEL,
        "-pix_fmt", "yuv420p",
        "-b:v", str(plan.video_bps),
        "-maxrate", f"{VBV_MAXRATE_KBPS}k",
        "-bufsize", f"{VBV_BUFSIZE_KBIT}k",
        "-x264-params", build_x264_params(plan),
        "-color_primaries", "bt709", "-color_trc", "bt709",
        "-colorspace", "bt709", "-color_range", "tv",
        "-f", "h264", str(out_path),
    ]
    encoded = run_ffmpeg(argv, stage=stage, label="映像エンコード", total_sec=src.duration, log=log)
    if not out_path.is_file() or out_path.stat().st_size == 0:
        raise BdMakeError(stage, "映像の基本ストリームが生成されませんでした")
    if encoded > 0 and src.duration - encoded > max(1.0, src.duration * 0.02):
        log.warn(f"エンコードできた尺は {fmt_hms(encoded)} で、入力の {fmt_hms(src.duration)} より"
                 "短くなっています。入力ファイルが途中で壊れている可能性があります。")
    log.item("出力", f"{out_path.name}（{fmt_bytes(out_path.stat().st_size)}）")


def audio_summary(src: SourceInfo) -> str:
    """ログ表示用の音声フォーマット名。"""
    if src.audio_index is None:
        return f"AC-3 {AC3_SAMPLE_RATE // 1000}kHz {AC3_BITRATE_KBPS}kbps（無音を生成）"
    if is_bd_ready_ac3(src):
        return (f"AC-3 {AC3_SAMPLE_RATE // 1000}kHz {src.audio_bit_rate // 1000}kbps"
                "（入力の AC-3 をそのまま使用）")
    return f"AC-3 {AC3_SAMPLE_RATE // 1000}kHz {AC3_BITRATE_KBPS}kbps"


def is_bd_ready_ac3(src: SourceInfo) -> bool:
    """入力音声が BD-Video にそのまま載せられる AC-3 かどうか。"""
    return (src.audio_codec == "ac3"
            and src.audio_rate == AC3_SAMPLE_RATE
            and 0 < src.audio_channels <= AC3_MAX_CHANNELS
            and 0 < src.audio_bit_rate <= AC3_BITRATE_KBPS * 1000)


def encode_audio(src: SourceInfo, tools: Tools, out_path: Path, log: Log) -> None:
    stage = "音声エンコード"
    if src.audio_index is None:
        log.note("入力に音声がないため、無音の AC-3 トラックを生成します"
                 "（音声トラックの無いディスクは再生できないプレーヤーがあるため）")
        argv = [
            tools.ffmpeg, "-hide_banner", "-nostdin", "-y",
            "-loglevel", "warning", "-nostats", "-progress", "pipe:1",
            "-f", "lavfi", "-i", f"anullsrc=channel_layout=stereo:sample_rate={AC3_SAMPLE_RATE}",
            "-t", f"{src.duration:.3f}",
            "-c:a", "ac3", "-b:a", f"{AC3_BITRATE_KBPS}k", "-ar", str(AC3_SAMPLE_RATE),
            "-f", "ac3", str(out_path),
        ]
    elif is_bd_ready_ac3(src):
        log.note(f"入力音声がすでに BD 準拠の AC-3（{src.audio_rate}Hz "
                 f"{src.audio_bit_rate // 1000}kbps {src.audio_channels}ch）のため、"
                 "再エンコードせずそのまま取り出します。")
        argv = [
            tools.ffmpeg, "-hide_banner", "-nostdin", "-y",
            "-loglevel", "warning", "-nostats", "-progress", "pipe:1",
            "-i", str(src.path),
            "-map", f"0:{src.audio_index}", "-vn", "-sn", "-dn",
            "-c:a", "copy", "-f", "ac3", str(out_path),
        ]
    else:
        channels = src.audio_channels
        argv = [
            tools.ffmpeg, "-hide_banner", "-nostdin", "-y",
            "-loglevel", "warning", "-nostats", "-progress", "pipe:1",
            "-i", str(src.path),
            "-map", f"0:{src.audio_index}", "-vn", "-sn", "-dn",
            "-af", "aresample=async=1:first_pts=0",
            "-c:a", "ac3", "-b:a", f"{AC3_BITRATE_KBPS}k", "-ar", str(AC3_SAMPLE_RATE),
        ]
        if channels > AC3_MAX_CHANNELS:
            log.note(f"{channels}ch は AC-3 の上限（{AC3_MAX_CHANNELS}ch）を超えるため 5.1ch へダウンミックスします")
            argv += ["-ac", str(AC3_MAX_CHANNELS)]
        elif channels <= 0:
            argv += ["-ac", "2"]
        argv += ["-f", "ac3", str(out_path)]

    run_ffmpeg(argv, stage=stage, label="音声エンコード", total_sec=src.duration, log=log)
    if not out_path.is_file() or out_path.stat().st_size == 0:
        raise BdMakeError(stage, "音声の基本ストリームが生成されませんでした")
    log.item("出力", f"{out_path.name}（{fmt_bytes(out_path.stat().st_size)}）")


# --------------------------------------------------------------------------
# tsMuxeR
# --------------------------------------------------------------------------


def sanitize_label(name: str) -> str:
    label = re.sub(r"[^A-Za-z0-9_]+", "_", name).strip("_").upper()
    return (label or "BDMAKE")[:32]


def build_meta(video_es: Path, audio_es: Path, plan: Plan, chapter_interval: int,
               volume_label: str, audio_lang: str) -> str:
    muxopt = [
        "MUXOPT",
        "--no-pcr-on-video-pid",
        "--new-audio-pes",
        "--blu-ray",
        "--vbr",
        f"--vbv-len={VBV_LEN_MS}",
        f"--label={volume_label}",
    ]
    if chapter_interval > 0:
        muxopt.append(f"--auto-chapters={chapter_interval}")

    # level は meta で指定しない。x264 が SPS に 4.1 を書き込み済みで、
    # tsMuxeR の level 上書きは "4.1" を 4.0 に切り捨ててしまうため。
    video_line = ", ".join([
        "V_MPEG4/ISO/AVC",
        f'"{video_es}"',
        f"fps={plan.fps_label}",
        "insertSEI",
        "contSPS",
        "ar=16:9",
    ])
    audio_line = ", ".join([
        "A_AC3",
        f'"{audio_es}"',
        "timeshift=0ms",
        f"lang={audio_lang}",
    ])

    return "\n".join([" ".join(muxopt), video_line, audio_line]) + "\n"


def write_meta(meta_path: Path, text: str, log: Log) -> None:
    meta_path.write_text(text, encoding="utf-8")
    log.item("meta", str(meta_path))
    show_meta(text, log)


def show_meta(text: str, log: Log) -> None:
    for line in text.splitlines():
        log.info(f"    {line}")


def mux(tools: Tools, meta_path: Path, target: Path, *, stage: str, label: str, log: Log) -> None:
    run_tsmuxer([tools.tsmuxer, str(meta_path), str(target)], stage=stage, label=label, log=log)


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------


def parse_bitrate(text: str) -> int:
    match = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*([kKmM]?)(?:b(?:ps)?)?\s*", text)
    if not match:
        raise argparse.ArgumentTypeError(
            f"ビットレートの指定が不正です: {text!r}（例: 25M, 20000k, 25000000）")
    value = float(match.group(1))
    unit = match.group(2).lower()
    bps = int(value * {"": 1, "k": 1_000, "m": 1_000_000}[unit])
    if bps <= 0:
        raise argparse.ArgumentTypeError("ビットレートは正の値で指定してください")
    return bps


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="bdmake",
        description="MP4 から BD-Video（BDMV フォルダ構造 / ISO イメージ）を生成します。",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "例:\n"
            "  bdmake movie.mp4 -o ./disc\n"
            "  bdmake movie.mp4 -o ./disc --chapter-interval 5 --bitrate 25M --iso\n"
        ),
    )
    parser.add_argument("input", type=Path, help="入力 MP4 ファイル")
    parser.add_argument("-o", "--output", type=Path, required=True,
                        help="出力ディレクトリ（BDMV / CERTIFICATE を作成）")
    parser.add_argument("--chapter-interval", type=int, default=5, metavar="MIN",
                        help="チャプターを打つ間隔（分、0 で無効。既定: 5）")
    parser.add_argument("--bitrate", type=parse_bitrate, default=DEFAULT_BITRATE, metavar="RATE",
                        help=f"映像の平均ビットレート（例: 25M, 20000k。既定: {DEFAULT_BITRATE}）")
    parser.add_argument("--iso", action="store_true", help="ISO イメージも生成する")
    parser.add_argument("--keep-temp", action="store_true", help="中間ファイルを削除しない")
    parser.add_argument("--preset", default="medium",
                        choices=["ultrafast", "superfast", "veryfast", "faster", "fast",
                                 "medium", "slow", "slower", "veryslow"],
                        help="x264 のプリセット（既定: medium）")
    parser.add_argument("--volume-label", default=None, metavar="LABEL",
                        help="ISO のボリュームラベル（既定: 入力ファイル名から生成）")
    parser.add_argument("--audio-lang", default=None, metavar="XXX",
                        help="音声トラックの言語コード（ISO639 の3文字。既定: 入力のタグ、無ければ und）")
    parser.add_argument("--no-interlace", action="store_true",
                        help="1080p50/59.94 素材を 1080i 化せず、1280x720 の進行形式で出力する")
    parser.add_argument("--overwrite", action="store_true",
                        help="出力先に既存の BDMV があっても上書きする")
    parser.add_argument("--dry-run", action="store_true",
                        help="解析とプラン表示、実行コマンドの表示のみ行い、変換はしない")
    parser.add_argument("--version", action="version", version=f"bdmake {VERSION}")
    return parser


def run(args, log: Log) -> int:
    if isinstance(args.bitrate, str):
        args.bitrate = parse_bitrate(args.bitrate)
    if args.bitrate > MAX_BITRATE_BPS:
        log.warn(f"指定ビットレート {args.bitrate / 1e6:.1f}Mbps は BD の VBV 上限"
                 f"（{VBV_MAXRATE_KBPS / 1000:.0f}Mbps）を超えるため、上限値に丸めます。")
        args.bitrate = MAX_BITRATE_BPS
    if args.bitrate < MIN_BITRATE_BPS:
        log.warn(f"指定ビットレート {args.bitrate / 1e6:.1f}Mbps は低すぎるため "
                 f"{MIN_BITRATE_BPS / 1e6:.0f}Mbps に引き上げます。")
        args.bitrate = MIN_BITRATE_BPS
    if args.chapter_interval < 0:
        raise BdMakeError("引数の確認", "--chapter-interval には 0 以上の値を指定してください")
    if args.audio_lang and not re.fullmatch(r"[A-Za-z]{3}", args.audio_lang):
        raise BdMakeError("引数の確認", "--audio-lang は ISO639 の3文字コードで指定してください（例: jpn, eng）")

    log.total_steps = 7 + (1 if args.iso else 0) + (0 if args.keep_temp else 1)
    log.banner(f"{args.input} → {args.output}")

    log.step("依存ツールの確認")
    tools = check_dependencies(log)

    log.step("入力の解析（ffprobe）")
    src = probe_source(args.input, tools, log)

    log.step("変換プランの決定")
    plan = build_plan(src, args, tools, log)

    out_dir: Path = args.output
    bdmv_dir = out_dir / "BDMV"

    if bdmv_dir.exists() and not args.dry_run:
        if not args.overwrite:
            raise BdMakeError(
                "出力先の確認",
                f"出力先に BDMV が既に存在します: {bdmv_dir}",
                hint=("別の出力先を指定するか、--overwrite を付けて実行してください。\n"
                      "（古い m2ts が残ったまま多重化すると、再生できないディスクになります）"),
            )
        # 前回の m2ts が残ったまま多重化すると壊れたディスクになるため、
        # --overwrite のときは BDMV / CERTIFICATE だけを作り直す（他のファイルは触らない）。
        log.warn(f"既存の BDMV / CERTIFICATE を削除して作り直します: {out_dir}")
        shutil.rmtree(bdmv_dir, ignore_errors=True)
        shutil.rmtree(out_dir / "CERTIFICATE", ignore_errors=True)
    if not args.dry_run:
        out_dir.mkdir(parents=True, exist_ok=True)
    estimate_and_warn(src, plan, out_dir if out_dir.is_dir() else Path.cwd(), args.iso, log)

    tmp_dir = out_dir / "_bdmake_tmp"
    video_es = tmp_dir / "video.264"
    audio_es = tmp_dir / "audio.ac3"
    meta_path = tmp_dir / "bdmake.meta"
    volume_label = sanitize_label(args.volume_label or args.input.stem)
    audio_lang = (args.audio_lang or src.audio_lang or "und").lower()

    meta_text = build_meta(video_es, audio_es, plan, args.chapter_interval,
                           volume_label, audio_lang)

    if args.dry_run:
        log.step("映像エンコード（--dry-run のため実行しません）")
        log.item("フィルタ", build_video_filters(src, plan))
        log.item("x264", build_x264_params(plan))
        log.step("音声エンコード（--dry-run のため実行しません）")
        log.step("meta ファイルの生成（--dry-run のため書き出しません）")
        log.item("meta", str(meta_path))
        show_meta(meta_text, log)
        log.step("BDMV の多重化（--dry-run のため実行しません）")
        log.cmd([tools.tsmuxer, str(meta_path), str(out_dir)])
        if args.iso:
            log.step("ISO の生成（--dry-run のため実行しません）")
            log.cmd([tools.tsmuxer, str(meta_path), str(out_dir / f"{args.input.stem}.iso")])
        if not args.keep_temp:
            log.step("中間ファイルの削除（--dry-run のため実行しません）")
        log._write()
        log.info("--dry-run のため、ファイルは何も作成していません。")
        return 0

    tmp_dir.mkdir(exist_ok=True)
    iso_path = out_dir / f"{args.input.stem}.iso"

    try:
        log.step("映像エンコード（ffmpeg → H.264 基本ストリーム）")
        encode_video(src, plan, tools, video_es, args.preset, log)

        log.step("音声エンコード（ffmpeg → AC-3 基本ストリーム）")
        encode_audio(src, tools, audio_es, log)

        log.step("meta ファイルの生成")
        write_meta(meta_path, meta_text, log)

        log.step("BDMV の多重化（tsMuxeR）")
        mux(tools, meta_path, out_dir, stage="BDMV の多重化", label="BDMV 多重化", log=log)
        if not (out_dir / "BDMV" / "index.bdmv").is_file():
            raise BdMakeError("BDMV の多重化", "BDMV/index.bdmv が生成されませんでした")
        log.item("出力", str(out_dir))

        if args.iso:
            log.step("ISO イメージの生成（tsMuxeR）")
            log.note("ISO は基本ストリームから直接生成するため、多重化をもう一度実行します。")
            mux(tools, meta_path, iso_path, stage="ISO イメージの生成", label="ISO 生成", log=log)
            if not iso_path.is_file():
                raise BdMakeError("ISO イメージの生成", f"ISO が生成されませんでした: {iso_path}")
            log.item("出力", f"{iso_path}（{fmt_bytes(iso_path.stat().st_size)}）")
    except BdMakeError as exc:
        # 失敗したときは中間ファイルを残し、原因調査に使えるようにする
        if tmp_dir.is_dir():
            note = f"中間ファイルは {tmp_dir} に残しています（原因調査のあと削除してください）。"
            exc.hint = f"{exc.hint}\n{note}" if exc.hint else note
        raise

    if args.keep_temp:
        log.note(f"--keep-temp のため中間ファイルを残しました: {tmp_dir}")
        log.note("ディスクとして焼く際は BDMV / CERTIFICATE のみを対象にしてください。")
    else:
        log.step("中間ファイルの削除")
        shutil.rmtree(tmp_dir, ignore_errors=True)
        log.item("削除", str(tmp_dir))

    total_size = sum(f.stat().st_size for f in (out_dir / "BDMV").rglob("*") if f.is_file())
    log._write()
    log._write(log._c("1;32", "完了しました。"))
    log.item("BDMV", f"{out_dir}（{fmt_bytes(total_size)}）")
    if args.iso:
        log.item("ISO", f"{iso_path}（{fmt_bytes(iso_path.stat().st_size)}）")
    log.item("形式", f"{plan.width}x{plan.height} / {plan.display_format} / "
                     f"H.264 High@L{H264_LEVEL} + {audio_summary(src)}")
    log.info("VLC では「メディアを開く → フォルダーを開く」で出力ディレクトリを指定すると再生を確認できます。")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    log = Log()
    try:
        return run(args, log)
    except BdMakeError as exc:
        exc.report(log)
        return 1
    except OSError as exc:
        BdMakeError("ファイル操作", str(exc),
                    hint="出力先の書き込み権限と空き容量を確認してください。").report(log)
        return 1
    except KeyboardInterrupt:
        log._write()
        log.error("中断されました。")
        return 130


if __name__ == "__main__":
    sys.exit(main())
