import type { Metadata } from "next";
import { Coda } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./contexts/AuthContext";
import { ChatProvider } from "./contexts/ChatContext";
import { NotesProvider } from "./contexts/NotesContext";

const coda = Coda({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-coda",
});

export const metadata: Metadata = {
  title: "HHB RAG Assistant",
  description: "AI-powered RAG application with Supabase authentication",
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
