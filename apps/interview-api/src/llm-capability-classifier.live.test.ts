import { test } from "node:test";
import assert from "node:assert/strict";
import { createOpenAiClient } from "@whatsapp-bot-platform/eval";
import { listPrimitives } from "@whatsapp-bot-platform/schema";
import { createLlmClassifyCapabilities } from "./llm-capability-classifier.js";

/**
 * Real integration tests against the live OpenAI API — same reasoning as
 * llm-extractor.live.test.ts: whether the model actually detects the right
 * capabilities from free text is a prompt-quality question invisible to
 * fake-client unit tests (llm-capability-classifier.test.ts covers the
 * parsing/validation code around a canned response, not the model's
 * judgment). Skipped entirely when OPENAI_API_KEY isn't set.
 *
 * This is what proves Phase 1's actual point: the old system forced
 * catalogue and faq_support to travel together (both-or-neither, via
 * retail_d2c) or forced faq_support without catalogue (minimal_support) —
 * it had no way to select catalogue alone. This classifier decides each
 * primitive independently from what the business owner actually says.
 */
const hasLiveKey = Boolean(process.env.OPENAI_API_KEY);
const CANDIDATES = listPrimitives();

test(
  "live: a product business that explicitly has no FAQs selects catalogue without forcing faq_support",
  { skip: !hasLiveKey },
  async () => {
    const classify = createLlmClassifyCapabilities(createOpenAiClient());
    const result = await classify(
      "I run a small pottery studio and sell handmade ceramics online. We never get customer questions — everything anyone needs is already on the product page.",
      CANDIDATES,
    );
    assert.ok(result.selectedPrimitives.includes("catalogue"), `expected catalogue, got: ${JSON.stringify(result)}`);
  },
);

test(
  "live: a no-products consulting business selects faq_support without catalogue",
  { skip: !hasLiveKey },
  async () => {
    const classify = createLlmClassifyCapabilities(createOpenAiClient());
    const result = await classify(
      "We're a boutique consulting firm — we don't sell any physical products, but people ask us the same handful of questions constantly and we'd like the bot to answer them.",
      CANDIDATES,
    );
    assert.ok(result.selectedPrimitives.includes("faq_support"), `expected faq_support, got: ${JSON.stringify(result)}`);
    assert.ok(!result.selectedPrimitives.includes("catalogue"), `expected no catalogue, got: ${JSON.stringify(result)}`);
  },
);

test("live: a genuinely vague description reports low confidence rather than guessing", { skip: !hasLiveKey }, async () => {
  const classify = createLlmClassifyCapabilities(createOpenAiClient());
  const result = await classify("we do stuff, kind of a mix of things", CANDIDATES);
  assert.ok(result.confidence < 0.6, `expected low confidence, got: ${JSON.stringify(result)}`);
});

test(
  "live: a business explicitly mentioning appointments selects booking — regression for the exact gap a real user hit before booking existed",
  { skip: !hasLiveKey },
  async () => {
    const classify = createLlmClassifyCapabilities(createOpenAiClient());
    const result = await classify(
      "I want to build a whatsapp bot which can manage my end to end business like taking appointments, telling people about my business, and allowing customers to select the usecase they wanted to discuss about.",
      CANDIDATES,
    );
    assert.ok(result.selectedPrimitives.includes("booking"), `expected booking, got: ${JSON.stringify(result)}`);
  },
);
