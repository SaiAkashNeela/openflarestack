// ponytail: crypto.randomUUID() is native — no nanoid dep needed
export function nanoid(): string {
  return crypto.randomUUID()
}
