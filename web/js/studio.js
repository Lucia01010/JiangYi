/* 第三步、第四步、第五步的界面与交互 */

App.renderStudioStep = function renderStudioStep(step) {
  if (step === 3) return this.renderRecordStep();
  if (step === 4) return this.renderFollowupStep();
  return this.renderArchiveStep();
};

App.bindStudioStep = function bindStudioStep(step) {
  if (step === 3) this.bindRecordStep();
  else if (step === 4) this.bindFollowupStep();
  else this.bindArchiveStep();
};

/* ---------------- 第三步：录音与转写 ---------------- */

App.renderRecordStep = function renderRecordStep() {
  const item = this.state.current || this.blankInterview();
  const transcript = item.transcript || {};
  const segments = transcript.segments || [];
  const hasAudio = Boolean(item.audio_path);
  const audioUrl = hasAudio
    ? `/api/interviews/${item.id}/audio?v=${encodeURIComponent(item.updated_at || '')}`
    : '';
  const quick = this.state.quick;

  return `
    <div class="record-grid">
      <div class="record-console" id="recordConsole">
        <div class="console-top">
          <span class="console-label">现场录音</span>
          <span class="rec-status" id="recStatus">待开始</span>
        </div>
        <div class="timer-display" id="recTimer">${hasAudio ? UI.fmtClock(item.duration || 0) : '00:00'}</div>
        <div class="timer-note" id="recNote">${hasAudio ? '上一次录音已保存，重新录制会覆盖原文件' : '点击下方按钮开始录音'}</div>
        <div class="wave-box">
          <canvas id="waveCanvas"></canvas>
          <div class="wave-idle" id="waveIdle">等待录音开始</div>
        </div>
        <div class="record-controls">
          <button class="record-main" id="recordMain" type="button" title="开始或结束录音">${UI.icon('mic')}</button>
          <div class="sub-controls">
            <button class="btn btn-secondary btn-sm" id="recordPause" type="button" hidden>${UI.icon('pause')}<span>暂停</span></button>
          </div>
        </div>
        <div class="record-hint">
          ${UI.icon('shield')}<span>录音直接写入本机 E 盘，不会上传云端</span>
          <button class="btn btn-ghost btn-sm" type="button" data-upload-trigger>${UI.icon('upload')}<span>上传已有录音</span></button>
          <input type="file" id="audioFileInput" accept="audio/*,.webm,.m4a,.mp3,.wav,.ogg,.flac" hidden>
        </div>
      </div>

      <div class="audio-panel">
        <div class="audio-panel-head">
          <h3>录音文件</h3>
          <span class="audio-meta" id="audioMeta">${hasAudio ? `${UI.fmtDuration(item.duration || 0)} · 已保存` : '尚未录音'}</span>
        </div>
        ${hasAudio ? `
          <audio class="audio-player" controls preload="metadata" src="${audioUrl}"></audio>
          <div class="audio-meta">${UI.escape(item.audio_name || '录音文件')}</div>
          <div class="audio-actions" style="margin-top:10px;">
            <button class="btn btn-secondary btn-sm" data-start-transcribe>${UI.icon('wave')}<span>开始转写</span></button>
            <a class="btn btn-ghost btn-sm" href="${audioUrl}" download>${UI.icon('download')}<span>下载录音</span></a>
          </div>` : `
          <div class="empty-state" style="padding:26px 8px;">
            <div class="empty-icon">${UI.icon('mic')}</div>
            <p>还没有录音。可以直接开始录音，或上传手机、录音笔里的音频文件。</p>
          </div>`}
      </div>
    </div>

    <div class="transcribe-panel">
      <div class="audio-panel-head">
        <h3>语音转写</h3>
        <span class="audio-meta">本地 Whisper${transcript.model ? ` · ${UI.escape(transcript.model)}` : ''}</span>
      </div>
      <div id="jobHost"></div>
      ${transcript.text ? `
        ${segments.length ? `
          <div class="segments">
            ${segments.map((segment) => `
              <div class="segment">
                <span class="timestamp">${UI.fmtClock(segment.start)}</span>
                <span>${UI.escape(segment.text)}</span>
              </div>`).join('')}
          </div>` : ''}
        <textarea class="transcript-edit" id="transcriptText" aria-label="转写文稿">${UI.escape(transcript.text)}</textarea>
        <div class="transcript-toolbar">
          <span class="meta">${transcript.text.length} 字 · 可人工校对后保存</span>
          <button class="btn btn-secondary btn-sm" data-save-transcript>${UI.icon('save')}<span>保存文本</span></button>
          <button class="btn btn-ghost btn-sm" data-copy-transcript>${UI.icon('copy')}<span>复制全文</span></button>
          <button class="btn btn-primary btn-sm" data-next-followup>${UI.icon('arrow-right')}<span>进入追问</span></button>
        </div>` : `
        <div class="banner banner-warn">
          ${UI.icon('wave')}
          <div>${hasAudio ? '录音已就绪。点击右侧「开始转写」，语音识别完全在本机离线完成，首次加载模型会稍慢。' : '请先录音或上传一段访谈音频，再进行语音转写。'}</div>
        </div>`}
    </div>

    <div class="quick-panel">
      <div class="quick-head">
        <h3>${UI.icon('sparkles')}边录边追问</h3>
        <span class="badge">可选</span>
      </div>
      <p class="quick-sub">录音过程中或刚录完，都可以把当前片段交给 AI，马上获得几条可以接着问的问题，帮助把讲述往深处带。</p>
      <div class="field">
        <label for="quickText">当前片段或关键句</label>
        <textarea class="textarea" id="quickText" rows="3" placeholder="也可以直接输入刚才听到的关键句，例如：他说那年冬天教室的炉子总是灭……"></textarea>
      </div>
      <div class="audio-actions" style="margin-top:10px;">
        <button class="btn btn-primary btn-sm" data-quick-text>${UI.icon('sparkles')}<span>根据文字追问</span></button>
        <button class="btn btn-secondary btn-sm" data-quick-audio>${UI.icon('mic')}<span>用已录片段追问</span></button>
        <select class="section-select" id="quickSection">${this.outlineOptions()}</select>
      </div>
      <div id="quickResults" style="margin-top:14px;">${this.quickResultsHtml(quick)}</div>
    </div>`;
};

