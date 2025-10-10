"use client";

import { useRouter } from "next/navigation";

interface StandardHeaderProps {
  courseName?: string;
  courseLocation?: string;
  userRole?: string;
  isOriginalManager?: boolean;
  portfolioName?: string;
  backUrl?: string;
  backText?: string;
  showBackButton?: boolean;
  showMenuButton?: boolean;
  onMenuClick?: () => void;
  onBackClick?: () => void;
  backButtonDisabled?: boolean;
  isChatPage?: boolean;
}

export default function StandardHeader({
  courseName,
  courseLocation,
  userRole,
  isOriginalManager = false,
  portfolioName,
  backUrl,
  backText = "←",
  showBackButton = true,
  showMenuButton = false,
  onMenuClick,
  onBackClick,
  backButtonDisabled = false
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
          <button
            onClick={() => router.push('/')}
            className="bg-gradient-to-r from-slate-300 to-slate-400 rounded-md mr-4 shadow-lg relative overflow-hidden hover:from-slate-200 hover:to-slate-300 transition-all duration-200 cursor-pointer p-2"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse"></div>
            <img src="/logo.png" alt="HHB" className="relative z-10 h-8 w-auto" />
          </button>
        </div>

        {/* CENTER: Classroom/Context Info */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {courseName && (
            <div className="text-center pointer-events-auto">
              {portfolioName ? (
                // CHAT PAGE LAYOUT: 2 lines only
                <>
                  <h1 className="text-xl font-bold text-slate-100">
                    {courseName} • {courseLocation}
                  </h1>
                  <p className="text-slate-400 text-sm mt-1">
                    {portfolioName}
                  </p>
                </>
              ) : (
                // REGULAR PAGE LAYOUT: 2 lines with role
                <>
                  <h1 className="text-xl font-bold text-slate-100">{courseName}</h1>
                  {courseLocation && userRole && (
                    <p className="text-slate-400 text-sm mt-1">
                      {courseLocation} • {userRole === 'manager' ? (isOriginalManager ? 'Teacher (Professor)' : 'TA') : 'Student'}
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
            disabled={backButtonDisabled}
            className={`px-3 py-2 rounded-md font-medium transition-colors text-sm relative z-10 ${
              backText === 'LOGOUT' 
                ? 'bg-red-600 hover:bg-red-700 text-white' 
                : backText === 'SAVE' || backText === 'SAVING...'
                ? 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white' 
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
