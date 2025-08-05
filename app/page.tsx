"use client";

import { useAuth } from "./contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Sidebar from "./components/Sidebar";
import ChatInterface from "./components/ChatInterface";

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

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
      <Sidebar />
      <ChatInterface />
    </div>
  );
}
