// src/adapters/stt-google.ts
import speech from "@google-cloud/speech";
var GoogleSttAdapter = class {
  constructor(config = {}) {
    this.streams = /* @__PURE__ */ new Map();
    this.config = {
      languageCode: "en-US",
      sampleRateHertz: 16e3,
      encoding: "LINEAR16",
      ...config
    };
    this.client = new speech.SpeechClient();
  }
  async start(sessionId) {
    if (this.streams.has(sessionId)) {
      console.warn(`[google-stt] session ${sessionId} already active`);
      return;
    }
    const request = {
      config: {
        encoding: this.config.encoding,
        sampleRateHertz: this.config.sampleRateHertz,
        languageCode: this.config.languageCode
      },
      interimResults: true
    };
    const recognizeStream = this.client.streamingRecognize(request).on("error", (error) => {
      console.error(`[google-stt] error for ${sessionId}:`, error);
      this.config.onError?.(sessionId, error);
    }).on("data", (data) => {
      const result = data.results[0];
      if (result && result.alternatives[0]) {
        const transcript = result.alternatives[0].transcript;
        const isFinal = result.isFinal;
        this.config.onTranscript?.(sessionId, transcript, isFinal);
      }
    });
    this.streams.set(sessionId, recognizeStream);
    console.info(`[google-stt] session ${sessionId} started`);
  }
  async stop(sessionId) {
    const stream = this.streams.get(sessionId);
    if (stream) {
      stream.end();
      this.streams.delete(sessionId);
      console.info(`[google-stt] session ${sessionId} stopped`);
    }
  }
  sendAudio(sessionId, audioChunk) {
    const stream = this.streams.get(sessionId);
    if (stream) {
      stream.write(audioChunk);
    }
  }
};
export {
  GoogleSttAdapter
};
