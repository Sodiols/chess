"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { callRpc } from "@/lib/multiplayer/http";
import { getAdminClient } from "@/lib/supabase/server";

export interface ContactState {
  error: string | null;
  values: { name: string; email: string; message: string };
}

/** Saves the message, then sends the visitor to the thank-you page. On failure the typed text is returned so nothing is lost. */
export async function submitContact(_previous: ContactState, form: FormData): Promise<ContactState> {
  const values = {
    name: String(form.get("name") ?? ""),
    email: String(form.get("email") ?? ""),
    message: String(form.get("message") ?? ""),
  };
  const admin = getAdminClient();
  if (!admin) return { error: "not_configured", values };

  const client = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  let error: string | null = null;
  try {
    const result = await callRpc(admin, "submit_contact", {
      p_name: values.name,
      p_email: values.email,
      p_message: values.message,
      p_key: client,
    });
    if (!result.ok) error = result.error ?? "try_again";
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    console.error(`[gambit api] op=submitContact category=database detail=${detail}`);
    error = /PGRST202|42883/.test(detail) ? "setup_incomplete" : "try_again";
  }
  if (error) return { error, values };
  redirect("/contact/thanks");
}
