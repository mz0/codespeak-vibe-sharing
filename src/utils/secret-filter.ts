import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const SECRET_PATTERNS =
  /API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|_KEY=|_SECRET=/i;

/** File extensions treated as filterable text content. */
export const FILTERABLE_EXTENSIONS = new Set([
  ".jsonl",
  ".json",
  ".txt",
  ".md",
  ".sh",
]);

/**
 * Read a text file, strip lines containing secret patterns, and write the
 * result to a temp file. Returns the temp file path, or null if the file
 * cannot be read. Returns the original path unchanged when no secrets are found.
 *
 * @param filePath   Absolute path to the source file.
 * @param tmpPrefix  Prefix for the temp directory name (e.g. "claude-filtered").
 * @param tempFiles  Accumulator — the created temp path is pushed here so the
 *                   caller can clean it up later.
 */
export async function filterSecretLines(
  filePath: string,
  tmpPrefix: string,
  tempFiles: string[],
): Promise<string | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n");
    if (!lines.some((line) => SECRET_PATTERNS.test(line))) return filePath;

    const filtered = lines
      .filter((line) => !SECRET_PATTERNS.test(line))
      .join("\n");

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `${tmpPrefix}-`));
    const tmpFile = path.join(tmpDir, path.basename(filePath));
    await fs.writeFile(tmpFile, filtered, "utf-8");
    tempFiles.push(tmpFile);
    return tmpFile;
  } catch {
    return null;
  }
}
