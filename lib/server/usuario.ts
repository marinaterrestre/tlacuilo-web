import { NextRequest } from 'next/server'
import { createClient, SupabaseClient, User } from '@supabase/supabase-js'

/**
 * Igual que requireEditor pero para el propio lector: valida su sesión y
 * devuelve un cliente con service role. Los topes (cuántos días se puede
 * extender, qué préstamos son suyos) se aplican SIEMPRE aquí en el servidor,
 * nunca confiando en lo que mande el navegador.
 */
export type UsuarioCtx = { usuario: User; service: SupabaseClient }
export type UsuarioError = { error: string; status: number }

export async function requireUsuario(req: NextRequest): Promise<UsuarioCtx | UsuarioError> {
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

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
  return { usuario: user, service }
}

export function esErrorUsuario(x: UsuarioCtx | UsuarioError): x is UsuarioError {
  return (x as UsuarioError).error !== undefined
}
