"use client";

import { useRouter } from "next/navigation";

interface StandardHeaderProps {
  teamName?: string;
  teamLocation?: string;
  userRole?: string;
  accountName?: string;
  portfolioName?: string;
  backUrl?: string;
  backText?: string;
  showBackButton?: boolean;
  showMenuButton?: boolean;
  onMenuClick?: () => void;
  onBackClick?: () => void;
  isChatPage?: boolean;
}

export default function StandardHeader({
  teamName,
  teamLocation,
  userRole,
  accountName,
  portfolioName,
  backUrl,
  backText = "←",
  showBackButton = true,
  showMenuButton = false,
  onMenuClick,
  onBackClick
}: StandardHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (onBackClick) {
      onBackClick();
    } else if (backUrl) {
      router.push(backUrl);
    } else {
      router.back();
    }
  };

  return (
    <div className="bg-slate-800 border-b border-slate-700 p-4">
      <div className="flex items-center justify-between relative">
        {/* LEFT: HHB Logo */}
        <div className="flex items-center">
          <div className="bg-gradient-to-r from-slate-300 to-slate-400 text-slate-800 font-bold text-lg px-3 py-1 rounded-md mr-4 shadow-lg relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse"></div>
            <span className="relative z-10">HHB</span>
          </div>
        </div>

        {/* CENTER: Team/Context Info */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {teamName && (
            <div className="text-center pointer-events-auto">
              {accountName && portfolioName ? (
                // CHAT PAGE LAYOUT: 2 lines only
                <>
                  <h1 className="text-xl font-bold text-slate-100">
                    {teamName} • {teamLocation}
                  </h1>
                  <p className="text-slate-400 text-sm mt-1">
                    {accountName} • {portfolioName}
                  </p>
                </>
              ) : (
                // REGULAR PAGE LAYOUT: 2 lines with role
                <>
                  <h1 className="text-xl font-bold text-slate-100">{teamName}</h1>
                  {teamLocation && userRole && (
                    <p className="text-slate-400 text-sm mt-1">
                      {teamLocation} • {userRole === 'manager' ? 'Team Manager' : 'Team Member'}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: Back Button or Menu Button */}
        {showBackButton && (
          <button
            onClick={handleBack}
            className={`px-3 py-2 rounded-md font-medium transition-colors text-sm relative z-10 ${
              backText === 'LOGOUT' 
                ? 'bg-red-600 hover:bg-red-700 text-white' 
                : backText === 'SAVE' || backText === 'SAVING...'
                ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                : 'bg-slate-600 hover:bg-slate-700 text-white'
            }`}
          >
            {backText}
          </button>
        )}
        {showMenuButton && onMenuClick && (
          <button
            onClick={onMenuClick}
            className="bg-slate-600 hover:bg-slate-700 text-white px-3 py-2 rounded-md font-medium transition-colors text-sm relative z-10"
          >
            ☰
          </button>
        )}
      </div>
    </div>
  );
}
