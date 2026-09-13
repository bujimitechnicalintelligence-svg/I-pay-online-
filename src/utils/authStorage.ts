import { UserAccount, AuthProvider, LoginAttemptRecord } from '../types';
import { syncUserProfileToCloud, fetchUserFromFirestoreByEmail } from './cloudSync';

const STORAGE_USERS_KEY = 'superapp_users_v2';
const STORAGE_SESSION_KEY = 'superapp_active_session_v2';
const STORAGE_ATTEMPTS_KEY = 'superapp_login_attempts_v2';
const STORAGE_DEVICE_ACCOUNTS_KEY = 'ipay_device_registered_accounts_v4';
export const MAX_DEVICE_ACCOUNTS_LIMIT = 2; // Rule: A device can sign up in different accounts two times only (max 2)

// Password Strength Validator
export interface PasswordValidationResult {
  isValid: boolean;
  hasMinLength: boolean;
  hasLetters: boolean;
  hasNumbers: boolean;
  hasSpecialChar: boolean;
  hasUpperCase: boolean;
  hasLowerCase: boolean;
}

export function validateStrongPassword(password: string): PasswordValidationResult {
  const hasMinLength = password.length >= 8;
  const hasLetters = /[a-zA-Z]/.test(password);
  const hasNumbers = /[0-9]/.test(password);
  const hasSpecialChar = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/.test(password);
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);

  const isValid = hasMinLength && hasLetters && hasNumbers && hasSpecialChar;

  return {
    isValid,
    hasMinLength,
    hasLetters,
    hasNumbers,
    hasSpecialChar,
    hasUpperCase,
    hasLowerCase
  };
}

// Suggested Strong Password Generator
export function generateSuggestedPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const numbers = "23456789";
  const special = "!@#$%^&*_-+=";

  const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)];

  const passwordParts = [
    pick(upper),
    pick(lower),
    pick(numbers),
    pick(special),
    pick(upper),
    pick(lower),
    pick(numbers),
    pick(special),
    pick(upper + lower),
    pick(numbers + special)
  ];

  // Shuffle
  return passwordParts.sort(() => Math.random() - 0.5).join('');
}

// Registered accounts in database (starts completely empty - no fake seeds)
export function getRegisteredAccounts(): UserAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_USERS_KEY);
    if (!raw) return [];
    const accounts: UserAccount[] = JSON.parse(raw);
    return Array.isArray(accounts) ? accounts : [];
  } catch {
    return [];
  }
}

export function saveRegisteredAccount(newAccount: UserAccount): void {
  const accounts = getRegisteredAccounts();
  const updated = [...accounts.filter(a => a.id !== newAccount.id), newAccount];
  localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(updated));

  // Also sync to Cloud Firestore cross-device database
  syncUserProfileToCloud(newAccount).catch(err => {
    console.warn('Background user cloud sync error:', err);
  });
}

export const saveNewUserAccount = saveRegisteredAccount;

export function updateUserAccount(updatedUser: UserAccount): void {
  const accounts = getRegisteredAccounts();
  const updated = accounts.map(a => a.id === updatedUser.id ? updatedUser : a);
  localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(updated));
  setActiveSession(updatedUser);

  // Sync updated profile to Firestore
  syncUserProfileToCloud(updatedUser).catch(err => {
    console.warn('Background update cloud sync error:', err);
  });
}

export function updateAccountPassword(provider: AuthProvider, email: string, newPassword: string): boolean {
  const accounts = getRegisteredAccounts();
  const accountIndex = accounts.findIndex(
    a => a.providerEmail.toLowerCase() === email.toLowerCase()
  );

  if (accountIndex === -1) return false;

  accounts[accountIndex].passwordHash = newPassword;
  localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(accounts));
  
  // Sync to Firestore
  syncUserProfileToCloud(accounts[accountIndex]).catch(() => {});

  // Clear lockout on successful reset
  resetLockout(provider, email);
  return true;
}

export function findAccountByProviderAndEmail(provider: AuthProvider, email: string): UserAccount | undefined {
  const accounts = getRegisteredAccounts();
  return accounts.find(
    a => a.providerEmail.toLowerCase().trim() === email.toLowerCase().trim()
  );
}

export function findAccountByEmail(email: string): UserAccount | undefined {
  const accounts = getRegisteredAccounts();
  return accounts.find(
    a => a.providerEmail.toLowerCase().trim() === email.toLowerCase().trim()
  );
}

export function isUsernameAvailable(username: string, excludeUserId?: string): boolean {
  const accounts = getRegisteredAccounts();
  const clean = username.trim().toLowerCase();
  return !accounts.some(a => a.username.toLowerCase() === clean && a.id !== excludeUserId);
}

