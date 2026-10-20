import type { Metadata, Viewport } from "next";
import { Montserrat, Open_Sans } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-montserrat",
  display: "swap",
});

const openSans = Open_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-opensans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MD Trader OS — Know the direction. Become the trader.",
  description:
    "Market direction for the 28 forex pairs and the index, metal and energy futures, with a trade journal, trading plan and mindset system built for forex traders.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "MD Trader OS", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icon-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#07070a",
  width: "device-width",
  initialScale: 1,
  // Browser pinch-zoom is disabled deliberately: the chart's own pinch is a
  // two-finger gesture, and with page zoom enabled the browser claims it first —
  // so pinching the chart zoomed the whole page instead of the price axis.
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${montserrat.variable} ${openSans.variable}`}>
      <body className="min-h-screen bg-void text-bone antialiased">{children}</body>
    </html>
  );
}
