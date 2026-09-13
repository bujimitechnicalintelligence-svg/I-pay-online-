import { ShortVideo, AuthorBook, ProductItem, ChatContact, ChatMessage } from '../types';

// Clean database mode: No fake data or fake seeds.
// All items are populated strictly from real user activity and Firestore database.

export const MOCK_VIDEOS: ShortVideo[] = [];

export const MOCK_BOOKS: AuthorBook[] = [];

export const MOCK_PRODUCTS: ProductItem[] = [];

export const MOCK_CONTACTS: ChatContact[] = [];

export const INITIAL_MESSAGES: Record<string, ChatMessage[]> = {};
