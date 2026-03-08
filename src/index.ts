#!/usr/bin/env node
import { Command } from "commander";
import { login } from "./login";
import { register } from "./register";
import { start } from "./start";
import { loadConfig } from "./config";

const program = new Command();

program
  .name("bazaarlink-worker")
  .description("BazaarLink Worker Agent — connect your GPU to the BazaarLink network")
  .version("0.1.0");

// ── register ────────────────────────────────────────────────────────

program
  .command("register")
  .description("Self-register as a worker node (sends verification email)")
  .requiredOption("--email <email>", "Your BazaarLink account email")
  .option("--site <url>", "BazaarLink site URL", "https://bazaarlink.ai")
  .option("--models <models>", "Comma-separated models to support", "qwen3.5:2b")
  .option("--max-concurrent <n>", "Max concurrent jobs (1–6)", "4")
  .action(async (opts) => {
    try {
      const maxConcurrent = parseInt(opts.maxConcurrent, 10);
      if (isNaN(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 6) {
        console.error("Error: --max-concurrent must be between 1 and 6.");
        process.exit(1);
      }
      await register({
        email: opts.email,
        siteUrl: opts.site,
        models: opts.models,
        maxConcurrent,
      });
    } catch (err) {
      console.error("Error:", (err as Error).message);
      process.exit(1);
    }
  });

// ── login ──────────────────────────────────────────────────────────

program
  .command("login")
  .description("Authenticate with the gateway and store credentials")
  .requiredOption("--key <key>", "Your worker key (wk_...)")
  .requiredOption("--gateway <url>", "Gateway URL")
  .option("--models <models>", "Comma-separated supported models", "qwen3.5:2b")
  .option("--max-concurrent <n>", "Max concurrent jobs (1–6)", "4")
  .option("--ollama-url <url>", "Ollama base URL", "http://localhost:11434")
  .requiredOption("--input-price <usd>", "Your cost per 1M prompt tokens in USD (e.g. 0.10)")
  .requiredOption("--output-price <usd>", "Your cost per 1M completion tokens in USD (e.g. 0.20)")
  .action(async (opts) => {
    try {
      const maxConcurrent = parseInt(opts.maxConcurrent, 10);
      if (isNaN(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 6) {
        console.error("Error: --max-concurrent must be between 1 and 6.");
        process.exit(1);
      }
      const inputPricePerM = parseFloat(opts.inputPrice);
      const outputPricePerM = parseFloat(opts.outputPrice);
      if (isNaN(inputPricePerM) || inputPricePerM < 0) {
        console.error("Error: --input-price must be a non-negative number.");
        process.exit(1);
      }
      if (isNaN(outputPricePerM) || outputPricePerM < 0) {
        console.error("Error: --output-price must be a non-negative number.");
        process.exit(1);
      }
      await login({
        key: opts.key,
        gateway: opts.gateway,
        models: opts.models,
        maxConcurrent,
        ollamaUrl: opts.ollamaUrl,
        inputPricePerM,
        outputPricePerM,
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
