import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const PISTON_URL = "https://emkc.org/api/v2/piston";

const Input = z.object({
  language: z.string().min(1),
  code: z.string().min(1).max(100000),
});

type RunSuccess = { stdout: string; stderr: string; exitCode: number };
type RunError   = { error: string };
type RunResult  = RunSuccess | RunError;

export const runCodeServer = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<RunResult> => {
    try {
      // Fetch available runtimes to get the correct version
      const rtRes = await fetch(`${PISTON_URL}/runtimes`, {
        headers: { "Content-Type": "application/json" },
      });
      if (!rtRes.ok) {
        return { error: `Execution server unavailable (${rtRes.status}). Try again shortly.` };
      }
      const runtimes = await rtRes.json() as Array<{ language: string; version: string; aliases: string[] }>;

      // Find matching runtime (by language name or alias)
      const lang = data.language.toLowerCase();
      const rt = runtimes.find(r =>
        r.language === lang || r.aliases?.includes(lang)
      );
      if (!rt) {
        return { error: `Language "${data.language}" is not available on the execution server.` };
      }

      const execRes = await fetch(`${PISTON_URL}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: rt.language,
          version: rt.version,
          files: [{ content: data.code }],
          stdin: "",
          args: [],
          run_timeout: 10000,
          compile_timeout: 10000,
          compile_memory_limit: -1,
          run_memory_limit: -1,
        }),
      });

      if (!execRes.ok) {
        const txt = await execRes.text().catch(() => "");
        return { error: `Execution failed (${execRes.status}): ${txt || "unknown error"}` };
      }

      const result = await execRes.json() as {
        run?: { stdout?: string; stderr?: string; code?: number; output?: string };
        compile?: { stderr?: string; stdout?: string; code?: number };
      };

      if (result.compile && result.compile.code !== 0 && result.compile.stderr) {
        return { error: `Compile error:\n${result.compile.stderr}` };
      }

      return {
        stdout:   result.run?.stdout ?? result.run?.output ?? "",
        stderr:   result.run?.stderr ?? "",
        exitCode: result.run?.code ?? 0,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { error: `Could not reach execution server: ${msg}` };
    }
  });
