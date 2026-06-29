import { useEffect, useState } from "react";
import { askAI } from "@/lib/aiProvider";

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