App.quickResultsHtml = function quickResultsHtml(quick) {
  if (!quick) return '';
  const followups = quick.followups || [];
  if (!followups.length) return '';
  return `
    ${quick.text ? `<p class="quick-sub">识别片段：${UI.escape(String(quick.text).slice(0, 140))}${quick.text.length > 140 ? '…' : ''}</p>` : ''}
    <div class="quick-list">
      ${followups.map((entry, index) => `
        <div class="quick-item">
          <span class="qtag">${UI.escape(entry.intent || '追问')}</span>
          <div>${UI.escape(entry.question || '')}</div>
          <div class="quick-item-actions">
            <button class="text-link" data-quick-add="${index}" type="button">记入提纲</button>
            <button class="text-link" data-quick-copy="${index}" type="button">复制</button>
          </div>
        </div>`).join('')}
    </div>
    ${quick.warning ? `<p class="quick-sub" style="margin-top:10px;">${UI.escape(quick.warning)}</p>` : ''}`;
};

App.paintQuickResults = function paintQuickResults() {
  const host = document.getElementById('quickResults');
  if (host) host.innerHTML = this.quickResultsHtml(this.state.quick);
  if (host) this.bindQuickResultButtons(host);
};

App.outlineOptions = function outlineOptions() {
  const sections = ((this.state.current || {}).outline || {}).sections || [];
  if (!sections.length) return '<option value="-1">新建「现场追问」章节</option>';
  return sections.map((section, index) => `<option value="${index}">${UI.escape(section.title || `第${index + 1}章`)}</option>`).join('');
};

App.bindRecordStep = function bindRecordStep() {
  const stage = document.getElementById('stageBody');
  if (!stage) return;

  const main = stage.querySelector('#recordMain');
  const pause = stage.querySelector('#recordPause');
  const uploadTrigger = stage.querySelector('[data-upload-trigger]');
  const fileInput = stage.querySelector('#audioFileInput');
  const transcribeBtn = stage.querySelector('[data-start-transcribe]');

  if (main) {
    main.onclick = () => {
      if (this.recorder && this.recorder.active) this.stopRecording();
      else this.startRecording();
    };
  }
  if (pause) {
    pause.onclick = () => {
      if (!this.recorder || !this.recorder.active) return;
      if (this.recorder.isRecording) this.recorder.pause();
      else this.recorder.resume();
    };
  }
  if (uploadTrigger && fileInput) {
    uploadTrigger.onclick = () => fileInput.click();
    fileInput.onchange = () => {
      const file = fileInput.files && fileInput.files[0];
      if (file) this.uploadAudioFile(file);
      fileInput.value = '';
    };
  }
  if (transcribeBtn) transcribeBtn.onclick = () => this.startTranscription(false);

  stage.querySelectorAll('[data-save-transcript]').forEach((btn) => {
    btn.onclick = () => this.saveTranscript(false);
  });
  stage.querySelectorAll('[data-copy-transcript]').forEach((btn) => {
    btn.onclick = () => {
      const node = document.getElementById('transcriptText');
      if (node) UI.copy(node.value);
    };
  });
  stage.querySelectorAll('[data-next-followup]').forEach((btn) => {
    btn.onclick = async () => {
      const ok = await this.saveTranscript(true);
      if (!ok) return;
      window.location.hash = `#/interview/${this.state.current.id}/4`;
    };
  });

  const quickText = document.getElementById('quickText');
  if (quickText) {
    UI.autoResize(quickText);
    quickText.oninput = () => UI.autoResize(quickText);
  }
  const quickBtn = stage.querySelector('[data-quick-text]');
  if (quickBtn) {
    quickBtn.onclick = () => {
      const node = document.getElementById('quickText');
      const text = node ? node.value.trim() : '';
      if (!text) {
        UI.toast('请先输入一段刚才听到的内容', 'error');
        if (node) node.focus();
        return;
      }
      this.runQuickFollowups(null, text);
    };
  }
  const quickAudioBtn = stage.querySelector('[data-quick-audio]');
  if (quickAudioBtn) {
    quickAudioBtn.onclick = () => {
      const recorder = this.recorder;
      if (!recorder || !recorder.active || !recorder.chunks.length) {
        UI.toast('当前没有可分析的录音片段，请先开始录音或直接输入文字', 'info');
        return;
      }
      const blob = new Blob(recorder.chunks, { type: recorder.mimeType || 'audio/webm' });
      if (!blob.size) {
        UI.toast('录音片段为空，请再录一会儿', 'error');
        return;
      }
      this.runQuickFollowups(blob, '');
    };
  }
  const quickHost = document.getElementById('quickResults');
  if (quickHost) this.bindQuickResultButtons(quickHost);

  if (this.recorder && this.recorder.active) {
    this.recorder.onTick = (duration, status) => this.updateRecordTimer(duration, status);
    this.updateRecordTimer(this.recorder.getDuration(), this.recorder.state);
  }
  this.startWaveLoop();
  this.renderJobProgress();
};

