"use client";
import NavigationBar from "@/components/NavigationBar";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function TrainerComputerPage() {
  const router = useRouter();
  const [bot, setBot] = useState("Cardi Bot");
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState("");

  const startBotGame = async () => {
    setStarting(true);
    setMessage("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setMessage("Please sign in to start a bot game.");
        return;
      }
      const res = await fetch("/api/bot/game/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ bot }),
      });
      const payload = (await res.json().catch(() => ({}))) as { game?: { id?: string }; error?: string };
      if (!res.ok || !payload.game?.id) {
        setMessage(payload.error || "Could not start bot game.");
        return;
      }
      router.push(`/game/${payload.game.id}`);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      <NavigationBar />

      <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col gap-6">
        <h1 className="text-3xl font-bold">PLAY COMPUTER</h1>

        <div className="bg-[#161b22] rounded-2xl p-5 flex flex-col gap-4">
          <div>
            <p className="text-sm text-gray-400 mb-2">Select Bot</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setBot("Cardi Bot")}
                className={`px-4 py-3 rounded-lg text-left ${bot === "Cardi Bot" ? "bg-[#2b3138]" : "bg-[#21262d]"}`}
              >
                Cardi Bot
              </button>
              <button
                onClick={() => setBot("Aggro Bot")}
                className={`px-4 py-3 rounded-lg text-left ${bot === "Aggro Bot" ? "bg-[#2b3138]" : "bg-[#21262d]"}`}
              >
                Aggro Bot
              </button>
              <button
                onClick={() => setBot("Endgame Bot")}
                className={`px-4 py-3 rounded-lg text-left ${bot === "Endgame Bot" ? "bg-[#2b3138]" : "bg-[#21262d]"}`}
              >
                Endgame Bot
              </button>
            </div>
          </div>

          <div>
            <p className="text-sm text-gray-400 mb-2">Time Control</p>
            <div className="flex flex-wrap gap-2">
              <button className="px-4 py-2 rounded-lg bg-[#21262d]">3m</button>
              <button className="px-4 py-2 rounded-lg bg-[#21262d]">5m</button>
              <button className="px-4 py-2 rounded-lg bg-[#21262d]">10m</button>
            </div>
          </div>

          <div className="flex flex-col gap-2 text-sm text-gray-300">
            <label className="flex items-center gap-2">
              <input type="checkbox" />
              Allow Takebacks
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" />
              Hints
            </label>
          </div>

          <button
            onClick={startBotGame}
            disabled={starting}
            className="w-full py-4 bg-[#21262d] rounded-xl text-lg font-semibold hover:bg-[#2b3138] transition"
          >
            {starting ? "STARTING..." : "START BOT GAME"}
          </button>
          {message ? <p className="text-sm text-red-300">{message}</p> : null}
        </div>
      </div>
    </div>
  );
}
