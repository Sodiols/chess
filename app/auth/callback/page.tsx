import type { Metadata } from "next";
import { AuthCallback } from "@/components/auth/AuthCallback";
import { nextParam } from "@/lib/auth/params";

export const metadata: Metadata = { title: "Confirming — Gambit" };

export default async function AuthCallbackPage({ searchParams }: PageProps<"/auth/callback">) {
  return <AuthCallback next={await nextParam(searchParams)} />;
}
