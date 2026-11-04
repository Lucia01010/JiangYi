import base64
import hashlib
import hmac
import io
import json
import mimetypes
import os
import shutil
import threading
import time
import uuid
from pathlib import Path
from urllib.parse import quote

import httpx
from fastapi import Body, FastAPI, File, Form, HTTPException, Header, Request, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from . import ai, config, export, prompts, store, stt

app = FastAPI(title="疆忆 · 援疆口述档案采集系统", version="0.1.0")

APP_VERSION = "0.1.0"
ALLOWED_AUDIO = {".webm", ".mp3", ".wav", ".m4a", ".mp4", ".ogg", ".aac", ".flac", ".opus"}
JOBS: dict[str, dict] = {}
JOBS_LOCK = threading.Lock()

store.init_db()


# ---- 轻量鉴权：HMAC + Base64，不引入额外依赖 ---------------------------------
# token 结构：base64(json_payload) "." base64(hmac_hex(payload, SECRET))
# SECRET 优先从 TOKEN_SECRET 环境变量读取，否则进程内随机生成（重启失效）
_TOKEN_SECRET = os.environ.get("TOKEN_SECRET") or uuid.uuid4().hex.encode()


def _sign(payload_bytes: bytes) -> str:
    return hmac.new(_TOKEN_SECRET, payload_bytes, hashlib.sha256).hexdigest()


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def make_token(role: str, identity: str, ttl_seconds: int = 86400 * 30) -> str:
    payload = {"role": role, "identity": identity, "iat": int(time.time()), "exp": int(time.time()) + ttl_seconds}
    encoded = _b64url(json.dumps(payload).encode())
    sig = _sign(encoded.encode())
    return f"{encoded}.{sig}"


def parse_token(token: str | None) -> dict | None:
    if not token or "." not in token:
        return None
    encoded, sig = token.rsplit(".", 1)
    expected = _sign(encoded.encode())
    if not hmac.compare_digest(expected, sig):
        return None
    try:
        payload = json.loads(_b64url_decode(encoded))
    except Exception:
        return None
    if payload.get("exp", 0) < int(time.time()):
        return None
    return payload


def _extract_openid(request: Request) -> str | None:
    """从 X-OpenID 头或 Bearer token 中提取受访者 openid。"""
    direct = request.headers.get("x-openid", "").strip()
    if direct:
        return direct
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        payload = parse_token(auth[7:].strip())
        if payload and payload.get("role") == "user":
            return payload.get("identity")
    return None


def _require_openid(request: Request) -> str:
    openid = _extract_openid(request)
    if not openid:
        raise HTTPException(status_code=401, detail="缺少受访者身份标识，请先通过微信登录")
    return openid


def _require_admin(request: Request) -> None:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="请先登录开发者后台")
    payload = parse_token(auth[7:].strip())
    if not payload or payload.get("role") != "admin":
        raise HTTPException(status_code=401, detail="开发者身份校验失败")


def _interview_or_404(item_id: str) -> dict:
    item = store.get_interview(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="访谈档案不存在")
    return item


def _summary(item: dict) -> dict:
    profile = item.get("profile") or {}
    return {
        "id": item["id"],
        "title": item["title"],
        "status": item["status"],
        "created_at": item["created_at"],
        "updated_at": item["updated_at"],
        "duration": item["duration"],
        "word_count": item["word_count"],
        "profile": {
            key: profile.get(key, "")
            for key in ("name", "gender", "location", "identity", "aid_year", "interview_date", "topic")
        },
        "has_audio": bool(item.get("audio_path")),
        "has_outline": bool((item.get("outline") or {}).get("sections")),
        "has_transcript": bool((item.get("transcript") or {}).get("text")),
        "has_archive": bool((item.get("archive") or {}).get("sections")),
    }


def _content_disposition(filename: str) -> dict:
    return {
        "Content-Disposition": (
            f"attachment; filename=\"archive.{filename.rsplit('.', 1)[-1]}\"; "
            f"filename*=UTF-8''{quote(filename)}"
        )
    }


@app.get("/api/health")
def health():
    return {"ok": True, "version": APP_VERSION}


@app.get("/api/system")
def system_info():
    settings = config.load_settings()
    model_dir = config.WHISPER_DIR / (settings.get("whisper_model") or "small")
    return {
        "version": APP_VERSION,
        "llm_configured": ai.is_configured(settings),
        "llm_model": settings.get("model"),
        "llm_provider": settings.get("provider"),
        "whisper_model": settings.get("whisper_model"),
        "whisper_ready": (model_dir / "model.bin").exists(),
        "storage": {
            "data_dir": str(config.DATA_DIR),
            "cache_dir": str(config.CACHE_DIR),
            "audio_dir": str(config.AUDIO_DIR),
        },
    }


