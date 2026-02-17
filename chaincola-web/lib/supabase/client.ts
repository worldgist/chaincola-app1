import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Validate environment variables
  if (!supabaseUrl || !supabaseAnonKey) {
    const missingVars = []
    if (!supabaseUrl) missingVars.push('NEXT_PUBLIC_SUPABASE_URL')
    if (!supabaseAnonKey) missingVars.push('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    
    console.error('❌ Missing Supabase environment variables:', missingVars.join(', '))
    console.error('💡 Make sure your .env.local file contains:')
    console.error('   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co')
    console.error('   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key')
    console.error('💡 Then restart your Next.js development server')
    throw new Error(`Missing Supabase environment variables: ${missingVars.join(', ')}`)
  }

  // Validate URL format
  if (!supabaseUrl.startsWith('http://') && !supabaseUrl.startsWith('https://')) {
    console.error('❌ Invalid Supabase URL format:', supabaseUrl)
    console.error('💡 URL should start with https:// (e.g., https://your-project.supabase.co)')
    throw new Error('Invalid Supabase URL format. URL must start with http:// or https://')
  }

  return createBrowserClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      // Add custom fetch with timeout and better error handling
      global: {
        fetch: async (url, options = {}) => {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout
          
          try {
            const response = await fetch(url, {
              ...options,
              signal: controller.signal,
            })
            clearTimeout(timeoutId)
            return response
          } catch (error: any) {
            clearTimeout(timeoutId)
            
            // Provide more informative error messages for common network issues
            if (error?.name === 'AbortError' || error?.message?.includes('aborted')) {
              const timeoutError = new Error('Request timeout: The Supabase request took too long. Please check your internet connection and try again.')
              timeoutError.name = 'TimeoutError'
              throw timeoutError
            }
            
            // Handle network errors
            if (
              error?.message === 'Failed to fetch' || 
              error?.name === 'TypeError' ||
              error?.message?.includes('NetworkError') ||
              error?.message?.includes('Network request failed') ||
              error?.message?.includes('ERR_NETWORK') ||
              error?.message?.includes('ERR_INTERNET_DISCONNECTED')
            ) {
              // Log diagnostic information
              console.error('🌐 Network Error Details:')
              console.error('   URL:', url)
              console.error('   Supabase URL configured:', supabaseUrl ? 'Yes' : 'No')
              console.error('   Supabase URL:', supabaseUrl || 'NOT SET')
              console.error('   Error name:', error?.name)
              console.error('   Error message:', error?.message)
              console.error('   Error cause:', error?.cause)
              
              // Check if it's a CORS issue
              if (url && typeof url === 'string' && url.includes(supabaseUrl || '')) {
                console.error('💡 Possible issues:')
                console.error('   1. Check your internet connection')
                console.error('   2. Verify Supabase service is accessible:', supabaseUrl)
                console.error('   3. Check browser console for CORS errors')
                console.error('   4. Ensure environment variables are loaded (restart dev server)')
              }
              
              const networkError = new Error(
                'Network error: Unable to connect to Supabase. ' +
                'Please check your internet connection and ensure Supabase is accessible. ' +
                'If the issue persists, verify NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set correctly in your .env.local file.'
              )
              networkError.name = 'NetworkError'
              // Preserve original error for debugging
              ;(networkError as any).originalError = error
              ;(networkError as any).url = url
              ;(networkError as any).supabaseUrl = supabaseUrl
              throw networkError
            }
            
            // Re-throw other errors as-is
            throw error
          }
        },
        headers: {
          'x-client-info': 'chaincola-web',
        },
      },
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    }
  )
}

/**
 * Test Supabase connection
 * Useful for debugging connection issues
 */
export async function testSupabaseConnection(): Promise<{
  success: boolean
  error?: string
  details?: {
    url: string
    urlReachable: boolean
    environmentVariablesSet: boolean
    responseTime?: number
  }
}> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const details = {
    url: supabaseUrl || 'NOT SET',
    urlReachable: false,
    environmentVariablesSet: !!(supabaseUrl && supabaseAnonKey),
    responseTime: undefined as number | undefined,
  }

  // Check environment variables
  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      success: false,
      error: 'Environment variables not set',
      details,
    }
  }

  // Test basic connectivity to Supabase URL
  try {
    const startTime = Date.now()
    const testUrl = `${supabaseUrl}/rest/v1/`
    const response = await fetch(testUrl, {
      method: 'HEAD',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`,
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    })
    const responseTime = Date.now() - startTime
    details.responseTime = responseTime
    details.urlReachable = response.status !== 0 // Status 0 usually means network error

    if (!response.ok && response.status !== 401 && response.status !== 404) {
      return {
        success: false,
        error: `Supabase returned status ${response.status}`,
        details,
      }
    }

    return {
      success: true,
      details,
    }
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Failed to connect to Supabase',
      details: {
        ...details,
        urlReachable: false,
      },
    }
  }
}



















