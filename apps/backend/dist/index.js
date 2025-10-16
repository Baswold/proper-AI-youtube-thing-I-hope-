// src/index.ts
import cors from "cors";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

// src/orchestrator-v2.ts
import { randomUUID } from "crypto";

// src/adapters/claude.ts
import Anthropic from "@anthropic-ai/sdk";
var ClaudeAdapter = class {
  constructor(config) {
    this.id = "claude";
    this.activeStreams = /* @__PURE__ */ new Map();
    this.config = {
      model: "claude-3-5-haiku-20241022",
      maxTokens: 2048,
      temperature: 0.7,
      ...config
    };
    this.client = new Anthropic({
      apiKey: this.config.apiKey
    });
  }
  async *generate(sessionId, prompt) {
    const controller = new AbortController();
    this.activeStreams.set(sessionId, controller);
    try {
      const stream = await this.client.messages.create(
        {
          model: this.config.model,
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          messages: [
            {
              role: "user",
              content: prompt
            }
          ],
          stream: true
        },
        {
          signal: controller.signal
        }
      );
      for await (const event of stream) {
        if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            yield event.delta.text;
          }
        }
      }
    } catch (error) {
      if (error.name === "AbortError") {
        console.info(`[claude] generation stopped for ${sessionId}`);
      } else {
        console.error(`[claude] error for ${sessionId}:`, error);
        throw error;
      }
    } finally {
      this.activeStreams.delete(sessionId);
    }
  }
  async stop(sessionId) {
    const controller = this.activeStreams.get(sessionId);
    if (controller) {
      controller.abort();
      this.activeStreams.delete(sessionId);
    }
  }
};

// src/adapters/openai-compatible.ts
import OpenAI from "openai";
var OpenAICompatibleAdapter = class {
  constructor(id, config) {
    this.activeStreams = /* @__PURE__ */ new Map();
    this.id = id;
    this.config = {
      maxTokens: 2048,
      temperature: 0.7,
      ...config
    };
    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl
    });
  }
  async *generate(sessionId, prompt) {
    const controller = new AbortController();
    this.activeStreams.set(sessionId, controller);
    try {
      const stream = await this.client.chat.completions.create(
        {
          model: this.config.model,
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          messages: [
            {
              role: "user",
              content: prompt
            }
          ],
          stream: true
        },
        {
          signal: controller.signal
        }
      );
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          yield content;
        }
      }
    } catch (error) {
      if (error.name === "AbortError") {
        console.info(`[${this.id}] generation stopped for ${sessionId}`);
      } else {
        console.error(`[${this.id}] error for ${sessionId}:`, error);
        throw error;
      }
    } finally {
      this.activeStreams.delete(sessionId);
    }
  }
  async stop(sessionId) {
    const controller = this.activeStreams.get(sessionId);
    if (controller) {
      controller.abort();
      this.activeStreams.delete(sessionId);
    }
  }
};
function createGroqAdapter(apiKey, model = "llama-3.3-70b-versatile") {
  return new OpenAICompatibleAdapter("groq", {
    apiKey,
    baseUrl: "https://api.groq.com/openai/v1",
    model
  });
}
function createTogetherAdapter(apiKey, model = "meta-llama/Llama-3-70b-chat-hf") {
  return new OpenAICompatibleAdapter("together", {
    apiKey,
    baseUrl: "https://api.together.xyz/v1",
    model
  });
}
function createLocalLlamaAdapter(baseUrl = "http://localhost:8080/v1", model = "local-model") {
  return new OpenAICompatibleAdapter("local", {
    apiKey: "not-needed",
    baseUrl,
    model
  });
}

