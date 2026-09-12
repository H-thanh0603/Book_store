import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/contexts/CartContext";
import { GlobalErrorHandler } from "@/components/GlobalErrorHandler";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_ORIGIN ?? "https://melio.vn"),
  title: {
    default: "Melio Books — Nhà sách trực tuyến",
    template: "%s · Melio Books",
  },
  description: "Nhà sách trực tuyến Melio — đặt sách giao tận nơi hoặc nhận tại cửa hàng.",
  manifest: "/manifest.json",
  themeColor: "#8c2d19",
  viewport: "width=device-width, initial-scale=1",
  openGraph: {
    type: "website",
    locale: "vi_VN",
    siteName: "Melio Books",
  },
  robots: { index: true, follow: true },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Melio",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <GlobalErrorHandler>
          <CartProvider>{children}</CartProvider>
        </GlobalErrorHandler>
      </body>
    </html>
  );
}
