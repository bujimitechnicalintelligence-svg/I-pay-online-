import { 
  GoogleAuthProvider, 
  OAuthProvider, 
  signInWithPopup, 
  UserCredential 
} from 'firebase/auth';
import { auth } from './firebase';
import { AuthProvider } from '../types';

export interface ExternalAuthResult {
  email: string;
  displayName: string;
  photoUrl?: string;
  uid: string;
  provider: AuthProvider;
}

/**
 * Initiates authentic external OAuth verification outside the app.
 * Opens genuine Google, Microsoft, or Apple authentication windows from the phone/browser.
 * Never simulates or auto-shows any fake or pre-filled email addresses.
 */
export async function authenticateWithExternalProvider(
  provider: AuthProvider
): Promise<ExternalAuthResult> {
  let authProvider: GoogleAuthProvider | OAuthProvider;

  if (provider === 'google') {
    const googleProv = new GoogleAuthProvider();
    googleProv.addScope('email');
    googleProv.addScope('profile');
    googleProv.setCustomParameters({ prompt: 'select_account' });
    authProvider = googleProv;
  } else if (provider === 'microsoft') {
    const msProv = new OAuthProvider('microsoft.com');
    msProv.addScope('mail.read');
    msProv.setCustomParameters({ prompt: 'select_account' });
    authProvider = msProv;
  } else {
    const appleProv = new OAuthProvider('apple.com');
    appleProv.addScope('email');
    appleProv.addScope('name');
    authProvider = appleProv;
  }

  try {
    const credential: UserCredential = await signInWithPopup(auth, authProvider);
    const user = credential.user;
    const email = (user.email || '').toLowerCase().trim();
    const displayName = user.displayName || email.split('@')[0] || 'User';
    const photoUrl = user.photoURL || undefined;

    return {
      email,
      displayName,
      photoUrl,
      uid: user.uid,
      provider
    };
  } catch (err: any) {
    if (err?.code === 'auth/popup-closed-by-user') {
      throw new Error('Verification cancelled in account window.');
    }
    if (err?.code === 'auth/popup-blocked') {
      throw new Error('Verification window was blocked by your browser. Please allow popups for this site or open in a new tab.');
    }
    if (err?.code === 'auth/network-request-failed') {
      throw new Error('Network error. Please check your internet connection and try again.');
    }
    throw new Error(err?.message || 'External account verification failed.');
  }
}