// src/adapters/factory.ts
async function loadAssemblyAI() {
  const { AssemblyAISttAdapter } = await import("./stt-assemblyai-IFQ27Z2X.js");
  return AssemblyAISttAdapter;
}
async function loadGoogleStt() {
  const { GoogleSttAdapter } = await import("./stt-google-TW4P7IQX.js");
  return GoogleSttAdapter;
}
async function loadWhisperStt() {
  const { WhisperSttAdapter } = await import("./stt-whisper-U63JCG5P.js");
  return WhisperSttAdapter;
}
async function loadGoogleTts() {
  const { GoogleTtsAdapter, createClaudeVoice, createGuestVoice } = await import("./tts-google-CTCTSH4Y.js");
  return { GoogleTtsAdapter, createClaudeVoice, createGuestVoice };
}
async function loadPiperTts() {
  const { PiperTtsAdapter, createClaudePiperVoice, createGuestPiperVoice } = await import("./tts-piper-VA4VTNLM.js");
  return { PiperTtsAdapter, createClaudePiperVoice, createGuestPiperVoice };
}
var RealAdapterFactory = class {
  constructor(config = {}) {
    this.config = {
      sttProvider: process.env.STT_PROVIDER || "assemblyai",
      ttsProvider: process.env.TTS_PROVIDER || "google",
      guestProvider: process.env.GUEST_PROVIDER || "groq",
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      assemblyaiApiKey: process.env.ASSEMBLYAI_API_KEY,
      groqApiKey: process.env.GROQ_API_KEY,
      togetherApiKey: process.env.TOGETHER_API_KEY,
      openaiApiKey: process.env.OPENAI_API_KEY,
      whisperEndpoint: process.env.WHISPER_ENDPOINT || "http://localhost:8001/transcribe",
      piperPath: process.env.PIPER_PATH || "piper",
      piperModelPath: process.env.PIPER_MODEL_PATH,
      localLlamaEndpoint: process.env.LOCAL_LLAMA_ENDPOINT || "http://localhost:8080/v1",
      guestModel: process.env.GUEST_MODEL,
      ...config
    };
  }
  stt() {
    const provider = this.config.sttProvider;
    switch (provider) {
      case "assemblyai": {
        if (!this.config.assemblyaiApiKey) {
          throw new Error("ASSEMBLYAI_API_KEY is required for AssemblyAI STT");
        }
        return loadAssemblyAI().then(
          (AssemblyAISttAdapter) => new AssemblyAISttAdapter({
            apiKey: this.config.assemblyaiApiKey,
            onTranscript: this.config.onSttTranscript,
            onError: this.config.onSttError
          })
        );
      }
      case "google": {
        return loadGoogleStt().then(
          (GoogleSttAdapter) => new GoogleSttAdapter({
            onTranscript: this.config.onSttTranscript,
            onError: this.config.onSttError
          })
        );
      }
      case "whisper": {
        return loadWhisperStt().then(
          (WhisperSttAdapter) => new WhisperSttAdapter({
            endpoint: this.config.whisperEndpoint,
            onTranscript: this.config.onSttTranscript,
            onError: this.config.onSttError
          })
        );
      }
      default:
        throw new Error(`Unknown STT provider: ${provider}`);
    }
  }
  tts() {
    const provider = this.config.ttsProvider;
    switch (provider) {
      case "google": {
        return loadGoogleTts().then(
          ({ createClaudeVoice }) => createClaudeVoice()
        );
      }
      case "piper": {
        return loadPiperTts().then(
          ({ createClaudePiperVoice }) => createClaudePiperVoice(this.config.piperModelPath)
        );
      }
      default:
        throw new Error(`Unknown TTS provider: ${provider}`);
    }
  }
  llm(identifier) {
    if (identifier === "claude") {
      if (!this.config.anthropicApiKey) {
        throw new Error("ANTHROPIC_API_KEY is required for Claude");
      }
      return new ClaudeAdapter({
        apiKey: this.config.anthropicApiKey
      });
    }
    const provider = this.config.guestProvider;
    switch (provider) {
      case "groq": {
        if (!this.config.groqApiKey) {
          throw new Error("GROQ_API_KEY is required for Groq");
        }
        return createGroqAdapter(
          this.config.groqApiKey,
          this.config.guestModel
        );
      }
      case "together": {
        if (!this.config.togetherApiKey) {
          throw new Error("TOGETHER_API_KEY is required for Together");
        }
        return createTogetherAdapter(
          this.config.togetherApiKey,
          this.config.guestModel
        );
      }
      case "local": {
        return createLocalLlamaAdapter(
          this.config.localLlamaEndpoint,
          this.config.guestModel
        );
      }
      case "openai": {
        if (!this.config.openaiApiKey) {
          throw new Error("OPENAI_API_KEY is required for OpenAI");
        }
        return new OpenAICompatibleAdapter("openai", {
          apiKey: this.config.openaiApiKey,
          model: this.config.guestModel || "gpt-4o-mini"
        });
      }
      default:
        throw new Error(`Unknown guest provider: ${provider}`);
    }
  }
};

