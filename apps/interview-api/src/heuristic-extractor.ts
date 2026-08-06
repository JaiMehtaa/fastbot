import { getPrimitive } from "@whatsapp-bot-platform/schema";
import type { FieldDefinition, MissingField } from "@whatsapp-bot-platform/shared-types";
import type { ExtractFieldsFn, FieldExtraction } from "./field-extractor.js";

function findFieldDefinition(missingField: MissingField): FieldDefinition | undefined {
  const schema = getPrimitive(missingField.primitiveKey);
  return [...schema.requiredFields, ...schema.optionalFields].find((f) => f.key === missingField.fieldKey);
}

interface Candidate {
  value: unknown;
  confidence: number;
  reason?: string;
}

// Anchored to the start: "we're called Meadow Soaps" stacks two trigger
// phrases ("we're" then "called"), and an unanchored pattern only strips
// whichever one the engine happens to match first, leaving the other in the
// captured remainder. stripNameTriggers() re-applies this until none match.
const NAME_TRIGGER_PATTERN = /^(?:we'?re|i'?m|this is|it'?s|called|named|our business is|business is)\s+(.+)$/i;

function stripNameTriggers(text: string): string {
  let result = text;
  for (let i = 0; i < 3; i++) {
    const match = NAME_TRIGGER_PATTERN.exec(result);
    if (!match?.[1]) break;
    result = match[1].trim().replace(/[.!]+$/, "");
  }
  return result;
}

function extractScalar(field: FieldDefinition, text: string): Candidate | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const stripped = stripNameTriggers(trimmed);
  if (stripped && stripped !== trimmed) {
    return { value: stripped, confidence: 0.85 };
  }

  // fallback: use the whole message. "string" fields are meant to be short
  // (names, titles) so only fall back when the message itself is short;
  // "text"/"phone" fields can reasonably be the whole message.
  if (field.type === "string" && trimmed.split(/\s+/).length <= 6) {
    return { value: trimmed, confidence: 0.6 };
  }
  if (field.type === "text" || field.type === "phone") {
    return { value: trimmed, confidence: 0.65 };
  }
  return null;
}

const TIME_RANGE_PATTERN = /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|to|–)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i;
const DAY_WORD_PATTERN = /\b(mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|daily|everyday|weekday|weekend)\b/i;

function extractWeeklyHours(text: string): Candidate | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const timeMatch = TIME_RANGE_PATTERN.exec(trimmed);
  if (timeMatch) {
    const dayMatch = DAY_WORD_PATTERN.exec(trimmed);
    const key = dayMatch ? dayMatch[1].toLowerCase() : "hours";
    return { value: { [key]: `${timeMatch[1]}-${timeMatch[2]}` }, confidence: 0.8 };
  }

  if (/\b(closed|24\/7|always open|not open)\b/i.test(trimmed)) {
    return { value: { note: trimmed }, confidence: 0.7 };
  }

  return null;
}

const URL_PATTERN = /https?:\/\/\S+/i;

function extractUrl(text: string): Candidate | null {
  const match = URL_PATTERN.exec(text);
  return match ? { value: match[0].replace(/[.,)]+$/, ""), confidence: 0.9 } : null;
}

function extractBoolean(text: string): Candidate | null {
  const normalized = text.trim().toLowerCase();
  if (/^(yes|yeah|yep|true|sure|correct)\b/.test(normalized)) return { value: true, confidence: 0.85 };
  if (/^(no|nope|false|not really|nah)\b/.test(normalized)) return { value: false, confidence: 0.85 };
  return null;
}

// The colon after each label is mandatory (not optional) — with a lazy
// capture group ahead of it, an optional colon lets the engine match on any
// stray "a" inside the question text itself (e.g. the "a" in "soaps"),
// truncating the question well before the real "A:" label further along.
const QA_LABELED_PATTERN = /^\s*q(?:uestion)?\s*:\s*(.+?)\s*a(?:nswer)?\s*:\s*(.+)\s*$/i;

function extractQaShapedItem(first: FieldDefinition, second: FieldDefinition, text: string): Candidate | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const labeled = QA_LABELED_PATTERN.exec(trimmed);
  if (labeled?.[1] && labeled[2]) {
    return { value: [{ [first.key]: labeled[1].trim(), [second.key]: labeled[2].trim() }], confidence: 0.85 };
  }

  // fallback: split on the first "?" — text up to and including it is the
  // first field, whatever follows is the second
  const questionMarkIndex = trimmed.indexOf("?");
  if (questionMarkIndex !== -1 && questionMarkIndex < trimmed.length - 1) {
    return {
      value: [
        {
          [first.key]: trimmed.slice(0, questionMarkIndex + 1).trim(),
          [second.key]: trimmed.slice(questionMarkIndex + 1).trim(),
        },
      ],
      confidence: 0.65,
    };
  }

  return null;
}

