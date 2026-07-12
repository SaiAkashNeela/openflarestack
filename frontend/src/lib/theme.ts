export function getTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'light'
  return (localStorage.getItem('theme') as 'dark' | 'light') ?? 'light'
}

export function applyTheme(theme: 'dark' | 'light') {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  localStorage.setItem('theme', theme)
}
