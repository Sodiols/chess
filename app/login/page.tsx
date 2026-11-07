import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import { LoginForm } from "@/components/auth/LoginForm";
import { nextParam } from "@/lib/auth/params";

export const metadata: Metadata = pageMetadata(
  "Log in",
  "Log in to your Gambit account to play live chess online, join private rooms with friends and track your game statistics.",
  "/login",
);

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  return <LoginForm next={await nextParam(searchParams)} />;
}