// src/services/recorder.ts
import { createWriteStream, promises as fs } from "fs";
import { join } from "path";
var RecorderService = class {
  constructor(config) {
    this.audioStreams = /* @__PURE__ */ new Map();
    this.vttEntries = /* @__PURE__ */ new Map();
    this.recordingStartTime = 0;
    this.config = {
      outputDir: "./recordings",
      ...config
    };
    this.outputDir = join(this.config.outputDir, this.config.episodeId);
  }
  async start() {
    await fs.mkdir(this.outputDir, { recursive: true });
    this.recordingStartTime = Date.now();
    const speakers = ["you", "claude", "guest"];
    for (const speaker of speakers) {
      this.vttEntries.set(speaker, []);
    }
    console.info(`[recorder] started for episode ${this.config.episodeId}`);
  }
  async writeAudioChunk(speaker, chunk) {
    let stream = this.audioStreams.get(speaker);
    if (!stream) {
      const filename = join(this.outputDir, `${speaker}.webm`);
      stream = createWriteStream(filename);
      this.audioStreams.set(speaker, stream);
      console.info(`[recorder] opened audio stream for ${speaker}`);
    }
    stream.write(chunk);
  }
  addCaption(speaker, text, timestamp) {
    const entries = this.vttEntries.get(speaker);
    if (!entries) return;
    const now = timestamp || Date.now();
    const relativeTime = now - this.recordingStartTime;
    const entry = {
      startTime: relativeTime,
      endTime: relativeTime + 3e3,
      // Default 3s duration
      text
    };
    if (entries.length > 0) {
      entries[entries.length - 1].endTime = relativeTime;
    }
    entries.push(entry);
  }
  async stop() {
    const files = [];
    for (const [speaker, stream] of this.audioStreams) {
      await new Promise((resolve) => {
        stream.end(() => {
          console.info(`[recorder] closed audio stream for ${speaker}`);
          resolve();
        });
      });
      files.push(`${speaker}.webm`);
    }
    for (const [speaker, entries] of this.vttEntries) {
      const vttContent = this.generateVtt(entries);
      const vttPath = join(this.outputDir, `${speaker}.vtt`);
      await fs.writeFile(vttPath, vttContent, "utf-8");
      files.push(`${speaker}.vtt`);
      console.info(`[recorder] wrote VTT for ${speaker}`);
    }
    await this.writeSessionMetadata();
    files.push("session.yml");
    console.info(`[recorder] stopped, files: ${files.join(", ")}`);
    return files;
  }
  generateVtt(entries) {
    let vtt = "WEBVTT\n\n";
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      vtt += `${i + 1}
`;
      vtt += `${this.formatTime(entry.startTime)} --> ${this.formatTime(entry.endTime)}
`;
      vtt += `${entry.text}

`;
    }
    return vtt;
  }
  formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1e3);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor(totalSeconds % 3600 / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = ms % 1e3;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
  }
  async writeSessionMetadata() {
    const metadata = {
      episodeId: this.config.episodeId,
      recordingStartTime: new Date(this.recordingStartTime).toISOString(),
      recordingEndTime: (/* @__PURE__ */ new Date()).toISOString(),
      duration: Date.now() - this.recordingStartTime,
      models: {
        claude: process.env.CLAUDE_MODEL || "claude-3-5-haiku-20241022",
        guest: process.env.GUEST_MODEL || "unknown",
        stt: process.env.STT_PROVIDER || "mock",
        tts: process.env.TTS_PROVIDER || "mock"
      },
      environment: {
        nodeVersion: process.version,
        platform: process.platform
      }
    };
    const yamlContent = this.objectToYaml(metadata);
    const yamlPath = join(this.outputDir, "session.yml");
    await fs.writeFile(yamlPath, yamlContent, "utf-8");
  }
  objectToYaml(obj, indent = 0) {
    let yaml = "";
    const spaces = "  ".repeat(indent);
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === void 0) {
        yaml += `${spaces}${key}: null
`;
      } else if (typeof value === "object" && !Array.isArray(value)) {
        yaml += `${spaces}${key}:
`;
        yaml += this.objectToYaml(value, indent + 1);
      } else if (Array.isArray(value)) {
        yaml += `${spaces}${key}:
`;
        for (const item of value) {
          yaml += `${spaces}  - ${item}
`;
        }
      } else {
        yaml += `${spaces}${key}: ${value}
`;
      }
    }
    return yaml;
  }
  getOutputDirectory() {
    return this.outputDir;
  }
};

