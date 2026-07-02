import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const PISTON_URL = "https://emkc.org/api/v2/piston/execute";

const Input = z.object({
  language: z.string().min(1),
  code: z.string().min(1).max(100000),
});

type RunSuccess = { stdout: string; stderr: string; exitCode: number };
type RunError   = { error: string };
export type RunResult = RunSuccess | RunError;

export const runCodeServer = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<RunResult> => {
    try {
      const res = await fetch(PISTON_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: data.language,
          version: "*",
          files: [{ content: data.code }],
          stdin: "",
          args: [],
          run_timeout: 15000,
          compile_timeout: 15000,
        }),
        signal: AbortSignal.timeout(20000),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        return { error: `Execution server error (${res.status}): ${txt || "unknown error. Try again."}` };
      }

      const result = await res.json() as {
        run?: { stdout?: string; stderr?: string; code?: number; output?: string };
        compile?: { stderr?: string; code?: number };
        message?: string;
      };

      if (result.message) {
        return { error: result.message };
      }

      if (result.compile && (result.compile.code ?? 0) !== 0 && result.compile.stderr) {
        return { error: `Compile error:\n${result.compile.stderr}` };
      }

      return {
        stdout:   result.run?.stdout ?? result.run?.output ?? "",
        stderr:   result.run?.stderr ?? "",
        exitCode: result.run?.code ?? 0,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("timeout") || msg.includes("abort")) {
        return { error: "Execution timed out (20s). Try a shorter program." };
      }
      return { error: `Could not reach execution server: ${msg}` };
    }
  });
