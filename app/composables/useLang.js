export const useLang = () => {
  const lang = useState('lang', () =>
    (process.client && localStorage.getItem('sys-lang')) || 'en'
  )
  const toggle = () => {
    lang.value = lang.value === 'de' ? 'en' : 'de'
    if (process.client) localStorage.setItem('sys-lang', lang.value)
  }
  return { lang, toggle }
}
