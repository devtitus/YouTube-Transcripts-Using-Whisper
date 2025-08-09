import { execa } from "execa";

export async function runCommand(command: string, args: string[], options?: { cwd?: string; timeoutMs?: number; env?: Record<string, string>; }): Promise<{ stdout: string; stderr: string; exitCode: number; }>
{
  const subprocess = execa(command, args, {
    cwd: options?.cwd,
    env: options?.env,
    timeout: options?.timeoutMs,
    all: false,
  });

  try {
    const { stdout, stderr, exitCode } = await subprocess;
    return { stdout, stderr, exitCode: exitCode ?? 0 };
  } catch (err: any) {
    const stdout = err.stdout?.toString?.() ?? "";
    const stderr = err.stderr?.toString?.() ?? (err.shortMessage || err.message || "");
    const exitCode = typeof err.exitCode === "number" ? err.exitCode : 1;
    throw new Error(`Command failed (${command} ${args.join(" ")}): code=${exitCode}\nSTDERR: ${stderr}\nSTDOUT: ${stdout}`);
  }
}
