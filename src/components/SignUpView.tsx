import React, { useState } from 'react';
import { 
  ArrowLeft, CheckCircle2, ShieldCheck, MapPin, 
  Upload, Eye, EyeOff, AlertCircle, RefreshCw, Loader2
} from 'lucide-react';
import boyImage from '../assets/images/boy_earpods_phone_1789032122744.jpg';
import { AuthProvider, UserAccount } from '../types';
import { NIGERIAN_STATES_DATA } from '../data/nigeriaLocations';

type SignUpStep = 'provider' | 'details' | 'password';
import { 
  findAccountByEmail, 
  saveNewUserAccount, 
  validateStrongPassword,
  checkDeviceCanRegisterAccount,
  getDeviceRegisteredAccounts
} from '../utils/authStorage';
import { publishUserToFirestore, fetchUserFromFirestoreByEmail } from '../utils/cloudSync';
import { authenticateWithExternalProvider } from '../utils/oauthAuth';

interface SignUpViewProps {
  onBackToWelcome: () => void;
  onGoToSignIn: () => void;
  onSignUpComplete: (user: UserAccount) => void;
}

interface ChosenAccountData {
  email: string;
  displayName: string;
  avatarImg?: string;
  provider: AuthProvider;
}

export const SignUpView: React.FC<SignUpViewProps> = ({
  onBackToWelcome,
  onGoToSignIn,
  onSignUpComplete
}) => {
  const [currentStep, setCurrentStep] = useState<SignUpStep>('CHOOSE_ACCOUNT');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Selected Account Metadata from external verification
  const [chosenAccount, setChosenAccount] = useState<ChosenAccountData | null>(null);

  // Step 1: Location State
  const [selectedState, setSelectedState] = useState<string>('Kano');
  const [selectedLga, setSelectedLga] = useState<string>('Kano Municipal');
  const [townArea, setTownArea] = useState<string>('');

  // Step 2: Profile Picture, Username, & Password State
  const [username, setUsername] = useState<string>('');
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const deviceAccounts = getDeviceRegisteredAccounts();

  // Find LGAs for the selected Nigerian State
  const currentStateData = NIGERIAN_STATES_DATA.find(
    s => s.state.toLowerCase() === selectedState.toLowerCase()
  ) || NIGERIAN_STATES_DATA[0];

  // Start real external OAuth verification outside the app
  const handleStartExternalAuth = async (provider: AuthProvider) => {
    setErrorMessage(null);
    setIsAuthenticating(true);

    try {
      const result = await authenticateWithExternalProvider(provider);
      const email = result.email.toLowerCase().trim();

      // 1. Check if an account already exists for this email
      const localExisting = findAccountByEmail(email);
      let cloudExisting = null;
      if (!localExisting) {
        try {
          cloudExisting = await fetchUserFromFirestoreByEmail(email);
        } catch {
          // ignore
        }
      }

      if (localExisting || cloudExisting) {
        setErrorMessage(
          `An I-pay-online account already exists for "${result.email}". Please switch to Sign In with your password.`
        );
        setIsAuthenticating(false);
        return;
      }

      // 2. Rule: "a device can Sign up in different accounts two times only"
      const check = checkDeviceCanRegisterAccount();
      if (!check.canRegister) {
        setErrorMessage(
          check.error || 'Device limit reached: A device can sign up in different accounts 2 times only (maximum 2).'
        );
        setIsAuthenticating(false);
        return;
      }

      setChosenAccount({
        email: result.email,
        displayName: result.displayName,
        avatarImg: result.photoUrl,
        provider: result.provider
      });

      // Suggest clean username based on selected email or name
      const rawSuggested = result.email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
      setUsername(`@${rawSuggested}`);

      if (result.photoUrl) {
        setAvatarUrl(result.photoUrl);
      } else {
        setAvatarUrl(`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(result.displayName)}`);
      }

      setIsAuthenticating(false);
      setCurrentStep('LOCATION');
    } catch (err: any) {
      setIsAuthenticating(false);
      setErrorMessage(err.message || 'Verification cancelled or failed.');
    }
  };

  // Step 1 -> Step 2
  const handleLocationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedState.trim()) {
      setErrorMessage('Please select your State in Nigeria.');
      return;
    }
    if (!selectedLga.trim()) {
      setErrorMessage('Please select your Local Government Area (LGA).');
      return;
    }
    setErrorMessage(null);
    setCurrentStep('PROFILE_SECURITY');
  };

  // Profile Picture File Upload (converts photo to data URL)
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Photo must be less than 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAvatarUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Step 2: Final Account Creation
  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!chosenAccount) {
      setErrorMessage('No account selected. Please start over.');
      return;
    }

    // Username validation
    const cleanUsername = username.trim().toLowerCase();
    if (!cleanUsername.startsWith('@') || cleanUsername.length < 3) {
      setErrorMessage('Username must start with @ and have at least 3 characters.');
      return;
    }

    // Password validation: Strong password mandatory
    const passCheck = validateStrongPassword(password);
    if (!passCheck.isValid) {
      setErrorMessage(
        'Password does not meet security requirements: Must have 8+ characters, uppercase letter, lowercase letter, number, and special symbol.'
      );
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please re-enter.');
      return;
    }

    setIsSubmitting(true);

    try {
      const newAccount: UserAccount = {
        id: 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        displayName: chosenAccount.displayName,
        username: cleanUsername,
        provider: chosenAccount.provider,
        providerEmail: chosenAccount.email,
        state: selectedState,
        lga: selectedLga,
        address: townArea.trim() || '',
        avatarUrl: avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(chosenAccount.displayName)}`,
        passwordHash: password,
        createdAt: Date.now()
      };

      // 1. Save in local device storage
      saveNewUserAccount(newAccount);

      // 2. Sync to Firestore cross-device database
      await publishUserToFirestore(newAccount);

      setIsSubmitting(false);
      onSignUpComplete(newAccount);
    } catch {
      setIsSubmitting(false);
      setErrorMessage('Failed to complete registration. Please try again.');
    }
  };

  const passValidation = validateStrongPassword(password);

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
      
      {/* Top Navigation Bar */}
      <div className="w-full max-w-md mx-auto flex items-center justify-between">
        <button
          onClick={() => {
            if (currentStep === 'PROFILE_SECURITY') setCurrentStep('LOCATION');
            else if (currentStep === 'LOCATION') setCurrentStep('CHOOSE_ACCOUNT');
            else onBackToWelcome();
          }}
          className="p-2 rounded-full hover:bg-gray-100 text-gray-600 transition cursor-pointer flex items-center space-x-1.5 text-xs font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <span className="text-xs font-bold text-emerald-800 bg-emerald-100/70 px-3 py-1 rounded-full flex items-center space-x-1">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>
            {currentStep === 'CHOOSE_ACCOUNT' && 'Account Sign Up'}
            {currentStep === 'LOCATION' && 'Step 1 of 2: Location'}
            {currentStep === 'PROFILE_SECURITY' && 'Step 2 of 2: Profile & Security'}
          </span>
        </span>
      </div>

      {/* Main Container */}
      <div className="w-full max-w-md mx-auto my-auto space-y-4">
        
        {/* Visual Banner */}
        <div className="w-full h-36 rounded-3xl overflow-hidden shadow-xl border border-emerald-100 relative bg-emerald-950">
          <img
            src={boyImage}
            alt="Young Nigerian boy with phone"
            className="w-full h-full object-cover object-top"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-4">
            <div className="flex items-center space-x-1.5 mb-0.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300 bg-emerald-950/70 px-2 py-0.5 rounded-full border border-emerald-500/30">
                Official Registration
              </span>
            </div>
            <h2 className="text-lg font-black text-white leading-tight">
              Create Your I-pay-online Account
            </h2>
          </div>
        </div>

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start space-x-2.5 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
            <span className="flex-1 font-medium">{errorMessage}</span>
          </div>
        )}

        {/* STEP 0: CHOOSE ACCOUNT WITH EXTERNAL VERIFICATION */}
        {currentStep === 'CHOOSE_ACCOUNT' && (
          <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-emerald-100/80 space-y-4">
            <div className="text-center space-y-1">
              <h3 className="text-base font-extrabold text-gray-950">
                Verify Your Account
              </h3>
              <p className="text-xs text-gray-500">
                Verify outside the app with Google, Microsoft, or Apple
              </p>
            </div>

            {/* Provider Options */}
            <div className="space-y-3 pt-2">
              {providers.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleStartExternalAuth(p.id)}
                  disabled={isAuthenticating}
                  className={`w-full py-3.5 px-4 rounded-2xl border font-bold text-xs flex items-center justify-between shadow-xs hover:shadow-md transition active:scale-[0.99] cursor-pointer disabled:opacity-60 ${p.bg} ${p.border}`}
                >
                  <div className="flex items-center space-x-3">
                    <img src={p.icon} alt={p.name} className="w-5 h-5 object-contain" />
                    <span>{p.name}</span>
                  </div>
                  {isAuthenticating ? (
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  ) : (
                    <span className="text-[11px] text-gray-400 font-medium">Verify outside →</span>
                  )}
                </button>
              ))}
            </div>

            {/* Device Registration Slot Enforcement Notice */}
            <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
              <span className="flex items-center space-x-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Device slot: {deviceAccounts.length}/2 registered</span>
              </span>
              <span className="text-emerald-700 font-bold">Max 2 per phone</span>
            </div>
          </div>
        )}

        {/* STEP 1: SELECT LOCATION */}
        {currentStep === 'LOCATION' && chosenAccount && (
          <form onSubmit={handleLocationSubmit} className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-emerald-100/80 space-y-4">
            <div className="flex items-center space-x-3 p-3 rounded-2xl bg-emerald-50/70 border border-emerald-100">
              <img
                src={chosenAccount.avatarImg || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(chosenAccount.displayName)}`}
                alt={chosenAccount.displayName}
                className="w-10 h-10 rounded-full object-cover border border-emerald-400"
              />
              <div className="truncate">
                <p className="text-xs font-bold text-gray-900 truncate">{chosenAccount.displayName}</p>
                <p className="text-[11px] text-gray-500 truncate">{chosenAccount.email}</p>
              </div>
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-extrabold text-gray-950 flex items-center space-x-1.5">
                <MapPin className="w-4 h-4 text-emerald-600" />
                <span>Your Location in Nigeria</span>
              </h3>
              <p className="text-xs text-gray-500">
                Required for localized state feeds and community connection.
              </p>
            </div>

            {/* State Selection */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Select State <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedState}
                onChange={(e) => {
                  const newState = e.target.value;
                  setSelectedState(newState);
                  const matched = NIGERIAN_STATES_DATA.find(s => s.state === newState);
                  if (matched && matched.lgas.length > 0) {
                    setSelectedLga(matched.lgas[0]);
                  }
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-gray-900 text-xs font-medium focus:outline-hidden focus:border-emerald-600 bg-white"
                required
              >
                {NIGERIAN_STATES_DATA.map((s) => (
                  <option key={s.state} value={s.state}>
                    {s.state} State ({s.capital})
                  </option>
                ))}
              </select>
            </div>

            {/* LGA Selection */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Local Government Area (LGA) <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedLga}
                onChange={(e) => setSelectedLga(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-gray-900 text-xs font-medium focus:outline-hidden focus:border-emerald-600 bg-white"
                required
              >
                {currentStateData.lgas.map((lga) => (
                  <option key={lga} value={lga}>
                    {lga}
                  </option>
                ))}
              </select>
            </div>

            {/* Town / Area (Optional) */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Town / Neighborhood / Area <span className="text-gray-400 text-[10px]">(Optional)</span>
              </label>
              <input
                type="text"
                value={townArea}
                onChange={(e) => setTownArea(e.target.value)}
                placeholder="e.g. Fagge, Sabon Gari, Wuse II, Ikeja GRA"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-gray-900 text-xs font-medium focus:outline-hidden focus:border-emerald-600 bg-white"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs shadow-md transition cursor-pointer flex items-center justify-center space-x-1.5"
            >
              <span>Continue to Profile & Password</span>
              <span>→</span>
            </button>
          </form>
        )}

        {/* STEP 2: PROFILE PICTURE, USERNAME & PASSWORD */}
        {currentStep === 'PROFILE_SECURITY' && chosenAccount && (
          <form onSubmit={handleFinalSubmit} className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-emerald-100/80 space-y-4">
            
            {/* Profile Picture upload */}
            <div className="flex flex-col items-center justify-center space-y-2 pb-2">
              <div className="relative group">
                <img
                  src={avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(chosenAccount.displayName)}`}
                  alt="Avatar"
                  className="w-20 h-20 rounded-full object-cover border-4 border-emerald-500 shadow-md bg-white"
                />
                <label
                  htmlFor="photo_upload"
                  className="absolute bottom-0 right-0 p-1.5 bg-emerald-600 text-white rounded-full shadow-lg hover:bg-emerald-700 transition cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <input
                    id="photo_upload"
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>
              </div>
              <span className="text-[11px] text-gray-500">Tap icon to upload custom profile picture</span>
            </div>

            {/* Username */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Username <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  let val = e.target.value;
                  if (!val.startsWith('@')) val = '@' + val;
                  setUsername(val);
                }}
                placeholder="@username"
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-gray-900 text-xs font-medium focus:outline-hidden focus:border-emerald-600 bg-white"
              />
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-gray-700">
                  Password <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[11px] text-emerald-700 hover:text-emerald-800 flex items-center space-x-1 cursor-pointer font-medium"
                >
                  {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  <span>{showPassword ? 'Hide' : 'Show'}</span>
                </button>
              </div>

              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 chars, uppercase, lowercase, number, symbol"
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-gray-900 text-xs font-medium focus:outline-hidden focus:border-emerald-600 bg-white"
              />

              {/* Password strength checklist */}
              <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] text-gray-500">
                <span className={passValidation.hasMinLength ? 'text-emerald-600 font-bold' : ''}>
                  {passValidation.hasMinLength ? '✓' : '•'} At least 8 characters
                </span>
                <span className={passValidation.hasUpperCase ? 'text-emerald-600 font-bold' : ''}>
                  {passValidation.hasUpperCase ? '✓' : '•'} Uppercase (A-Z)
                </span>
                <span className={passValidation.hasLowerCase ? 'text-emerald-600 font-bold' : ''}>
                  {passValidation.hasLowerCase ? '✓' : '•'} Lowercase (a-z)
                </span>
                <span className={passValidation.hasNumbers ? 'text-emerald-600 font-bold' : ''}>
                  {passValidation.hasNumbers ? '✓' : '•'} Numbers (0-9)
                </span>
                <span className={passValidation.hasSpecialChar ? 'text-emerald-600 font-bold' : ''}>
                  {passValidation.hasSpecialChar ? '✓' : '•'} Special (!@#$%)
                </span>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Confirm Password <span className="text-red-500">*</span>
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-gray-900 text-xs font-medium focus:outline-hidden focus:border-emerald-600 bg-white"
              />
            </div>

            {/* Summary Tag */}
            <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-100 text-[11px] text-emerald-900 flex items-center justify-between">
              <span>Location: <strong>{selectedLga}, {selectedState}</strong></span>
              <span>Account: <strong>{chosenAccount.email}</strong></span>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs shadow-md transition cursor-pointer flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Creating Account...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Complete Sign Up</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* Bottom Link to Sign In */}
        <div className="text-center">
          <p className="text-xs text-gray-500">
            Already have an account?{' '}
            <button
              onClick={onGoToSignIn}
              className="font-bold text-emerald-700 hover:text-emerald-800 underline cursor-pointer"
            >
              Sign in with your device
            </button>
          </p>
        </div>

      </div>

    </div>
  );
};
