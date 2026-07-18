import type { FieldDefinition } from "@whatsapp-bot-platform/shared-types";

export interface FieldIssue {
  fieldPath: string;
  message: string;
  severity: "error" | "warning";
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/** Returns true when a value counts as "not provided" for required-ness purposes. */
export function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * Validates a single field's value against its schema. Does NOT check
 * required-ness of an absent value — that's the caller's job, since only
 * the caller (validateDraft) knows whether "missing" should be surfaced
 * as a missing-required-field (drives the interview) vs. an issue.
 */
export function validateField(
  field: FieldDefinition,
  value: unknown,
  fieldPath: string = field.key,
): FieldIssue[] {
  if (isEmptyValue(value)) return [];

  const issues: FieldIssue[] = [];
  const invalid = (message: string, severity: FieldIssue["severity"] = "error") =>
    issues.push({ fieldPath, message, severity });

  switch (field.type) {
    case "string":
    case "text":
    case "phone":
      if (typeof value !== "string") invalid(`"${fieldPath}" must be a string`);
      break;
    case "number":
      if (typeof value !== "number" || Number.isNaN(value)) invalid(`"${fieldPath}" must be a number`);
      break;
    case "boolean":
      if (typeof value !== "boolean") invalid(`"${fieldPath}" must be a boolean`);
      break;
    case "url":
      if (typeof value !== "string" || !isValidUrl(value)) invalid(`"${fieldPath}" must be a valid URL`);
      break;
    case "enum":
      if (typeof value !== "string" || !(field.enumValues ?? []).includes(value)) {
        invalid(`"${fieldPath}" must be one of: ${(field.enumValues ?? []).join(", ")}`);
      }
      break;
    case "weekly_hours":
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        invalid(`"${fieldPath}" must be an hours object`);
      }
      break;
    case "array": {
      if (!Array.isArray(value)) {
        invalid(`"${fieldPath}" must be an array`);
        break;
      }
      if (field.minItems !== undefined && value.length < field.minItems) {
        invalid(`"${fieldPath}" needs at least ${field.minItems} item(s), got ${value.length}`);
      }
      if (field.itemFields) {
        value.forEach((item, index) => {
          for (const itemField of field.itemFields ?? []) {
            const itemValue = (item as Record<string, unknown> | null)?.[itemField.key];
            const itemPath = `${fieldPath}[${index}].${itemField.key}`;
            if (isEmptyValue(itemValue)) {
              if (itemField.required) {
                issues.push({
                  fieldPath: itemPath,
                  message: `"${itemPath}" is required`,
                  severity: "error",
                });
              }
              continue;
            }
            issues.push(...validateField(itemField, itemValue, itemPath));
          }
        });
      }
      break;
    }
  }

  return issues;
}
