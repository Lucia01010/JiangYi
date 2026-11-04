import json
import re
import threading
from pathlib import Path

from . import BASE_DIR, CACHE_DIR

DATA_DIR = BASE_DIR / "data"
AUDIO_DIR = DATA_DIR / "audio"
EXPORT_DIR = DATA_DIR / "exports"
TMP_DIR = DATA_DIR / "tmp"
WEB_DIR = BASE_DIR / "web"
DB_PATH = DATA_DIR / "app.db"
SETTINGS_PATH = DATA_DIR / "settings.json"
WHISPER_DIR = CACHE_DIR / "whisper"

for _dir in (DATA_DIR, AUDIO_DIR, EXPORT_DIR, TMP_DIR, WHISPER_DIR):
    _dir.mkdir(parents=True, exist_ok=True)

PROVIDERS = {
    "deepseek": {
        "label": "DeepSeek",
        "base_url": "https://api.deepseek.com/v1",
        "model": "deepseek-chat",
    },
    "dashscope": {
        "label": "通义千问（阿里云）",
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "model": "qwen-plus",
    },
    "zhipu": {
        "label": "智谱 GLM",
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "model": "glm-4-flash",
    },
    "moonshot": {
        "label": "月之暗面 Kimi",
        "base_url": "https://api.moonshot.cn/v1",
        "model": "moonshot-v1-8k",
    },
    "custom": {
        "label": "自定义（OpenAI 兼容）",
        "base_url": "",
        "model": "",
    },
}

DEFAULT_SETTINGS = {
    "provider": "deepseek",
    "base_url": PROVIDERS["deepseek"]["base_url"],
    "model": PROVIDERS["deepseek"]["model"],
    "api_key": "",
    "temperature": 0.35,
    "whisper_model": "small",
    "whisper_compute_type": "int8",
    "language": "zh",
    "initial_prompt": (
        "以下是一段关于援疆的口述史访谈录音，使用普通话，可能涉及新疆、"
        "乌鲁木齐、喀什、和田、克州、阿克苏、巴州、伊犁、援疆干部、支教、"
        "医疗援疆、民族团结、结亲等词语。"
    ),
    # 微信小程序登录配置（环境变量优先，settings.json 兜底）
    "wechat_appid": "",
    "wechat_secret": "",
    # 开发者后台登录密码（在 settings.json 中设置，或 ADMIN_PASSWORD 环境变量）
    "admin_password": "",
}

_lock = threading.Lock()


def load_settings() -> dict:
    with _lock:
        if not SETTINGS_PATH.exists():
            merged = dict(DEFAULT_SETTINGS)
        else:
            try:
                saved = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                saved = {}
            merged = dict(DEFAULT_SETTINGS)
            merged.update({k: v for k, v in saved.items() if k in DEFAULT_SETTINGS})
    # 环境变量优先于 settings.json，避免把密钥写进文件
    if appid_env := __import__("os").environ.get("WECHAT_APPID"):
        merged["wechat_appid"] = appid_env.strip()
    if secret_env := __import__("os").environ.get("WECHAT_SECRET"):
        merged["wechat_secret"] = secret_env.strip()
    if pwd_env := __import__("os").environ.get("ADMIN_PASSWORD"):
        merged["admin_password"] = pwd_env.strip()
    return merged


def sanitize_api_key(value) -> str:
    """从用户粘贴内容中提取真正的 Key，去掉说明文字和空白。"""
    text = str(value or "").strip()
    match = re.search(r"(sk-[A-Za-z0-9_\-]+|eyJ[A-Za-z0-9_\-\.]+)", text)
    if match:
        return match.group(1)
    # 没有常见前缀时，按空白/冒号切分取最后一段
    parts = re.split(r"[\s：:]+", text)
    return parts[-1] if parts and parts[-1] else text


def save_settings(patch: dict) -> dict:
    with _lock:
        current = dict(DEFAULT_SETTINGS)
        if SETTINGS_PATH.exists():
            try:
                current.update(json.loads(SETTINGS_PATH.read_text(encoding="utf-8")))
            except (OSError, json.JSONDecodeError):
                pass
        for key, value in patch.items():
            if key in DEFAULT_SETTINGS:
                if key == "api_key":
                    value = sanitize_api_key(value)
                current[key] = value
        SETTINGS_PATH.write_text(
            json.dumps(current, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    return current


def public_settings(settings: dict) -> dict:
    safe = {
        k: v
        for k, v in settings.items()
        if k not in {"api_key", "wechat_secret", "admin_password"}
    }
    safe["has_key"] = bool(settings.get("api_key", "").strip())
    safe["wechat_configured"] = bool(
        settings.get("wechat_appid", "").strip() and settings.get("wechat_secret", "").strip()
    )
    safe["has_admin_password"] = bool(settings.get("admin_password", "").strip())
    safe["providers"] = PROVIDERS
    safe["storage"] = {
        "data_dir": str(DATA_DIR),
        "cache_dir": str(CACHE_DIR),
    }
    return safe
