import { getPrimitive, primitiveRegistry } from "@whatsapp-bot-platform/schema";
import type {
  DraftConfig,
  MissingField,
  ValidationIssue,
  ValidationResult,
} from "@whatsapp-bot-platform/shared-types";
import { isEmptyValue, validateField } from "./field.js";

export function validateDraft(draftConfig: DraftConfig): ValidationResult {
  const missingRequiredFields: MissingField[] = [];
  const issues: ValidationIssue[] = [];

  for (const primitiveKey of draftConfig.selectedPrimitives) {
    if (!primitiveRegistry[primitiveKey]) {
      issues.push({
        primitiveKey,
        message: `Primitive "${primitiveKey}" is selected but not yet available in the registry`,
        severity: "error",
      });
      continue;
    }

    const schema = getPrimitive(primitiveKey);
    const values = draftConfig.fieldValues[primitiveKey] ?? {};

    for (const field of schema.requiredFields) {
      const value = values[field.key];
      if (isEmptyValue(value)) {
        missingRequiredFields.push({
          primitiveKey,
          fieldKey: field.key,
          label: field.label,
          interviewHint: field.interviewHint,
        });
        continue;
      }
      for (const fieldIssue of validateField(field, value)) {
        issues.push({ primitiveKey, fieldKey: field.key, message: fieldIssue.message, severity: fieldIssue.severity });
      }
    }

    for (const field of schema.optionalFields) {
      const value = values[field.key];
      if (isEmptyValue(value)) continue;
      for (const fieldIssue of validateField(field, value)) {
        issues.push({ primitiveKey, fieldKey: field.key, message: fieldIssue.message, severity: fieldIssue.severity });
      }
    }
  }

  // Cross-primitive checks. `booking` isn't implemented as a primitive yet
  // (see docs/architecture.md primitive table) but this rule anticipates it:
  // a booking flow can't generate slots without business_info.hours.
  if (draftConfig.selectedPrimitives.includes("booking")) {
    const hasBusinessInfo = draftConfig.selectedPrimitives.includes("business_info");
    const hours = draftConfig.fieldValues.business_info?.hours;
    if (!hasBusinessInfo || isEmptyValue(hours)) {
      issues.push({
        primitiveKey: "booking",
        fieldKey: "business_info.hours",
        message: "booking requires business_info.hours to be configured to generate available slots",
        severity: "error",
      });
    }
  }

  // faq_support's LLM fallback routes low-confidence answers to human_escalation
  // (see docs/architecture.md "Knowledge Strategy & Confidence/Eval Layer") — without
  // it, apps/runtime would have nowhere valid to transition on a fallback miss.
  if (
    draftConfig.selectedPrimitives.includes("faq_support") &&
    !draftConfig.selectedPrimitives.includes("human_escalation")
  ) {
    issues.push({
      primitiveKey: "faq_support",
      message: "faq_support requires human_escalation to also be selected (its LLM fallback routes there on low confidence)",
      severity: "error",
    });
  }

  const valid = missingRequiredFields.length === 0 && issues.every((issue) => issue.severity !== "error");

  return { valid, missingRequiredFields, issues };
}
