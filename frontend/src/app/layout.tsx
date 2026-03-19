import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "unapi — API Contract Intelligence",
  description: "Normalize, compare, and visualize API documentation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-gray-950 text-gray-100">
        <nav className="border-b border-gray-800 px-6 py-3 flex items-center gap-6 bg-gray-900 sticky top-0 z-50">
          <Link href="/" className="font-bold text-lg text-white tracking-tight">
            unapi
          </Link>
          <Link href="/documents" className="text-sm text-gray-400 hover:text-white transition-colors">
            Documents
          </Link>
          <Link href="/flows" className="text-sm text-gray-400 hover:text-white transition-colors">
            Flows
          </Link>
          <Link href="/compare" className="text-sm text-gray-400 hover:text-white transition-colors">
            Compare
          </Link>
        </nav>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
