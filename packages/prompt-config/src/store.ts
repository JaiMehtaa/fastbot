import type { DbClient } from "@whatsapp-bot-platform/db";

export class PromptConfigError extends Error {}

export interface PromptTemplateSummary {
  key: string;
  /** the value actually used at call time: the stored override, or the caller-supplied default when none exists */
  effectiveTemplate: string;
  /** the code-owned fallback — shown in the UI so "reset to default" has something to reset to */
  defaultTemplate: string;
  isOverridden: boolean;
  updatedAt: string | null;
}

/**
 * Every known prompt key and its code-owned default, in one place so
 * apps/admin can render a full list without importing every individual
 * llm-*.ts module directly. Each module still exports its own
 * DEFAULT_*_PROMPT as the source of truth — this map is assembled by
 * production-deps.ts and passed in, not hardcoded here, so there's exactly
 * one place per prompt that owns its default text.
 */
export type PromptDefaults = Readonly<Record<string, string>>;

export async function getPromptTemplate(db: DbClient, key: string): Promise<string | null> {
  const { data, error } = await db.from("prompt_templates").select("template").eq("key", key).maybeSingle();
  if (error) throw new PromptConfigError(`getPromptTemplate(${key}): ${error.message}`);
  return data?.template ?? null;
}

export async function setPromptTemplate(db: DbClient, key: string, template: string): Promise<void> {
  const { error } = await db
    .from("prompt_templates")
    .upsert({ key, template, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new PromptConfigError(`setPromptTemplate(${key}): ${error.message}`);
}

export async function resetPromptTemplate(db: DbClient, key: string): Promise<void> {
  const { error } = await db.from("prompt_templates").delete().eq("key", key);
  if (error) throw new PromptConfigError(`resetPromptTemplate(${key}): ${error.message}`);
}

export async function listPromptTemplates(db: DbClient, defaults: PromptDefaults): Promise<PromptTemplateSummary[]> {
  const { data, error } = await db.from("prompt_templates").select("key, template, updated_at");
  if (error) throw new PromptConfigError(`listPromptTemplates: ${error.message}`);

  const overrides = new Map((data ?? []).map((row) => [row.key, row]));
  return Object.entries(defaults).map(([key, defaultTemplate]) => {
    const override = overrides.get(key);
    return {
      key,
      defaultTemplate,
      effectiveTemplate: override?.template ?? defaultTemplate,
      isOverridden: Boolean(override),
      updatedAt: override?.updated_at ?? null,
    };
  });
}
