import { ProductItem, UserSocialStats, FollowUserItem, AppNotification, UserAccount } from '../types';
import { MOCK_PRODUCTS } from '../data/mockSuperAppData';

const PRODUCTS_STORAGE_KEY = 'ipay_store_products_v3';
const DAILY_POSTS_TRACKER_KEY = 'ipay_store_daily_posts_v3';
const SOCIAL_STATS_KEY = 'ipay_user_social_v3';
const FOLLOWERS_KEY = 'ipay_user_followers_v3';
const FOLLOWING_KEY = 'ipay_user_following_v3';
const NOTIFICATIONS_KEY = 'ipay_notifications_v3';
const UNREAD_CHATS_KEY = 'ipay_unread_chats_v3';

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000; // 30 days expiration
export const DAILY_PRODUCT_LIMIT = 40; // 40 posts per day rule

// Empty initial lists: real data only from database
const INITIAL_FOLLOWERS: FollowUserItem[] = [];
const INITIAL_FOLLOWING: FollowUserItem[] = [];

// --- 1. IndexedDB Helper for Large Blobs and Files (No 5MB LocalStorage limit!) ---
const IDB_NAME = 'ipay_online_media_db_v1';
const IDB_VERSION = 1;
const IDB_STORE_MEDIA = 'media_blobs';

function openMediaDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = window.indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE_MEDIA)) {
        db.createObjectStore(IDB_STORE_MEDIA, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function storeMediaBlob(id: string, blob: Blob | File): Promise<string> {
  try {
    const db = await openMediaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_MEDIA, 'readwrite');
      const store = tx.objectStore(IDB_STORE_MEDIA);
      store.put({ id, blob, timestamp: Date.now() });
      tx.oncomplete = () => {
        const url = URL.createObjectURL(blob);
        resolve(url);
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Fallback to object URL
    return URL.createObjectURL(blob);
  }
}

export async function getMediaBlob(id: string): Promise<Blob | null> {
  try {
    const db = await openMediaDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE_MEDIA, 'readonly');
      const store = tx.objectStore(IDB_STORE_MEDIA);
      const request = store.get(id);
      request.onsuccess = () => {
        if (request.result && request.result.blob) {
          resolve(request.result.blob);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function hasMediaBlob(id: string): Promise<boolean> {
  const blob = await getMediaBlob(id);
  return blob !== null;
}

export async function deleteMediaBlob(id: string): Promise<void> {
  try {
    const db = await openMediaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_MEDIA, 'readwrite');
      const store = tx.objectStore(IDB_STORE_MEDIA);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

// --- 2. Store Products Management (with 1-month expiration & 3/day posting rules) ---
function getInitialStoreProducts(): ProductItem[] {
  return [];
}

// Filter out products expired after 1 month
export function getActiveStoreProducts(): ProductItem[] {
  try {
    const raw = localStorage.getItem(PRODUCTS_STORAGE_KEY);
    if (!raw) return [];
    const list: ProductItem[] = JSON.parse(raw);
    const now = Date.now();
    // Rule: A product disappears after 1 month (30 days)
    const active = list.filter(p => p.expiresAt && now < p.expiresAt);
    return active;
  } catch {
    return [];
  }
}

// Check how many products user posted today (Rule: 3 products per day only)
export function getTodayProductPostsCount(userDisplayName: string): number {
  try {
    const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const raw = localStorage.getItem(DAILY_POSTS_TRACKER_KEY);
    const tracker: Record<string, { date: string; count: number }> = raw ? JSON.parse(raw) : {};

    const userEntry = tracker[userDisplayName];
    if (!userEntry || userEntry.date !== todayStr) {
      return 0;
    }
    return userEntry.count;
  } catch {
    return 0;
  }
}

// Increment daily product count
function incrementTodayProductCount(userDisplayName: string): void {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const raw = localStorage.getItem(DAILY_POSTS_TRACKER_KEY);
    const tracker: Record<string, { date: string; count: number }> = raw ? JSON.parse(raw) : {};

    const current = tracker[userDisplayName]?.date === todayStr ? tracker[userDisplayName].count : 0;
    tracker[userDisplayName] = {
      date: todayStr,
      count: current + 1
    };
    localStorage.setItem(DAILY_POSTS_TRACKER_KEY, JSON.stringify(tracker));
  } catch (err) {
    console.warn('Failed to update daily post tracker', err);
  }
}

export function saveNewStoreProduct(
  productData: {
    name: string;
    description: string;
    priceNgn: number;
    image: string;
  },
  currentUser: UserAccount
): { success: boolean; error?: string; product?: ProductItem } {
  const currentCount = getTodayProductPostsCount(currentUser.displayName);
  if (currentCount >= DAILY_PRODUCT_LIMIT) {
    return {
      success: false,
      error: `Daily limit reached: Community rules allow a maximum of ${DAILY_PRODUCT_LIMIT} products per day (You have posted ${currentCount}/${DAILY_PRODUCT_LIMIT} today). Please try again tomorrow!`
    };
  }

  const now = Date.now();
  const newProduct: ProductItem = {
    id: 'prod_' + now,
    name: productData.name.trim(),
    description: productData.description.trim(),
    priceNgn: Math.max(100, Math.floor(productData.priceNgn)),
    image: productData.image,
    sellerName: currentUser.displayName,
    sellerUsername: currentUser.username,
    sellerId: currentUser.id,
    sellerAvatar: currentUser.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(currentUser.displayName)}`,
    location: `${currentUser.lga}, ${currentUser.state}`,
    createdAt: now,
    expiresAt: now + ONE_MONTH_MS, // 1 month expiration
    inStock: true,
    rating: 5.0,
    salesCount: 1
  };

  try {
    const currentProducts = getActiveStoreProducts();
    const updated = [newProduct, ...currentProducts];
    localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(updated));
    incrementTodayProductCount(currentUser.displayName);

    // Dispatch in-app and push notification about new post
    dispatchNotification({
      title: 'Product Published to Store 🛍️',
      body: `"${newProduct.name}" is now live on I-pay-online Store for ₦${newProduct.priceNgn.toLocaleString()}. Active for 30 days!`,
      type: 'post'
    });

    return { success: true, product: newProduct };
  } catch (err) {
    return { success: false, error: 'Failed to save product to database.' };
  }
}

export function updateStoreProduct(
  productId: string, 
  updates: Partial<ProductItem>
): boolean {
  try {
    const raw = localStorage.getItem(PRODUCTS_STORAGE_KEY);
    if (!raw) return false;
    const list: ProductItem[] = JSON.parse(raw);
    const index = list.findIndex(p => p.id === productId);
    if (index >= 0) {
      list[index] = { ...list[index], ...updates };
      localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(list));
      return true;
    }
    return false;
  } catch (err) {
    console.warn('Failed to update product in local database', err);
    return false;
  }
}

export function deleteStoreProduct(productId: string): boolean {
  try {
    const raw = localStorage.getItem(PRODUCTS_STORAGE_KEY);
    if (!raw) return false;
    const list: ProductItem[] = JSON.parse(raw);
    const updated = list.filter(p => p.id !== productId);
    localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(updated));
    return true;
  } catch (err) {
    console.warn('Failed to delete product from local database', err);
    return false;
  }
}

// --- 3. Followers, Following & Creator Rewards Management ---
export function getFollowersList(): FollowUserItem[] {
  try {
    const raw = localStorage.getItem(FOLLOWERS_KEY);
    if (!raw) {
      localStorage.setItem(FOLLOWERS_KEY, JSON.stringify(INITIAL_FOLLOWERS));
      return INITIAL_FOLLOWERS;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_FOLLOWERS;
  }
}

export function getFollowingList(): FollowUserItem[] {
  try {
    const raw = localStorage.getItem(FOLLOWING_KEY);
    if (!raw) {
      localStorage.setItem(FOLLOWING_KEY, JSON.stringify(INITIAL_FOLLOWING));
      return INITIAL_FOLLOWING;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_FOLLOWING;
  }
}

export function unfollowUser(userId: string): FollowUserItem[] {
  try {
    const list = getFollowingList();
    const updated = list.filter(u => u.id !== userId);
    localStorage.setItem(FOLLOWING_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

export function followUser(user: FollowUserItem): FollowUserItem[] {
  try {
    const list = getFollowingList();
    if (!list.some(u => u.id === user.id)) {
      const updated = [...list, user];
      localStorage.setItem(FOLLOWING_KEY, JSON.stringify(updated));
      return updated;
    }
    return list;
  } catch {
    return [];
  }
}

export function getUserLikesCount(): number {
  try {
    const raw = localStorage.getItem(SOCIAL_STATS_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (typeof data.totalLikes === 'number') return data.totalLikes;
    }
    return 0;
  } catch {
    return 0;
  }
}

export function setUserLikesCount(count: number): void {
  try {
    const raw = localStorage.getItem(SOCIAL_STATS_KEY);
    const current = raw ? JSON.parse(raw) : {};
    current.totalLikes = Math.max(0, count);
    localStorage.setItem(SOCIAL_STATS_KEY, JSON.stringify(current));
  } catch (err) {
    console.warn('Failed to set likes count', err);
  }
}

export function getUserSocialStats(): UserSocialStats {
  const followers = getFollowersList();
  const following = getFollowingList();
  const totalLikes = getUserLikesCount();

  const followersCount = followers.length;
  const followingCount = following.length;

  // Rule 1: "if a user has 20 followers real followers let his account got a special badge"
  const hasSpecialBadge = followersCount >= 20;

  // Rule 2: "if he has 20 likes plus 20 followers he unlocks 5 thousand naira 5k will be shown in your account in naira visible to you only"
  const isRewardUnlocked = followersCount >= 20 && totalLikes >= 20;
  const unlockedRewardNgn = isRewardUnlocked ? 5000 : 0;

  return {
    followersCount,
    followingCount,
    totalLikes,
    unlockedRewardNgn,
    hasSpecialBadge
  };
}

// --- 4. Real-time Notifications (Device Push & In-App Alerts) ---
export function requestPushNotificationPermission(): void {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }
}

export function dispatchNotification(data: {
  title: string;
  body: string;
  type: 'chat' | 'post' | 'reward' | 'follow';
  senderAvatar?: string;
}): void {
  const newNotif: AppNotification = {
    id: 'notif_' + Date.now(),
    title: data.title,
    body: data.body,
    timestamp: Date.now(),
    type: data.type,
    read: false,
    senderAvatar: data.senderAvatar
  };

  // 1. In-app history
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_KEY);
    const list: AppNotification[] = raw ? JSON.parse(raw) : [];
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify([newNotif, ...list.slice(0, 49)]));
  } catch (err) {
    console.warn('Failed to record notification', err);
  }

  // 2. Hardware / Browser Push Notification (visible outside the app!)
  if (typeof window !== 'undefined' && 'Notification' in window) {
    const iconUrl = data.senderAvatar || '/app-icon.png';
    const triggerPush = (reg?: ServiceWorkerRegistration) => {
      try {
        if (reg && 'showNotification' in reg) {
          reg.showNotification(data.title, {
            body: data.body,
            icon: iconUrl,
            badge: iconUrl,
            vibrate: [150, 75, 150],
            tag: 'ipay_' + Date.now(),
            renotify: true
          } as NotificationOptions);
          return;
        }
      } catch {}

      try {
        new Notification(data.title, {
          body: data.body,
          icon: iconUrl,
          badge: iconUrl,
          silent: false
        });
      } catch {}
    };

    if (Notification.permission === 'granted') {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(triggerPush).catch(() => triggerPush());
      } else {
        triggerPush();
      }
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((perm) => {
        if (perm === 'granted') {
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(triggerPush).catch(() => triggerPush());
          } else {
            triggerPush();
          }
        }
      });
    }
  }

  // 3. Mark unread if it is a chat notification
  if (data.type === 'chat') {
    incrementUnreadChatBadge();
  }

  // Trigger custom window event for instant UI update
  window.dispatchEvent(new CustomEvent('ipay_notification_received', { detail: newNotif }));
}

// --- 5. Unread Chat Badge Tracker ---
export function getUnreadChatBadgeCount(): number {
  try {
    const raw = localStorage.getItem(UNREAD_CHATS_KEY);
    return raw ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

export function incrementUnreadChatBadge(): void {
  try {
    const current = getUnreadChatBadgeCount();
    localStorage.setItem(UNREAD_CHATS_KEY, (current + 1).toString());
    window.dispatchEvent(new CustomEvent('ipay_unread_chat_changed', { detail: current + 1 }));
  } catch (err) {
    console.warn('Failed to increment unread chat badge', err);
  }
}

export function clearUnreadChatBadge(): void {
  try {
    localStorage.setItem(UNREAD_CHATS_KEY, '0');
    window.dispatchEvent(new CustomEvent('ipay_unread_chat_changed', { detail: 0 }));
  } catch (err) {
    console.warn('Failed to clear unread chat badge', err);
  }
}

// Complete wipe utility to purge all legacy mock and cached storage once
export function wipeAllDatabaseAndStorage(): void {
  try {
    const keysToRemove = [
      PRODUCTS_STORAGE_KEY,
      DAILY_POSTS_TRACKER_KEY,
      SOCIAL_STATS_KEY,
      FOLLOWERS_KEY,
      FOLLOWING_KEY,
      NOTIFICATIONS_KEY,
      UNREAD_CHATS_KEY,
      'ipay_videos_v2',
      'ipay_cached_video_ids_v2',
      'ipay_watched_video_ids_v2',
      'superapp_users_v2',
      'superapp_active_session_v2',
      'superapp_login_attempts_v2',
      'ipay_device_registered_accounts_v4',
      'ipay_chat_contacts_v4',
      'ipay_chat_messages_v4',
      'ipay_blocked_users_v4',
      'ipay_online_media_db_v1'
    ];
    keysToRemove.forEach(k => localStorage.removeItem(k));
    
    // Clear IndexedDB completely
    if (typeof window !== 'undefined' && window.indexedDB) {
      try {
        window.indexedDB.deleteDatabase(IDB_NAME);
      } catch (idbErr) {
        console.warn('IDB deletion notice:', idbErr);
      }
    }
  } catch (err) {
    console.warn('Failed to wipe all storage:', err);
  }
}
