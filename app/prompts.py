"""AI 提示词与本地模板。

云端未配置或调用失败时，系统会退回本地模板，保证演示流程不中断。
"""

import re
from datetime import datetime

PROFILE_LABELS = [
    ("name", "姓名"),
    ("gender", "性别"),
    ("birth_year", "出生年份"),
    ("hometown", "籍贯"),
    ("ethnicity", "民族"),
    ("identity", "援疆身份"),
    ("unit", "派出单位"),
    ("aid_year", "援疆时间/批次"),
    ("location", "援疆地点"),
    ("role", "岗位/专业"),
    ("highlights", "主要工作"),
    ("interview_date", "访谈日期"),
    ("interview_place", "访谈地点"),
    ("interviewer", "访谈人"),
    ("topic", "访谈主题"),
    ("notes", "备注"),
]


def profile_text(profile: dict) -> str:
    lines = []
    for key, label in PROFILE_LABELS:
        value = str((profile or {}).get(key, "") or "").strip()
        if value:
            lines.append(f"- {label}：{value}")
    return "\n".join(lines) or "- （口述人信息尚未填写）"


OUTLINE_SYSTEM = """你是一位资深口述史访谈专家，长期从事援疆干部人才口述档案采集，
熟悉新疆区情、援疆工作批次，以及教育、医疗、产业、项目建设、基层治理等各类援疆岗位。
你的任务是依据口述人基础信息，设计一份可执行、有温度、尊重事实的访谈提纲。

必须遵守：
1. 只输出 JSON，不要任何解释、前言或 Markdown 代码块。
2. 提纲按“时间线索 + 主题线索”组织，覆盖：出发与抉择、初到与适应、岗位与攻坚、
   民族团结与日常交往、家庭与生活、难忘的人与事、回望与联系、对后来者的寄语。
   可根据口述人身份合并或增设章节，共 6—8 章。
3. 每章包含 title（章节名）、goal（本章要获得的材料）、questions（3—5 个问题）。
4. 问题要口语化、开放、具体，优先追问场景、人物、时间、数字、对话和感受；
   避免“是不是”“好不好”这类封闭问题，避免空泛的价值评价。
5. 不要虚构口述人经历，不要预设结论；对敏感话题保持中立、尊重。
6. 开场白要自然、说明录音用途与授权；结束语要感谢并说明档案后续用途。
7. 另给出 4—6 条访谈现场提示（tips），例如控场、追问、方言记录、情绪照顾。

JSON 结构：
{
  "opening": "开场白",
  "sections": [
    {"title": "章节名", "goal": "本章目标", "questions": ["问题1", "问题2"]}
  ],
  "closing": "结束语",
  "tips": ["提示1", "提示2"]
}"""


ARCHIVE_SYSTEM = """你是一位严谨的口述史整理编辑，负责把援疆口述访谈录音转写稿整理为可归档的口述档案。

必须遵守：
1. 只输出 JSON，不要任何解释、前言或 Markdown 代码块。
2. 采用口述人第一人称叙述，保留其语气、口语节奏和少量方言词；可做轻度书面化，
   但不得改变原意，不得虚构任何情节、人物、时间、数字。
3. 所有内容只能来自转写稿与基础信息。材料不足处写“（据口述）”，
   无法确认的内容不要补写，不要添加抒情套话。
4. 按主题分节，每节 3—6 段，每段 80—200 字；全文约 1500—3000 字。
5. 摘要 150 字以内；小传 300—500 字；关键词 4—8 个；
   时间线只提取转写稿中明确出现的时间与事件；金句 2—4 条，必须是原话。
6. 不要出现“AI”“人工智能”“本文”“笔者”等字样，不要评价口述人。
7. 档案标题要具体、有地名与身份，例如“从黄浦江到昆仑山：一位上海教师的援疆记忆”。

JSON 结构：
{
  "title": "档案标题",
  "subtitle": "副标题",
  "summary": "内容摘要",
  "keywords": ["关键词"],
  "persona": "口述人小传",
  "timeline": [{"time": "时间", "event": "事件"}],
  "sections": [{"heading": "章节标题", "paragraphs": ["段落"]}],
  "quotes": [{"text": "原话", "context": "出处/情境"}],
  "afterword": "整理说明"
}"""


