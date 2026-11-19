import type { Metadata } from "next";
import AdminClient from "./admin-client";
import "./admin.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Product Manager | Shreekamalinee",
  description: "Manage Shreekamalinee products and category prices.",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminClient />;
}
