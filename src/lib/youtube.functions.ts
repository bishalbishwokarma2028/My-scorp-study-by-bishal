import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { serverConfig } from "./config";

const YoutubeInput = z.object({
  url: z.string().min(1).max(500),
});

export type YoutubeResult = {
  videoId: string;
  title: string;
  transcript: string | null;
  researchContext: string | null;
  source: "transcript" | "research" | "none";
};

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = url.trim().match(p);
    if (m) return m[1];
  }
  return null;
}

async function fetchVideoTitle(videoId: string): Promise<string> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return "YouTube Video";
    const data = await res.json() as { title?: string };
    return data.title || "YouTube Video";
  } catch {
    return "YouTube Video";
  }
}

async function fetchTranscriptFromPage(videoId: string): Promise<string | null> {
  try {
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!pageRes.ok) return null;
    const html = await pageRes.text();

    // Extract caption tracks from page JSON
    const captionMatch = html.match(/"captionTracks":(\[.*?\}(?:\s*,\s*\{.*?\})*\])/);
    if (!captionMatch) return null;

    let tracks: Array<{ baseUrl: string; languageCode: string }>;
    try {
      tracks = JSON.parse(captionMatch[1]);
    } catch {
      return null;
    }
    if (!tracks?.length) return null;

    const track =
      tracks.find((t) => t.languageCode === "en") ||
      tracks.find((t) => t.languageCode?.startsWith("en")) ||
      tracks[0];

    if (!track?.baseUrl) return null;

    const sep = track.baseUrl.includes("?") ? "&" : "?";
    const transcriptRes = await fetch(`${track.baseUrl}${sep}fmt=json3`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!transcriptRes.ok) return null;

    const transcriptData = await transcriptRes.json() as {
      events?: Array<{ segs?: Array<{ utf8: string }> }>;
    };

    const text = (transcriptData.events || [])
      .filter((e) => e.segs)
      .map((e) => e.segs!.map((s) => s.utf8 || "").join(""))
      .join(" ")
      .replace(/\[.*?\]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    return text.length > 200 ? text.slice(0, 18000) : null;
  } catch {
    return null;
  }
}

async function researchVideo(title: string, tavilyKey?: string, serperKey?: string): Promise<string | null> {
  const query = `${title} lecture summary key points transcript`;

  if (tavilyKey) {
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: tavilyKey,
          query,
          search_depth: "advanced",
          include_answer: true,
          max_results: 6,
        }),
        signal: AbortSignal.timeout(14000),
      });
      if (res.ok) {
        const data = await res.json() as {
          answer?: string;
          results?: { title: string; content: string }[];
        };
        const parts: string[] = [];
        if (data.answer) parts.push(data.answer);
        data.results?.slice(0, 4).forEach((r) => parts.push(`${r.title}: ${r.content.slice(0, 600)}`));
        const ctx = parts.join("\n\n");
        if (ctx.length > 200) return ctx;
      }
    } catch { /* fallthrough */ }
  }

  if (serperKey) {
    try {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": serperKey },
        body: JSON.stringify({ q: query, num: 6 }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json() as {
          answerBox?: { snippet?: string };
          organic?: { title: string; snippet: string }[];
        };
        const parts: string[] = [];
        if (data.answerBox?.snippet) parts.push(data.answerBox.snippet);
        data.organic?.slice(0, 4).forEach((r) => parts.push(`${r.title}: ${r.snippet}`));
        const ctx = parts.join("\n\n");
        if (ctx.length > 200) return ctx;
      }
    } catch { /* fallthrough */ }
  }

  return null;
}

export const fetchYouTubeServer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => YoutubeInput.parse(d))
  .handler(async ({ data }): Promise<YoutubeResult> => {
    const videoId = extractVideoId(data.url);
    if (!videoId) {
      return { videoId: "", title: "", transcript: null, researchContext: null, source: "none" };
    }

    const [title, transcript] = await Promise.all([
      fetchVideoTitle(videoId),
      fetchTranscriptFromPage(videoId),
    ]);

    if (transcript) {
      return { videoId, title, transcript, researchContext: null, source: "transcript" };
    }

    // Fallback: use Tavily/Serper to research the video topic
    const researchContext = await researchVideo(
      title,
      serverConfig.search.tavilyKey || undefined,
      serverConfig.search.serperKey || undefined,
    );

    return {
      videoId,
      title,
      transcript: null,
      researchContext,
      source: researchContext ? "research" : "none",
    };
  });
