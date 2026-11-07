import type { Metadata } from "next";
import { SignupForm } from "@/components/auth/SignupForm";
import { nextParam } from "@/lib/auth/params";

export const metadata: Metadata = { title: "Sign up — Gambit" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  return <SignupForm next={await nextParam(searchParams)} />;
}
