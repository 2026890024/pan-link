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
    // ========== 优先检查本地默认管理员凭证（所有模式都支持）==========
    let authUsername = AUTH_CONFIG.username
    let authPasswordHash: string | null = fastHash(AUTH_CONFIG.password)
    
    try {
      const stored = localStorage.getItem('admin_auth_config')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed.username) authUsername = parsed.username
        if (parsed.passwordHash) {
          authPasswordHash = parsed.passwordHash
        } else if (parsed.password) {
          authPasswordHash = fastHash(parsed.password)
          try {
            localStorage.setItem('admin_auth_config', JSON.stringify({
              username: authUsername,
              passwordHash: authPasswordHash,
            }))
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
    
    // 先尝试本地凭证验证（默认管理员账号在所有模式下都可用）
    if (username === authUsername && fastVerify(password, authPasswordHash || '')) {
      setLocalAuthed(true)
      sessionStorage.setItem('admin_authed', 'true')
      return true
    }

    // 本地模式：本地验证失败就直接返回
    if (!isSupabaseConfigured()) {
      return false
    }

    // Supabase 模式：本地凭证不匹配时，尝试 Supabase Auth
    const { error } = await supabase.auth.signInWithPassword({
      email: username.includes('@') ? username : `${username}@admin.local`,
      password,
    })
    return !error
  }, [])

  const logout = useCallback(async () => {
    // 清除本地认证（所有模式）
    setLocalAuthed(false)
    sessionStorage.removeItem('admin_authed')
    // 如果是 Supabase 模式，同时登出 Supabase
    if (isSupabaseConfigured()) {
      await supabase.auth.signOut()
    }
  }, [])

  // 本地凭证认证在所有模式下都生效
  const isAuthenticated = localAuthed || (isSupabaseConfigured() && !!user)

  return {
    user,
    loading,
    isAuthenticated,
    login,
    logout,
    isSupabaseMode: isSupabaseConfigured(),
  }
}
