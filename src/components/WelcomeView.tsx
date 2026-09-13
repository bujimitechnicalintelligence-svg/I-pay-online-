import React, { useState } from 'react';
import { RulesAndRegulationsModal } from './RulesAndRegulationsModal';
import { ApkDownloadModal } from './ApkDownloadModal';
import chattingPeopleImg from '../assets/images/chatting_people_group_1789034686653.jpg';

interface WelcomeViewProps {
  onStartSignUp: () => void;
  onGoToSignIn: () => void;
}

export const WelcomeView: React.FC<WelcomeViewProps> = ({
  onStartSignUp,
  onGoToSignIn
}) => {
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showApkModal, setShowApkModal] = useState(false);

  const handleOpenRules = () => {
    setShowRulesModal(true);
  };

  const handleAcceptRules = () => {
    setShowRulesModal(false);
    onStartSignUp();
  };

  return (
    <div className="min-h-screen relative flex flex-col justify-between overflow-hidden bg-gradient-to-b from-emerald-50/60 via-teal-50/30 to-white text-gray-900">
      
      {/* Calm ambient wind elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-emerald-100/40 blur-3xl" />
        <div className="absolute top-1/3 -left-20 w-72 h-72 rounded-full bg-teal-100/30 blur-2xl" />
        <div className="absolute -bottom-24 right-1/4 w-80 h-80 rounded-full bg-emerald-50/50 blur-3xl" />
      </div>

      {/* Top Bar */}
      <header className="relative z-10 w-full max-w-md mx-auto px-6 pt-6 flex items-center justify-between">
        <span className="text-base font-extrabold tracking-tight text-emerald-950">
          I-pay-online
        </span>

        <button
          onClick={() => setShowApkModal(true)}
          className="px-3.5 py-1.5 rounded-full bg-emerald-100/70 hover:bg-emerald-200/80 text-emerald-900 text-xs font-semibold tracking-wide transition cursor-pointer"
        >
          Download APK
        </button>
      </header>

      {/* Main Peaceful Welcome Canvas */}
      <main className="relative z-10 w-full max-w-sm mx-auto px-6 py-6 flex flex-col items-center justify-center text-center my-auto">
        
        {/* App Title */}
        <h1 className="text-3xl font-black tracking-tight text-gray-950 sm:text-4xl mb-5">
          I-pay-online
        </h1>

        {/* Picture of many people (girls and boys, young and adult) chatting on I-pay */}
        <div className="w-full relative rounded-2xl overflow-hidden shadow-xl shadow-emerald-950/10 border-2 border-emerald-100/80 mb-8 aspect-16/10 bg-emerald-100">
          <img
            src={chattingPeopleImg}
            alt="Young and adult boys and girls chatting on I-pay-online"
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>

        {/* Action Buttons: Join, Create an Account, Sign In */}
        <div className="w-full space-y-3.5">
          
          {/* Join Button */}
          <button
            onClick={handleOpenRules}
            className="w-full py-4 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm tracking-wide shadow-lg shadow-emerald-700/20 transition duration-200 cursor-pointer hover:scale-[1.01]"
          >
            Join
          </button>

          {/* Create an Account Button */}
          <button
            onClick={handleOpenRules}
            className="w-full py-3.5 px-6 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold text-sm tracking-wide border border-emerald-200/80 transition duration-200 cursor-pointer"
          >
            Create an Account
          </button>

          {/* Sign In Button */}
          <button
            onClick={onGoToSignIn}
            className="w-full py-3.5 px-6 rounded-2xl bg-white hover:bg-gray-50 text-gray-800 font-bold text-sm tracking-wide border border-gray-200 transition duration-200 cursor-pointer"
          >
            Sign In
          </button>

        </div>

      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-md mx-auto px-6 pb-6 text-center">
        <span className="text-xs text-gray-400 font-medium">
          I-pay-online
        </span>
      </footer>

      {/* Rules and Regulations Modal on Join / Create */}
      <RulesAndRegulationsModal
        isOpen={showRulesModal}
        onClose={() => setShowRulesModal(false)}
        onAccept={handleAcceptRules}
      />

      {/* APK Download Modal */}
      <ApkDownloadModal
        isOpen={showApkModal}
        onClose={() => setShowApkModal(false)}
      />

    </div>
  );
};
