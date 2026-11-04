import json
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from .config import DB_PATH


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=20)
    conn.row_factory = sqlite3.Row
    return conn


_init_lock = threading.Lock()
_initialized = False


def init_db() -> None:
    global _initialized
    if _initialized:
        return
    with _init_lock:
        if _initialized:
            return
        with _connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS interviews (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    profile TEXT NOT NULL DEFAULT '{}',
                    outline TEXT NOT NULL DEFAULT '{}',
                    transcript TEXT NOT NULL DEFAULT '{}',
                    archive TEXT NOT NULL DEFAULT '{}',
                    audio_path TEXT,
                    audio_name TEXT,
                    duration REAL NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            _migrate_schema(conn)
            conn.commit()
        _initialized = True


def _migrate_schema(conn: sqlite3.Connection) -> None:
    """增量迁移：给已有的 interviews 表追加 openid/consent 列。

    SQLite 不支持 DROP COLUMN，新增列使用 ALTER TABLE ADD COLUMN 即可，
    对既有记录填充默认值。
    """
    cols = {row["name"] for row in conn.execute("PRAGMA table_info(interviews)").fetchall()}
    if "openid" not in cols:
        conn.execute("ALTER TABLE interviews ADD COLUMN openid TEXT DEFAULT ''")
    if "consent_accepted" not in cols:
        conn.execute("ALTER TABLE interviews ADD COLUMN consent_accepted INTEGER DEFAULT 0")
    if "consent_at" not in cols:
        conn.execute("ALTER TABLE interviews ADD COLUMN consent_at TEXT")


def _loads(value, default):
    try:
        return json.loads(value) if value else default
    except (TypeError, json.JSONDecodeError):
        return default


def _row_to_dict(row: sqlite3.Row) -> dict:
    item = {
        "id": row["id"],
        "title": row["title"],
        "profile": _loads(row["profile"], {}),
        "outline": _loads(row["outline"], {}),
        "transcript": _loads(row["transcript"], {}),
        "archive": _loads(row["archive"], {}),
        "audio_path": row["audio_path"],
        "audio_name": row["audio_name"],
        "duration": row["duration"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "openid": row["openid"] or "",
        "consent_accepted": bool(row["consent_accepted"]),
        "consent_at": row["consent_at"],
    }
    item["status"] = compute_status(item)
    item["word_count"] = len((item["transcript"] or {}).get("text", "") or "")
    return item


def compute_status(item: dict) -> str:
    if (item.get("archive") or {}).get("sections"):
        return "archived"
    if (item.get("transcript") or {}).get("text"):
        return "transcribed"
    if item.get("audio_path"):
        return "recorded"
    if (item.get("outline") or {}).get("sections"):
        return "outlined"
    return "draft"


def default_title(profile: dict) -> str:
    name = (profile or {}).get("name", "").strip() or "未命名口述人"
    location = (profile or {}).get("location", "").strip() or "新疆"
    return f"{name}：{location}援疆口述档案"


def create_interview(
    profile: dict,
    title: str | None = None,
    openid: str = "",
    consent_accepted: bool = False,
    consent_at: str | None = None,
) -> dict:
    init_db()
    item_id = uuid.uuid4().hex[:12]
    stamp = now_iso()
    title = (title or "").strip() or default_title(profile)
    with _connect() as conn:
        conn.execute(
            "INSERT INTO interviews (id, title, profile, outline, transcript, archive, "
            "openid, consent_accepted, consent_at, created_at, updated_at) "
            "VALUES (?, ?, ?, '{}', '{}', '{}', ?, ?, ?, ?, ?)",
            (
                item_id,
                title,
                json.dumps(profile, ensure_ascii=False),
                openid or "",
                1 if consent_accepted else 0,
                consent_at if consent_accepted else None,
                stamp,
                stamp,
            ),
        )
        conn.commit()
    return get_interview(item_id)


def list_interviews(openid: str | None = None) -> list[dict]:
    init_db()
    with _connect() as conn:
        if openid:
            rows = conn.execute(
                "SELECT * FROM interviews WHERE openid = ? ORDER BY updated_at DESC",
                (openid,),
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM interviews ORDER BY updated_at DESC").fetchall()
    return [_row_to_dict(row) for row in rows]


def get_interview(item_id: str) -> dict | None:
    init_db()
    with _connect() as conn:
        row = conn.execute("SELECT * FROM interviews WHERE id = ?", (item_id,)).fetchone()
    return _row_to_dict(row) if row else None


def get_interview_for(item_id: str, openid: str) -> dict | None:
    """仅限受访者查询自己的档案，openid 为空时任何 openid 都不允许访问。"""
    if not openid:
        return None
    init_db()
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM interviews WHERE id = ? AND openid = ?",
            (item_id, openid),
        ).fetchone()
    return _row_to_dict(row) if row else None


def update_interview(item_id: str, patch: dict) -> dict | None:
    init_db()
    allowed = {
        "title",
        "profile",
        "outline",
        "transcript",
        "archive",
        "audio_path",
        "audio_name",
        "duration",
        "consent_accepted",
        "consent_at",
    }
    sets = []
    values = []
    for key, value in patch.items():
        if key not in allowed:
            continue
        if key in {"profile", "outline", "transcript", "archive"}:
            value = json.dumps(value or {}, ensure_ascii=False)
        sets.append(f"{key} = ?")
        values.append(value)
    if not sets:
        return get_interview(item_id)
    sets.append("updated_at = ?")
    values.append(now_iso())
    values.append(item_id)
    with _connect() as conn:
        conn.execute(f"UPDATE interviews SET {', '.join(sets)} WHERE id = ?", values)
        conn.commit()
    return get_interview(item_id)


def delete_interview(item_id: str, openid: str | None = None) -> bool:
    init_db()
    with _connect() as conn:
        query = "SELECT audio_path, openid FROM interviews WHERE id = ?"
        params = [item_id]
        if openid:
            query += " AND openid = ?"
            params.append(openid)
        row = conn.execute(query, params).fetchone()
        if not row:
            return False
        conn.execute("DELETE FROM interviews WHERE id = ?", (item_id,))
        conn.commit()
    if row["audio_path"]:
        path = Path(row["audio_path"])
        if path.exists():
            path.unlink(missing_ok=True)
    return True
