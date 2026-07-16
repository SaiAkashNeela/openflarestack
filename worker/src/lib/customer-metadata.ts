export type MetadataRecord = Record<string, unknown>

function isPlainObject(value: unknown): value is MetadataRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function toMetadataRecord(value: unknown): MetadataRecord {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return {}
    try {
      const parsed = JSON.parse(trimmed)
      return isPlainObject(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }

  return isPlainObject(value) ? value : {}
}

export function mergeMetadata(...values: unknown[]): MetadataRecord {
  return values.reduce<MetadataRecord>((acc, value) => Object.assign(acc, toMetadataRecord(value)), {})
}

export function extractMetadataFields(
  body: Record<string, unknown>,
  reservedKeys: string[],
): MetadataRecord {
  const reserved = new Set([
    ...reservedKeys,
    'metadata',
    'custom_attributes',
    'customAttributes',
    'attributes',
  ])

  const extras = Object.fromEntries(
    Object.entries(body).filter(([key, value]) => !reserved.has(key) && value !== undefined),
  )

  return mergeMetadata(body.metadata, body.custom_attributes, body.customAttributes, body.attributes, extras)
}
