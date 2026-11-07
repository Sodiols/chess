import type { Metadata } from "next";
import { NO_INDEX } from "@/lib/site";
import { ProfileView } from "@/components/profile/ProfileView";

export const metadata: Metadata = { title: "Profile", robots: NO_INDEX };

export default function ProfilePage() {
  return <ProfileView />;
}
