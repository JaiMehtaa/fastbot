export interface OpenRouterChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenRouterChatOptions {
  model: string;
  messages: readonly OpenRouterChatMessage[];
  temperature?: number;
  responseFormat?: { type: "json_schema"; json_schema: Record<string, unknown> };
}

export interface OpenRouterClient {
  chat(options: OpenRouterChatOptions): Promise<{ content: string }>;
}

export class OpenRouterClientError extends Error {}

/**
 * Thin adapter over OpenRouter's chat completions API — the one LLM provider
 * used across the system (see docs/architecture.md, "Knowledge Strategy &
 * Confidence/Eval Layer"). Every real generate()/score() function passed to
 * generateWithConfidence() should eventually call through this, but the
 * orchestrator itself never depends on it directly — that's what keeps
 * generateWithConfidence() unit-testable without a live API key.
 *
 * Fails at construction time (not on first call) if no key is available, so
 * a missing OPENROUTER_API_KEY surfaces immediately at process startup
 * rather than deep into a user's first interview turn.
 */
export function createOpenRouterClient(config: { apiKey?: string } = {}): OpenRouterClient {
  const apiKey = config.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new OpenRouterClientError(
      "OPENROUTER_API_KEY is not set. Every LLM call site in this system (interview extraction, " +
        "faq_support fallback, LOB classification) goes through this one client.",
    );
  }

  return {
    async chat(options: OpenRouterChatOptions): Promise<{ content: string }> {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: options.model,
          messages: options.messages,
          temperature: options.temperature,
          response_format: options.responseFormat,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new OpenRouterClientError(`OpenRouter request failed (${response.status}): ${body}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        throw new OpenRouterClientError("OpenRouter response missing choices[0].message.content");
      }
      return { content };
    },
  };
}
