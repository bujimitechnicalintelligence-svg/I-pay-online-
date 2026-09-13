import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, Search, Plus, ArrowLeft, MoreVertical, ShieldAlert, 
  Trash2, X, Check, CheckCheck, MapPin, UserCheck, AlertTriangle
} from 'lucide-react';
import { UserAccount, ChatContact, ChatMessage } from '../types';
import { 
  getChatConversations, 
  saveChatContact, 
  deleteChatHistory, 
  getMessagesForContact, 
  addMessageToChat, 
  deleteMessageForBoth, 
  deleteMessageForMe, 
  getPeopleRegisteredNearLocation,
  isUserBlocked,
  toggleBlockUser,
  markContactAsRead
} from '../utils/chatStorage';
import { dispatchNotification, clearUnreadChatBadge } from '../utils/appDatabase';
import { 
  computeChatId, 
  subscribeToChatMessages, 
  sendCloudChatMessage, 
  syncUserProfileToCloud, 
  subscribeToCrossDeviceUsers 
} from '../utils/cloudSync';

interface ChatViewProps {
  currentUser: UserAccount;
  initialContact?: ChatContact | null;
  initialMessage?: string;
  onClearInitial?: () => void;
}

export const ChatView: React.FC<ChatViewProps> = ({ 
  currentUser,
  initialContact,
  initialMessage,
  onClearInitial
}) => {
  // Navigation / active chat state
  const [activeContact, setActiveContact] = useState<ChatContact | null>(null);
  const [isViewingNearby, setIsViewingNearby] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Conversations & Nearby contacts lists
  const [conversations, setConversations] = useState<ChatContact[]>([]);
  const [nearbyPeople, setNearbyPeople] = useState<ChatContact[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');

  // Header User Details / 3-Dot Block Modal
  const [showHeaderDetailsModal, setShowHeaderDetailsModal] = useState(false);
  const [showBlockConfirmModal, setShowBlockConfirmModal] = useState(false);

  // Holding Message Delete Modal
  const [selectedMessageForDelete, setSelectedMessageForDelete] = useState<ChatMessage | null>(null);

  // Holding Chat in list Delete History Modal
  const [contactToDeleteHistory, setContactToDeleteHistory] = useState<ChatContact | null>(null);

  // Long press refs & helpers
  const pressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressTriggered = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load initial data
  const refreshConversations = () => {
    const list = getChatConversations();
    setConversations(list);
  };

  const refreshNearby = () => {
    const nearby = getPeopleRegisteredNearLocation(currentUser);
    setNearbyPeople(nearby);
  };

  useEffect(() => {
    refreshConversations();
    refreshNearby();
    // Sync current profile to cloud
    syncUserProfileToCloud(currentUser);

    // Subscribe to cross-device users registered across other phones
    const unsubscribeUsers = subscribeToCrossDeviceUsers((cloudUsers) => {
      if (cloudUsers.length > 0) {
        // Merge cloud users who are not current user
        const otherUsers = cloudUsers.filter(u => u.id !== currentUser.id);
        if (otherUsers.length > 0) {
          setNearbyPeople(prev => {
            const map = new Map<string, ChatContact>();
            prev.forEach(p => map.set(p.id, p));
            otherUsers.forEach(u => map.set(u.id, u));
            return Array.from(map.values());
          });
        }
      }
    });

    const handleIncomingMessage = () => {
      refreshConversations();
    };
    window.addEventListener('ipay_chat_message_received', handleIncomingMessage);

    return () => {
      unsubscribeUsers();
      window.removeEventListener('ipay_chat_message_received', handleIncomingMessage);
    };
  }, [currentUser]);

  // Open initial contact if provided (e.g. from Store "Chat Seller to Buy")
  useEffect(() => {
    if (initialContact) {
      saveChatContact(initialContact);
      markContactAsRead(initialContact.id);
      clearUnreadChatBadge();
      setActiveContact(initialContact);
      if (initialMessage) {
        setInputMessage(initialMessage);
      }
      if (onClearInitial) {
        onClearInitial();
      }
      refreshConversations();
    }
  }, [initialContact]);

  // Load messages when an active contact is selected and subscribe to cloud messages
  useEffect(() => {
    if (!activeContact) return;

    markContactAsRead(activeContact.id);
    clearUnreadChatBadge();
    const localMsgs = getMessagesForContact(activeContact.id);
    setMessages(localMsgs);
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);

    // Real-time Firestore cross-device subscription
    const chatId = computeChatId(currentUser.id, activeContact.id);
    const unsubscribe = subscribeToChatMessages(chatId, (cloudMsgs) => {
      if (cloudMsgs.length > 0) {
        setMessages(prev => {
          const map = new Map<string, ChatMessage>();
          prev.forEach(m => map.set(m.id, m));
          cloudMsgs.forEach(m => {
            // Determine if message was sent by me
            const isMe = m.senderId === currentUser.id;
            map.set(m.id, { ...m, isMe });
          });
          const combined = Array.from(map.values()).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
          return combined;
        });

        // Update local storage so offline access works seamlessly
        cloudMsgs.forEach(m => {
          addMessageToChat(activeContact.id, {
            ...m,
            isMe: m.senderId === currentUser.id
          });
        });

        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 80);
      }
    });

    const handleIncomingForActive = (e: Event) => {
      const custom = e as CustomEvent<{ senderId: string }>;
      if (custom.detail && custom.detail.senderId === activeContact.id) {
        setMessages(getMessagesForContact(activeContact.id));
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 50);
      }
    };
    window.addEventListener('ipay_chat_message_received', handleIncomingForActive);

    return () => {
      unsubscribe();
      window.removeEventListener('ipay_chat_message_received', handleIncomingForActive);
    };
  }, [activeContact, currentUser.id]);

  // Send message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !activeContact) return;

    if (isUserBlocked(activeContact.id)) {
      alert(`Cannot send message: You have blocked @${activeContact.username.replace('@', '')}. Unblock to continue chatting.`);
      return;
    }

    const text = inputMessage.trim();
    const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newMsg: ChatMessage = {
      id: msgId,
      senderId: currentUser.id,
      senderName: currentUser.displayName,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isMe: true,
      createdAt: Date.now()
    };

    addMessageToChat(activeContact.id, newMsg);
    setMessages(prev => {
      if (prev.some(m => m.id === msgId)) return prev;
      return [...prev, newMsg];
    });
    setInputMessage('');
    refreshConversations();

    // Push to Firestore so the other device receives it in real-time
    const chatId = computeChatId(currentUser.id, activeContact.id);
    sendCloudChatMessage(chatId, currentUser, activeContact.id, text, msgId);

    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  };

  // Start chat with a contact (e.g. from nearby list or search)
  const handleStartChatWith = (contact: ChatContact) => {
    saveChatContact(contact);
    markContactAsRead(contact.id);
    clearUnreadChatBadge();
    setActiveContact(contact);
    setIsViewingNearby(false);
    setSearchQuery('');
    refreshConversations();
  };

  // Block / Unblock logic
  const handleToggleBlock = () => {
    if (!activeContact) return;
    const nowBlocked = toggleBlockUser(activeContact.id);
    setActiveContact(prev => prev ? { ...prev, isBlocked: nowBlocked } : null);
    refreshConversations();
    setShowBlockConfirmModal(false);
    setShowHeaderDetailsModal(false);
  };

  // Delete chat history confirmation
  const handleConfirmDeleteHistory = () => {
    if (!contactToDeleteHistory) return;
    deleteChatHistory(contactToDeleteHistory.id);
    if (activeContact?.id === contactToDeleteHistory.id) {
      setActiveContact(null);
    }
    setContactToDeleteHistory(null);
    refreshConversations();
  };

  // Delete message handlers
  const handleDeleteForBoth = () => {
    if (!activeContact || !selectedMessageForDelete) return;
    deleteMessageForBoth(activeContact.id, selectedMessageForDelete.id);
    setMessages(prev => prev.filter(m => m.id !== selectedMessageForDelete.id));
    setSelectedMessageForDelete(null);
    refreshConversations();
  };

  const handleDeleteForMe = () => {
    if (!activeContact || !selectedMessageForDelete) return;
    deleteMessageForMe(activeContact.id, selectedMessageForDelete.id);
    setMessages(prev => prev.filter(m => m.id !== selectedMessageForDelete.id));
    setSelectedMessageForDelete(null);
    refreshConversations();
  };

  // Long press message bubble handlers
  const handleMessagePressStart = (msg: ChatMessage) => {
    isLongPressTriggered.current = false;
    pressTimerRef.current = setTimeout(() => {
      isLongPressTriggered.current = true;
      setSelectedMessageForDelete(msg);
    }, 500);
  };

  const handleMessagePressEnd = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  // Long press contact in list handlers
  const handleContactPressStart = (contact: ChatContact) => {
    isLongPressTriggered.current = false;
    pressTimerRef.current = setTimeout(() => {
      isLongPressTriggered.current = true;
      setContactToDeleteHistory(contact);
    }, 600);
  };

  const handleContactPressEnd = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  // Filtering for active conversations
  const filteredConversations = conversations.filter(c => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.username.toLowerCase().includes(q) ||
      (c.lastMessage && c.lastMessage.toLowerCase().includes(q))
    );
  });

  // Filtering for nearby registered people
  const filteredNearby = nearbyPeople.filter(p => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.username.toLowerCase().includes(q) ||
      (p.state && p.state.toLowerCase().includes(q)) ||
      (p.lga && p.lga.toLowerCase().includes(q))
    );
  });

  return (
    <div className="relative h-[calc(100vh-64px)] sm:h-[calc(100vh-70px)] bg-gray-50 flex flex-col max-w-4xl mx-auto overflow-hidden">
      
      {/* 1. TOP HEADER (Search bar & clean header without unnecessary texts) */}
      <div className="bg-white px-3.5 py-2.5 border-b border-gray-200 shrink-0 z-20 flex items-center gap-2">
        {activeContact ? (
          /* Active Chat Header */
          <div className="flex-1 flex items-center justify-between">
            <div className="flex items-center space-x-2.5 min-w-0">
              <button
                type="button"
                onClick={() => setActiveContact(null)}
                className="p-1.5 -ml-1 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition cursor-pointer"
                title="Back to chats list"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              {/* Clicking header shows user avatar with username and 3-dot block menu */}
              <button
                type="button"
                onClick={() => setShowHeaderDetailsModal(true)}
                className="flex items-center space-x-2.5 text-left group cursor-pointer truncate"
              >
                <div className="relative shrink-0">
                  <img
                    src={activeContact.avatar}
                    alt={activeContact.name}
                    className="w-9 h-9 rounded-full object-cover border border-emerald-100 group-hover:ring-2 ring-emerald-400 transition"
                    referrerPolicy="no-referrer"
                  />
                  {activeContact.online && (
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />
                  )}
                </div>

                <div className="min-w-0 truncate">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-xs font-bold text-gray-900 truncate">
                      {activeContact.name}
                    </span>
                    {activeContact.isBlocked && (
                      <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[9px] font-bold rounded">
                        Blocked
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-mono font-medium text-emerald-700 block truncate">
                    {activeContact.username}
                  </span>
                </div>
              </button>
            </div>

            {/* Three-dot button in header: click will ask to block / unblock user */}
            <button
              type="button"
              onClick={() => setShowBlockConfirmModal(true)}
              className="p-2 text-gray-500 hover:text-gray-800 rounded-xl hover:bg-gray-100 transition cursor-pointer"
              title="More options / Block user"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
          </div>
        ) : (
          /* Main Search Bar Header: Free of texts, strictly clean search bar */
          <div className="flex-1 flex items-center gap-2">
            {isViewingNearby && (
              <button
                type="button"
                onClick={() => {
                  setIsViewingNearby(false);
                  setSearchQuery('');
                }}
                className="p-2 text-gray-600 hover:text-gray-900 rounded-xl hover:bg-gray-100 transition cursor-pointer"
                title="Back to conversations"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}

            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  isViewingNearby 
                    ? 'Search nearby people by name or @username...' 
                    : 'Search chats or @username...'
                }
                className="w-full pl-9 pr-8 py-2 rounded-xl border border-gray-200 bg-gray-50/80 text-xs focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {isViewingNearby && (
              <span className="text-[11px] font-bold text-emerald-800 shrink-0 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                Near {currentUser.state}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 2. BODY CONTENT: ACTIVE CHAT CONVERSATION OR LIST VIEW */}
      {activeContact ? (
        /* Inside Active Chat Conversation */
        <div className="flex-1 flex flex-col bg-white overflow-hidden">
          
          {/* Messages Stream */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-gray-50/40">
            
            {/* Encrypted Notice Banner */}
            <div className="text-center py-2">
              <span className="inline-block px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-[10px] text-emerald-800 font-medium shadow-2xs">
                🔒 End-to-end encrypted on I-pay-online • Hold message to delete
              </span>
            </div>

            {messages.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <img
                  src={activeContact.avatar}
                  alt={activeContact.name}
                  className="w-16 h-16 rounded-full mx-auto object-cover border-2 border-emerald-200 shadow-sm"
                  referrerPolicy="no-referrer"
                />
                <h4 className="text-xs font-bold text-gray-800">{activeContact.name}</h4>
                <p className="text-[11px] font-mono text-emerald-700">{activeContact.username}</p>
                <p className="text-[11px] text-gray-400 max-w-xs mx-auto">
                  Start your conversation below. Hold any message to delete.
                </p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.isMe ? 'justify-end' : 'justify-start'}`}
                >
                  {/* Hold on message to delete */}
                  <div
                    onMouseDown={() => handleMessagePressStart(msg)}
                    onMouseUp={handleMessagePressEnd}
                    onTouchStart={() => handleMessagePressStart(msg)}
                    onTouchEnd={handleMessagePressEnd}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setSelectedMessageForDelete(msg);
                    }}
                    className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-xs shadow-2xs cursor-pointer select-none transition active:scale-[0.98] ${
                      msg.isMe
                        ? 'bg-emerald-600 text-white rounded-br-xs'
                        : 'bg-white text-gray-800 border border-gray-200 rounded-bl-xs'
                    }`}
                    title="Press and hold to delete message"
                  >
                    <p className="leading-relaxed break-words whitespace-pre-wrap">{msg.text}</p>
                    <div className={`text-[9px] text-right mt-1 flex items-center justify-end space-x-1 ${msg.isMe ? 'text-emerald-200' : 'text-gray-400'}`}>
                      <span>{msg.timestamp}</span>
                      {msg.isMe && <CheckCheck className="w-3 h-3" />}
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Keyboard & Input Bar */}
          <div className="p-3 border-t border-gray-200 bg-white">
            {activeContact.isBlocked ? (
              <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-center space-y-1">
                <p className="text-xs font-semibold text-red-700">
                  You have blocked @{activeContact.username.replace('@', '')}.
                </p>
                <button
                  type="button"
                  onClick={handleToggleBlock}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition cursor-pointer"
                >
                  Unblock User to Send Messages
                </button>
              </div>
            ) : (
              <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder={`Message ${activeContact.name} (${activeContact.username})...`}
                  className="flex-1 px-4 py-2.5 text-xs rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500 transition"
                />
                <button
                  type="submit"
                  disabled={!inputMessage.trim()}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl disabled:bg-gray-200 disabled:text-gray-400 transition cursor-pointer flex items-center space-x-1.5 shadow-sm"
                >
                  <span>Send</span>
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            )}
          </div>

        </div>
      ) : isViewingNearby ? (
        /* 3. PEOPLE REGISTERED NEAR YOUR LOCATION (OPENED VIA PLUS BUTTON) */
        <div className="flex-1 flex flex-col bg-white overflow-hidden">
          
          <div className="px-4 py-3 bg-emerald-50/60 border-b border-emerald-100 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <MapPin className="w-4 h-4 text-emerald-700" />
              <span className="text-xs font-bold text-emerald-950">
                Registered Near Your Location ({currentUser.state} State, {currentUser.lga} LGA)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsViewingNearby(false)}
              className="p-1 text-gray-500 hover:text-gray-800 rounded-md hover:bg-emerald-100 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {filteredNearby.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <p className="text-xs text-gray-500">
                  {searchQuery 
                    ? `No registered members matching "${searchQuery}".`
                    : 'No other members registered in this area yet. Only real accounts registered in the database will appear here.'}
                </p>
              </div>
            ) : (
              filteredNearby.map((person) => (
                <div
                  key={person.id}
                  onClick={() => handleStartChatWith(person)}
                  className="p-3.5 flex items-center justify-between hover:bg-emerald-50/50 transition cursor-pointer group"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="relative shrink-0">
                      <img
                        src={person.avatar}
                        alt={person.name}
                        className="w-11 h-11 rounded-full object-cover border border-gray-200 group-hover:ring-2 ring-emerald-400 transition"
                        referrerPolicy="no-referrer"
                      />
                      {person.online && (
                        <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <p className="text-xs font-bold text-gray-900 truncate group-hover:text-emerald-700">
                          {person.name}
                        </p>
                        <span className="text-[11px] font-mono text-emerald-700 font-semibold truncate">
                          {person.username}
                        </span>
                      </div>
                      <div className="flex items-center space-x-1.5 text-[11px] text-gray-500 mt-0.5">
                        <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                        <span className="truncate">
                          {person.lga ? `${person.lga}, ` : ''}{person.state || 'Nigeria'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartChatWith(person);
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shrink-0 shadow-2xs"
                  >
                    Chat
                  </button>
                </div>
              ))
            )}
          </div>

        </div>
      ) : (
        /* 4. CONVERSATIONS LIST (PEOPLE YOU CHAT WITH) */
        <div className="flex-1 flex flex-col bg-white overflow-hidden">
          
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {filteredConversations.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                  <UserCheck className="w-6 h-6" />
                </div>
                <h3 className="text-xs font-bold text-gray-800">No active chats yet</h3>
                <p className="text-[11px] text-gray-400 max-w-xs mx-auto">
                  Click the green <strong>Plus (+)</strong> button on the bottom left to see and chat with people registered near your location in {currentUser.state} State!
                </p>
                <button
                  type="button"
                  onClick={() => setIsViewingNearby(true)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition cursor-pointer"
                >
                  Find Nearby People
                </button>
              </div>
            ) : (
              filteredConversations.map((contact) => (
                <div
                  key={contact.id}
                  onClick={() => {
                    if (!isLongPressTriggered.current) {
                      setActiveContact(contact);
                    }
                  }}
                  onMouseDown={() => handleContactPressStart(contact)}
                  onMouseUp={handleContactPressEnd}
                  onTouchStart={() => handleContactPressStart(contact)}
                  onTouchEnd={handleContactPressEnd}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContactToDeleteHistory(contact);
                  }}
                  className="p-3.5 flex items-center justify-between hover:bg-gray-50 transition cursor-pointer select-none group"
                  title="Click to chat • Hold to delete chat history"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="relative shrink-0">
                      <img
                        src={contact.avatar}
                        alt={contact.name}
                        className="w-11 h-11 rounded-full object-cover border border-gray-200"
                        referrerPolicy="no-referrer"
                      />
                      {contact.online && (
                        <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-2">
                        <p className="text-xs font-bold text-gray-900 truncate">
                          {contact.name}
                        </p>
                        <span className="text-[11px] font-mono text-emerald-700 font-semibold truncate">
                          {contact.username}
                        </span>
                        {contact.isBlocked && (
                          <span className="px-1.5 py-0.2 bg-red-100 text-red-700 text-[9px] font-bold rounded">
                            Blocked
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 truncate mt-0.5">
                        {contact.lastMessage || 'No messages yet'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0 ml-2 space-y-1 flex flex-col items-end">
                    <span className="text-[10px] text-gray-400 block">{contact.time}</span>
                    {contact.unreadCount && contact.unreadCount > 0 ? (
                      <span className="inline-flex items-center justify-center px-1.5 py-0.5 min-w-4.5 rounded-full bg-emerald-600 text-white text-[10px] font-black shadow-xs ring-2 ring-emerald-100 animate-pulse">
                        {contact.unreadCount}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setContactToDeleteHistory(contact);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-600 transition cursor-pointer"
                        title="Delete chat history"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

        </div>
      )}

      {/* 5. PLUS BUTTON IN THE BOTTOM BY LEFT (User requirement) */}
      {!activeContact && (
        <button
          type="button"
          onClick={() => {
            setIsViewingNearby(!isViewingNearby);
            setSearchQuery('');
          }}
          className="fixed bottom-20 left-4 z-30 w-12 h-12 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg flex items-center justify-center transition transform active:scale-95 cursor-pointer ring-4 ring-white"
          title="List people registered near your location"
        >
          {isViewingNearby ? (
            <X className="w-6 h-6" />
          ) : (
            <Plus className="w-6 h-6" />
          )}
        </button>
      )}

      {/* 6. MODAL: USER DETAILS & 3-DOT BLOCK MENU */}
      {showHeaderDetailsModal && activeContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl border border-emerald-100 space-y-4">
            
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                User Profile & Settings
              </span>
              <button
                type="button"
                onClick={() => setShowHeaderDetailsModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-center space-y-2">
              <img
                src={activeContact.avatar}
                alt={activeContact.name}
                className="w-20 h-20 rounded-full mx-auto object-cover border-4 border-emerald-100 shadow-md"
                referrerPolicy="no-referrer"
              />
              <h3 className="text-sm font-bold text-gray-900">{activeContact.name}</h3>
              <p className="text-xs font-mono font-bold text-emerald-700">{activeContact.username}</p>
              
              <div className="pt-2 flex items-center justify-center space-x-1.5 text-xs text-gray-600">
                <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                <span>{activeContact.lga ? `${activeContact.lga}, ` : ''}{activeContact.state || 'Nigeria'}</span>
              </div>
            </div>

            <div className="pt-3 border-t border-gray-100 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setShowHeaderDetailsModal(false);
                  setShowBlockConfirmModal(true);
                }}
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 cursor-pointer ${
                  activeContact.isBlocked
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100'
                    : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                }`}
              >
                <ShieldAlert className="w-4 h-4" />
                <span>
                  {activeContact.isBlocked ? `Unblock ${activeContact.username}` : `Block ${activeContact.username}`}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowHeaderDetailsModal(false);
                  setContactToDeleteHistory(activeContact);
                }}
                className="w-full py-2 px-4 text-xs font-semibold text-gray-600 hover:text-red-700 transition flex items-center justify-center space-x-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Chat History</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 7. MODAL: BLOCK / UNBLOCK USER CONFIRMATION */}
      {showBlockConfirmModal && activeContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl border border-gray-100 space-y-4">
            
            <div className="flex items-center space-x-3 text-red-600">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  {activeContact.isBlocked ? 'Unblock User?' : 'Block User?'}
                </h3>
                <p className="text-xs text-gray-500 font-mono">
                  {activeContact.username}
                </p>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              {activeContact.isBlocked 
                ? `Do you want to unblock ${activeContact.username}? You will be able to send and receive messages with them again.`
                : `Are you sure you want to block ${activeContact.username}? If blocked, they will not be able to message you and you can unblock them anytime.`}
            </p>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBlockConfirmModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 transition cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleToggleBlock}
                className={`px-5 py-2 rounded-xl text-xs font-bold text-white transition shadow-sm cursor-pointer ${
                  activeContact.isBlocked
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {activeContact.isBlocked ? 'Confirm Unblock' : 'Confirm Block'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 8. MODAL: HOLD MESSAGE TO DELETE (DELETE FOR BOTH VS DELETE FOR SELF) */}
      {selectedMessageForDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl border border-gray-100 space-y-4">
            
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900">Delete Message?</h3>
              <button
                type="button"
                onClick={() => setSelectedMessageForDelete(null)}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-gray-50 rounded-xl text-xs text-gray-700 italic border border-gray-200 line-clamp-2">
              "{selectedMessageForDelete.text}"
            </div>

            <p className="text-xs text-gray-500">
              {selectedMessageForDelete.isMe 
                ? 'Since you sent this message, you can delete it for both of you or delete it for yourself only.'
                : 'Since this message was sent to you, you can delete it for yourself.'}
            </p>

            <div className="space-y-2 pt-2">
              {selectedMessageForDelete.isMe && (
                <button
                  type="button"
                  onClick={handleDeleteForBoth}
                  className="w-full py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition shadow-sm cursor-pointer text-center"
                >
                  Delete for Everyone (Both)
                </button>
              )}

              <button
                type="button"
                onClick={handleDeleteForMe}
                className="w-full py-2.5 px-4 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold transition cursor-pointer text-center"
              >
                Delete for Yourself Only
              </button>

              <button
                type="button"
                onClick={() => setSelectedMessageForDelete(null)}
                className="w-full py-2 text-xs font-semibold text-gray-500 hover:text-gray-800"
              >
                Cancel
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 9. MODAL: HOLD CHAT IN LIST TO DELETE CHAT HISTORY */}
      {contactToDeleteHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl border border-gray-100 space-y-4">
            
            <div className="flex items-center space-x-3 text-red-600">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Delete Chat History?</h3>
                <p className="text-xs text-gray-500 font-mono">{contactToDeleteHistory.username}</p>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              Are you sure you want to delete all chat history with <strong>{contactToDeleteHistory.name}</strong> ({contactToDeleteHistory.username})? All messages in this conversation will be permanently removed.
            </p>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setContactToDeleteHistory(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 transition cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmDeleteHistory}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition shadow-sm cursor-pointer"
              >
                Delete History
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
