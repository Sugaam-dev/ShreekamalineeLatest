import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shreekamalinee | Manage Products",
  description: "Manage Shreekamalinee products, photos and category prices.",
  icons: {
    icon: "/logo-240.png",
    shortcut: "/logo-240.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
