import json
import re
import time
import uuid
from datetime import datetime

import httpx

from . import prompts


class AIError(RuntimeError):
    pass


def is_configured(settings: dict) -> bool:
    return bool((settings.get("api_key") or "").strip()) and bool(
        (settings.get("base_url") or "").strip()
    )


def _chat(messages: list[dict], settings: dict, max_tokens: int = 4096) -> str:
    if not is_configured(settings):
        raise AIError("尚未配置云端 AI 服务")
    base_url = settings["base_url"].strip().rstrip("/")
    if base_url.endswith("/chat/completions"):
        url = base_url
    else:
        url = f"{base_url}/chat/completions"
    payload = {
        "model": settings.get("model") or "deepseek-chat",
        "messages": messages,
        "temperature": float(settings.get("temperature", 0.35)),
        "max_tokens": max_tokens,
        "stream": False,
        "response_format": {"type": "json_object"},
    }
    headers = {
        "Authorization": f"Bearer {settings['api_key'].strip()}",
        "Content-Type": "application/json",
    }
    last_error = ""
    for attempt in range(2):
        try:
            with httpx.Client(timeout=httpx.Timeout(240.0, connect=20.0)) as client:
                response = client.post(url, headers=headers, json=payload)
            if response.status_code == 400 and "response_format" in payload:
                payload.pop("response_format", None)
                continue
            if response.status_code >= 400:
                detail = response.text[:300]
                raise AIError(f"接口返回 HTTP {response.status_code}：{detail}")
            data = response.json()
            choices = data.get("choices") or []
            if not choices:
                raise AIError("接口返回内容为空")
            content = (choices[0].get("message") or {}).get("content") or ""
            if not content.strip():
                raise AIError("接口返回的文本为空")
            return content
        except httpx.TimeoutException as exc:
            last_error = f"请求超时：{exc}"
        except httpx.HTTPError as exc:
            last_error = f"网络请求失败：{exc}"
        except AIError as exc:
            last_error = str(exc)
        except (ValueError, KeyError) as exc:
            last_error = f"返回内容无法解析：{exc}"
    raise AIError(last_error or "云端 AI 调用失败")


def parse_json(text: str):
    cleaned = (text or "").strip()
    cleaned = re.sub(r"^```(?:json)?", "", cleaned, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"```$", "", cleaned).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # 兜底：提取第一个 { 到最后一个 } 的片段
    start_obj, start_arr = cleaned.find("{"), cleaned.find("[")
    starts = [s for s in (start_obj, start_arr) if s >= 0]
    if not starts:
        raise AIError("模型返回中没有找到 JSON")
    start = min(starts)
    end_obj, end_arr = cleaned.rfind("}"), cleaned.rfind("]")
    end = max(end_obj, end_arr)
    if end <= start:
        raise AIError("模型返回的 JSON 不完整")
    snippet = cleaned[start : end + 1]

    # 第二轮尝试：如果标准解析失败，尝试修复常见的 qwen-max 松弛格式
    try:
        return json.loads(snippet)
    except json.JSONDecodeError:
        pass

    fixed = _patch_json_sloppy(snippet)
    try:
        return json.loads(fixed)
    except json.JSONDecodeError as exc:
        raise AIError(f"模型返回的 JSON 解析失败：{exc}") from exc


def _patch_json_sloppy(snippet: str) -> str:
    """修复 qwen-max 等模型返回的非严格 JSON。

    常见问题：questions: 后直接跟字符串序列而不是 [str, str, ...]，
    或数组元素间用中文逗号、裸冒号、尾随逗号等。
    """
    patched = snippet

    # 1) questions 字段后如果没有 [，补一个
    patched = re.sub(r'(?m)("questions"\s*:\s*)([「"（])', r'\1[\2', patched)
    # 2) 如果 questions: 后直接跟换行然后多个引号开头的字符串，中间没 [
    patched = re.sub(
        r'"questions"\s*:\s*\n(\s*)"',
        r'"questions": [\1"',
        patched,
    )
    # 3) 数组结尾如果多了一个裸 }，在 questions 等数组的 ] 前补
    #    （简单策略：统计数组开始/结束）
    # 4) 全角冒号替换
    patched = patched.replace("：", ":")
    # 5) 去掉尾随逗号
    patched = re.sub(r",\s*([}\]])", r"\1", patched)
    return patched


def _new_qid() -> str:
    return f"q_{uuid.uuid4().hex[:8]}"


