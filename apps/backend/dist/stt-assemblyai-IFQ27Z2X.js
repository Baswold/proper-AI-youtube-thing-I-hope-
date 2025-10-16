// src/adapters/stt-assemblyai.ts
import { RealtimeTranscriber } from "assemblyai";
var AssemblyAISttAdapter = class {
  constructor(config) {
    this.transcribers = /* @__PURE__ */ new Map();
    this.config = {
      sampleRate: 16e3,
      ...config
    };
  }
  async start(sessionId) {
    if (this.transcribers.has(sessionId)) {
      console.warn(`[assemblyai-stt] session ${sessionId} already active`);
      return;
    }
    const transcriber = new RealtimeTranscriber({
      apiKey: this.config.apiKey,
      sampleRate: this.config.sampleRate
    });
    transcriber.on("open", () => {
      console.info(`[assemblyai-stt] session ${sessionId} started`);
    });
    transcriber.on("transcript", (transcript) => {
      if (transcript.text && transcript.text.length > 0) {
        this.config.onTranscript?.(
          sessionId,
          transcript.text,
          transcript.message_type === "FinalTranscript"
        );
      }
    });
    transcriber.on("error", (error) => {
      console.error(`[assemblyai-stt] error for ${sessionId}:`, error);
      this.config.onError?.(sessionId, error);
    });
    transcriber.on("close", () => {
      console.info(`[assemblyai-stt] session ${sessionId} closed`);
      this.transcribers.delete(sessionId);
    });
    await transcriber.connect();
    this.transcribers.set(sessionId, transcriber);
  }
  async stop(sessionId) {
    const transcriber = this.transcribers.get(sessionId);
    if (transcriber) {
      await transcriber.close();
      this.transcribers.delete(sessionId);
    }
  }
  sendAudio(sessionId, audioChunk) {
    const transcriber = this.transcribers.get(sessionId);
    if (transcriber) {
      transcriber.sendAudio(audioChunk);
    }
  }
};
export {
  AssemblyAISttAdapter
};