@app.get("/api/interviews")
def list_interviews():
    return {"items": [_summary(item) for item in store.list_interviews()]}


@app.post("/api/interviews")
def create_interview(request: Request, payload: dict = Body(default={})):
    profile = payload.get("profile") or {}
    if not isinstance(profile, dict):
        raise HTTPException(status_code=400, detail="口述人信息格式不正确")
    # 如果请求里带了 openid（通过 header 或 token），自动绑定
    openid = _extract_openid(request) or str(payload.get("openid") or "").strip()
    consent = bool(payload.get("consent_accepted"))
    if openid and not consent:
        # 小程序端创建档案必须有知情同意
        raise HTTPException(status_code=400, detail="请先勾选并确认知情同意")
    item = store.create_interview(
        profile=profile,
        title=payload.get("title"),
        openid=openid,
        consent_accepted=consent,
        consent_at=store.now_iso() if consent else None,
    )
    return item


@app.get("/api/interviews/{item_id}")
def get_interview(item_id: str):
    return _interview_or_404(item_id)


@app.patch("/api/interviews/{item_id}")
def patch_interview(item_id: str, payload: dict = Body(default={})):
    item = _interview_or_404(item_id)
    patch = {}

    if "title" in payload:
        title = str(payload.get("title") or "").strip()
        if title:
            patch["title"] = title
    if isinstance(payload.get("profile"), dict):
        patch["profile"] = payload["profile"]
    if isinstance(payload.get("outline"), dict):
        patch["outline"] = payload["outline"]
    if isinstance(payload.get("archive"), dict):
        patch["archive"] = payload["archive"]
    if isinstance(payload.get("transcript"), dict):
        patch["transcript"] = payload["transcript"]
    if isinstance(payload.get("transcript_text"), str):
        current = item.get("transcript") or {}
        current["text"] = payload["transcript_text"]
        current["edited_at"] = store.now_iso()
        patch["transcript"] = current
    if "duration" in payload:
        try:
            patch["duration"] = round(float(payload["duration"]), 2)
        except (TypeError, ValueError):
            pass

    updated = store.update_interview(item_id, patch)
    return updated


@app.delete("/api/interviews/{item_id}")
def delete_interview(item_id: str):
    _interview_or_404(item_id)
    store.delete_interview(item_id)
    return {"ok": True}


@app.post("/api/interviews/{item_id}/outline")
def generate_outline(item_id: str, payload: dict = Body(default={})):
    item = _interview_or_404(item_id)
    settings = config.load_settings()
    profile = item.get("profile") or {}
    if payload.get("use_template"):
        outline = prompts.build_template_outline(profile)
        outline["warning"] = "已按你的选择使用内置提纲模板。"
    else:
        outline = ai.generate_outline(profile, settings)
    store.update_interview(item_id, {"outline": outline})
    return outline


@app.post("/api/interviews/{item_id}/audio")
def upload_audio(
    item_id: str,
    file: UploadFile = File(...),
    duration: float = Form(0),
):
    item = _interview_or_404(item_id)
    suffix = Path(file.filename or "recording.webm").suffix.lower()
    if suffix not in ALLOWED_AUDIO:
        suffix = ".webm"
    target = config.AUDIO_DIR / f"{item_id}{suffix}"
    old_path = item.get("audio_path")
    if old_path and Path(old_path) != target and Path(old_path).exists():
        Path(old_path).unlink(missing_ok=True)
    with target.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    size = target.stat().st_size
    if size == 0:
        target.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="录音文件为空")
    store.update_interview(
        item_id,
        {
            "audio_path": str(target),
            "audio_name": file.filename or target.name,
            "duration": round(float(duration or 0), 2),
        },
    )
    return {
        "ok": True,
        "size": size,
        "duration": round(float(duration or 0), 2),
        "url": f"/api/interviews/{item_id}/audio",
    }


@app.get("/api/interviews/{item_id}/audio")
def get_audio(item_id: str):
    item = _interview_or_404(item_id)
    path = item.get("audio_path")
    if not path or not Path(path).exists():
        raise HTTPException(status_code=404, detail="该访谈还没有录音")
    media_type = mimetypes.guess_type(path)[0] or "audio/webm"
    return FileResponse(path, media_type=media_type, filename=item.get("audio_name") or Path(path).name)


