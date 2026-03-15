#!/usr/bin/env node

import { Command } from "commander";

import { createAddCommand } from "../commands/add.js";
import { createCardsCommand } from "../commands/cards.js";
import { createConfigCommand } from "../commands/config.js";
import { createDecksCommand } from "../commands/decks.js";
import { createImportAnkiCommand, createImportCommand } from "../commands/import.js";
import { createStatsCommand } from "../commands/stats.js";

const program = new Command();

program
  .name("recall")
  .description("Recall CLI")
  .showHelpAfterError();

program.addCommand(createConfigCommand());
program.addCommand(createImportCommand());
program.addCommand(createImportAnkiCommand());
program.addCommand(createAddCommand());
program.addCommand(createCardsCommand());
program.addCommand(createDecksCommand());
program.addCommand(createStatsCommand());

program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
