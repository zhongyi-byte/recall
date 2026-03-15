import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type RecallCliConfig = {
  url: string;
  key: string;
};

const CONFIG_DIR = path.join(os.homedir(), ".config", "recall");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

export async function loadConfig(): Promise<RecallCliConfig | null> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    if (typeof parsed.url !== "string" || typeof parsed.key !== "string") {
      return null;
    }
    return {
      url: parsed.url,
      key: parsed.key
    };
  } catch {
    return null;
  }
}

export async function saveConfig(config: RecallCliConfig) {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function getConfigPath() {
  return CONFIG_PATH;
}
