import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "threadmap",
  description: "Turn one Claude conversation into a navigable mind map via DSPy RLM.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