// Active Session Management
export function getActiveSession(): UserAccount | null {
  try {
    const raw = localStorage.getItem(STORAGE_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserAccount;
  } catch {
    return null;
  }
}

export function setActiveSession(account: UserAccount): void {
  localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(account));
}

export function clearActiveSession(): void {
  localStorage.removeItem(STORAGE_SESSION_KEY);
}

// Sign-in Lockout Management (5 wrong attempts -> 12-hour lockout)
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

function getAttemptsMap(): Record<string, LoginAttemptRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_ATTEMPTS_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveAttemptsMap(map: Record<string, LoginAttemptRecord>): void {
  localStorage.setItem(STORAGE_ATTEMPTS_KEY, JSON.stringify(map));
}

function getAttemptKey(provider: AuthProvider, email?: string): string {
  return `${provider}:${(email || 'default').toLowerCase().trim()}`;
}

export function checkAccountLockout(provider: AuthProvider, email?: string): { isLocked: boolean; remainingMs: number; failedAttempts: number } {
  const map = getAttemptsMap();
  const key = getAttemptKey(provider, email);
  const record = map[key];

  if (!record) {
    return { isLocked: false, remainingMs: 0, failedAttempts: 0 };
  }

  const now = Date.now();
  if (record.lockedUntil && now < record.lockedUntil) {
    return {
      isLocked: true,
      remainingMs: record.lockedUntil - now,
      failedAttempts: record.failedAttempts
    };
  }

  // Lockout expired: reset
  if (record.lockedUntil && now >= record.lockedUntil) {
    delete map[key];
    saveAttemptsMap(map);
    return { isLocked: false, remainingMs: 0, failedAttempts: 0 };
  }

  return {
    isLocked: false,
    remainingMs: 0,
    failedAttempts: record.failedAttempts
  };
}

export function recordFailedLoginAttempt(provider: AuthProvider, email?: string): { isNowLocked: boolean; remainingAttempts: number } {
  const map = getAttemptsMap();
  const key = getAttemptKey(provider, email);
  const current: LoginAttemptRecord = map[key] || { failedAttempts: 0, lockedUntil: null };

  current.failedAttempts += 1;

  let isNowLocked = false;
  if (current.failedAttempts >= 5) {
    current.lockedUntil = Date.now() + TWELVE_HOURS_MS;
    isNowLocked = true;
  }

  map[key] = current;
  saveAttemptsMap(map);

  return {
    isNowLocked,
    remainingAttempts: Math.max(0, 5 - current.failedAttempts)
  };
}

export function resetLockout(provider: AuthProvider, email?: string): void {
  const map = getAttemptsMap();
  const key = getAttemptKey(provider, email);
  if (map[key]) {
    delete map[key];
    saveAttemptsMap(map);
  }
}

// Device Accounts Registration Limit Enforcement (Strict Rule: Max 2 accounts per device)
export function getDeviceRegisteredAccountIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_DEVICE_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveDeviceRegisteredAccountIds(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_DEVICE_ACCOUNTS_KEY, JSON.stringify(Array.from(new Set(ids))));
  } catch {
    // ignore
  }
}

export function getDeviceRegisteredAccounts(): UserAccount[] {
  const accountIds = new Set(getDeviceRegisteredAccountIds());
  const allAccounts = getRegisteredAccounts();
  return allAccounts.filter(a => accountIds.has(a.id));
}

export function checkDeviceCanRegisterAccount(accountId?: string): {
  canRegister: boolean;
  registeredCount: number;
  maxLimit: number;
  error?: string;
} {
  const deviceIds = getDeviceRegisteredAccountIds();
  const isAlreadyRegistered = accountId ? deviceIds.includes(accountId) : false;

  if (isAlreadyRegistered) {
    return {
      canRegister: true,
      registeredCount: deviceIds.length,
      maxLimit: MAX_DEVICE_ACCOUNTS_LIMIT
    };
  }

  if (deviceIds.length >= MAX_DEVICE_ACCOUNTS_LIMIT) {
    return {
      canRegister: false,
      registeredCount: deviceIds.length,
      maxLimit: MAX_DEVICE_ACCOUNTS_LIMIT,
      error: `Device limit reached: A device can sign up in different accounts 2 times only (maximum 2). This device already has ${deviceIds.length} accounts registered. You cannot create a 3rd account on this device.`
    };
  }

  return {
    canRegister: true,
    registeredCount: deviceIds.length,
    maxLimit: MAX_DEVICE_ACCOUNTS_LIMIT
  };
}

export function registerAccountToDevice(accountId: string): boolean {
  const deviceIds = getDeviceRegisteredAccountIds();
  if (deviceIds.includes(accountId)) return true;

  if (deviceIds.length >= MAX_DEVICE_ACCOUNTS_LIMIT) {
    return false;
  }

  deviceIds.push(accountId);
  saveDeviceRegisteredAccountIds(deviceIds);
  return true;
}
