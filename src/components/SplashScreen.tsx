import React, { useEffect, useState } from 'react';

interface SplashScreenProps {
  onFinish: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // Show splash for 1.4 seconds on app launch
    const timer = setTimeout(() => {
      setFadeOut(true);
      setTimeout(onFinish, 400); // Allow fade-out transition
    }, 1400);

    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-between py-12 px-6 bg-gradient-to-b from-emerald-950 via-teal-950 to-black text-white transition-opacity duration-400 select-none ${
        fadeOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Top spacing */}
      <div className="w-full flex items-center justify-center pt-4">
        <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-400/80 bg-emerald-900/40 border border-emerald-500/20 px-3 py-1 rounded-full">
          Nigeria Super App
        </span>
      </div>

      {/* Central Icon: Community Pressing Phone */}
      <div className="flex flex-col items-center justify-center space-y-5 my-auto text-center animate-in zoom-in-95 duration-500">
        
        {/* App Icon Container */}
        <div className="relative group">
          <div className="absolute -inset-1.5 bg-gradient-to-r from-emerald-500 to-teal-400 rounded-[38px] blur-md opacity-60 animate-pulse" />
          <div className="relative w-32 h-32 sm:w-36 sm:h-36 rounded-[34px] overflow-hidden shadow-2xl border-2 border-emerald-400/40 bg-emerald-900 flex items-center justify-center">
            <img
              src="/app-icon.png"
              alt="Community Pressing Phone"
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* Title & Tagline */}
        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center justify-center space-x-1">
            <span>I-PAY-ONLINE</span>
          </h1>
          <p className="text-xs sm:text-sm text-emerald-300 font-medium">
            Connecting Communities Everywhere
          </p>
        </div>

        {/* Subtle Loading Dots */}
        <div className="flex items-center justify-center space-x-1.5 pt-4">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce [animation-delay:-0.3s]" />
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce [animation-delay:-0.15s]" />
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" />
        </div>
      </div>

      {/* Bottom Footer */}
      <div className="w-full text-center space-y-1 pb-2">
        <p className="text-[11px] text-gray-400 font-medium">
          24h Videos • Instant Real-time Chat • Local Marketplace
        </p>
        <p className="text-[10px] text-gray-500">
          Fast & Data-Saving • Saved In App
        </p>
      </div>
    </div>
  );
};
