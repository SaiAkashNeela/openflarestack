const ALLOWED_UPLOAD_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
])

const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.ps1', '.js', '.mjs', '.html', '.htm', '.svg',
])

export function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'file'
  return base.replace(/[^\w.\-() ]+/g, '_').slice(0, 200) || 'file'
}

export function validateUpload(file: File): string | null {
  if (file.size <= 0) return 'empty file'
  if (file.size > 10_000_000) return 'file too large'

  const ext = file.name.includes('.') ? `.${file.name.split('.').pop()?.toLowerCase()}` : ''
  if (ext && BLOCKED_EXTENSIONS.has(ext)) return 'file type not allowed'

  const type = (file.type || '').toLowerCase()
  if (type && !ALLOWED_UPLOAD_TYPES.has(type)) return 'file type not allowed'

  return null
}
