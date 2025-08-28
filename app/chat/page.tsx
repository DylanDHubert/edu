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
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(false); // DESKTOP SIDEBAR STATE

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
          // This shouldn't happen since all authenticated users have access
          console.error('User has no access despite being authenticated');
          router.push('/');
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
        // API ERROR - REDIRECT TO HOME PAGE
        console.error('API error checking access, redirecting to home');
        router.push('/');
      }
    } catch (error) {
      console.error('Error checking user access:', error);
      router.push('/');
    }
  };

  // HANDLE MENU CLICK FOR BOTH MOBILE AND DESKTOP
  const handleMenuClick = () => {
    // ON MOBILE: TOGGLE MOBILE OVERLAY
    // ON DESKTOP: TOGGLE SIDEBAR VISIBILITY
    if (window.innerWidth >= 1024) { // lg breakpoint
      setIsDesktopSidebarOpen(!isDesktopSidebarOpen);
    } else {
      setIsMobileOpen(!isMobileOpen);
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
      <Sidebar 
        isMobileOpen={isMobileOpen} 
        setIsMobileOpen={setIsMobileOpen}
        isDesktopOpen={isDesktopSidebarOpen}
        setIsDesktopOpen={setIsDesktopSidebarOpen}
      />
      <div className={`flex-1 flex flex-col transition-all duration-300 ease-in-out ${
        isDesktopSidebarOpen ? 'lg:ml-80' : 'lg:ml-0'
      }`}>
        <ChatInterface onMenuClick={handleMenuClick} />
      </div>
    </div>
  );
}
