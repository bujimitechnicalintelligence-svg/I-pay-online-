import React, { useState, useEffect } from 'react';
import { 
  User, MapPin, Mail, Shield, HardDrive, Trash2, LogOut, 
  Smartphone, Clock, Check, Sparkles, Settings, Users, UserPlus, 
  Heart, Star, Lock, Eye, EyeOff, X, Award, AlertCircle, RefreshCw
} from 'lucide-react';
import { UserAccount, ShortVideo, FollowUserItem, UserSocialStats } from '../types';
import { clearActiveSession, updateUserAccount, validateStrongPassword } from '../utils/authStorage';
import { getActiveVideos, getCachedVideoIds, clearAllCachedVideos, deleteVideo } from '../utils/videoStorage';
import { deleteCloudVideoReel } from '../utils/cloudSync';
import { 
  getUserSocialStats, 
  getFollowersList, 
  getFollowingList, 
  unfollowUser, 
  dispatchNotification 
} from '../utils/appDatabase';
import { ApkDownloadModal } from './ApkDownloadModal';

interface MeProfileViewProps {
  currentUser: UserAccount;
  onLogout: () => void;
  onUserUpdated?: (updated: UserAccount) => void;
}

export const MeProfileView: React.FC<MeProfileViewProps> = ({
  currentUser,
  onLogout,
  onUserUpdated
}) => {
  const [cachedCount, setCachedCount] = useState(0);
  const [myVideos, setMyVideos] = useState<ShortVideo[]>([]);
  const [showApkModal, setShowApkModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Social Stats State
  const [socialStats, setSocialStats] = useState<UserSocialStats>({
    followersCount: 0,
    followingCount: 0,
    totalLikes: 0,
    unlockedRewardNgn: 0,
    hasSpecialBadge: false
  });

  // Modals
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Lists
  const [followers, setFollowers] = useState<FollowUserItem[]>([]);
  const [following, setFollowing] = useState<FollowUserItem[]>([]);

  // Settings State: Change Password
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  // Settings State: Change Avatar URL or choose preset
  const [avatarInput, setAvatarInput] = useState(currentUser.avatarUrl || '');

  // Delete Video Modal
  const [videoToDelete, setVideoToDelete] = useState<ShortVideo | null>(null);
  const [isDeletingVideo, setIsDeletingVideo] = useState(false);

  const loadData = () => {
    const cached = getCachedVideoIds();
    setCachedCount(cached.size);
    const all = getActiveVideos();
    const mine = all.filter(v => v.creator.toLowerCase() === currentUser.displayName.toLowerCase());
    setMyVideos(mine);

    // Social stats & followers/following
    const stats = getUserSocialStats();
    setSocialStats(stats);
    setFollowers(getFollowersList());
    setFollowing(getFollowingList());
  };

  useEffect(() => {
    loadData();
  }, [currentUser]);

  const handleClearCache = () => {
    clearAllCachedVideos();
    setCachedCount(0);
    setToastMessage('All offline videos un-cached to free device storage.');
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleLogout = () => {
    clearActiveSession();
    onLogout();
  };

  // Handle Delete Video before 24 hours
  const handleConfirmDeleteVideo = async () => {
    if (!videoToDelete) return;
    setIsDeletingVideo(true);
    const id = videoToDelete.id;

    try {
      // 1. Delete locally from app storage
      deleteVideo(id);

      // 2. Delete from cloud database
      await deleteCloudVideoReel(id);

      // 3. Update state
      setMyVideos(prev => prev.filter(v => v.id !== id));
      setToastMessage('Video deleted successfully before 24 hours.');
      setTimeout(() => setToastMessage(null), 3500);
    } catch (err) {
      console.warn('Failed to delete video:', err);
      setToastMessage('Video removed from your device.');
      setTimeout(() => setToastMessage(null), 3500);
    } finally {
      setIsDeletingVideo(false);
      setVideoToDelete(null);
    }
  };

  // Handle Unfollow in Following Modal
  const handleUnfollow = (userId: string, userName: string) => {
    const updated = unfollowUser(userId);
    setFollowing(updated);
    const refreshedStats = getUserSocialStats();
    setSocialStats(refreshedStats);
    setToastMessage(`You unfollowed ${userName}`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Handle Password Change in Settings
  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    // Verify current password
    if (currentPasswordInput !== currentUser.passwordHash) {
      setPasswordError('Current password entered is incorrect. Please re-check.');
      return;
    }

    if (newPasswordInput.length < 8) {
      setPasswordError('New password must be at least 8 characters long.');
      return;
    }

    if (newPasswordInput !== confirmPasswordInput) {
      setPasswordError('New passwords do not match. Please ensure both fields match.');
      return;
    }

    // Validation passes: update in storage
    const updatedUser: UserAccount = {
      ...currentUser,
      passwordHash: newPasswordInput,
      avatarUrl: avatarInput || currentUser.avatarUrl
    };

    updateUserAccount(updatedUser);
    if (onUserUpdated) {
      onUserUpdated(updatedUser);
    }

    setPasswordSuccess('Password successfully updated and securely saved!');
    setCurrentPasswordInput('');
    setNewPasswordInput('');
    setConfirmPasswordInput('');

    dispatchNotification({
      title: 'Security Update 🔐',
      body: 'Your I-pay-online account password was successfully changed.',
      type: 'reward'
    });

    setTimeout(() => {
      setPasswordSuccess(null);
      setShowSettingsModal(false);
    }, 2000);
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-50 pb-20 p-4 sm:p-6 max-w-xl mx-auto space-y-5">
      
      {toastMessage && (
        <div className="p-3 rounded-2xl bg-emerald-600 text-white text-xs font-semibold shadow-md animate-in fade-in">
          {toastMessage}
        </div>
      )}

      {/* Main Profile Card */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-gray-200 shadow-2xs space-y-4">
        
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3.5">
            <div className="relative">
              {currentUser.avatarUrl ? (
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.displayName}
                  className="w-16 h-16 rounded-full object-cover border-2 border-emerald-500 shadow-md"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center font-black text-2xl shadow-md">
                  {currentUser.displayName.charAt(0).toUpperCase()}
                </div>
              )}

              {/* Special Badge Icon on Avatar if 20+ followers */}
              {socialStats.hasSpecialBadge && (
                <div 
                  title="⭐ Special Creator Badge (20+ Real Followers)"
                  className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-amber-400 text-amber-950 flex items-center justify-center border-2 border-white shadow-sm ring-1 ring-amber-500"
                >
                  <Star className="w-3.5 h-3.5 fill-amber-900" />
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                <h2 className="text-base sm:text-lg font-bold text-gray-900 leading-tight">
                  {currentUser.displayName}
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase">
                  {currentUser.provider}
                </span>
              </div>

              <p className="text-xs font-mono font-semibold text-emerald-700 mt-0.5">
                {currentUser.username}
              </p>

              <p className="text-[11px] text-gray-500 flex items-center space-x-1 mt-0.5">
                <Mail className="w-3 h-3 text-gray-400 shrink-0" />
                <span className="truncate">{currentUser.providerEmail}</span>
              </p>
            </div>
          </div>

          {/* Settings Button as requested */}
          <button
            onClick={() => setShowSettingsModal(true)}
            className="p-2.5 rounded-2xl bg-gray-100 hover:bg-emerald-50 text-gray-600 hover:text-emerald-700 transition cursor-pointer border border-gray-200"
            title="Account Settings (@username, Avatar, Password)"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>

        {/* SPECIAL BADGE BANNER: Awarded if user has 20+ real followers */}
        {socialStats.hasSpecialBadge ? (
          <div className="p-3 bg-gradient-to-r from-amber-50 via-amber-100/70 to-emerald-50 rounded-2xl border border-amber-300 flex items-center space-x-3 shadow-2xs">
            <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center space-x-1.5">
                <span className="text-xs font-extrabold text-amber-950">
                  ⭐ Special Verified Creator Badge
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-400 text-amber-950 font-black">
                  ACTIVE
                </span>
              </div>
              <p className="text-[11px] text-amber-900 leading-tight mt-0.5">
                Earned by reaching <strong>{socialStats.followersCount} real followers</strong> on I-pay-online!
              </p>
            </div>
          </div>
        ) : (
          <div className="p-2.5 bg-gray-50 rounded-2xl border border-gray-200 flex items-center justify-between text-xs text-gray-600">
            <div className="flex items-center space-x-2">
              <Star className="w-4 h-4 text-amber-500" />
              <span>Special Badge: <strong>{socialStats.followersCount}/20 Followers</strong></span>
            </div>
            <span className="text-[10px] font-bold text-gray-400">Reach 20 for Badge</span>
          </div>
        )}

        {/* 5,000 NAIRA UNLOCKED REWARD CARD (Visible to you only) */}
        {socialStats.unlockedRewardNgn > 0 ? (
          <div className="p-4 bg-emerald-950 text-white rounded-2xl border border-emerald-700 shadow-md space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-emerald-300">
                <Lock className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  Unlocked Creator Bonus (Visible to you only)
                </span>
              </div>
              <span className="px-2 py-0.5 bg-emerald-800 text-emerald-200 text-[10px] font-extrabold rounded-md uppercase">
                Unlocked
              </span>
            </div>

            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-black tracking-tight text-emerald-300">
                ₦{socialStats.unlockedRewardNgn.toLocaleString()}
              </span>
              <span className="text-xs text-emerald-200 font-medium">
                (5 Thousand Naira Creator Milestone)
              </span>
            </div>

            <p className="text-[11px] text-emerald-200/90 leading-relaxed pt-1 border-t border-emerald-900">
              🎉 Congratulations! By having <strong>{socialStats.followersCount} real followers</strong> and <strong>{socialStats.totalLikes} likes</strong>, you unlocked your ₦5,000 creator bonus credited to your account!
            </p>
          </div>
        ) : (
          <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs text-emerald-950 space-y-1.5">
            <div className="flex items-center justify-between font-bold">
              <span className="flex items-center space-x-1.5 text-emerald-900">
                <Lock className="w-3.5 h-3.5 text-emerald-600" />
                <span>Unlock ₦5,000 Creator Reward</span>
              </span>
              <span className="text-[11px] text-emerald-700 font-mono font-semibold">
                {socialStats.followersCount}/20 Followers • {socialStats.totalLikes}/20 Likes
              </span>
            </div>
            <p className="text-[11px] text-emerald-800 leading-snug">
              Get 20 real followers + 20 likes to unlock <strong>₦5,000.00</strong> visible in your account to you only.
            </p>
          </div>
        )}

        {/* SOCIAL STATS BUTTONS: FOLLOWERS, FOLLOWING, LIKES (with real numbers) */}
        <div className="grid grid-cols-3 gap-2.5 pt-1">
          
          {/* Followers Button */}
          <button
            onClick={() => setShowFollowersModal(true)}
            className="p-3 rounded-2xl bg-gray-50 hover:bg-emerald-50 border border-gray-200 hover:border-emerald-300 transition text-center cursor-pointer group"
          >
            <div className="flex items-center justify-center space-x-1 text-gray-500 group-hover:text-emerald-700 mb-0.5">
              <Users className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Followers</span>
            </div>
            <p className="text-base sm:text-lg font-black text-gray-900 group-hover:text-emerald-700">
              {socialStats.followersCount}
            </p>
            <span className="text-[10px] text-emerald-600 font-medium block">View list</span>
          </button>

          {/* Following Button */}
          <button
            onClick={() => setShowFollowingModal(true)}
            className="p-3 rounded-2xl bg-gray-50 hover:bg-emerald-50 border border-gray-200 hover:border-emerald-300 transition text-center cursor-pointer group"
          >
            <div className="flex items-center justify-center space-x-1 text-gray-500 group-hover:text-emerald-700 mb-0.5">
              <UserPlus className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Following</span>
            </div>
            <p className="text-base sm:text-lg font-black text-gray-900 group-hover:text-emerald-700">
              {socialStats.followingCount}
            </p>
            <span className="text-[10px] text-emerald-600 font-medium block">Unfollow</span>
          </button>

          {/* Likes Button */}
          <button
            onClick={() => {
              setToastMessage(`Total verified likes received across your posts & reels: ${socialStats.totalLikes}`);
              setTimeout(() => setToastMessage(null), 3000);
            }}
            className="p-3 rounded-2xl bg-gray-50 hover:bg-rose-50 border border-gray-200 hover:border-rose-300 transition text-center cursor-pointer group"
          >
            <div className="flex items-center justify-center space-x-1 text-gray-500 group-hover:text-rose-600 mb-0.5">
              <Heart className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Likes</span>
            </div>
            <p className="text-base sm:text-lg font-black text-gray-900 group-hover:text-rose-600">
              {socialStats.totalLikes}
            </p>
            <span className="text-[10px] text-rose-500 font-medium block">Total</span>
          </button>

        </div>

        {/* Location Info (Preserved exactly as requested) */}
        <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100 space-y-1 text-xs text-gray-700">
          <div className="flex items-center space-x-2 text-gray-900 font-bold">
            <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>{currentUser.lga} LGA, {currentUser.state} State, Nigeria</span>
          </div>
          <p className="text-[11px] text-gray-500 pl-5">
            Address: {currentUser.address}
          </p>
        </div>

      </div>

      {/* Offline Storage Caching & 24h Rules Manager (Preserved) */}
      <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <HardDrive className="w-4 h-4 text-emerald-600" />
            <h3 className="font-bold text-sm text-gray-900">Device Storage & Offline Cache</h3>
          </div>
          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
            {cachedCount} Cached Reels
          </span>
        </div>

        <p className="text-xs text-gray-600 leading-relaxed">
          Videos you cache in device storage can be watched without online connection and do not consume your bandwidth.
          Uncached videos automatically disappear from the app and database after <strong>24 hours</strong>.
        </p>

        {cachedCount > 0 && (
          <button
            onClick={handleClearCache}
            className="w-full py-2.5 px-4 rounded-xl border border-red-200 hover:bg-red-50 text-red-700 text-xs font-bold transition flex items-center justify-center space-x-1.5 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Uncache All Videos (Free Storage)</span>
          </button>
        )}
      </div>

      {/* My Published Reels (Preserved) */}
      <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-2xs space-y-3">
        <div className="flex items-center space-x-2">
          <Clock className="w-4 h-4 text-emerald-600" />
          <h3 className="font-bold text-sm text-gray-900">My 24-Hour Reels</h3>
        </div>

        {myVideos.length === 0 ? (
          <p className="text-xs text-gray-400 py-3 text-center">
            You haven't posted any reels yet. Tap the <strong>+</strong> button on Home to upload a reel from your device!
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {myVideos.map((vid) => (
              <div key={vid.id} className="relative rounded-xl overflow-hidden bg-black h-36 group">
                <img src={vid.thumbnailUrl} alt={vid.title} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/30 flex flex-col justify-between p-2 text-white">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setVideoToDelete(vid);
                      }}
                      title="Delete Video before 24 hours"
                      className="p-1.5 rounded-full bg-red-600/90 hover:bg-red-600 text-white shadow-md transition cursor-pointer hover:scale-105"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold truncate">{vid.title}</p>
                    <div className="flex items-center justify-between text-[9px] text-amber-300 mt-0.5">
                      <span>24h Active</span>
                      <button
                        type="button"
                        onClick={() => setVideoToDelete(vid)}
                        className="text-red-300 hover:text-red-200 font-bold underline cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* APK & Log Out (Preserved) */}
      <div className="space-y-2 pt-2">
        <button
          onClick={() => setShowApkModal(true)}
          className="w-full py-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center space-x-1.5 border border-emerald-200 transition cursor-pointer"
        >
          <Smartphone className="w-4 h-4" />
          <span>Download I-pay-online APK Package</span>
        </button>

        <button
          onClick={handleLogout}
          className="w-full py-3 rounded-2xl bg-white hover:bg-red-50 text-red-600 hover:text-red-700 font-bold text-xs flex items-center justify-center space-x-1.5 border border-gray-200 hover:border-red-200 transition cursor-pointer shadow-2xs"
        >
          <LogOut className="w-4 h-4" />
          <span>Log Out of I-pay-online</span>
        </button>
      </div>

      <ApkDownloadModal isOpen={showApkModal} onClose={() => setShowApkModal(false)} />

      {/* MODAL 1: VIEW FOLLOWERS LIST */}
      {showFollowersModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-3xl p-5 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Your Real Followers</h3>
                <p className="text-[11px] text-gray-500">
                  {followers.length} members follow you on I-pay-online
                </p>
              </div>
              <button
                onClick={() => setShowFollowersModal(false)}
                className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-gray-100 pr-1">
              {followers.map((u) => (
                <div key={u.id} className="py-2.5 flex items-center justify-between">
                  <div className="flex items-center space-x-3 min-w-0">
                    <img
                      src={u.avatar}
                      alt={u.name}
                      className="w-10 h-10 rounded-full object-cover border border-gray-200 shrink-0"
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-gray-900 truncate">{u.name}</p>
                      <p className="text-[11px] font-mono text-emerald-700 truncate">{u.username}</p>
                      <p className="text-[10px] text-gray-400 truncate">{u.lga}, {u.state}</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100">
                    Follower
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowFollowersModal(false)}
              className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* MODAL 2: VIEW FOLLOWING LIST WITH UNFOLLOW ACTION */}
      {showFollowingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-3xl p-5 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <div>
                <h3 className="text-sm font-bold text-gray-900">People You Follow</h3>
                <p className="text-[11px] text-gray-500">
                  {following.length} creators followed • Tap unfollow anytime
                </p>
              </div>
              <button
                onClick={() => setShowFollowingModal(false)}
                className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-gray-100 pr-1">
              {following.length === 0 ? (
                <div className="py-10 text-center text-xs text-gray-400">
                  You are not following any creators currently.
                </div>
              ) : (
                following.map((u) => (
                  <div key={u.id} className="py-2.5 flex items-center justify-between">
                    <div className="flex items-center space-x-3 min-w-0">
                      <img
                        src={u.avatar}
                        alt={u.name}
                        className="w-10 h-10 rounded-full object-cover border border-gray-200 shrink-0"
                        referrerPolicy="no-referrer"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-900 truncate">{u.name}</p>
                        <p className="text-[11px] font-mono text-emerald-700 truncate">{u.username}</p>
                      </div>
                    </div>

                    {/* Unfollow Button */}
                    <button
                      onClick={() => handleUnfollow(u.id, u.name)}
                      className="px-3 py-1.5 bg-gray-100 hover:bg-red-50 text-gray-700 hover:text-red-700 border border-gray-200 hover:border-red-200 rounded-xl text-xs font-bold transition cursor-pointer shrink-0"
                    >
                      Unfollow
                    </button>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={() => setShowFollowingModal(false)}
              className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* MODAL 3: SETTINGS (Shows @username, Avatar, Change Password) */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl space-y-5 my-auto animate-in zoom-in-95">
            
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center space-x-2">
                <Settings className="w-5 h-5 text-emerald-700" />
                <h3 className="text-sm font-bold text-gray-900">Profile & Security Settings</h3>
              </div>
              <button
                onClick={() => {
                  setShowSettingsModal(false);
                  setPasswordError(null);
                  setPasswordSuccess(null);
                }}
                className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 1. @Username Display */}
            <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-200 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                  Your Registered Handle
                </span>
                <span className="text-sm font-mono font-bold text-emerald-700">
                  {currentUser.username}
                </span>
              </div>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                Active ID
              </span>
            </div>

            {/* 2. Avatar Display & Update */}
            <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-200 space-y-3">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                Profile Avatar Photo
              </span>
              <div className="flex items-center space-x-3">
                <img
                  src={avatarInput || currentUser.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80'}
                  alt="Avatar Preview"
                  className="w-14 h-14 rounded-full object-cover border-2 border-emerald-500 shadow-sm"
                  referrerPolicy="no-referrer"
                />
                <div className="flex-1 space-y-1">
                  <input
                    type="url"
                    value={avatarInput}
                    onChange={(e) => setAvatarInput(e.target.value)}
                    placeholder="Paste image URL or avatar link..."
                    className="w-full px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                  <p className="text-[10px] text-gray-500">Avatar updates when saving changes below.</p>
                </div>
              </div>
            </div>

            {/* 3. Password Change Section */}
            <form onSubmit={handleChangePassword} className="space-y-3.5">
              <div className="border-t border-gray-100 pt-3">
                <span className="text-xs font-bold text-gray-900 block">
                  Change Account Password
                </span>
                <p className="text-[11px] text-gray-500">
                  Enter your correct existing password to set a new one.
                </p>
              </div>

              {passwordError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{passwordError}</span>
                </div>
              )}

              {passwordSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center space-x-2">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>{passwordSuccess}</span>
                </div>
              )}

              {/* Enter Current Correct Password */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-gray-700">
                  Current Password (Must be correct)
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPw ? 'text' : 'password'}
                    value={currentPasswordInput}
                    onChange={(e) => setCurrentPasswordInput(e.target.value)}
                    placeholder="Enter current password..."
                    className="w-full pl-3 pr-10 py-2 text-xs border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPw(!showCurrentPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showCurrentPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Enter New Password */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-gray-700">
                  New Password (Min. 8 characters)
                </label>
                <div className="relative">
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    value={newPasswordInput}
                    onChange={(e) => setNewPasswordInput(e.target.value)}
                    placeholder="Enter new strong password..."
                    className="w-full pl-3 pr-10 py-2 text-xs border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw(!showNewPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showNewPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Re-enter New Password */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-gray-700">
                  Re-enter New Password (Confirmation)
                </label>
                <input
                  type="password"
                  value={confirmPasswordInput}
                  onChange={(e) => setConfirmPasswordInput(e.target.value)}
                  placeholder="Re-type new password to confirm..."
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div className="pt-2 flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="w-1/3 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-2/3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-sm cursor-pointer"
                >
                  Save & Update Password
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* MODAL 4: DELETE VIDEO CONFIRMATION (DELETE BEFORE 24 HOURS) */}
      {videoToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-extrabold text-gray-950">Delete Video Reel?</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Are you sure you want to delete <strong className="text-gray-800">"{videoToDelete.title}"</strong> before its 24-hour expiration?
              </p>
              <p className="text-[11px] text-red-600 font-medium">
                This will delete the video from your profile and remove it from the feed across all devices.
              </p>
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setVideoToDelete(null)}
                disabled={isDeletingVideo}
                className="w-1/2 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-bold text-xs hover:bg-gray-100 transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteVideo}
                disabled={isDeletingVideo}
                className="w-1/2 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md transition cursor-pointer disabled:opacity-50 flex items-center justify-center space-x-1.5"
              >
                {isDeletingVideo ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Now</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
