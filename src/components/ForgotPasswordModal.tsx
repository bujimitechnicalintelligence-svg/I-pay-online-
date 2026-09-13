import React, { useState } from 'react';
import { KeyRound, Shield, Check, AlertCircle, RefreshCw, Eye, EyeOff, Sparkles, X } from 'lucide-react';
import { AuthProvider, UserAccount } from '../types';
import { 
  findAccountByProviderAndEmail, 
  updateAccountPassword, 
  validateStrongPassword, 
  generateSuggestedPassword, 
  setActiveSession,
  getRegisteredAccounts
} from '../utils/authStorage';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultProvider?: AuthProvider;
  defaultEmail?: string;
  onSuccessReset: (account: UserAccount) => void;
}

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({
  isOpen,
  onClose,
  defaultProvider = 'google',
  defaultEmail = '',
  onSuccessReset
}) => {
  const [step, setStep] = useState<'verify' | 'new_password'>('verify');
  const [provider, setProvider] = useState<AuthProvider>(defaultProvider);
  const [email, setEmail] = useState(defaultEmail);
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // New password state
  const [suggestedPassword, setSuggestedPassword] = useState(() => generateSuggestedPassword());
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  if (!isOpen) return null;

  const handleVerifyAccount = () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMessage('Please enter the registered email address for this provider.');
      return;
    }

    setIsVerifying(true);
    setErrorMessage(null);

    setTimeout(() => {
      setIsVerifying(false);
      const existing = findAccountByProviderAndEmail(provider, cleanEmail);
      if (!existing) {
        setErrorMessage(
          `No registered ${provider.toUpperCase()} account found with email "${cleanEmail}". Make sure the account was registered on Super App.`
        );
      } else {
        // Account exists and is verified
        setStep('new_password');
      }
    }, 700);
  };

  const passwordCheck = validateStrongPassword(newPassword);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const handleApplySuggested = () => {
    setNewPassword(suggestedPassword);
    setConfirmPassword(suggestedPassword);
    setErrorMessage(null);
  };

  const handleResetPassword = () => {
    setErrorMessage(null);

    if (newPassword.length < 8) {
      setErrorMessage('Password must be 8 characters or more.');
      return;
    }

    if (!passwordCheck.isValid) {
      setErrorMessage('Password must be very strong: mix letters, numbers, and special characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const success = updateAccountPassword(provider, cleanEmail, newPassword);

    if (success) {
      const all = getRegisteredAccounts();
      const updated = all.find(a => a.provider === provider && a.providerEmail.toLowerCase() === cleanEmail);
      if (updated) {
        setActiveSession(updated);
        onSuccessReset(updated);
      } else {
        onClose();
      }
    } else {
      setErrorMessage('Failed to update password. Please check your account details.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-emerald-100 p-6 space-y-4 my-auto animate-in fade-in zoom-in-95 duration-150">
        
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">Reset Account Password</h2>
              <p className="text-[11px] text-gray-500">
                {step === 'verify' ? 'Verify your identity to reset password' : 'Enter a strong 8+ character password'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMessage && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* STEP 1: VERIFY PROVIDER & EMAIL */}
        {step === 'verify' && (
          <div className="space-y-4">
            <p className="text-xs text-gray-600">
              Select your registered provider and enter your account email to verify your identity.
            </p>

            {/* Provider selector */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-700">Account Provider</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setProvider('google')}
                  className={`py-2 px-2 rounded-xl border text-xs font-semibold flex items-center justify-center space-x-1 transition ${
                    provider === 'google' 
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-800' 
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span>Google</span>
                </button>
                <button
                  type="button"
                  onClick={() => setProvider('iphone')}
                  className={`py-2 px-2 rounded-xl border text-xs font-semibold flex items-center justify-center space-x-1 transition ${
                    provider === 'iphone' 
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-800' 
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span>iPhone</span>
                </button>
                <button
                  type="button"
                  onClick={() => setProvider('microsoft')}
                  className={`py-2 px-2 rounded-xl border text-xs font-semibold flex items-center justify-center space-x-1 transition ${
                    provider === 'microsoft' 
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-800' 
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span>Microsoft</span>
                </button>
              </div>
            </div>

            {/* Registered Email */}
            <div className="space-y-1.5">
              <label htmlFor="verify-email-input" className="block text-xs font-bold text-gray-700">
                Registered Account Email
              </label>
              <input
                id="verify-email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter the registered email address"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
              />
            </div>

            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-[11px] text-gray-600 flex items-start space-x-2">
              <Shield className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                Resetting your password will clear any 12-hour lockout triggered by previous failed attempts.
              </span>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleVerifyAccount}
                disabled={isVerifying}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-sm flex items-center space-x-2"
              >
                {isVerifying ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <span>Verify Account</span>
                )}
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: SET NEW STRONG PASSWORD */}
        {step === 'new_password' && (
          <div className="space-y-4">
            
            {/* Suggested password box */}
            <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-emerald-900 flex items-center space-x-1">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Suggested Strong Password</span>
                </span>
                <button
                  type="button"
                  onClick={() => setSuggestedPassword(generateSuggestedPassword())}
                  className="p-1 text-emerald-700 hover:text-emerald-900"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
              <div className="flex items-center justify-between bg-white px-3 py-1.5 rounded-lg border border-emerald-200">
                <code className="text-xs font-mono font-bold text-emerald-900 select-all">
                  {suggestedPassword}
                </code>
                <button
                  type="button"
                  onClick={handleApplySuggested}
                  className="px-2 py-0.5 text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded transition"
                >
                  Use This
                </button>
              </div>
            </div>

            {/* New Password */}
            <div className="space-y-1.5">
              <label htmlFor="new-password-input" className="block text-xs font-bold text-gray-700">
                New Strong Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="new-password-input"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new strong password"
                  className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-gray-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div className="space-y-1.5">
              <label htmlFor="confirm-new-password-input" className="block text-xs font-bold text-gray-700">
                Confirm New Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="confirm-new-password-input"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-gray-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Checklist */}
            <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 text-[11px] space-y-1">
              <div className={`flex items-center space-x-1.5 ${passwordCheck.hasMinLength ? 'text-emerald-700 font-medium' : 'text-gray-500'}`}>
                {passwordCheck.hasMinLength ? <Check className="w-3 h-3 text-emerald-600" /> : <span className="w-3 h-3 rounded-full border border-gray-300" />}
                <span>8 and above characters</span>
              </div>
              <div className={`flex items-center space-x-1.5 ${passwordCheck.isValid ? 'text-emerald-700 font-medium' : 'text-gray-500'}`}>
                {passwordCheck.isValid ? <Check className="w-3 h-3 text-emerald-600" /> : <span className="w-3 h-3 rounded-full border border-gray-300" />}
                <span>Mix of letters, numbers, and special characters</span>
              </div>
              <div className={`flex items-center space-x-1.5 ${passwordsMatch ? 'text-emerald-700 font-medium' : 'text-gray-500'}`}>
                {passwordsMatch ? <Check className="w-3 h-3 text-emerald-600" /> : <span className="w-3 h-3 rounded-full border border-gray-300" />}
                <span>Passwords match</span>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setStep('verify')}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 transition"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleResetPassword}
                disabled={!passwordCheck.isValid || !passwordsMatch}
                className={`px-5 py-2 rounded-xl text-xs font-bold transition shadow-sm ${
                  passwordCheck.isValid && passwordsMatch
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                Update & Unlock Account
              </button>
            </div>

          </div>
        )}

      </div>
    </div>
  );
};
