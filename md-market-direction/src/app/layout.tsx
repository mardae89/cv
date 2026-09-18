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
  title: "MD Market Direction — Know the Direction. Understand the Why.",
  description:
    "AI-powered market intelligence for forex, stocks, crypto, gold, indices and commodities. A transparent directional bias with the evidence behind it.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "MD Direction", statusBarStyle: "black-translucent" },
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
