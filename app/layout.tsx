import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RE:FRAME — Your visual memory, organized by meaning.",
  description:
    "Turn everyday images and evidence into searchable visual records, organized by what they mean.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
