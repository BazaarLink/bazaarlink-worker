import WebSocket from "ws";
import { loadConfig, saveConfig } from "./config";
import { runOllamaStream, ChatMessage } from "./ollama";

const HEARTBEAT_MS = 10_000;
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;

let activeJobs = 0;
let reconnectDelay = RECONNECT_BASE_MS;
let shuttingDown = false;
let currentWs: WebSocket | null = null;

// ── Token management ────────────────────────────────────────────────

async function getFreshToken(): Promise<string> {
  const config = loadConfig();
  const now = Math.floor(Date.now() / 1000);

  if (config.tokenExpiresAt - now > 600) return config.token;

  console.log("[auth] Token expiring soon, refreshing...");

  // Try refresh endpoint first
  const refreshRes = await fetch(`${config.gatewayUrl}/auth/worker/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: config.token }),
  });

  if (refreshRes.ok) {
    const { token } = await refreshRes.json() as { token: string };
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    saveConfig({ token, tokenExpiresAt: payload.exp as number });
    return token;
  }

  // Fallback: re-login with workerKey
  console.log("[auth] Refresh failed, re-logging in with worker key...");
  const loginRes = await fetch(`${config.gatewayUrl}/auth/worker/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workerKey: config.workerKey }),
  });

  if (!loginRes.ok) {
    throw new Error("Re-login failed. Please run 'bazaarlink-worker login' again.");
  }

  const { token } = await loginRes.json() as { token: string };
  const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  saveConfig({ token, tokenExpiresAt: payload.exp as number });
  return token;
}

// ── Job handler ────────────────────────────────────────────────────

interface JobAssign {
  type: "job.assign";
  jobId: string;
  model: string;
  messages: ChatMessage[];
  options: Record<string, unknown>;
}

async function handleJob(ws: WebSocket, msg: JobAssign, ollamaUrl: string): Promise<void> {
  const { jobId, model, messages, options } = msg;
  activeJobs++;
  console.log(`[job] ${jobId} started  model=${model} active=${activeJobs}`);

  try {
    const usage = await runOllamaStream(model, messages, options, ollamaUrl, (token, seq) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "job.token", jobId, token, seq }));
      }
    });

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "job.complete", jobId, usage }));
    }
    console.log(`[job] ${jobId} done  prompt=${usage.promptTokens} output=${usage.outputTokens}`);
  } catch (err) {
    const error = (err as Error).message;
    console.error(`[job] ${jobId} error:`, error);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "job.error", jobId, error }));
    }
  } finally {
    activeJobs--;
  }
}

// ── WebSocket loop ─────────────────────────────────────────────────

function connectAndRun(): void {
  if (shuttingDown) return;

  const config = loadConfig();
  const wsUrl = config.gatewayUrl.replace(/^http/, "ws") + "/ws";
  console.log(`[gateway] Connecting ${wsUrl}...`);

  const ws = new WebSocket(wsUrl);
  currentWs = ws;
  let heartbeatTimer: NodeJS.Timeout | null = null;

  ws.on("open", async () => {
    try {
      const token = await getFreshToken();
      ws.send(JSON.stringify({
        type: "worker.hello",
        proto: "wn/1",
        token,
        models: config.models,
        maxConcurrent: config.maxConcurrent,
        inputPricePerM: config.inputPricePerM,
        outputPricePerM: config.outputPricePerM,
      }));
    } catch (err) {
      console.error("[auth]", (err as Error).message);
      ws.close();
    }
  });

  ws.on("message", (raw) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    switch (msg.type) {
      case "welcome":
        reconnectDelay = RECONNECT_BASE_MS;
        console.log("[gateway] Authenticated ✓  waiting for jobs...");
        heartbeatTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "worker.heartbeat", activeJobs }));
          }
        }, HEARTBEAT_MS);
        break;

      case "pong":
        break;

      case "upgrade_required":
        console.error("[gateway] Protocol version mismatch. Please update bazaarlink-worker.");
        shuttingDown = true;
        ws.close();
        process.exit(1);

      case "job.assign":
        handleJob(ws, msg as unknown as JobAssign, config.ollamaUrl);
        break;

      case "job.cancel":
        console.log(`[job] ${msg.jobId} cancelled`);
        break;
    }
  });

  ws.on("close", (code) => {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    currentWs = null;
    if (shuttingDown) return;
    console.log(`[gateway] Disconnected (code=${code}). Reconnecting in ${reconnectDelay / 1000}s...`);
    setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
      connectAndRun();
    }, reconnectDelay);
  });

  ws.on("error", (err) => {
    console.error("[gateway] Error:", err.message);
  });
}

// ── Entry point ────────────────────────────────────────────────────

export async function start(): Promise<void> {
  const config = loadConfig();

  if (config.inputPricePerM === undefined || config.outputPricePerM === undefined) {
    console.error("Error: Pricing not configured. Please re-run 'bazaarlink-worker login' with --input-price and --output-price.");
    process.exit(1);
  }

  console.log("BazaarLink Worker Agent");
  console.log("=======================");
  console.log(`Gateway:     ${config.gatewayUrl}`);
  console.log(`Ollama:      ${config.ollamaUrl}`);
  console.log(`Models:      ${config.models.join(", ")}`);
  console.log(`MaxConc:     ${config.maxConcurrent}`);
  console.log(`Pricing:     input $${config.inputPricePerM}/1M  output $${config.outputPricePerM}/1M`);
  console.log("");

  // Test Ollama reachability
  try {
    const res = await fetch(`${config.ollamaUrl}/api/tags`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log("[ollama] Reachable ✓");
  } catch (err) {
    console.warn(`[ollama] Warning: cannot reach Ollama: ${(err as Error).message}`);
    console.warn("[ollama] Make sure Ollama is running before jobs arrive.\n");
  }

  // Graceful shutdown
  const onSignal = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("\n[gateway] Shutting down gracefully...");
    currentWs?.close(1000, "shutdown");
    setTimeout(() => process.exit(0), 2000);
  };
  process.once("SIGTERM", onSignal);
  process.once("SIGINT", onSignal);

  connectAndRun();
}
