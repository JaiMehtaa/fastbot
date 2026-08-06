"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import type { FieldDefinition, PrimitiveFieldValues, PrimitiveKey, PrimitiveSchema } from "@whatsapp-bot-platform/shared-types";
import { saveTenantConfigAction } from "./actions";

type FieldValuesState = Partial<Record<PrimitiveKey, PrimitiveFieldValues>>;

const inputClass = "w-full rounded-lg border border-neutral-700 bg-neutral-950 p-2 text-sm outline-none focus:border-emerald-500";

/**
 * Schema-driven so it covers every array/scalar primitive without a
 * per-primitive editor — same generic-over-FieldDefinition approach
 * validateDraft()/compile() already use. Dirty-state/save UX mirrors
 * apps/admin/app/prompts/prompt-editor.tsx.
 */
export function TenantEditor({
  tenantId,
  primitives,
  initialFieldValues,
}: {
  tenantId: string;
  primitives: readonly PrimitiveSchema[];
  initialFieldValues: FieldValuesState;
}) {
  const [fieldValues, setFieldValues] = useState<FieldValuesState>(initialFieldValues);
  // The last successfully-saved values — NOT the static initialFieldValues prop.
  // revalidatePath() doesn't refresh an already-mounted client component's props,
  // so comparing against the prop meant `dirty` never cleared after a real,
  // successful save: the confirmation never showed and the button stayed enabled,
  // which (found live via QA testing) led people to re-click and publish twice.
  const [savedFieldValues, setSavedFieldValues] = useState<FieldValuesState>(initialFieldValues);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const dirty = JSON.stringify(fieldValues) !== JSON.stringify(savedFieldValues);

  function updateField(primitiveKey: PrimitiveKey, fieldKey: string, value: unknown) {
    setFieldValues((prev) => ({
      ...prev,
      [primitiveKey]: { ...(prev[primitiveKey] ?? {}), [fieldKey]: value },
    }));
    setJustSaved(false);
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await saveTenantConfigAction(tenantId, fieldValues);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSavedFieldValues(result.updatedFieldValues ?? fieldValues);
      setJustSaved(true);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {primitives.map((primitive) => (
        <PrimitiveSection
          key={primitive.key}
          primitive={primitive}
          values={fieldValues[primitive.key] ?? {}}
          onFieldChange={(fieldKey, value) => updateField(primitive.key, fieldKey, value)}
        />
      ))}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isPending || !dirty}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {isPending ? "Saving…" : "Save & publish"}
        </button>
        {justSaved && !isPending && !dirty && <span className="text-xs text-neutral-500">Saved and live</span>}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    </div>
  );
}

function PrimitiveSection({
  primitive,
  values,
  onFieldChange,
}: {
  primitive: PrimitiveSchema;
  values: PrimitiveFieldValues;
  onFieldChange: (fieldKey: string, value: unknown) => void;
}) {
  const fields = [...primitive.requiredFields, ...primitive.optionalFields];
  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <h2 className="font-medium">{primitive.label}</h2>
      <div className="mt-3 flex flex-col gap-4">
        {fields.map((field) => (
          <FieldEditor key={field.key} field={field} value={values[field.key]} onChange={(value) => onFieldChange(field.key, value)} />
        ))}
      </div>
    </section>
  );
}

function LabeledField({ field, children }: { field: FieldDefinition; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-neutral-300">
        {field.label}
        {field.required && <span className="text-red-400"> *</span>}
      </span>
      {children}
    </label>
  );
}

function FieldEditor({ field, value, onChange }: { field: FieldDefinition; value: unknown; onChange: (value: unknown) => void }) {
  switch (field.type) {
    case "text":
      return (
        <LabeledField field={field}>
          <textarea value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} rows={3} className={inputClass} />
        </LabeledField>
      );
    case "number":
      return (
        <LabeledField field={field}>
          <input
            type="number"
            value={typeof value === "number" ? value : ""}
            onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
            className={inputClass}
          />
        </LabeledField>
      );
    case "boolean":
      return (
        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          {field.label}
        </label>
      );
    case "enum":
      return (
        <LabeledField field={field}>
          <select value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} className={inputClass}>
            <option value="" disabled>
              Select…
            </option>
            {(field.enumValues ?? []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </LabeledField>
      );
    case "weekly_hours":
      return (
        <LabeledField field={field}>
          <KeyValueTable
            value={(value as Record<string, string> | undefined) ?? {}}
            onChange={onChange}
            keyPlaceholder="e.g. mon_fri"
            valuePlaceholder="e.g. 9:00-18:00"
          />
        </LabeledField>
      );
    case "array":
      return (
        <LabeledField field={field}>
          <ArrayTable field={field} value={Array.isArray(value) ? (value as Record<string, unknown>[]) : []} onChange={onChange} />
        </LabeledField>
      );
    case "string":
    case "url":
    case "phone":
    default:
      return (
        <LabeledField field={field}>
          <input
            type={field.type === "url" ? "url" : "text"}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
          />
        </LabeledField>
      );
  }
}

function KeyValueTable({
  value,
  onChange,
  keyPlaceholder,
  valuePlaceholder,
}: {
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  keyPlaceholder: string;
  valuePlaceholder: string;
}) {
  const rows = Object.entries(value);

  function updateRow(index: number, key: string, val: string) {
    const next = [...rows];
    next[index] = [key, val];
    onChange(Object.fromEntries(next));
  }

  function removeRow(index: number) {
    onChange(Object.fromEntries(rows.filter((_, i) => i !== index)));
  }

  function addRow() {
    onChange({ ...value, "": "" });
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map(([key, val], index) => (
        <div key={index} className="flex gap-2">
          <input value={key} placeholder={keyPlaceholder} onChange={(e) => updateRow(index, e.target.value, val)} className={inputClass} />
          <input value={val} placeholder={valuePlaceholder} onChange={(e) => updateRow(index, key, e.target.value)} className={inputClass} />
          <button type="button" onClick={() => removeRow(index)} className="shrink-0 text-xs text-red-400">
            Remove
          </button>
        </div>
      ))}
      <button type="button" onClick={addRow} className="w-fit text-xs text-emerald-400 underline">
        + Add
      </button>
    </div>
  );
}

function ArrayTable({
  field,
  value,
  onChange,
}: {
  field: FieldDefinition;
  value: Record<string, unknown>[];
  onChange: (value: Record<string, unknown>[]) => void;
}) {
  const itemFields = field.itemFields ?? [];

  function updateItem(index: number, itemKey: string, itemValue: unknown) {
    onChange(value.map((item, i) => (i === index ? { ...item, [itemKey]: itemValue } : item)));
  }

  function removeItem(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function addItem() {
    onChange([...value, {}]);
  }

  return (
    <div className="flex flex-col gap-3">
      {value.map((item, index) => (
        <div key={index} className="rounded-lg border border-neutral-800 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {itemFields.map((itemField) => (
              <FieldEditor
                key={itemField.key}
                field={itemField}
                value={item[itemField.key]}
                onChange={(itemValue) => updateItem(index, itemField.key, itemValue)}
              />
            ))}
          </div>
          <button type="button" onClick={() => removeItem(index)} className="mt-2 text-xs text-red-400">
            Remove
          </button>
        </div>
      ))}
      <button type="button" onClick={addItem} className="w-fit text-xs text-emerald-400 underline">
        + Add {field.label.toLowerCase()}
      </button>
    </div>
  );
}
