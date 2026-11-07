import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import { SignupForm } from "@/components/auth/SignupForm";
import { nextParam } from "@/lib/auth/params";

export const metadata: Metadata = pageMetadata(
  "Sign up",
  "Create a free Gambit account to play live online chess with real opponents, host private rooms and keep your win/loss record.",
  "/signup",
);

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  return <SignupForm next={await nextParam(searchParams)} />;
}
