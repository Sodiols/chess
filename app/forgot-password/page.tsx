import type { Metadata } from "next";
import { NO_INDEX } from "@/lib/site";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = { title: "Reset password", robots: NO_INDEX };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
