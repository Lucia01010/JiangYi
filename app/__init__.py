"""疆忆 · 援疆口述档案采集系统。

进程启动时把所有缓存与临时目录重定向到项目所在盘，避免写入系统盘。
"""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
CACHE_DIR = BASE_DIR / ".cache"

for _name, _path in {
    "HF_HOME": CACHE_DIR / "huggingface",
    "HF_XET_CACHE": CACHE_DIR / "huggingface" / "xet",
    "HUGGINGFACE_HUB_CACHE": CACHE_DIR / "huggingface" / "hub",
    "XDG_CACHE_HOME": CACHE_DIR,
    "TORCH_HOME": CACHE_DIR / "torch",
    "TMP": CACHE_DIR / "tmp",
    "TEMP": CACHE_DIR / "tmp",
}.items():
    _path.mkdir(parents=True, exist_ok=True)
    os.environ[_name] = str(_path)

# 国内网络默认走镜像站下载语音模型，可通过环境变量覆盖。
os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