App.ensureRecorder = function ensureRecorder() {
  if (!this.recorder) {
    this.recorder = new AudioRecorder((duration, status) => this.updateRecordTimer(duration, status));
  }
  return this.recorder;
};

App.startRecording = async function startRecording() {
  const item = this.state.current;
  if (!item || !item.id) {
    UI.toast('请先保存基础信息，再开始录音', 'info');
    return;
  }
  const main = document.getElementById('recordMain');
  if (main) main.disabled = true;
  try {
    const recorder = this.ensureRecorder();
    await recorder.start();
    this.updateRecordTimer(0, 'recording');
    this.startWaveLoop();
    UI.toast('录音已开始，请保持设备稳定', 'success', 2200);
  } catch (error) {
    UI.toast(error.message, 'error', 5000);
  } finally {
    if (main) main.disabled = false;
  }
};

App.stopRecording = async function stopRecording() {
  const recorder = this.recorder;
  if (!recorder || !recorder.active) return;
  const main = document.getElementById('recordMain');
  if (main) main.disabled = true;
  this.stopWaveLoop();
  let result;
  try {
    result = await recorder.stop();
  } catch (error) {
    UI.toast(`结束录音失败：${error.message}`, 'error');
    if (main) main.disabled = false;
    return;
  }
  recorder.destroy();
  this.recorder = null;
  if (!result.blob || !result.blob.size) {
    UI.toast('没有录到声音，请检查麦克风后重试', 'error');
    this.paintWorkspace();
    return;
  }
  const item = this.state.current;
  const extension = result.mimeType && result.mimeType.includes('mp4') ? 'm4a' : 'webm';
  const form = new FormData();
  form.append('file', result.blob, `recording.${extension}`);
  form.append('duration', String(result.duration || 0));
  UI.showLoading('正在保存录音', '录音文件正在写入本机 E 盘');
  try {
    await API.uploadAudio(item.id, form);
    const updated = await API.get(item.id);
    this.state.current = updated;
    UI.hideLoading();
    this.paintWorkspace();
    UI.toast('录音已保存，开始离线转写', 'success', 2800);
    this.startTranscription(true);
  } catch (error) {
    UI.hideLoading();
    UI.toast(error.message, 'error', 5000);
    if (main) main.disabled = false;
  }
};

App.uploadAudioFile = async function uploadAudioFile(file) {
  const item = this.state.current;
  if (!item || !item.id) return;
  if (file.size > 300 * 1024 * 1024) {
    UI.toast('音频文件超过 300MB，请先压缩或分段上传', 'error');
    return;
  }
  const form = new FormData();
  form.append('file', file, file.name || 'recording.webm');
  form.append('duration', '0');
  UI.showLoading('正在上传录音', `正在写入 ${file.name || '音频文件'}`);
  try {
    await API.uploadAudio(item.id, form);
    const updated = await API.get(item.id);
    this.state.current = updated;
    UI.hideLoading();
    this.paintWorkspace();
    UI.toast('音频已保存，开始离线转写', 'success', 2600);
    this.startTranscription(true);
  } catch (error) {
    UI.hideLoading();
    UI.toast(error.message, 'error', 5000);
  }
};

App.updateRecordTimer = function updateRecordTimer(duration, status) {
  const timer = document.getElementById('recTimer');
  if (timer) timer.textContent = UI.fmtClock(duration);
  const consoleEl = document.getElementById('recordConsole');
  if (consoleEl) {
    consoleEl.classList.toggle('is-recording', status === 'recording');
    consoleEl.classList.toggle('is-paused', status === 'paused');
  }
  const statusEl = document.getElementById('recStatus');
  if (statusEl) {
    statusEl.textContent = status === 'recording' ? '正在录音'
      : status === 'paused' ? '已暂停'
        : status === 'stopped' ? '录音已结束' : '待开始';
  }
  const main = document.getElementById('recordMain');
  if (main) main.innerHTML = status === 'recording' || status === 'paused' ? UI.icon('stop') : UI.icon('mic');
  const pause = document.getElementById('recordPause');
  if (pause) {
    const active = status === 'recording' || status === 'paused';
    pause.hidden = !active;
    if (active) {
      pause.innerHTML = status === 'paused'
        ? `${UI.icon('play')}<span>继续</span>`
        : `${UI.icon('pause')}<span>暂停</span>`;
    }
  }
  const hint = document.getElementById('recNote');
  if (hint && (status === 'recording' || status === 'paused')) {
    hint.textContent = status === 'paused' ? '已暂停，点击继续可以接着录' : '正在录音，请保持设备稳定';
  }
};

