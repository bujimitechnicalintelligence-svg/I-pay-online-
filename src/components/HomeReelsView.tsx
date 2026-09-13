import React, { useState, useEffect, useRef } from 'react';
import { 
  Heart, MessageCircle, Share2, Plus, Search, 
  ChevronUp, ChevronDown, Sparkles, Play, X, Video, Loader2
} from 'lucide-react';
import { ShortVideo, UserAccount } from '../types';
import { 
  getActiveVideos, 
  updateVideoLikes, 
  toggleFollowCreator, 
  getFollowedCreators
} from '../utils/videoStorage';
import { getMediaBlob, storeMediaBlob } from '../utils/appDatabase';
import { 
  subscribeToVideoReels, 
  fetchVideoDataUrlFromFirestore, 
  updateCloudVideoLikes,
  base64ToBlob
} from '../utils/cloudSync';
import { UploadReelModal } from './UploadReelModal';
import { CommentsModal } from './CommentsModal';

interface HomeReelsViewProps {
  currentUser: UserAccount;
}

export const HomeReelsView: React.FC<HomeReelsViewProps> = ({ currentUser }) => {
  const [videos, setVideos] = useState<ShortVideo[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  // Interaction states
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [followedSet, setFollowedSet] = useState<Set<string>>(new Set());

  // Video playback states
  const [isPlaying, setIsPlaying] = useState(true);
  const [activeMediaSrc, setActiveMediaSrc] = useState<string | null>(null);
  const [isLoadingMedia, setIsLoadingMedia] = useState(false);
  const [hasVideoError, setHasVideoError] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Modals
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [activeCommentVideo, setActiveCommentVideo] = useState<ShortVideo | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Touch swipe support & Wheel debounce
  const touchStartY = useRef<number | null>(null);
  const wheelTimeoutRef = useRef<number | null>(null);

  // Load videos from device storage instantly (0ms network delay), strictly restricted to 24 hours
  const loadVideos = () => {
    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const list = getActiveVideos().filter(v => {
      const createdAt = v.createdAt || now;
      const expiresAt = v.expiresAt || (createdAt + TWENTY_FOUR_HOURS_MS);
      return (now - createdAt < TWENTY_FOUR_HOURS_MS) && expiresAt > now;
    });
    setVideos(list);
    setFollowedSet(getFollowedCreators());
  };

  useEffect(() => {
    // 1. Instant load from local storage
    loadVideos();

    // 2. Subscribe to real-time 24-hour video reels from Firestore across all devices
    const unsubscribe = subscribeToVideoReels((cloudReels) => {
      setVideos(prev => {
        const map = new Map<string, ShortVideo>();
        // Add cloud reels
        cloudReels.forEach(v => map.set(v.id, v));
        // Add any local pending videos not yet in cloud
        prev.forEach(v => {
          if (v.isLocalDbVideo && !map.has(v.id)) {
            map.set(v.id, v);
          }
        });
        const merged = Array.from(map.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        
        // Save locally for instant offline loading
        try {
          localStorage.setItem('ipay_videos_v2', JSON.stringify(merged));
        } catch {}

        return merged;
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const filteredVideos = videos.filter(v => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      v.title.toLowerCase().includes(q) ||
      v.creator.toLowerCase().includes(q) ||
      (v.tags && v.tags.some(t => t.toLowerCase().includes(q)))
    );
  });

  const currentVideo = filteredVideos[currentIndex] || null;

  // Resolve video source (Instant IndexedDB Blob -> Cloud Chunks with local caching -> videoUrl)
  useEffect(() => {
    let activeObjUrl: string | null = null;
    let isCancelled = false;
    setHasVideoError(false);
    setIsLoadingMedia(false);

    async function resolveSource() {
      if (!currentVideo) return;

      const primaryMediaId = currentVideo.mediaId || ('reel_' + currentVideo.id);
      const fallbackMediaId = 'reel_' + currentVideo.id;

      // 1. Instant local IndexedDB playback (0 delay, saved inside the app)
      try {
        let blob = await getMediaBlob(primaryMediaId);
        if (!blob && currentVideo.mediaId) {
          blob = await getMediaBlob(fallbackMediaId);
        }
        if (blob && !isCancelled) {
          activeObjUrl = URL.createObjectURL(blob);
          setActiveMediaSrc(activeObjUrl);
          setIsLoadingMedia(false);
          return;
        }
      } catch (e) {
        console.warn('Local blob read error:', e);
      }

      // 2. If it has cloud chunks in Firestore, download once and store permanently in the app (IndexedDB)
      if (currentVideo.hasCloudChunks && currentVideo.totalChunks) {
        try {
          setIsLoadingMedia(true);
          const dataUrl = await fetchVideoDataUrlFromFirestore(currentVideo.id, currentVideo.totalChunks);
          if (dataUrl && !isCancelled) {
            // Reconstruct genuine Blob without network overhead
            const blob = base64ToBlob(dataUrl);
            const mediaIdToSave = currentVideo.mediaId || ('reel_' + currentVideo.id);
            // Save in app storage (IndexedDB) so subsequent plays are instant with 0 database reads & 0 bandwidth
            await storeMediaBlob(mediaIdToSave, blob);
            activeObjUrl = URL.createObjectURL(blob);
            setActiveMediaSrc(activeObjUrl);
            setIsLoadingMedia(false);
            return;
          }
        } catch (e) {
          console.warn('Error assembling cloud video chunks:', e);
        }
      }

      // 3. Fallback video URL
      if (currentVideo.videoUrl && !currentVideo.videoUrl.startsWith('blob:') && !isCancelled) {
        setActiveMediaSrc(currentVideo.videoUrl);
        setIsLoadingMedia(false);
        return;
      }

      if (!isCancelled) {
        setIsLoadingMedia(false);
      }
    }

    resolveSource();

    return () => {
      isCancelled = true;
      if (activeObjUrl) {
        URL.revokeObjectURL(activeObjUrl);
      }
    };
  }, [currentVideo?.id]);

  // Intelligent Background Pre-fetching for Next Video (Instant 0ms Playback when scrolling)
  useEffect(() => {
    const nextVideo = filteredVideos[currentIndex + 1];
    if (!nextVideo) return;
    const nextMediaId = nextVideo.mediaId || ('reel_' + nextVideo.id);

    async function prefetchNext() {
      try {
        const existingBlob = await getMediaBlob(nextMediaId);
        if (!existingBlob && nextVideo.hasCloudChunks && nextVideo.totalChunks) {
          const dataUrl = await fetchVideoDataUrlFromFirestore(nextVideo.id, nextVideo.totalChunks);
          if (dataUrl) {
            const blob = base64ToBlob(dataUrl);
            await storeMediaBlob(nextMediaId, blob);
          }
        }
      } catch {
        // silent prefetch catch
      }
    }

    const timer = setTimeout(prefetchNext, 1200);
    return () => clearTimeout(timer);
  }, [currentIndex, filteredVideos]);

  // Handle Autoplay & Unmuted Audio
  useEffect(() => {
    if (videoRef.current && activeMediaSrc) {
      videoRef.current.currentTime = 0;
      videoRef.current.muted = false;
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => setIsPlaying(true))
          .catch(() => {
            // Autoplay unmuted restriction fallback
            if (videoRef.current) {
              videoRef.current.muted = true;
              videoRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
            }
          });
      }
    }
  }, [activeMediaSrc, currentIndex]);

  const handleNextVideo = () => {
    if (currentIndex < filteredVideos.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setCurrentIndex(0);
    }
  };

  const handlePrevVideo = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    } else {
      setCurrentIndex(filteredVideos.length - 1);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleNextVideo();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        handlePrevVideo();
      } else if (e.key === ' ') {
        e.preventDefault();
        if (videoRef.current) {
          if (videoRef.current.paused) {
            videoRef.current.play();
            setIsPlaying(true);
          } else {
            videoRef.current.pause();
            setIsPlaying(false);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, filteredVideos.length]);

  const handleWheel = (e: React.WheelEvent) => {
    if (wheelTimeoutRef.current) return;
    if (Math.abs(e.deltaY) > 30) {
      if (e.deltaY > 0) {
        handleNextVideo();
      } else {
        handlePrevVideo();
      }
      wheelTimeoutRef.current = window.setTimeout(() => {
        wheelTimeoutRef.current = null;
      }, 300);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const touchEndY = e.changedTouches[0].clientY;
    const diff = touchStartY.current - touchEndY;

    if (diff > 35) {
      handleNextVideo();
    } else if (diff < -35) {
      handlePrevVideo();
    }
    touchStartY.current = null;
  };

  // Real Like button handling: updates local storage and Firestore database
  const handleToggleLike = (videoId: string) => {
    const isCurrentlyLiked = !!likedMap[videoId];
    const delta = isCurrentlyLiked ? -1 : 1;

    // 1. Update in local storage
    updateVideoLikes(videoId, delta);

    // 2. Update real cloud database
    updateCloudVideoLikes(videoId, delta);

    setLikedMap(prev => ({
      ...prev,
      [videoId]: !isCurrentlyLiked
    }));

    setVideos(prev => prev.map(v => {
      if (v.id === videoId) {
        return { ...v, likes: Math.max(0, v.likes + delta) };
      }
      return v;
    }));
  };

  // Follow / Unfollow
  const handleToggleFollow = (creatorName: string) => {
    const isNowFollowing = toggleFollowCreator(creatorName);
    setFollowedSet(prev => {
      const next = new Set(prev);
      if (isNowFollowing) {
        next.add(creatorName);
      } else {
        next.delete(creatorName);
      }
      return next;
    });
  };

  // Empty State: No active 24-hour videos
  if (!currentVideo) {
    return (
      <div className="h-[calc(100vh-64px)] flex flex-col items-center justify-center bg-black text-white p-6 text-center space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shadow-2xl">
          <Video className="w-8 h-8" />
        </div>
        <div className="space-y-1.5 max-w-sm">
          <h3 className="text-lg font-black text-white">No 24-Hour Videos Yet</h3>
          <p className="text-xs text-gray-400">
            Share a video with members across Nigeria! Videos stay active for 24 hours (1 minute max).
          </p>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-bold flex items-center space-x-2 shadow-lg shadow-emerald-600/30 cursor-pointer transition hover:scale-105"
        >
          <Plus className="w-4 h-4" />
          <span>Post a Video</span>
        </button>

        <UploadReelModal
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          currentUser={currentUser}
          onVideoUploaded={() => {
            loadVideos();
            setCurrentIndex(0);
          }}
        />
      </div>
    );
  }

  const isLiked = !!likedMap[currentVideo.id];
  const isFollowing = followedSet.has(currentVideo.creator);

  return (
    <div 
      className="relative w-full h-[calc(100vh-64px)] sm:h-[calc(100vh-70px)] bg-black overflow-hidden select-none flex items-center justify-center"
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      
      {/* Search Bar & Upload Button at Top */}
      <div className="absolute top-3 inset-x-3 max-w-lg mx-auto z-30 flex items-center gap-2">
        
        {/* Search bar */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/70" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search reels, creators..."
            className="w-full pl-9 pr-8 py-2 rounded-full bg-black/50 backdrop-blur-md border border-white/20 text-white text-xs placeholder-white/60 focus:outline-hidden focus:ring-1 focus:ring-emerald-400 transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Plus button to upload video */}
        <button
          onClick={() => setShowUploadModal(true)}
          title="Post Video (Max 1 Minute)"
          className="w-8 h-8 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-500/30 transition hover:scale-105 shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
        </button>

      </div>

      {/* Toast notice */}
      {toastMessage && (
        <div className="absolute top-16 inset-x-4 max-w-sm mx-auto z-40 p-2.5 rounded-xl bg-emerald-600 text-white text-xs font-medium shadow-lg flex items-center justify-between animate-in fade-in slide-in-from-top-2">
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Video Surface */}
      <div className="relative w-full h-full max-w-md mx-auto flex items-center justify-center bg-black overflow-hidden">
        
        {/* Ambient Blur Backdrop */}
        {activeMediaSrc && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30 blur-2xl scale-110">
            <video
              src={activeMediaSrc}
              muted
              playsInline
              autoPlay
              loop
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Real Video Player with sound */}
        {activeMediaSrc && !hasVideoError ? (
          <video
            ref={videoRef}
            src={activeMediaSrc}
            poster={currentVideo.thumbnailUrl}
            playsInline
            autoPlay
            loop
            muted={false}
            onError={() => {
              if (videoRef.current && !videoRef.current.muted) {
                videoRef.current.muted = true;
                videoRef.current.play().catch(() => setHasVideoError(true));
              } else {
                setHasVideoError(true);
              }
            }}
            className="relative z-10 max-h-full max-w-full object-contain mx-auto"
          />
        ) : (
          <div className="relative w-full h-full flex items-center justify-center">
            <img
              src={currentVideo.thumbnailUrl}
              alt={currentVideo.title}
              className="relative z-10 max-h-full max-w-full object-contain mx-auto"
              referrerPolicy="no-referrer"
            />
            {isLoadingMedia && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/40 backdrop-blur-xs space-y-2 text-white">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                <p className="text-[11px] font-semibold text-gray-200">Loading video into app...</p>
              </div>
            )}
            {hasVideoError && (
              <button
                onClick={() => {
                  setHasVideoError(false);
                  if (videoRef.current) {
                    videoRef.current.muted = true;
                    videoRef.current.play().catch(() => {});
                  }
                }}
                className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/50 text-white cursor-pointer"
              >
                <div className="w-14 h-14 rounded-full bg-emerald-600/90 flex items-center justify-center shadow-xl hover:scale-105 transition">
                  <Play className="w-7 h-7 text-white fill-white ml-0.5" />
                </div>
                <p className="text-xs font-bold text-white mt-2">Tap to Play Video</p>
              </button>
            )}
          </div>
        )}

        {/* Tap to Pause / Play Overlay */}
        <div 
          onClick={() => {
            if (videoRef.current) {
              if (videoRef.current.paused) {
                videoRef.current.play();
                setIsPlaying(true);
              } else {
                videoRef.current.pause();
                setIsPlaying(false);
              }
            }
          }}
          className="absolute inset-0 z-15 flex items-center justify-center cursor-pointer"
        >
          {!isPlaying && (
            <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-xs flex items-center justify-center text-white border border-white/30 animate-in zoom-in-75">
              <Play className="w-8 h-8 fill-current ml-1" />
            </div>
          )}
        </div>

        {/* Action Buttons Rail (Right side) */}
        <div className="absolute right-3 bottom-16 sm:bottom-20 z-20 flex flex-col items-center space-y-4">
          
          {/* Creator Profile Picture + Follow */}
          <div className="relative flex flex-col items-center">
            <img
              src={currentVideo.creatorAvatar}
              alt={currentVideo.creator}
              className="w-11 h-11 rounded-full border-2 border-emerald-500 object-cover shadow-md bg-black"
              referrerPolicy="no-referrer"
            />
            
            <button
              onClick={() => handleToggleFollow(currentVideo.creator)}
              className={`mt-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-tight shadow-md transition cursor-pointer ${
                isFollowing 
                  ? 'bg-gray-800 text-gray-200 border border-gray-600 hover:bg-red-900/80 hover:text-white' 
                  : 'bg-emerald-500 hover:bg-emerald-600 text-white'
              }`}
            >
              {isFollowing ? 'Unfollow' : 'Follow'}
            </button>
          </div>

          {/* Real Like Button */}
          <button
            onClick={() => handleToggleLike(currentVideo.id)}
            className="flex flex-col items-center group cursor-pointer"
          >
            <div className={`p-2.5 rounded-full backdrop-blur-md transition shadow-md ${
              isLiked 
                ? 'bg-red-600 text-white' 
                : 'bg-black/50 text-white group-hover:bg-black/70'
            }`}>
              <Heart className={`w-6 h-6 ${isLiked ? 'fill-current' : ''}`} />
            </div>
            <span className="text-[11px] font-bold text-white drop-shadow mt-1">
              {currentVideo.likes.toLocaleString()}
            </span>
          </button>

          {/* Real Comment Button */}
          <button
            onClick={() => setActiveCommentVideo(currentVideo)}
            className="flex flex-col items-center group cursor-pointer"
          >
            <div className="p-2.5 rounded-full bg-black/50 text-white backdrop-blur-md group-hover:bg-black/70 transition shadow-md">
              <MessageCircle className="w-6 h-6" />
            </div>
            <span className="text-[11px] font-bold text-white drop-shadow mt-1">
              {(currentVideo.commentsList ? currentVideo.commentsList.length : currentVideo.comments).toLocaleString()}
            </span>
          </button>

          {/* Share */}
          <button
            onClick={() => {
              navigator.clipboard?.writeText(window.location.href);
              setToastMessage('Reel link copied!');
              setTimeout(() => setToastMessage(null), 2500);
            }}
            className="flex flex-col items-center group cursor-pointer"
          >
            <div className="p-2 rounded-full bg-black/50 text-white backdrop-blur-md group-hover:bg-black/70 transition">
              <Share2 className="w-5 h-5" />
            </div>
          </button>

        </div>

        {/* Bottom Video Metadata */}
        <div className="absolute bottom-4 left-4 right-18 text-white z-20 space-y-1.5 pointer-events-none">
          
          <div className="flex items-center flex-wrap gap-1.5">
            <span className="font-bold text-sm drop-shadow">{currentVideo.creator}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-600/80 text-white font-semibold backdrop-blur-xs">
              24h Reel
            </span>
          </div>

          <p className="text-xs text-gray-100 font-medium line-clamp-2 drop-shadow leading-relaxed">
            {currentVideo.title}
          </p>

          {/* Sound pill */}
          <div className="flex items-center space-x-1.5 text-[10px] text-gray-300 bg-black/40 backdrop-blur-md px-2.5 py-1 rounded-full w-fit">
            <Sparkles className="w-3 h-3 text-emerald-400 shrink-0" />
            <span className="truncate max-w-[180px]">{currentVideo.soundTitle}</span>
          </div>

        </div>

        {/* Up / Down Navigation Controls (Desktop hover) */}
        <div className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 flex-col space-y-2 z-20">
          <button
            onClick={handlePrevVideo}
            title="Previous Reel"
            className="p-2 rounded-full bg-black/50 hover:bg-black/80 text-white transition backdrop-blur-md cursor-pointer"
          >
            <ChevronUp className="w-5 h-5" />
          </button>
          <button
            onClick={handleNextVideo}
            title="Next Reel"
            className="p-2 rounded-full bg-black/50 hover:bg-black/80 text-white transition backdrop-blur-md cursor-pointer"
          >
            <ChevronDown className="w-5 h-5" />
          </button>
        </div>

      </div>

      {/* Real Comments Modal */}
      {activeCommentVideo && (
        <CommentsModal
          isOpen={true}
          onClose={() => setActiveCommentVideo(null)}
          video={activeCommentVideo}
          currentUser={currentUser}
          onCommentAdded={() => {
            loadVideos();
          }}
        />
      )}

      {/* Upload Modal */}
      <UploadReelModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        currentUser={currentUser}
        onVideoUploaded={() => {
          loadVideos();
          setCurrentIndex(0);
          setToastMessage('Your video has been published for 24 hours!');
          setTimeout(() => setToastMessage(null), 3500);
        }}
      />

    </div>
  );
};
