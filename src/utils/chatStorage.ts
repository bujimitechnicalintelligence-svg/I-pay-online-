import { ChatContact, ChatMessage, UserAccount } from '../types';
import { getRegisteredAccounts } from './authStorage';

const STORAGE_CHATS_KEY = 'ipay_chat_contacts_v4';
const STORAGE_MSGS_KEY = 'ipay_chat_messages_v4';
const STORAGE_BLOCKED_KEY = 'ipay_blocked_users_v4';

// Blocked users management
export function getBlockedUserIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_BLOCKED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function toggleBlockUser(contactId: string): boolean {
  const set = getBlockedUserIds();
  let blocked = false;
  if (set.has(contactId)) {
    set.delete(contactId);
    blocked = false;
  } else {
    set.add(contactId);
    blocked = true;
  }
  try {
    localStorage.setItem(STORAGE_BLOCKED_KEY, JSON.stringify(Array.from(set)));
  } catch (err) {
    console.warn('Failed to toggle block status', err);
  }
  return blocked;
}

export function isUserBlocked(contactId: string): boolean {
  return getBlockedUserIds().has(contactId);
}

// Get user's active conversations list (people you chat with)
export function getChatConversations(): ChatContact[] {
  try {
    const raw = localStorage.getItem(STORAGE_CHATS_KEY);
    if (!raw) return [];
    const blockedSet = getBlockedUserIds();
    const contacts: ChatContact[] = JSON.parse(raw);
    return Array.isArray(contacts) ? contacts.filter(c => !blockedSet.has(c.id)) : [];
  } catch {
    return [];
  }
}

export function saveChatConversations(contacts: ChatContact[]): void {
  try {
    localStorage.setItem(STORAGE_CHATS_KEY, JSON.stringify(contacts));
  } catch (err) {
    console.warn('Failed to save chat contacts', err);
  }
}

// Add or update contact in conversation list
export function upsertChatConversation(contact: ChatContact): void {
  try {
    const current = getChatConversations();
    const existingIdx = current.findIndex(c => c.id === contact.id);
    let updated: ChatContact[];
    if (existingIdx >= 0) {
      updated = [...current];
      updated[existingIdx] = { ...updated[existingIdx], ...contact };
    } else {
      updated = [contact, ...current];
    }
    localStorage.setItem(STORAGE_CHATS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to upsert chat conversation', err);
  }
}

export const saveChatContact = upsertChatConversation;

export function markContactAsRead(contactId: string): void {
  try {
    const contacts = getChatConversations();
    const contactIndex = contacts.findIndex(c => c.id === contactId);
    if (contactIndex >= 0) {
      contacts[contactIndex].unreadCount = 0;
      localStorage.setItem(STORAGE_CHATS_KEY, JSON.stringify(contacts));
    }
  } catch (err) {
    console.warn('Failed to mark contact as read', err);
  }
}

// Delete chat history with a contact
export function deleteChatHistory(contactId: string): void {
  try {
    // 1. Delete messages
    const map = getAllMessagesMap();
    delete map[contactId];
    localStorage.setItem(STORAGE_MSGS_KEY, JSON.stringify(map));

    // 2. Remove contact from active conversations list
    const contacts = getChatConversations();
    const filtered = contacts.filter(c => c.id !== contactId);
    localStorage.setItem(STORAGE_CHATS_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.warn('Failed to delete chat history', err);
  }
}

// Messages Map
function getAllMessagesMap(): Record<string, ChatMessage[]> {
  try {
    const raw = localStorage.getItem(STORAGE_MSGS_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function getMessagesForContact(contactId: string): ChatMessage[] {
  const map = getAllMessagesMap();
  const list = map[contactId] || [];
  // Exclude messages deleted for me
  return list.filter(m => !m.deletedForMe);
}

export function addMessageToChat(contactId: string, message: ChatMessage): void {
  try {
    const map = getAllMessagesMap();
    const current = map[contactId] || [];
    // Deduplicate by message id or matching senderId + text within 5 seconds
    const existingIndex = current.findIndex(m => m.id === message.id);
    if (existingIndex >= 0) {
      current[existingIndex] = message;
      map[contactId] = current;
    } else {
      map[contactId] = [...current, message];
    }
    localStorage.setItem(STORAGE_MSGS_KEY, JSON.stringify(map));

    // Update last message in contacts list
    const contacts = getChatConversations();
    const contactIndex = contacts.findIndex(c => c.id === contactId);
    if (contactIndex >= 0) {
      contacts[contactIndex].lastMessage = message.text;
      contacts[contactIndex].time = message.timestamp;
      localStorage.setItem(STORAGE_CHATS_KEY, JSON.stringify(contacts));
    }
  } catch (err) {
    console.warn('Failed to add message', err);
  }
}

// Delete for everyone (both)
export function deleteMessageForBoth(contactId: string, messageId: string): void {
  try {
    const map = getAllMessagesMap();
    const current = map[contactId] || [];
    const updated = current.filter(m => m.id !== messageId);
    map[contactId] = updated;
    localStorage.setItem(STORAGE_MSGS_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn('Failed to delete message for both', err);
  }
}

// Delete for me (hide on current device only)
export function deleteMessageForMe(contactId: string, messageId: string): void {
  try {
    const map = getAllMessagesMap();
    const current = map[contactId] || [];
    const updated = current.map(m => {
      if (m.id === messageId) {
        return { ...m, deletedForMe: true };
      }
      return m;
    });
    map[contactId] = updated;
    localStorage.setItem(STORAGE_MSGS_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn('Failed to delete message for me', err);
  }
}

// Clear all messages in conversation
export function clearAllMessagesInChat(contactId: string): void {
  try {
    const map = getAllMessagesMap();
    map[contactId] = [];
    localStorage.setItem(STORAGE_MSGS_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn('Failed to clear messages in chat', err);
  }
}

// Get registered community members - strictly real accounts
export function getNearbyMembersList(currentUser: UserAccount): ChatContact[] {
  const registeredAccounts = getRegisteredAccounts().filter(acc => acc.id !== currentUser.id);
  const registeredContacts: ChatContact[] = registeredAccounts.map(acc => ({
    id: acc.id,
    username: acc.username || `@${acc.displayName.toLowerCase().replace(/\s+/g, '_')}`,
    name: acc.displayName,
    role: 'Registered Member',
    lastMessage: `From ${acc.lga || 'Nigeria'}, ${acc.state || 'Lagos'} State`,
    time: 'Active',
    unreadCount: 0,
    avatar: acc.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(acc.displayName)}`,
    online: true,
    state: acc.state,
    lga: acc.lga
  }));

  // Prioritize users in the same State and LGA
  return registeredContacts.sort((a, b) => {
    const aSameState = a.state?.toLowerCase() === currentUser.state.toLowerCase();
    const bSameState = b.state?.toLowerCase() === currentUser.state.toLowerCase();
    const aSameLga = a.lga?.toLowerCase() === currentUser.lga.toLowerCase();
    const bSameLga = b.lga?.toLowerCase() === currentUser.lga.toLowerCase();

    if (aSameLga && !bSameLga) return -1;
    if (!aSameLga && bSameLga) return 1;
    if (aSameState && !bSameState) return -1;
    if (!aSameState && bSameState) return 1;
    return 0;
  });
}

// Alias for backwards compatibility across views
export const getPeopleRegisteredNearLocation = getNearbyMembersList;
