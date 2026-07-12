import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  variant?: 'default' | 'success' | 'warning' | 'error'
}
const variants = {
  default: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  success: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  warning: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
  error: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
}
export function Badge({ children, variant = 'default' }: Props) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${variants[variant]}`}>
      {children}
    </span>
  )
}