App.startWaveLoop = function startWaveLoop() {
  const canvas = document.getElementById('waveCanvas');
  if (!canvas) return;
  if (this._waveRaf) cancelAnimationFrame(this._waveRaf);
  const context = canvas.getContext('2d');
  const history = [];
  const draw = () => {
    const width = canvas.clientWidth || 320;
    const height = canvas.clientHeight || 92;
    const ratio = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    context.clearRect(0, 0, width, height);
    const idle = document.getElementById('waveIdle');
    const active = this.recorder && this.recorder.active;
    if (!active) {
      if (idle) idle.hidden = false;
      context.strokeStyle = 'rgba(160, 146, 126, .35)';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, height / 2);
      context.lineTo(width, height / 2);
      context.stroke();
    } else {
      if (idle) idle.hidden = true;
      const level = Math.max(0.05, this.recorder.getLevel());
      history.push(level);
      if (history.length > 72) history.shift();
      const gap = 2;
      const barWidth = Math.max(2, width / 72 - gap);
      history.forEach((value, index) => {
        const barHeight = Math.max(2, value * height * 0.78);
        const x = index * (barWidth + gap);
        context.fillStyle = index > history.length - 8 ? 'rgba(158, 62, 48, .92)' : 'rgba(158, 62, 48, .42)';
        context.fillRect(x, (height - barHeight) / 2, barWidth, barHeight);
      });
    }
    this._waveRaf = requestAnimationFrame(draw);
  };
  this._waveRaf = requestAnimationFrame(draw);
};

App.stopWaveLoop = function stopWaveLoop() {
  if (this._waveRaf) cancelAnimationFrame(this._waveRaf);
  this._waveRaf = null;
};

App.startTranscription = async function startTranscription(auto) {
  const item = this.state.current;
  if (!item || !item.id) return;
  if (!item.audio_path) {
    UI.toast('请先录制或上传访谈录音', 'error');
    return;
  }
  if (this.state.transcribing && ['queued', 'running'].includes(this.state.transcribing.status)) {
    return;
  }
  try {
    const job = await API.transcribe(item.id);
    this.state.transcribing = { ...job, progress: 0, phase: '排队中' };
    this.renderJobProgress();
    if (!auto) UI.toast('已开始本地转写，可继续停留在这一页', 'info', 2600);
    this.pollTranscription(job.job_id);
  } catch (error) {
    UI.toast(error.message, 'error', 5000);
  }
};

App.pollTranscription = function pollTranscription(jobId) {
  clearTimeout(this._jobTimer);
  const tick = async () => {
    try {
      const job = await API.job(jobId);
      this.state.transcribing = job;
      this.renderJobProgress();
      if (job.status === 'done') {
        this.state.transcribing = null;
        const updated = await API.get(this.state.current.id);
        this.state.current = updated;
        this.renderJobProgress();
        if (this.state.route.view === 'workspace' && this.state.step === 3) {
          this.paintWorkspace();
        }
        UI.toast('转写完成，可以校对文稿了', 'success', 3000);
        return;
      }
      if (job.status === 'error') {
        this.state.transcribing = null;
        this.renderJobProgress();
        UI.toast(`转写失败：${job.error || '未知错误'}`, 'error', 7000);
        return;
      }
      this._jobTimer = setTimeout(tick, 900);
    } catch (error) {
      this.state.transcribing = null;
      this.renderJobProgress();
      UI.toast(error.message, 'error', 5000);
    }
  };
  tick();
};

App.renderJobProgress = function renderJobProgress() {
  const host = document.getElementById('jobHost');
  if (!host) return;
  const job = this.state.transcribing;
  if (!job || !['queued', 'running'].includes(job.status)) {
    host.innerHTML = '';
    return;
  }
  const percent = Math.round((job.progress || 0) * 100);
  host.innerHTML = `
    <div class="job-progress">
      <div class="job-row">
        <span>${UI.escape(job.phase || '正在转写')}</span>
        <span class="muted">${percent}%</span>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div>
    </div>`;
};

App.saveTranscript = async function saveTranscript(silent) {
  const item = this.state.current;
  if (!item || !item.id) return false;
  const node = document.getElementById('transcriptText');
  if (!node) return true;
  const text = node.value.trim();
  const previous = (item.transcript || {}).text || '';
  if (text === previous) return true;
  try {
    const updated = await API.patch(item.id, { transcript_text: text });
    this.state.current = updated;
    if (!silent) {
      UI.toast('转写文稿已保存', 'success', 2200);
      this.paintWorkspace();
    }
    return true;
  } catch (error) {
    if (!silent) UI.toast(error.message, 'error');
    return false;
  }
};

App.runQuickFollowups = async function runQuickFollowups(blob, text) {
  const item = this.state.current;
  if (!item || !item.id) return;
  UI.showLoading('正在分析当前片段', blob ? '先在本机转写片段，再生成追问，可能需要一点时间' : 'AI 正在阅读刚才的内容');
  try {
    let payload;
    if (blob) {
      const form = new FormData();
      form.append('audio', blob, 'quick.webm');
      payload = await API.quickFollowups(item.id, form);
    } else {
      payload = await API.followups(item.id, text);
      payload.text = text;
    }
    this.state.quick = payload;
    UI.hideLoading();
    this.paintQuickResults();
    UI.toast(payload.warning || '追问已生成', payload.warning ? 'info' : 'success', 4600);
  } catch (error) {
    UI.hideLoading();
    UI.toast(error.message, 'error', 6000);
  }
};

