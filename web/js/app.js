const App = {
  state: {
    settings: null,
    system: null,
    interviews: [],
    route: { view: 'home', id: null, step: 1 },
    current: null,
    step: 1,
    filter: 'all',
    search: '',
    followups: null,
    followupText: '',
    quick: null,
    transcribing: null,
    saving: false,
    routeToken: 0,
    lastHash: '#/',
  },
  recorder: null,

  async boot() {
    this.bindChrome();
    try {
      const [settings, system] = await Promise.all([API.settings(), API.system()]);
      this.state.settings = settings;
      this.state.system = system;
    } catch (error) {
      UI.toast('无法连接本地服务，请确认启动窗口仍在运行', 'error', 6000);
    }
    window.addEventListener('hashchange', () => this.route());
    window.addEventListener('beforeunload', (event) => {
      if (this.recorder && this.recorder.active) {
        event.preventDefault();
        event.returnValue = '';
      }
    });
    await this.route();
  },

  bindChrome() {
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) settingsBtn.onclick = () => { window.location.hash = '#/settings'; };
  },

  async refreshSettings() {
    try {
      this.state.settings = await API.settings();
      this.state.system = await API.system();
    } catch (error) { /* 保留旧值 */ }
  },

  async route() {
    const token = ++this.state.routeToken;
    const hash = window.location.hash || '#/';
    if (this.recorder && this.recorder.active) {
      if (hash !== this.state.lastHash) {
        window.history.replaceState(null, '', this.state.lastHash);
        UI.toast('录音正在进行，请先结束录音再离开', 'error');
        return;
      }
    }
    this.state.lastHash = hash;
    const view = document.getElementById('view');
    const footer = document.getElementById('siteFooter');

    if (hash.startsWith('#/settings')) {
      this.state.route = { view: 'settings' };
      this.setNav('settings');
      if (footer) footer.style.display = '';
      await this.renderSettings();
      return;
    }

    if (hash === '#/new') {
      this.state.route = { view: 'workspace', id: null, step: 1 };
      this.setNav('new');
      if (footer) footer.style.display = 'none';
      this.renderWorkspace({ id: null, step: 1 });
      return;
    }

    const match = hash.match(/#\/interview\/([a-zA-Z0-9_-]+)(?:\/(\d+))?/);
    if (match) {
      this.state.route = { view: 'workspace', id: match[1], step: Number(match[2] || 1) };
      this.setNav('new');
      if (footer) footer.style.display = 'none';
      try {
        const item = await API.get(match[1]);
        if (token !== this.state.routeToken) return;
        this.renderWorkspace({ id: match[1], step: Number(match[2] || 1), item });
      } catch (error) {
        if (token !== this.state.routeToken) return;
        this.renderError(error.message);
      }
      return;
    }

    this.state.route = { view: 'home' };
    this.setNav('home');
    if (footer) footer.style.display = '';
    await this.renderHome();
  },

  setNav(name) {
    document.querySelectorAll('#mainNav a').forEach((link) => {
      link.classList.toggle('is-active', link.dataset.nav === name);
    });
  },

  renderError(message) {
    document.getElementById('view').innerHTML = `
      <div class="empty-state fade-in">
        <div class="empty-icon">${UI.icon('archive')}</div>
        <h3>没有找到这份档案</h3>
        <p>${UI.escape(message || '档案可能已被删除')}</p>
        <a class="btn btn-primary" href="#/">返回档案库</a>
      </div>`;
  },

  async renderHome() {
    const view = document.getElementById('view');
    try {
      const data = await API.list();
      this.state.interviews = data.items || [];
    } catch (error) {
      this.renderError(error.message);
      return;
    }
    const items = this.state.interviews;
    const archived = items.filter((item) => item.status === 'archived').length;
    const totalDuration = items.reduce((sum, item) => sum + (item.duration || 0), 0);
    const totalWords = items.reduce((sum, item) => sum + (item.word_count || 0), 0);
    const active = items.filter((item) => item.status !== 'archived').length;

    view.innerHTML = `
      <section class="hero fade-in">
        <div class="hero-copy">
          <div class="eyebrow">Oral History Archive · 援疆记忆</div>
          <h1 class="hero-title">把援疆岁月<br><em>讲给未来听</em></h1>
          <p class="hero-lede">一次安静的倾听，一份可归档的集体记忆。从基础信息到 AI 提纲，从现场追问到成稿导出，让每一位援疆亲历者的讲述都被完整留下。</p>
          <div class="hero-actions">
            <a class="btn btn-primary btn-lg" href="#/new">${UI.icon('mic')}<span>开始一次访谈</span></a>
            <button class="btn btn-secondary btn-lg" data-scroll="flow">${UI.icon('book')}<span>了解采集流程</span></button>
          </div>
          <div class="hero-metrics">
            <div class="metric"><span class="metric-num">${items.length}<small>份</small></span><span class="metric-label">口述档案</span></div>
            <div class="metric"><span class="metric-num">${archived}<small>份</small></span><span class="metric-label">已完成归档</span></div>
            <div class="metric"><span class="metric-num">${this.formatNumber(totalDuration / 60)}<small>分钟</small></span><span class="metric-label">访谈录音</span></div>
            <div class="metric"><span class="metric-num">${this.formatNumber(totalWords)}<small>字</small></span><span class="metric-label">转写文稿</span></div>
          </div>
        </div>
        <div class="hero-art" aria-hidden="true">
          <div class="hero-coord">39°N · 75°E · 援疆口述计划</div>
          <div class="hero-sun"></div>
          <svg class="hero-mountains" viewBox="0 0 600 360" preserveAspectRatio="none">
            <path d="M0 250 L70 205 L120 232 L190 150 L245 190 L320 120 L390 180 L455 145 L520 195 L600 160 L600 360 L0 360 Z" fill="#D9C6A6" opacity=".55"/>
            <path d="M0 292 L58 248 L118 276 L178 214 L238 252 L302 192 L360 232 L430 200 L492 238 L552 212 L600 240 L600 360 L0 360 Z" fill="#C9AF87" opacity=".72"/>
            <path d="M0 330 L62 292 L130 318 L200 268 L268 304 L338 262 L402 292 L470 266 L536 296 L600 280 L600 360 L0 360 Z" fill="#B39466" opacity=".85"/>
            <path d="M0 352 L74 326 L148 344 L224 318 L300 340 L378 316 L452 338 L528 320 L600 334 L600 360 L0 360 Z" fill="#8E7150" opacity=".92"/>
          </svg>
          <svg class="hero-route" viewBox="0 0 400 260" fill="none">
            <path d="M24 214 C 88 190, 118 122, 182 142 S 268 84, 318 96 S 356 66, 382 52" stroke="#9E3E30" stroke-width="1.4" stroke-dasharray="3 7" opacity=".75"/>
            <circle cx="25" cy="214" r="4" fill="#9E3E30"/>
            <circle cx="382" cy="52" r="4" fill="#9E3E30"/>
            <circle cx="182" cy="142" r="3" fill="#B9985E"/>
          </svg>
          <div class="hero-quote">“到祖国最需要的地方去。”<small>一位援疆教师的访谈原话</small></div>
          <div class="hero-stamp">援疆<br>口述</div>
        </div>
      </section>

      <section class="flow" id="flow">
        ${[
          ['01', '录入信息', '口述人、时间、地点与岗位'],
          ['02', '生成提纲', 'AI 起草，人工逐题修改'],
          ['03', '访谈录音', '本地留存，Whisper 离线转写'],
          ['04', '现场追问', '顺着讲述打捞细节'],
          ['05', '整理归档', '生成正文，导出 Word / HTML'],
        ].map(([num, title, desc]) => `
          <div class="flow-item">
            <div class="flow-num">${num}</div>
            <div class="flow-title">${title}</div>
            <div class="flow-desc">${desc}</div>
          </div>`).join('')}
      </section>

      <section class="library" id="library">
        <div class="section-head">
          <div>
            <h2 class="section-title">口述档案库</h2>
            <p class="section-sub">共 ${items.length} 份访谈档案 · ${active} 份进行中 · ${archived} 份已归档</p>
          </div>
          <div class="library-tools">
            <div class="search-box">${UI.icon('search')}<input id="librarySearch" type="search" placeholder="搜索姓名、地点或主题" value="${UI.escapeAttr(this.state.search)}"></div>
            <a class="btn btn-primary btn-sm" href="#/new">${UI.icon('plus')}<span>新建</span></a>
          </div>
        </div>
        <div class="filter-chips" id="filterChips">
          <button class="chip ${this.state.filter === 'all' ? 'is-active' : ''}" data-filter="all">全部 ${items.length}</button>
          <button class="chip ${this.state.filter === 'active' ? 'is-active' : ''}" data-filter="active">进行中 ${active}</button>
          <button class="chip ${this.state.filter === 'archived' ? 'is-active' : ''}" data-filter="archived">已归档 ${archived}</button>
        </div>
        <div class="cards" id="archiveCards">
          ${items.length ? items.map((item) => this.archiveCard(item)).join('') : this.emptyLibrary()}
        </div>
        <div id="filterEmpty" hidden>${this.emptyFilter()}</div>
      </section>`;

    this.bindHome();
    this.applyFilters();
  },

  archiveCard(item) {
    const profile = item.profile || {};
    const name = profile.name || '未命名';
    const location = profile.location || '地点待补';
    const identity = profile.identity || '援疆亲历者';
    const excerpt = profile.topic || profile.highlights || '访谈资料正在整理中，打开档案继续完成采集。';
    const nextStep = item.status === 'archived' ? 5
      : item.status === 'transcribed' ? 4
      : item.status === 'recorded' ? 3
      : item.status === 'outlined' ? 2 : 1;
    const searchable = [item.title, name, location, identity, profile.topic, profile.aid_year].filter(Boolean).join(' ').toLowerCase();
    return `
      <article class="archive-card" data-id="${item.id}" data-status="${item.status}" data-searchable="${UI.escapeAttr(searchable)}" data-kind="${item.status === 'archived' ? 'archived' : 'active'}">
        <div class="card-top">
          <div class="card-head">
            <div class="card-avatar">${UI.escape(String(name).slice(0, 1))}</div>
            <div>
              <div class="card-title">${UI.escape(item.title)}</div>
              <div class="card-meta">
                <span>${UI.icon('map')}${UI.escape(location)}</span>
                <span>${UI.icon('user')}${UI.escape(identity)}</span>
              </div>
            </div>
          </div>
          ${UI.statusPill(item.status)}
        </div>
        <p class="card-excerpt">${UI.escape(excerpt)}</p>
        <div class="card-foot">
          <span>${profile.aid_year ? UI.escape(profile.aid_year) + ' · ' : ''}${UI.relativeTime(item.updated_at)}</span>
          <div class="card-actions">
            ${item.status === 'archived' ? `<button class="icon-btn" data-act="export" data-id="${item.id}" title="导出 Word">${UI.icon('download')}</button>` : ''}
            <button class="icon-btn" data-act="delete" data-id="${item.id}" title="删除档案">${UI.icon('trash')}</button>
            <button class="icon-btn" data-act="open" data-id="${item.id}" data-step="${nextStep}" title="打开档案">${UI.icon('arrow-right')}</button>
          </div>
        </div>
      </article>`;
  },

  emptyLibrary() {
    return `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-icon">${UI.icon('archive')}</div>
        <h3>档案库还是空的</h3>
        <p>从一位援疆亲历者开始，录入基础信息，AI 会先帮你起草一份访谈提纲。</p>
        <a class="btn btn-primary" href="#/new">${UI.icon('plus')}<span>新建第一份访谈</span></a>
      </div>`;
  },

  emptyFilter() {
    return `
      <div class="empty-state" style="grid-column: 1 / -1; margin-top: 18px;">
        <div class="empty-icon">${UI.icon('search')}</div>
        <h3>没有匹配的档案</h3>
        <p>换一个姓名、地点或主题关键词试试。</p>
      </div>`;
  },

  bindHome() {
    const view = document.getElementById('view');
    const scrollBtn = view.querySelector('[data-scroll="flow"]');
    if (scrollBtn) scrollBtn.onclick = () => document.getElementById('flow').scrollIntoView({ behavior: 'smooth' });

    const chips = view.querySelectorAll('#filterChips .chip');
    chips.forEach((chip) => {
      chip.onclick = () => {
        chips.forEach((c) => c.classList.remove('is-active'));
        chip.classList.add('is-active');
        this.state.filter = chip.dataset.filter;
        this.applyFilters();
      };
    });

    const search = view.querySelector('#librarySearch');
    if (search) {
      search.oninput = () => {
        this.state.search = search.value.trim().toLowerCase();
        this.applyFilters();
      };
    }

    const cards = view.querySelector('#archiveCards');
    if (cards) {
      cards.onclick = async (event) => {
        const action = event.target.closest('[data-act]');
        if (action) {
          event.stopPropagation();
          const id = action.dataset.id;
          if (action.dataset.act === 'delete') {
            const item = this.state.interviews.find((it) => it.id === id);
            const ok = await UI.confirmDialog({
              title: '删除这份档案？',
              message: `「${item ? item.title : '该档案'}」的录音、转写与档案将一并删除，且无法恢复。`,
              confirmText: '删除',
              danger: true,
            });
            if (!ok) return;
            try {
              await API.remove(id);
              UI.toast('档案已删除', 'success');
              this.renderHome();
            } catch (error) {
              UI.toast(error.message, 'error');
            }
            return;
          }
          if (action.dataset.act === 'export') {
            window.location.href = `/api/interviews/${id}/export/docx`;
            return;
          }
          if (action.dataset.act === 'open') {
            window.location.hash = `#/interview/${id}/${action.dataset.step}`;
            return;
          }
        }
        const card = event.target.closest('.archive-card');
        if (card) window.location.hash = `#/interview/${card.dataset.id}/1`;
      };
    }
  },

  applyFilters() {
    const cards = Array.from(document.querySelectorAll('#archiveCards .archive-card'));
    const filter = this.state.filter;
    const search = this.state.search;
    let visible = 0;
    cards.forEach((card) => {
      const kindOk = filter === 'all' ? true : card.dataset.kind === filter;
      const searchOk = !search || (card.dataset.searchable || '').includes(search);
      const show = kindOk && searchOk;
      card.style.display = show ? '' : 'none';
      if (show) visible += 1;
    });
    const empty = document.getElementById('filterEmpty');
    if (empty) empty.hidden = visible > 0 || !cards.length;
  },

  formatNumber(value) {
    const n = Number(value) || 0;
    if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, '')} 万`;
    return n.toLocaleString('zh-CN');
  },

  async renderSettings() {
    await this.refreshSettings();
    const settings = this.state.settings || {};
    const system = this.state.system || {};
    const providers = settings.providers || {};
    const storage = settings.storage || system.storage || {};
    const view = document.getElementById('view');

    view.innerHTML = `
      <div class="workspace-head fade-in" style="border-bottom:none; padding-bottom:4px;">
        <button class="btn btn-ghost btn-sm ws-back" data-back>${UI.icon('arrow-left')}<span>档案库</span></button>
        <div class="ws-title-wrap">
          <h1 class="stage-title" style="font-size:30px;">系统设置</h1>
          <div class="ws-meta">云端 AI 负责生成提纲、追问与档案；语音转写完全在本机离线完成。</div>
        </div>
      </div>
      <div class="settings-grid fade-in">
        <section class="settings-card">
          <h2>云端 AI 服务</h2>
          <p class="sub">用于生成访谈提纲、现场追问与口述档案正文。支持任意 OpenAI 兼容接口。</p>
          <div class="settings-row">
            <label>服务商</label>
            <div class="field">
              <div class="provider-presets">
                <select class="select" id="setProvider">
                  ${Object.entries(providers).map(([key, value]) => `<option value="${key}" ${settings.provider === key ? 'selected' : ''}>${UI.escape(value.label)}</option>`).join('')}
                </select>
              </div>
              <span class="field-hint">选择后会自动填入常用地址与模型名，也可以手动修改。</span>
            </div>
          </div>
          <div class="settings-row">
            <label>接口地址</label>
            <div class="field">
              <input class="input" id="setBaseUrl" value="${UI.escapeAttr(settings.base_url || '')}" placeholder="https://api.deepseek.com/v1">
              <span class="field-hint">填写到 /v1 为止，系统会自动拼接 /chat/completions。</span>
            </div>
          </div>
          <div class="settings-row">
            <label>模型名称</label>
            <div class="field">
              <input class="input" id="setModel" value="${UI.escapeAttr(settings.model || '')}" placeholder="deepseek-chat">
            </div>
          </div>
          <div class="settings-row">
            <label>API Key</label>
            <div class="field">
              <input class="input" id="setApiKey" type="password" autocomplete="new-password" placeholder="${settings.has_key ? '已保存，留空则保持不变' : '输入你的 API Key'}">
              <span class="field-hint">密钥仅保存在本机 ${UI.escape(storage.data_dir || 'data')}\\settings.json，不会上传到其他位置。</span>
            </div>
          </div>
          <div class="settings-row">
            <label>生成温度</label>
            <div class="field">
              <input class="input" id="setTemperature" type="number" min="0" max="1.2" step="0.05" value="${settings.temperature != null ? settings.temperature : 0.35}">
              <span class="field-hint">建议 0.3–0.5，数值越低越稳重，越高越发散。</span>
            </div>
          </div>
          <div class="settings-actions">
            <button class="btn btn-primary" id="saveSettings">${UI.icon('save')}<span>保存设置</span></button>
            <button class="btn btn-secondary" id="testSettings">${UI.icon('sparkles')}<span>测试连接</span></button>
            ${settings.has_key ? `<button class="btn btn-ghost btn-sm" id="clearKey">清除已保存密钥</button>` : ''}
            <span id="testResult" class="test-result"></span>
          </div>
        </section>

        <section class="settings-card">
          <h2>本地转写与存储</h2>
          <p class="sub">录音、转写与档案均保存在本机项目目录，语音识别不上传云端。</p>
          <div class="settings-row">
            <label>Whisper 模型</label>
            <div class="field">
              <select class="select" id="setWhisperModel">
                <option value="small" ${settings.whisper_model === 'small' ? 'selected' : ''}>small · 约 484MB · 推荐</option>
                <option value="medium" ${settings.whisper_model === 'medium' ? 'selected' : ''}>medium · 约 1.5GB · 更准确但更慢</option>
              </select>
              <span class="field-hint">medium 首次使用会自动下载，CPU 转写速度约为实时的 1 倍。</span>
            </div>
          </div>
          <div class="settings-row">
            <label>计算精度</label>
            <div class="field">
              <select class="select" id="setComputeType">
                <option value="int8" ${settings.whisper_compute_type === 'int8' ? 'selected' : ''}>int8 · CPU 推荐</option>
                <option value="float32" ${settings.whisper_compute_type === 'float32' ? 'selected' : ''}>float32 · 更耗内存</option>
              </select>
            </div>
          </div>
          <div class="settings-row">
            <label>录音语言</label>
            <div class="field">
              <select class="select" id="setLanguage">
                <option value="zh" ${settings.language !== 'auto' ? 'selected' : ''}>中文（普通话）</option>
                <option value="auto" ${settings.language === 'auto' ? 'selected' : ''}>自动识别</option>
              </select>
            </div>
          </div>
          <div class="settings-row">
            <label>识别提示词</label>
            <div class="field">
              <textarea class="textarea" id="setPrompt" rows="4">${UI.escape(settings.initial_prompt || '')}</textarea>
              <span class="field-hint">写入常见地名、人名与专业词，可提升中文识别准确率。</span>
            </div>
          </div>
          <div class="settings-note">
            当前转写模型：${UI.escape(system.whisper_model || settings.whisper_model || 'small')} · ${system.whisper_ready ? '模型已就绪' : '首次转写时自动下载'}。
            所有缓存、模型和临时文件均指向 E 盘项目目录。
          </div>
          <div style="margin-top:22px;">
            <h3 style="font-size:16px; margin-bottom:10px;">存储位置</h3>
            <div class="storage-row"><span class="k">数据目录</span><span class="v">${UI.escape(storage.data_dir || '')}</span></div>
            <div class="storage-row"><span class="k">录音目录</span><span class="v">${UI.escape(storage.audio_dir || (storage.data_dir ? storage.data_dir + '\\audio' : ''))}</span></div>
            <div class="storage-row"><span class="k">模型缓存</span><span class="v">${UI.escape(storage.cache_dir || '')}</span></div>
          </div>
        </section>
      </div>`;

    this.bindSettings();
  },

  bindSettings() {
    const view = document.getElementById('view');
    const back = view.querySelector('[data-back]');
    if (back) back.onclick = () => { window.location.hash = '#/'; };

    const providerSelect = document.getElementById('setProvider');
    const providerMap = (this.state.settings && this.state.settings.providers) || {};
    if (providerSelect) {
      providerSelect.onchange = () => {
        const preset = providerMap[providerSelect.value];
        if (!preset) return;
        const base = document.getElementById('setBaseUrl');
        const model = document.getElementById('setModel');
        if (base && preset.base_url) base.value = preset.base_url;
        if (model && preset.model) model.value = preset.model;
      };
    }

    const testBtn = document.getElementById('testSettings');
    if (testBtn) {
      testBtn.onclick = async () => {
        const result = document.getElementById('testResult');
        result.className = 'test-result';
        result.textContent = '正在测试…';
        testBtn.disabled = true;
        try {
          const response = await API.testSettings({
            provider: providerSelect.value,
            base_url: document.getElementById('setBaseUrl').value.trim(),
            model: document.getElementById('setModel').value.trim(),
            api_key: document.getElementById('setApiKey').value.trim(),
          });
          result.className = `test-result ${response.ok ? 'ok' : 'err'}`;
          result.textContent = `${response.message}（${response.latency_ms}ms）`;
        } catch (error) {
          result.className = 'test-result err';
          result.textContent = error.message;
        } finally {
          testBtn.disabled = false;
        }
      };
    }

    const saveBtn = document.getElementById('saveSettings');
    if (saveBtn) {
      saveBtn.onclick = async () => {
        const payload = {
          provider: document.getElementById('setProvider').value,
          base_url: document.getElementById('setBaseUrl').value.trim(),
          model: document.getElementById('setModel').value.trim(),
          temperature: document.getElementById('setTemperature').value,
          api_key: document.getElementById('setApiKey').value.trim(),
          whisper_model: document.getElementById('setWhisperModel').value,
          whisper_compute_type: document.getElementById('setComputeType').value,
          language: document.getElementById('setLanguage').value,
          initial_prompt: document.getElementById('setPrompt').value,
        };
        if (!payload.base_url) { UI.toast('请填写接口地址', 'error'); return; }
        if (!payload.model) { UI.toast('请填写模型名称', 'error'); return; }
        saveBtn.disabled = true;
        try {
          this.state.settings = await API.saveSettings(payload);
          this.state.system = await API.system();
          UI.toast('设置已保存', 'success');
          this.renderSettings();
        } catch (error) {
          UI.toast(error.message, 'error');
        } finally {
          saveBtn.disabled = false;
        }
      };
    }

    const clearBtn = document.getElementById('clearKey');
    if (clearBtn) {
      clearBtn.onclick = async () => {
        const ok = await UI.confirmDialog({
          title: '清除 API Key？',
          message: '清除后无法调用云端 AI，提纲、追问与档案将退回本地模板。',
          confirmText: '清除',
          danger: true,
        });
        if (!ok) return;
        try {
          this.state.settings = await API.saveSettings({ clear_key: true });
          this.state.system = await API.system();
          UI.toast('密钥已清除', 'success');
          this.renderSettings();
        } catch (error) {
          UI.toast(error.message, 'error');
        }
      };
    }
  },
};

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.boot());
