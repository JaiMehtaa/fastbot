import type { BspAdapter, SendResult } from "./bsp-adapter.js";
import type { WhatsAppOutboundMessage } from "./whatsapp-payload.js";

export class ThreeSixtyDialogError extends Error {}

const DEFAULT_BASE_URL = "https://waba-v2.360dialog.io";

export interface ThreeSixtyDialogConfig {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Real BspAdapter backed by 360dialog's Cloud-API-compatible integration
 * (docs/architecture.md, "BSP Recommendation"): 360dialog deliberately
 * mirrors Meta's own Cloud API request/response shape almost 1:1, which is
 * why WhatsAppOutboundMessage — built directly against Meta's payload shape
 * — can be POSTed here completely unchanged. Only the auth header
 * (D360-API-KEY vs. Meta's Bearer token) differs from a direct Meta Tech
 * Provider integration, which is the whole point of outsourcing to a BSP.
 *
 * `fetchImpl` is injected (same DI discipline as every other I/O boundary
 * in this codebase) so send() is unit-testable without a live 360dialog
 * account. Fails at construction time, not on first send(), if no key is
 * available — matches createOpenRouterClient's fail-loud pattern.
 */
export function createThreeSixtyDialogAdapter(config: ThreeSixtyDialogConfig = {}): BspAdapter {
  const apiKey = config.apiKey ?? process.env.THREE_SIXTY_DIALOG_API_KEY;
  if (!apiKey) {
    throw new ThreeSixtyDialogError(
      "THREE_SIXTY_DIALOG_API_KEY is not set. The real WhatsApp BSP adapter needs a 360dialog channel API key.",
    );
  }
  const baseUrl = config.baseUrl ?? process.env.THREE_SIXTY_DIALOG_BASE_URL ?? DEFAULT_BASE_URL;
  const fetchImpl = config.fetchImpl ?? fetch;

  return {
    async send(message: WhatsAppOutboundMessage): Promise<SendResult> {
      const response = await fetchImpl(`${baseUrl}/messages`, {
        method: "POST",
        headers: {
          "D360-API-KEY": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new ThreeSixtyDialogError(`360dialog send failed (${response.status}): ${body}`);
      }

      const data = (await response.json()) as { messages?: Array<{ id?: string }> };
      const messageId = data.messages?.[0]?.id;
      if (typeof messageId !== "string") {
        throw new ThreeSixtyDialogError("360dialog response missing messages[0].id");
      }
      return { messageId };
    },
  };
}