FOLLOWUP_SYSTEM = """你是援疆口述访谈现场的追问助手。你的任务是根据刚转写的访谈内容，
提出 4 个能够把讲述引向更深处的追问，而不是重复已有提纲。

必须遵守：
1. 只输出 JSON，不要任何解释或代码块。
2. 每个追问必须紧扣转写内容中的具体信息，优先追问：
   具体场景、关键人物、时间地点、数字细节、当时的对话、内心感受、事情的前因后果。
3. 问题口语化、简短、一次只问一件事，避免封闭问题和抽象评价。
4. 不要重复提纲中已经出现的问题；不要编造受访者没有提到的经历。
5. 每条给出 intent（追问意图，如“补充细节/打捞情感/厘清因果/还原场景”）。

JSON 结构：
{"followups": [{"question": "追问", "intent": "追问意图", "based_on": "依据的转写内容"}]}"""


def outline_user_prompt(profile: dict) -> str:
    return f"""请为下面这位援疆口述人设计访谈提纲。

口述人基础信息：
{profile_text(profile)}

请结合其身份、援疆地点、年代和岗位特点，生成有针对性、可执行的提纲。
只输出 JSON。"""


def followup_user_prompt(profile: dict, outline: dict, transcript_text: str, planned: list[str]) -> str:
    planned_text = "\n".join(f"- {q}" for q in planned[:40]) or "- （暂无）"
    tail = (transcript_text or "").strip()
    if len(tail) > 4500:
        tail = tail[-4500:]
    return f"""口述人信息：
{profile_text(profile)}

已有提纲中的问题（不要重复）：
{planned_text}

刚转写的访谈内容：
\"\"\"
{tail or '（暂无转写内容）'}
\"\"\"

请提出 4 个最值得马上追问的问题。只输出 JSON。"""


def archive_user_prompt(profile: dict, outline: dict, transcript_text: str) -> str:
    outline_lines = []
    for section in (outline or {}).get("sections", []):
        title = section.get("title", "")
        outline_lines.append(f"- {title}")
    outline_text = "\n".join(outline_lines) or "- （未设置提纲）"
    body = (transcript_text or "").strip()
    if len(body) > 20000:
        body = body[:20000]
    return f"""请把以下援疆口述访谈整理为一份口述档案。

口述人基础信息：
{profile_text(profile)}

访谈提纲章节：
{outline_text}

访谈转写稿：
\"\"\"
{body}
\"\"\"

请严格依据转写稿整理，只输出 JSON。"""


def _q(*items: str) -> list[str]:
    return [item for item in items if item]


