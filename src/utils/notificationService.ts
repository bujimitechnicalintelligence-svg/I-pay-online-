// Push Notification & Sound Chime Service for Incoming Chats
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { addMessageToChat, upsertChatConversation } from './chatStorage';

let hasRequestedPermission = false;
let audioContext: AudioContext | null = null;

// Initialize or resume web audio context
function getAudioContext(): AudioContext | null {
  try {
    if (!audioContext) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        audioContext = new AudioCtx();
      }
    }
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }
    return audioContext;
  } catch {
    return null;
  }
}

// Play a pleasant 2-tone incoming message sound directly through phone speaker
export function playNotificationSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Tone 1: 587.33 Hz (D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.15);

    // Tone 2: 880 Hz (A5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.12);
    gain2.gain.setValueAtTime(0.2, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.35);

    // Phone vibration if supported
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([100, 50, 100]);
    }
  } catch (err) {
    console.warn('Could not play chime:', err);
  }
}

// Force Request Notification Permission from Device (Android / iOS / Desktop)
export async function requestPushPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;

  try {
    if (Notification.permission === 'granted') {
      hasRequestedPermission = true;
      return true;
    }
    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      hasRequestedPermission = permission === 'granted';
      return hasRequestedPermission;
    }
  } catch (e) {
    console.warn('Error requesting notification permission:', e);
  }
  return false;
}

// Force Trigger Phone Notification Banner across devices
export function showPhoneNotification(title: string, body: string, icon?: string): void {
  playNotificationSound();

  const iconUrl = icon || '/app-icon.png';

  const triggerNative = (reg?: ServiceWorkerRegistration) => {
    try {
      if (reg && 'showNotification' in reg) {
        reg.showNotification(title, {
          body,
          icon: iconUrl,
          badge: iconUrl,
          vibrate: [150, 75, 150],
          tag: 'ipay_' + Date.now(),
          renotify: true
        } as NotificationOptions);
        return;
      }
    } catch {
      // fallback
    }

    try {
      new Notification(title, {
        body,
        icon: iconUrl,
        badge: iconUrl,
        silent: false
      });
    } catch (err) {
      console.warn('Failed to display native notification', err);
    }
  };

  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(triggerNative).catch(() => triggerNative());
      } else {
        triggerNative();
      }
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((perm) => {
        if (perm === 'granted') {
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(triggerNative).catch(() => triggerNative());
          } else {
            triggerNative();
          }
        }
      });
    }
  }
}

// Listen to incoming messages for the logged-in user and alert when outside the app or not chatting
export function listenForIncomingChatNotifications(
  currentUserId: string,
  currentChatContactId: string | null,
  onNewMessageBanner?: (senderName: string, text: string, avatar?: string) => void
): () => void {
  if (!currentUserId) return () => {};

  try {
    const msgsCol = collection(db, 'chat_messages');
    // Query messages where receiver is current user
    const q = query(
      msgsCol,
      where('receiverId', '==', currentUserId)
    );

    const initialProcessedIds = new Set<string>();
    let isInitialLoad = true;

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const docId = change.doc.id;
          const senderId = data.senderId;
          const senderName = data.senderName || 'Member';
          const senderAvatar = data.senderAvatar || '';
          const text = data.text || '';
          const timeStr = data.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const createdAt = typeof data.createdAt === 'number' ? data.createdAt : Date.now();

          // Save message to device storage so conversations and chat history persist immediately
          addMessageToChat(senderId, {
            id: docId,
            senderId,
            senderName,
            text,
            timestamp: timeStr,
            isMe: false,
            status: 'delivered',
            createdAt
          });

          // Ensure sender is saved in the user's contacts list
          upsertChatConversation({
            id: senderId,
            name: senderName,
            username: '@' + senderName.toLowerCase().replace(/\s+/g, ''),
            avatar: senderAvatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(senderName)}`,
            lastMessage: text,
            time: timeStr,
            unreadCount: (currentChatContactId === senderId) ? 0 : 1,
            online: true
          });

          // Dispatch event so active chat view or conversation lists update instantly
          window.dispatchEvent(new CustomEvent('ipay_chat_message_received', {
            detail: {
              senderId,
              senderName,
              text,
              messageId: docId
            }
          }));

          // Trigger Push Notification, Sound Chime, and In-App Banner if this is a newly arrived message
          if (!isInitialLoad && !initialProcessedIds.has(docId)) {
            const isAppInBackground = typeof document !== 'undefined' && document.hidden;
            const isChattingWithSender = !!(currentChatContactId && currentChatContactId === senderId);
            const shouldNotify = !isChattingWithSender || isAppInBackground;

            if (shouldNotify) {
              showPhoneNotification(`💬 ${senderName}`, text, senderAvatar);
              if (onNewMessageBanner && !isChattingWithSender) {
                onNewMessageBanner(senderName, text, senderAvatar);
              }
            }
          }

          initialProcessedIds.add(docId);
        }
      });

      if (isInitialLoad) {
        isInitialLoad = false;
      }
    }, (err) => {
      console.warn('Push notification listener error:', err);
    });

    return unsubscribe;
  } catch (err) {
    console.warn('Failed to start chat notification listener:', err);
    return () => {};
  }
}
