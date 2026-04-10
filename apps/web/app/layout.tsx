import type { Metadata } from "next";
import { EB_Garamond, Inter, Playfair_Display, DM_Sans } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { AnalyticsProvider } from "@/components/providers/AnalyticsProvider";
import { Toaster } from "sonner";

const ebGaramond = EB_Garamond({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Cova — AI Interior Design",
  description:
    "Reimagine your space in seconds. Upload a photo, get matched to a style, and shop AI-designed furniture from top retailers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${ebGaramond.variable} ${inter.variable} ${playfairDisplay.variable} ${dmSans.variable} ${geistMono.variable} antialiased`}
      >
        <AnalyticsProvider>{children}</AnalyticsProvider>
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
