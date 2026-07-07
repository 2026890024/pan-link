/**
 * 认证 Hook - Supabase Auth + 本地回退
 * 当 Supabase 未配置时，使用本地配置的账号密码
 */
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { AUTH_CONFIG } from '@/config/auth'
import { isSupabaseConfigured } from '@/services/dataService'
import { fastHash, fastVerify } from '@/lib/crypto'
import type { User } from '@supabase/supabase-js'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [localAuthed, setLocalAuthed] = useState(() => {
    try { return sessionStorage.getItem('admin_authed') === 'true' } catch { return false }
  })

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false)
      return
    }

    // 监听 Supabase Auth 状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null)
      setLoading(false)
    })

    // 初始加载
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null)
      setLoading(false)
    })

    return () => { subscription.unsubscribe() }
  }, [])

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    if (!isSupabaseConfigured()) {
      // 本地模式：优先使用 localStorage 中保存的凭证（哈希），回退到 AUTH_CONFIG（明文）
      let authUsername = AUTH_CONFIG.username
      let authPasswordHash: string | null = fastHash(AUTH_CONFIG.password)
      
      try {
        const stored = localStorage.getItem('admin_auth_config')
        if (stored) {
          const parsed = JSON.parse(stored)
          if (parsed.username) authUsername = parsed.username
          // 优先使用 passwordHash（安全），兼容旧的 password 字段
          if (parsed.passwordHash) {
            authPasswordHash = parsed.passwordHash
          } else if (parsed.password) {
            // 兼容旧格式：明文密码（首次升级自动哈希）
            authPasswordHash = fastHash(parsed.password)
            // 自动升级存储格式
            try {
              localStorage.setItem('admin_auth_config', JSON.stringify({
                username: authUsername,
                passwordHash: authPasswordHash,
              }))
            } catch { /* ignore */ }
          }
        }
      } catch { /* ignore */ }
      
      // 使用哈希验证
      if (username === authUsername && fastVerify(password, authPasswordHash || '')) {
        setLocalAuthed(true)
        sessionStorage.setItem('admin_authed', 'true')
        return true
      }
      return false
    }

    // Supabase 模式
    const { error } = await supabase.auth.signInWithPassword({
      email: username.includes('@') ? username : `${username}@admin.local`,
      password,
    })
    return !error
  }, [])

  const logout = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setLocalAuthed(false)
      sessionStorage.removeItem('admin_authed')
      return
    }
    await supabase.auth.signOut()
  }, [])

  const isAuthenticated = isSupabaseConfigured() ? !!user : localAuthed

  return {
    user,
    loading,
    isAuthenticated,
    login,
    logout,
    isSupabaseMode: isSupabaseConfigured(),
  }
}