// A message that's nothing but a URL (no name text alongside it) is a real,
// common case — a user pasting a product link on its own, expecting to be
// asked for a name next turn rather than silently stuck. Deriving a rough
// name from the URL itself (last path segment, humanized) means it still
// commits — at lower confidence, since it's a guess, not what they said.
function deriveNameFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    const raw = last ? last.replace(/\.\w+$/, "") : parsed.hostname.replace(/^www\./, "");
    const humanized = raw
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return humanized || null;
  } catch {
    return null;
  }
}

function extractNameAndLinkItem(nameField: FieldDefinition, urlField: FieldDefinition, text: string): Candidate | null {
  const urlMatch = URL_PATTERN.exec(text);
  if (!urlMatch) return null;

  const url = urlMatch[0].replace(/[.,)]+$/, "");
  // "Name, https://..." leaves a trailing separator comma on the name after
  // the URL itself is stripped out — trim() only removes whitespace, not
  // punctuation, so this needs its own pass (found live: "Lavender Oatmeal
  // Bar," kept the comma all the way into the rendered WhatsApp menu).
  const remainder = text
    .replace(urlMatch[0], "")
    .trim()
    .replace(/[,;:]+$/, "")
    .trim();
  const explicitName = stripNameTriggers(remainder) || remainder;
  if (explicitName) {
    return { value: [{ [nameField.key]: explicitName, [urlField.key]: url }], confidence: 0.75 };
  }

  const derivedName = deriveNameFromUrl(url);
  if (!derivedName) return null;
  return {
    value: [{ [nameField.key]: derivedName, [urlField.key]: url }],
    confidence: 0.65,
    reason: `Guessed the name from the URL ("${derivedName}") — no name was given in the message.`,
  };
}

/**
 * Generic, schema-driven — not per-fieldKey hardcoded: looks at the item
 * shape's *required* fields and their types, not the field's key or which
 * primitive it belongs to, so this works for any future array-of-objects
 * primitive with the same shape, not just today's two:
 * - two required non-URL fields (faq_support's {question, answer}) -> Q/A-labeled parsing
 * - a required "url" field plus one other required field (catalogue's
 *   {name, link}) -> extract the URL, use the remaining text as the name
 * A single successfully-parsed item is enough to satisfy `minItems: 1`.
 */
function extractArrayField(field: FieldDefinition, text: string): Candidate | null {
  const requiredItemFields = (field.itemFields ?? []).filter((f) => f.required);
  if (requiredItemFields.length !== 2) return null;
  const [a, b] = requiredItemFields as [FieldDefinition, FieldDefinition];

  const urlField = [a, b].find((f) => f.type === "url");
  const otherField = urlField === a ? b : a;
  if (urlField) {
    return extractNameAndLinkItem(otherField, urlField, text);
  }

  return extractQaShapedItem(a, b, text);
}

function extractForField(field: FieldDefinition, text: string): Candidate | null {
  switch (field.type) {
    case "weekly_hours":
      return extractWeeklyHours(text);
    case "url":
      return extractUrl(text);
    case "boolean":
      return extractBoolean(text);
    case "array":
      return extractArrayField(field, text);
    default:
      return extractScalar(field, text);
  }
}

/**
 * Local, no-LLM stand-in for real field extraction: type-driven pattern
 * matching against whichever field the interview actually just asked about
 * (missingFields[0] — that's what the user is responding to). Only ever
 * attempts one field per turn, matching the interview's own one-question-
 * at-a-time flow; a real LLM-backed extractor could pull several fields out
 * of one message, this cannot.
 */
export const heuristicExtractFields: ExtractFieldsFn = async ({ freeText, missingFields }) => {
  const target = missingFields[0];
  if (!target) return [];

  const fieldDef = findFieldDefinition(target);
  if (!fieldDef) return [];

  const candidate = extractForField(fieldDef, freeText);
  if (!candidate) return [];

  const extraction: FieldExtraction = {
    primitiveKey: target.primitiveKey,
    fieldKey: target.fieldKey,
    value: candidate.value,
    confidence: candidate.confidence,
    reason: candidate.reason,
  };
  return [extraction];
};
