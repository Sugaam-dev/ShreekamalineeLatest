import type { Metadata } from "next";
import SetupClient from "./setup-client";
import "../admin.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Set Up Admin Login | Shreekamalinee",
  description: "Set up your private Shreekamalinee admin login.",
  robots: { index: false, follow: false },
};

export default function SetupPage() { return <SetupClient />; }
