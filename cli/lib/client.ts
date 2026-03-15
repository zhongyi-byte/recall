import fetch from "node-fetch";

import { loadConfig } from "./config.js";

export async function apiRequest<T>(pathname: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const config = await loadConfig();
  if (!config) {
    throw new Error("Run `recall config --url <api-url> --key <api-key>` first.");
  }

  const response = await fetch(new URL(pathname, config.url), {
    method: init?.method ?? "GET",
    headers: {
      authorization: `Bearer ${config.key}`,
      "content-type": "application/json"
    },
    body: init?.body ? JSON.stringify(init.body) : undefined
  });

  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMessage =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "Request failed";
    throw new Error(errorMessage);
  }

  return payload as T;
}
