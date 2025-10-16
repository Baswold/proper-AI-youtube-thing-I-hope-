"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Orb, type AgentState } from "./ui/orb";
import { useStudioStore } from "../state/studio-store";
import type { SpeakerId } from "@basil/shared";

const speakerDisplay: Record<SpeakerId, { label: string; colors: [string, string]; accent: string }> = {
  you: {
    label: "Basil",
    colors: ["#0EA5E9", "#22D3EE"],
    accent: "from-cyan-500/70 to-emerald-400/70",
  },
  claude: {
    label: "Claude Haiku 4.5",
    colors: ["#3B82F6", "#8B5CF6"],
    accent: "from-blue-500/70 to-indigo-500/70",
  },
  guest: {
    label: "Guest AI",
    colors: ["#F59E0B", "#F97316"],
    accent: "from-amber-500/70 to-orange-500/70",
  },
};

const orbStateToAgentState = (state: string | undefined): AgentState => {
  switch (state) {
    case "speaking":
      return "talking";
    case "thinking":
      return "thinking";
    case "listening":
      return "listening";
    default:
      return null;
  }
};

export function StudioPage() {
  const { connect, connection, orbStates, captions, autopilot, toggleAutopilot, lastAck } =
    useStudioStore();
  const [showControls, setShowControls] = useState(true);

  useEffect(() => {
    connect();
  }, [connect]);

  const latestCaption = captions[0];

  const sharedScreenContent = useMemo(() => {
    if (!latestCaption) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-6 text-slate-200/80 p-8">
          <div className="relative">
            <div className="absolute inset-0 blur-2xl bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-cyan-500/20 animate-pulse" />
            <div className="relative space-y-2 text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-sm">
                <div className="h-2 w-2 rounded-full bg-slate-400 animate-pulse" />
                <span className="text-sm font-semibold tracking-wide">Studio Idle</span>
              </div>
            </div>
          </div>
          <div className="max-w-md space-y-3 text-center">
            <p className="text-lg font-medium text-slate-300">
              Ready for conversation
            </p>
            <p className="text-sm leading-relaxed text-slate-400">
              Connect the agents to start the show. Live captions, briefings, and thinking mode visuals will appear here in real time.
            </p>
          </div>
          <div className="flex gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
              Basil
            </span>
            <span className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              Claude
            </span>
            <span className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-orange-500" />
              Guest
            </span>
          </div>
        </div>
      );
    }

    const speakerColor: Record<SpeakerId, string> = {
      you: "from-cyan-400 to-emerald-400",
      claude: "from-blue-400 to-indigo-400",
      guest: "from-orange-400 to-amber-400",
    };
    const currentSpeakerColor = speakerColor[latestCaption.speaker];

    return (
      <div className="flex h-full w-full flex-col justify-end gap-8 p-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Main Caption */}
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-black/40 via-black/30 to-black/40 p-8 backdrop-blur-xl shadow-2xl">
          <div className="absolute top-0 right-0 h-32 w-32 bg-gradient-to-br opacity-10 blur-3xl" style={{ 
            background: `linear-gradient(to bottom right, ${latestCaption.speaker === 'you' ? '#0EA5E9' : latestCaption.speaker === 'claude' ? '#3B82F6' : '#F59E0B'}, transparent)` 
          }} />
          
          <div className="relative space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={clsx(
                  "h-2 w-2 rounded-full animate-pulse",
                  latestCaption.speaker === "you" ? "bg-cyan-400" :
                  latestCaption.speaker === "claude" ? "bg-blue-400" :
                  "bg-orange-400"
                )} />
                <span className={clsx(
                  "text-sm font-bold uppercase tracking-wider bg-gradient-to-r bg-clip-text text-transparent",
                  currentSpeakerColor
                )}>
                  {speakerDisplay[latestCaption.speaker].label}
                </span>
              </div>
              <span className="text-xs font-mono text-slate-500">
                {new Date(latestCaption.timestamp).toLocaleTimeString()}
              </span>
            </div>
            
            <p className="text-2xl font-medium leading-relaxed text-slate-100">
              {latestCaption.text}
            </p>
          </div>
        </div>

        {/* Previous Captions */}
        <div className="space-y-3">
          {captions.slice(1, 4).map((caption, idx: number) => (
            <div 
              key={caption.id} 
              className="flex items-start gap-3 opacity-60 hover:opacity-100 transition-opacity"
              style={{ animationDelay: `${idx * 50}ms` }}
            >
              <div className={clsx(
                "mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full",
                caption.speaker === "you" ? "bg-cyan-400" :
                caption.speaker === "claude" ? "bg-blue-400" :
                "bg-orange-400"
              )} />
              <p className="flex-1 text-sm text-slate-300 leading-relaxed">
                <span className="font-semibold text-slate-200">
                  {speakerDisplay[caption.speaker].label}:
                </span>{" "}
                {caption.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }, [captions, latestCaption]);

  return (
    <div className="min-h-screen bg-[#050717] text-slate-100 relative overflow-hidden">
      {/* Animated background particles */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-6 py-8">
        {/* Enhanced Header */}
        <header className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white via-blue-100 to-purple-200 bg-clip-text text-transparent">
                Three-Way Voice Studio
              </h1>
              <ConnectionIndicator status={connection} />
            </div>
            <p className="text-sm text-slate-400 font-mono">Basil × Claude Haiku 4.5 × Guest AI</p>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowControls(!showControls)}
              className="rounded-lg bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10 transition-all border border-white/10"
            >
              {showControls ? "Hide" : "Show"} Controls
            </button>
            <button
              type="button"
              onClick={toggleAutopilot}
              className={clsx(
                "rounded-lg px-5 py-2.5 text-sm font-semibold transition-all duration-300 border",
                autopilot
                  ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/50 border-indigo-400/50 scale-105"
                  : "bg-white/5 text-slate-200 hover:bg-white/10 border-white/10 hover:border-white/20",
              )}
            >
              <span className="flex items-center gap-2">
                <span className={clsx("w-2 h-2 rounded-full", autopilot ? "bg-white animate-pulse" : "bg-slate-400")} />
                Autopilot {autopilot ? "Active" : "Standby"}
              </span>
            </button>
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-10">
          <section className="relative flex flex-1 flex-col">
            {/* Orb Container with enhanced styling */}
            <div className="absolute -top-20 left-1/2 z-20 flex w-full max-w-5xl -translate-x-1/2 justify-between px-8">
              {SPEAKER_ORDER.map((speaker, idx) => {
                const meta = speakerDisplay[speaker];
                const state = orbStates[speaker];
                const isActive = state === "speaking" || state === "thinking";
                
                return (
                  <div 
                    key={speaker} 
                    className="flex w-44 flex-col items-center gap-4 group"
                    style={{ animationDelay: `${idx * 100}ms` }}
                  >
                    <div
                      className={clsx(
                        "relative h-44 w-44 overflow-hidden rounded-full border-2 p-2.5 transition-all duration-500",
                        "shadow-2xl backdrop-blur-sm",
                        speaker === "claude" ? "-mt-8" : speaker === "guest" ? "-mt-4" : "-mt-2",
                        isActive 
                          ? `border-${speaker === 'you' ? 'cyan' : speaker === 'claude' ? 'blue' : 'orange'}-400/60 shadow-${speaker === 'you' ? 'cyan' : speaker === 'claude' ? 'blue' : 'orange'}-500/40 scale-105`
                          : "border-white/10 shadow-black/60",
                      )}
                    >
                      {/* Glow effect */}
                      <div className={clsx(
                        "absolute inset-0 rounded-full bg-gradient-to-br transition-opacity duration-500",
                        meta.accent,
                        isActive ? "opacity-20" : "opacity-0"
                      )} />
                      
                      {/* Inner gradient */}
                      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/5 to-transparent" />
                      
                      <Orb
                        colors={meta.colors}
                        className="relative h-full w-full"
                        agentState={orbStateToAgentState(state)}
                      />
                    </div>
                    
                    <div className="text-center space-y-1">
                      <p className="text-sm font-bold uppercase tracking-wider text-slate-100">
                        {meta.label}
                      </p>
                      <div className="flex items-center justify-center gap-2">
                        <span className={clsx(
                          "inline-block px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all",
                          state === "speaking" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" :
                          state === "listening" ? "bg-blue-500/20 text-blue-300 border-blue-500/30" :
                          state === "thinking" ? "bg-purple-500/20 text-purple-300 border-purple-500/30" :
                          "bg-slate-500/20 text-slate-400 border-slate-500/30"
                        )}>
                          {state || "idle"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Shared Screen with enhanced styling */}
            <div className="relative z-10 mt-28 flex flex-1">
              <div className="relative flex w-full flex-1 overflow-hidden rounded-3xl border-2 border-white/10 bg-gradient-to-br from-slate-900/90 via-slate-800/80 to-slate-900/90 shadow-2xl shadow-blue-950/50 backdrop-blur-xl">
                {/* Top gradient overlay */}
                <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 via-black/30 to-transparent pointer-events-none" />
                
                {/* Subtle grid pattern */}
                <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
                
                {sharedScreenContent}
              </div>
            </div>
          </section>

          {/* Enhanced Footer with Controls */}
          {showControls && (
            <footer className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="grid grid-cols-3 gap-4">
                <ControlCard icon="🎙️" title="Microphone" status="Ready" />
                <ControlCard icon="🎧" title="Audio Mix" status="Monitoring" />
                <ControlCard icon="⏺️" title="Recording" status="Standby" active />
              </div>
              
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-6 py-4 backdrop-blur-sm">
                <div className="flex items-center gap-6">
                  <StatusBadge label="Phase 1" value="Complete" color="emerald" />
                  <StatusBadge label="Adapters" value="Wired" color="blue" />
                  <StatusBadge label="Services" value="Ready" color="purple" />
                </div>
                
                {lastAck && (
                  <p className="text-xs font-mono text-slate-500">Last: {lastAck}</p>
                )}
              </div>
            </footer>
          )}
        </main>
      </div>
    </div>
  );
}

// Helper Components
function ConnectionIndicator({ status }: { status: string }) {
  const statusConfig = {
    connected: { color: "bg-emerald-500", label: "Connected", pulse: true },
    connecting: { color: "bg-amber-500", label: "Connecting", pulse: true },
    error: { color: "bg-red-500", label: "Error", pulse: false },
    idle: { color: "bg-slate-500", label: "Disconnected", pulse: false },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.idle;

  return (
    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 backdrop-blur-sm">
      <div className="relative flex h-2 w-2">
        <span className={clsx("absolute inline-flex h-full w-full rounded-full opacity-75", config.color, config.pulse && "animate-ping")} />
        <span className={clsx("relative inline-flex rounded-full h-2 w-2", config.color)} />
      </div>
      <span className="text-xs font-medium text-slate-300">{config.label}</span>
    </div>
  );
}

function ControlCard({ icon, title, status, active }: { icon: string; title: string; status: string; active?: boolean }) {
  return (
    <div className={clsx(
      "group relative overflow-hidden rounded-xl border p-4 transition-all duration-300",
      active 
        ? "border-emerald-500/30 bg-emerald-500/10 shadow-lg shadow-emerald-500/20" 
        : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
    )}>
      <div className="flex items-center gap-3">
        <div className={clsx(
          "flex h-10 w-10 items-center justify-center rounded-lg text-xl transition-transform group-hover:scale-110",
          active ? "bg-emerald-500/20" : "bg-white/10"
        )}>
          {icon}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-200">{title}</p>
          <p className={clsx(
            "text-xs font-medium",
            active ? "text-emerald-400" : "text-slate-400"
          )}>
            {status}
          </p>
        </div>
      </div>
      {active && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500 animate-pulse" />
      )}
    </div>
  );
}

function StatusBadge({ label, value, color }: { label: string; value: string; color: "emerald" | "blue" | "purple" }) {
  const colorClasses = {
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500">{label}:</span>
      <span className={clsx("rounded-md border px-2 py-0.5 text-xs font-semibold", colorClasses[color])}>
        {value}
      </span>
    </div>
  );
}

const SPEAKER_ORDER: SpeakerId[] = ["you", "claude", "guest"];
