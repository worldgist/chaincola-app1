import { useState, useRef, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
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
  type SupportMessage,
} from '@/lib/support-chat-service';
import { supabase } from '@/lib/supabase';

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: string;
}

export default function ChatSupportScreen() {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // Convert SupportMessage to Message format
  const convertToMessage = (msg: SupportMessage): Message => ({
    id: msg.id,
    text: msg.message,
    isUser: !msg.is_admin,
    timestamp: new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  });

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
        'Chat Support',
        'general'
      );

      if (ticketError || !ticket) {
        console.error('Error getting ticket:', ticketError);
        Alert.alert('Error', 'Failed to load chat. Please try again.');
        setLoading(false);
        return;
      }

      setTicketId(ticket.id);

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
    // Auto-scroll to bottom when new messages arrive
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  const handleSend = async () => {
    if (message.trim() === '' || !ticketId || !user?.id || sending) return;

    const messageText = message.trim();
    setMessage('');
    setSending(true);

    // Optimistically add user message
    const tempMessage: Message = {
      id: `temp-${Date.now()}`,
      text: messageText,
      isUser: true,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, tempMessage]);

    try {
      // Send message to support ticket
      const { message: newMessage, error } = await sendSupportMessage(ticketId, user.id, messageText);

      if (error || !newMessage) {
        console.error('Error sending message:', error);
        // Remove optimistic message on error
        setMessages((prev) => prev.filter((msg) => msg.id !== tempMessage.id));
        Alert.alert('Error', 'Failed to send message. Please try again.');
        setSending(false);
        return;
      }

      // Replace temp message with real message
      setMessages((prev) => prev.map((msg) => 
        msg.id === tempMessage.id ? convertToMessage(newMessage) : msg
      ));
    } catch (error: any) {
      console.error('Exception sending message:', error);
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((msg) => msg.id !== tempMessage.id));
      Alert.alert('Error', 'Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

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
          <ThemedText style={styles.headerTitle}>Chat Support</ThemedText>
          <ThemedText style={styles.headerSubtitle}>We're here to help</ThemedText>
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
            <ActivityIndicator size="large" color="#6B46C1" />
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
                <ThemedText style={styles.emptyText}>No messages yet. Start the conversation!</ThemedText>
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
                      msg.isUser ? styles.userMessageBubble : styles.supportMessageBubble,
                    ]}
                  >
                    <ThemedText
                      style={[
                        styles.messageText,
                        msg.isUser ? styles.userMessageText : styles.supportMessageText,
                      ]}
                    >
                      {msg.text}
                    </ThemedText>
                    <ThemedText
                      style={[
                        styles.messageTime,
                        msg.isUser ? styles.userMessageTime : styles.supportMessageTime,
                      ]}
                    >
                      {msg.timestamp}
                    </ThemedText>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        )}

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Type your message..."
            placeholderTextColor="#9CA3AF"
            value={message}
            onChangeText={setMessage}
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
                <ActivityIndicator size="small" color="#FFFFFF" />
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
});


