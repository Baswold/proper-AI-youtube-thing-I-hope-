// src/adapters/tts-piper.ts
import { spawn } from "child_process";
var PiperTtsAdapter = class {
  constructor(config = {}) {
    this.activeSessions = /* @__PURE__ */ new Set();
    this.config = {
      piperPath: "piper",
      modelPath: "./models/en_US-lessac-medium.onnx",
      speakingRate: 1,
      ...config
    };
  }
  async synthesize(sessionId, text) {
    if (this.activeSessions.has(sessionId)) {
      console.warn(`[piper-tts] session ${sessionId} already synthesizing`);
      return;
    }
    this.activeSessions.add(sessionId);
    try {
      await this.runPiper(sessionId, text);
    } catch (error) {
      console.error(`[piper-tts] error for ${sessionId}:`, error);
      this.config.onError?.(sessionId, error);
    } finally {
      this.activeSessions.delete(sessionId);
    }
  }
  async stop(sessionId) {
    this.activeSessions.delete(sessionId);
    console.info(`[piper-tts] stopped ${sessionId}`);
  }
  async runPiper(sessionId, text) {
    return new Promise((resolve, reject) => {
      const args = [
        "--model",
        this.config.modelPath,
        "--output-raw",
        "--length-scale",
        (1 / this.config.speakingRate).toString()
      ];
      const piper = spawn(this.config.piperPath, args);
      const audioChunks = [];
      piper.stdout.on("data", (chunk) => {
        audioChunks.push(chunk);
        this.config.onAudioChunk?.(sessionId, chunk);
      });
      piper.stderr.on("data", (data) => {
        console.error(`[piper-tts] stderr: ${data.toString()}`);
      });
      piper.on("error", (error) => {
        reject(error);
      });
      piper.on("close", (code) => {
        if (code === 0) {
          this.config.onComplete?.(sessionId);
          resolve();
        } else {
          reject(new Error(`Piper exited with code ${code}`));
        }
      });
      piper.stdin.write(text);
      piper.stdin.end();
    });
  }
};
function createClaudePiperVoice(modelPath) {
  return new PiperTtsAdapter({
    modelPath: modelPath || "./models/en_US-lessac-medium.onnx",
    speakingRate: 1.05
  });
}
function createGuestPiperVoice(modelPath) {
  return new PiperTtsAdapter({
    modelPath: modelPath || "./models/en_US-libritts-high.onnx",
    speakingRate: 1
  });
}
export {
  PiperTtsAdapter,
  createClaudePiperVoice,
  createGuestPiperVoice
};