def _run_transcription(job_id: str, item_id: str, audio_path: str) -> None:
    settings = config.load_settings()
    item = store.get_interview(item_id)
    profile = (item or {}).get("profile") or {}

    def progress(value: float, phase: str):
        with JOBS_LOCK:
            job = JOBS.get(job_id)
            if job:
                job["progress"] = round(max(0.0, min(1.0, value)), 3)
                job["phase"] = phase

    try:
        with JOBS_LOCK:
            JOBS[job_id].update({"status": "running", "phase": "准备转写"})
        result = stt.transcribe(audio_path, settings, profile, progress)
        transcript = {
            "text": result["text"],
            "segments": result["segments"],
            "language": result["language"],
            "duration": result["duration"],
            "model": result["model"],
            "source": "recording",
            "created_at": store.now_iso(),
        }
        store.update_interview(
            item_id,
            {"transcript": transcript, "duration": result["duration"] or (item or {}).get("duration", 0)},
        )
        with JOBS_LOCK:
            JOBS[job_id].update({"status": "done", "progress": 1.0, "phase": "转写完成"})
    except Exception as exc:  # noqa: BLE001 - 需要把错误显示到前端
        with JOBS_LOCK:
            JOBS[job_id].update({"status": "error", "phase": "转写失败", "error": str(exc)})


@app.post("/api/interviews/{item_id}/transcribe")
def start_transcription(item_id: str):
    item = _interview_or_404(item_id)
    audio_path = item.get("audio_path")
    if not audio_path or not Path(audio_path).exists():
        raise HTTPException(status_code=400, detail="请先录制或上传访谈录音")
    with JOBS_LOCK:
        for job in JOBS.values():
            if job.get("interview_id") == item_id and job.get("status") in {"queued", "running"}:
                return {"job_id": job["job_id"], "status": job["status"]}
        job_id = uuid.uuid4().hex[:12]
        JOBS[job_id] = {
            "job_id": job_id,
            "interview_id": item_id,
            "status": "queued",
            "progress": 0.0,
            "phase": "排队中",
            "error": "",
        }
    thread = threading.Thread(
        target=_run_transcription, args=(job_id, item_id, audio_path), daemon=True
    )
    thread.start()
    return {"job_id": job_id, "status": "queued"}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="任务不存在")
        return dict(job)


@app.post("/api/interviews/{item_id}/followups")
def generate_followups(item_id: str, payload: dict = Body(default={})):
    item = _interview_or_404(item_id)
    settings = config.load_settings()
    text = str(payload.get("text") or "").strip()
    if not text:
        text = (item.get("transcript") or {}).get("text", "")
    if not text:
        raise HTTPException(status_code=400, detail="还没有可分析的访谈内容，请先转写或输入文字")
    return ai.generate_followups(
        item.get("profile") or {}, item.get("outline") or {}, text, settings
    )


@app.post("/api/interviews/{item_id}/quick-followups")
def quick_followups(
    item_id: str,
    audio: UploadFile | None = File(default=None),
    text: str = Form(default=""),
):
    item = _interview_or_404(item_id)
    settings = config.load_settings()
    transcript_text = (text or "").strip()
    if audio is not None:
        suffix = Path(audio.filename or "quick.webm").suffix.lower()
        if suffix not in ALLOWED_AUDIO:
            suffix = ".webm"
        temp_path = config.TMP_DIR / f"quick_{uuid.uuid4().hex}{suffix}"
        with temp_path.open("wb") as buffer:
            shutil.copyfileobj(audio.file, buffer)
        try:
            result = stt.transcribe(temp_path, settings, item.get("profile") or {})
            transcript_text = result["text"]
        finally:
            temp_path.unlink(missing_ok=True)
    if not transcript_text:
        raise HTTPException(status_code=400, detail="没有可分析的内容")
    payload = ai.generate_followups(
        item.get("profile") or {},
        item.get("outline") or {},
        transcript_text,
        settings,
    )
    payload["text"] = transcript_text
    return payload


@app.post("/api/interviews/{item_id}/archive")
def generate_archive(item_id: str):
    item = _interview_or_404(item_id)
    settings = config.load_settings()
    text = (item.get("transcript") or {}).get("text", "")
    if not text:
        raise HTTPException(status_code=400, detail="请先完成语音转写，再生成口述档案")
    archive = ai.generate_archive(
        item.get("profile") or {}, item.get("outline") or {}, text, settings
    )
    store.update_interview(item_id, {"archive": archive})
    return archive


