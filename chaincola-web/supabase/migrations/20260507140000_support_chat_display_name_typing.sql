-- Per-message display label + saved customer name on ticket for live chat UI.

ALTER TABLE public.support_messages
  ADD COLUMN IF NOT EXISTS sender_display_name TEXT;

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS customer_chat_display_name TEXT;

COMMENT ON COLUMN public.support_messages.sender_display_name IS 'Label shown in chat (e.g. Mary, Support Agent).';
COMMENT ON COLUMN public.support_tickets.customer_chat_display_name IS 'Customer-chosen name for this ticket; shown on new messages until changed.';
