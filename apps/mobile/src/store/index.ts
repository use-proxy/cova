import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  User,
  Room,
  Render,
  CartItem,
  Product,
  ChatMessage,
} from '@cova/shared';

// ── State shape ──────────────────────────────────

interface AppState {
  // auth
  user: User | null;
  session: unknown;
  isLoading: boolean;

  // rooms
  rooms: Room[];
  currentRoom: Room | null;

  // render
  currentRender: Render | null;
  renderStatus: 'idle' | 'processing' | 'completed' | 'failed';
  renderError: string | null;

  // cart & products
  cartItems: CartItem[];
  matchedProducts: Product[];

  // chat
  messages: ChatMessage[];
  chatLoading: boolean;
}

// ── Actions ──────────────────────────────────────

interface AppActions {
  // auth
  setUser: (user: User | null) => void;
  setSession: (session: unknown) => void;
  signOut: () => void;

  // rooms
  setRooms: (rooms: Room[]) => void;
  setCurrentRoom: (room: Room | null) => void;
  addRoom: (room: Room) => void;
  updateRoom: (id: string, updates: Partial<Room>) => void;

  // render
  setCurrentRender: (render: Render | null) => void;
  setRenderStatus: (status: AppState['renderStatus']) => void;
  setRenderError: (error: string | null) => void;

  // cart & products
  addToCart: (item: CartItem) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
  setMatchedProducts: (products: Product[]) => void;

  // chat
  addMessage: (message: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
  setChatLoading: (loading: boolean) => void;
}

// ── Store ────────────────────────────────────────

export const useAppStore = create<AppState & AppActions>()(
  immer((set) => ({
    // ── auth defaults ──
    user: null,
    session: null,
    isLoading: true,

    setUser: (user) =>
      set((state) => {
        state.user = user;
      }),
    setSession: (session) =>
      set((state) => {
        state.session = session;
        state.isLoading = false;
      }),
    signOut: () =>
      set((state) => {
        state.user = null;
        state.session = null;
      }),

    // ── rooms defaults ──
    rooms: [],
    currentRoom: null,

    setRooms: (rooms) =>
      set((state) => {
        state.rooms = rooms;
      }),
    setCurrentRoom: (room) =>
      set((state) => {
        state.currentRoom = room;
      }),
    addRoom: (room) =>
      set((state) => {
        state.rooms.push(room);
      }),
    updateRoom: (id, updates) =>
      set((state) => {
        const idx = state.rooms.findIndex((r) => r.id === id);
        if (idx !== -1) {
          Object.assign(state.rooms[idx], updates);
        }
        if (state.currentRoom?.id === id) {
          Object.assign(state.currentRoom, updates);
        }
      }),

    // ── render defaults ──
    currentRender: null,
    renderStatus: 'idle',
    renderError: null,

    setCurrentRender: (render) =>
      set((state) => {
        state.currentRender = render;
      }),
    setRenderStatus: (status) =>
      set((state) => {
        state.renderStatus = status;
      }),
    setRenderError: (error) =>
      set((state) => {
        state.renderError = error;
      }),

    // ── cart & products defaults ──
    cartItems: [],
    matchedProducts: [],

    addToCart: (item) =>
      set((state) => {
        const existing = state.cartItems.findIndex((c) => c.id === item.id);
        if (existing !== -1) {
          state.cartItems[existing].quantity += item.quantity;
        } else {
          state.cartItems.push(item);
        }
      }),
    removeFromCart: (id) =>
      set((state) => {
        state.cartItems = state.cartItems.filter((c) => c.id !== id);
      }),
    clearCart: () =>
      set((state) => {
        state.cartItems = [];
      }),
    setMatchedProducts: (products) =>
      set((state) => {
        state.matchedProducts = products;
      }),

    // ── chat defaults ──
    messages: [],
    chatLoading: false,

    addMessage: (message) =>
      set((state) => {
        state.messages.push(message);
      }),
    setMessages: (messages) =>
      set((state) => {
        state.messages = messages;
      }),
    setChatLoading: (loading) =>
      set((state) => {
        state.chatLoading = loading;
      }),
  })),
);
