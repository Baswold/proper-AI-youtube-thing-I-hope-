// src/adapters/tts-google.ts
import textToSpeech from "@google-cloud/text-to-speech";
var GoogleTtsAdapter = class {
  constructor(config = {}) {
    this.activeSessions = /* @__PURE__ */ new Set();
    this.config = {
      languageCode: "en-US",
      voiceName: "en-US-Neural2-J",
      // Male voice
      speakingRate: 1,
      pitch: 0,
      ...config
    };
    this.client = new textToSpeech.TextToSpeechClient();
  }
  async synthesize(sessionId, text) {
    if (this.activeSessions.has(sessionId)) {
      console.warn(`[google-tts] session ${sessionId} already synthesizing`);
      return;
    }
    this.activeSessions.add(sessionId);
    try {
      const request = {
        input: { text },
        voice: {
          languageCode: this.config.languageCode,
          name: this.config.voiceName
        },
        audioConfig: {
          audioEncoding: "LINEAR16",
          speakingRate: this.config.speakingRate,
          pitch: this.config.pitch,
          sampleRateHertz: 48e3
        }
      };
      const [response] = await this.client.synthesizeSpeech(request);
      if (response.audioContent) {
        const audioBuffer = Buffer.from(response.audioContent);
        const chunkSize = 4096;
        for (let i = 0; i < audioBuffer.length; i += chunkSize) {
          const chunk = audioBuffer.slice(i, i + chunkSize);
          this.config.onAudioChunk?.(sessionId, chunk);
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        this.config.onComplete?.(sessionId);
      }
    } catch (error) {
      console.error(`[google-tts] error for ${sessionId}:`, error);
      this.config.onError?.(sessionId, error);
    } finally {
      this.activeSessions.delete(sessionId);
    }
  }
  async stop(sessionId) {
    this.activeSessions.delete(sessionId);
    console.info(`[google-tts] stopped ${sessionId}`);
  }
};
function createClaudeVoice() {
  return new GoogleTtsAdapter({
    voiceName: "en-US-Neural2-D",
    // Warm, professional male voice
    speakingRate: 1.05,
    pitch: -1
  });
}
function createGuestVoice() {
  return new GoogleTtsAdapter({
    voiceName: "en-US-Neural2-A",
    // Clear, engaging male voice
    speakingRate: 1,
    pitch: 0.5
  });
}
export {
  GoogleTtsAdapter,
  createClaudeVoice,
  createGuestVoice
};
