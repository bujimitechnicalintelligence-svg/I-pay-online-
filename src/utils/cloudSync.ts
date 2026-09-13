import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  getDoc,
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  limit, 
  deleteDoc, 
  writeBatch,
  updateDoc
} from 'firebase/firestore';
import { db } from './firebase';
import { ChatMessage, ChatContact, ProductItem, ShortVideo, UserAccount, VideoComment } from '../types';

// ==========================================
// 1. REAL-TIME CROSS-DEVICE CHAT
// ==========================================

export function computeChatId(userAId: string, userBId: string): string {
  return [userAId, userBId].sort().join('__');
}

export function subscribeToChatMessages(
  chatId: string, 
  callback: (messages: ChatMessage[]) => void
): () => void {
  try {
    const msgsCol = collection(db, 'chat_messages');
    const q = query(
      msgsCol, 
      where('chatId', '==', chatId),
      limit(200)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: ChatMessage[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        msgs.push({
          id: docSnap.id,
          senderId: data.senderId,
          senderName: data.senderName || 'Member',
          text: data.text,
          timestamp: data.timestamp || 'Now',
          isMe: false,
          status: data.status || 'sent',
          createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
          deletedForMe: false
        });
      });
      // Sort in memory to avoid needing composite Firestore index
      msgs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      callback(msgs);
    }, (err) => {
      console.warn('Chat subscription error:', err);
    });

    return unsubscribe;
  } catch (err) {
    console.warn('Failed to start chat subscription:', err);
    return () => {};
  }
}

export async function sendCrossDeviceChatMessage(
  senderOrChatId: UserAccount | string,
  receiverOrUser: string | UserAccount,
  textOrReceiver: string,
  optionalText?: string,
  customMsgId?: string
): Promise<ChatMessage> {
  let sender: UserAccount;
  let receiverId: string;
  let text: string;
  let explicitId = customMsgId;

  if (typeof senderOrChatId === 'string' && typeof receiverOrUser === 'object') {
    // Called as (chatId, currentUser, receiverId, text, customMsgId)
    sender = receiverOrUser as UserAccount;
    receiverId = textOrReceiver;
    text = optionalText || '';
  } else {
    // Called as (currentUser, receiverId, text, customMsgId)
    sender = senderOrChatId as UserAccount;
    receiverId = receiverOrUser as string;
    text = textOrReceiver;
    if (optionalText) explicitId = optionalText;
  }

  const chatId = computeChatId(sender.id, receiverId);
  const messageId = explicitId || ('msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
  const now = Date.now();
  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const newMsg: ChatMessage = {
    id: messageId,
    senderId: sender.id,
    senderName: sender.displayName,
    text,
    timestamp: timeStr,
    isMe: true,
    status: 'sent',
    createdAt: now
  };

  try {
    const docRef = doc(db, 'chat_messages', messageId);
    await setDoc(docRef, {
      id: messageId,
      chatId,
      senderId: sender.id,
      senderName: sender.displayName,
      senderAvatar: sender.avatarUrl || '',
      receiverId,
      participants: [sender.id, receiverId],
      text,
      timestamp: timeStr,
      createdAt: now,
      status: 'delivered'
    });
  } catch (err) {
    console.warn('Error syncing message to cloud Firestore:', err);
  }

  return newMsg;
}

export const sendCloudChatMessage = sendCrossDeviceChatMessage;

// ==========================================
// 2. CROSS-DEVICE STORE PRODUCTS
// ==========================================

export function subscribeToStoreProducts(
  callback: (products: ProductItem[]) => void
): () => void {
  try {
    const productsCol = collection(db, 'store_products');
    const q = query(productsCol, limit(100));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const now = Date.now();
      const items: ProductItem[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const expiresAt = data.expiresAt || (Date.now() + 30 * 24 * 60 * 60 * 1000);
        // Only return non-expired products (30-day rule)
        if (expiresAt > now) {
          items.push({
            id: docSnap.id,
            name: data.name || data.title || 'Product',
            description: data.description || '',
            priceNgn: typeof data.priceNgn === 'number' ? data.priceNgn : (data.price || 0),
            image: data.image || data.imageUrl || '',
            category: data.category || 'General',
            sellerName: data.sellerName || 'Vendor',
            sellerUsername: data.sellerUsername,
            sellerId: data.sellerId,
            sellerAvatar: data.sellerAvatar,
            location: data.location || (data.sellerState ? `${data.sellerLga || ''}, ${data.sellerState}` : 'Nigeria'),
            createdAt: data.createdAt || Date.now(),
            expiresAt
          });
        }
      });
      // Sort newest first
      items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      callback(items);
    }, (err) => {
      console.warn('Store products subscription error:', err);
    });

    return unsubscribe;
  } catch (err) {
    console.warn('Failed to start store subscription:', err);
    return () => {};
  }
}

