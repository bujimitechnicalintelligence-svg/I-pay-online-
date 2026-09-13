export type AuthProvider = 'google' | 'iphone' | 'microsoft' | 'email';

export interface UserAccount {
  id: string;
  provider: AuthProvider;
  providerEmail: string;
  displayName: string;
  username: string; // starts with @
  state: string;
  lga: string;
  address: string;
  passwordHash: string; // stored securely in storage
  createdAt: number;
  avatarUrl: string;
}

export interface LoginAttemptRecord {
  failedAttempts: number;
  lockedUntil: number | null; // timestamp in ms (12 hours lockout)
}

export type ViewState = 
  | 'welcome'
  | 'rules'
  | 'signup_provider'
  | 'signup_location'
  | 'signup_password'
  | 'signin'
  | 'dashboard';

export interface VideoComment {
  id: string;
  authorName: string;
  authorAvatar: string;
  text: string;
  timestamp: string;
}

export interface ShortVideo {
  id: string;
  title: string;
  creator: string;
  creatorAvatar: string;
  creatorId?: string;
  likes: number;
  comments: number;
  shares: number;
  tags: string[];
  videoUrl?: string;
  thumbnailUrl: string;
  soundTitle: string;
  createdAt: number;
  expiresAt: number; // 24 hours after creation
  isCached?: boolean;
  commentsList?: VideoComment[];
  mediaId?: string; // ID in IndexedDB media_blobs store
  durationSeconds?: number; // Video duration (max 180 seconds / 3 minutes)
  isLocalDbVideo?: boolean; // Uses 0 internet bandwidth
  hasCloudChunks?: boolean;
  totalChunks?: number;
}

export interface AuthorBook {
  id: string;
  title: string;
  author: string;
  category: string;
  rating: number;
  reviewsCount: number;
  priceNgn: number;
  coverImage: string;
  synopsis: string;
  pages: number;
}

export interface ProductItem {
  id: string;
  name: string;
  category?: string;
  priceNgn: number;
  originalPriceNgn?: number;
  rating?: number;
  salesCount?: number;
  image: string;
  inStock?: boolean;
  sellerName: string;
  sellerUsername?: string;
  sellerId?: string;
  sellerAvatar?: string;
  location: string;
  description?: string;
  createdAt: number;
  expiresAt: number; // 30 days after creation (1 month)
}

export interface UserSocialStats {
  followersCount: number;
  followingCount: number;
  totalLikes: number;
  unlockedRewardNgn: number; // 5000 if >=20 followers and >=20 likes
  hasSpecialBadge: boolean; // true if >= 20 followers
}

export interface FollowUserItem {
  id: string;
  name: string;
  username: string;
  avatar: string;
  state?: string;
  lga?: string;
  isFollowing?: boolean;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  timestamp: number;
  type: 'chat' | 'post' | 'reward' | 'follow';
  read: boolean;
  senderAvatar?: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
  isMe: boolean;
  deletedForMe?: boolean;
  createdAt?: number;
  status?: string;
}

export interface ChatContact {
  id: string;
  username: string; // starts with @
  name: string;
  role?: string;
  lastMessage: string;
  time: string;
  unreadCount: number;
  avatar: string;
  online: boolean;
  state?: string;
  lga?: string;
  isBlocked?: boolean;
}