App.bindQuickResultButtons = function bindQuickResultButtons(host) {
  const quick = this.state.quick;
  if (!quick) return;
  const followups = quick.followups || [];
  host.querySelectorAll('[data-quick-add]').forEach((btn) => {
    btn.onclick = () => {
      const entry = followups[Number(btn.dataset.quickAdd)];
      if (!entry) return;
      const select = document.getElementById('quickSection');
      this.addToOutline(entry.question, select ? select.value : 0);
    };
  });
  host.querySelectorAll('[data-quick-copy]').forEach((btn) => {
    btn.onclick = () => {
      const entry = followups[Number(btn.dataset.quickCopy)];
      if (entry) UI.copy(entry.question);
    };
  });
};

App.addToOutline = async function addToOutline(text, sectionIndex) {
  const item = this.state.current;
  if (!item || !item.id || !text) return;
  const outline = { ...(item.outline || {}) };
  const sections = (outline.sections || []).map((section) => ({
    ...section,
    questions: (section.questions || []).map((question) => ({ ...question })),
  }));
  let index = Number(sectionIndex);
  if (!sections.length || index < 0 || index >= sections.length) {
    sections.push({ title: '现场追问补充', goal: '访谈现场临时追加的问题', questions: [] });
    index = sections.length - 1;
  }
  sections[index].questions.push({
    id: `q_${Math.random().toString(16).slice(2, 10)}`,
    text,
    asked: false,
    source: 'followup',
  });
  outline.sections = sections;
  try {
    const updated = await API.patch(item.id, { outline });
    this.state.current = updated;
    UI.toast(`已记入「${sections[index].title || '提纲'}」`, 'success', 2400);
  } catch (error) {
    UI.toast(error.message, 'error');
  }
};

/* ---------------- 第四步：访谈追问 ---------------- */

App.renderFollowupStep = function renderFollowupStep() {
  const item = this.state.current || this.blankInterview();
  const transcript = item.transcript || {};
  const sourceText = this.state.followupText || transcript.text || '';
  const result = this.state.followups || {};
  const followups = result.followups || [];
  const sections = (item.outline || {}).sections || [];

  return `
    <div class="followup-layout">
      <div class="source-card">
        <h3>分析素材</h3>
        <textarea id="followupSource" aria-label="用于分析的访谈内容">${UI.escape(sourceText)}</textarea>
        <div class="source-meta">
          <span>${sourceText.replace(/\s/g, '').length} 字</span>
          <span>可以删改后再分析</span>
        </div>
        ${!transcript.text ? `<div class="banner banner-warn" style="margin-top:12px;">${UI.icon('mic')}<div>还没有转写文稿。可以先在上一步完成转写，或直接在这里粘贴、输入访谈内容。</div></div>` : ''}
      </div>

      <div class="followup-panel">
        <h3>追问建议</h3>
        <p class="sub">避开提纲里已经问过的问题，盯住刚讲出的细节继续往下问。</p>
        ${result.warning ? `<div class="banner banner-warn">${UI.icon('sparkles')}<div>${UI.escape(result.warning)}</div></div>` : ''}
        <div class="audio-actions" style="margin-bottom:14px;">
          <button class="btn btn-primary btn-sm" data-generate-followups>${UI.icon('sparkles')}<span>生成追问</span></button>
          <button class="btn btn-ghost btn-sm" data-copy-all ${followups.length ? '' : 'disabled'}>${UI.icon('copy')}<span>复制全部</span></button>
        </div>
        ${followups.length ? `
          <div class="followup-list">
            ${followups.map((entry, index) => `
              <div class="followup-card">
                <div class="followup-q">${UI.escape(entry.question || '')}</div>
                <div class="followup-meta">
                  <span class="tag">${UI.escape(entry.intent || '追问')}</span>
                  ${entry.based_on ? `<span class="based-on" title="${UI.escapeAttr(entry.based_on)}">依据：${UI.escape(entry.based_on)}</span>` : ''}
                </div>
                <div class="followup-actions">
                  <select class="section-select" data-target-section>${this.outlineOptions()}</select>
                  <button class="text-link" data-add-followup="${index}" type="button">记入提纲</button>
                  <button class="text-link" data-copy-followup="${index}" type="button">复制</button>
                </div>
              </div>`).join('')}
          </div>` : `
          <div class="empty-state" style="padding:28px 12px;">
            <div class="empty-icon">${UI.icon('sparkles')}</div>
            <h3>还没有追问建议</h3>
            <p>${sections.length ? '点击「生成追问」，AI 会结合提纲与转写内容给出 4 条可以马上使用的追问。' : '当前还没有提纲，系统会直接从转写内容里寻找细节。'}</p>
          </div>`}
      </div>
    </div>`;
};