export async function publishCloudStoreProduct(product: ProductItem): Promise<void> {
  try {
    const docRef = doc(db, 'store_products', product.id);
    await setDoc(docRef, product);
  } catch (err) {
    console.warn('Failed to publish store product to cloud Firestore:', err);
  }
}

// Reset all store products in Firestore
export async function resetCloudStoreProducts(): Promise<void> {
  try {
    const productsCol = collection(db, 'store_products');
    const snap = await getDocs(productsCol);
    const batch = writeBatch(db);
    snap.forEach(docSnap => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();
  } catch (err) {
    console.warn('Failed to reset cloud store products:', err);
  }
}

// ==========================================
// 3. CROSS-DEVICE 24-HOUR VIDEO REELS & MEDIA CHUNKS
// ==========================================

export function subscribeToVideoReels(
  callback: (videos: ShortVideo[]) => void
): () => void {
  try {
    const reelsCol = collection(db, 'video_reels');
    const q = query(reelsCol, limit(100));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const now = Date.now();
      const list: ShortVideo[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
        const createdAt = data.createdAt || now;
        const expiresAt = data.expiresAt || (createdAt + TWENTY_FOUR_HOURS_MS);
        // Strictly restricted to 24 hours: must have been posted within the last 24 hours
        if (now - createdAt < TWENTY_FOUR_HOURS_MS && expiresAt > now) {
          list.push({
            id: docSnap.id,
            title: data.title || 'Reel',
            creator: data.creator || 'Creator',
            creatorAvatar: data.creatorAvatar,
            thumbnailUrl: data.thumbnailUrl,
            videoUrl: data.videoUrl || '',
            mediaId: data.mediaId,
            hasCloudChunks: !!data.hasCloudChunks,
            totalChunks: data.totalChunks || 0,
            durationSeconds: data.durationSeconds || 15,
            likes: data.likes || 0,
            comments: data.comments || 0,
            shares: data.shares || 0,
            tags: data.tags || ['#IpayOnline'],
            soundTitle: data.soundTitle || 'Original Audio',
            createdAt,
            expiresAt
          });
        }
      });
      // Sort newest first
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      callback(list);
    }, (err) => {
      console.warn('Video reels subscription error:', err);
    });

    return unsubscribe;
  } catch (err) {
    console.warn('Failed to start video reels subscription:', err);
    return () => {};
  }
}

// Safe and instantaneous conversion of Base64 Data URL to Blob without DOM or fetch crashes
export function base64ToBlob(base64Data: string): Blob {
  try {
    const parts = base64Data.split(';base64,');
    let contentType = 'video/mp4';
    let base64Str = base64Data;
    if (parts.length > 1) {
      contentType = parts[0].split(':')[1] || 'video/mp4';
      base64Str = parts[1];
    }
    // Apple quicktime (.mov) files should be typed as video/mp4 for universal cross-device playback
    if (contentType.includes('quicktime')) {
      contentType = 'video/mp4';
    }
    const binaryStr = window.atob(base64Str);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return new Blob([bytes], { type: contentType });
  } catch (e) {
    console.warn('base64ToBlob conversion fallback:', e);
    return new Blob([], { type: 'video/mp4' });
  }
}

// Upload video chunks to Firestore in parallel so any phone can download and play it
export async function uploadVideoChunksToFirestore(videoId: string, base64Data: string): Promise<boolean> {
  try {
    const CHUNK_SIZE = 700 * 1024; // 700KB per chunk (fits comfortably under Firestore 1MB doc limit)
    const totalChunks = Math.ceil(base64Data.length / CHUNK_SIZE);
    const promises = [];

    for (let i = 0; i < totalChunks; i++) {
      const chunkStr = base64Data.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const chunkDocRef = doc(db, 'video_chunks', `${videoId}_${i}`);
      promises.push(
        setDoc(chunkDocRef, {
          videoId,
          chunkIndex: i,
          totalChunks,
          data: chunkStr,
          createdAt: Date.now()
        })
      );
    }
    await Promise.all(promises);
    return true;
  } catch (err) {
    console.warn('Failed to upload video chunks to Firestore:', err);
    return false;
  }
}

// Download video chunks from Firestore in parallel and reconstruct Base64 string
export async function fetchVideoDataUrlFromFirestore(videoId: string, totalChunks: number): Promise<string | null> {
  try {
    const promises = [];
    for (let i = 0; i < totalChunks; i++) {
      const chunkDocRef = doc(db, 'video_chunks', `${videoId}_${i}`);
      promises.push(getDoc(chunkDocRef));
    }
    const snaps = await Promise.all(promises);
    const chunks: string[] = [];
    for (const snap of snaps) {
      if (snap.exists()) {
        const data = snap.data();
        chunks.push(data.data || '');
      } else {
        console.warn(`Missing video chunk for ${videoId}`);
        return null;
      }
    }
    return chunks.join('');
  } catch (err) {
    console.warn('Failed to download video chunks from Firestore:', err);
    return null;
  }
}

