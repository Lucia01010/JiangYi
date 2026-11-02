const API = {
  async request(path, options = {}) {
    const opts = { method: options.method || 'GET', headers: {} };
    if (options.body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(options.body);
    }
    if (options.form) {
      opts.body = options.form;
    }
    const response = await fetch(path, opts);
    const type = response.headers.get('content-type') || '';
    let data;
    if (type.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }
    if (!response.ok) {
      let message = data && data.detail ? data.detail : `请求失败（${response.status}）`;
      if (Array.isArray(message)) message = message.map((m) => m.msg || m).join('；');
      throw new Error(message);
    }
    return data;
  },

  list() { return this.request('/api/interviews'); },
  get(id) { return this.request(`/api/interviews/${id}`); },
  create(payload) { return this.request('/api/interviews', { method: 'POST', body: payload }); },
  patch(id, payload) { return this.request(`/api/interviews/${id}`, { method: 'PATCH', body: payload }); },
  remove(id) { return this.request(`/api/interviews/${id}`, { method: 'DELETE' }); },

  generateOutline(id, useTemplate = false) {
    return this.request(`/api/interviews/${id}/outline`, { method: 'POST', body: { use_template: useTemplate } });
  },
  uploadAudio(id, formData) {
    return this.request(`/api/interviews/${id}/audio`, { method: 'POST', form: formData });
  },
  transcribe(id) { return this.request(`/api/interviews/${id}/transcribe`, { method: 'POST' }); },
  job(jobId) { return this.request(`/api/jobs/${jobId}`); },
  followups(id, text) {
    return this.request(`/api/interviews/${id}/followups`, { method: 'POST', body: { text } });
  },
  quickFollowups(id, formData) {
    return this.request(`/api/interviews/${id}/quick-followups`, { method: 'POST', form: formData });
  },
  generateArchive(id) { return this.request(`/api/interviews/${id}/archive`, { method: 'POST' }); },

  settings() { return this.request('/api/settings'); },
  saveSettings(payload) { return this.request('/api/settings', { method: 'POST', body: payload }); },
  testSettings(payload) { return this.request('/api/settings/test', { method: 'POST', body: payload }); },
  system() { return this.request('/api/system'); },
};

window.API = API;
