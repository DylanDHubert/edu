"use client";

import { useEffect } from "react";
import { useChat } from "../contexts/ChatContext";

export default function DynamicThemeColor() {
  const { currentPortfolio } = useChat();

  useEffect(() => {
    // GET THE META TAG
    let themeColorMeta = document.querySelector('meta[name="theme-color"]');
    
    // CREATE IT IF IT DOESN'T EXIST
    if (!themeColorMeta) {
      themeColorMeta = document.createElement('meta');
      themeColorMeta.setAttribute('name', 'theme-color');
      document.head.appendChild(themeColorMeta);
    }

    // SET COLOR BASED ON PORTFOLIO
    let color = '#1e293b'; // DEFAULT SLATE-800 (MATCHES SIDEBAR)
    
    if (currentPortfolio) {
      switch (currentPortfolio) {
        case 'hip':
          color = '#1d4ed8'; // BLUE-700
          break;
        case 'knee':
          color = '#15803d'; // GREEN-700
          break;
        case 'ts_knee':
          color = '#7c3aed'; // PURPLE-700
          break;
        default:
          color = '#1e293b'; // SLATE-800
      }
    }

    // UPDATE THE META TAG
    themeColorMeta.setAttribute('content', color);
  }, [currentPortfolio]);

  return null; // THIS COMPONENT DOESN'T RENDER ANYTHING
} 