import { ShortVideo, VideoComment } from '../types';
import { MOCK_VIDEOS } from '../data/mockSuperAppData';

const VIDEOS_STORAGE_KEY = 'ipay_videos_v2';
const CACHED_IDS_KEY = 'ipay_cached_video_ids_v2';
const WATCHED_IDS_KEY = 'ipay_watched_video_ids_v2';
const USER_AVATAR_KEY = 'ipay_user_comment_avatar_v2';
const FOLLOWED_CREATORS_KEY = 'ipay_followed_creators_v2';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

// Track videos already watched by the user
export function getWatchedVideoIds(): Set<string> {
  try {
    const raw = localStorage.getItem(WATCHED_IDS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function markVideoAsWatched(videoId: string): void {
  try {
    const set = getWatchedVideoIds();
    set.add(videoId);
    localStorage.setItem(WATCHED_IDS_KEY, JSON.stringify(Array.from(set)));
  } catch (err) {
    console.warn('Failed to mark video as watched', err);
  }
}

export function resetWatchedVideos(): void {
  try {
    localStorage.removeItem(WATCHED_IDS_KEY);
  } catch {
    // ignore
  }
}

// Initialize default videos: clean slate with 0 mock videos
function getInitialVideos(): ShortVideo[] {
  return [];
}

// Get all cached video IDs from device storage
export function getCachedVideoIds(): Set<string> {
  try {
    const raw = localStorage.getItem(CACHED_IDS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

// Save cached video IDs
function saveCachedVideoIds(ids: Set<string>): void {
  try {
    localStorage.setItem(CACHED_IDS_KEY, JSON.stringify(Array.from(ids)));
  } catch (err) {
    console.warn('Failed to save cached video IDs', err);
  }
}

// Toggle cache for offline watching ("catched" or "uncatched")
export function toggleVideoCache(videoId: string): boolean {
  const cachedIds = getCachedVideoIds();
  let nowCached = false;
  if (cachedIds.has(videoId)) {
    cachedIds.delete(videoId);
    nowCached = false;
  } else {
    cachedIds.add(videoId);
    nowCached = true;
  }
  saveCachedVideoIds(cachedIds);
  return nowCached;
}

export function isVideoCached(videoId: string): boolean {
  return getCachedVideoIds().has(videoId);
}

// Clear all offline cached videos to free storage
export function clearAllCachedVideos(): void {
  try {
    localStorage.removeItem(CACHED_IDS_KEY);
  } catch {
    // ignore
  }
}

// Get active videos respecting the 24-hour expiration rule
// Videos disappear after 24 hours UNLESS cached in device storage!
export function getActiveVideos(): ShortVideo[] {
  try {
    let videos: ShortVideo[] = [];
    const raw = localStorage.getItem(VIDEOS_STORAGE_KEY);
    if (!raw) {
      return [];
    } else {
      videos = JSON.parse(raw);
    }

    const cachedIds = getCachedVideoIds();
    const now = Date.now();

    // Filter rule: Disappear by default after 24 hours unless cached in storage
    const active = videos.filter(v => {
      const isExpired = now > v.expiresAt;
      const isCachedInStorage = cachedIds.has(v.id);
      // Keep if not expired OR if user cached it
      return !isExpired || isCachedInStorage;
    });

    // Map isCached attribute
    return active.map(v => ({
      ...v,
      isCached: cachedIds.has(v.id)
    }));
  } catch (err) {
    console.error('Failed to get active videos', err);
    return getInitialVideos();
  }
}

// Add a newly posted video
export function saveNewVideo(videoData: {
  title: string;
  creator: string;
  creatorAvatar: string;
  thumbnailUrl: string;
  videoUrl?: string;
  mediaId?: string;
  durationSeconds?: number;
  isLocalDbVideo?: boolean;
  soundTitle?: string;
  tags?: string[];
}): ShortVideo {
  const now = Date.now();
  const newVideo: ShortVideo = {
    id: 'user_vid_' + now,
    title: videoData.title,
    creator: videoData.creator,
    creatorAvatar: videoData.creatorAvatar,
    likes: 0,
    comments: 0,
    shares: 0,
    tags: videoData.tags || ['#IpayOnline', '#Reels', '#Nigeria'],
    thumbnailUrl: videoData.thumbnailUrl,
    videoUrl: videoData.videoUrl,
    mediaId: videoData.mediaId,
    durationSeconds: videoData.durationSeconds,
    isLocalDbVideo: videoData.isLocalDbVideo !== undefined ? videoData.isLocalDbVideo : !!videoData.mediaId,
    soundTitle: videoData.soundTitle || 'Original Sound - I-pay-online Creator',
    createdAt: now,
    expiresAt: now + TWENTY_FOUR_HOURS_MS, // 24-hour expiration rule
    isCached: true, // Automatically cached on the uploader's device
    commentsList: []
  };

  try {
    const raw = localStorage.getItem(VIDEOS_STORAGE_KEY);
    const existing: ShortVideo[] = raw ? JSON.parse(raw) : getInitialVideos();
    const updated = [newVideo, ...existing];
    try {
      localStorage.setItem(VIDEOS_STORAGE_KEY, JSON.stringify(updated));
    } catch (quotaErr) {
      // If quota exceeded due to large payload, store video with optimized URL
      const trimmed = [
        { ...newVideo, videoUrl: undefined },
        ...existing.map(v => ({ ...v, videoUrl: undefined }))
      ];
      localStorage.setItem(VIDEOS_STORAGE_KEY, JSON.stringify(trimmed));
    }

    // Automatically cache creator's own video in local device storage
    const cachedIds = getCachedVideoIds();
    cachedIds.add(newVideo.id);
    saveCachedVideoIds(cachedIds);
  } catch (err) {
    console.error('Failed to save new video', err);
  }

  return newVideo;
}

// Delete video by id (allows creator to delete their video before 24 hours)
export function deleteVideo(videoId: string): boolean {
  try {
    const raw = localStorage.getItem(VIDEOS_STORAGE_KEY);
    if (!raw) return false;
    const existing: ShortVideo[] = JSON.parse(raw);
    const updated = existing.filter(v => v.id !== videoId);
    localStorage.setItem(VIDEOS_STORAGE_KEY, JSON.stringify(updated));

    // Remove from cached video IDs if cached
    const cachedIds = getCachedVideoIds();
    if (cachedIds.has(videoId)) {
      cachedIds.delete(videoId);
      saveCachedVideoIds(cachedIds);
    }
    return true;
  } catch (err) {
    console.error('Failed to delete video', err);
    return false;
  }
}

// Update like count
export function updateVideoLikes(videoId: string, delta: number): number {
  try {
    const raw = localStorage.getItem(VIDEOS_STORAGE_KEY);
    const videos: ShortVideo[] = raw ? JSON.parse(raw) : getInitialVideos();
    const vid = videos.find(v => v.id === videoId);
    if (vid) {
      vid.likes = Math.max(0, vid.likes + delta);
      localStorage.setItem(VIDEOS_STORAGE_KEY, JSON.stringify(videos));
      return vid.likes;
    }
  } catch {
    // ignore
  }
  return 0;
}

// Add comment to video
export function addCommentToVideo(videoId: string, comment: VideoComment): VideoComment[] {
  try {
    const raw = localStorage.getItem(VIDEOS_STORAGE_KEY);
    const videos: ShortVideo[] = raw ? JSON.parse(raw) : getInitialVideos();
    const vid = videos.find(v => v.id === videoId);
    if (vid) {
      vid.commentsList = [comment, ...(vid.commentsList || [])];
      vid.comments = (vid.commentsList || []).length;
      localStorage.setItem(VIDEOS_STORAGE_KEY, JSON.stringify(videos));
      return vid.commentsList;
    }
  } catch {
    // ignore
  }
  return [];
}

// Followed creators management
export function getFollowedCreators(): Set<string> {
  try {
    const raw = localStorage.getItem(FOLLOWED_CREATORS_KEY);
    if (!raw) return new Set();
    const list = JSON.parse(raw);
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

export function toggleFollowCreator(creatorName: string): boolean {
  const set = getFollowedCreators();
  let isNowFollowing = false;
  if (set.has(creatorName)) {
    set.delete(creatorName);
    isNowFollowing = false;
  } else {
    set.add(creatorName);
    isNowFollowing = true;
  }
  try {
    localStorage.setItem(FOLLOWED_CREATORS_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // ignore
  }
  return isNowFollowing;
}

// User comment avatar storage (allows user to upload or pick avatar for comments)
export function getUserCommentAvatar(defaultName: string = 'User'): string {
  try {
    const stored = localStorage.getItem(USER_AVATAR_KEY);
    if (stored) return stored;
  } catch {
    // ignore
  }
  return `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(defaultName)}`;
}

export function setUserCommentAvatar(avatarUrl: string): void {
  try {
    localStorage.setItem(USER_AVATAR_KEY, avatarUrl);
  } catch {
    // ignore
  }
}
