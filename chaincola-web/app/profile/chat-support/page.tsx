'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from '../../components/Navbar';
import {
  getOrCreateSupportTicket,
  getSupportMessages,
  sendSupportMessage,
  markMessagesAsRead,
  subscribeSupportMessages,
  updateCustomerChatDisplayName,
  attachSupportTypingBridge,
  type SupportMessage,
  type SupportTicket,
} from '@/lib/support-chat-service';
import {
  SUPPORT_QUICK_TOPICS_FALLBACK,
  fetchSupportQuickTopics,
  type SupportQuickTopic,
} from '@/lib/support-chat-quick-topics';

type ChatRow = {
  id: string;
  text: string;
  isUser: boolean;
  at: Date;
  senderLabel: string;
  /** On-device FAQ reply; not from the database */
  isLocalFaq?: boolean;
};

function toRow(msg: SupportMessage): ChatRow {
  const raw = msg.sender_display_name?.trim();
  return {
    id: msg.id,
    text: msg.message,
    isUser: !msg.is_admin,
    at: new Date(msg.created_at),
    senderLabel: raw || (msg.is_admin ? 'Support' : 'Customer'),
  };
}

export default function LiveChatPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveConnected, setLiveConnected] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [remoteTyping, setRemoteTyping] = useState<{ name: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingBridgeRef = useRef<ReturnType<typeof attachSupportTypingBridge> | null>(null);
  const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingIdleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [quickTopics, setQuickTopics] = useState<SupportQuickTopic[]>(SUPPORT_QUICK_TOPICS_FALLBACK);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadChat = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const { ticket, error: tErr } = await getOrCreateSupportTicket(user.id, 'Live Chat', 'general');
      if (tErr || !ticket) {
        setError(tErr?.message || 'Could not open chat');
        setLoading(false);
        return;
      }
      setTicketId(ticket.id);
      setDisplayName(((ticket as SupportTicket).customer_chat_display_name ?? '').trim());

      const { messages: rows, error: mErr } = await getSupportMessages(ticket.id);
      if (mErr) {
        setError(mErr.message);
        setLoading(false);
        return;
      }
      setMessages(rows.map(toRow));
      await markMessagesAsRead(ticket.id, user.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load chat');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user) {
      router.push('/auth/signin');
      return;
    }
    loadChat();
  }, [user, router, loadChat]);

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
    if (!ticketId || !user?.id) return;

    const unsub = subscribeSupportMessages(ticketId, (newMsg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        const row = toRow(newMsg);
        if (newMsg.is_admin) {
          markMessagesAsRead(ticketId, user.id).catch(() => {});
        }
        return [...prev, row];
      });
    });

    setLiveConnected(true);
    return () => {
      setLiveConnected(false);
      unsub();
    };
  }, [ticketId, user?.id]);

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

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && ticketId && user?.id) {
        void (async () => {
          const { messages: rows } = await getSupportMessages(ticketId);
          setMessages(rows.map(toRow));
          await markMessagesAsRead(ticketId, user.id);
        })();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [ticketId, user?.id]);

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
    setError(null);
    const { error: nameErr } = await updateCustomerChatDisplayName(ticketId, user.id, displayName);
    setSavingName(false);
    if (nameErr) setError(nameErr.message);
  };

  const handleSend = async () => {
    if (!inputMessage.trim() || sending || !ticketId || !user?.id) return;

    const text = inputMessage.trim();
    flushTypingTimers();
    const bridge = typingBridgeRef.current;
    if (bridge) {
      const n = displayName.trim() || 'Customer';
      void bridge.sendTyping(n, 'stop');
    }
    setInputMessage('');
    setError(null);
    setSending(true);

    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatRow = {
      id: tempId,
      text,
      isUser: true,
      at: new Date(),
      senderLabel: displayName.trim() || 'You',
    };
    setMessages((prev) => [...prev, optimistic]);

    const { message: saved, error: sendErr } = await sendSupportMessage(
      ticketId,
      user.id,
      text,
      displayName.trim() || null,
    );
    if (sendErr || !saved) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setError(sendErr?.message || 'Failed to send');
      setSending(false);
      return;
    }

    setMessages((prev) => {
      const withoutDup = prev.filter((m) => m.id !== saved.id);
      return withoutDup.map((m) => (m.id === tempId ? toRow(saved) : m));
    });
    setSending(false);
  };

  const handleQuickTopic = async (topic: SupportQuickTopic) => {
    if (!ticketId || !user?.id || sending || loading) return;
    const text = topic.prompt;
    flushTypingTimers();
    const bridge = typingBridgeRef.current;
    if (bridge) void bridge.sendTyping(displayName.trim() || 'Customer', 'stop');

    const tempId = `temp-${Date.now()}`;
    const guideId = `local-faq-${topic.id}-${Date.now()}`;
    const optimistic: ChatRow = {
      id: tempId,
      text,
      isUser: true,
      at: new Date(),
      senderLabel: displayName.trim() || 'You',
    };
    const guideRow: ChatRow = {
      id: guideId,
      text: topic.autoReply,
      isUser: false,
      at: new Date(),
      senderLabel: 'ChainCola',
      isLocalFaq: true,
    };

    setError(null);
    setSending(true);
    setMessages((prev) => [...prev, optimistic, guideRow]);

    const { message: saved, error: sendErr } = await sendSupportMessage(
      ticketId,
      user.id,
      text,
      displayName.trim() || null,
    );
    if (sendErr || !saved) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId && m.id !== guideId));
      setError(sendErr?.message || 'Failed to send');
      setSending(false);
      return;
    }

    setMessages((prev) => {
      const withoutDup = prev.filter((m) => m.id !== saved.id);
      return withoutDup.map((m) => (m.id === tempId ? toRow(saved) : m));
    });
    setSending(false);
  };

  if (!user) return null;

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-purple-50">
      <Navbar />
      <div className="container mx-auto px-4 py-8 pt-24">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <Link href="/profile" className="inline-flex items-center text-purple-600 hover:text-purple-700 mb-4">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Profile
            </Link>
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-gray-900">Live Chat</h1>
              {liveConnected && !loading && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden />
                  Live
                </span>
              )}
            </div>
            <p className="text-gray-600">
              Chat with our team in real time. Replies appear here as soon as they are sent.
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="bg-white rounded-xl shadow-lg flex flex-col" style={{ height: '600px' }}>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {loading ? (
                <div className="flex h-full items-center justify-center text-gray-500">
                  Loading conversation…
                </div>
              ) : messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center px-6 py-8 gap-5">
                  <p className="text-gray-600 max-w-md">
                    What do you need help with? Tap a topic to send it to our team — you will get a quick reply here
                    right away, then a human agent when they are available.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                    {quickTopics.map((topic) => (
                      <button
                        key={topic.id}
                        type="button"
                        disabled={!ticketId || sending}
                        onClick={() => void handleQuickTopic(topic)}
                        className="rounded-full border border-purple-200 bg-white px-4 py-2 text-sm font-medium text-purple-800 shadow-sm hover:bg-purple-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {topic.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-sm text-gray-500">Or type your own message below.</p>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                        message.isUser
                          ? 'bg-purple-600 text-white'
                          : message.isLocalFaq
                            ? 'border border-indigo-200 bg-indigo-50 text-gray-900'
                            : 'bg-gray-100 text-gray-900'
                      }`}
                    >
                      <p
                        className={`text-xs font-semibold mb-0.5 ${
                          message.isUser
                            ? 'text-purple-100'
                            : message.isLocalFaq
                              ? 'text-indigo-700'
                              : 'text-gray-600'
                        }`}
                      >
                        {message.senderLabel}
                        {message.isLocalFaq ? ' · Auto-reply' : ''}
                      </p>
                      <p className="whitespace-pre-wrap break-words">{message.text}</p>
                      <p
                        className={`text-xs mt-1 ${
                          message.isUser ? 'text-purple-200' : 'text-gray-500'
                        }`}
                      >
                        {message.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))
              )}
              {remoteTyping && (
                <p className="text-sm text-gray-500 px-1 py-1">{remoteTyping.name} is typing…</p>
              )}
              {sending && (
                <div className="flex justify-end">
                  <div className="bg-purple-100 text-purple-800 px-4 py-2 rounded-lg text-sm">Sending…</div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-gray-200 p-4 space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex-1 min-w-[200px]">
                  <span className="block text-xs font-medium text-gray-600 mb-1">Your name in chat</span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. Mary"
                      maxLength={80}
                      disabled={loading || !ticketId}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none disabled:bg-gray-100"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSaveDisplayName()}
                      disabled={savingName || loading || !ticketId || !displayName.trim()}
                      className="shrink-0 px-4 py-2 rounded-lg text-sm font-semibold bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-50"
                    >
                      {savingName ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </label>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => {
                    const v = e.target.value;
                    setInputMessage(v);
                    pingTypingFromComposer(v);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  placeholder="Type your message…"
                  disabled={loading || !ticketId}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none disabled:bg-gray-100"
                />
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={!inputMessage.trim() || sending || loading || !ticketId}
                  className="bg-purple-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
