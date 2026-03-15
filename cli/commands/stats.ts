import { Command } from "commander";

import { apiRequest } from "../lib/client.js";

export function createStatsCommand() {
  return new Command("stats")
    .description("Show high-level review stats")
    .action(async () => {
      const payload = await apiRequest<{ stats: {
        dueToday: number;
        completedToday: number;
        streak: number;
        retention: number;
        totalCards: number;
      } }>("/api/stats");
      const stats = payload.stats;

      console.log(`Due today: ${stats.dueToday}`);
      console.log(`Completed today: ${stats.completedToday}`);
      console.log(`Streak: ${stats.streak}`);
      console.log(`Retention: ${stats.retention}%`);
      console.log(`Total cards: ${stats.totalCards}`);
    });
}
