import re
import threading
from pathlib import Path

from faster_whisper import WhisperModel

from .config import WHISPER_DIR

_model_lock = threading.Lock()
_model_cache = {}
_model_key = None


def _resolve_model(name: str) -> str:
    local = WHISPER_DIR / name
    if (local / "model.bin").exists():
        return str(local)
    return name


def _get_model(name: str, compute_type: str):
    global _model_key
    key = f"{name}|{compute_type}"
    if _model_key == key and key in _model_cache:
        return _model_cache[key]
    model = WhisperModel(
        _resolve_model(name),
        device="cpu",
        compute_type=compute_type,
        cpu_threads=8,
        num_workers=1,
        download_root=str(WHISPER_DIR),
    )
    _model_cache[key] = model
    _model_key = key
    return model


def clean_text(text: str) -> str:
    text = text or ""
    text = re.sub(r"(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])", "", text)
    text = re.sub(r"(?<=[\u4e00-\u9fff])\s+(?=[，。！？、；：])", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def build_initial_prompt(settings: dict, profile: dict) -> str:
    base = (settings.get("initial_prompt") or "").strip()
    profile = profile or {}
    extras = []
    for key in ("name", "location", "unit", "role"):
        value = str(profile.get(key, "") or "").strip()
        if value:
            extras.append(value)
    if extras:
        base = f"{base} 受访者{'，'.join(extras)}。"
    return base[:800]


def transcribe(
    audio_path: str | Path,
    settings: dict,
    profile: dict | None = None,
    progress_cb=None,
) -> dict:
    name = settings.get("whisper_model") or "small"
    compute_type = settings.get("whisper_compute_type") or "int8"
    language = settings.get("language") or "zh"
    if language == "auto":
        language = None

    if progress_cb:
        progress_cb(0.02, "正在加载语音模型（首次使用需要等待）")

    with _model_lock:
        model = _get_model(name, compute_type)
        if progress_cb:
            progress_cb(0.06, "正在识别语音")
        segments_iter, info = model.transcribe(
            str(audio_path),
            language=language,
            beam_size=5,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
            initial_prompt=build_initial_prompt(settings, profile or {}),
            condition_on_previous_text=False,
            without_timestamps=False,
        )
        duration = float(getattr(info, "duration", 0) or 0)
        segments = []
        text_parts = []
        for index, segment in enumerate(segments_iter):
            text = clean_text(segment.text)
            if not text:
                continue
            segments.append(
                {
                    "id": index,
                    "start": round(float(segment.start), 2),
                    "end": round(float(segment.end), 2),
                    "text": text,
                }
            )
            text_parts.append(text)
            if progress_cb and duration > 0:
                ratio = min(0.98, max(0.06, float(segment.end) / duration))
                progress_cb(ratio, "正在识别语音")

    if progress_cb:
        progress_cb(1.0, "转写完成")
    return {
        "text": "\n".join(text_parts).strip(),
        "segments": segments,
        "language": getattr(info, "language", language) or "zh",
        "duration": round(duration, 2),
        "model": name,
    }
