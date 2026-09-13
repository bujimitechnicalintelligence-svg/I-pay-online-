import React, { useState, useRef, useEffect } from 'react';
import { X, Send, ImagePlus, UserCheck, MessageSquare, Camera } from 'lucide-react';
import { ShortVideo, UserAccount, VideoComment } from '../types';
import { addCommentToVideo, getUserCommentAvatar, setUserCommentAvatar } from '../utils/videoStorage';
import { addCloudVideoComment, subscribeToVideoComments } from '../utils/cloudSync';

interface CommentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  video: ShortVideo;
  currentUser: UserAccount;
  onCommentAdded: () => void;
}

export const CommentsModal: React.FC<CommentsModalProps> = ({
  isOpen,
  onClose,
  video,
  currentUser,
  onCommentAdded
}) => {
  const [comments, setComments] = useState<VideoComment[]>(() => {
    return video.commentsList || [];
  });

  useEffect(() => {
    if (!video.id) return;
    // Subscribe to genuine real comments from Firestore
    const unsubscribe = subscribeToVideoComments(video.id, (cloudComments) => {
      if (cloudComments.length > 0) {
        setComments(cloudComments);
      }
    });
    return () => {
      unsubscribe();
    };
  }, [video.id]);

  const [newComment, setNewComment] = useState('');
  const [userAvatar, setUserAvatarState] = useState<string>(() => getUserCommentAvatar(currentUser.displayName));
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Ready-to-pick icons/avatars for convenience
  const AVATAR_PRESETS = [
    `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(currentUser.displayName)}`,
    `https://api.dicebear.com/7.x/adventurer/svg?seed=Nigeria`,
    `https://api.dicebear.com/7.x/thumbs/svg?seed=Music`,
    `https://api.dicebear.com/7.x/fun-emoji/svg?seed=Happy`,
    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(currentUser.displayName)}`
  ];

  if (!isOpen) return null;

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const resultUrl = event.target.result as string;
          setUserAvatarState(resultUrl);
          setUserCommentAvatar(resultUrl);
          setShowAvatarPicker(false);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSelectPresetAvatar = (url: string) => {
    setUserAvatarState(url);
    setUserCommentAvatar(url);
    setShowAvatarPicker(false);
  };

  const handlePostComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    const newCmt: VideoComment = {
      id: 'c_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      authorName: `${currentUser.displayName} (${currentUser.state})`,
      authorAvatar: userAvatar,
      text: newComment.trim(),
      timestamp: 'Just now'
    };

    // 1. Save in local app storage
    const updated = addCommentToVideo(video.id, newCmt);
    setComments(prev => [newCmt, ...prev.filter(c => c.id !== newCmt.id)]);

    // 2. Save in Firestore database for all devices
    addCloudVideoComment(video.id, newCmt);

    setNewComment('');
    onCommentAdded();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl max-h-[80vh] flex flex-col animate-in slide-in-from-bottom duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center space-x-2">
            <MessageSquare className="w-4 h-4 text-emerald-600" />
            <h3 className="font-bold text-sm text-gray-900">
              Comments ({comments.length})
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Avatar Bar: requested "avatar button to upload the avatar or icon you want as the comment sections" */}
        <div className="py-2.5 px-3 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between my-2">
          <div className="flex items-center space-x-2.5">
            <div className="relative">
              <img
                src={userAvatar}
                alt="My Comment Avatar"
                className="w-8 h-8 rounded-full border border-emerald-500 object-cover bg-white"
              />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-800 leading-none">Your Comment Avatar</p>
              <p className="text-[10px] text-gray-500 mt-0.5">Click button to upload custom picture or icon</p>
            </div>
          </div>

          {/* Avatar Upload / Picker Button */}
          <button
            type="button"
            onClick={() => setShowAvatarPicker(!showAvatarPicker)}
            className="px-2.5 py-1.5 rounded-xl bg-white border border-gray-200 hover:border-emerald-500 text-emerald-700 hover:text-emerald-800 text-[11px] font-bold flex items-center space-x-1 shadow-2xs transition cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Change Avatar</span>
          </button>
        </div>

        {/* Avatar picker popup */}
        {showAvatarPicker && (
          <div className="p-3 bg-emerald-50/70 rounded-2xl border border-emerald-200 mb-2 space-y-2 text-xs">
            <input
              type="file"
              ref={avatarInputRef}
              onChange={handleAvatarFileChange}
              accept="image/*"
              className="hidden"
            />
            <div className="flex items-center justify-between">
              <span className="font-bold text-emerald-950 text-[11px]">Upload from device or pick icon:</span>
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="px-2 py-1 bg-emerald-600 text-white rounded-lg text-[10px] font-bold flex items-center space-x-1"
              >
                <ImagePlus className="w-3 h-3" />
                <span>Upload from Phone</span>
              </button>
            </div>
            <div className="flex items-center space-x-2 pt-1">
              {AVATAR_PRESETS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectPresetAvatar(preset)}
                  className="w-7 h-7 rounded-full border border-white hover:scale-110 transition overflow-hidden bg-white shadow-xs"
                >
                  <img src={preset} alt="preset" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* All comments list */}
        <div className="flex-1 overflow-y-auto py-2 space-y-3 min-h-[120px]">
          {comments.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400 space-y-1">
              <MessageSquare className="w-8 h-8 text-gray-300 mx-auto mb-1" />
              <p className="text-xs font-semibold text-gray-600">No comments yet</p>
              <p className="text-[11px] text-gray-400">Be the first to leave a comment on this reel.</p>
            </div>
          ) : (
            comments.map((cmt) => (
              <div key={cmt.id} className="flex space-x-2.5 text-xs">
                <img
                  src={cmt.authorAvatar}
                  alt={cmt.authorName}
                  className="w-8 h-8 rounded-full border border-gray-100 object-cover shrink-0 bg-white"
                />
                <div className="flex-1 bg-gray-50/80 p-2.5 rounded-2xl border border-gray-100">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-900 text-[11px]">{cmt.authorName}</span>
                    <span className="text-[10px] text-gray-400">{cmt.timestamp}</span>
                  </div>
                  <p className="text-gray-700 text-xs mt-1 leading-relaxed">{cmt.text}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Comment Input */}
        <form onSubmit={handlePostComment} className="pt-3 border-t border-gray-100 flex items-center gap-2">
          <img
            src={userAvatar}
            alt="My Avatar"
            className="w-7 h-7 rounded-full border border-emerald-500 shrink-0 object-cover bg-white"
          />
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a respectful comment on this reel..."
            className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="submit"
            disabled={!newComment.trim()}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold disabled:bg-gray-200 transition cursor-pointer flex items-center space-x-1"
          >
            <Send className="w-3 h-3" />
            <span className="hidden sm:inline">Post</span>
          </button>
        </form>

      </div>
    </div>
  );
};
