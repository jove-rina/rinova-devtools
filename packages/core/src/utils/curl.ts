import type { NetworkEntry } from '../types'

const SHELL_UNSAFE = /[^\w@%+=:,./-]/

export function shellQuote(value: string): string {
  if (value === '') return "''"
  if (!SHELL_UNSAFE.test(value)) return value
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** 把一条网络记录转成可直接粘到终端的 cURL */
export function toCurl(entry: Pick<NetworkEntry, 'method' | 'url' | 'requestHeaders' | 'requestBody'>): string {
  const parts = [`curl ${shellQuote(entry.url)}`]
  if (entry.method && entry.method !== 'GET') parts.push(`-X ${entry.method}`)

  for (const [key, value] of Object.entries(entry.requestHeaders ?? {})) {
    if (!value) continue
    parts.push(`-H ${shellQuote(`${key}: ${value}`)}`)
  }

  if (entry.requestBody) {
    const isForm = Object.keys(entry.requestHeaders ?? {}).some(
      (key) => key.toLowerCase() === 'content-type' && /x-www-form-urlencoded/i.test(entry.requestHeaders[key])
    )
    parts.push(`${isForm ? '--data' : '--data-raw'} ${shellQuote(entry.requestBody)}`)
  }

  return parts.join(' \\\n  ')
}
