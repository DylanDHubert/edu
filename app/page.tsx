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
      {/* SIMPLE MOBILE MENU BUTTON - TOP RIGHT OF SCREEN */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="lg:hidden fixed top-2 right-2 z-50 bg-slate-800 text-slate-100 p-1 pr-2 pl-2 rounded-md border border-slate-700"
      >
        ☰
      </button>

      <Sidebar isMobileOpen={isMobileOpen} setIsMobileOpen={setIsMobileOpen} />
      <div className="flex-1 flex flex-col lg:ml-0">
        <ChatInterface />
      </div>
    </div>
  );
}