App.bindFollowupStep = function bindFollowupStep() {
  const stage = document.getElementById('stageBody');
  if (!stage) return;
  const source = stage.querySelector('#followupSource');
  if (source) {
    UI.autoResize(source);
    source.oninput = () => {
      this.state.followupText = source.value;
      UI.autoResize(source);
    };
  }
  const generate = stage.querySelector('[data-generate-followups]');
  if (generate) {
    generate.onclick = () => {
      const text = source ? source.value.trim() : '';
      if (!text) {
        UI.toast('请先输入或转写一段访谈内容', 'error');
        if (source) source.focus();
        return;
      }
      this.runFollowupGeneration(text);
    };
  }
  const copyAll = stage.querySelector('[data-copy-all]');
  if (copyAll) {
    copyAll.onclick = () => {
      const followups = ((this.state.followups || {}).followups) || [];
      const text = followups.map((entry, index) => `${index + 1}. ${entry.question}`).join('\n');
      if (text) UI.copy(text);
    };
  }
  const result = this.state.followups || {};
  const followups = result.followups || [];
  stage.querySelectorAll('[data-add-followup]').forEach((btn) => {
    btn.onclick = () => {
      const card = btn.closest('.followup-card');
      const select = card ? card.querySelector('[data-target-section]') : null;
      const entry = followups[Number(btn.dataset.addFollowup)];
      if (entry) this.addToOutline(entry.question, select ? select.value : 0);
    };
  });
  stage.querySelectorAll('[data-copy-followup]').forEach((btn) => {
    btn.onclick = () => {
      const entry = followups[Number(btn.dataset.copyFollowup)];
      if (entry) UI.copy(entry.question);
    };
  });
};

App.runFollowupGeneration = async function runFollowupGeneration(text) {
  const item = this.state.current;
  if (!item || !item.id) return;
  UI.showLoading('正在生成追问', 'AI 正在从这段讲述里寻找可以继续深挖的细节');
  try {
    const payload = await API.followups(item.id, text);
    this.state.followups = payload;
    UI.hideLoading();
    UI.toast(payload.warning || '追问已生成，可逐条记入提纲', payload.warning ? 'info' : 'success', 4800);
    this.paintWorkspace();
  } catch (error) {
    UI.hideLoading();
    UI.toast(error.message, 'error', 6000);
  }
};

/* ---------------- 第五步：口述档案 ---------------- */

App.renderArchiveStep = function renderArchiveStep() {
  const item = this.state.current || this.blankInterview();
  const transcript = item.transcript || {};
  const archive = item.archive || {};
  const sections = archive.sections || [];

  if (!transcript.text) {
    return `
      <div class="empty-state">
        <div class="empty-icon">${UI.icon('mic')}</div>
        <h3>还缺少访谈转写稿</h3>
        <p>口述档案需要依据转写文稿整理，请先完成录音与语音转写。</p>
        <a class="btn btn-primary" href="#/interview/${item.id}/3">${UI.icon('mic')}<span>去录音与转写</span></a>
      </div>`;
  }

  if (!sections.length) {
    const profile = item.profile || {};
    const outlineSections = (item.outline || {}).sections || [];
    const checks = [
      ['口述人基础信息', Boolean(profile.name && profile.location)],
      ['访谈提纲', outlineSections.length > 0],
      ['录音文件', Boolean(item.audio_path)],
      ['转写文稿', Boolean(transcript.text)],
    ];
    return `
      <div class="readiness">
        <h3>生成前的准备</h3>
        <p class="stage-sub">系统会依据基础信息、提纲与转写稿，整理成第一人称的口述档案，并保留可人工修改的正文。</p>
        <div class="check-list">
          ${checks.map(([label, ok]) => `
            <div class="check-item ${ok ? 'is-ok' : ''}">
              <span class="dot">${ok ? UI.icon('check') : ''}</span>
              <span>${label}</span>
            </div>`).join('')}
        </div>
        <div class="audio-actions">
          <button class="btn btn-primary" data-generate-archive>${UI.icon('sparkles')}<span>生成口述档案</span></button>
          <span class="hint">未配置云端 AI 时，将使用本地模板先整理出一份底稿。</span>
        </div>
      </div>`;
  }

  return `
    ${archive.warning ? `<div class="banner banner-warn">${UI.icon('sparkles')}<div>${UI.escape(archive.warning)}</div></div>` : ''}
    <div class="archive-toolbar">
      <span class="meta">${archive.generated_by === 'ai' ? 'AI 整理稿' : '模板整理稿'} · ${UI.relativeTime(archive.generated_at)}</span>
      <span class="spacer"></span>
      <button class="btn btn-ghost btn-sm" data-generate-archive>${UI.icon('refresh')}<span>重新生成</span></button>
      <button class="btn btn-secondary btn-sm" data-save-archive>${UI.icon('save')}<span>保存修改</span></button>
      <button class="btn btn-ghost btn-sm" data-export="md">${UI.icon('file')}<span>Markdown</span></button>
      <button class="btn btn-ghost btn-sm" data-export="html">${UI.icon('file')}<span>HTML</span></button>
      <button class="btn btn-primary btn-sm" data-export="docx">${UI.icon('download')}<span>Word</span></button>
      <button class="btn btn-ghost btn-sm" data-print>${UI.icon('printer')}<span>打印</span></button>
    </div>
    ${this.archiveDocHtml(archive, item)}`;
};

