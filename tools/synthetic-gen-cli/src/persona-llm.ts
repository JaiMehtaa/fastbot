import type { OpenAiClient } from "@whatsapp-bot-platform/eval";
import type { RenderPersonaFn, SimulatePersonaTurnFn } from "@whatsapp-bot-platform/synthetic-gen";

const MODEL = "gpt-4o-mini";

const STYLE_GUIDANCE: Record<string, string> = {
  clean: "Answer clearly and directly, giving exactly the information asked for.",
  verbose: "Ramble a little — include some irrelevant context before getting to the actual answer.",
  terse: "Answer in as few words as possible, sometimes just a fragment.",
  ambiguous: "Be vague enough that a couple of different interpretations are plausible.",
  contradictory: "State something, then partway through correct or contradict yourself.",
};

/**
 * Turns a structured ground-truth DraftConfig into messy natural-language
 * material — the ONE real OpenAI call in the render step. The simulator
 * below only ever reads this text, never the structured groundTruth, which
 * is what forces the real interview agent under test to do genuine
 * extraction rather than being fed a structured answer key in disguise
 * (see packages/synthetic-gen/src/persona.ts's own docstring).
 */
export function createLlmRenderPersona(client: OpenAiClient): RenderPersonaFn {
  return async ({ groundTruth, style }) => {
    const response = await client.chat({
      model: MODEL,
      temperature: 0.8,
      messages: [
        {
          role: "user",
          content:
            `You are the owner of a small business, about to describe it informally, as if chatting with someone — ` +
            `not filling out a form. Here is the ground truth about your business (for your reference only — do NOT ` +
            `repeat it verbatim, field names, or JSON structure):\n\n${JSON.stringify(groundTruth.fieldValues, null, 2)}\n\n` +
            `Style: ${STYLE_GUIDANCE[style] ?? style}\n\n` +
            `Write 2-4 sentences of natural, informal spoken-style material covering what your business does, as this ` +
            `business owner would actually say it out loud. No lists, no labels, no JSON.`,
        },
      ],
    });
    return response.content.trim();
  };
}

/**
 * One turn of the synthetic "business owner" answering whatever the real
 * interview agent just asked — grounded only in the rendered material and
 * prior turns, never the structured ground truth (same reasoning as above).
 */
export function createLlmSimulatePersonaTurn(client: OpenAiClient): SimulatePersonaTurnFn {
  return async ({ profile, question, history }) => {
    const historyText = history.map((turn) => `Bot asked: ${turn.question}\nYou said: ${turn.answer}`).join("\n\n");
    const response = await client.chat({
      model: MODEL,
      temperature: 0.7,
      messages: [
        {
          role: "user",
          content:
            `You are a small business owner texting with a WhatsApp bot-setup assistant. Here's what you'd say about ` +
            `your business if asked (this is everything you know — don't invent details beyond it):\n\n"${profile.material}"\n\n` +
            (historyText ? `Conversation so far:\n${historyText}\n\n` : "") +
            `Style: ${STYLE_GUIDANCE[profile.style] ?? profile.style}\n\n` +
            `The assistant just asked: "${question}"\n\n` +
            `Reply as this business owner would over WhatsApp — short, casual, one message. If the question asks ` +
            `about something you have no material for (e.g. a website you don't have), say so naturally rather than ` +
            `inventing an answer.`,
        },
      ],
    });
    return response.content.trim();
  };
}
