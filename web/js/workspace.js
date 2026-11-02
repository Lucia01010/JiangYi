App.blankInterview = function blankInterview() {
  return {
    id: null,
    title: '',
    profile: {},
    outline: {},
    transcript: {},
    archive: {},
    audio_path: null,
    duration: 0,
    status: 'draft',
    created_at: null,
    updated_at: null,
    word_count: 0,
  };
};

App.STEP_META = [
  { step: 1, title: '基础信息', desc: '口述人资料', stage: '基础信息', sub: '先留下可核对的身份与经历线索' },
  { step: 2, title: '访谈提纲', desc: 'AI 起草 · 人工可改', stage: '访谈提纲', sub: '所有问题都可以人工增删、改写与勾选' },
  { step: 3, title: '录音与转写', desc: '本地 Whisper', stage: '录音与转写', sub: '录音保存在本机，语音转写完全离线' },
  { step: 4, title: '访谈追问', desc: '顺着讲述深挖', stage: '访谈追问', sub: '从转写内容中生成可以马上使用的追问' },
  { step: 5, title: '口述档案', desc: '生成与导出', stage: '口述档案', sub: '整理成一份可归档、可导出的正文' },
];

App.renderWorkspace = async function renderWorkspace({ id, step, item }) {
  const previousId = this.state.current ? this.state.current.id : null;
  if (previousId && previousId !== (id || null)) {
    this.state.followups = null;
    this.state.followupText = '';
    this.state.quick = null;
    this.state.transcribing = null;
  }
  this.state.route = { view: 'workspace', id: id || null, step: step || 1 };
  if (item) {
    this.state.current = item;
  } else if (id) {
    try {
      this.state.current = await API.get(id);
    } catch (error) {
      this.renderError(error.message);
      return;
    }
  } else {
    this.state.current = this.blankInterview();
  }
  this.state.step = Math.max(1, Math.min(5, Number(step) || 1));
  if (!this.state.current.id && this.state.step > 1) this.state.step = 1;
  this.paintWorkspace();
};

App.paintWorkspace = function paintWorkspace() {
  const item = this.state.current || this.blankInterview();
  const step = this.state.step || 1;
  const view = document.getElementById('view');
  const profile = item.profile || {};
  const outline = item.outline || {};
  const transcript = item.transcript || {};
  const archive = item.archive || {};
  const sections = outline.sections || [];
  const questions = sections.flatMap((s) => s.questions || []);
  const followupDone = questions.some((q) => q && q.source === 'followup');
  const done = {
    1: Boolean(profile.name && profile.location),
    2: sections.length > 0,
    3: Boolean(transcript.text),
    4: followupDone,
    5: Boolean((archive.sections || []).length),
  };
  const meta = this.STEP_META[step - 1];
  const name = profile.name || '待录入';
  const status = item.status || (item.id ? 'draft' : 'draft');

  view.innerHTML = `
    <div class="workspace-head fade-in">
      <button class="btn btn-ghost btn-sm ws-back" data-back>${UI.icon('arrow-left')}<span>档案库</span></button>
      <div class="ws-title-wrap">
        <input class="title-input" id="wsTitle" value="${UI.escapeAttr(item.title || '')}" placeholder="保存后将自动生成档案标题" aria-label="档案标题">
        <div class="ws-meta">
          ${item.id ? UI.statusPill(status) : '<span class="status-pill">新建访谈</span>'}
          ${profile.location ? `<span>${UI.icon('map')} ${UI.escape(profile.location)}</span>` : ''}
          ${item.id ? `<span>${UI.relativeTime(item.updated_at)}</span>` : '<span>填写基础信息后即可生成提纲</span>'}
          ${item.duration ? `<span>${UI.icon('clock')} ${UI.fmtDuration(item.duration)}</span>` : ''}
        </div>
      </div>
      <div class="ws-actions">
        ${item.id && done[5] ? `<button class="btn btn-secondary btn-sm" data-export-docx>${UI.icon('download')}<span>导出 Word</span></button>` : ''}
        <button class="btn btn-ghost btn-sm" data-open-settings>${UI.icon('settings')}<span>AI 设置</span></button>
      </div>
    </div>
    <div class="workspace-grid fade-in">
      <aside class="steps-aside">
        <div class="steps-list">
          <span class="steps-line"></span>
          ${this.STEP_META.map((s) => `
            <div class="step-item ${s.step === step ? 'is-active' : ''} ${done[s.step] && s.step !== step ? 'is-done' : ''}" data-step="${s.step}">
              <span class="step-index">${done[s.step] && s.step !== step ? UI.icon('check') : String(s.step).padStart(2, '0')}</span>
              <span class="step-labels">
                <span class="step-title">${s.title}</span>
                <span class="step-desc">${s.desc}</span>
              </span>
            </div>`).join('')}
        </div>
        <div class="profile-mini">
          <div class="profile-mini-head">
            <div class="card-avatar">${UI.escape(String(name).slice(0, 1))}</div>
            <div>
              <div class="profile-mini-name">${UI.escape(name)}</div>
              <div class="profile-mini-sub">${UI.escape(profile.identity || '援疆亲历者')}</div>
            </div>
          </div>
          <div class="mini-rows">
            <div class="mini-row"><span>援疆地</span><span>${UI.escape(profile.location || '待填写')}</span></div>
            <div class="mini-row"><span>时 间</span><span>${UI.escape(profile.aid_year || '待填写')}</span></div>
            <div class="mini-row"><span>转 写</span><span>${transcript.text ? `${transcript.text.length} 字` : '尚未转写'}</span></div>
          </div>
        </div>
        <div class="storage-note">${UI.icon('shield')}<span>录音、转写与档案保存在本机 E 盘；仅提纲、追问与档案整理会调用云端 AI。</span></div>
      </aside>
      <section class="stage">
        <div class="stage-head">
          <div>
            <div class="stage-kicker">STEP ${String(step).padStart(2, '0')} / 05</div>
            <h2 class="stage-title">${meta.stage}</h2>
            <p class="stage-sub">${meta.sub}</p>
          </div>
          ${this.stageHeadAction(step)}
        </div>
        <div class="stage-body" id="stageBody">${this.renderStage(step)}</div>
      </section>
    </div>`;

  this.bindWorkspaceChrome();
  this.bindStep(step);
};

