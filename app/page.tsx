"use client";

import { useState } from "react";
import { useAuth } from "./contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Sidebar from "./components/Sidebar";
import ChatInterface from "./components/ChatInterface";
import DynamicThemeColor from "./components/DynamicThemeColor";

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    } else if (!loading && user) {
      // Only redirect if they're specifically on the root page AND there's no active assistant
      // Don't interfere with direct navigation to /admin or active chat sessions
      if (window.location.pathname === "/") {
        const activeAssistant = localStorage.getItem('activeAssistant');
        if (!activeAssistant) {
          router.push("/launcher");
        }
      }
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-100 mb-4">HHB RAG</h1>
          <p className="text-slate-400">LOADING...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // WILL REDIRECT TO LOGIN
  }

  return (
    <div className="flex h-screen bg-slate-900">
      <DynamicThemeColor />
      <Sidebar isMobileOpen={isMobileOpen} setIsMobileOpen={setIsMobileOpen} />
      <div className="flex-1 flex flex-col lg:ml-0">
        <ChatInterface onMenuClick={() => setIsMobileOpen(!isMobileOpen)} />
      </div>
    </div>
  );
}
