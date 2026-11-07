import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { nextParam } from "@/lib/auth/params";

export const metadata: Metadata = { title: "New password — Gambit" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { mode } = await searchParams;
  return <ResetPasswordForm next={await nextParam(searchParams)} mode={mode === "set" ? "set" : "reset"} />;
}