App.stageHeadAction = function stageHeadAction(step) {
  if (!this.state.current || !this.state.current.id) return '';
  if (step === 3 && this.state.current.audio_path) {
    return `<span class="badge">已保存录音</span>`;
  }
  if (step === 2 && (this.state.current.outline || {}).sections) {
    return `<span class="badge">${(this.state.current.outline.sections || []).length} 个章节</span>`;
  }
  if (step === 5 && (this.state.current.archive || {}).sections) {
    const byAi = this.state.current.archive.generated_by === 'ai';
    return `<span class="badge">${byAi ? 'AI 整理稿' : '模板整理稿'}</span>`;
  }
  return '';
};

App.renderStage = function renderStage(step) {
  if (step === 1) return this.renderInfoStep();
  if (step === 2) return this.renderOutlineStep();
  return this.renderStudioStep(step);
};

App.bindWorkspaceChrome = function bindWorkspaceChrome() {
  const view = document.getElementById('view');
  const back = view.querySelector('[data-back]');
  if (back) back.onclick = () => this.leaveWorkspace();
  const settings = view.querySelector('[data-open-settings]');
  if (settings) settings.onclick = () => { window.location.hash = '#/settings'; };
  const exportBtn = view.querySelector('[data-export-docx]');
  if (exportBtn) exportBtn.onclick = () => {
    window.location.href = `/api/interviews/${this.state.current.id}/export/docx`;
  };
  const title = view.querySelector('#wsTitle');
  if (title) {
    title.oninput = () => { if (this.state.current) this.state.current.title = title.value; };
    title.onchange = async () => {
      if (!this.state.current || !this.state.current.id) return;
      const value = title.value.trim();
      if (!value) return;
      try {
        const updated = await API.patch(this.state.current.id, { title: value });
        this.state.current = updated;
        UI.toast('标题已保存', 'success', 1800);
      } catch (error) { UI.toast(error.message, 'error'); }
    };
  }

  view.querySelectorAll('.step-item').forEach((node) => {
    node.onclick = async () => {
      const target = Number(node.dataset.step);
      if (target === this.state.step) return;
      if (!this.state.current || !this.state.current.id) {
        UI.toast('请先在第一步保存基础信息', 'info');
        return;
      }
      if (this.recorder && this.recorder.active) {
        UI.toast('录音正在进行，请先结束录音', 'error');
        return;
      }
      const ok = await this.leaveStep();
      if (!ok) return;
      window.location.hash = `#/interview/${this.state.current.id}/${target}`;
    };
  });
};

