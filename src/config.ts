import fs from "fs";
import path from "path";
import os from "os";

export interface Config {
  gatewayUrl: string;
  workerKey: string;
  token: string;
  tokenExpiresAt: number; // Unix timestamp (seconds)
  models: string[];
  maxConcurrent: number;
  ollamaUrl: string;
}

const CONFIG_DIR = path.join(os.homedir(), ".bazaarlink");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

export function loadConfig(): Config {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      "Not logged in. Run: bazaarlink-worker login --key wk_xxx --gateway https://..."
    );
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as Config;
}

export function saveConfig(config: Partial<Config>): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  let existing: Partial<Config> = {};
  if (fs.existsSync(CONFIG_PATH)) {
    existing = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ ...existing, ...config }, null, 2));
}
