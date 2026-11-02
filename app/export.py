import html
import re
from datetime import datetime

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

from .prompts import PROFILE_LABELS


def fmt_duration(seconds: float) -> str:
    seconds = int(seconds or 0)
    minutes, sec = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours}小时{minutes}分{sec}秒"
    if minutes:
        return f"{minutes}分{sec}秒"
    return f"{sec}秒"


def fmt_clock(seconds: float) -> str:
    seconds = int(seconds or 0)
    minutes, sec = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours:02d}:{minutes:02d}:{sec:02d}"
    return f"{minutes:02d}:{sec:02d}"


def safe_filename(title: str, ext: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|\r\n]+', "_", title or "援疆口述档案").strip("_")
    return f"{cleaned or '援疆口述档案'}.{ext}"


def profile_rows(profile: dict) -> list[tuple[str, str]]:
    rows = []
    for key, label in PROFILE_LABELS:
        value = str((profile or {}).get(key, "") or "").strip()
        if value:
            rows.append((label, value))
    return rows


def _meta_line(interview: dict) -> str:
    created = (interview.get("created_at") or "")[:10]
    return created or datetime.now().strftime("%Y-%m-%d")


def to_markdown(interview: dict) -> str:
    profile = interview.get("profile") or {}
    archive = interview.get("archive") or {}
    transcript = interview.get("transcript") or {}
    lines = [f"# {archive.get('title') or interview.get('title')}", ""]
    if archive.get("subtitle"):
        lines += [f"> {archive['subtitle']}", ""]
    lines += [
        f"- 档案编号：{interview.get('id', '').upper()}",
        f"- 整理日期：{_meta_line(interview)}",
        f"- 访谈时长：{fmt_duration(interview.get('duration'))}",
        f"- 转写字数：{len(transcript.get('text', ''))}",
        "",
        "## 一、基本信息",
        "",
        "| 项目 | 内容 |",
        "| --- | --- |",
    ]
    for label, value in profile_rows(profile):
        lines.append(f"| {label} | {value.replace('|', '｜')} |")
    lines += ["", "## 二、内容摘要", "", archive.get("summary", "（暂无）"), ""]
    if archive.get("keywords"):
        lines += [f"**关键词：** {'、'.join(archive['keywords'])}", ""]
    if archive.get("persona"):
        lines += ["## 三、口述人小传", "", archive["persona"], ""]
    if archive.get("timeline"):
        lines += ["## 四、经历时间线", ""]
        for entry in archive["timeline"]:
            lines.append(f"- **{entry.get('time', '')}**：{entry.get('event', '')}")
        lines.append("")
    lines += ["## 五、口述正文", ""]
    for section in archive.get("sections", []):
        lines += [f"### {section.get('heading', '')}", ""]
        for paragraph in section.get("paragraphs", []):
            lines += [paragraph, ""]
    if archive.get("quotes"):
        lines += ["## 六、口述原声", ""]
        for quote in archive["quotes"]:
            context = f"（{quote['context']}）" if quote.get("context") else ""
            lines += [f"> “{quote['text']}”{context}", ""]
    if archive.get("afterword"):
        lines += ["## 七、整理说明", "", archive["afterword"], ""]
    segments = transcript.get("segments") or []
    if segments:
        lines += ["---", "", "## 附录：访谈转写稿", ""]
        for segment in segments:
            lines.append(f"- [{fmt_clock(segment.get('start'))}] {segment.get('text', '')}")
        lines.append("")
    elif transcript.get("text"):
        lines += ["---", "", "## 附录：访谈转写稿", "", transcript["text"], ""]
    lines += ["---", "", "本档案由「疆忆 · 援疆口述档案智能采集系统」整理。"]
    return "\n".join(lines)