App.leaveWorkspace = async function leaveWorkspace() {
  if (this.recorder && this.recorder.active) {
    UI.toast('录音正在进行，请先结束录音', 'error');
    return;
  }
  if (this.state.current && this.state.current.id) {
    const ok = await this.leaveStep();
    if (!ok) return;
  }
  window.location.hash = '#/';
};

App.leaveStep = async function leaveStep() {
  const step = this.state.step;
  if (step === 1 && this.state.current && this.state.current.id) {
    try {
      const profile = this.collectProfile();
      if (profile.name && profile.location) {
        const updated = await API.patch(this.state.current.id, { profile });
        this.state.current = updated;
      }
    } catch (error) { /* 不阻断切换 */ }
  }
  if (step === 2) {
    try { await this.saveOutline(true); } catch (error) { UI.toast(error.message, 'error'); return false; }
  }
  if (step === 3 && this.saveTranscript) {
    try {
      const ok = await this.saveTranscript(true);
      if (!ok) return false;
    } catch (error) { UI.toast(error.message, 'error'); return false; }
  }
  if (step === 5 && this.collectArchive) {
    try { await this.saveArchive(true); } catch (error) { UI.toast(error.message, 'error'); return false; }
  }
  return true;
};

/* ---------------- 第一步：基础信息 ---------------- */

App.collectProfile = function collectProfile() {
  const value = (id) => {
    const node = document.getElementById(id);
    return node ? node.value.trim() : '';
  };
  return {
    name: value('f-name'),
    gender: value('f-gender'),
    birth_year: value('f-birth'),
    hometown: value('f-hometown'),
    ethnicity: value('f-ethnicity'),
    identity: value('f-identity'),
    aid_year: value('f-aidYear'),
    location: value('f-location'),
    unit: value('f-unit'),
    role: value('f-role'),
    highlights: value('f-highlights'),
    interview_date: value('f-interviewDate'),
    interview_place: value('f-interviewPlace'),
    interviewer: value('f-interviewer'),
    topic: value('f-topic'),
    notes: value('f-notes'),
  };
};

