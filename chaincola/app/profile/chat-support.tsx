import { useState, useRef, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import {
  getOrCreateSupportTicket,
  getSupportMessages,
  sendSupportMessage,
  markMessagesAsRead,
  updateCustomerChatDisplayName,
  attachSupportTypingBridge,
  type SupportMessage,
  type SupportTicket,
} from '@/lib/support-chat-service';
import { supabase } from '@/lib/supabase';
import {
  SUPPORT_QUICK_TOPICS_FALLBACK,
  fetchSupportQuickTopics,
  type SupportQuickTopic,
} from '@/lib/support-chat-quick-topics';
import AppLoadingIndicator from '@/components/app-loading-indicator';

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: string;
  senderLabel: string;
  isLocalFaq?: boolean;
}

export default function ChatSupportScreen() {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [remoteTyping, setRemoteTyping] = useState<{ name: string } | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const typingBridgeRef = useRef<ReturnType<typeof attachSupportTypingBridge> | null>(null);
  const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingIdleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [quickTopics, setQuickTopics] = useState<SupportQuickTopic[]>(SUPPORT_QUICK_TOPICS_FALLBACK);

  // Convert SupportMessage to Message format
  const convertToMessage = (msg: SupportMessage): Message => {
    const raw = msg.sender_display_name?.trim();
    return {
      id: msg.id,
      text: msg.message,
      isUser: !msg.is_admin,
      timestamp: new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      senderLabel: raw || (msg.is_admin ? 'Support' : 'Customer'),
    };
  };

  // Load ticket and messages
  const loadChat = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Get or create a support ticket
      const { ticket, error: ticketError } = await getOrCreateSupportTicket(
        user.id,
        'Live Chat',
        'general'
      );

      if (ticketError || !ticket) {
        console.error('Error getting ticket:', ticketError);
        Alert.alert('Error', 'Failed to load chat. Please try again.');
        setLoading(false);
        return;
      }

      setTicketId(ticket.id);
      setDisplayName(((ticket as SupportTicket).customer_chat_display_name ?? '').trim());

      // Get messages for the ticket
      const { messages: supportMessages, error: messagesError } = await getSupportMessages(ticket.id);

      if (messagesError) {
        console.error('Error loading messages:', messagesError);
        Alert.alert('Error', 'Failed to load messages. Please try again.');
        setLoading(false);
        return;
      }

      // Convert support messages to display format
      const displayMessages = supportMessages.map(convertToMessage);

      // Note: We don't add a welcome message anymore since real messages will come from the database
      // If there are no messages, the UI will show the empty state

      setMessages(displayMessages);

      // Mark admin messages as read
      await markMessagesAsRead(ticket.id, user.id);
    } catch (error: any) {
      console.error('Exception loading chat:', error);
      Alert.alert('Error', 'Failed to load chat. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadChat();
    }, [loadChat])
  );

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void fetchSupportQuickTopics().then(({ topics }) => {
      if (!cancelled) setQuickTopics(topics);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  const flushTypingTimers = () => {
    if (typingDebounceRef.current) {
      clearTimeout(typingDebounceRef.current);
      typingDebounceRef.current = null;
    }
    if (typingIdleRef.current) {
      clearTimeout(typingIdleRef.current);
      typingIdleRef.current = null;
    }
  };

  const pingTypingFromComposer = (text: string) => {
    const bridge = typingBridgeRef.current;
    if (!bridge || !ticketId) return;
    const name = displayName.trim() || 'Customer';
    if (!text.trim()) {
      flushTypingTimers();
      void bridge.sendTyping(name, 'stop');
      return;
    }
    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
    typingDebounceRef.current = setTimeout(() => {
      typingDebounceRef.current = null;
      void bridge.sendTyping(name, 'start');
      if (typingIdleRef.current) clearTimeout(typingIdleRef.current);
      typingIdleRef.current = setTimeout(() => {
        typingIdleRef.current = null;
        void bridge.sendTyping(name, 'stop');
      }, 2500);
    }, 400);
  };

  const handleSaveDisplayName = async () => {
    if (!ticketId || !user?.id) return;
    setSavingName(true);
    const { error } = await updateCustomerChatDisplayName(ticketId, user.id, displayName);
    setSavingName(false);
    if (error) {
      Alert.alert('Error', error.message || 'Could not save name');
    }
  };

  const handleSend = async () => {
    if (message.trim() === '' || !ticketId || !user?.id || sending) return;

    const messageText = message.trim();
    flushTypingTimers();
    const bridge = typingBridgeRef.current;
    if (bridge) {
      const n = displayName.trim() || 'Customer';
      void bridge.sendTyping(n, 'stop');
    }
    setMessage('');
    setSending(true);

    // Optimistically add user message
    const tempMessage: Message = {
      id: `temp-${Date.now()}`,
      text: messageText,
      isUser: true,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      senderLabel: displayName.trim() || 'You',
    };
    setMessages((prev) => [...prev, tempMessage]);

    try {
      // Send message to support ticket
      const { message: newMessage, error } = await sendSupportMessage(
        ticketId,
        user.id,
        messageText,
        displayName.trim() || null
      );

      if (error || !newMessage) {
        console.error('Error sending message:', error);
        // Remove optimistic message on error
        setMessages((prev) => prev.filter((msg) => msg.id !== tempMessage.id));
        Alert.alert('Error', 'Failed to send message. Please try again.');
        setSending(false);
        return;
      }

      // Replace temp with real row; drop any duplicate of the real id (realtime may have appended first)
      setMessages((prev) => {
        const withoutRealDup = prev.filter((m) => m.id !== newMessage.id);
        return withoutRealDup.map((msg) =>
          msg.id === tempMessage.id ? convertToMessage(newMessage) : msg
        );
      });
    } catch (error: any) {
      console.error('Exception sending message:', error);
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((msg) => msg.id !== tempMessage.id));
      Alert.alert('Error', 'Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleQuickTopic = async (topic: SupportQuickTopic) => {
    if (!ticketId || !user?.id || sending || loading) return;
    const messageText = topic.prompt;
    flushTypingTimers();
    const bridge = typingBridgeRef.current;
    if (bridge) void bridge.sendTyping(displayName.trim() || 'Customer', 'stop');

    const tempMessage: Message = {
      id: `temp-${Date.now()}`,
      text: messageText,
      isUser: true,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      senderLabel: displayName.trim() || 'You',
    };
    const guideId = `local-faq-${topic.id}-${Date.now()}`;
    const guideMessage: Message = {
      id: guideId,
      text: topic.autoReply,
      isUser: false,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      senderLabel: 'ChainCola',
      isLocalFaq: true,
    };

    setSending(true);
    setMessages((prev) => [...prev, tempMessage, guideMessage]);

    try {
      const { message: newMessage, error } = await sendSupportMessage(
        ticketId,
        user.id,
        messageText,
        displayName.trim() || null
      );

      if (error || !newMessage) {
        setMessages((prev) => prev.filter((m) => m.id !== tempMessage.id && m.id !== guideId));
        Alert.alert('Error', 'Failed to send message. Please try again.');
        setSending(false);
        return;
      }

      setMessages((prev) => {
        const withoutRealDup = prev.filter((m) => m.id !== newMessage.id);
        return withoutRealDup.map((msg) =>
          msg.id === tempMessage.id ? convertToMessage(newMessage) : msg
        );
      });
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempMessage.id && m.id !== guideId));
      Alert.alert('Error', 'Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    typingBridgeRef.current?.cleanup();
    typingBridgeRef.current = null;
    setRemoteTyping(null);
    if (!ticketId || !user?.id) return;
    const bridge = attachSupportTypingBridge(ticketId, 'customer', ({ name, active }) => {
      setRemoteTyping(active ? { name } : null);
    });
    typingBridgeRef.current = bridge;
    return () => {
      bridge.cleanup();
      if (typingBridgeRef.current === bridge) typingBridgeRef.current = null;
      setRemoteTyping(null);
    };
  }, [ticketId, user?.id]);

  // Real-time subscription for new messages (admin replies)
  useEffect(() => {
    if (!ticketId || !user?.id) return;

    console.log('🔔 Setting up real-time subscription for ticket:', ticketId);

    // Set up real-time subscription for new messages
    const channel = supabase
      .channel(`support_messages:${ticketId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'support_messages',
          filter: `ticket_id=eq.${ticketId}`,
        },
        async (payload) => {
          console.log('📨 New message received via real-time:', payload.new);
          const newMessage = payload.new as SupportMessage;
          
          // Add the new message to the list
          setMessages((prevMessages) => {
            // Check if message already exists (avoid duplicates)
            if (prevMessages.some(m => m.id === newMessage.id)) {
              return prevMessages;
            }
            
            const displayMessage = convertToMessage(newMessage);
            const updatedMessages = [...prevMessages, displayMessage];
            
            // Mark admin messages as read when received
            if (newMessage.is_admin && !newMessage.is_read) {
              markMessagesAsRead(ticketId, user.id).catch(err => 
                console.error('Error marking messages as read:', err)
              );
            }
            
            return updatedMessages;
          });
        }
      )
      .subscribe((status) => {
        console.log('📡 Real-time subscription status:', status);
      });

    // Fallback polling in case real-time fails (every 5 seconds)
    const pollInterval = setInterval(async () => {
      try {
        const { messages: supportMessages } = await getSupportMessages(ticketId);
        const displayMessages = supportMessages.map(convertToMessage);
        
        // Update messages if we have new ones (compare by IDs to avoid unnecessary updates)
        setMessages((prevMessages) => {
          const prevIds = new Set(prevMessages.map(m => m.id));
          const newIds = new Set(displayMessages.map(m => m.id));
          
          // Check if we have new messages
          const hasNewMessages = displayMessages.some(msg => !prevIds.has(msg.id));
          
          if (hasNewMessages) {
            markMessagesAsRead(ticketId, user.id).catch(err => 
              console.error('Error marking messages as read:', err)
            );
            return displayMessages;
          }
          
          return prevMessages;
        });
      } catch (error) {
        console.error('Error polling messages:', error);
      }
    }, 5000); // Poll every 5 seconds as fallback

    return () => {
      console.log('🔕 Cleaning up real-time subscription');
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [ticketId, user?.id]);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <MaterialIcons name="arrow-back" size={24} color="#11181C" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <ThemedText style={styles.headerTitle}>Live Chat</ThemedText>
          <ThemedText style={styles.headerSubtitle}>Real-time messaging with our team</ThemedText>
        </View>
        <View style={styles.placeholder} />
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={90}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <AppLoadingIndicator size="large" />
            <ThemedText style={styles.loadingText}>Loading chat...</ThemedText>
          </View>
        ) : (
          <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={styles.messagesContainer}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.length === 0 ? (
              <View style={styles.emptyContainer}>
                <ThemedText style={styles.emptyLead}>
                  What do you need help with? Tap a topic — we will send it to support and show a quick reply here
                  right away.
                </ThemedText>
                <View style={styles.chipWrap}>
                  {quickTopics.map((topic) => (
                    <TouchableOpacity
                      key={topic.id}
                      style={[styles.chip, (!ticketId || sending) && styles.chipDisabled]}
                      onPress={() => void handleQuickTopic(topic)}
                      disabled={!ticketId || sending || loading}
                      activeOpacity={0.85}
                    >
                      <ThemedText style={styles.chipText}>{topic.label}</ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
                <ThemedText style={styles.emptyHint}>Or type your own message below.</ThemedText>
              </View>
            ) : (
              messages.map((msg) => (
                <View
                  key={msg.id}
                  style={[
                    styles.messageContainer,
                    msg.isUser ? styles.userMessageContainer : styles.supportMessageContainer,
                  ]}
                >
                  <View
                    style={[
                      styles.messageBubble,
                      msg.isUser
                        ? styles.userMessageBubble
                        : msg.isLocalFaq
                          ? styles.faqMessageBubble
                          : styles.supportMessageBubble,
                    ]}
                  >
                    <ThemedText
                      style={[
                        styles.senderLabel,
                        msg.isUser
                          ? styles.userSenderLabel
                          : msg.isLocalFaq
                            ? styles.faqSenderLabel
                            : styles.supportSenderLabel,
                      ]}
                    >
                      {msg.senderLabel}
                      {msg.isLocalFaq ? ' · Auto-reply' : ''}
                    </ThemedText>
                    <ThemedText
                      style={[
                        styles.messageText,
                        msg.isUser
                          ? styles.userMessageText
                          : msg.isLocalFaq
                            ? styles.faqMessageText
                            : styles.supportMessageText,
                      ]}
                    >
                      {msg.text}
                    </ThemedText>
                    <ThemedText
                      style={[
                        styles.messageTime,
                        msg.isUser
                          ? styles.userMessageTime
                          : msg.isLocalFaq
                            ? styles.faqMessageTime
                            : styles.supportMessageTime,
                      ]}
                    >
                      {msg.timestamp}
                    </ThemedText>
                  </View>
                </View>
              ))
            )}
            {remoteTyping ? (
              <ThemedText style={styles.typingHint}>{remoteTyping.name} is typing…</ThemedText>
            ) : null}
          </ScrollView>
        )}

        <View style={styles.nameBar}>
          <TextInput
            style={styles.nameInput}
            placeholder="Your name (e.g. Mary)"
            placeholderTextColor="#9CA3AF"
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={80}
            editable={!loading && !!ticketId}
          />
          <TouchableOpacity
            style={[styles.saveNameBtn, (!displayName.trim() || savingName || loading || !ticketId) && styles.saveNameBtnDisabled]}
            onPress={() => void handleSaveDisplayName()}
            disabled={!displayName.trim() || savingName || loading || !ticketId}
          >
            <ThemedText style={styles.saveNameBtnText}>{savingName ? '…' : 'Save'}</ThemedText>
          </TouchableOpacity>
        </View>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Type your message..."
            placeholderTextColor="#9CA3AF"
            value={message}
            onChangeText={(t) => {
              setMessage(t);
              pingTypingFromComposer(t);
            }}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendButton, (message.trim() === '' || sending || loading) && styles.sendButtonDisabled]}
            onPress={handleSend}
            activeOpacity={0.8}
            disabled={message.trim() === '' || sending || loading}
          >
            <LinearGradient
              colors={(message.trim() !== '' && !sending && !loading) ? ['#6B46C1', '#9333EA'] : ['#D1D5DB', '#9CA3AF']}
              style={styles.sendButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {sending ? (
                <AppLoadingIndicator size="small" variant="onPrimary" />
              ) : (
                <MaterialIcons name="send" size={20} color="#FFFFFF" />
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 2,
  },
  placeholder: {
    width: 40,
  },
  keyboardView: {
    flex: 1,
  },
  messagesContainer: {
    padding: 20,
    paddingBottom: 20,
    flexGrow: 1,
  },
  messageContainer: {
    marginBottom: 16,
    width: '100%',
  },
  userMessageContainer: {
    alignItems: 'flex-end',
  },
  supportMessageContainer: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '75%',
    padding: 12,
    borderRadius: 16,
  },
  userMessageBubble: {
    backgroundColor: '#6B46C1',
    borderBottomRightRadius: 4,
  },
  supportMessageBubble: {
    backgroundColor: '#F3F4F6',
    borderBottomLeftRadius: 4,
  },
  senderLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  userSenderLabel: {
    color: 'rgba(255,255,255,0.85)',
  },
  supportSenderLabel: {
    color: '#6B7280',
  },
  typingHint: {
    fontSize: 13,
    color: '#6B7280',
    fontStyle: 'italic',
    paddingVertical: 8,
    textAlign: 'center',
  },
  nameBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  nameInput: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    color: '#11181C',
  },
  saveNameBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#E9D5FF',
  },
  saveNameBtnDisabled: {
    opacity: 0.5,
  },
  saveNameBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#5B21B6',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
    marginBottom: 4,
  },
  userMessageText: {
    color: '#FFFFFF',
  },
  supportMessageText: {
    color: '#11181C',
  },
  messageTime: {
    fontSize: 11,
    alignSelf: 'flex-end',
  },
  userMessageTime: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  supportMessageTime: {
    color: '#9CA3AF',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 12,
  },
  input: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    color: '#11181C',
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    opacity: 0.7,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    opacity: 0.7,
    textAlign: 'center',
  },
  emptyLead: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: '#4B5563',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 16,
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  chipDisabled: {
    opacity: 0.5,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#5B21B6',
  },
  emptyHint: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  faqMessageBubble: {
    backgroundColor: '#EEF2FF',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  faqSenderLabel: {
    color: '#4338CA',
  },
  faqMessageText: {
    color: '#1E1B4B',
  },
  faqMessageTime: {
    color: '#6366F1',
  },
});

