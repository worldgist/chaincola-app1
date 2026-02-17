import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('is_admin')
      .eq('user_id', user.id)
      .single();

    if (!profile?.is_admin) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // Get session for access token
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Session expired' },
        { status: 401 }
      );
    }

    // Add timeout to fetch request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

    let response: Response;
    try {
      response = await fetch(`${SUPABASE_URL}/functions/v1/admin-treasury`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || '',
        },
        body: JSON.stringify({ action }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      // Handle timeout errors
      if (fetchError.name === 'AbortError' || fetchError.message?.includes('timeout') || fetchError.message?.includes('aborted')) {
        console.error('Edge Function request timed out');
        return NextResponse.json(
          { success: false, error: 'Request timeout. The treasury service may be slow. Please try again.' },
          { status: 504 }
        );
      }

      // Handle socket/network errors
      if (
        fetchError.message?.includes('fetch failed') ||
        fetchError.message?.includes('SocketError') ||
        fetchError.message?.includes('other side closed') ||
        fetchError.code === 'UND_ERR_SOCKET' ||
        fetchError.cause?.code === 'UND_ERR_SOCKET'
      ) {
        console.error('Edge Function socket error:', fetchError);
        return NextResponse.json(
          { success: false, error: 'Connection error. The treasury service connection was closed unexpectedly. Please try again.' },
          { status: 503 }
        );
      }

      // Handle network errors
      if (
        fetchError.message?.includes('Failed to fetch') ||
        fetchError.message?.includes('Network request failed') ||
        fetchError.message?.toLowerCase().includes('network')
      ) {
        console.error('Edge Function network error:', fetchError);
        return NextResponse.json(
          { success: false, error: 'Network error. Please check your internet connection and try again.' },
          { status: 503 }
        );
      }

      // Re-throw other errors
      throw fetchError;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Edge Function error:', response.status, errorText);
      try {
        const errorData = JSON.parse(errorText);
        return NextResponse.json(
          { success: false, error: errorData.error || errorText },
          { status: response.status }
        );
      } catch {
        return NextResponse.json(
          { success: false, error: errorText || 'Edge Function error' },
          { status: response.status }
        );
      }
    }

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    console.error('API route error:', error);
    
    // Handle specific error types
    if (error.name === 'AbortError' || error.message?.includes('timeout')) {
      return NextResponse.json(
        { success: false, error: 'Request timeout. Please try again.' },
        { status: 504 }
      );
    }

    if (
      error.message?.includes('fetch failed') ||
      error.message?.includes('SocketError') ||
      error.message?.includes('other side closed') ||
      error.code === 'UND_ERR_SOCKET' ||
      error.cause?.code === 'UND_ERR_SOCKET'
    ) {
      return NextResponse.json(
        { success: false, error: 'Connection error. The service connection was closed unexpectedly. Please try again.' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('is_admin')
      .eq('user_id', user.id)
      .single();

    if (!profile?.is_admin) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Get session for access token
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Session expired' },
        { status: 401 }
      );
    }

    // Add timeout to fetch request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

    let response: Response;
    try {
      response = await fetch(`${SUPABASE_URL}/functions/v1/admin-treasury`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      // Handle timeout errors
      if (fetchError.name === 'AbortError' || fetchError.message?.includes('timeout') || fetchError.message?.includes('aborted')) {
        console.error('Edge Function request timed out');
        return NextResponse.json(
          { success: false, error: 'Request timeout. The treasury service may be slow. Please try again.' },
          { status: 504 }
        );
      }

      // Handle socket/network errors
      if (
        fetchError.message?.includes('fetch failed') ||
        fetchError.message?.includes('SocketError') ||
        fetchError.message?.includes('other side closed') ||
        fetchError.code === 'UND_ERR_SOCKET' ||
        fetchError.cause?.code === 'UND_ERR_SOCKET'
      ) {
        console.error('Edge Function socket error:', fetchError);
        return NextResponse.json(
          { success: false, error: 'Connection error. The treasury service connection was closed unexpectedly. Please try again.' },
          { status: 503 }
        );
      }

      // Handle network errors
      if (
        fetchError.message?.includes('Failed to fetch') ||
        fetchError.message?.includes('Network request failed') ||
        fetchError.message?.toLowerCase().includes('network')
      ) {
        console.error('Edge Function network error:', fetchError);
        return NextResponse.json(
          { success: false, error: 'Network error. Please check your internet connection and try again.' },
          { status: 503 }
        );
      }

      // Re-throw other errors
      throw fetchError;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Edge Function error:', response.status, errorText);
      try {
        const errorData = JSON.parse(errorText);
        return NextResponse.json(
          { success: false, error: errorData.error || errorText },
          { status: response.status }
        );
      } catch {
        return NextResponse.json(
          { success: false, error: errorText || 'Edge Function error' },
          { status: response.status }
        );
      }
    }

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    console.error('API route error:', error);
    
    // Handle specific error types
    if (error.name === 'AbortError' || error.message?.includes('timeout')) {
      return NextResponse.json(
        { success: false, error: 'Request timeout. Please try again.' },
        { status: 504 }
      );
    }

    if (
      error.message?.includes('fetch failed') ||
      error.message?.includes('SocketError') ||
      error.message?.includes('other side closed') ||
      error.code === 'UND_ERR_SOCKET' ||
      error.cause?.code === 'UND_ERR_SOCKET'
    ) {
      return NextResponse.json(
        { success: false, error: 'Connection error. The service connection was closed unexpectedly. Please try again.' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
