interface Props {
  name: string
  src?: string | null
  size?: 'sm' | 'md' | 'lg'
}
const sizes = { sm: 'w-7 h-7 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-12 h-12 text-base' }
const colors = ['bg-violet-500','bg-blue-500','bg-green-500','bg-orange-500','bg-pink-500']

export function Avatar({ name, src, size = 'md' }: Props) {
  const color = colors[name.charCodeAt(0) % colors.length]!
  if (src) return <img src={src} className={`${sizes[size]} rounded-full object-cover`} alt={name} />
  return (
    <span className={`${sizes[size]} ${color} rounded-full flex items-center justify-center font-semibold text-white shrink-0`}>
      {name[0]?.toUpperCase()}
    </span>
  )
}
