import React, { useRef, useEffect, useState } from 'react';
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
  Platform,
} from 'react-native';
import { useAppStore } from '../store';
import { callEdgeFunction } from '../lib/supabase';
import type { ChatMessage } from '@cova/shared';

interface ChatPanelProps {
  roomId: string;
  renderImageBase64?: string;
  onClose: () => void;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const PANEL_HEIGHT = SCREEN_HEIGHT * 0.6;

export default function ChatPanel({ roomId, renderImageBase64, onClose }: ChatPanelProps) {
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  const {
    messages,
    chatLoading,
    addMessage,
    setMessages,
    setChatLoading,
  } = useAppStore();

  const roomMessages = messages.filter((m) => m.room_id === roomId);

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      damping: 20,
      stiffness: 150,
    }).start();

    const existing = messages.filter((m) => m.room_id === roomId);
    setMessages(existing);
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      room_id: roomId,
      role: 'user',
      content: text,
      image_url: null,
      tap_x: null,
      tap_y: null,
      created_at: new Date().toISOString(),
    };

    addMessage(userMessage);
    setInputText('');
    setChatLoading(true);

    try {
      const res = await callEdgeFunction<{ message: string }>('chat-room', {
        room_id: roomId,
        message: text,
        render_image_base64: renderImageBase64,
        chat_history: [],
      });

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        room_id: roomId,
        role: 'assistant',
        content: res.message ?? 'I couldn\'t generate a response. Please try again.',
        image_url: null,
        tap_x: null,
        tap_y: null,
        created_at: new Date().toISOString(),
      };

      addMessage(assistantMessage);
    } catch {
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        room_id: roomId,
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        image_url: null,
        tap_x: null,
        tap_y: null,
        created_at: new Date().toISOString(),
      };
      addMessage(errorMessage);
    } finally {
      setChatLoading(false);
    }
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.messageBubbleRow, isUser ? styles.userRow : styles.assistantRow]}>
        {!isUser && <Text style={styles.covaLabel}>Cova</Text>}
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
          <Text style={[styles.bubbleText, isUser ? styles.userText : styles.assistantText]}>
            {item.content}
          </Text>
        </View>
      </View>
    );
  };

  const LoadingDots = () => {
    const dot1 = useRef(new Animated.Value(0)).current;
    const dot2 = useRef(new Animated.Value(0)).current;
    const dot3 = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      const animate = (dot: Animated.Value, delay: number) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
          ]),
        );
      animate(dot1, 0).start();
      animate(dot2, 200).start();
      animate(dot3, 400).start();
    }, [dot1, dot2, dot3]);

    return (
      <View style={styles.dotsRow}>
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View
            key={i}
            style={[styles.dot, { opacity: dot }]}
          />
        ))}
      </View>
    );
  };

  return (
    <View style={styles.overlay}>
      <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
      <Animated.View style={[styles.panel, { transform: [{ translateY }] }]}>
        <View style={styles.header}>
          <View style={styles.dragHandle} />
          <Text style={styles.headerTitle}>AI Design Assistant</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          ref={flatListRef}
          data={roomMessages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          style={styles.messageList}
          contentContainerStyle={styles.messageListContent}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />

        {chatLoading && <LoadingDots />}

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Ask about your room..."
              placeholderTextColor="#888"
              multiline
            />
            <TouchableOpacity
              style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!inputText.trim() || chatLoading}
            >
              <Text style={styles.sendBtnText}>→</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  panel: {
    height: PANEL_HEIGHT,
    backgroundColor: '#F5F0E8',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  dragHandle: {
    position: 'absolute',
    top: 6,
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ccc',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1B3A2D',
  },
  closeBtn: {
    position: 'absolute',
    right: 16,
    top: 12,
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 18,
    color: '#1B3A2D',
    fontWeight: '600',
  },
  messageList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  messageListContent: {
    paddingVertical: 12,
  },
  messageBubbleRow: {
    marginBottom: 12,
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
    color: '#888',
    marginBottom: 4,
    marginLeft: 4,
  },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  userBubble: {
    backgroundColor: '#C47B3C',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: 'white',
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 20,
  },
  userText: {
    color: 'white',
  },
  assistantText: {
    color: '#1B3A2D',
  },
  dotsRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 8,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#C47B3C',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.08)',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    color: '#1A1A1A',
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#C47B3C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendBtnText: {
    color: 'white',
    fontSize: 20,
    fontWeight: '700',
  },
});