App.archiveDocHtml = function archiveDocHtml(archive, item) {
  const profile = item.profile || {};
  const transcript = item.transcript || {};
  const segments = transcript.segments || [];
  const timeline = archive.timeline || [];
  const quotes = archive.quotes || [];
  const keyParagraphs = (archive.sections || []).map((section) => section.paragraphs || []);
  const charCount = (archive.sections || []).reduce(
    (sum, section) => sum + (section.paragraphs || []).join('').length, 0
  );

  return `
    <div class="archive-doc" id="archiveDoc">
      <div class="doc-cover">
        <div class="doc-kicker">援疆口述档案 · ORAL HISTORY</div>
        <div class="doc-title" id="arcTitle" contenteditable="true" spellcheck="false">${UI.escape(archive.title || '')}</div>
        <div class="doc-subtitle" id="arcSubtitle" contenteditable="true" spellcheck="false">${UI.escape(archive.subtitle || '')}</div>
        <div class="doc-cover-meta">
          ${profile.name ? `<span>口述人：${UI.escape(profile.name)}</span>` : ''}
          ${profile.location ? `<span>援疆地：${UI.escape(profile.location)}</span>` : ''}
          ${profile.interview_date ? `<span>访谈日期：${UI.escape(profile.interview_date)}</span>` : ''}
          <span>正文约 ${charCount} 字</span>
        </div>
        <div class="doc-seal">疆忆<br>口述</div>
      </div>

      <div class="doc-section">
        <h2>内容摘要</h2>
        <p class="doc-summary" id="arcSummary" contenteditable="true" spellcheck="false">${UI.escape(archive.summary || '')}</p>
        <div class="doc-keywords">关键词：<span id="arcKeywords" contenteditable="true" spellcheck="false">${UI.escape((archive.keywords || []).join('、'))}</span></div>
      </div>

      ${archive.persona ? `
        <div class="doc-section">
          <h2>口述人小传</h2>
          <p id="arcPersona" contenteditable="true" spellcheck="false">${UI.escape(archive.persona)}</p>
        </div>` : ''}

      ${timeline.length ? `
        <div class="doc-section">
          <h2>时间线</h2>
          <div class="doc-timeline">
            ${timeline.map((entry) => `
              <div class="doc-timeline-row">
                <span class="doc-timeline-time" data-arc-time contenteditable="true" spellcheck="false">${UI.escape(entry.time || '')}</span>
                <span data-arc-event contenteditable="true" spellcheck="false">${UI.escape(entry.event || '')}</span>
              </div>`).join('')}
          </div>
        </div>` : ''}

      ${keyParagraphs.map((paragraphs, index) => {
        const section = archive.sections[index];
        return `
          <div class="doc-section" data-arc-section data-index="${index}">
            <h2><span data-arc-heading contenteditable="true" spellcheck="false">${UI.escape(section.heading || '')}</span><span class="edit-hint">可编辑</span></h2>
            ${(paragraphs.length ? paragraphs : ['']).map((paragraph) => `
              <p data-arc-para contenteditable="true" spellcheck="false" class="${paragraph ? '' : 'is-empty'}">${UI.escape(paragraph)}</p>`).join('')}
          </div>`;
      }).join('')}

      ${quotes.length ? `
        <div class="doc-section">
          <h2>口述原话</h2>
          ${quotes.map((quote) => `
            <div class="doc-quote">
              <p data-arc-quote contenteditable="true" spellcheck="false">“${UI.escape(quote.text || '')}”</p>
              <div class="ctx" data-arc-context contenteditable="true" spellcheck="false">${UI.escape(quote.context || '')}</div>
            </div>`).join('')}
        </div>` : ''}

      ${archive.afterword ? `
        <div class="doc-section">
          <h2>整理说明</h2>
          <p id="arcAfterword" contenteditable="true" spellcheck="false">${UI.escape(archive.afterword)}</p>
        </div>` : ''}

      <div class="doc-section doc-appendix">
        <h2>附录：访谈转写稿</h2>
        <details>
          <summary>展开完整转写稿（${transcript.text ? transcript.text.length : 0} 字）</summary>
          ${segments.length
            ? segments.map((segment) => `
              <div class="transcript-line"><span class="timestamp">${UI.fmtClock(segment.start)}</span><span>${UI.escape(segment.text)}</span></div>`).join('')
            : `<div>${UI.escape(transcript.text || '')}</div>`}
        </details>
      </div>

      <div class="doc-footer">
        <span>疆忆 · 援疆口述档案智能采集系统</span>
        <span>整理于 ${UI.fmtDate(archive.generated_at || new Date().toISOString())}</span>
      </div>
    </div>`;
};

App.bindArchiveStep = function bindArchiveStep() {
  const stage = document.getElementById('stageBody');
  if (!stage) return;

  stage.querySelectorAll('[data-generate-archive]').forEach((btn) => {
    btn.onclick = async () => {
      if ((this.state.current.archive || {}).sections) {
        const ok = await UI.confirmDialog({
          title: '重新生成口述档案？',
          message: '当前的人工修改将被新生成的档案覆盖，建议先保存或导出。',
          confirmText: '重新生成',
        });
        if (!ok) return;
      }
      this.generateArchive();
    };
  });

  stage.querySelectorAll('[data-save-archive]').forEach((btn) => {
    btn.onclick = () => {
      this.saveArchive(false).catch((error) => UI.toast(error.message, 'error'));
    };
  });

  stage.querySelectorAll('[data-export]').forEach((btn) => {
    btn.onclick = () => this.exportArchive(btn.dataset.export);
  });

  stage.querySelectorAll('[data-print]').forEach((btn) => {
    btn.onclick = () => this.printArchive();
  });

  stage.querySelectorAll('[contenteditable="true"]').forEach((node) => {
    node.addEventListener('input', () => {
      if (node.classList.contains('is-empty')) {
        node.classList.toggle('is-empty', !node.innerText.trim());
      }
    });
  });
};

