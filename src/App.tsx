/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { UserAccount, ViewState } from './types';
import { getActiveSession } from './utils/authStorage';
import { performOneTimeCleanWipe } from './utils/wipeStorage';
import { WelcomeView } from './components/WelcomeView';
import { SignUpView } from './components/SignUpView';
import { SignInView } from './components/SignInView';
import { DashboardView } from './components/DashboardView';
import { SplashScreen } from './components/SplashScreen';

export default function App() {
  const [currentView, setCurrentView] = useState<ViewState>('welcome');
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [showSplash, setShowSplash] = useState(true);

  // Initialize: Clean wipe legacy mock data once, then check session
  useEffect(() => {
    performOneTimeCleanWipe();
    const session = getActiveSession();
    if (session) {
      setCurrentUser(session);
      setCurrentView('dashboard');
    } else {
      setCurrentView('welcome');
    }
  }, []);

  const handleSignUpSuccess = (user: UserAccount) => {
    setCurrentUser(user);
    setCurrentView('dashboard');
  };

  const handleSignInSuccess = (user: UserAccount) => {
    setCurrentUser(user);
    setCurrentView('dashboard');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentView('welcome');
  };

  return (
    <>
      {showSplash && (
        <SplashScreen onFinish={() => setShowSplash(false)} />
      )}

      {/* If user is authenticated, render the dashboard */}
      {currentUser && currentView === 'dashboard' && (
        <DashboardView
          currentUser={currentUser}
          onLogout={handleLogout}
          onUserUpdated={setCurrentUser}
        />
      )}

      {/* Sign Up Flow */}
      {currentView === 'signup_provider' && (
        <SignUpView
          onBackToWelcome={() => setCurrentView('welcome')}
          onGoToSignIn={() => setCurrentView('signin')}
          onSignUpComplete={handleSignUpSuccess}
        />
      )}

      {/* Sign In Flow */}
      {currentView === 'signin' && (
        <SignInView
          onBackToWelcome={() => setCurrentView('welcome')}
          onGoToSignUp={() => setCurrentView('signup_provider')}
          onSignInSuccess={handleSignInSuccess}
        />
      )}

      {/* Default: Welcome page */}
      {!currentUser && currentView === 'welcome' && (
        <WelcomeView
          onStartSignUp={() => setCurrentView('signup_provider')}
          onGoToSignIn={() => setCurrentView('signin')}
        />
      )}
    </>
  );
}