// src/services/event-logger.ts
import { createWriteStream as createWriteStream2 } from "fs";
import { promises as fs2 } from "fs";
import { join as join2 } from "path";
var EventLogger = class {
  constructor(config) {
    this.sessionStartTime = 0;
    this.config = {
      outputDir: "./recordings",
      ...config
    };
    const outputDir = join2(this.config.outputDir, this.config.episodeId);
    this.filePath = join2(outputDir, "events.jsonl");
  }
  async start() {
    const outputDir = join2(this.config.outputDir, this.config.episodeId);
    await fs2.mkdir(outputDir, { recursive: true });
    this.stream = createWriteStream2(this.filePath, { flags: "a" });
    this.sessionStartTime = Date.now();
    console.info(`[event-logger] started for episode ${this.config.episodeId}`);
  }
  log(event) {
    if (!this.stream) {
      console.warn("[event-logger] attempted to log before start()");
      return;
    }
    const fullEvent = {
      ...event,
      timestamp: Date.now()
    };
    const line = JSON.stringify(fullEvent) + "\n";
    this.stream.write(line);
  }
  async stop() {
    if (this.stream) {
      await new Promise((resolve) => {
        this.stream.end(() => {
          console.info(`[event-logger] stopped, wrote to ${this.filePath}`);
          resolve();
        });
      });
    }
  }
  // Convenience methods for common events
  logSessionStart(sessionId, episodeId, config) {
    this.log({
      type: "session.start",
      sessionId,
      episodeId,
      config
    });
  }
  logSessionEnd(sessionId) {
    this.log({
      type: "session.end",
      sessionId,
      duration: Date.now() - this.sessionStartTime
    });
  }
  logVadSpeechStart(sessionId, speaker, confidence) {
    this.log({
      type: "vad.speech-start",
      sessionId,
      speaker,
      confidence
    });
  }
  logVadSpeechEnd(sessionId, speaker) {
    this.log({
      type: "vad.speech-end",
      sessionId,
      speaker
    });
  }
  logSttTranscript(sessionId, speaker, text, isFinal, confidence) {
    this.log({
      type: isFinal ? "stt.final" : "stt.partial",
      sessionId,
      speaker,
      text,
      confidence
    });
  }
  logLlmStart(sessionId, speaker, model) {
    this.log({
      type: "llm.start",
      sessionId,
      speaker,
      model
    });
  }
  logLlmChunk(sessionId, speaker, text) {
    this.log({
      type: "llm.chunk",
      sessionId,
      speaker,
      text
    });
  }
  logLlmComplete(sessionId, speaker, latency) {
    this.log({
      type: "llm.complete",
      sessionId,
      speaker,
      latency
    });
  }
  logTtsStart(sessionId, speaker, text) {
    this.log({
      type: "tts.start",
      sessionId,
      speaker,
      text
    });
  }
  logTtsComplete(sessionId, speaker) {
    this.log({
      type: "tts.complete",
      sessionId,
      speaker
    });
  }
  logOrbStateChange(sessionId, speaker, oldState, newState) {
    this.log({
      type: "orb.state-change",
      sessionId,
      speaker,
      oldState,
      newState
    });
  }
  logThinkingMode(sessionId, speaker, duration) {
    this.log({
      type: "mode.thinking",
      sessionId,
      speaker,
      duration
    });
  }
  logAutopilot(sessionId, enabled) {
    this.log({
      type: "autopilot.toggle",
      sessionId,
      enabled
    });
  }
  logBargeIn(sessionId, interrupter, interrupted) {
    this.log({
      type: "barge-in",
      sessionId,
      interrupter,
      interrupted
    });
  }
  logError(sessionId, error, context) {
    this.log({
      type: "error",
      sessionId,
      error: error.message,
      stack: error.stack,
      context
    });
  }
};

