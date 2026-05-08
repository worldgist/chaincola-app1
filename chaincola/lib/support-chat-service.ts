import { supabase } from './supabase';

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
  sender_display_name?: string | null;
}

/**
 * Get or create a support ticket for the current user
 * If user has an open ticket, returns that. Otherwise creates a new one.
 */
export async function getOrCreateSupportTicket(
  userId: string,
  subject: string = 'General Inquiry',
  category: 'general' | 'account' | 'transaction' | 'technical' | 'complaint' | 'other' = 'general'
): Promise<{ ticket: SupportTicket | null; error: any }> {
  try {
    console.log('📋 Getting or creating support ticket for user:', userId);

    // Use the database function to get or create ticket
    const { data: ticketId, error: rpcError } = await supabase.rpc('get_or_create_support_ticket', {
      p_user_id: userId,
      p_subject: subject,
      p_category: category,
    });

    if (rpcError) {
      console.error('❌ Error getting or creating ticket:', rpcError);
      return { ticket: null, error: rpcError };
    }

    if (!ticketId) {
      console.error('❌ No ticket ID returned from function');
      return { ticket: null, error: { message: 'Failed to create ticket' } };
    }

    // Fetch the full ticket details
    const { data: ticket, error: fetchError } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('id', ticketId)
      .single();

    if (fetchError) {
      console.error('❌ Error fetching ticket details:', fetchError);
      return { ticket: null, error: fetchError };
    }

    console.log('✅ Ticket retrieved/created:', ticket.id);
    return { ticket: ticket as SupportTicket, error: null };
  } catch (error: any) {
    console.error('❌ Exception in getOrCreateSupportTicket:', error);
    return { ticket: null, error };
  }
}

/**
 * Get all messages for a support ticket
 */
export async function getSupportMessages(ticketId: string): Promise<{ messages: SupportMessage[]; error: any }> {
  try {
    console.log('💬 Fetching messages for ticket:', ticketId);

    const { data: messages, error } = await supabase
      .from('support_messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true }); // Oldest first

    if (error) {
      console.error('❌ Error fetching messages:', error);
      return { messages: [], error };
    }

    console.log(`✅ Fetched ${messages?.length || 0} messages`);
    return { messages: (messages || []) as SupportMessage[], error: null };
  } catch (error: any) {
    console.error('❌ Exception in getSupportMessages:', error);
    return { messages: [], error };
  }
}

export async function updateCustomerChatDisplayName(
  ticketId: string,
  userId: string,
  displayName: string
): Promise<{ error: any }> {
  const trimmed = displayName.trim().slice(0, 80);
  if (!trimmed) {
    return { error: { message: 'Please enter a name' } };
  }
  const { error } = await supabase
    .from('support_tickets')
    .update({ customer_chat_display_name: trimmed, updated_at: new Date().toISOString() })
    .eq('id', ticketId)
    .eq('user_id', userId);
  return { error: error || null };
}

/**
 * Send a message to a support ticket
 */
export async function sendSupportMessage(
  ticketId: string,
  userId: string,
  message: string,
  senderDisplayName?: string | null
): Promise<{ message: SupportMessage | null; error: any }> {
  try {
    if (!message || message.trim() === '') {
      return { message: null, error: { message: 'Message cannot be empty' } };
    }

    console.log('📤 Sending message to ticket:', ticketId);

    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .select('id, user_id, status, customer_chat_display_name')
      .eq('id', ticketId)
      .eq('user_id', userId)
      .single();

    if (ticketError || !ticket) {
      console.error('❌ Ticket not found or access denied:', ticketError);
      return { message: null, error: { message: 'Ticket not found or access denied' } };
    }

    if (ticket.status === 'closed') {
      return { message: null, error: { message: 'Cannot send message to a closed ticket' } };
    }

    const label =
      (senderDisplayName && senderDisplayName.trim()) ||
      (ticket as SupportTicket).customer_chat_display_name?.trim() ||
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
      console.error('❌ Error inserting message:', insertError);
      return { message: null, error: insertError };
    }

    console.log('✅ Message sent successfully:', newMessage.id);
    return { message: newMessage as SupportMessage, error: null };
  } catch (error: any) {
    console.error('❌ Exception in sendSupportMessage:', error);
    return { message: null, error };
  }
}

