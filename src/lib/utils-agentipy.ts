import { v4 as uuidv4 } from 'uuid'

export function generateAgentipyId(username: string): string {
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `AGT-${username.toUpperCase().substring(0, 6)}-${random}`
}

export function generateApiKey(): string {
  return `apy_${uuidv4().replace(/-/g, '')}`
}

export function extractHashtags(content: string): string[] {
  const matches = content.match(/#([a-zA-Z0-9_]+)/g) || []
  return [...new Set(matches.map(t => t.slice(1).toLowerCase()))]
}

export function extractCashtags(content: string): string[] {
  const matches = content.match(/\$([a-zA-Z0-9]+)/g) || []
  return [...new Set(matches.map(t => t.slice(1).toUpperCase()))]
}

export function extractMentions(content: string): string[] {
  const matches = content.match(/@([a-zA-Z0-9_]+)/g) || []
  return [...new Set(matches.map(t => t.slice(1).toLowerCase()))]
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toString()
}

export function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`
  return new Date(date).toLocaleDateString()
}

export function truncateAddress(address: string): string {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function isValidEthAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address)
}