export async function publishCloudVideoReel(video: ShortVideo, videoBase64Data?: string): Promise<void> {
  try {
    let hasCloudChunks = false;
    let totalChunks = 0;

    if (videoBase64Data && videoBase64Data.length > 0) {
      const CHUNK_SIZE = 700 * 1024;
      totalChunks = Math.ceil(videoBase64Data.length / CHUNK_SIZE);
      await uploadVideoChunksToFirestore(video.id, videoBase64Data);
      hasCloudChunks = true;
    }

    const cleanVideoData = {
      id: video.id,
      title: video.title,
      creator: video.creator,
      creatorAvatar: video.creatorAvatar,
      thumbnailUrl: video.thumbnailUrl,
      videoUrl: video.videoUrl && !video.videoUrl.startsWith('blob:') ? video.videoUrl : '',
      mediaId: video.mediaId,
      hasCloudChunks,
      totalChunks,
      durationSeconds: video.durationSeconds || 15,
      likes: video.likes || 0,
      comments: video.comments || 0,
      shares: video.shares || 0,
      tags: video.tags || ['#IpayOnline'],
      soundTitle: video.soundTitle || 'Original Audio',
      createdAt: video.createdAt || Date.now(),
      expiresAt: video.expiresAt || (Date.now() + 24 * 60 * 60 * 1000)
    };

    const docRef = doc(db, 'video_reels', video.id);
    await setDoc(docRef, cleanVideoData);
  } catch (err) {
    console.warn('Failed to sync video reel to Firestore:', err);
  }
}

// Delete a specific video reel and its chunks from Firestore (creator deletion before 24h)
export async function deleteCloudVideoReel(videoId: string): Promise<boolean> {
  try {
    const docRef = doc(db, 'video_reels', videoId);
    const snap = await getDoc(docRef);
    const totalChunks = snap.exists() ? (snap.data().totalChunks || 0) : 0;

    await deleteDoc(docRef);

    if (totalChunks > 0) {
      const chunkPromises: Promise<void>[] = [];
      for (let i = 0; i < totalChunks; i++) {
        const chunkRef = doc(db, 'video_chunks', `${videoId}_chunk_${i}`);
        chunkPromises.push(deleteDoc(chunkRef).catch(() => {}));
      }
      await Promise.all(chunkPromises);
    }
    return true;
  } catch (err) {
    console.warn('Failed to delete video reel from Firestore:', err);
    return false;
  }
}

// Reset all videos from Firestore
export async function resetCloudVideoReels(): Promise<void> {
  try {
    const reelsCol = collection(db, 'video_reels');
    const snap = await getDocs(reelsCol);
    const batch = writeBatch(db);
    snap.forEach(docSnap => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();

    // Also delete chunks
    const chunksCol = collection(db, 'video_chunks');
    const chunkSnap = await getDocs(chunksCol);
    const chunkBatch = writeBatch(db);
    chunkSnap.forEach(docSnap => {
      chunkBatch.delete(docSnap.ref);
    });
    await chunkBatch.commit();
  } catch (err) {
    console.warn('Failed to reset cloud video reels:', err);
  }
}

// ------------------------------------------
// Real Cloud Video Likes & Comments (No mock data)
// ------------------------------------------

export async function updateCloudVideoLikes(videoId: string, delta: number): Promise<number> {
  try {
    const docRef = doc(db, 'video_reels', videoId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const currentLikes = snap.data().likes || 0;
      const newLikes = Math.max(0, currentLikes + delta);
      await updateDoc(docRef, { likes: newLikes });
      return newLikes;
    }
  } catch (err) {
    console.warn('Failed to update cloud video likes:', err);
  }
  return 0;
}

export async function addCloudVideoComment(videoId: string, comment: VideoComment): Promise<void> {
  try {
    const commentDocRef = doc(db, 'video_reels', videoId, 'comments', comment.id);
    await setDoc(commentDocRef, {
      id: comment.id,
      authorName: comment.authorName,
      authorAvatar: comment.authorAvatar || '',
      text: comment.text,
      timestamp: comment.timestamp,
      createdAt: Date.now()
    });

    const videoDocRef = doc(db, 'video_reels', videoId);
    const snap = await getDoc(videoDocRef);
    if (snap.exists()) {
      const currentComments = snap.data().comments || 0;
      await updateDoc(videoDocRef, { comments: currentComments + 1 });
    }
  } catch (err) {
    console.warn('Failed to add cloud video comment:', err);
  }
}

export function subscribeToVideoComments(
  videoId: string,
  callback: (comments: VideoComment[]) => void
): () => void {
  try {
    const commentsCol = collection(db, 'video_reels', videoId, 'comments');
    const q = query(commentsCol, limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: VideoComment[] = [];
      snapshot.forEach(docSnap => {
        const d = docSnap.data();
        list.push({
          id: docSnap.id,
          authorName: d.authorName || 'Member',
          authorAvatar: d.authorAvatar || '',
          text: d.text || '',
          timestamp: d.timestamp || 'Just now'
        });
      });
      // Sort newest first
      list.sort((a, b) => b.id.localeCompare(a.id));
      callback(list);
    }, (err) => {
      console.warn('Comments subscription error:', err);
    });
    return unsubscribe;
  } catch (err) {
    return () => {};
  }
}

