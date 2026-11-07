import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/LoginForm";
import { nextParam } from "@/lib/auth/params";

export const metadata: Metadata = { title: "Log in — Gambit" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  return <LoginForm next={await nextParam(searchParams)} />;
}
