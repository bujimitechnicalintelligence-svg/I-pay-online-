import React, { useState, useEffect } from 'react';
import { Home, MessageSquare, ShoppingBag, User, Bell, X } from 'lucide-react';
import { UserAccount, ChatContact, AppNotification } from '../types';
import { HomeReelsView } from './HomeReelsView';
import { ChatView } from './ChatView';
import { StoreView } from './StoreView';
import { MeProfileView } from './MeProfileView';
import { 
  getUnreadChatBadgeCount, 
  clearUnreadChatBadge, 
  requestPushNotificationPermission 
} from '../utils/appDatabase';
import { listenForIncomingChatNotifications } from '../utils/notificationService';

interface DashboardViewProps {
  currentUser: UserAccount;
  onLogout: () => void;
  onUserUpdated?: (updated: UserAccount) => void;
}

export type DashboardTab = 'home' | 'chat' | 'store' | 'me';

export const DashboardView: React.FC<DashboardViewProps> = ({
  currentUser,
  onLogout,
  onUserUpdated
}) => {
  const [activeTab, setActiveTab] = useState<DashboardTab>('home');
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  
  // Pending chat initiation from Store "Chat Seller"
  const [pendingChat, setPendingChat] = useState<{
    contact: ChatContact;
    message: string;
  } | null>(null);

  // In-app alert notification toast
  const [activeAlert, setActiveAlert] = useState<AppNotification | null>(null);

  useEffect(() => {
    // Request push notification permission for device push
    requestPushNotificationPermission();

    // Initial unread count
    setUnreadChatCount(getUnreadChatBadgeCount());

    // Listen to real-time notification events
    const handleNotification = (e: Event) => {
      const customEvent = e as CustomEvent<AppNotification>;
      if (customEvent.detail) {
        setActiveAlert(customEvent.detail);
        setTimeout(() => setActiveAlert(null), 5000);
      }
    };

    const handleUnreadChange = (e: Event) => {
      const customEvent = e as CustomEvent<number>;
      setUnreadChatCount(customEvent.detail ?? getUnreadChatBadgeCount());
    };

    window.addEventListener('ipay_notification_received', handleNotification);
    window.addEventListener('ipay_unread_chat_changed', handleUnreadChange);

    // Listen for incoming Firestore chat notifications in real time directly to phone
    const unsubFirestoreChat = listenForIncomingChatNotifications(
      currentUser.id,
      null,
      (senderName, text, avatar) => {
        setActiveAlert({
          id: 'alert_' + Date.now(),
          title: `💬 ${senderName}`,
          body: text,
          type: 'chat',
          senderAvatar: avatar,
          timestamp: Date.now()
        });
        setUnreadChatCount(prev => prev + 1);
        setTimeout(() => setActiveAlert(null), 6000);
      }
    );

    return () => {
      window.removeEventListener('ipay_notification_received', handleNotification);
      window.removeEventListener('ipay_unread_chat_changed', handleUnreadChange);
      unsubFirestoreChat();
    };
  }, [currentUser?.id]);

  // Handle Chat Seller action from StoreView
  const handleChatSeller = (contact: ChatContact, message: string) => {
    setPendingChat({ contact, message });
    setActiveTab('chat');
  };

  // Clear unread badge when user taps Chat tab
  const handleTabChange = (tab: DashboardTab) => {
    if (tab === 'chat') {
      clearUnreadChatBadge();
      setUnreadChatCount(0);
    }
    setActiveTab(tab);
  };

  return (
    <div className="min-h-screen bg-black text-gray-900 flex flex-col justify-between">
      
      {/* Top Notification Banner (for chats & posts while navigating) */}
      {activeAlert && (
        <div className="fixed top-3 inset-x-4 max-w-md mx-auto z-50 p-3.5 rounded-2xl bg-emerald-950 text-white border border-emerald-500 shadow-2xl flex items-center justify-between animate-in slide-in-from-top duration-200">
          <div 
            onClick={() => {
              if (activeAlert.type === 'chat') {
                handleTabChange('chat');
                setActiveAlert(null);
              }
            }}
            className="flex items-center space-x-3 min-w-0 flex-1 cursor-pointer"
          >
            {activeAlert.senderAvatar ? (
              <img
                src={activeAlert.senderAvatar}
                alt="Avatar"
                className="w-9 h-9 rounded-full object-cover border border-emerald-400 shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center shrink-0">
                <Bell className="w-4 h-4 text-white" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate">{activeAlert.title}</p>
              <p className="text-[11px] text-emerald-200 line-clamp-1">{activeAlert.body}</p>
            </div>
          </div>
          <button
            onClick={() => setActiveAlert(null)}
            className="p-1 text-emerald-400 hover:text-white rounded-full ml-2 shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Header - Kept clean and minimal, hidden on Home to keep Home completely free of any text as requested */}
      {activeTab !== 'home' && (
        <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 shadow-2xs">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <span className="font-extrabold text-base text-gray-900 tracking-tight">
              I-pay-online
            </span>
            <span className="text-xs text-gray-500 font-medium">
              {currentUser.state} State, Nigeria
            </span>
          </div>
        </header>
      )}

      {/* Main Tab Area */}
      <main className="flex-1 w-full bg-black">
        {activeTab === 'home' && <HomeReelsView currentUser={currentUser} />}
        
        {activeTab === 'chat' && (
          <ChatView 
            currentUser={currentUser}
            initialContact={pendingChat?.contact}
            initialMessage={pendingChat?.message}
            onClearInitial={() => setPendingChat(null)}
          />
        )}

        {activeTab === 'store' && (
          <StoreView 
            currentUser={currentUser}
            onChatSeller={handleChatSeller}
          />
        )}

        {activeTab === 'me' && (
          <MeProfileView 
            currentUser={currentUser} 
            onLogout={onLogout}
            onUserUpdated={onUserUpdated}
          />
        )}
      </main>

      {/* Bottom Navigation Buttons: Home, Chat, Store, Me */}
      <nav className="sticky bottom-0 inset-x-0 z-40 bg-black/95 backdrop-blur-md border-t border-white/15 py-2 px-3">
        <div className="max-w-md mx-auto grid grid-cols-4 gap-1 text-center">
          
          {/* Home button */}
          <button
            onClick={() => handleTabChange('home')}
            className={`flex flex-col items-center py-1.5 rounded-xl transition cursor-pointer ${
              activeTab === 'home' ? 'text-emerald-400 font-bold' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[11px] mt-0.5 tracking-tight">Home</span>
          </button>

          {/* Chat button with Unwatched / Unread Mark */}
          <button
            onClick={() => handleTabChange('chat')}
            className={`relative flex flex-col items-center py-1.5 rounded-xl transition cursor-pointer ${
              activeTab === 'chat' ? 'text-emerald-400 font-bold' : 'text-gray-400 hover:text-white'
            }`}
          >
            <div className="relative">
              <MessageSquare className="w-5 h-5" />
              {unreadChatCount > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-4 h-4 px-1 rounded-full bg-emerald-500 text-white text-[9px] font-black flex items-center justify-center ring-2 ring-black shadow-xs animate-pulse">
                  {unreadChatCount}
                </span>
              )}
            </div>
            <span className="text-[11px] mt-0.5 tracking-tight">Chat</span>
          </button>

          {/* Store button */}
          <button
            onClick={() => handleTabChange('store')}
            className={`flex flex-col items-center py-1.5 rounded-xl transition cursor-pointer ${
              activeTab === 'store' ? 'text-emerald-400 font-bold' : 'text-gray-400 hover:text-white'
            }`}
          >
            <ShoppingBag className="w-5 h-5" />
            <span className="text-[11px] mt-0.5 tracking-tight">Store</span>
          </button>

          {/* Me button */}
          <button
            onClick={() => handleTabChange('me')}
            className={`flex flex-col items-center py-1.5 rounded-xl transition cursor-pointer ${
              activeTab === 'me' ? 'text-emerald-400 font-bold' : 'text-gray-400 hover:text-white'
            }`}
          >
            <User className="w-5 h-5" />
            <span className="text-[11px] mt-0.5 tracking-tight">Me</span>
          </button>

        </div>
      </nav>

    </div>
  );
};
