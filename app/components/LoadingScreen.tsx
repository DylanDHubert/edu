"use client";

import React from 'react';

interface LoadingScreenProps {
  title?: string;
  subtitle?: string;
  showLogo?: boolean;
  variant?: 'default' | 'minimal' | 'full';
}

export default function LoadingScreen({ 
  title = "HHB Assistant", 
  subtitle = "Loading...", 
  showLogo = true,
  variant = 'default'
}: LoadingScreenProps) {
  if (variant === 'minimal') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-slate-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-400">{subtitle}</p>
        </div>
      </div>
    );
  }

  if (variant === 'full') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          {showLogo && (
            <div className="flex justify-center mb-6">
              <div className="bg-gradient-to-r from-slate-300 to-slate-400 rounded-lg shadow-lg relative overflow-hidden p-6">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse"></div>
                <img src="/logo.png" alt="HHB" className="relative z-10 h-20 w-auto" />
              </div>
            </div>
          )}
          <h1 className="text-4xl font-bold text-slate-100 mb-4">{title}</h1>
          <p className="text-slate-400 mb-6">{subtitle}</p>
          <div className="flex justify-center">
            <div className="w-8 h-8 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
          </div>
        </div>
      </div>
    );
  }

  // DEFAULT VARIANT
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="text-center">
        {showLogo && (
          <div className="flex justify-center mb-6">
            <div className="bg-gradient-to-r from-slate-300 to-slate-400 rounded-lg shadow-lg relative overflow-hidden p-4">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse"></div>
              <img src="/logo.png" alt="HHB" className="relative z-10 h-16 w-auto" />
            </div>
          </div>
        )}
        <h1 className="text-4xl font-bold text-slate-100 mb-4">{title}</h1>
        <p className="text-slate-400">{subtitle}</p>
      </div>
    </div>
  );
}
