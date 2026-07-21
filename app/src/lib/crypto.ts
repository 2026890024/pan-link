/**
 * 密码安全工具 - SHA-256 哈希 + 随机盐值
 * 格式: salt:hash
 */
function generateSalt(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function hashPassword(password: string, salt?: string): Promise<string> {
  const encoder = new TextEncoder()
  const actualSalt = salt || generateSalt()
  const data = encoder.encode(actualSalt + password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return `${actualSalt}:${hash}`
}

export async function verifyPassword(inputPassword: string, storedHash: string): Promise<boolean> {
  // 兼容旧格式（无 salt 的纯 hash）
  if (!storedHash.includes(':')) {
    const inputHash = (await hashPassword(inputPassword, '')).split(':')[1]
    return inputHash === storedHash
  }
  const [salt] = storedHash.split(':')
  const inputFull = await hashPassword(inputPassword, salt)
  return inputFull === storedHash
}
