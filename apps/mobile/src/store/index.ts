import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type {
  User,
  Room,
  Render,
  CartItem,
  Product,
  ChatMessage,
  RoomDimensions,
  StyleName,
  StyleBlend,
  FurniturePiece,
  SwipeCard,
} from '@cova/shared';

// ── State shape ──────────────────────────────────

interface AppState {
  // auth
  user: User | null;
  session: Session | null;
  isLoading: boolean;

  // rooms
  rooms: Room[];
  currentRoom: Room | null;
  currentRoomDimensions: RoomDimensions | null;
  activeStyle: StyleName;
  placedFurniture: FurniturePiece[];

  // render
  currentRender: Render | null;
  renderStatus: 'idle' | 'processing' | 'completed' | 'failed';
  renderError: string | null;
  renderProgressStage: string;
  renderProgress: number;
  capturedImageUri: string | null;

  // quiz
  cards: SwipeCard[];
  styleBlend: StyleBlend;
  quizComplete: boolean;

  // cart & products
  cartItems: CartItem[];
  matchedProducts: Product[];

  // chat
  messages: ChatMessage[];
  chatLoading: boolean;

  // ui
  isHUDVisible: boolean;
  tokenBalance: number;

  // preferences
  colorScheme: 'dark' | 'light';
  savedProducts: Product[];
}

// ── Actions ──────────────────────────────────────

interface AppActions {
  // auth
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  signOut: () => void;

  // rooms
  fetchRooms: () => Promise<void>;
  createRoom: (params: { name: string; room_type: string; style_blend: StyleBlend }) => Promise<Room>;
  setRooms: (rooms: Room[]) => void;
  setCurrentRoom: (room: Room | null) => void;
  addRoom: (room: Room) => void;
  updateRoom: (id: string, updates: Partial<Room>) => void;
  setCurrentRoomDimensions: (dims: RoomDimensions | null) => void;
  setActiveStyle: (style: StyleName) => void;
  setPlacedFurniture: (furniture: FurniturePiece[]) => void;
  addFurniture: (piece: FurniturePiece) => void;
  removeFurniture: (id: string) => void;
  updateFurniturePosition: (id: string, x: number, z: number) => void;
  updateFurnitureRotation: (id: string, rotationY: number) => void;

  // render
  setCurrentRender: (render: Render | null) => void;
  setRenderStatus: (status: AppState['renderStatus']) => void;
  setRenderError: (error: string | null) => void;
  setRenderProgressStage: (stage: string) => void;
  setRenderProgress: (progress: number) => void;
  setCapturedImageUri: (uri: string | null) => void;

  // quiz
  setCards: (cards: SwipeCard[]) => void;
  swipeRight: (cardId: string) => void;
  swipeLeft: (cardId: string) => void;
  swipeNeutral: (cardId: string) => void;
  completeQuiz: () => void;
  resetQuiz: () => void;

  // cart & products
  addToCart: (item: CartItem) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
  setMatchedProducts: (products: Product[]) => void;

