// Utility to wipe legacy data and local storage for a completely clean slate
export function performOneTimeCleanWipe(): void {
  const WIPE_VERSION_KEY = 'ipay_clean_slate_v6_done';
  try {
    if (localStorage.getItem(WIPE_VERSION_KEY) !== 'true') {
      // Clear all legacy mock data
      const keysToPurge = [
        'superapp_users_v2',
        'superapp_active_session_v2',
        'superapp_login_attempts_v2',
        'ipay_device_registered_accounts_v4',
        'ipay_store_products_v3',
        'ipay_store_daily_posts_v3',
        'ipay_user_social_v3',
        'ipay_user_followers_v3',
        'ipay_user_following_v3',
        'ipay_notifications_v3',
        'ipay_unread_chats_v3',
        'ipay_videos_v2',
        'ipay_cached_video_ids_v2',
        'ipay_watched_video_ids_v2',
        'ipay_chat_contacts_v4',
        'ipay_chat_messages_v4',
        'ipay_blocked_users_v4',
        'ipay_video_view_mode'
      ];
      keysToPurge.forEach(k => localStorage.removeItem(k));
      
      // Also delete legacy indexedDB if needed
      if (typeof window !== 'undefined' && window.indexedDB) {
        try {
          window.indexedDB.deleteDatabase('ipay_online_media_db_v1');
        } catch {}
      }

      localStorage.setItem(WIPE_VERSION_KEY, 'true');
    }
  } catch (e) {
    console.warn('One-time clean wipe failed:', e);
  }
}

export function manualWipeAllAppData(): void {
  try {
    localStorage.clear();
    localStorage.setItem('ipay_clean_slate_v6_done', 'true');
    if (typeof window !== 'undefined' && window.indexedDB) {
      try {
        window.indexedDB.deleteDatabase('ipay_online_media_db_v1');
      } catch {}
    }
    window.location.reload();
  } catch (err) {
    console.error('Manual wipe failed:', err);
  }
}