/**
 * Mark messages as read for a ticket
 */
export async function markMessagesAsRead(ticketId: string, userId: string): Promise<{ error: any }> {
  try {
    console.log('👁️ Marking messages as read for ticket:', ticketId);

    // Use the database function to mark messages as read
    const { data: count, error } = await supabase.rpc('mark_ticket_messages_as_read', {
      p_ticket_id: ticketId,
      p_user_id: userId,
    });

    if (error) {
      console.error('❌ Error marking messages as read:', error);
      // Fallback to direct update
      const { error: updateError } = await supabase
        .from('support_messages')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('ticket_id', ticketId)
        .eq('is_admin', true)
        .eq('is_read', false);

      if (updateError) {
        return { error: updateError };
      }
    }

    console.log(`✅ Marked ${count || 0} messages as read`);
    return { error: null };
  } catch (error: any) {
    console.error('❌ Exception in markMessagesAsRead:', error);
    return { error };
  }
}

/**
 * Get user's support tickets
 */
export async function getUserSupportTickets(userId: string): Promise<{ tickets: SupportTicket[]; error: any }> {
  try {
    console.log('📋 Fetching user support tickets for:', userId);

    const { data: tickets, error } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('user_id', userId)
      .order('last_message_at', { ascending: false }); // Most recent first

    if (error) {
      console.error('❌ Error fetching tickets:', error);
      return { tickets: [], error };
    }

    console.log(`✅ Fetched ${tickets?.length || 0} tickets`);
    return { tickets: (tickets || []) as SupportTicket[], error: null };
  } catch (error: any) {
    console.error('❌ Exception in getUserSupportTickets:', error);
    return { tickets: [], error };
  }
}

/**
 * Update ticket status (e.g., mark as resolved)
 */
export async function updateTicketStatus(
  ticketId: string,
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
): Promise<{ error: any }> {
  try {
    console.log(`🔄 Updating ticket ${ticketId} status to: ${status}`);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { error: { message: 'User not authenticated' } };
    }

    // Verify the ticket belongs to the user
    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .select('id, user_id')
      .eq('id', ticketId)
      .eq('user_id', user.id)
      .single();

    if (ticketError || !ticket) {
      console.error('❌ Ticket not found or access denied:', ticketError);
      return { error: { message: 'Ticket not found or access denied' } };
    }

    // Update the ticket status
    const { error: updateError } = await supabase
      .from('support_tickets')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', ticketId);

    if (updateError) {
      console.error('❌ Error updating ticket status:', updateError);
      return { error: updateError };
    }

    console.log('✅ Ticket status updated successfully');
    return { error: null };
  } catch (error: any) {
    console.error('❌ Exception in updateTicketStatus:', error);
    return { error };
  }
}

/**
 * Get unread message count for a ticket
 */
export async function getTicketUnreadCount(
  ticketId: string,
  userId: string
): Promise<{ count: number; error: any }> {
  try {
    const { data: count, error } = await supabase.rpc('get_ticket_unread_count', {
      p_ticket_id: ticketId,
      p_user_id: userId,
    });

    if (error) {
      console.error('Error fetching unread count:', error);
      // Fallback to direct query
      const { count: directCount, error: countError } = await supabase
        .from('support_messages')
        .select('*', { count: 'exact', head: true })
        .eq('ticket_id', ticketId)
        .eq('is_admin', true)
        .eq('is_read', false);

      if (countError) {
        return { count: 0, error: countError };
      }
      return { count: directCount || 0, error: null };
    }

    return { count: count || 0, error: null };
  } catch (error: any) {
    console.error('Exception fetching unread count:', error);
    return { count: 0, error };
  }
}

export type SupportChatRole = 'customer' | 'agent';

export type RemoteTypingCallback = (p: { name: string; active: boolean }) => void;

export function attachSupportTypingBridge(
  ticketId: string,
  viewerRole: SupportChatRole,
  onRemote: RemoteTypingCallback
): {
  sendTyping: (displayName: string, state: 'start' | 'stop') => Promise<void>;
  cleanup: () => void;
} {
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