GENERIC_SECTIONS = [
    {
        "title": "一、出发：选择与告别",
        "goal": "还原报名援疆、下定决心和离家出发的过程。",
        "questions": _q(
            "当年是在什么情况下得知援疆消息的？您为什么决定报名？",
            "家里人当时是什么态度？临行前您和他们说了些什么？",
            "出发那天是什么季节、什么天气？还记得车站或机场的场景吗？",
            "临走时最放不下的是什么？带了哪些现在想来很特别的行李？",
        ),
    },
    {
        "title": "二、初到：环境与适应",
        "goal": "记录对新疆的第一印象，以及气候、语言、饮食、住宿的适应过程。",
        "questions": _q(
            "第一次踏上新疆的土地，最先看到、听到、闻到的是什么？",
            "当地的气候和饮食，哪一点最让您不习惯？后来怎么适应的？",
            "语言沟通上有过什么误会或有趣的事？",
            "刚到驻地时住哪里？第一天晚上是怎么度过的？",
        ),
    },
    {
        "title": "三、岗位：工作与攻坚",
        "goal": "呈现具体岗位、工作任务、遇到的困难和取得的成果。",
        "questions": _q(
            "您在新疆具体负责什么工作？刚到岗时接到的第一项任务是什么？",
            "工作中最难啃的一块“硬骨头”是什么？您和同事是怎么解决的？",
            "有没有一件让您特别有成就感的事？当时的具体情形是怎样的？",
            "当地同事或群众对您的工作有过什么帮助或提醒？",
        ),
    },
    {
        "title": "四、交往：民族团结与日常",
        "goal": "通过生活细节记录与当地各族群众的真实交往。",
        "questions": _q(
            "您和当地群众走得最近的一次交往是什么？在什么场合？",
            "有没有结亲、过节、做客或者一起劳动的經歷？",
            "有没有哪句话、哪个举动，让您觉得自己被真正接纳了？",
            "现在还记得哪位当地朋友的名字或样子吗？",
        ),
    },
    {
        "title": "五、生活：他乡与故乡",
        "goal": "记录援疆期间的家庭生活、思念、通讯与探亲。",
        "questions": _q(
            "在新疆的那些年，怎么和家人联系？有没有印象很深的一封信或一通电话？",
            "逢年过节时，您通常怎么过？最想家的一次是什么时候？",
            "家人来新疆看过您吗？有没有带他们走过您工作的地方？",
            "援疆期间有没有留下照片、日记、车票或别的物件？",
        ),
    },
    {
        "title": "六、难忘：人与事",
        "goal": "抓取口述人生命中最难忘的人和最想讲的一件事。",
        "questions": _q(
            "如果只让您讲一件事，您最想讲哪一件？请从头说起。",
            "这件事里有没有一个让您至今难忘的表情、动作或一句话？",
            "有没有遇到过危险、委屈或者想放弃的时刻？后来怎么过来的？",
            "有没有帮助过您、您一直想感谢的人？",
        ),
    },
    {
        "title": "七、回望：离开与联系",
        "goal": "记录返程、后续联系与这段经历对人生的影响。",
        "questions": _q(
            "离开新疆那天，您印象最深的是什么？有人来送您吗？",
            "离开后还和当地的人保持联系吗？最近一次联系是什么时候？",
            "后来再回新疆看过吗？变化最大的是什么？",
            "这段援疆经历，给您后来的工作或生活留下了什么？",
        ),
    },
    {
        "title": "八、寄语：给后来者",
        "goal": "留下口述人对青年、对档案、对新疆的寄语。",
        "questions": _q(
            "如果现在的年轻人也去援疆，您最想提醒他什么？",
            "您希望后人从您的讲述里记住什么？",
            "还有什么想补充、但今天一直没有说到的？",
        ),
    },
]


def build_template_outline(profile: dict) -> dict:
    profile = profile or {}
    location = profile.get("location") or "新疆"
    role = profile.get("role") or profile.get("identity") or "援疆工作"
    unit = profile.get("unit") or "派出单位"
    year = profile.get("aid_year") or "当年"
    name = profile.get("name") or "您"

    sections = []
    for section in GENERIC_SECTIONS:
        questions = list(section["questions"])
        if section["title"].startswith("一、"):
            questions.insert(
                0,
                f"{name}，{year}您从{unit}出发去{location}，当时是怎么下决心的？",
            )
        elif section["title"].startswith("三、"):
            questions.insert(
                0,
                f"您在{location}从事{role}，能先讲讲您每天的工作是怎样展开的吗？",
            )
        sections.append(
            {"title": section["title"], "goal": section["goal"], "questions": questions}
        )

    opening = (
        f"{name}您好，感谢您接受这次口述访谈。我们想听您讲讲当年援疆的真实经历和感受。"
        "录音只用于整理口述档案，整理好的文稿会请您确认；您随时可以暂停或要求不记录某些内容。"
        "我们先从您出发去新疆的那段说起，好吗？"
    )
    closing = (
        "谢谢您讲了这么多珍贵的细节。今天的内容我们会认真整理成文字稿，"
        "尽量保留您的原话，整理稿完成后会请您核对。也祝您身体健康，欢迎您以后继续补充。"
    )
    return {
        "opening": opening,
        "sections": sections,
        "closing": closing,
        "tips": [
            "先让对方把一件事讲完整，再追问细节，不要频繁打断。",
            "听到时间、地点、人物、数字时，随手记下，稍后逐一确认。",
            "遇到方言词、少数民族语言地名，记录发音并请对方解释。",
            "情绪起伏时先停一停，递水、等待，比继续提问更重要。",
            "每章结束前做一句小结，请对方确认是否准确。",
        ],
        "generated_by": "template",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "warning": "当前使用内置提纲模板。配置云端 AI 后可生成更贴合个人经历的提纲。",
    }


