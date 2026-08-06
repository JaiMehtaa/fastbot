"use server";

import { revalidatePath } from "next/cache";
import { createDbClient } from "@whatsapp-bot-platform/db";
import { resetPromptTemplate, setPromptTemplate } from "@whatsapp-bot-platform/prompt-config";

export async function savePromptAction(key: string, template: string): Promise<void> {
  const db = createDbClient();
  await setPromptTemplate(db, key, template);
  revalidatePath("/");
}

export async function resetPromptAction(key: string): Promise<void> {
  const db = createDbClient();
  await resetPromptTemplate(db, key);
  revalidatePath("/");
}
