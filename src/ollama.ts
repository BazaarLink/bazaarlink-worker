export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OllamaChunk {
  message?: { role: string; content: string };
  done: boolean;
  eval_count?: number;
  prompt_eval_count?: number;
}

/** Convert gateway model name to Ollama tag format.
 *  e.g. "qwen3-30b-a3b" → "qwen3:30b-a3b" (first hyphen → colon)
 */
function toOllamaModel(model: string): string {
  return model.replace("-", ":");
}

export async function runOllamaStream(
  model: string,
  messages: ChatMessage[],
  options: Record<string, unknown>,
  ollamaUrl: string,
  onToken: (token: string, seq: number) => void,
): Promise<{ promptTokens: number; outputTokens: number }> {
  const ollamaModel = toOllamaModel(model);

  const res = await fetch(`${ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ollamaModel,
      messages,
      stream: true,
      options: {
        temperature: (options.temperature as number) ?? 0.7,
        ...(options.top_p !== undefined && { top_p: options.top_p }),
        ...(options.max_tokens !== undefined && { num_predict: options.max_tokens }),
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Ollama error ${res.status}: ${body}`);
  }

  if (!res.body) throw new Error("No response body from Ollama");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let seq = 0;
  let promptTokens = 0;
  let outputTokens = 0;
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const chunk = JSON.parse(line) as OllamaChunk;
        if (chunk.message?.content) {
          onToken(chunk.message.content, seq++);
        }
        if (chunk.done) {
          promptTokens = chunk.prompt_eval_count ?? 0;
          outputTokens = chunk.eval_count ?? 0;
        }
      } catch {
        // ignore partial JSON lines
      }
    }
  }

  return { promptTokens, outputTokens };
}
