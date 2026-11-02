const UI = (() => {
  const STATUS = {
    draft: { label: '资料录入', tone: 'draft' },
    outlined: { label: '提纲就绪', tone: 'outlined' },
    recorded: { label: '已录音', tone: 'recorded' },
    transcribed: { label: '已转写', tone: 'transcribed' },
    archived: { label: '已归档', tone: 'archived' },
  };

  let loadingTimer = null;
  let loadingStarted = 0;

  function escape(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function icon(name, cls = '') {
    return `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function fmtClock(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  function fmtDuration(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    if (!total) return '0 分钟';
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    if (h) return `${h} 小时 ${m} 分`;
    if (m) return `${m} 分 ${total % 60} 秒`;
    return `${total} 秒`;
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return String(iso).slice(0, 10);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function fmtDateTime(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return String(iso);
    return `${fmtDate(iso)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function relativeTime(iso) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    if (Number.isNaN(diff)) return fmtDate(iso);
    const minute = 60000;
    const day = minute * 60 * 24;
    if (diff < minute) return '刚刚更新';
    if (diff < 60 * minute) return `${Math.floor(diff / minute)} 分钟前更新`;
    if (diff < day) return `${Math.floor(diff / (60 * minute))} 小时前更新`;
    if (diff < day * 3) return `${Math.floor(diff / day)} 天前更新`;
    return `${fmtDate(iso)} 更新`;
  }

  function statusMeta(status) {
    return STATUS[status] || STATUS.draft;
  }

  function statusPill(status) {
    const meta = statusMeta(status);
    return `<span class="status-pill" data-status="${meta.tone}">${meta.label}</span>`;
  }

  function toast(message, type = 'info', duration = 3800) {
    const root = document.getElementById('toastRoot');
    if (!root) return;
    const iconName = type === 'error' ? 'x' : type === 'success' ? 'check' : 'sparkles';
    const node = document.createElement('div');
    node.className = `toast toast-${type}`;
    node.innerHTML = `${icon(iconName)}<span>${escape(message)}</span>`;
    root.appendChild(node);
    setTimeout(() => {
      node.classList.add('is-leaving');
      setTimeout(() => node.remove(), 260);
    }, duration);
  }

  function showLoading(title = '正在处理', text = '请稍候…') {
    const root = document.getElementById('loadingRoot');
    document.getElementById('loadingTitle').textContent = title;
    document.getElementById('loadingText').textContent = text;
    document.getElementById('loadingTimer').textContent = '00:00';
    root.hidden = false;
    loadingStarted = Date.now();
    if (loadingTimer) clearInterval(loadingTimer);
    loadingTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - loadingStarted) / 1000);
      const timer = document.getElementById('loadingTimer');
      if (timer) timer.textContent = fmtClock(elapsed);
    }, 500);
  }

  function setLoadingText(text) {
    const node = document.getElementById('loadingText');
    if (node) node.textContent = text;
  }

  function hideLoading() {
    const root = document.getElementById('loadingRoot');
    if (root) root.hidden = true;
    if (loadingTimer) clearInterval(loadingTimer);
    loadingTimer = null;
  }

  function confirmDialog({ title, message, confirmText = '确认', danger = false }) {
    return new Promise((resolve) => {
      const root = document.getElementById('modalRoot');
      root.innerHTML = `
        <div class="modal-mask">
          <div class="modal">
            <h3>${escape(title)}</h3>
            <p>${escape(message)}</p>
            <div class="modal-actions">
              <button class="btn btn-secondary" data-confirm="no">取消</button>
              <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm="yes">${escape(confirmText)}</button>
            </div>
          </div>
        </div>`;
      const close = (value) => {
        root.innerHTML = '';
        resolve(value);
      };
      root.querySelector('[data-confirm="no"]').onclick = () => close(false);
      root.querySelector('[data-confirm="yes"]').onclick = () => close(true);
      root.querySelector('.modal-mask').onclick = (event) => {
        if (event.target.classList.contains('modal-mask')) close(false);
      };
    });
  }

  function debounce(fn, wait = 300) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  function autoResize(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('已复制到剪贴板', 'success', 2200);
    } catch (error) {
      const helper = document.createElement('textarea');
      helper.value = text;
      helper.style.position = 'fixed';
      helper.style.opacity = '0';
      document.body.appendChild(helper);
      helper.select();
      document.execCommand('copy');
      helper.remove();
      toast('已复制到剪贴板', 'success', 2200);
    }
  }

  function escapeAttr(value) {
    return escape(value).replace(/\n/g, ' ');
  }

  return {
    escape,
    escapeAttr,
    icon,
    fmtClock,
    fmtDuration,
    fmtDate,
    fmtDateTime,
    relativeTime,
    statusMeta,
    statusPill,
    toast,
    showLoading,
    setLoadingText,
    hideLoading,
    confirmDialog,
    debounce,
    autoResize,
    copy,
  };
})();

window.UI = UI;
