import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Image,
  ScrollView,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { supabase, callEdgeFunction } from '../lib/supabase';
import { useAppStore } from '../store';
import type { FurniturePiece, Product, StyleBlend } from '@cova/shared';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ActionTrigger {
  type: 'REGENERATE' | 'ADJUST_BLEND' | 'OPEN_SHOP' | 'PIN_PRODUCT';
  data: Record<string, unknown> | null;
}

interface SuggestedProduct {
  id: string;
  name: string;
  price: number;
  image_url: string;
  retailer: string;
  style_tags: string[];
  affiliate_url: string;
  category: string;
}

interface LocalMessage {
  id: string;
  room_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  action_trigger?: ActionTrigger | null;
  suggested_product?: SuggestedProduct | null;
  isError?: boolean;
  confirmDismissed?: boolean;
}

interface ChatResponse {
  message: string;
  action_trigger?: ActionTrigger | null;
  suggested_product?: SuggestedProduct | null;
}

export interface ChatPanelProps {
  testID?: string;
  roomId: string;
  renderImageUrl?: string;
  tapX?: number;
  tapY?: number;
  onClose: () => void;
  onMessageSent?: () => void;
  onOpenShop?: (category?: string) => void;
  onStartRender?: () => void;
  onAdjustBlend?: (newBlend: StyleBlend) => void;
  styleBlend?: StyleBlend | null;
  placedFurniture?: FurniturePiece[];
  pinnedRoomProducts?: Product[];
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const CHAR_LIMIT = 500;
const CHAR_WARN = 400;
const TIMEOUT_MS = 30000;
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const PANEL_HEIGHT_DEFAULT = SCREEN_HEIGHT * 0.62;
const BG = '#0A1628';
const GOLD = '#B8860B';

const CONVERSATION_STARTERS = [
  'What furniture should I add?',
  'Make it feel more cozy',
  'What is my color palette?',
  'Show me products under $500',
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatPrice(p: number): string {
  return `$${p.toLocaleString()}`;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function LoadingDots() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]),
      );
    anim(dot1, 0).start();
    anim(dot2, 200).start();
    anim(dot3, 400).start();
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.dotsRow}>
      {[dot1, dot2, dot3].map((dot, i) => (
        <Animated.View key={i} style={[styles.dot, { opacity: dot }]} />
      ))}
    </View>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function ChatPanel({
  testID,
  roomId,
  renderImageUrl,
  tapX,
  tapY,
  onClose,
  onMessageSent,
  onOpenShop,
  onStartRender,
  onAdjustBlend,
  styleBlend,
  placedFurniture,
  pinnedRoomProducts,
}: ChatPanelProps) {
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const flatListRef = useRef<FlatList<LocalMessage>>(null);
  // ⚠️ Panel height — useRef ONLY. Animated.Value for drag-to-fullscreen gesture.
  const panelHeightAnim = useRef(new Animated.Value(PANEL_HEIGHT_DEFAULT)).current;
  const panelHeightRef = useRef(PANEL_HEIGHT_DEFAULT);
  const dragStartHeightRef = useRef(PANEL_HEIGHT_DEFAULT);

  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);

  const lastUserMsgRef = useRef<string>('');
  const { pinProduct } = useAppStore();

  const starters = CONVERSATION_STARTERS;

  // Drag handle PanResponder — drag up to full screen, drag down to snap back to 60%
  const dragHandlePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 3,
      onPanResponderGrant: () => {
        dragStartHeightRef.current = panelHeightRef.current;
      },
      onPanResponderMove: (_, gs) => {
        const newH = Math.max(
          PANEL_HEIGHT_DEFAULT,
          Math.min(SCREEN_HEIGHT, dragStartHeightRef.current - gs.dy),
        );
        panelHeightAnim.setValue(newH);
        panelHeightRef.current = newH;
      },
      onPanResponderRelease: (_, gs) => {
        const h = panelHeightRef.current;
        const snapFull = h > SCREEN_HEIGHT * 0.8 || gs.vy < -0.5;
        const target = snapFull ? SCREEN_HEIGHT : PANEL_HEIGHT_DEFAULT;
        panelHeightRef.current = target;
        Animated.spring(panelHeightAnim, {
          toValue: target,
          useNativeDriver: false,
          damping: 20,
          stiffness: 200,
        }).start();
      },
    }),
  ).current;

  // Slide in on mount
  useEffect(() => {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      damping: 20,
      stiffness: 150,
    }).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load chat history from Supabase on mount
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const { data } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('room_id', roomId)
          .order('created_at', { ascending: true });

        if (data && data.length > 0) {
          setLocalMessages(
            (data as Array<Record<string, unknown>>).map((row) => ({
              id: String(row.id ?? `db-${row.created_at}`),
              room_id: String(row.room_id),
              role: (row.role as 'user' | 'assistant') ?? 'user',
              content: String(row.content ?? ''),
              created_at: String(row.created_at ?? new Date().toISOString()),
              action_trigger: (row.action_trigger as ActionTrigger) ?? null,
              suggested_product: null,
              confirmDismissed: true, // History confirmations are already resolved
            })),
          );
        }
      } catch {
        // silent — start fresh
      } finally {
        setIsHistoryLoading(false);
      }
    };
    loadHistory();
  }, [roomId]);

  // Auto-scroll on new message
  useEffect(() => {
    if (localMessages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [localMessages.length]);

  // ── Send message ──

  const handleSend = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? inputText).trim();
    if (!text || isLoading) return;

    lastUserMsgRef.current = text;
    setInputText('');

    const userMsg: LocalMessage = {
      id: `user-${Date.now()}`,
      room_id: roomId,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setLocalMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    const history = localMessages
      .filter((m) => !m.isError)
      .map((m) => ({ role: m.role, content: m.content }));

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS),
    );

    try {
      const result = await Promise.race([
        callEdgeFunction<ChatResponse>('chat-room', {
          room_id: roomId,
          message: text,
          render_image_url: renderImageUrl ?? null,
          tap_x: tapX ?? null,
          tap_y: tapY ?? null,
          chat_history: history,
          furniture_list: placedFurniture?.map((f) => f.name) ?? [],
          pinned_products: pinnedRoomProducts?.map((p) => ({ name: p.name, retailer: p.retailer })) ?? [],
          last_render_prompt: null,
        }),
        timeoutPromise,
      ]);

      // OPEN_SHOP executes immediately with no confirmation
      if (result.action_trigger?.type === 'OPEN_SHOP') {
        const category = result.action_trigger.data?.category as string | undefined;
        onOpenShop?.(category);
      }

      const assistantMsg: LocalMessage = {
        id: `assistant-${Date.now()}`,
        room_id: roomId,
        role: 'assistant',
        content: result.message ?? "I couldn't generate a response. Please try again.",
        created_at: new Date().toISOString(),
        // Only store REGENERATE, ADJUST_BLEND, PIN_PRODUCT as confirmable triggers
        action_trigger: result.action_trigger?.type !== 'OPEN_SHOP'
          ? (result.action_trigger ?? null)
          : null,
        suggested_product: result.suggested_product ?? null,
        confirmDismissed: false,
      };
      setLocalMessages((prev) => [...prev, assistantMsg]);
      onMessageSent?.();
    } catch (e) {
      const isTimeout = e instanceof Error && e.message === 'timeout';
      const errorMsg: LocalMessage = {
        id: `error-${Date.now()}`,
        room_id: roomId,
        role: 'assistant',
        content: isTimeout
          ? 'Having trouble thinking — please try again'
          : 'Sorry, something went wrong. Please try again.',
        created_at: new Date().toISOString(),
        isError: true,
      };
      setLocalMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [inputText, isLoading, localMessages, roomId, renderImageUrl, tapX, tapY, placedFurniture, pinnedRoomProducts, onOpenShop, onMessageSent]);

  const handleRetry = useCallback(() => {
    if (lastUserMsgRef.current) {
      handleSend(lastUserMsgRef.current);
    }
  }, [handleSend]);

  // ── Action confirm handlers ──

  const dismissActionCard = useCallback((messageId: string) => {
    setLocalMessages((prev) =>
      prev.map((m) => m.id === messageId ? { ...m, confirmDismissed: true } : m),
    );
  }, []);

  const confirmRegenerate = useCallback((messageId: string) => {
    dismissActionCard(messageId);
    onStartRender?.();
  }, [dismissActionCard, onStartRender]);

  const confirmAdjustBlend = useCallback((messageId: string, data: Record<string, unknown> | null) => {
    dismissActionCard(messageId);
    if (!data) return;
    const newBlend = data as StyleBlend;
    onAdjustBlend?.(newBlend);
  }, [dismissActionCard, onAdjustBlend]);

  const confirmPinProduct = useCallback((messageId: string, productId: string, productName: string) => {
    dismissActionCard(messageId);
    // Pin a minimal product object
    const minimal: Product = {
      id: productId,
      name: productName,
      description: null,
      price: 0,
      retailer: '',
      affiliate_url: '',
      category: 'decor' as Product['category'],
      room_types: [],
      style_tags: [],
      image_url: '',
      width_inches: null,
      depth_inches: null,
      height_inches: null,
    };
    pinProduct(minimal);
  }, [dismissActionCard, pinProduct]);

  // ── Render helpers ──

  const renderActionCard = (msg: LocalMessage) => {
    if (!msg.action_trigger || msg.confirmDismissed) return null;
    const { type, data } = msg.action_trigger;

    if (type === 'REGENERATE') {
      return (
        <View style={styles.actionCard}>
          <Text style={styles.actionCardTitle}>Generate a new design?</Text>
          <Text style={styles.actionCardSubtext}>This will use 1 token.</Text>
          <View style={styles.actionCardBtns}>
            <TouchableOpacity style={styles.actionCardNo} onPress={() => dismissActionCard(msg.id)}>
              <Text style={styles.actionCardNoText}>Not now</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCardYes} onPress={() => confirmRegenerate(msg.id)}>
              <Text style={styles.actionCardYesText}>Yes, do it</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (type === 'ADJUST_BLEND' && data) {
      const blendEntries = Object.entries(data as Record<string, number>)
        .filter(([, v]) => v > 0.04)
        .sort(([, a], [, b]) => b - a);
      const blendLabel = blendEntries
        .map(([k, v]) => `${Math.round((v as number) * 100)}% ${k}`)
        .join(', ');
      return (
        <View style={styles.actionCard}>
          <Text style={styles.actionCardTitle}>Adjust your style blend?</Text>
          <Text style={styles.actionCardSubtext}>{blendLabel}</Text>
          <Text style={styles.actionCardNote}>This will update your blend and start a new render (1 token).</Text>
          <View style={styles.actionCardBtns}>
            <TouchableOpacity style={styles.actionCardNo} onPress={() => dismissActionCard(msg.id)}>
              <Text style={styles.actionCardNoText}>Not now</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCardYes} onPress={() => confirmAdjustBlend(msg.id, data)}>
              <Text style={styles.actionCardYesText}>Yes, adjust</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (type === 'PIN_PRODUCT' && data) {
      const productName = String(data.product_name ?? 'this product');
      const productId = String(data.product_id ?? '');
      return (
        <View style={styles.actionCard}>
          <Text style={styles.actionCardTitle}>Pin to your room?</Text>
          <Text style={styles.actionCardSubtext}>{productName}</Text>
          <View style={styles.actionCardBtns}>
            <TouchableOpacity style={styles.actionCardNo} onPress={() => dismissActionCard(msg.id)}>
              <Text style={styles.actionCardNoText}>No</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCardYes} onPress={() => confirmPinProduct(msg.id, productId, productName)}>
              <Text style={styles.actionCardYesText}>📌 Pin</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return null;
  };

  const renderSuggestedProductCard = (product: SuggestedProduct) => (
    <View style={styles.productCard}>
      <Image source={{ uri: product.image_url }} style={styles.productCardImage} />
      <View style={styles.productCardInfo}>
        <Text style={styles.productCardName} numberOfLines={2}>{product.name}</Text>
        <Text style={styles.productCardPrice}>{formatPrice(product.price)}</Text>
        <Text style={styles.productCardRetailer}>{product.retailer}</Text>
        <TouchableOpacity
          style={styles.productCardPin}
          onPress={() => {
            pinProduct({
              id: product.id,
              name: product.name,
              description: null,
              price: product.price,
              retailer: product.retailer,
              affiliate_url: product.affiliate_url,
              category: product.category as Product['category'],
              room_types: [],
              style_tags: product.style_tags as Product['style_tags'],
              image_url: product.image_url,
              width_inches: null,
              depth_inches: null,
              height_inches: null,
            });
          }}
        >
          <Text style={styles.productCardPinText}>📌 Pin</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderItem = useCallback(({ item }: { item: LocalMessage }) => {
    const isUser = item.role === 'user';
    return (
      <View>
        {/* Message bubble */}
        <View style={[styles.msgRow, isUser ? styles.userRow : styles.assistantRow]}>
          {!isUser && <Text style={styles.covaLabel}>Cova</Text>}
          <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
            <Text style={[styles.bubbleText, isUser ? styles.userText : styles.assistantText]}>
              {item.content}
            </Text>
          </View>
          {item.isError && (
            <TouchableOpacity style={styles.retryBtn} onPress={handleRetry}>
              <Text style={styles.retryText}>↩ Retry</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Inline product card */}
        {!isUser && item.suggested_product && (
          <View style={styles.productCardWrapper}>
            {renderSuggestedProductCard(item.suggested_product)}
          </View>
        )}

        {/* Action confirmation card */}
        {!isUser && renderActionCard(item)}
      </View>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleRetry]);

  const showStarters = localMessages.length === 0 && !isHistoryLoading;
  const charCount = inputText.length;
  const showCharCounter = charCount >= CHAR_WARN;

  return (
    <View testID={testID} style={styles.overlay}>
      <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
      <Animated.View style={[styles.panel, { transform: [{ translateY }], height: panelHeightAnim }]}>
        {/* Drag handle — PanResponder for drag-to-fullscreen */}
        <View style={styles.dragHandleRow} {...dragHandlePan.panHandlers}>
          <View style={styles.dragHandle} />
        </View>

        {/* KeyboardAvoidingView wraps all content so input stays above keyboard */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.kavContent}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>AI Design Assistant</Text>
            <TouchableOpacity testID="chat-close" onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Message list */}
          {isHistoryLoading ? (
            <View style={styles.historyLoading}>
              <Text style={styles.historyLoadingText}>Loading conversation...</Text>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={localMessages}
              renderItem={renderItem}
              keyExtractor={(item) => item.id}
              style={styles.messageList}
              contentContainerStyle={styles.messageListContent}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>Ask me anything about your room design ✨</Text>
                </View>
              }
            />
          )}

          {/* Conversation starters */}
          {showStarters && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.starterScroll}
              contentContainerStyle={styles.starterContent}
            >
              {starters.map((starter) => (
                <TouchableOpacity
                  key={starter}
                  style={styles.starterChip}
                  onPress={() => handleSend(starter)}
                >
                  <Text style={styles.starterChipText}>{starter}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Typing indicator */}
          {isLoading && <LoadingDots />}

          {/* Input row */}
          <View style={styles.inputRow}>
            {tapX != null && tapY != null && (
              <View style={styles.pinIndicator}>
                <Text style={styles.pinText}>📍</Text>
              </View>
            )}
            <View style={styles.inputWrapper}>
              <TextInput
                testID="chat-input"
                style={styles.input}
                value={inputText}
                onChangeText={(t) => setInputText(t.slice(0, CHAR_LIMIT))}
                placeholder="Ask about your room..."
                placeholderTextColor="rgba(255,255,255,0.3)"
                multiline
                maxLength={CHAR_LIMIT}
              />
              {showCharCounter && (
                <Text style={[styles.charCounter, charCount >= CHAR_LIMIT && styles.charCounterLimit]}>
                  {charCount}/{CHAR_LIMIT}
                </Text>
              )}
            </View>
            <TouchableOpacity
              testID="chat-send"
              style={[styles.sendBtn, (!inputText.trim() || isLoading) && styles.sendBtnDisabled]}
              onPress={() => handleSend()}
              disabled={!inputText.trim() || isLoading}
            >
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                <Path d="M22 2L11 13" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                <Path d="M22 2L15 22l-4-9-9-4L22 2z" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  panel: {
    // Height is set via Animated.Value (panelHeightAnim) — do NOT add height here
    backgroundColor: BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderTopColor: '#1A2A40',
  },
  kavContent: {
    flex: 1,
  },
  dragHandleRow: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#2A3A50',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1A2A40',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  closeBtn: {
    position: 'absolute',
    right: 20,
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 18,
    color: '#888',
    fontWeight: '600',
  },
  historyLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyLoadingText: {
    color: '#555',
    fontSize: 14,
  },
  messageList: {
    flex: 1,
    paddingHorizontal: 14,
  },
  messageListContent: {
    paddingVertical: 12,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 20,
  },
  emptyStateText: {
    color: '#444',
    fontSize: 14,
    textAlign: 'center',
  },
  msgRow: {
    marginBottom: 10,
  },
  userRow: {
    alignItems: 'flex-end',
  },
  assistantRow: {
    alignItems: 'flex-start',
  },
  covaLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: GOLD,
    marginBottom: 4,
    marginLeft: 4,
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  userBubble: {
    backgroundColor: GOLD,
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#0F1E35',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#1A2A40',
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 21,
  },
  userText: {
    color: '#FFFFFF',
  },
  assistantText: {
    color: '#DDDDDD',
  },
  retryBtn: {
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GOLD,
  },
  retryText: {
    color: GOLD,
    fontSize: 13,
  },
  // Inline product card
  productCardWrapper: {
    paddingLeft: 6,
    marginBottom: 8,
  },
  productCard: {
    flexDirection: 'row',
    backgroundColor: '#0F1E35',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1A2A40',
    maxWidth: '90%',
  },
  productCardImage: {
    width: 80,
    height: 80,
    backgroundColor: '#1A2A40',
  },
  productCardInfo: {
    flex: 1,
    padding: 10,
  },
  productCardName: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  productCardPrice: {
    color: GOLD,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  productCardRetailer: {
    color: '#555',
    fontSize: 11,
    marginBottom: 6,
  },
  productCardPin: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(184,134,11,0.15)',
    borderWidth: 1,
    borderColor: GOLD,
  },
  productCardPinText: {
    color: GOLD,
    fontSize: 12,
    fontWeight: '600',
  },
  // Action confirmation card
  actionCard: {
    backgroundColor: '#0F1E35',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GOLD,
    padding: 14,
    marginLeft: 6,
    marginBottom: 10,
    maxWidth: '90%',
  },
  actionCardTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  actionCardSubtext: {
    color: '#AAA',
    fontSize: 13,
    marginBottom: 4,
  },
  actionCardNote: {
    color: '#666',
    fontSize: 12,
    marginBottom: 10,
  },
  actionCardBtns: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  actionCardNo: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A3A50',
    alignItems: 'center',
  },
  actionCardNoText: {
    color: '#666',
    fontSize: 14,
  },
  actionCardYes: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: GOLD,
    alignItems: 'center',
  },
  actionCardYesText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  // Conversation starters
  starterScroll: {
    maxHeight: 50,
    borderTopWidth: 1,
    borderTopColor: '#1A2A40',
  },
  starterContent: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  starterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#0F1E35',
    borderWidth: 1,
    borderColor: '#1A2A40',
    marginRight: 8,
  },
  starterChipText: {
    color: '#AAA',
    fontSize: 13,
  },
  // Typing dots
  dotsRow: {
    flexDirection: 'row',
    paddingHorizontal: 22,
    paddingVertical: 8,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GOLD,
  },
  // Input row
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#1A2A40',
    gap: 8,
  },
  pinIndicator: {
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  pinText: {
    fontSize: 16,
  },
  inputWrapper: {
    flex: 1,
    position: 'relative',
  },
  input: {
    backgroundColor: '#0F1E35',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingRight: 50,
    fontSize: 15,
    maxHeight: 100,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#1A2A40',
  },
  charCounter: {
    position: 'absolute',
    right: 10,
    bottom: 8,
    fontSize: 11,
    color: '#555',
  },
  charCounterLimit: {
    color: '#C62828',
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: GOLD,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
});
