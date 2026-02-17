-- Create support chat tables
-- This includes support_tickets and support_messages tables for customer support

-- 1. Support Tickets Table
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Ticket details
  subject TEXT NOT NULL,
  status TEXT DEFAULT 'open' NOT NULL CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority TEXT DEFAULT 'normal' NOT NULL CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  category TEXT DEFAULT 'general' NOT NULL CHECK (category IN ('general', 'account', 'transaction', 'technical', 'complaint', 'other')),
  
  -- Assignment
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Admin user assigned to ticket
  
  -- Timestamps
  last_message_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  resolved_at TIMESTAMPTZ
);

-- Create indexes for support_tickets
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id 
  ON public.support_tickets(user_id);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status 
  ON public.support_tickets(status);

CREATE INDEX IF NOT EXISTS idx_support_tickets_priority 
  ON public.support_tickets(priority);

CREATE INDEX IF NOT EXISTS idx_support_tickets_category 
  ON public.support_tickets(category);

CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_to 
  ON public.support_tickets(assigned_to);

CREATE INDEX IF NOT EXISTS idx_support_tickets_last_message_at 
  ON public.support_tickets(last_message_at DESC);

-- Composite index for common admin queries
CREATE INDEX IF NOT EXISTS idx_support_tickets_status_priority 
  ON public.support_tickets(status, priority, last_message_at DESC);

-- 2. Support Messages Table
CREATE TABLE IF NOT EXISTS public.support_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Message content
  message TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT false NOT NULL, -- true if message is from admin/support staff
  
  -- Read status
  is_read BOOLEAN DEFAULT false NOT NULL,
  read_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for support_messages
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_id 
  ON public.support_messages(ticket_id);

CREATE INDEX IF NOT EXISTS idx_support_messages_user_id 
  ON public.support_messages(user_id);

CREATE INDEX IF NOT EXISTS idx_support_messages_created_at 
  ON public.support_messages(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_messages_is_read 
  ON public.support_messages(is_read) 
  WHERE is_read = false;

-- Composite index for ticket messages ordered by time
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_created 
  ON public.support_messages(ticket_id, created_at ASC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for support_tickets

-- Users can view their own tickets
CREATE POLICY "Users can view own tickets"
  ON public.support_tickets
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own tickets
CREATE POLICY "Users can insert own tickets"
  ON public.support_tickets
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own tickets (limited fields)
CREATE POLICY "Users can update own tickets"
  ON public.support_tickets
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can view all tickets
CREATE POLICY "Admins can view all tickets"
  ON public.support_tickets
  FOR SELECT
  USING (public.is_user_admin(auth.uid()));

-- Admins can update all tickets
CREATE POLICY "Admins can update all tickets"
  ON public.support_tickets
  FOR UPDATE
  USING (public.is_user_admin(auth.uid()))
  WITH CHECK (public.is_user_admin(auth.uid()));

-- Service role can do everything
CREATE POLICY "Service role can do everything on tickets"
  ON public.support_tickets
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- RLS Policies for support_messages

-- Users can view messages in their own tickets
CREATE POLICY "Users can view messages in own tickets"
  ON public.support_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets 
      WHERE support_tickets.id = support_messages.ticket_id 
      AND support_tickets.user_id = auth.uid()
    )
  );

-- Users can insert messages in their own tickets
CREATE POLICY "Users can insert messages in own tickets"
  ON public.support_messages
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.support_tickets 
      WHERE support_tickets.id = support_messages.ticket_id 
      AND support_tickets.user_id = auth.uid()
    )
  );

-- Users can update their own messages (to mark as read)
CREATE POLICY "Users can update own messages"
  ON public.support_messages
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can view all messages
CREATE POLICY "Admins can view all messages"
  ON public.support_messages
  FOR SELECT
  USING (public.is_user_admin(auth.uid()));

-- Admins can insert messages in any ticket
CREATE POLICY "Admins can insert messages"
  ON public.support_messages
  FOR INSERT
  WITH CHECK (public.is_user_admin(auth.uid()));

-- Admins can update all messages
CREATE POLICY "Admins can update all messages"
  ON public.support_messages
  FOR UPDATE
  USING (public.is_user_admin(auth.uid()))
  WITH CHECK (public.is_user_admin(auth.uid()));

-- Service role can do everything
CREATE POLICY "Service role can do everything on messages"
  ON public.support_messages
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- Function to automatically update updated_at timestamp for tickets
CREATE OR REPLACE FUNCTION public.update_support_tickets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  
  -- If status changed to 'resolved', set resolved_at
  IF NEW.status = 'resolved' AND (OLD.status IS NULL OR OLD.status != 'resolved') THEN
    NEW.resolved_at = NOW();
  END IF;
  
  -- If status changed from 'resolved' to something else, clear resolved_at
  IF NEW.status != 'resolved' AND OLD.status = 'resolved' THEN
    NEW.resolved_at = NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on ticket update
CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_support_tickets_updated_at();

-- Function to automatically update updated_at timestamp for messages
CREATE OR REPLACE FUNCTION public.update_support_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  
  -- If is_read changed to true, set read_at
  IF NEW.is_read = true AND (OLD.is_read IS NULL OR OLD.is_read = false) THEN
    NEW.read_at = NOW();
  END IF;
  
  -- If is_read changed to false, clear read_at
  IF NEW.is_read = false AND OLD.is_read = true THEN
    NEW.read_at = NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on message update
CREATE TRIGGER update_support_messages_updated_at
  BEFORE UPDATE ON public.support_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_support_messages_updated_at();

-- Function to update ticket's last_message_at when a message is created
CREATE OR REPLACE FUNCTION public.update_ticket_last_message_at()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.support_tickets
  SET last_message_at = NEW.created_at,
      updated_at = NOW()
  WHERE id = NEW.ticket_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update ticket's last_message_at when message is inserted
CREATE TRIGGER update_ticket_last_message_at
  AFTER INSERT ON public.support_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ticket_last_message_at();

-- Function to get or create a support ticket
CREATE OR REPLACE FUNCTION public.get_or_create_support_ticket(
  p_user_id UUID,
  p_subject TEXT DEFAULT 'General Inquiry',
  p_category TEXT DEFAULT 'general'
)
RETURNS UUID AS $$
DECLARE
  v_ticket_id UUID;
BEGIN
  -- Try to find an open ticket for the user
  SELECT id INTO v_ticket_id
  FROM public.support_tickets
  WHERE user_id = p_user_id
    AND status IN ('open', 'in_progress')
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- If no open ticket found, create a new one
  IF v_ticket_id IS NULL THEN
    INSERT INTO public.support_tickets (
      user_id,
      subject,
      category,
      status,
      priority
    ) VALUES (
      p_user_id,
      p_subject,
      p_category,
      'open',
      'normal'
    )
    RETURNING id INTO v_ticket_id;
  END IF;
  
  RETURN v_ticket_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark messages as read for a ticket
CREATE OR REPLACE FUNCTION public.mark_ticket_messages_as_read(
  p_ticket_id UUID,
  p_user_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Mark all unread messages in the ticket as read (only non-admin messages for users)
  UPDATE public.support_messages
  SET is_read = true,
      read_at = NOW(),
      updated_at = NOW()
  WHERE ticket_id = p_ticket_id
    AND is_read = false
    AND is_admin = true  -- Users mark admin messages as read
    AND EXISTS (
      SELECT 1 FROM public.support_tickets 
      WHERE support_tickets.id = support_messages.ticket_id 
      AND support_tickets.user_id = p_user_id
    );
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get unread message count for a ticket (for users)
CREATE OR REPLACE FUNCTION public.get_ticket_unread_count(
  p_ticket_id UUID,
  p_user_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.support_messages
  WHERE ticket_id = p_ticket_id
    AND is_read = false
    AND is_admin = true  -- Users count unread admin messages
    AND EXISTS (
      SELECT 1 FROM public.support_tickets 
      WHERE support_tickets.id = support_messages.ticket_id 
      AND support_tickets.user_id = p_user_id
    );
  
  RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_or_create_support_ticket(UUID, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_ticket_messages_as_read(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ticket_unread_count(UUID, UUID) TO authenticated;

-- Add comments
COMMENT ON TABLE public.support_tickets IS 'Stores support tickets for customer service';
COMMENT ON COLUMN public.support_tickets.user_id IS 'User who created the ticket';
COMMENT ON COLUMN public.support_tickets.status IS 'Ticket status: open, in_progress, resolved, or closed';
COMMENT ON COLUMN public.support_tickets.priority IS 'Ticket priority: low, normal, high, or urgent';
COMMENT ON COLUMN public.support_tickets.category IS 'Ticket category: general, account, transaction, technical, complaint, or other';
COMMENT ON COLUMN public.support_tickets.assigned_to IS 'Admin user assigned to handle the ticket';
COMMENT ON COLUMN public.support_tickets.last_message_at IS 'Timestamp of the last message in the ticket';
COMMENT ON TABLE public.support_messages IS 'Stores messages within support tickets';
COMMENT ON COLUMN public.support_messages.ticket_id IS 'References support_tickets.id';
COMMENT ON COLUMN public.support_messages.is_admin IS 'True if message is from admin/support staff, false if from user';
COMMENT ON COLUMN public.support_messages.is_read IS 'Whether the message has been read';
COMMENT ON FUNCTION public.get_or_create_support_ticket IS 'Get existing open ticket or create a new one for a user';
COMMENT ON FUNCTION public.mark_ticket_messages_as_read IS 'Mark all unread admin messages in a ticket as read';
COMMENT ON FUNCTION public.get_ticket_unread_count IS 'Get count of unread admin messages in a ticket';
















