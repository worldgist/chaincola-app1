import { createClient } from '@/lib/supabase/client';

export type SupportQuickTopic = {
  id: string;
  label: string;
  prompt: string;
  autoReply: string;
};

/** Used if Supabase fails or returns no rows */
export const SUPPORT_QUICK_TOPICS_FALLBACK: SupportQuickTopic[] = [
  {
    id: 'frozen',
    label: 'Frozen account',
    prompt: 'I need help with a frozen or restricted account.',
    autoReply:
      'Thanks for letting us know. A support agent will review your account. You may be asked to verify your identity. Please keep details in this chat only and avoid opening duplicate tickets.',
  },
  {
    id: 'withdrawal',
    label: 'Withdrawal issues',
    prompt: 'I need help with a withdrawal (delay, failed payout, or missing funds).',
    autoReply:
      'We have noted a withdrawal-related request. When an agent joins, share your bank name and the approximate time of the withdrawal if you can. They will check payout and transaction status on our side.',
  },
  {
    id: 'login',
    label: 'Login / access',
    prompt: 'I cannot sign in or I am locked out of my account.',
    autoReply:
      'For sign-in problems, try "Forgot password" on the sign-in screen first. If that does not work, stay in this chat — an agent can help confirm the email or phone on your profile.',
  },
  {
    id: 'other',
    label: 'Something else',
    prompt: 'I have a different question for support.',
    autoReply:
      'No problem. Describe your issue in your next message and our team will pick it up here as soon as they are available.',
  },
];

type Row = {
  slug: string;
  label: string;
  prompt: string;
  auto_reply: string;
};

export async function fetchSupportQuickTopics(): Promise<{
  topics: SupportQuickTopic[];
  error: Error | null;
}> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('support_chat_quick_topics')
      .select('slug,label,prompt,auto_reply')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      return { topics: SUPPORT_QUICK_TOPICS_FALLBACK, error: new Error(error.message) };
    }
    const rows = (data || []) as Row[];
    if (rows.length === 0) {
      return { topics: SUPPORT_QUICK_TOPICS_FALLBACK, error: null };
    }
    const topics = rows.map((r) => ({
      id: r.slug,
      label: r.label,
      prompt: r.prompt,
      autoReply: r.auto_reply,
    }));
    return { topics, error: null };
  } catch (e) {
    return {
      topics: SUPPORT_QUICK_TOPICS_FALLBACK,
      error: e instanceof Error ? e : new Error(String(e)),
    };
  }
}
