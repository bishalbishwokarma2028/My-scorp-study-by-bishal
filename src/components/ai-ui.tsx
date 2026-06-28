import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { askAI } from "@/lib/aiProvider";

export function AiThinking({ label = "ScorpStudy AI is thinking..." }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin text-primary" /> {label}
    </div>
  );
}

export function ProviderBadge({ provider }: { provider: string | null }) {
  if (!provider || provider === "none") return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
      <span className="h-1.5 w-1.5 rounded-full bg-success" />
      {provider}
    </span>
  );
}

export function useDailyTip() {
  const [tip, setTip] = useState<string>("");
  useEffect(() => {
    const today = new Date().toDateString();
    const cached = localStorage.getItem("scorpstudy_daily_tip");
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.day === today) { setTip(parsed.tip); return; }
    }
    askAI("Give me one short, actionable study tip for college students. One sentence only, no preamble.").then((r) => {
      setTip(r.text);
      localStorage.setItem("scorpstudy_daily_tip", JSON.stringify({ day: today, tip: r.text }));
    });
  }, []);
  return tip;
}