HTML_STYLE = """
@page { size: A4; margin: 2.2cm 2.4cm; }
* { box-sizing: border-box; }
body {
  margin: 0; background: #EFE9DC; color: #2B2623;
  font-family: "Noto Serif SC", "Songti SC", "SimSun", serif;
  line-height: 1.9; font-size: 11.5pt;
}
.page {
  width: 210mm; min-height: 297mm; margin: 0 auto; padding: 24mm 22mm;
  background: #FBF8F2; position: relative; overflow: hidden;
  box-shadow: 0 10px 40px rgba(43,38,35,.12);
}
.page::before {
  content: ""; position: absolute; inset: 0; pointer-events: none; opacity: .35;
  background-image: radial-gradient(#b7a98c 0.6px, transparent 0.6px);
  background-size: 18px 18px;
}
.cover { display: flex; flex-direction: column; justify-content: center; min-height: 245mm; position: relative; z-index: 2; }
.cover .kicker { letter-spacing: .35em; color: #8A6D3B; font-size: 10pt; margin-bottom: 18mm; }
.cover h1 { font-size: 30pt; line-height: 1.5; margin: 0 0 6mm; font-weight: 600; letter-spacing: .04em; }
.cover h2 { font-size: 13pt; color: #6B6157; font-weight: 400; margin: 0 0 16mm; }
.cover .meta { display: grid; grid-template-columns: auto 1fr; gap: 3mm 8mm; color: #4A423B; font-size: 10.5pt; }
.cover .seal {
  position: absolute; right: 4mm; bottom: 12mm; width: 30mm; height: 30mm;
  border: 2px solid #9E3E30; color: #9E3E30; border-radius: 3mm;
  display: flex; align-items: center; justify-content: center;
  font-size: 13pt; letter-spacing: .3em; transform: rotate(-6deg); opacity: .8;
}
.inner h1 { font-size: 21pt; margin: 0 0 3mm; }
.inner h2 { font-size: 15pt; margin: 10mm 0 4mm; padding-bottom: 2mm; border-bottom: 1px solid #D9C9AA; }
.inner h3 { font-size: 12.5pt; margin: 6mm 0 2mm; color: #6B4A28; }
.inner p { margin: 0 0 4mm; text-indent: 2em; text-align: justify; }
.inner p.noindent { text-indent: 0; }
.info { width: 100%; border-collapse: collapse; margin: 4mm 0 8mm; font-size: 10.5pt; }
.info td { border: 1px solid #DCCDB2; padding: 2.2mm 3mm; vertical-align: top; }
.info td.k { width: 26%; color: #6B6157; background: #F5EEE1; }
.summary { background: #F5EEE1; border-left: 3px solid #C2A676; padding: 4mm 5mm; text-indent: 0; margin: 3mm 0 6mm; }
.keywords { color: #6B6157; text-indent: 0; margin-bottom: 6mm; }
.quote { margin: 5mm 0; padding: 3mm 5mm; background: #F7F0E3; border-left: 3px solid #9E3E30; }
.quote p { text-indent: 0; font-size: 11pt; margin: 0; }
.quote .ctx { color: #7A6B5B; font-size: 9pt; margin-top: 2mm; }
.timeline { border-left: 1px solid #C9B692; margin: 3mm 0 6mm 2mm; padding-left: 5mm; }
.timeline .row { margin-bottom: 3mm; }
.timeline .time { color: #8A5A38; font-weight: 600; margin-right: 3mm; }
.appendix { font-size: 10pt; color: #4A423B; }
.appendix p { text-indent: 0; margin-bottom: 2mm; }
.appendix .ts { color: #9E3E30; font-variant-numeric: tabular-nums; margin-right: 2mm; }
.footer { margin-top: 10mm; padding-top: 3mm; border-top: 1px solid #D9C9AA; color: #8A7A66; font-size: 9pt; display: flex; justify-content: space-between; }
@media print {
  body { background: #fff; }
  .page { box-shadow: none; margin: 0; width: auto; min-height: auto; padding: 0; }
  .page::before { opacity: .2; }
  .cover { min-height: 245mm; }
  .inner { page-break-before: always; }
}
"""


