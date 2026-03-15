import { Command } from "commander";

import { getConfigPath, loadConfig, saveConfig } from "../lib/config.js";

export function createConfigCommand() {
  return new Command("config")
    .description("Configure API URL and key")
    .option("--url <url>", "Recall API base URL")
    .option("--key <key>", "Recall API key")
    .action(async (options) => {
      if (options.url && options.key) {
        await saveConfig({
          url: options.url,
          key: options.key
        });
        console.log(`Saved config to ${getConfigPath()}`);
        return;
      }

      const config = await loadConfig();
      if (!config) {
        console.log("No config saved yet.");
        return;
      }

      console.log(`URL: ${config.url}`);
      console.log(`Key: ${"*".repeat(Math.max(config.key.length - 4, 0))}${config.key.slice(-4)}`);
      console.log(`Path: ${getConfigPath()}`);
    });
}