// ==========================================
// 4. CROSS-DEVICE USER PROFILES & NEARBY
// ==========================================

export async function syncUserProfileToCloud(user: UserAccount): Promise<void> {
  try {
    const docRef = doc(db, 'user_profiles', user.id);
    await setDoc(docRef, {
      id: user.id,
      displayName: user.displayName,
      username: user.username,
      state: user.state,
      lga: user.lga,
      avatarUrl: user.avatarUrl || '',
      lastSeen: Date.now()
    }, { merge: true });

    // Also persist full user account details in 'users' collection
    const userDocRef = doc(db, 'users', user.id);
    await setDoc(userDocRef, {
      id: user.id,
      provider: user.provider,
      providerEmail: user.providerEmail.toLowerCase(),
      displayName: user.displayName,
      username: user.username,
      state: user.state,
      lga: user.lga,
      address: user.address || '',
      avatarUrl: user.avatarUrl || '',
      passwordHash: user.passwordHash || '',
      createdAt: user.createdAt,
      lastSeen: Date.now()
    }, { merge: true });
  } catch (err) {
    console.warn('Failed to sync user profile to Firestore:', err);
  }
}

export const publishUserToFirestore = syncUserProfileToCloud;

export async function fetchUserFromFirestoreByEmail(email: string): Promise<UserAccount | null> {
  try {
    const usersCol = collection(db, 'users');
    const q = query(usersCol, where('providerEmail', '==', email.toLowerCase().trim()), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const data = snap.docs[0].data();
      return {
        id: data.id,
        provider: data.provider,
        providerEmail: data.providerEmail,
        displayName: data.displayName,
        username: data.username,
        state: data.state,
        lga: data.lga,
        address: data.address || '',
        avatarUrl: data.avatarUrl || '',
        passwordHash: data.passwordHash || '',
        createdAt: data.createdAt || Date.now()
      };
    }
    return null;
  } catch (err) {
    console.warn('Failed to fetch user by email from Firestore:', err);
    return null;
  }
}

// Fetch only genuine registered community users from Firestore
export async function getRegisteredFirestoreCommunityUsers(): Promise<ChatContact[]> {
  try {
    const usersCol = collection(db, 'user_profiles');
    const snap = await getDocs(usersCol);
    const contacts: ChatContact[] = [];
    snap.forEach(docSnap => {
      const data = docSnap.data();
      contacts.push({
        id: data.id,
        name: data.displayName || 'Member',
        username: data.username || `@${(data.displayName || 'user').toLowerCase().replace(/\s+/g, '_')}`,
        role: 'Registered Member',
        lastMessage: `From ${data.lga || 'Nigeria'}, ${data.state || 'State'}`,
        time: 'Active',
        unreadCount: 0,
        avatar: data.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(data.displayName || 'user')}`,
        online: Date.now() - (data.lastSeen || 0) < 300000,
        state: data.state,
        lga: data.lga
      });
    });
    return contacts;
  } catch (err) {
    console.warn('Failed to get registered community users from Firestore:', err);
    return [];
  }
}

export function subscribeToCrossDeviceUsers(
  callback: (users: ChatContact[]) => void
): () => void {
  try {
    const usersCol = collection(db, 'user_profiles');
    const q = query(usersCol, limit(50));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const contacts: ChatContact[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        contacts.push({
          id: data.id,
          name: data.displayName || 'Member',
          username: data.username || `@${(data.displayName || 'user').toLowerCase().replace(/\s+/g, '_')}`,
          role: 'Registered Member',
          lastMessage: `From ${data.lga || 'Nigeria'}, ${data.state || 'State'}`,
          time: 'Active',
          unreadCount: 0,
          avatar: data.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(data.displayName || 'user')}`,
          online: Date.now() - (data.lastSeen || 0) < 300000,
          state: data.state,
          lga: data.lga
        });
      });
      callback(contacts);
    }, (err) => {
      console.warn('Users subscription error:', err);
    });

    return unsubscribe;
  } catch (err) {
    console.warn('Failed to start users subscription:', err);
    return () => {};
  }
}