def _esc(value) -> str:
    return html.escape(str(value or ""))


def _paragraphs(items, css_class="") -> str:
    cls = f' class="{css_class}"' if css_class else ""
    return "".join(f"<p{cls}>{_esc(item)}</p>" for item in items)


def to_html(interview: dict) -> str:
    profile = interview.get("profile") or {}
    archive = interview.get("archive") or {}
    transcript = interview.get("transcript") or {}
    title = archive.get("title") or interview.get("title")
    rows = profile_rows(profile)
    info_rows = "".join(
        f'<tr><td class="k">{_esc(label)}</td><td>{_esc(value)}</td></tr>'
        for label, value in rows
    )
    sections = []
    for section in archive.get("sections", []):
        sections.append(f"<h2>{_esc(section.get('heading'))}</h2>")
        sections.append(_paragraphs(section.get("paragraphs", [])))
    timeline = ""
    if archive.get("timeline"):
        items = "".join(
            f'<div class="row"><span class="time">{_esc(entry.get("time"))}</span>'
            f"{_esc(entry.get('event'))}</div>"
            for entry in archive["timeline"]
        )
        timeline = f'<h2>经历时间线</h2><div class="timeline">{items}</div>'
    quotes = ""
    if archive.get("quotes"):
        blocks = "".join(
            f'<div class="quote"><p>“{_esc(q.get("text"))}”</p>'
            + (f'<p class="ctx">{_esc(q.get("context"))}</p>' if q.get("context") else "")
            + "</div>"
            for q in archive["quotes"]
        )
        quotes = f"<h2>口述原声</h2>{blocks}"
    appendix = ""
    segments = transcript.get("segments") or []
    if segments:
        lines = "".join(
            f'<p><span class="ts">[{fmt_clock(s.get("start"))}]</span>{_esc(s.get("text"))}</p>'
            for s in segments
        )
        appendix = f'<div class="appendix">{lines}</div>'
    elif transcript.get("text"):
        appendix = f'<div class="appendix">{_paragraphs(str(transcript["text"]).splitlines())}</div>'
    persona = (
        f"<h2>口述人小传</h2>{_paragraphs([archive.get('persona')])}"
        if archive.get("persona")
        else ""
    )
    keywords = (
        f'<p class="keywords">关键词：{_esc("、".join(archive.get("keywords", [])))}</p>'
        if archive.get("keywords")
        else ""
    )
    afterword = (
        f"<h2>整理说明</h2>{_paragraphs([archive.get('afterword')])}"
        if archive.get("afterword")
        else ""
    )
    meta_rows = [
        ("档案编号", str(interview.get("id", "")).upper()),
        ("整理日期", _meta_line(interview)),
        ("访谈时长", fmt_duration(interview.get("duration"))),
        ("转写字数", f"{len(transcript.get('text', ''))} 字"),
    ]
    cover_meta = "".join(
        f"<span>{_esc(k)}</span><span>{_esc(v)}</span>" for k, v in meta_rows
    )
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{_esc(title)}</title>
<style>{HTML_STYLE}</style>
</head>
<body>
<div class="page cover">
  <div class="kicker">援疆口述档案 · ORAL HISTORY ARCHIVE</div>
  <h1>{_esc(title)}</h1>
  <h2>{_esc(archive.get("subtitle") or "疆忆 · 援疆口述档案智能采集系统")}</h2>
  <div class="meta">{cover_meta}</div>
  <div class="seal">疆忆</div>
</div>
<div class="page inner">
  <h1>{_esc(title)}</h1>
  <h2>基本信息</h2>
  <table class="info">{info_rows or '<tr><td class="k">口述人</td><td>未填写</td></tr>'}</table>
  <h2>内容摘要</h2>
  <p class="summary">{_esc(archive.get("summary") or "（暂无摘要）")}</p>
  {keywords}
  {persona}
  {timeline}
  <h2>口述正文</h2>
  {"".join(sections) or '<p class="noindent">（尚未生成正文）</p>'}
  {quotes}
  {afterword}
  <h2>附录：访谈转写稿</h2>
  {appendix or '<p class="noindent">（尚无转写稿）</p>'}
  <div class="footer"><span>疆忆 · 援疆口述档案智能采集系统</span><span>{_esc(_meta_line(interview))}</span></div>
