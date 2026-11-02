class AudioRecorder {
  constructor(onTick) {
    this.onTick = onTick || (() => {});
    this.state = 'idle';
    this.mediaRecorder = null;
    this.stream = null;
    this.chunks = [];
    this.elapsed = 0;
    this.lastResume = 0;
    this.timer = null;
    this.audioContext = null;
    this.analyser = null;
    this.dataArray = null;
    this.mimeType = 'audio/webm';
  }

  get active() {
    return this.state === 'recording' || this.state === 'paused';
  }

  get isRecording() {
    return this.state === 'recording';
  }

  getDuration() {
    let value = this.elapsed;
    if (this.state === 'recording' && this.lastResume) {
      value += (performance.now() - this.lastResume) / 1000;
    }
    return Math.max(0, value);
  }

  getBlob() {
    if (!this.chunks.length) return null;
    return new Blob(this.chunks, { type: this.mimeType });
  }

  getLevel() {
    if (!this.analyser || !this.dataArray || this.state !== 'recording') return 0;
    this.analyser.getByteTimeDomainData(this.dataArray);
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i += 1) {
      const v = (this.dataArray[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / this.dataArray.length) * 3.2);
  }

  async start() {
    if (this.active) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('当前浏览器不支持麦克风录音，请使用 Edge 或 Chrome');
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
    } catch (error) {
      throw new Error('无法访问麦克风，请检查浏览器权限设置');
    }
    this.stream = stream;
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    const supported = candidates.find((type) => window.MediaRecorder && MediaRecorder.isTypeSupported(type));
    this.mimeType = supported || 'audio/webm';
    const options = supported ? { mimeType: supported, audioBitsPerSecond: 128000 } : {};
    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(stream, options);
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) this.chunks.push(event.data);
    };
    this.mediaRecorder.start(2000);

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx();
      if (this.audioContext.state === 'suspended') await this.audioContext.resume();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;
      source.connect(this.analyser);
      this.dataArray = new Uint8Array(this.analyser.fftSize);
    } catch (error) {
      this.audioContext = null;
    }

    this.state = 'recording';
    this.elapsed = 0;
    this.lastResume = performance.now();
    this.startTimer();
    this.onTick(0, this.state);
  }

  startTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.onTick(this.getDuration(), this.state);
    }, 250);
  }

  pause() {
    if (this.state !== 'recording') return;
    this.elapsed += (performance.now() - this.lastResume) / 1000;
    this.lastResume = 0;
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') this.mediaRecorder.pause();
    this.state = 'paused';
    this.onTick(this.getDuration(), this.state);
  }

  resume() {
    if (this.state !== 'paused') return;
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') this.mediaRecorder.resume();
    this.state = 'recording';
    this.lastResume = performance.now();
    this.onTick(this.getDuration(), this.state);
  }

  async stop() {
    if (!this.active) {
      return { blob: this.getBlob(), duration: this.getDuration(), mimeType: this.mimeType };
    }
    if (this.state === 'recording' && this.lastResume) {
      this.elapsed += (performance.now() - this.lastResume) / 1000;
      this.lastResume = 0;
    }
    const duration = this.getDuration();
    const recorder = this.mediaRecorder;
    if (recorder && recorder.state !== 'inactive') {
      await new Promise((resolve) => {
        recorder.onstop = resolve;
        recorder.stop();
      });
    }
    this.cleanup();
    this.state = 'stopped';
    this.onTick(duration, this.state);
    return { blob: this.getBlob(), duration, mimeType: this.mimeType };
  }

  cleanup() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
      this.analyser = null;
      this.dataArray = null;
    }
  }

  destroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try { this.mediaRecorder.stop(); } catch (error) { /* ignore */ }
    }
    this.cleanup();
    this.state = 'idle';
  }
}

window.AudioRecorder = AudioRecorder;
