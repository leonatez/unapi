import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "unapi — API Contract Intelligence",
  description: "Normalize, compare, and visualize API documentation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex bg-[#F0F2EE] text-[#1A1A1A]">
        <Navbar />
        {/* pt-14 on mobile for the fixed top bar; md:ml-[220px] for the fixed sidebar */}
        <main className="flex-1 min-h-screen md:ml-[220px] pt-14 md:pt-0 bg-[#F0F2EE]">
          {children}
        </main>
      </body>
    </html>
  );
}