App.collectArchive = function collectArchive() {
  const item = this.state.current;
  if (!item) return {};
  const previous = item.archive || {};
  const doc = document.getElementById('archiveDoc');
  if (!doc) return previous;
  const read = (selector) => {
    const node = doc.querySelector(selector);
    return node ? node.innerText.replace(/\u00a0/g, ' ').trim() : '';
  };
  const timeline = Array.from(doc.querySelectorAll('.doc-timeline-row')).map((row) => ({
    time: (row.querySelector('[data-arc-time]') || {}).innerText ? row.querySelector('[data-arc-time]').innerText.trim() : '',
    event: (row.querySelector('[data-arc-event]') || {}).innerText ? row.querySelector('[data-arc-event]').innerText.trim() : '',
  })).filter((entry) => entry.time || entry.event);
  const sections = Array.from(doc.querySelectorAll('[data-arc-section]')).map((section) => ({
    heading: read(`[data-arc-section][data-index="${section.dataset.index}"] [data-arc-heading]`),
    paragraphs: Array.from(section.querySelectorAll('[data-arc-para]'))
      .map((node) => node.innerText.replace(/\u00a0/g, ' ').trim())
      .filter(Boolean),
  })).filter((section) => section.heading || section.paragraphs.length);
  const quotes = Array.from(doc.querySelectorAll('.doc-quote')).map((quote) => ({
    text: quote.querySelector('[data-arc-quote]') ? quote.querySelector('[data-arc-quote]').innerText.replace(/^“|”$/g, '').trim() : '',
    context: quote.querySelector('[data-arc-context]') ? quote.querySelector('[data-arc-context]').innerText.trim() : '',
  })).filter((quote) => quote.text);
  const keywords = read('#arcKeywords')
    .split(/[，,、；;]/)
    .map((word) => word.trim())
    .filter(Boolean);

  const archive = {
    ...previous,
    title: read('#arcTitle') || previous.title || '',
    subtitle: read('#arcSubtitle') || previous.subtitle || '',
    summary: read('#arcSummary'),
    keywords,
    persona: read('#arcPersona') || previous.persona || '',
    timeline,
    sections,
    quotes,
    afterword: read('#arcAfterword') || previous.afterword || '',
    edited_at: new Date().toISOString(),
  };
  item.archive = archive;
  return archive;
};

App.saveArchive = async function saveArchive(silent) {
  const item = this.state.current;
  if (!item || !item.id) return false;
  const archive = this.collectArchive();
  if (!(archive.sections || []).length) return true;
  try {
    const updated = await API.patch(item.id, { archive });
    this.state.current = updated;
    if (!silent) {
      UI.toast('档案修改已保存', 'success', 2400);
      this.paintWorkspace();
    }
    return true;
  } catch (error) {
    if (!silent) UI.toast(error.message, 'error');
    throw error;
  }
};

App.generateArchive = async function generateArchive() {
  const item = this.state.current;
  if (!item || !item.id) return;
  if (!((item.transcript || {}).text || '').trim()) {
    UI.toast('请先完成语音转写，再生成口述档案', 'error');
    return;
  }
  UI.showLoading('正在生出口述档案', 'AI 正在依据转写稿整理第一人称正文，可能需要一点时间');
  try {
    const archive = await API.generateArchive(item.id);
    const updated = await API.get(item.id);
    this.state.current = updated;
    UI.hideLoading();
    UI.toast(
      archive.warning || '口述档案已生成，请核对事实并保存修改',
      archive.warning ? 'info' : 'success',
      5200
    );
    this.paintWorkspace();
  } catch (error) {
    UI.hideLoading();
    UI.toast(error.message, 'error', 6000);
  }
};

App.exportArchive = async function exportArchive(format) {
  const item = this.state.current;
  if (!item || !item.id) return;
  try {
    await this.saveArchive(true);
  } catch (error) {
    UI.toast(error.message, 'error');
    return;
  }
  const link = document.createElement('a');
  link.href = `/api/interviews/${item.id}/export/${format}`;
  link.download = '';
  document.body.appendChild(link);
  link.click();
  link.remove();
};

App.printArchive = async function printArchive() {
  const item = this.state.current;
  if (!item || !item.id) return;
  try {
    await this.saveArchive(true);
  } catch (error) {
    UI.toast(error.message, 'error');
    return;
  }
  try {
    const response = await fetch(`/api/interviews/${item.id}/export/html`);
    if (!response.ok) throw new Error('无法读取档案导出文件');
    const html = await response.text();
    const win = window.open('', '_blank');
    if (!win) {
      UI.toast('请允许浏览器打开新窗口后再打印', 'info');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch (error) { /* 用户可手动打印 */ }
    }, 900);
  } catch (error) {
    UI.toast(error.message, 'error');
  }
};