def _fix_split_questions(questions: list[dict]) -> list[dict]:
    """把被拆成单字的问题拼回完整句子。

    判定规则：连续出现 N 条且每条长度都是 1 的中文字符（或标点），
    说明是模型把一条完整句子逐字输出了。
    """
    if len(questions) <= 1:
        return questions

    i = 0
    merged: list[dict] = []
    while i < len(questions):
        chunk = []
        j = i
        while j < len(questions) and len(questions[j]["text"]) == 1 and re.match(
            r"[\u4e00-\u9fff，。、！？；：（）《》……—、、]", questions[j]["text"]
        ):
            chunk.append(questions[j])
            j += 1
        # 只有连续 ≥4 个单字才算拆分；否则保留原样（比如问题列表里单独的"？"）
        if len(chunk) >= 4:
            merged_text = "".join(q["text"] for q in chunk)
            merged.append(
                {
                    "id": _new_qid(),
                    "text": merged_text,
                    "asked": False,
                    "source": chunk[0]["source"],
                }
            )
        else:
            merged.extend(chunk)
        i = j
    return merged


def normalize_outline(raw: dict, source: str = "ai") -> dict:
    sections = []
    for section in (raw or {}).get("sections", []) or []:
        if not isinstance(section, dict):
            continue
        questions = []
        for question in section.get("questions", []) or []:
            if isinstance(question, dict):
                text = str(question.get("text", "") or "").strip()
                asked = bool(question.get("asked"))
            else:
                text = str(question or "").strip()
                asked = False
            if not text:
                continue
            questions.append(
                {
                    "id": question.get("id") if isinstance(question, dict) and question.get("id") else _new_qid(),
                    "text": text,
                    "asked": asked,
                    "source": source,
                }
            )

        # qwen-max / 部分模型会把完整句子拆成单字数组，这里自动拼回
        questions = _fix_split_questions(questions)

        title = str(section.get("title", "") or "").strip()
        if not title and not questions:
            continue
        sections.append(
            {
                "title": title or f"第{len(sections) + 1}章",
                "goal": str(section.get("goal", "") or "").strip(),
                "questions": questions,
            }
        )
    if not sections:
        return {}
    return {
        "opening": str((raw or {}).get("opening", "") or "").strip(),
        "sections": sections,
        "closing": str((raw or {}).get("closing", "") or "").strip(),
        "tips": [str(t) for t in (raw or {}).get("tips", []) or [] if str(t).strip()],
        "generated_by": (raw or {}).get("generated_by", source),
        "generated_at": (raw or {}).get("generated_at")
        or datetime.now().isoformat(timespec="seconds"),
        "warning": (raw or {}).get("warning", ""),
    }


def generate_outline(profile: dict, settings: dict) -> dict:
    if not is_configured(settings):
        outline = prompts.build_template_outline(profile)
        outline["warning"] = (
            "尚未配置云端 AI 服务，当前为内置提纲模板。请到「设置」填写 API Key 后重新生成。"
        )
        return outline
    try:
        content = _chat(
            [
                {"role": "system", "content": prompts.OUTLINE_SYSTEM},
                {"role": "user", "content": prompts.outline_user_prompt(profile)},
            ],
            settings,
            max_tokens=4096,
        )
        raw = parse_json(content)
        outline = normalize_outline(raw)
        if not outline:
            raise AIError("模型没有返回有效章节")
        outline["warning"] = ""
        return outline
    except (AIError, ValueError, TypeError) as exc:
        outline = prompts.build_template_outline(profile)
        outline["warning"] = f"云端 AI 调用失败（{exc}），已退回内置提纲模板。"
        return outline


def _planned_questions(outline: dict) -> list[str]:
    result = []
    for section in (outline or {}).get("sections", []) or []:
        for question in section.get("questions", []) or []:
            text = question.get("text") if isinstance(question, dict) else str(question)
            if text:
                result.append(text)
    return result


def generate_followups(profile: dict, outline: dict, transcript_text: str, settings: dict) -> dict:
    if not is_configured(settings):
        return {
            "followups": prompts.build_template_followups(transcript_text, outline),
            "generated_by": "template",
            "warning": "尚未配置云端 AI 服务，当前为本地规则追问。请到「设置」填写 API Key。",
        }
    try:
        content = _chat(
            [
                {"role": "system", "content": prompts.FOLLOWUP_SYSTEM},
                {
                    "role": "user",
                    "content": prompts.followup_user_prompt(
                        profile, outline, transcript_text, _planned_questions(outline)
                    ),
                },
            ],
            settings,
            max_tokens=1200,
        )
        raw = parse_json(content)
        items = raw.get("followups") if isinstance(raw, dict) else raw
        followups = []
        for item in items or []:
            if isinstance(item, str):
                question, intent, based_on = item.strip(), "", ""
            elif isinstance(item, dict):
                question = str(item.get("question", "") or "").strip()
                intent = str(item.get("intent", "") or "").strip()
                based_on = str(item.get("based_on", "") or "").strip()
            else:
                continue
            if question:
                followups.append(
                    {"question": question, "intent": intent, "based_on": based_on}
                )
        if not followups:
            raise AIError("模型没有返回有效追问")
        return {"followups": followups, "generated_by": "ai", "warning": ""}
    except (AIError, ValueError, TypeError) as exc:
        return {
            "followups": prompts.build_template_followups(transcript_text, outline),
            "generated_by": "template",
            "warning": f"云端 AI 调用失败（{exc}），已退回本地规则追问。",
        }


