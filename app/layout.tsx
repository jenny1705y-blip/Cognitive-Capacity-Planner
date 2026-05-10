import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cognitive Capacity Planner",
  description: "Plan study work around sleep pressure, circadian rhythm, caffeine, and calendar reality."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const criticalCss = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: criticalCss }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
