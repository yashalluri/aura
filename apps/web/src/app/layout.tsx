import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "aura — your life assistant, in one text thread",
  description:
    "aura helps you keep up with your people and stick to your habits. all through text. no app needed.",
  openGraph: {
    title: "aura — your life assistant, in one text thread",
    description:
      "keep up with your people. stick to your habits. all through text.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