def normalize_archive(raw: dict, profile: dict) -> dict:
    if not isinstance(raw, dict):
        return {}
    sections = []
    for section in raw.get("sections", []) or []:
        if not isinstance(section, dict):
            continue
        paragraphs = []
        for paragraph in section.get("paragraphs", []) or []:
            text = str(paragraph or "").strip()
            if text:
                paragraphs.append(text)
        if paragraphs:
            sections.append(
                {
                    "heading": str(section.get("heading", "") or "").strip() or "未命名章节",
                    "paragraphs": paragraphs,
                }
            )
    if not sections:
        return {}
    keywords = raw.get("keywords", []) or []
    if isinstance(keywords, str):
        keywords = [k.strip() for k in re.split(r"[，,、]", keywords) if k.strip()]
    timeline = []
    for entry in raw.get("timeline", []) or []:
        if isinstance(entry, dict) and str(entry.get("event", "")).strip():
            timeline.append(
                {
                    "time": str(entry.get("time", "") or "").strip(),
                    "event": str(entry.get("event", "") or "").strip(),
                }
            )
    quotes = []
    for quote in raw.get("quotes", []) or []:
        if isinstance(quote, dict) and str(quote.get("text", "")).strip():
            quotes.append(
                {
                    "text": str(quote.get("text", "") or "").strip(),
                    "context": str(quote.get("context", "") or "").strip(),
                }
            )
        elif isinstance(quote, str) and quote.strip():
            quotes.append({"text": quote.strip(), "context": ""})
    name = (profile or {}).get("name") or "口述人"
    location = (profile or {}).get("location") or "新疆"
    return {
        "title": str(raw.get("title", "") or "").strip()
        or f"从故乡到{location}：{name}的援疆口述",
        "subtitle": str(raw.get("subtitle", "") or "").strip(),
        "summary": str(raw.get("summary", "") or "").strip(),
        "keywords": [str(k).strip() for k in keywords if str(k).strip()],
        "persona": str(raw.get("persona", "") or "").strip(),
        "timeline": timeline,
        "sections": sections,
        "quotes": quotes,
        "afterword": str(raw.get("afterword", "") or "").strip(),
        "generated_by": raw.get("generated_by", "ai"),
        "generated_at": raw.get("generated_at")
        or datetime.now().isoformat(timespec="seconds"),
        "warning": raw.get("warning", ""),
    }


def generate_archive(profile: dict, outline: dict, transcript_text: str, settings: dict) -> dict:
    if not (transcript_text or "").strip():
        raise AIError("尚未完成语音转写，无法生成档案")
    if not is_configured(settings):
        archive = prompts.build_template_archive(profile, outline, transcript_text)
        archive["warning"] = (
            "尚未配置云端 AI 服务，当前为本地模板整理稿。请到「设置」填写 API Key 后重新生成。"
        )
        return archive
    try:
        content = _chat(
            [
                {"role": "system", "content": prompts.ARCHIVE_SYSTEM},
                {
                    "role": "user",
                    "content": prompts.archive_user_prompt(profile, outline, transcript_text),
                },
            ],
            settings,
            max_tokens=6000,
        )
        archive = normalize_archive(parse_json(content), profile)
        if not archive:
            raise AIError("模型没有返回有效档案正文")
        archive["warning"] = ""
        return archive
    except (AIError, ValueError, TypeError) as exc:
        archive = prompts.build_template_archive(profile, outline, transcript_text)
        archive["warning"] = f"云端 AI 调用失败（{exc}），已退回本地模板整理。"
        return archive


def test_connection(settings: dict) -> dict:
    started = time.time()
    try:
        _chat(
            [
                {
                    "role": "system",
                    "content": "你是连接测试助手，只回复四个字：连接成功",
                },
                {"role": "user", "content": "请回复：连接成功"},
            ],
            settings,
            max_tokens=32,
        )
        return {
            "ok": True,
            "message": "云端 AI 连接成功",
            "latency_ms": int((time.time() - started) * 1000),
        }
    except AIError as exc:
        return {
            "ok": False,
            "message": str(exc),
            "latency_ms": int((time.time() - started) * 1000),
        }