</div>
</body>
</html>"""


def _set_cell_shading(cell, color: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), color)
    tc_pr.append(shd)


def _set_run_font(run, name: str, size: float | None = None, bold: bool = False, color: str | None = None):
    run.font.name = name
    run.font.bold = bold
    if size:
        run.font.size = Pt(size)
    if color:
        run.font.color.rgb = RGBColor.from_string(color)
    run._element.rPr.rFonts.set(qn("w:eastAsia"), name)


def _style_font(style, name: str, size: float, bold: bool = False, color: str | None = None):
    style.font.name = name
    style.font.size = Pt(size)
    style.font.bold = bold
    if color:
        style.font.color.rgb = RGBColor.from_string(color)
    style._element.get_or_add_rPr().rFonts.set(qn("w:eastAsia"), name)


def _add_page_number(paragraph) -> None:
    run = paragraph.add_run()
    fld_begin = OxmlElement("w:fldChar")
    fld_begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = "PAGE"
    fld_end = OxmlElement("w:fldChar")
    fld_end.set(qn("w:fldCharType"), "end")
    run._r.append(fld_begin)
    run._r.append(instr)
    run._r.append(fld_end)


def to_docx(interview: dict, target_path: str) -> str:
    profile = interview.get("profile") or {}
    archive = interview.get("archive") or {}
    transcript = interview.get("transcript") or {}
    title = archive.get("title") or interview.get("title")

    doc = Document()
    section = doc.sections[0]
    section.page_width, section.page_height = Cm(21), Cm(29.7)
    section.top_margin = Cm(2.4)
    section.bottom_margin = Cm(2.2)
    section.left_margin = Cm(2.6)
    section.right_margin = Cm(2.6)

    normal = doc.styles["Normal"]
    _style_font(normal, "宋体", 12, color="2B2623")
    normal.paragraph_format.line_spacing_rule = WD_LINE_SPACING.ONE_POINT_FIVE
    normal.paragraph_format.space_after = Pt(6)

    for name, size in (("Heading 1", 20), ("Heading 2", 14), ("Heading 3", 12.5)):
        _style_font(doc.styles[name], "黑体", size, bold=True, color="2B2623")

    # 封面
    for _ in range(4):
        doc.add_paragraph()
    kicker = doc.add_paragraph()
    kicker.alignment = WD_ALIGN_PARAGRAPH.LEFT
    _set_run_font(kicker.add_run("援疆口述档案 · ORAL HISTORY ARCHIVE"), "宋体", 10, color="8A6D3B")

    title_para = doc.add_paragraph()
    _set_run_font(title_para.add_run(title), "宋体", 28, bold=True)
    title_para.paragraph_format.space_before = Pt(18)
    title_para.paragraph_format.space_after = Pt(12)

    subtitle = doc.add_paragraph()
    _set_run_font(
        subtitle.add_run(archive.get("subtitle") or "疆忆 · 援疆口述档案智能采集系统"),
        "宋体",
        13,
        color="6B6157",
    )
    subtitle.paragraph_format.space_after = Pt(28)

    meta_items = [
        ("档案编号", str(interview.get("id", "")).upper()),
        ("整理日期", _meta_line(interview)),
        ("访谈时长", fmt_duration(interview.get("duration"))),
        ("转写字数", f"{len(transcript.get('text', ''))} 字"),
    ]
    meta_table = doc.add_table(rows=len(meta_items), cols=2)
    meta_table.alignment = WD_TABLE_ALIGNMENT.LEFT
    for row, (key, value) in zip(meta_table.rows, meta_items):
        row.cells[0].width = Cm(3.2)
        p = row.cells[0].paragraphs[0]
        _set_run_font(p.add_run(key), "宋体", 10.5, color="6B6157")
        p = row.cells[1].paragraphs[0]
        _set_run_font(p.add_run(value), "宋体", 10.5)

    doc.add_paragraph()
    seal = doc.add_paragraph()
    seal.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    _set_run_font(seal.add_run("疆 忆"), "宋体", 16, bold=True, color="9E3E30")

    doc.add_page_break()

    def h(text, level=2):
        doc.add_heading(text, level=level)

    def body(text):
        p = doc.add_paragraph()
        p.paragraph_format.first_line_indent = Pt(24)
        p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        _set_run_font(p.add_run(text), "宋体", 12)

    h(title, 1)
    h("基本信息")
    rows = profile_rows(profile) or [("口述人", "未填写")]
    table = doc.add_table(rows=len(rows), cols=2)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for row, (label, value) in zip(table.rows, rows):
        row.cells[0].width = Cm(4.2)
        row.cells[1].width = Cm(10.5)
        _set_cell_shading(row.cells[0], "F5EEE1")
        p = row.cells[0].paragraphs[0]
        _set_run_font(p.add_run(label), "宋体", 10.5, color="6B6157")
        p = row.cells[1].paragraphs[0]
        _set_run_font(p.add_run(value), "宋体", 10.5)

    h("内容摘要")
    summary = doc.add_paragraph()
    summary.paragraph_format.left_indent = Cm(0.4)
    summary.paragraph_format.right_indent = Cm(0.4)
    _set_run_font(summary.add_run(archive.get("summary") or "（暂无摘要）"), "楷体", 11.5)
    if archive.get("keywords"):
        p = doc.add_paragraph()
        _set_run_font(p.add_run("关键词：" + "、".join(archive["keywords"]), ), "宋体", 10.5, color="6B6157")

    if archive.get("persona"):
        h("口述人小传")
        body(archive["persona"])

    if archive.get("timeline"):
        h("经历时间线")
        for entry in archive["timeline"]:
            p = doc.add_paragraph(style="List Bullet")
            _set_run_font(p.add_run(str(entry.get("time", "")) + "："), "宋体", 11, bold=True)
            _set_run_font(p.add_run(str(entry.get("event", ""))), "宋体", 11)

    h("口述正文")
    for sec in archive.get("sections", []):
        h(sec.get("heading", ""), 3)
        for paragraph in sec.get("paragraphs", []):
            body(paragraph)

    if archive.get("quotes"):
        h("口述原声")
        for quote in archive["quotes"]:
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Cm(0.8)
            p.paragraph_format.right_indent = Cm(0.8)
            _set_run_font(p.add_run(f"“{quote.get('text', '')}”"), "楷体", 11.5, color="6B4A28")
            if quote.get("context"):
                ctx = doc.add_paragraph()
                ctx.paragraph_format.left_indent = Cm(0.8)
                _set_run_font(ctx.add_run(f"——{quote['context']}"), "宋体", 9, color="7A6B5B")

    if archive.get("afterword"):
        h("整理说明")
        body(archive["afterword"])

    h("附录：访谈转写稿")
    segments = transcript.get("segments") or []
    if segments:
        for segment in segments:
            p = doc.add_paragraph()
            p.paragraph_format.space_after = Pt(3)
            _set_run_font(
                p.add_run(f"[{fmt_clock(segment.get('start'))}] "),
                "宋体",
                9.5,
                color="9E3E30",
            )
            _set_run_font(p.add_run(segment.get("text", "")), "宋体", 10)
    elif transcript.get("text"):
        for line in str(transcript["text"]).splitlines():
            body(line)
    else:
        body("（尚无转写稿）")

    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _set_run_font(footer.add_run("疆忆 · 援疆口述档案智能采集系统    "), "宋体", 9, color="8A7A66")
    _add_page_number(footer)

    doc.save(target_path)
    return target_path
