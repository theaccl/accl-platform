'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  BOT_DIFFICULTY_LABELS,
  BOT_DIFFICULTY_LEVELS,
  type BotDifficultyLevel,
} from '@/lib/bot/botDifficulty';
import {
  BOT_PERSONALITY_LABELS,
  BOT_PERSONALITY_STYLES,
  type BotPersonalityStyle,
} from '@/lib/bot/botPersonalityStyle';
import type { ComputerPlayPlatMode } from '@/lib/freePlayComputerEntry';
import {
  coercePlatTimeForMode,
  defaultPlatTimeControl,
  platTimeOptionsForMode,
} from '@/lib/freePlayModeTimeControl';
import { supabase } from '@/lib/supabaseClient';

type Props = {
  mode: ComputerPlayPlatMode;
  /** Optional initial clock (e.g. from room ?clock=); coerced to mode-legal options. */
  initialClock?: string;
};

export function FreeLobbyPlayComputerPanel({ mode, initialClock }: Props) {
  const router = useRouter();
  const [difficulty, setDifficulty] = useState<BotDifficultyLevel>(3);
  const [personalityStyle, setPersonalityStyle] = useState<BotPersonalityStyle>('balanced');
  const [timeControl, setTimeControl] = useState(() =>
    coercePlatTimeForMode(mode, initialClock ?? defaultPlatTimeControl(mode)),
  );
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState('');

  const timeOptions = platTimeOptionsForMode(mode);

  const startBotGame = async () => {
    setStarting(true);
    setMessage('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setMessage('Please sign in to start a computer game.');
        return;
      }
      const res = await fetch('/api/bot/game/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          difficulty,
          personalityStyle,
          platMode: mode,
          liveTimeControl: timeControl,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        game?: { id?: string };
        error?: string;
        message?: string;
        detail?: string;
        key?: string;
      };
      if (!res.ok || !payload.game?.id) {
        const parts = [payload.error, payload.detail, payload.message].filter(
          (s): s is string => Boolean(s && String(s).trim()),
        );
        setMessage(parts.length > 0 ? parts.join(' — ') : 'Could not start computer game.');
        return;
      }
      router.push(`/game/${payload.game.id}`);
    } finally {
      setStarting(false);
    }
  };

  return (
    <section
      className="rounded-xl border border-violet-500/20 bg-[#0c1018]/85 p-3 sm:p-4"
      aria-label="Play computer"
      data-testid="free-lobby-play-computer-panel"
      data-play-computer-mode={mode}
      data-accl-layout="mode-room-play-computer"
    >
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-300/90">
        Play computer
      </h2>
      <p className="mt-1 max-w-2xl text-[11px] leading-snug text-gray-500">
        Unrated practice vs the server computer. Uses the same move path as other computer games; time
        controls match this room&apos;s {mode} options only.
      </p>

      <div className="mt-3 flex flex-col gap-4">
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">Time control</p>
          <div className="flex flex-wrap gap-2">
            {timeOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                data-testid={`free-lobby-play-computer-tc-${mode}-${opt.id}`}
                onClick={() => setTimeControl(opt.id)}
                className={`rounded-lg px-3 py-2 text-sm transition ${
                  timeControl === opt.id
                    ? 'bg-violet-900/40 font-semibold text-violet-100 ring-1 ring-violet-500/40'
                    : 'bg-[#07080c]/80 text-gray-400 hover:bg-[#07080c] hover:text-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">Difficulty</p>
            <div className="flex flex-wrap gap-1.5">
              {BOT_DIFFICULTY_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setDifficulty(level)}
                  className={`rounded-md px-2.5 py-1.5 text-xs ${
                    difficulty === level
                      ? 'bg-red-900/35 font-semibold text-red-100 ring-1 ring-red-500/35'
                      : 'bg-[#07080c]/80 text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {BOT_DIFFICULTY_LABELS[level]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">Style</p>
            <div className="flex flex-wrap gap-1.5">
              {BOT_PERSONALITY_STYLES.map((style) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => setPersonalityStyle(style)}
                  className={`rounded-md px-2.5 py-1.5 text-xs ${
                    personalityStyle === style
                      ? 'bg-sky-900/30 font-semibold text-sky-100 ring-1 ring-sky-500/35'
                      : 'bg-[#07080c]/80 text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {BOT_PERSONALITY_LABELS[style]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          type="button"
          data-testid={`free-lobby-play-computer-start-${mode}`}
          onClick={() => void startBotGame()}
          disabled={starting}
          className="w-full max-w-md rounded-xl bg-violet-600/90 py-3 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-wait disabled:opacity-60 sm:w-auto sm:px-8"
        >
          {starting ? 'Starting…' : 'Start computer game'}
        </button>
        {message ? <p className="text-sm text-red-300/90">{message}</p> : null}
      </div>
    </section>
  );
}
