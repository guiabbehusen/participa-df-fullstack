import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'

export function OfflineBanner() {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  if (online) return null

  return (
    <div className="mx-auto mb-4 flex max-w-5xl items-start gap-2 rounded-xl border border-[rgba(var(--c-warning),0.40)] bg-[rgba(var(--c-warning),0.12)] px-4 py-3 text-sm text-[rgb(var(--c-text))]">
      <WifiOff className="mt-0.5 h-4 w-4" aria-hidden="true" />
      <div className="leading-relaxed">
        <p className="font-semibold">Você está offline.</p>
        <p className="text-[rgba(var(--c-text),0.80)]">
          Você ainda pode preencher o formulário. Se o envio falhar, tente novamente quando reconectar.
        </p>
      </div>
    </div>
  )
}
