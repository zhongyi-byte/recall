import { readFile } from "node:fs/promises";

export async function readInput(file?: string) {
  if (file) {
    return readFile(file, "utf8");
  }

  if (process.stdin.isTTY) {
    throw new Error("Provide `--file` or pipe content to stdin.");
  }

  return await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
}
