'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

/**
 * Puerta de las páginas de admin, en un solo lugar.
 * Sin sesión manda a /login; con sesión pero sin rol editor manda al perfil.
 */
export function useEditorGate() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [isEditor, setIsEditor] = useState(false)
  const [editorId, setEditorId] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      const { data: perfil } = await supabase
        .from('perfiles')
        .select('rol')
        .eq('id', user.id)
        .single()
      if (perfil?.rol !== 'editor') {
        router.push('/mi-tlacuilo')
        return
      }
      if (!vivo) return
      setEditorId(user.id)
      setIsEditor(true)
      setLoading(false)
    }
    check()
    return () => { vivo = false }
  }, [router])

  return { loading, isEditor, editorId }
}

/** Token de sesión para llamar a las rutas de admin. */
export async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('sin sesión')
  return {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  }
}
