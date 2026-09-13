import React, { useState } from 'react';
import { 
  ArrowLeft, Lock, AlertTriangle, 
  CheckCircle2, Smartphone, ShieldCheck, Eye, EyeOff, UserCheck, Loader2
} from 'lucide-react';
import boyImage from '../assets/images/boy_earpods_phone_1789032122744.jpg';
import { AuthProvider, UserAccount } from '../types';
import { 
  findAccountByEmail, 
  findAccountByProviderAndEmail,
  checkAccountLockout, 
  recordFailedLoginAttempt, 
  resetLockout,
  setActiveSession,
  getDeviceRegisteredAccounts
} from '../utils/authStorage';
import { fetchUserFromFirestoreByEmail } from '../utils/cloudSync';
import { authenticateWithExternalProvider } from '../utils/oauthAuth';
import { ForgotPasswordModal } from './ForgotPasswordModal';

interface SignInViewProps {
  onBackToWelcome: () => void;
  onGoToSignUp: () => void;
  onSignInSuccess: (user: UserAccount) => void;
}

export const SignInView: React.FC<SignInViewProps> = ({
  onBackToWelcome,
  onGoToSignUp,
  onSignInSuccess
}) => {
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Verification Step states
  const [verifyingAccount, setVerifyingAccount] = useState<UserAccount | null>(null);
  const [selectedDeviceEmail, setSelectedDeviceEmail] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [lockoutInfo, setLockoutInfo] = useState<{ isLocked: boolean; remainingMs: number } | null>(null);

  const deviceAccounts = getDeviceRegisteredAccounts();

  // Trigger genuine external OAuth verification outside the app
  const handleStartExternalSignIn = async (provider: AuthProvider) => {
    setErrorMessage(null);
    setIsVerifying(true);

    try {
      const result = await authenticateWithExternalProvider(provider);
      const email = result.email.toLowerCase().trim();
      setSelectedDeviceEmail(email);

      // 1. Check account lockout status
      const lockout = checkAccountLockout(result.provider, email);
      if (lockout.isLocked) {
        const hours = Math.floor(lockout.remainingMs / (1000 * 60 * 60));
        const minutes = Math.floor((lockout.remainingMs % (1000 * 60 * 60)) / (1000 * 60));
        setLockoutInfo({ isLocked: true, remainingMs: lockout.remainingMs });
        setErrorMessage(`Account is locked for 12 hours (${hours}h ${minutes}m remaining) due to 5 consecutive failed sign-in attempts.`);
        setIsVerifying(false);
        return;
      }

      // 2. Check if account exists locally or in Firestore
      let user = findAccountByProviderAndEmail(result.provider, email) || findAccountByEmail(email);
      if (!user) {
        try {
          const cloudUser = await fetchUserFromFirestoreByEmail(email);
          if (cloudUser) {
            user = cloudUser;
          }
        } catch (e) {
          console.warn('Cloud user lookup failed:', e);
        }
      }

      setIsVerifying(false);

      if (!user) {
        setErrorMessage(
          `No I-pay-online account found for "${result.email}". Please sign up first to create your account.`
        );
        setVerifyingAccount(null);
        return;
      }

      // If user has a password, prompt password verification
      if (user.passwordHash) {
        setVerifyingAccount(user);
        setPasswordInput('');
      } else {
        // Direct successful login
        resetLockout(user.provider, email);
        setActiveSession(user);
        onSignInSuccess(user);
      }
    } catch (err: any) {
      setIsVerifying(false);
      setErrorMessage(err.message || 'External account verification cancelled or failed.');
    }
  };

  // Verify ownership of the chosen account with password
  const handleVerifyAndSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyingAccount) return;

    const email = verifyingAccount.providerEmail.toLowerCase().trim();
    const lockout = checkAccountLockout(verifyingAccount.provider, email);

    if (lockout.isLocked) {
      const hours = Math.floor(lockout.remainingMs / (1000 * 60 * 60));
      const minutes = Math.floor((lockout.remainingMs % (1000 * 60 * 60)) / (1000 * 60));
      setLockoutInfo({ isLocked: true, remainingMs: lockout.remainingMs });
      setErrorMessage(`Account is locked for 12 hours (${hours}h ${minutes}m remaining) due to 5 consecutive failed sign-in attempts.`);
      return;
    }

    // Check password
    if (passwordInput === verifyingAccount.passwordHash) {
      // Success! Reset lockout
      resetLockout(verifyingAccount.provider, email);
      setActiveSession(verifyingAccount);
      onSignInSuccess(verifyingAccount);
    } else {
      // Failed attempt
      const attemptResult = recordFailedLoginAttempt(verifyingAccount.provider, email);
      if (attemptResult.isNowLocked) {
        setLockoutInfo({ isLocked: true, remainingMs: 12 * 60 * 60 * 1000 });
        setErrorMessage('Account locked for 12 hours! You reached the limit of 5 consecutive failed sign-in attempts.');
      } else {
        setErrorMessage(
          `Incorrect password. (${attemptResult.remainingAttempts} attempts remaining before 12-hour lockout)`
        );
      }
    }
  };

  const providers: { id: AuthProvider; name: string; icon: string; bg: string; border: string }[] = [
    {
      id: 'google',
      name: 'Continue with Gmail (Google)',
      icon: 'https://www.svgrepo.com/show/475656/google-color.svg',
      bg: 'bg-white hover:bg-gray-50 text-gray-900',
      border: 'border-gray-200 hover:border-gray-300'
    },
    {
      id: 'microsoft',
      name: 'Continue with Microsoft',
      icon: 'https://www.svgrepo.com/show/448239/microsoft.svg',
      bg: 'bg-white hover:bg-gray-50 text-gray-900',
      border: 'border-gray-200 hover:border-gray-300'
    },
    {
      id: 'iphone',
      name: 'Continue with iPhone (Apple)',
      icon: 'https://www.svgrepo.com/show/511330/apple-173.svg',
      bg: 'bg-black hover:bg-gray-900 text-white',
      border: 'border-black'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/50 via-teal-50/30 to-white text-gray-900 flex flex-col justify-between py-6 px-4 sm:px-6">
      
      {/* Top Bar */}
      <div className="w-full max-w-md mx-auto flex items-center justify-between">
        <button
          onClick={() => {
            if (verifyingAccount) {
              setVerifyingAccount(null);
              setErrorMessage(null);
            } else {
              onBackToWelcome();
            }
          }}
          className="p-2 rounded-full hover:bg-gray-100 text-gray-600 transition cursor-pointer flex items-center space-x-1.5 text-xs font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{verifyingAccount ? 'Choose another account' : 'Back'}</span>
        </button>

        <span className="text-xs font-bold text-emerald-800 bg-emerald-100/70 px-3 py-1 rounded-full flex items-center space-x-1">
          <Smartphone className="w-3 h-3" />
          <span>Device Sign In</span>
        </span>
      </div>

      {/* Main Container */}
      <div className="w-full max-w-md mx-auto my-auto space-y-5">
        
        {/* Boy with phone & earpods visual */}
        <div className="w-full h-36 rounded-3xl overflow-hidden shadow-xl border border-emerald-100 relative bg-emerald-950">
          <img
            src={boyImage}
            alt="Young Nigerian boy with phone"
            className="w-full h-full object-cover object-top"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300 bg-emerald-950/70 px-2 py-0.5 rounded-full border border-emerald-500/30 w-fit">
              Secure Sign In
            </span>
            <h2 className="text-lg font-black text-white leading-tight">
              Welcome Back to I-pay-online
            </h2>
          </div>
        </div>

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start space-x-2.5 animate-in fade-in">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
            <div className="flex-1 space-y-1">
              <p className="font-medium">{errorMessage}</p>
              {errorMessage.includes('No I-pay-online account found') && (
                <button
                  type="button"
                  onClick={onGoToSignUp}
                  className="font-bold text-emerald-700 underline text-xs cursor-pointer block mt-1"
                >
                  Click here to Sign Up with this account →
                </button>
              )}
            </div>
          </div>
        )}

        {/* STATE A: CLICK TO VERIFY OUTSIDE (NO EMAIL INPUT REQUIRED) */}
        {!verifyingAccount && (
          <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-emerald-100/80 space-y-4">
            <div className="text-center space-y-1">
              <h3 className="text-base font-extrabold text-gray-950">
                Sign In to I-pay-online
              </h3>
              <p className="text-xs text-gray-500">
                Click your account provider below to verify outside
              </p>
            </div>

            {/* Provider Options - Click to verify outside */}
            <div className="space-y-2.5 pt-1">
              {providers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleStartExternalSignIn(p.id)}
                  disabled={isVerifying}
                  className={`w-full py-3 px-4 rounded-2xl border font-bold text-xs flex items-center justify-between shadow-2xs hover:shadow-xs transition active:scale-[0.99] cursor-pointer disabled:opacity-60 ${p.bg} ${p.border}`}
                >
                  <div className="flex items-center space-x-3">
                    <img src={p.icon} alt={p.name} className="w-5 h-5 object-contain" />
                    <span className="text-gray-900 font-bold">{p.name}</span>
                  </div>
                  <span className="text-[10px] text-emerald-700 bg-white/80 px-2 py-0.5 rounded-md font-semibold border border-emerald-200">
                    Verify outside →
                  </span>
                </button>
              ))}
            </div>

            {isVerifying && (
              <div className="py-2 flex items-center justify-center space-x-2 text-emerald-700 text-xs font-semibold">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verifying outside securely...</span>
              </div>
            )}

            {/* Device Slot status */}
            <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
              <span className="flex items-center space-x-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Device slot: {deviceAccounts.length}/2 registered</span>
              </span>
            </div>
          </div>
        )}

        {/* STATE B: VERIFY OWNERSHIP OF CHOSEN ACCOUNT */}
        {verifyingAccount && (
          <form onSubmit={handleVerifyAndSignIn} className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-emerald-100/80 space-y-4">
            
            {/* Account Card */}
            <div className="flex items-center space-x-3 p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-100">
              <img
                src={verifyingAccount.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(verifyingAccount.displayName)}`}
                alt={verifyingAccount.displayName}
                className="w-12 h-12 rounded-full object-cover border-2 border-emerald-500 shadow-xs bg-white"
              />
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-black text-gray-900 truncate">{verifyingAccount.displayName}</h4>
                <p className="text-[11px] text-emerald-800 font-mono truncate">{verifyingAccount.username}</p>
                <p className="text-[11px] text-gray-500 truncate">{verifyingAccount.providerEmail}</p>
              </div>
              <span className="text-[10px] font-bold text-emerald-700 bg-white px-2 py-0.5 rounded-full border border-emerald-200">
                Verified
              </span>
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-extrabold text-gray-950 flex items-center space-x-1.5">
                <UserCheck className="w-4 h-4 text-emerald-600" />
                <span>Verify Password</span>
              </h3>
              <p className="text-xs text-gray-500">
                Enter your I-pay-online account password to sign in.
              </p>
            </div>

            {/* Password Input */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-gray-700">Password</label>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(true)}
                  className="text-[11px] text-emerald-700 hover:text-emerald-800 font-bold cursor-pointer"
                >
                  Forgot Password?
                </button>
              </div>

              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Enter your account password"
                  required
                  autoFocus
                  className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-gray-300 text-gray-900 text-xs font-medium focus:outline-hidden focus:border-emerald-600 bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Security Notice */}
            <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[11px] text-gray-500 flex items-center justify-between">
              <span className="flex items-center space-x-1">
                <Lock className="w-3 h-3 text-gray-400" />
                <span>Security rule: 5 failed attempts = 12h lockout</span>
              </span>
            </div>

            {/* Verify & Sign In Button */}
            <button
              type="submit"
              className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs shadow-md transition cursor-pointer flex items-center justify-center space-x-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Sign In</span>
            </button>
          </form>
        )}

        {/* Bottom Link to Sign Up */}
        <div className="text-center">
          <p className="text-xs text-gray-500">
            Don't have an account yet?{' '}
            <button
              onClick={onGoToSignUp}
              className="font-bold text-emerald-700 hover:text-emerald-800 underline cursor-pointer"
            >
              Sign up from this phone
            </button>
          </p>
        </div>

      </div>

      {/* Forgot Password Recovery Modal */}
      <ForgotPasswordModal
        isOpen={showForgotModal}
        onClose={() => setShowForgotModal(false)}
        defaultProvider={'google'}
        defaultEmail={selectedDeviceEmail || (verifyingAccount?.providerEmail || '')}
        onSuccessReset={(user) => {
          setShowForgotModal(false);
          setErrorMessage(null);
          onSignInSuccess(user);
        }}
      />

    </div>
  );
};
