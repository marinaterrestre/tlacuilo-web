import { NextRequest } from 'next/server'
import { createClient, SupabaseClient, User } from '@supabase/supabase-js'

/**
 * Puerta única de las rutas de admin.
 * Verifica que quien llama traiga sesión válida y rol editor, y devuelve
 * un cliente con service role para poder leer correos y escribir sin RLS.
 */
export type EditorCtx = {
  editor: User
  service: SupabaseClient
}

export type EditorError = { error: string; status: number }

export async function requireEditor(req: NextRequest): Promise<EditorCtx | EditorError> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return { error: 'sin token', status: 401 }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: 'falta SUPABASE_SERVICE_ROLE_KEY', status: 500 }
  }

  const authed = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user }, error } = await authed.auth.getUser(token)
  if (error || !user) return { error: 'sesión inválida', status: 401 }

  const { data: perfil, error: perfilErr } = await authed
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .single()
  if (perfilErr) return { error: 'no pude leer tu perfil: ' + perfilErr.message, status: 500 }
  if (perfil?.rol !== 'editor') {
    return { error: `solo editores (tu rol: ${perfil?.rol ?? 'sin perfil'})`, status: 403 }
  }

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
  return { editor: user, service }
}

export function esError(x: EditorCtx | EditorError): x is EditorError {
  return (x as EditorError).error !== undefined
}

/** Remitente de coordinación. Buzón real, las respuestas caen ahí. */
export const REMITENTE = 'Tlacuilo <tlacuilo@tlacuilo.org>'
export const SITE_URL = 'https://www.tlacuilo.org'
