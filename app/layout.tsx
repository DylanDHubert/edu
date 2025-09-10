import type { Metadata, Viewport } from "next";
import { Coda } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./contexts/AuthContext";
import { ChatProvider } from "./contexts/ChatContext";
import { NotesProvider } from "./contexts/NotesContext";
import { validateAppEnvironment } from "./utils/env-validation";

// VALIDATE ENVIRONMENT VARIABLES AT STARTUP
try {
  validateAppEnvironment();
} catch (error) {
  console.error('Failed to start application due to missing environment variables:', error);
  // IN PRODUCTION, YOU MIGHT WANT TO THROW THE ERROR TO PREVENT THE APP FROM STARTING
  // throw error;
}

const coda = Coda({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-coda",
});

export const metadata: Metadata = {
  title: "HHB Stryker Assistant",
  description: "AI-powered RAG application with Supabase authentication",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "HHB",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
    "apple-mobile-web-app-title": "HHB",
    "mobile-web-app-capable": "yes",
    "theme-color": "#0f172a",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  minimumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${coda.variable} font-coda antialiased bg-slate-900 text-slate-100`}
      >
        <AuthProvider>
          <ChatProvider>
            <NotesProvider>
              {children}
            </NotesProvider>
          </ChatProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