  // chat
  addMessage: (message: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
  setChatLoading: (loading: boolean) => void;

  // ui
  showHUD: () => void;
  hideHUD: () => void;
  setTokenBalance: (balance: number) => void;

  // preferences
  setColorScheme: (scheme: 'dark' | 'light') => void;
  addToSaved: (product: Product) => void;
  removeFromSaved: (productId: string) => void;
}

// ── Store ────────────────────────────────────────

export const useAppStore = create<AppState & AppActions>()(
  persist(
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
    currentRoomDimensions: null,
    activeStyle: 'japandi' as StyleName,
    placedFurniture: [],

    fetchRooms: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('rooms')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
      if (data) {
        set((state) => { state.rooms = data as Room[]; });
      }
    },
    createRoom: async ({ name, room_type, style_blend }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('rooms')
        .insert({ user_id: user.id, name, room_type, style_blend })
        .select('*')
        .single();
      if (error || !data) throw new Error(error?.message ?? 'Failed to create room');
      const room = data as Room;
      set((state) => {
        state.rooms.unshift(room);
        state.currentRoom = room;
      });
      return room;
    },
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
    setCurrentRoomDimensions: (dims) =>
      set((state) => {
        state.currentRoomDimensions = dims;
      }),
    setActiveStyle: (style) =>
      set((state) => {
        state.activeStyle = style;
      }),
    setPlacedFurniture: (furniture) =>
      set((state) => {
        state.placedFurniture = furniture;
      }),
    addFurniture: (piece) =>
      set((state) => {
        state.placedFurniture.push(piece);
      }),
    removeFurniture: (id) =>
      set((state) => {
        state.placedFurniture = state.placedFurniture.filter((p) => p.id !== id);
      }),
    updateFurniturePosition: (id, x, z) =>
      set((state) => {
        const piece = state.placedFurniture.find((p) => p.id === id);
        if (piece) {
          piece.position.x = x;
          piece.position.y = z;
        }
      }),
    updateFurnitureRotation: (id, rotationY) =>
      set((state) => {
        const piece = state.placedFurniture.find((p) => p.id === id);
        if (piece) {
          piece.rotation_y = rotationY;
        }
      }),

    // ── render defaults ──
    currentRender: null,
    renderStatus: 'idle',
    renderError: null,
    renderProgressStage: '',
    renderProgress: 0,
    capturedImageUri: null,

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
    setRenderProgressStage: (stage) =>
      set((state) => {
        state.renderProgressStage = stage;
      }),
    setRenderProgress: (progress) =>
      set((state) => {
        state.renderProgress = progress;
      }),
    setCapturedImageUri: (uri) =>
      set((state) => {
        state.capturedImageUri = uri;
      }),

    // ── quiz defaults ──
    cards: [],
    styleBlend: { coastal: 0.2, japandi: 0.2, bohemian: 0.2, mid_century: 0.2, minimalist: 0.2 } as StyleBlend,
    quizComplete: false,

    setCards: (cards) =>
      set((state) => {
        state.cards = cards;
      }),
    swipeRight: (cardId) =>
      set((state) => {
        const card = state.cards.find((c) => c.id === cardId);
        if (!card) return;
        const weights = card.style_weights as Partial<StyleBlend>;
        (Object.keys(weights) as StyleName[]).forEach((style) => {
          state.styleBlend[style] = (state.styleBlend[style] ?? 0) + (weights[style] ?? 0) * 1.5;
        });
        // Normalize
        const total = (Object.values(state.styleBlend) as number[]).reduce((a, b) => a + b, 0);
        if (total > 0) {
          (Object.keys(state.styleBlend) as StyleName[]).forEach((k) => {
            state.styleBlend[k] = (state.styleBlend[k] ?? 0) / total;
          });
        }
      }),
    swipeLeft: (cardId) =>
      set((state) => {
        const card = state.cards.find((c) => c.id === cardId);
        if (!card) return;
        const weights = card.style_weights as Partial<StyleBlend>;
        (Object.keys(weights) as StyleName[]).forEach((style) => {
          state.styleBlend[style] = Math.max(0, (state.styleBlend[style] ?? 0) - (weights[style] ?? 0) * 0.5);
        });
        const total = (Object.values(state.styleBlend) as number[]).reduce((a, b) => a + b, 0);
        if (total > 0) {
          (Object.keys(state.styleBlend) as StyleName[]).forEach((k) => {
            state.styleBlend[k] = (state.styleBlend[k] ?? 0) / total;
          });
        }
      }),
    swipeNeutral: (_cardId) => {
      // neutral — no blend change
    },
    completeQuiz: () =>
      set((state) => {
        state.quizComplete = true;
        // Set activeStyle to dominant style
        const dominant = (Object.entries(state.styleBlend) as [StyleName, number][])
          .sort(([, a], [, b]) => b - a)[0]?.[0];
        if (dominant) state.activeStyle = dominant;
      }),
    resetQuiz: () =>
      set((state) => {
        state.cards = [];
        state.styleBlend = { coastal: 0.2, japandi: 0.2, bohemian: 0.2, mid_century: 0.2, minimalist: 0.2 };
        state.quizComplete = false;
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

    // ── ui defaults ──
    isHUDVisible: true,
    tokenBalance: 999,

    showHUD: () =>
      set((state) => {
        state.isHUDVisible = true;
      }),
    hideHUD: () =>
      set((state) => {
        state.isHUDVisible = false;
      }),
    setTokenBalance: (balance) =>
      set((state) => {
        state.tokenBalance = balance;
      }),

    // ── preferences defaults ──
    colorScheme: 'dark',
    savedProducts: [],

    setColorScheme: (scheme) =>
      set((state) => {
        state.colorScheme = scheme;
      }),
    addToSaved: (product) =>
      set((state) => {
        if (!state.savedProducts.find((p) => p.id === product.id)) {
          state.savedProducts.push(product);
        }
      }),
    removeFromSaved: (productId) =>
      set((state) => {
        state.savedProducts = state.savedProducts.filter((p) => p.id !== productId);
      }),
  })),
  {
    name: 'cova-store',
    storage: createJSONStorage(() => AsyncStorage),
    // ⚠️ ASSERTION: renderStatus, currentRender, renderProgress must NOT be persisted.
    // If renderStatus='processing' is persisted and app is killed mid-render,
    // the loading screen becomes permanently stuck on relaunch.
    partialize: (state) => ({
      user: state.user,
      session: state.session,
      currentRoom: state.currentRoom,
      currentRoomDimensions: state.currentRoomDimensions,
      activeStyle: state.activeStyle,
      styleBlend: state.styleBlend,
      quizComplete: state.quizComplete,
      capturedImageUri: state.capturedImageUri,
      cartItems: state.cartItems,
      savedProducts: state.savedProducts,
      colorScheme: state.colorScheme,
    }),
  },
  ),
);
