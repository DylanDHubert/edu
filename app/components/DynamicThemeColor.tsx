"use client";

import { useEffect } from "react";
import { useChat } from "../contexts/ChatContext";

export default function DynamicThemeColor() {
  useEffect(() => {
    // GET THE META TAG
    let themeColorMeta = document.querySelector('meta[name="theme-color"]');
    
    // CREATE IT IF IT DOESN'T EXIST
    if (!themeColorMeta) {
      themeColorMeta = document.createElement('meta');
      themeColorMeta.setAttribute('name', 'theme-color');
      document.head.appendChild(themeColorMeta);
    }

    // SET COLOR BASED ON course MODE
    let color = '#1e293b'; // DEFAULT SLATE-800 (MATCHES SIDEBAR)
    
    // Check for course mode
    const activeAssistant = localStorage.getItem('activeAssistant');
    if (activeAssistant) {
      try {
        const assistant = JSON.parse(activeAssistant);
        // course mode - use header background color for seamless look
        color = '#1e293b'; // SLATE-800 (matches header background)
      } catch (error) {
        console.error('Error parsing activeAssistant:', error);
        color = '#1e293b'; // SLATE-800
      }
    }

    // UPDATE THE META TAG
    themeColorMeta.setAttribute('content', color);
  }, []); // No dependencies needed since we're not using currentPortfolio anymore

  return null; // THIS COMPONENT DOESN'T RENDER ANYTHING
} 