@app.get("/api/interviews/{item_id}/export/{fmt}")
def export_interview(item_id: str, fmt: str):
    item = _interview_or_404(item_id)
    if not (item.get("archive") or {}).get("sections"):
        raise HTTPException(status_code=400, detail="请先生成口述档案")
    fmt = fmt.lower()
    title = (item.get("archive") or {}).get("title") or item.get("title")
    if fmt == "md":
        content = export.to_markdown(item)
        return Response(
            content=content.encode("utf-8"),
            media_type="text/markdown; charset=utf-8",
            headers=_content_disposition(export.safe_filename(title, "md")),
        )
    if fmt == "html":
        content = export.to_html(item)
        return Response(
            content=content.encode("utf-8"),
            media_type="text/html; charset=utf-8",
            headers=_content_disposition(export.safe_filename(title, "html")),
        )
    if fmt == "docx":
        buffer = io.BytesIO()
        export.to_docx(item, buffer)
        return Response(
            content=buffer.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers=_content_disposition(export.safe_filename(title, "docx")),
        )
    raise HTTPException(status_code=400, detail="不支持的导出格式")


@app.get("/api/settings")
def get_settings():
    return config.public_settings(config.load_settings())


@app.post("/api/settings")
def update_settings(payload: dict = Body(default={})):
    patch = {}
    for key in (
        "provider",
        "base_url",
        "model",
        "temperature",
        "whisper_model",
        "whisper_compute_type",
        "language",
        "initial_prompt",
    ):
        if key in payload:
            patch[key] = payload[key]
    if payload.get("clear_key"):
        patch["api_key"] = ""
    elif str(payload.get("api_key") or "").strip():
        patch["api_key"] = str(payload["api_key"]).strip()
    if patch.get("provider") in config.PROVIDERS:
        preset = config.PROVIDERS[patch["provider"]]
        if not patch.get("base_url"):
            patch["base_url"] = preset["base_url"]
        if not patch.get("model"):
            patch["model"] = preset["model"]
    if "base_url" in patch:
        patch["base_url"] = str(patch["base_url"]).strip().rstrip("/")
    if "temperature" in patch:
        try:
            patch["temperature"] = max(0.0, min(1.2, float(patch["temperature"])))
        except (TypeError, ValueError):
            patch.pop("temperature")
    settings = config.save_settings(patch)
    return config.public_settings(settings)


@app.post("/api/settings/test")
def test_settings(payload: dict = Body(default={})):
    stored = config.load_settings()
    probe = dict(stored)
    for key in ("base_url", "model", "temperature"):
        if payload.get(key):
            probe[key] = payload[key]
    if str(payload.get("api_key") or "").strip():
        probe["api_key"] = str(payload["api_key"]).strip()
    if str(payload.get("provider") or "").strip() in config.PROVIDERS:
        probe["provider"] = payload["provider"]
    return ai.test_connection(probe)


# -------- 登录鉴权 -------------------------------------------------------------

@app.post("/api/auth/wechat")
async def wechat_login(payload: dict = Body(default={})):
    """微信小程序 wx.login() 返回的 code 换 openid，下发 user token。"""
    settings = config.load_settings()
    appid = settings.get("wechat_appid", "").strip()
    secret = settings.get("wechat_secret", "").strip()
    code = str(payload.get("code") or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="缺少 code 参数，请在小程序内先 wx.login()")
    if not appid or not secret:
        # 未配置微信参数时，开发模式下允许测试 code 直接作为 openid
        if os.environ.get("DEV_MODE") == "1" or not os.environ.get("WECHAT_APPID"):
            openid = f"dev_{code[:8]}"
        else:
            raise HTTPException(status_code=400, detail="服务端尚未配置微信 AppID/Secret")
    else:
        url = (
            f"https://api.weixin.qq.com/sns/jscode2session"
            f"?appid={appid}&secret={secret}&js_code={code}&grant_type=authorization_code"
        )
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url)
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"微信接口请求失败：{exc}")
        data = resp.json()
        if "openid" not in data:
            raise HTTPException(status_code=400, detail=f"微信返回错误：{data}")
        openid = data["openid"]
    token = make_token("user", openid, ttl_seconds=86400 * 90)
    return {"openid": openid, "token": token, "role": "user"}


@app.post("/api/admin/login")
def admin_login(payload: dict = Body(default={})):
    """开发者后台登录，返回 admin token。"""
    settings = config.load_settings()
    expected = settings.get("admin_password", "").strip()
    submitted = str(payload.get("password") or "").strip()
    if not expected:
        raise HTTPException(status_code=400, detail="服务端未设置管理员密码，请在 settings.json 或 ADMIN_PASSWORD 环境变量中配置")
    if not submitted:
        raise HTTPException(status_code=400, detail="请提交密码")
    if not hmac.compare_digest(expected, submitted):
        raise HTTPException(status_code=401, detail="密码错误")
    token = make_token("admin", "admin", ttl_seconds=86400 * 30)
    return {"token": token, "role": "admin"}


