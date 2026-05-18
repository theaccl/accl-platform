"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import NavigationBar from "@/components/NavigationBar";
import {
  BOT_DIFFICULTY_LABELS,
  BOT_DIFFICULTY_LEVELS,
  type BotDifficultyLevel,
} from "@/lib/bot/botDifficulty";
import {
  BOT_PERSONALITY_LABELS,
  BOT_PERSONALITY_STYLES,
  type BotPersonalityStyle,
} from "@/lib/bot/botPersonalityStyle";
import { supabase } from "@/lib/supabaseClient";

const TIME_OPTIONS = ["3m", "5m", "10m"] as const;

type Props = {
  title?: string;
};

export default function ComputerPlayLobby({ title = "Play computer" }: Props) {
  const router = useRouter();
  const [difficulty, setDifficulty] = useState<BotDifficultyLevel>(3);
  const [personalityStyle, setPersonalityStyle] = useState<BotPersonalityStyle>("balanced");
  const [timeControl, setTimeControl] = useState<(typeof TIME_OPTIONS)[number]>("5m");
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState("");

  const startBotGame = async () => {
    setStarting(true);
    setMessage("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setMessage("Please sign in to start a computer game.");
        return;
      }
      const res = await fetch("/api/bot/game/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          difficulty,
          personalityStyle,
          liveTimeControl: timeControl,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        game?: { id?: string };
        error?: string;
        message?: string;
      };
      if (!res.ok || !payload.game?.id) {
        setMessage(payload.error ?? payload.message ?? "Could not start computer game.");
        return;
      }
      router.push(`/game/${payload.game.id}`);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--accl-bg-base)] text-[var(--accl-text-primary)]">
      <NavigationBar />
      <div className="mx-auto max-w-2xl px-6 py-8">
        <h1 className="mb-2 text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mb-6 text-sm text-[var(--accl-text-muted)]">
          Choose strength and style. Moves are validated server-side; the computer responds after each of your plies.
        </p>

        <div className="flex flex-col gap-5 rounded-2xl border border-[var(--accl-border-muted)] bg-[var(--accl-bg-elevated)]/30 p-5">
          <section>
            <p className="mb-2 text-sm font-medium text-[var(--accl-text-secondary)]">Difficulty</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {BOT_DIFFICULTY_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setDifficulty(level)}
                  className={`rounded-lg px-3 py-2.5 text-left text-sm transition ${
                    difficulty === level
                      ? "bg-red-900/35 font-semibold text-red-100 ring-1 ring-red-500/40"
                      : "bg-[var(--accl-bg-base)]/80 text-[var(--accl-text-muted)] hover:bg-[var(--accl-bg-base)]"
                  }`}
                >
                  <span className="block text-[10px] uppercase tracking-wide opacity-70">Level {level}</span>
                  {BOT_DIFFICULTY_LABELS[level]}
                </button>
              ))}
            </div>
          </section>

          <section>
            <p className="mb-2 text-sm font-medium text-[var(--accl-text-secondary)]">Personality</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {BOT_PERSONALITY_STYLES.map((style) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => setPersonalityStyle(style)}
                  className={`rounded-lg px-3 py-2.5 text-sm transition ${
                    personalityStyle === style
                      ? "bg-sky-900/30 font-semibold text-sky-100 ring-1 ring-sky-500/35"
                      : "bg-[var(--accl-bg-base)]/80 text-[var(--accl-text-muted)] hover:bg-[var(--accl-bg-base)]"
                  }`}
                >
                  {BOT_PERSONALITY_LABELS[style]}
                </button>
              ))}
            </div>
          </section>

          <section>
            <p className="mb-2 text-sm font-medium text-[var(--accl-text-secondary)]">Time control</p>
            <div className="flex flex-wrap gap-2">
              {TIME_OPTIONS.map((tc) => (
                <button
                  key={tc}
                  type="button"
                  onClick={() => setTimeControl(tc)}
                  className={`rounded-lg px-4 py-2 text-sm ${
                    timeControl === tc
                      ? "bg-[var(--accl-bg-base)] font-semibold text-white ring-1 ring-[var(--accl-border-muted)]"
                      : "bg-[var(--accl-bg-base)]/60 text-[var(--accl-text-muted)]"
                  }`}
                >
                  {tc}
                </button>
              ))}
            </div>
          </section>

          <button
            type="button"
            onClick={() => void startBotGame()}
            disabled={starting}
            className="w-full rounded-xl bg-red-600/90 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-red-500 disabled:cursor-wait disabled:opacity-60"
          >
            {starting ? "Starting…" : "Start game"}
          </button>
          {message ? <p className="text-sm text-red-300/90">{message}</p> : null}
        </div>
      </div>
    </div>
  );
}
