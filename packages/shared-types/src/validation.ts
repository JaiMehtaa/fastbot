import type { PrimitiveKey } from "./primitive.js";

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  primitiveKey: PrimitiveKey;
  fieldKey?: string;
  message: string;
  severity: ValidationSeverity;
}

export interface MissingField {
  primitiveKey: PrimitiveKey;
  fieldKey: string;
  label: string;
  interviewHint: string;
}

export interface ValidationResult {
  /** true only when there are zero error-severity issues and zero missing required fields */
  valid: boolean;
  missingRequiredFields: readonly MissingField[];
  issues: readonly ValidationIssue[];
}
