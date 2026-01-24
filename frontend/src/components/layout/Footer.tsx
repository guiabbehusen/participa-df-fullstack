export function Footer() {
  return (
    <footer className="mt-10 border-t border-[rgba(var(--c-border),0.70)] bg-[rgba(var(--c-surface),0.75)] backdrop-blur-md">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <p className="text-sm text-[rgba(var(--c-text),0.80)]">
          Participa DF · Ouvidoria — versão PWA acessível para registro de manifestações (texto, áudio, imagem e vídeo), com emissão automática de protocolo.
        </p>
        <p className="mt-2 text-xs text-[rgba(var(--c-text),0.65)]">
          Dica: use o assistente IZA (canto inferior direito) para te guiar no preenchimento, inclusive por voz.
        </p>
      </div>
    </footer>
  )
}
