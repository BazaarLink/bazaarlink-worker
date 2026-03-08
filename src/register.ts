export interface RegisterOptions {
  email: string;
  siteUrl: string;
  models: string;
  maxConcurrent: number;
}

export async function register(opts: RegisterOptions): Promise<void> {
  const site = opts.siteUrl.replace(/\/$/, "");
  const models = opts.models.split(",").map((m) => m.trim()).filter(Boolean);

  console.log(`Registering with BazaarLink: ${site}`);
  console.log(`  Email:         ${opts.email}`);
  console.log(`  Models:        ${models.join(", ")}`);
  console.log(`  MaxConcurrent: ${opts.maxConcurrent}`);
  console.log("");

  const res = await fetch(`${site}/api/worker/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: opts.email, models, maxConcurrent: opts.maxConcurrent }),
  });

  const data = await res.json().catch(() => ({})) as Record<string, string>;

  if (!res.ok) {
    throw new Error(data.error ?? `Registration failed (HTTP ${res.status})`);
  }

  console.log("✓ Verification email sent!");
  console.log("  Check your inbox and click the link within 10 minutes.");
  console.log("");
  console.log("After verifying, run:");
  console.log(`  bazaarlink-worker login --key wk_... --gateway <GATEWAY_URL> --models ${opts.models}`);
  console.log(`  bazaarlink-worker start`);
}