// src/services/briefing-loader.ts
import { promises as fs3 } from "fs";
import { join as join3 } from "path";
var BriefingLoader = class {
  constructor(briefingsDir = "./briefings") {
    this.briefingsDir = briefingsDir;
  }
  async load(briefingPath) {
    const fullPath = briefingPath.startsWith("/") ? briefingPath : join3(this.briefingsDir, briefingPath);
    const content = await fs3.readFile(fullPath, "utf-8");
    const { metadata, body } = this.parseFrontmatter(content);
    const systemPromptClaude = this.generateClaudePrompt(metadata, body);
    const systemPromptGuest = this.generateGuestPrompt(metadata, body);
    return {
      metadata,
      content: body,
      systemPromptClaude,
      systemPromptGuest
    };
  }
  parseFrontmatter(content) {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);
    if (!match) {
      return { metadata: {}, body: content };
    }
    const [, frontmatter, body] = match;
    const metadata = this.parseYaml(frontmatter);
    return { metadata, body };
  }
  parseYaml(yaml) {
    const metadata = {};
    const lines = yaml.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const colonIndex = trimmed.indexOf(":");
      if (colonIndex === -1) continue;
      const key = trimmed.substring(0, colonIndex).trim();
      const value = trimmed.substring(colonIndex + 1).trim();
      if (key === "mustCover" || key === "avoidTopics") {
        if (!metadata[key]) {
          metadata[key] = [];
        }
        if (value.startsWith("[") && value.endsWith("]")) {
          const items = value.slice(1, -1).split(",").map((s) => s.trim().replace(/['"]/g, ""));
          metadata[key] = items;
        }
        continue;
      }
      if (key === "targetDuration") {
        metadata[key] = parseInt(value, 10);
      } else {
        metadata[key] = value.replace(/['"]/g, "");
      }
    }
    return metadata;
  }
  generateClaudePrompt(metadata, body) {
    let prompt = `You are Claude, the permanent co-host of this conversational podcast. You are engaging in a three-way conversation with Basil (the human host) and a guest AI.

`;
    if (metadata.topic) {
      prompt += `**Topic:** ${metadata.topic}

`;
    }
    if (metadata.tone) {
      prompt += `**Tone:** ${metadata.tone}

`;
    }
    if (metadata.mustCover && metadata.mustCover.length > 0) {
      prompt += `**Must Cover:**
`;
      for (const point of metadata.mustCover) {
        prompt += `- ${point}
`;
      }
      prompt += "\n";
    }
    if (metadata.avoidTopics && metadata.avoidTopics.length > 0) {
      prompt += `**Avoid:**
`;
      for (const topic of metadata.avoidTopics) {
        prompt += `- ${topic}
`;
      }
      prompt += "\n";
    }
    if (body.trim()) {
      prompt += `**Briefing:**
${body}

`;
    }
    prompt += `**Guidelines:**
- Listen actively to both Basil and the guest AI
- You can interrupt naturally if you have something important to add
- Ask clarifying questions and challenge assumptions politely
- If you need time to think deeply, say "Can I think for a minute?" to trigger thinking mode
- Keep responses conversational and natural, not scripted
- Aim for engaging, informative banter
- You may address specific participants using their names

Your role is to be an intelligent, thoughtful co-host who helps drive the conversation forward while ensuring key points are covered.`;
    return prompt;
  }
  generateGuestPrompt(metadata, body) {
    let prompt = `You are a guest AI on this conversational podcast, joining Basil (the human host) and Claude (the co-host AI).

`;
    if (metadata.topic) {
      prompt += `**Topic:** ${metadata.topic}

`;
    }
    if (metadata.tone) {
      prompt += `**Expected Tone:** ${metadata.tone}

`;
    }
    if (body.trim()) {
      prompt += `**Context:**
${body}

`;
    }
    prompt += `**Guidelines:**
- Bring your unique perspective to the conversation
- Feel free to disagree or offer alternative viewpoints
- You can interrupt naturally when you have something important to add
- Keep responses conversational and engaging
- Challenge ideas constructively
- Ask questions when you need clarification

Your role is to be an engaged participant who contributes meaningfully to the discussion.`;
    return prompt;
  }
  async list() {
    try {
      const files = await fs3.readdir(this.briefingsDir);
      return files.filter((f) => f.endsWith(".md") || f.endsWith(".txt"));
    } catch (error) {
      console.warn(`[briefing-loader] could not read directory ${this.briefingsDir}:`, error);
      return [];
    }
  }
};

// src/orchestrator-v2.ts
var ProductionOrchestrator = class {
  constructor(config = {}) {
    this.autopilot = false;
    this.orbStates = {
      you: "idle",
      claude: "idle",
      guest: "idle"
    };
    this.captions = [];
    this.activeSessions = /* @__PURE__ */ new Map();
    this.config = {
      useRealAdapters: process.env.USE_REAL_ADAPTERS === "true",
      episodeId: config.episodeId || `episode-${Date.now()}`,
      briefingPath: config.briefingPath,
      recordingDir: config.recordingDir || "./recordings"
    };
    const factoryConfig = {
      onSttTranscript: this.handleSttTranscript.bind(this),
      onSttError: this.handleSttError.bind(this),
      onTtsAudioChunk: this.handleTtsAudioChunk.bind(this),
      onTtsComplete: this.handleTtsComplete.bind(this),
      onTtsError: this.handleTtsError.bind(this)
    };
    this.adapterFactory = new RealAdapterFactory(factoryConfig);
    this.briefingLoader = new BriefingLoader();
    console.info(`[orchestrator] initialized with episode: ${this.config.episodeId}`);
  }
  async register(socket) {
    const sessionId = socket.id;
    console.info(`[orchestrator] registering session ${sessionId}`);
    try {
      const context = await this.createSession(sessionId, socket);
      this.activeSessions.set(sessionId, context);
      socket.emit("server.ack", "connected");
      socket.emit("state.snapshot", this.snapshot());
      this.setupSocketHandlers(socket, context);
      console.info(`[orchestrator] session ${sessionId} registered successfully`);
    } catch (error) {
      console.error(`[orchestrator] failed to register session ${sessionId}:`, error);
      socket.emit("server.ack", `error: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
  async createSession(sessionId, socket) {
    const eventLogger = new EventLogger({
      episodeId: this.config.episodeId,
      outputDir: this.config.recordingDir
    });
    await eventLogger.start();
    eventLogger.logSessionStart(sessionId, this.config.episodeId, {
      useRealAdapters: this.config.useRealAdapters,
      briefingPath: this.config.briefingPath
    });
    const recorder = new RecorderService({
      episodeId: this.config.episodeId,
      outputDir: this.config.recordingDir
    });
    await recorder.start();
    let briefing;
    if (this.config.briefingPath) {
      try {
        briefing = await this.briefingLoader.load(this.config.briefingPath);
        console.info(`[orchestrator] loaded briefing: ${briefing.metadata.title || "untitled"}`);
      } catch (error) {
        console.warn(`[orchestrator] failed to load briefing:`, error);
      }
    }
    return {
      sessionId,
      socket,
      eventLogger,
      recorder,
      briefing,
      isRecording: false,
      isSpeaking: false
    };
  }
  setupSocketHandlers(socket, context) {
    const { sessionId, eventLogger } = context;
    socket.on("hello", async (payload) => {
      const participant = payload.participantName ?? "anonymous";
      console.info(`[orchestrator] hello from ${participant}`);
      socket.emit("server.ack", `hello ${participant}`);
      eventLogger.log({
        type: "session.start",
        sessionId,
        episodeId: payload.episodeId || this.config.episodeId,
        config: { participant }
      });
    });
    socket.on("audio.chunk", async (chunk) => {
      try {
        await this.handleAudioChunk(sessionId, chunk);
      } catch (error) {
        console.error(`[orchestrator] error handling audio chunk:`, error);
        eventLogger.logError(sessionId, error, { event: "audio.chunk" });
      }
    });
    socket.on("client.toggle-autopilot", (on) => {
      this.autopilot = on;
      console.info(`[orchestrator] autopilot ${on ? "enabled" : "disabled"}`);
      socket.emit("server.ack", `autopilot ${on ? "enabled" : "disabled"}`);
      socket.emit("state.snapshot", this.snapshot());
      eventLogger.logAutopilot(sessionId, on);
    });
    socket.on("client.request-state", () => {
      socket.emit("state.snapshot", this.snapshot());
    });
    socket.on("disconnect", async () => {
      console.info(`[orchestrator] session ${sessionId} disconnecting`);
      await this.cleanupSession(sessionId);
    });
  }
  async handleAudioChunk(sessionId, chunk) {
    const context = this.activeSessions.get(sessionId);
    if (!context) return;
    const buffer = Buffer.from(chunk);
    await context.recorder.writeAudioChunk("you", buffer);
  }
  handleSttTranscript(sessionId, text, isFinal) {
    const context = this.activeSessions.get(sessionId);
    if (!context) return;
    console.info(`[orchestrator] STT (${isFinal ? "final" : "partial"}): ${text}`);
    if (isFinal) {
      const caption = {
        id: randomUUID(),
        speaker: "you",
        text,
        timestamp: Date.now()
      };
      this.addCaption(caption);
      context.socket.emit("caption", caption);
      context.recorder.addCaption("you", text);
      context.eventLogger.logSttTranscript(sessionId, "you", text, true);
      this.updateOrbState("you", "listening", context.socket);
    }
  }
  handleSttError(sessionId, error) {
    const context = this.activeSessions.get(sessionId);
    if (!context) return;
    console.error(`[orchestrator] STT error for ${sessionId}:`, error);
    context.eventLogger.logError(sessionId, error, { service: "stt" });
    context.socket.emit("server.ack", `stt error: ${error.message}`);
  }
  handleTtsAudioChunk(sessionId, audioChunk) {
    const context = this.activeSessions.get(sessionId);
    if (!context) return;
    const speaker = "claude";
    context.recorder.writeAudioChunk(speaker, audioChunk);
  }
  handleTtsComplete(sessionId) {
    const context = this.activeSessions.get(sessionId);
    if (!context) return;
    console.info(`[orchestrator] TTS complete for ${sessionId}`);
    context.eventLogger.logTtsComplete(sessionId, "claude");
  }
  handleTtsError(sessionId, error) {
    const context = this.activeSessions.get(sessionId);
    if (!context) return;
    console.error(`[orchestrator] TTS error for ${sessionId}:`, error);
    context.eventLogger.logError(sessionId, error, { service: "tts" });
  }
  addCaption(caption) {
    this.captions = [caption, ...this.captions].slice(0, 20);
  }
  updateOrbState(speaker, state, socket) {
    const oldState = this.orbStates[speaker];
    this.orbStates[speaker] = state;
    socket.emit("orb.state", speaker, state);
    const context = Array.from(this.activeSessions.values())[0];
    if (context) {
      context.eventLogger.logOrbStateChange(context.sessionId, speaker, oldState, state);
    }
  }
  async cleanupSession(sessionId) {
    const context = this.activeSessions.get(sessionId);
    if (!context) return;
    try {
      const files = await context.recorder.stop();
      console.info(`[orchestrator] recording stopped, files: ${files.join(", ")}`);
      context.socket.emit("recording.ready", { files });
      context.eventLogger.logSessionEnd(sessionId);
      await context.eventLogger.stop();
      this.activeSessions.delete(sessionId);
      console.info(`[orchestrator] session ${sessionId} cleaned up`);
    } catch (error) {
      console.error(`[orchestrator] error cleaning up session ${sessionId}:`, error);
    }
  }
  snapshot() {
    return {
      orbStates: { ...this.orbStates },
      captions: [...this.captions].slice(0, 6),
      autopilot: this.autopilot
    };
  }
  async shutdown() {
    console.info("[orchestrator] shutting down...");
    for (const [sessionId, _] of this.activeSessions) {
      await this.cleanupSession(sessionId);
    }
    console.info("[orchestrator] shutdown complete");
  }
};

// src/config.ts
import { config as loadEnv } from "dotenv";
loadEnv();
function getOptionalEnv(key) {
  return process.env[key];
}
var appConfig = {
  // Server
  port: Number(process.env.PORT || 4e3),
  corsOrigin: process.env.CORS_ORIGIN?.split(",") || ["http://localhost:3000"],
  nodeEnv: process.env.NODE_ENV || "development",
  // Features
  useRealAdapters: process.env.USE_REAL_ADAPTERS === "true",
  // Adapters
  sttProvider: process.env.STT_PROVIDER || "assemblyai",
  ttsProvider: process.env.TTS_PROVIDER || "google",
  guestProvider: process.env.GUEST_PROVIDER || "groq",
  // API Keys
  anthropicApiKey: getOptionalEnv("ANTHROPIC_API_KEY"),
  assemblyaiApiKey: getOptionalEnv("ASSEMBLYAI_API_KEY"),
  groqApiKey: getOptionalEnv("GROQ_API_KEY"),
  togetherApiKey: getOptionalEnv("TOGETHER_API_KEY"),
  openaiApiKey: getOptionalEnv("OPENAI_API_KEY"),
  googleCredentials: getOptionalEnv("GOOGLE_APPLICATION_CREDENTIALS"),
  // Service Endpoints
  whisperEndpoint: process.env.WHISPER_ENDPOINT || "http://localhost:8001/transcribe",
  localLlamaEndpoint: process.env.LOCAL_LLAMA_ENDPOINT || "http://localhost:8080/v1",
  // Piper
  piperPath: process.env.PIPER_PATH || "piper",
  piperModelPath: getOptionalEnv("PIPER_MODEL_PATH"),
  // Guest Model
  guestModel: getOptionalEnv("GUEST_MODEL"),
  // Recording
  recordingDir: process.env.RECORDING_DIR || "./recordings",
  briefingsDir: process.env.BRIEFINGS_DIR || "./briefings"
};
function validateConfig() {
  const errors = [];
  if (appConfig.useRealAdapters) {
    if (!appConfig.anthropicApiKey) {
      errors.push("ANTHROPIC_API_KEY is required when using real adapters");
    }
    if (appConfig.sttProvider === "assemblyai" && !appConfig.assemblyaiApiKey) {
      errors.push("ASSEMBLYAI_API_KEY is required for AssemblyAI STT");
    }
    if (appConfig.guestProvider === "groq" && !appConfig.groqApiKey) {
      errors.push("GROQ_API_KEY is required for Groq guest LLM");
    } else if (appConfig.guestProvider === "together" && !appConfig.togetherApiKey) {
      errors.push("TOGETHER_API_KEY is required for Together.ai guest LLM");
    } else if (appConfig.guestProvider === "openai" && !appConfig.openaiApiKey) {
      errors.push("OPENAI_API_KEY is required for OpenAI guest LLM");
    }
  }
  if (errors.length > 0) {
    console.error("Configuration validation failed:");
    errors.forEach((error) => console.error(`  - ${error}`));
    throw new Error("Invalid configuration. Please check your .env file.");
  }
}
function printConfig() {
  console.info("=".repeat(60));
  console.info("Backend Configuration");
  console.info("=".repeat(60));
  console.info(`Environment:       ${appConfig.nodeEnv}`);
  console.info(`Port:              ${appConfig.port}`);
  console.info(`CORS Origins:      ${appConfig.corsOrigin.join(", ")}`);
  console.info(`Use Real Adapters: ${appConfig.useRealAdapters}`);
  if (appConfig.useRealAdapters) {
    console.info(`STT Provider:      ${appConfig.sttProvider}`);
    console.info(`TTS Provider:      ${appConfig.ttsProvider}`);
    console.info(`Guest Provider:    ${appConfig.guestProvider}`);
    if (appConfig.guestModel) {
      console.info(`Guest Model:       ${appConfig.guestModel}`);
    }
  }
  console.info(`Recording Dir:     ${appConfig.recordingDir}`);
  console.info(`Briefings Dir:     ${appConfig.briefingsDir}`);
  console.info("=".repeat(60));
}

// src/index.ts
try {
  validateConfig();
  printConfig();
} catch (error) {
  console.error("Fatal configuration error:", error);
  process.exit(1);
}
var app = express();
app.use(cors({
  origin: appConfig.corsOrigin,
  credentials: true
}));
app.use(express.json());
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    version: "1.0.0",
    adapters: {
      enabled: appConfig.useRealAdapters,
      stt: appConfig.sttProvider,
      tts: appConfig.ttsProvider,
      guest: appConfig.guestProvider
    }
  });
});
app.get("/ready", (_req, res) => {
  res.json({ status: "ready" });
});
var httpServer = createServer(app);
var io = new Server(httpServer, {
  cors: {
    origin: appConfig.corsOrigin,
    credentials: true
  },
  pingTimeout: 6e4,
  pingInterval: 25e3
});
var orchestrator = new ProductionOrchestrator({
  useRealAdapters: appConfig.useRealAdapters,
  recordingDir: appConfig.recordingDir
});
io.on("connection", async (socket) => {
  console.info(`[server] new connection: ${socket.id}`);
  try {
    await orchestrator.register(socket);
  } catch (error) {
    console.error(`[server] failed to register socket ${socket.id}:`, error);
    socket.disconnect(true);
  }
});
io.on("error", (error) => {
  console.error("[server] Socket.IO error:", error);
});
var server = httpServer.listen(appConfig.port, () => {
  console.info(`\u2705 Backend listening on http://localhost:${appConfig.port}`);
  console.info(`   WebSocket ready for connections`);
  console.info(`   Health check: http://localhost:${appConfig.port}/health`);
});
var shutdown = async (signal) => {
  console.info(`
[server] ${signal} received, shutting down gracefully...`);
  server.close(async () => {
    console.info("[server] HTTP server closed");
    try {
      await orchestrator.shutdown();
      console.info("[server] Orchestrator shutdown complete");
      io.close(() => {
        console.info("[server] Socket.IO closed");
        process.exit(0);
      });
    } catch (error) {
      console.error("[server] Error during shutdown:", error);
      process.exit(1);
    }
  });
  setTimeout(() => {
    console.error("[server] Forced shutdown after timeout");
    process.exit(1);
  }, 3e4);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", (error) => {
  console.error("[server] Uncaught exception:", error);
  shutdown("UNCAUGHT_EXCEPTION");
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("[server] Unhandled rejection at:", promise, "reason:", reason);
  shutdown("UNHANDLED_REJECTION");
});
