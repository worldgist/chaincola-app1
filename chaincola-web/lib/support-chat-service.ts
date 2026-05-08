import { createClient } from '@/lib/supabase/client';

let supabaseSingleton: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (!supabaseSingleton) supabaseSingleton = createClient();
  return supabaseSingleton;
}

export interface SupportTicket {
  id: string;
  user_id: string;
  subject: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  category: 'general' | 'account' | 'transaction' | 'technical' | 'complaint' | 'other';
  assigned_to?: string;
  last_message_at: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
  /** Customer-chosen label shown in live chat */
  customer_chat_display_name?: string | null;
}

export interface SupportMessage {
  id: string;
  ticket_id: string;
  user_id: string;
  message: string;
  is_admin: boolean;
  is_read: boolean;
  read_at?: string;
  created_at: string;
  updated_at: string;
  /** Shown on bubble, e.g. "Mary" or "Support Agent" */
  sender_display_name?: string | null;
}

export async function getOrCreateSupportTicket(
  userId: string,
  subject: string = 'General Inquiry',
  category: 'general' | 'account' | 'transaction' | 'technical' | 'complaint' | 'other' = 'general',
): Promise<{ ticket: SupportTicket | null; error: Error | null }> {
  const supabase = getSupabase();
  try {
    const { data: ticketId, error: rpcError } = await supabase.rpc('get_or_create_support_ticket', {
      p_user_id: userId,
      p_subject: subject,
      p_category: category,
    });

    if (rpcError) {
      return { ticket: null, error: new Error(rpcError.message) };
    }
    if (!ticketId) {
      return { ticket: null, error: new Error('Failed to create ticket') };
    }

    const { data: ticket, error: fetchError } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('id', ticketId)
      .single();

    if (fetchError || !ticket) {
      return { ticket: null, error: new Error(fetchError?.message || 'Ticket not found') };
    }

    return { ticket: ticket as SupportTicket, error: null };
  } catch (e) {
    return { ticket: null, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

export async function getSupportMessages(
  ticketId: string,
): Promise<{ messages: SupportMessage[]; error: Error | null }> {
  const supabase = getSupabase();
  try {
    const { data: messages, error } = await supabase
      .from('support_messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (error) {
      return { messages: [], error: new Error(error.message) };
    }
    return { messages: (messages || []) as SupportMessage[], error: null };
  } catch (e) {
    return { messages: [], error: e instanceof Error ? e : new Error(String(e)) };
  }
}

export async function updateCustomerChatDisplayName(
  ticketId: string,
  userId: string,
  displayName: string,
): Promise<{ error: Error | null }> {
  const supabase = getSupabase();
  const trimmed = displayName.trim().slice(0, 80);
  if (!trimmed) {
    return { error: new Error('Please enter a name') };
  }
  const { error } = await supabase
    .from('support_tickets')
    .update({ customer_chat_display_name: trimmed, updated_at: new Date().toISOString() })
    .eq('id', ticketId)
    .eq('user_id', userId);
  return { error: error ? new Error(error.message) : null };
}

export async function sendSupportMessage(
  ticketId: string,
  userId: string,
  message: string,
  senderDisplayName?: string | null,
): Promise<{ message: SupportMessage | null; error: Error | null }> {
  const supabase = getSupabase();
  try {
    if (!message?.trim()) {
      return { message: null, error: new Error('Message cannot be empty') };
    }

    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .select('id, user_id, status, customer_chat_display_name')
      .eq('id', ticketId)
      .eq('user_id', userId)
      .single();

    if (ticketError || !ticket) {
      return { message: null, error: new Error('Ticket not found or access denied') };
    }
    if (ticket.status === 'closed') {
      return { message: null, error: new Error('Cannot send message to a closed ticket') };
    }

    const label =
      (senderDisplayName && senderDisplayName.trim()) ||
      (ticket as { customer_chat_display_name?: string | null }).customer_chat_display_name?.trim() ||
      'Customer';

    const { data: newMessage, error: insertError } = await supabase
      .from('support_messages')
      .insert({
        ticket_id: ticketId,
        user_id: userId,
        message: message.trim(),
        is_admin: false,
        is_read: false,
        sender_display_name: label.slice(0, 80),
      })
      .select()
      .single();

    if (insertError) {
      return { message: null, error: new Error(insertError.message) };
    }
    return { message: newMessage as SupportMessage, error: null };
  } catch (e) {
    return { message: null, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

/** Realtime: new rows on `support_messages` for this ticket. */
export function subscribeSupportMessages(
  ticketId: string,
  onInsert: (row: SupportMessage) => void,
): () => void {
  const supabase = getSupabase();
  const channel = supabase
    .channel(`support_messages_web:${ticketId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'support_messages',
        filter: `ticket_id=eq.${ticketId}`,
      },
      (payload) => {
        onInsert(payload.new as SupportMessage);
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export type SupportChatRole = 'customer' | 'agent';

export type RemoteTypingCallback = (p: { name: string; active: boolean }) => void;

/**
 * Broadcast typing state over Supabase Realtime (no DB rows).
 * `viewerRole` is the local user; events from the same role are ignored.
 */
export function attachSupportTypingBridge(
  ticketId: string,
  viewerRole: SupportChatRole,
  onRemote: RemoteTypingCallback,
): {
  sendTyping: (displayName: string, state: 'start' | 'stop') => Promise<void>;
  cleanup: () => void;
} {
  const supabase = getSupabase();
  const channel = supabase.channel(`support_typing:${ticketId}`, {
    config: { broadcast: { self: false } },
  });

  channel.on('broadcast', { event: 'typing' }, ({ payload }) => {
    const p = payload as { from?: string; name?: string; state?: string };
    if (!p || p.from === viewerRole) return;
    onRemote({
      name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : 'Someone',
      active: p.state === 'start',
    });
  });

  channel.subscribe();

  return {
    sendTyping: async (displayName: string, state: 'start' | 'stop') => {
      const name =
        displayName.trim() ||
        (viewerRole === 'agent' ? 'Support' : 'Customer');
      await channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { from: viewerRole, name: name.slice(0, 80), state },
      });
    },
    cleanup: () => {
      void channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { from: viewerRole, name: '', state: 'stop' },
      });
      supabase.removeChannel(channel);
    },
  };
}

export async function markMessagesAsRead(
  ticketId: string,
  userId: string,
): Promise<{ error: Error | null }> {
  const supabase = getSupabase();
  try {
    const { error } = await supabase.rpc('mark_ticket_messages_as_read', {
      p_ticket_id: ticketId,
      p_user_id: userId,
    });

    if (error) {
      const { error: updateError } = await supabase
        .from('support_messages')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('ticket_id', ticketId)
        .eq('is_admin', true)
        .eq('is_read', false);

      if (updateError) {
        return { error: new Error(updateError.message) };
      }
    }
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}