App.renderInfoStep = function renderInfoStep() {
  const item = this.state.current || this.blankInterview();
  const p = item.profile || {};
  const settings = this.state.settings || {};
  const notConfigured = !(settings.has_key);
  const genders = ['男', '女', '其他'];
  const identities = ['援疆干部', '援疆教师', '援疆医生', '科技人员', '企业管理人员', '志愿者', '其他'];
  if (p.gender && !genders.includes(p.gender)) genders.push(p.gender);
  if (p.identity && !identities.includes(p.identity)) identities.push(p.identity);

  return `
    ${notConfigured ? `<div class="banner banner-warn">${UI.icon('sparkles')}<div>尚未配置云端 AI。你仍可保存资料，生成提纲时会先使用内置模板。<a href="#/settings">前往设置填写 API Key</a></div></div>` : ''}
    <div class="form-section">
      <div class="form-section-head"><h3>口述人信息</h3><span class="badge">用于生成提纲</span></div>
      <div class="form-grid">
        <div class="field"><label for="f-name">姓名<span class="req">*</span></label><input class="input" id="f-name" value="${UI.escapeAttr(p.name || '')}" placeholder="如：张建国"></div>
        <div class="field"><label for="f-gender">性别</label><select class="select" id="f-gender"><option value="">未填写</option>${genders.map((g) => `<option ${p.gender === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
        <div class="field"><label for="f-birth">出生年份</label><input class="input" id="f-birth" value="${UI.escapeAttr(p.birth_year || '')}" placeholder="如：1952"></div>
        <div class="field"><label for="f-hometown">籍贯</label><input class="input" id="f-hometown" value="${UI.escapeAttr(p.hometown || '')}" placeholder="如：江苏南京"></div>
        <div class="field"><label for="f-ethnicity">民族</label><input class="input" id="f-ethnicity" value="${UI.escapeAttr(p.ethnicity || '')}" placeholder="如：汉族"></div>
        <div class="field"><label for="f-identity">援疆身份</label><select class="select" id="f-identity"><option value="">未填写</option>${identities.map((g) => `<option ${p.identity === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-head"><h3>援疆经历</h3><span class="badge">访谈的时间坐标</span></div>
      <div class="form-grid">
        <div class="field"><label for="f-location">援疆地点<span class="req">*</span></label><input class="input" id="f-location" value="${UI.escapeAttr(p.location || '')}" placeholder="如：喀什地区疏附县"></div>
        <div class="field"><label for="f-aidYear">援疆时间 / 批次</label><input class="input" id="f-aidYear" value="${UI.escapeAttr(p.aid_year || '')}" placeholder="如：2017—2020，第九批"></div>
        <div class="field"><label for="f-unit">派出单位</label><input class="input" id="f-unit" value="${UI.escapeAttr(p.unit || '')}" placeholder="如：南京市第一中学"></div>
        <div class="field"><label for="f-role">岗位 / 专业</label><input class="input" id="f-role" value="${UI.escapeAttr(p.role || '')}" placeholder="如：高中数学教师"></div>
        <div class="field full"><label for="f-highlights">主要工作与已知经历</label><textarea class="textarea" id="f-highlights" rows="3" placeholder="如：承担高三数学教学、带教当地青年教师、参与学校教研组建设……">${UI.escape(p.highlights || '')}</textarea><span class="field-hint">写下的线索越多，AI 生成的提纲越贴合个人经历。</span></div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-head"><h3>访谈安排</h3></div>
      <div class="form-grid">
        <div class="field"><label for="f-interviewDate">访谈日期</label><input class="input" id="f-interviewDate" type="date" value="${UI.escapeAttr(p.interview_date || '')}"></div>
        <div class="field"><label for="f-interviewPlace">访谈地点</label><input class="input" id="f-interviewPlace" value="${UI.escapeAttr(p.interview_place || '')}" placeholder="如：南京市鼓楼区家中"></div>
        <div class="field"><label for="f-interviewer">访谈人</label><input class="input" id="f-interviewer" value="${UI.escapeAttr(p.interviewer || '')}" placeholder="如：项目组 李明"></div>
        <div class="field"><label for="f-topic">访谈主题</label><input class="input" id="f-topic" value="${UI.escapeAttr(p.topic || '')}" placeholder="如：支教三年与民族团结"></div>
        <div class="field full"><label for="f-notes">备注</label><textarea class="textarea" id="f-notes" rows="2" placeholder="如：口述人听力较弱，需放慢语速；家中有老照片可补充拍摄。">${UI.escape(p.notes || '')}</textarea></div>
      </div>
    </div>

    <div class="form-actions">
      <span class="hint">带 * 为必填项。也可先保存资料，稍后再生成提纲。</span>
      <button class="btn btn-secondary" data-save-only>${UI.icon('save')}<span>仅保存资料</span></button>
      <button class="btn btn-primary" data-save-generate>${UI.icon('sparkles')}<span>保存并生成提纲</span></button>
    </div>`;
};

App.bindStep1 = function bindStep1() {
  document.querySelectorAll('#stageBody textarea').forEach((node) => {
    UI.autoResize(node);
    node.oninput = () => UI.autoResize(node);
  });
  const saveOnly = document.querySelector('[data-save-only]');
  const saveGenerate = document.querySelector('[data-save-generate]');
  if (saveOnly) saveOnly.onclick = () => this.saveProfile(false);
  if (saveGenerate) saveGenerate.onclick = () => this.saveProfile(true);
};

App.saveProfile = async function saveProfile(generate) {
  if (this.state.saving) return;
  const profile = this.collectProfile();
  if (!profile.name) {
    UI.toast('请填写口述人姓名', 'error');
    document.getElementById('f-name').focus();
    return;
  }
  if (!profile.location) {
    UI.toast('请填写援疆地点', 'error');
    document.getElementById('f-location').focus();
    return;
  }
  this.state.saving = true;
  const buttons = document.querySelectorAll('[data-save-only], [data-save-generate]');
  buttons.forEach((btn) => { btn.disabled = true; });
  try {
    let item;
    if (this.state.current.id) {
      item = await API.patch(this.state.current.id, {
        profile,
        title: this.state.current.title || undefined,
      });
    } else {
      item = await API.create({ profile, title: this.state.current.title || '' });
      if (this.collectArchive) this.collectArchive = null;
    }
    this.state.current = item;
    if (!generate) {
      UI.toast('资料已保存', 'success');
      if (!this.state.current.id) return;
      if (window.location.hash === '#/new') {
        window.location.hash = `#/interview/${item.id}/1`;
      } else {
        this.paintWorkspace();
      }
      return;
    }
    UI.showLoading('正在生成访谈提纲', 'AI 正在结合口述人的身份与经历起草问题');
    const outline = await API.generateOutline(item.id);
    this.state.current.outline = outline;
    UI.hideLoading();
    if (outline.warning) {
      UI.toast(outline.warning, 'info', 5200);
    } else {
      UI.toast('访谈提纲已生成，请逐题核对修改', 'success');
    }
    window.location.hash = `#/interview/${item.id}/2`;
  } catch (error) {
    UI.hideLoading();
    UI.toast(error.message, 'error', 5000);
  } finally {
    this.state.saving = false;
    buttons.forEach((btn) => { btn.disabled = false; });
  }
};

/* ---------------- 第二步：提纲 ---------------- */

App.renderOutlineStep = function renderOutlineStep() {
  const item = this.state.current || this.blankInterview();
  if (!item.id) return '';
  const outline = item.outline || {};
  const sections = outline.sections || [];
  const settings = this.state.settings || {};
  const notConfigured = !settings.has_key;
  const total = sections.reduce((sum, s) => sum + (s.questions || []).length, 0);
  const asked = sections.reduce((sum, s) => sum + (s.questions || []).filter((q) => q.asked).length, 0);

  if (!sections.length) {
    return `
      ${notConfigured ? `<div class="banner banner-warn">${UI.icon('sparkles')}<div>尚未配置云端 AI。可先生成一份内置模板提纲，再到<a href="#/settings">设置</a>中配置后重新生成。</div></div>` : ''}
      <div class="empty-state">
        <div class="empty-icon">${UI.icon('sparkles')}</div>
        <h3>还没有访谈提纲</h3>
        <p>让 AI 根据口述人的身份、援疆地点与岗位，先起草一份可修改的提纲。</p>
        <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin-top:18px;">
          <button class="btn btn-primary" data-generate-outline>${UI.icon('sparkles')}<span>AI 生成提纲</span></button>
          <button class="btn btn-secondary" data-template-outline>${UI.icon('book')}<span>使用内置模板</span></button>
        </div>
      </div>`;
  }

  return `
    ${outline.warning ? `<div class="banner banner-warn">${UI.icon('sparkles')}<div>${UI.escape(outline.warning)}</div></div>` : ''}
    <div class="outline-toolbar">
      <span class="outline-meta">${sections.length} 个章节 · ${total} 个问题 · 已问 ${asked} 个 · ${outline.generated_by === 'ai' ? 'AI 生成' : '模板生成'}</span>
      <span class="spacer"></span>
      <button class="btn btn-ghost btn-sm" data-add-section>${UI.icon('plus')}<span>添加章节</span></button>
      <button class="btn btn-secondary btn-sm" data-regenerate>${UI.icon('refresh')}<span>重新生成</span></button>
      <button class="btn btn-primary btn-sm" data-save-outline>${UI.icon('save')}<span>保存修改</span></button>
    </div>
    ${sections.map((section, index) => this.outlineSection(section, index)).join('')}
    <div class="outline-extras">
      <div class="extra-card"><h4>开场白</h4><textarea id="outlineOpening" rows="4">${UI.escape(outline.opening || '')}</textarea></div>
      <div class="extra-card"><h4>结束语</h4><textarea id="outlineClosing" rows="4">${UI.escape(outline.closing || '')}</textarea></div>
    </div>
    ${(outline.tips || []).length ? `<div class="extra-card" style="margin-top:14px;"><h4>现场提示</h4><div class="tips-list">${outline.tips.map((tip) => `<div class="tip-item">${UI.escape(tip)}</div>`).join('')}</div></div>` : ''}
    <div class="form-actions" style="margin-top:20px;">
      <span class="hint">提纲只是访谈的脚手架，现场可以根据讲述随时调整。</span>
      <button class="btn btn-secondary" data-save-outline>${UI.icon('save')}<span>保存修改</span></button>
      <button class="btn btn-primary" data-next-recording>${UI.icon('mic')}<span>保存并开始录音</span></button>
    </div>`;
};

App.outlineSection = function outlineSection(section, index) {
  const questions = section.questions || [];
  return `
    <div class="outline-section" data-section data-index="${index}">
      <div class="sec-head">
        <span class="sec-index">${String(index + 1).padStart(2, '0')}</span>
        <input class="sec-title-input" data-role="section-title" value="${UI.escapeAttr(section.title || '')}" placeholder="章节标题">
        <div class="sec-tools">
          <button class="icon-btn" data-sec-up title="上移章节" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button class="icon-btn" data-sec-down title="下移章节" ${index === (this.state.current.outline.sections || []).length - 1 ? 'disabled' : ''}>↓</button>
          <button class="icon-btn" data-sec-del title="删除章节">${UI.icon('trash')}</button>
        </div>
      </div>
      <div class="sec-body">
        <div class="sec-goal-row"><span class="tag">本章目标</span><input class="sec-goal-input" data-role="section-goal" value="${UI.escapeAttr(section.goal || '')}" placeholder="这一章希望获得哪些材料"></div>
        <div class="question-list">
          ${questions.map((q) => `
            <div class="q-row ${q.asked ? 'is-asked' : ''}" data-question data-qid="${UI.escapeAttr(q.id || '')}" data-source="${UI.escapeAttr(q.source || 'edited')}">
              <button class="q-check" data-toggle-asked title="标记为已问" type="button">${UI.icon('check')}</button>
              <textarea class="q-text" rows="1" placeholder="输入访谈问题">${UI.escape(q.text || '')}</textarea>
              <div class="q-actions">
                <button class="icon-btn" data-q-up title="上移">↑</button>
                <button class="icon-btn" data-q-down title="下移">↓</button>
                <button class="icon-btn" data-q-del title="删除问题">${UI.icon('x')}</button>
              </div>
            </div>`).join('')}
        </div>
        <button class="add-q" data-add-question>${UI.icon('plus')}<span>添加问题</span></button>
      </div>
    </div>`;
};

App.bindStep2 = function bindStep2() {
  const stage = document.getElementById('stageBody');
  if (!stage) return;
  stage.querySelectorAll('textarea').forEach((node) => {
    UI.autoResize(node);
    node.oninput = () => UI.autoResize(node);
  });
  const generate = stage.querySelector('[data-generate-outline]');
  if (generate) generate.onclick = () => this.runOutlineGeneration(false);
  const template = stage.querySelector('[data-template-outline]');
  if (template) template.onclick = () => this.runOutlineGeneration(true);
  const regenerate = stage.querySelector('[data-regenerate]');
  if (regenerate) regenerate.onclick = async () => {
    const ok = await UI.confirmDialog({
      title: '重新生成提纲？',
      message: '当前手动作答与修改将被新提纲覆盖，建议先保存或导出。',
      confirmText: '重新生成',
    });
    if (ok) this.runOutlineGeneration(false);
  };
  stage.querySelectorAll('[data-save-outline]').forEach((btn) => {
    btn.onclick = () => this.saveOutline(false);
  });
  stage.querySelectorAll('[data-next-recording]').forEach((btn) => {
    btn.onclick = async () => {
      const ok = await this.saveOutline(true);
      if (!ok) return;
      window.location.hash = `#/interview/${this.state.current.id}/3`;
    };
  });
  const addSection = stage.querySelector('[data-add-section]');
  if (addSection) {
    addSection.onclick = () => {
      this.collectOutline();
      const outline = this.state.current.outline;
      outline.sections.push({ title: '新增章节', goal: '', questions: [] });
      this.paintWorkspace();
    };
  }
  stage.querySelectorAll('[data-section]').forEach((sectionNode) => {
    const index = Number(sectionNode.dataset.index);
    const up = sectionNode.querySelector('[data-sec-up]');
    const down = sectionNode.querySelector('[data-sec-down]');
    const del = sectionNode.querySelector('[data-sec-del]');
    if (up) up.onclick = () => this.moveSection(index, -1);
    if (down) down.onclick = () => this.moveSection(index, 1);
    if (del) {
      del.onclick = async () => {
        const ok = await UI.confirmDialog({
          title: '删除这一章？',
          message: '该章节下的所有问题将一并删除。',
          confirmText: '删除',
          danger: true,
        });
        if (!ok) return;
        this.collectOutline();
        this.state.current.outline.sections.splice(index, 1);
        this.paintWorkspace();
      };
    }
    const addQ = sectionNode.querySelector('[data-add-question]');
    if (addQ) {
      addQ.onclick = () => {
        this.collectOutline();
        const outline = this.state.current.outline;
        outline.sections[index].questions.push({
          id: `q_${Math.random().toString(16).slice(2, 10)}`,
          text: '',
          asked: false,
          source: 'edited',
        });
        this.paintWorkspace();
      };
    }
    sectionNode.querySelectorAll('[data-question]').forEach((row, qIndex) => {
      const toggle = row.querySelector('[data-toggle-asked]');
      if (toggle) {
        toggle.onclick = () => row.classList.toggle('is-asked');
      }
      const qUp = row.querySelector('[data-q-up]');
      const qDown = row.querySelector('[data-q-down]');
      const qDel = row.querySelector('[data-q-del]');
      if (qUp) qUp.onclick = () => this.moveQuestion(index, qIndex, -1);
      if (qDown) qDown.onclick = () => this.moveQuestion(index, qIndex, 1);
      if (qDel) {
        qDel.onclick = () => {
          this.collectOutline();
          this.state.current.outline.sections[index].questions.splice(qIndex, 1);
          this.paintWorkspace();
        };
      }
    });
  });
};

App.collectOutline = function collectOutline() {
  const item = this.state.current;
  if (!item) return {};
  const previous = item.outline || {};
  const node = document.getElementById('stageBody');
  if (!node || !node.querySelector('[data-section]')) {
    return previous;
  }
  const sections = Array.from(node.querySelectorAll('[data-section]')).map((sectionNode) => ({
    title: sectionNode.querySelector('[data-role="section-title"]').value.trim(),
    goal: sectionNode.querySelector('[data-role="section-goal"]').value.trim(),
    questions: Array.from(sectionNode.querySelectorAll('[data-question]')).map((row) => ({
      id: row.dataset.qid || `q_${Math.random().toString(16).slice(2, 10)}`,
      text: row.querySelector('.q-text').value.trim(),
      asked: row.classList.contains('is-asked'),
      source: row.dataset.source || 'edited',
    })).filter((q) => q.text),
  })).filter((section) => section.title || section.questions.length);
  const outline = {
    ...previous,
    opening: (document.getElementById('outlineOpening') || {}).value || '',
    closing: (document.getElementById('outlineClosing') || {}).value || '',
    sections,
  };
  item.outline = outline;
  return outline;
};

App.moveSection = function moveSection(index, delta) {
  this.collectOutline();
  const sections = this.state.current.outline.sections;
  const target = index + delta;
  if (target < 0 || target >= sections.length) return;
  const [section] = sections.splice(index, 1);
  sections.splice(target, 0, section);
  this.paintWorkspace();
};

App.moveQuestion = function moveQuestion(sectionIndex, qIndex, delta) {
  this.collectOutline();
  const questions = this.state.current.outline.sections[sectionIndex].questions;
  const target = qIndex + delta;
  if (target < 0 || target >= questions.length) return;
  const [question] = questions.splice(qIndex, 1);
  questions.splice(target, 0, question);
  this.paintWorkspace();
};

App.saveOutline = async function saveOutline(silent) {
  if (!this.state.current || !this.state.current.id) return false;
  const outline = this.collectOutline();
  try {
    const updated = await API.patch(this.state.current.id, { outline });
    this.state.current = updated;
    if (!silent) {
      UI.toast('提纲修改已保存', 'success', 2200);
      this.paintWorkspace();
    }
    return true;
  } catch (error) {
    if (!silent) UI.toast(error.message, 'error');
    throw error;
  }
};

App.runOutlineGeneration = async function runOutlineGeneration(useTemplate) {
  if (!this.state.current || !this.state.current.id) return;
  UI.showLoading(useTemplate ? '正在套用提纲模板' : '正在生成访谈提纲', useTemplate ? '使用内置的援疆口述史提纲框架' : 'AI 正在结合口述人的身份与经历起草问题');
  try {
    const outline = await API.generateOutline(this.state.current.id, useTemplate);
    this.state.current.outline = outline;
    UI.hideLoading();
    UI.toast(outline.warning || '访谈提纲已生成', outline.warning ? 'info' : 'success', 4800);
    this.paintWorkspace();
  } catch (error) {
    UI.hideLoading();
    UI.toast(error.message, 'error', 5000);
  }
};

App.bindStep = function bindStep(step) {
  if (step === 1) this.bindStep1();
  else if (step === 2) this.bindStep2();
  else this.bindStudioStep(step);
};
