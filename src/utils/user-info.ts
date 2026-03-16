import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Get the user's first name from git config.
 * Returns null if not available. Never throws.
 */
export async function getFirstName(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["config", "user.name"]);
    const fullName = stdout.trim();
    if (!fullName) return null;
    // Take first word as first name
    const firstName = fullName.split(/\s+/)[0];
    return firstName ?? null;
  } catch {
    return null;
  }
}