# -------- 受访者（小程序）专属接口 ---------------------------------------------

@app.get("/api/my/interviews")
def my_interviews(request: Request):
    openid = _require_openid(request)
    items = store.list_interviews(openid=openid)
    return {"items": [_summary(item) for item in items]}


@app.post("/api/my/interviews")
def my_create_interview(request: Request, payload: dict = Body(default={})):
    """受访者在小程序里创建自己的档案。需要 openid + 知情同意。"""
    openid = _require_openid(request)
    profile = payload.get("profile") or {}
    consent = bool(payload.get("consent_accepted"))
    if not consent:
        raise HTTPException(status_code=400, detail="请先勾选并确认知情同意")
    item = store.create_interview(
        profile=profile,
        title=payload.get("title"),
        openid=openid,
        consent_accepted=True,
        consent_at=store.now_iso(),
    )
    return item


@app.get("/api/my/interviews/{item_id}")
def my_get_interview(request: Request, item_id: str):
    openid = _require_openid(request)
    item = store.get_interview_for(item_id, openid)
    if not item:
        raise HTTPException(status_code=404, detail="档案不存在或不属于你")
    return item


@app.delete("/api/my/interviews/{item_id}")
def my_delete_interview(request: Request, item_id: str):
    """受访者主动删除自己的档案（物理删除录音 + 数据库记录）。"""
    openid = _require_openid(request)
    ok = store.delete_interview(item_id, openid=openid)
    if not ok:
        raise HTTPException(status_code=404, detail="档案不存在或不属于你")
    return {"ok": True, "message": "已删除你的档案，录音文件也已清理。"}


@app.get("/api/my/interviews/{item_id}/audio")
def my_get_audio(request: Request, item_id: str):
    openid = _require_openid(request)
    item = store.get_interview_for(item_id, openid)
    if not item:
        raise HTTPException(status_code=404, detail="档案不存在或不属于你")
    path = item.get("audio_path")
    if not path or not Path(path).exists():
        raise HTTPException(status_code=404, detail="该访谈还没有录音")
    media_type = mimetypes.guess_type(path)[0] or "audio/webm"
    return FileResponse(path, media_type=media_type, filename=item.get("audio_name") or Path(path).name)


@app.get("/api/my/interviews/{item_id}/export/{fmt}")
def my_export_interview(request: Request, item_id: str, fmt: str):
    openid = _require_openid(request)
    item = store.get_interview_for(item_id, openid)
    if not item:
        raise HTTPException(status_code=404, detail="档案不存在或不属于你")
    if not (item.get("archive") or {}).get("sections"):
        # 没有归档稿时，退而给转写稿的纯文本
        text = ((item.get("transcript") or {}).get("text") or "").strip()
        if not text:
            raise HTTPException(status_code=400, detail="该档案既没有口述档案也没有转写稿")
        title = item.get("title") or "口述档案"
        if fmt == "txt":
            return Response(
                content=text.encode("utf-8"),
                media_type="text/plain; charset=utf-8",
                headers=_content_disposition(export.safe_filename(title, "txt")),
            )
        raise HTTPException(status_code=400, detail="请先生成口述档案或导出为 txt 纯文本")
    return _export_common(item, fmt)


def _export_common(item: dict, fmt: str):
    fmt = fmt.lower()
    title = (item.get("archive") or {}).get("title") or item.get("title")
    if fmt == "md":
        content = export.to_markdown(item)
        return Response(
            content=content.encode("utf-8"),
            media_type="text/markdown; charset=utf-8",
            headers=_content_disposition(export.safe_filename(title, "md")),
        )
    if fmt == "html":
        content = export.to_html(item)
        return Response(
            content=content.encode("utf-8"),
            media_type="text/html; charset=utf-8",
            headers=_content_disposition(export.safe_filename(title, "html")),
        )
    if fmt == "docx":
        buffer = io.BytesIO()
        export.to_docx(item, buffer)
        return Response(
            content=buffer.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers=_content_disposition(export.safe_filename(title, "docx")),
        )
    raise HTTPException(status_code=400, detail="不支持的导出格式")


# -------- 开发者端（web）鉴权：管理员登录后才能访问完整档案接口 --------------
# 不强制拦截旧接口，方便开发调试；生产环境可启用全局中间件

@app.get("/")
def index():
    path = config.WEB_DIR / "index.html"
    if not path.exists():
        raise HTTPException(status_code=500, detail="前端页面缺失")
    return FileResponse(path)


app.mount("/static", StaticFiles(directory=str(config.WEB_DIR)), name="static")