def _tail_sentences(text: str, count: int = 3) -> list[str]:
    cleaned = re.sub(r"\s+", " ", text or "").strip()
    parts = re.split(r"[。！？!?；;]", cleaned)
    return [p.strip() for p in parts if len(p.strip()) >= 6][-count:]


def build_template_followups(transcript_text: str, outline: dict) -> list[dict]:
    tail = _tail_sentences(transcript_text)
    anchor = tail[-1] if tail else "刚才讲到的这段经历"
    if len(anchor) > 42:
        anchor = anchor[:42] + "……"
    questions = [
        {
            "question": f"您刚才提到“{anchor}”，当时具体是在什么地方、什么时间？身边还有谁？",
            "intent": "还原场景",
            "based_on": anchor,
        },
        {
            "question": "这件事发生的时候，您心里最直接的感受是什么？有没有犹豫过？",
            "intent": "打捞情感",
            "based_on": anchor,
        },
        {
            "question": "在这之前和之后，还发生了哪些事？哪一件对结果影响最大？",
            "intent": "厘清因果",
            "based_on": anchor,
        },
        {
            "question": "如果让您还原当时的一段对话，您还记得谁说了哪句话吗？",
            "intent": "补充细节",
            "based_on": anchor,
        },
    ]
    return questions


def build_template_archive(profile: dict, outline: dict, transcript_text: str) -> dict:
    profile = profile or {}
    name = profile.get("name") or "口述人"
    location = profile.get("location") or "新疆"
    identity = profile.get("identity") or "援疆人员"
    title = f"从故乡到{location}：一位{identity}的援疆口述"
    subtitle = f"{name}口述 · {profile.get('interview_date') or '访谈整理'}"

    sentences = [s.strip() for s in re.split(r"[。！？!?]", transcript_text or "") if s.strip()]
    paragraphs = []
    for i in range(0, len(sentences), 4):
        chunk = "。".join(sentences[i : i + 4])
        if chunk:
            paragraphs.append(chunk + "。")
    if not paragraphs:
        paragraphs = ["（尚未完成语音转写，暂无法整理正文。）"]

    outline_sections = (outline or {}).get("sections") or []
    sections = []
    if outline_sections:
        sections.append(
            {
                "heading": "访谈实录",
                "paragraphs": ["以下内容按录音转写顺序整理，保留口述原貌。"],
            }
        )
        chunk_size = max(1, len(paragraphs) // len(outline_sections))
        for index, section in enumerate(outline_sections):
            start = index * chunk_size
            end = len(paragraphs) if index == len(outline_sections) - 1 else start + chunk_size
            sections.append(
                {
                    "heading": section.get("title", f"第{index + 1}部分"),
                    "paragraphs": paragraphs[start:end] or ["（本部分录音内容较少，待补充。）"],
                }
            )
    else:
        sections = [{"heading": "访谈实录", "paragraphs": paragraphs}]

    persona_parts = [
        f"{name}，{profile.get('gender') or ''}{profile.get('birth_year') or ''}年出生，"
        f"籍贯{profile.get('hometown') or '未记录'}。"
    ]
    if identity:
        persona_parts.append(f"曾任{profile.get('unit') or ''}{profile.get('role') or identity}，")
    if location:
        persona_parts.append(f"{profile.get('aid_year') or ''}赴{location}参加援疆工作。")
    persona = "".join(persona_parts)

    return {
        "title": title,
        "subtitle": subtitle,
        "summary": f"本档案依据{name}的口述录音转写整理，记录其在{location}的援疆经历。"
        "（当前为本地模板整理稿，建议结合录音逐段校对。）",
        "keywords": [location, identity, "援疆", "口述史"],
        "persona": persona,
        "timeline": [],
        "sections": sections,
        "quotes": [],
        "afterword": "本稿由本地模板依据录音转写生成，未经 AI 润色，请人工核对事实与表述。",
        "generated_by": "template",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "warning": "当前使用本地模板整理。配置云端 AI 后可生成更完整、连贯的口述档案。",
    }
