#!/usr/bin/env node
import { Command } from "commander";
import { login } from "./login";
import { start } from "./start";
import { loadConfig } from "./config";

const program = new Command();

program
  .name("bazaarlink-worker")
  .description("BazaarLink Worker Agent — connect your GPU to the BazaarLink network")
  .version("0.1.0");

// ── login ──────────────────────────────────────────────────────────

program
  .command("login")
  .description("Authenticate with the gateway and store credentials")
  .requiredOption("--key <key>", "Your worker key (wk_...)")
  .requiredOption("--gateway <url>", "Gateway URL")
  .option("--models <models>", "Comma-separated supported models", "qwen3-30b-a3b")
  .option("--max-concurrent <n>", "Max concurrent jobs", "4")
  .option("--ollama-url <url>", "Ollama base URL", "http://localhost:11434")
  .action(async (opts) => {
    try {
      await login({
        key: opts.key,
        gateway: opts.gateway,
        models: opts.models,
        maxConcurrent: parseInt(opts.maxConcurrent, 10),
        ollamaUrl: opts.ollamaUrl,
      });
    } catch (err) {
      console.error("Error:", (err as Error).message);
      process.exit(1);
    }
  });

// ── start ──────────────────────────────────────────────────────────

program
  .command("start")
  .description("Start accepting inference jobs from the gateway")
  .action(async () => {
    try {
      await start();
    } catch (err) {
      console.error("Error:", (err as Error).message);
      process.exit(1);
    }
  });

// ── status ─────────────────────────────────────────────────────────

program
  .command("status")
  .description("Show current configuration")
  .action(() => {
    try {
      const config = loadConfig();
      const now = Math.floor(Date.now() / 1000);
      const expiresIn = config.tokenExpiresAt - now;
      const mins = Math.floor(expiresIn / 60);
      const secs = expiresIn % 60;
      console.log("BazaarLink Worker Status");
      console.log("========================");
      console.log(`Gateway:   ${config.gatewayUrl}`);
      console.log(`Models:    ${config.models.join(", ")}`);
      console.log(`MaxConc:   ${config.maxConcurrent}`);
      console.log(`Ollama:    ${config.ollamaUrl}`);
      console.log(`Token:     expires in ${mins}m ${secs}s`);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

program.parse();
