export const PRIMITIVE_KEYS = [
  "business_info",
  "catalogue",
  "faq_support",
  "human_escalation",
  "lead_capture",
  "booking",
  "order_management",
] as const;

export type PrimitiveKey = (typeof PRIMITIVE_KEYS)[number];

export type FieldType =
  | "string"
  | "text"
  | "number"
  | "boolean"
  | "enum"
  | "url"
  | "phone"
  | "weekly_hours"
  | "array";

export interface FieldDefinition {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  interviewHint: string;
  enumValues?: readonly string[];
  /** for type: "array" — the shape of each item */
  itemFields?: readonly FieldDefinition[];
  /** for type: "array" — minimum items for the field to be considered complete */
  minItems?: number;
  example?: unknown;
}

export interface PrimitiveSchema {
  key: PrimitiveKey;
  schemaVersion: number;
  label: string;
  entryLabel: string;
  requiredFields: readonly FieldDefinition[];
  optionalFields: readonly FieldDefinition[];
  rendererContract: string;
  stateContract: readonly string[];
}

export interface LobRecipe {
  key: string;
  label: string;
  defaultPrimitives: readonly PrimitiveKey[];
  classificationExamples: readonly string[];
}
