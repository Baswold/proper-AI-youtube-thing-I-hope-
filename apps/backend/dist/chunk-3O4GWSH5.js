// src/adapters/stt-whisper.ts
var WhisperSttAdapter = class {
  constructor(config = {}) {
    this.activeSessions = /* @__PURE__ */ new Set();
    this.audioBuffers = /* @__PURE__ */ new Map();
    this.processingIntervals = /* @__PURE__ */ new Map();
    this.config = {
      endpoint: "http://localhost:8001/transcribe",
      model: "base",
      ...config
    };
  }
  async start(sessionId) {
    if (this.activeSessions.has(sessionId)) {
      console.warn(`[whisper-stt] session ${sessionId} already active`);
      return;
    }
    this.activeSessions.add(sessionId);
    this.audioBuffers.set(sessionId, []);
    const interval = setInterval(() => {
      this.processAudioBuffer(sessionId);
    }, 2e3);
    this.processingIntervals.set(sessionId, interval);
    console.info(`[whisper-stt] session ${sessionId} started`);
  }
  async stop(sessionId) {
    this.activeSessions.delete(sessionId);
    const interval = this.processingIntervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.processingIntervals.delete(sessionId);
    }
    await this.processAudioBuffer(sessionId);
    this.audioBuffers.delete(sessionId);
    console.info(`[whisper-stt] session ${sessionId} stopped`);
  }
  sendAudio(sessionId, audioChunk) {
    const buffer = this.audioBuffers.get(sessionId);
    if (buffer) {
      buffer.push(audioChunk);
    }
  }
  async processAudioBuffer(sessionId) {
    const chunks = this.audioBuffers.get(sessionId);
    if (!chunks || chunks.length === 0) {
      return;
    }
    const audioData = Buffer.concat(chunks);
    this.audioBuffers.set(sessionId, []);
    try {
      const response = await fetch(this.config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream"
        },
        body: audioData
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      if (result.text && result.text.trim().length > 0) {
        this.config.onTranscript?.(sessionId, result.text, result.is_final ?? true);
      }
    } catch (error) {
      console.error(`[whisper-stt] error for ${sessionId}:`, error);
      this.config.onError?.(sessionId, error);
    }
  }
};

export {
  WhisperSttAdapter
};
