"use client";

import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Sidebar from "../components/Sidebar";
import ChatInterface from "../components/ChatInterface";
import DynamicThemeColor from "../components/DynamicThemeColor";

export default function ChatPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    } else if (!loading && user) {
      // CHECK ACCESS FIRST - DON'T RELY ON STALE LOCALSTORAGE DATA
      checkUserAccess();
    }
  }, [user, loading, router]);

  const checkUserAccess = async () => {
    try {
      // CHECK IF USER HAS ACCESS VIA API
      const response = await fetch('/api/auth/check-access');
      if (response.ok) {
        const { hasAccess, hasManagerPrivileges, hasTeamMemberships } = await response.json();
        
        if (!hasAccess) {
          // USER HAS NO ACCESS - REDIRECT TO NO-ACCESS PAGE
          router.push('/no-access');
          return;
        }

        // USER HAS ACCESS - NOW CHECK FOR ACTIVE ASSISTANT
        const activeAssistant = localStorage.getItem('activeAssistant');
        if (!activeAssistant) {
          router.push("/");
          return;
        }

        // VALIDATE THAT THE ACTIVE ASSISTANT IS STILL VALID
        try {
          const assistant = JSON.parse(activeAssistant);
          // TODO: Could add additional validation here if needed
          console.log('Active assistant validated:', assistant);
        } catch (error) {
          console.error('Invalid activeAssistant in localStorage:', error);
          localStorage.removeItem('activeAssistant');
          router.push("/");
        }
      } else {
        // API ERROR - REDIRECT TO NO-ACCESS PAGE
        router.push('/no-access');
      }
    } catch (error) {
      console.error('Error checking user access:', error);
      router.push('/no-access');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-100 mb-4">HHB</h1>
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
