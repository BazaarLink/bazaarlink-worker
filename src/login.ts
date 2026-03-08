import { saveConfig } from "./config";

export interface LoginOptions {
  key: string;
  gateway: string;
  models: string;
  maxConcurrent: number;
  ollamaUrl: string;
  inputPricePerM?: number;
  outputPricePerM?: number;
}

export async function login(opts: LoginOptions): Promise<void> {
  const gatewayUrl = opts.gateway.replace(/\/$/, "");
  console.log(`Connecting to gateway: ${gatewayUrl}`);

  const res = await fetch(`${gatewayUrl}/auth/worker/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workerKey: opts.key }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`Login failed: ${(data as Record<string,string>).error ?? res.statusText}`);
  }

  const { token } = await res.json() as { token: string };

  // Decode JWT expiry (no verification needed here — gateway already validated)
  const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());

  saveConfig({
    gatewayUrl,
    workerKey: opts.key,
    token,
    tokenExpiresAt: payload.exp as number,
    models: opts.models.split(",").map((m) => m.trim()).filter(Boolean),
    maxConcurrent: opts.maxConcurrent,
    ollamaUrl: opts.ollamaUrl,
    ...(opts.inputPricePerM !== undefined && { inputPricePerM: opts.inputPricePerM }),
    ...(opts.outputPricePerM !== undefined && { outputPricePerM: opts.outputPricePerM }),
  });

  console.log("✓ Login successful! Credentials stored at ~/.bazaarlink/config.json");
  console.log(`  Gateway: ${gatewayUrl}`);
  console.log(`  Models:  ${opts.models}`);
  console.log(`  Token expires: ${new Date(payload.exp * 1000).toLocaleString()}`);
  console.log("");
  console.log("Run 'bazaarlink-worker start' to begin accepting jobs.");
}
