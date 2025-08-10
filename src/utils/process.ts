import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export async function runCommand(command: string, args: string[], options?: { cwd?: string; timeoutMs?: number; env?: Record<string, string>; }): Promise<{ stdout: string; stderr: string; exitCode: number; }> {
  const fullCommand = `"${command}" ${args.map(arg => `"${arg}"`).join(' ')}`;
  
  try {
    const { stdout, stderr } = await execAsync(fullCommand, {
      cwd: options?.cwd,
      env: { ...process.env, ...options?.env },
      timeout: options?.timeoutMs,
      encoding: 'utf8',
    });
    
    return { stdout, stderr, exitCode: 0 };
  } catch (err: any) {
    const stdout = err.stdout?.toString?.() ?? "";
    const stderr = err.stderr?.toString?.() ?? (err.message || "");
    const exitCode = typeof err.code === "number" ? err.code : 1;
    throw new Error(`Command failed (${command} ${args.join(" ")}): code=${exitCode}\nSTDERR: ${stderr}\nSTDOUT: ${stdout}`);
  }
}