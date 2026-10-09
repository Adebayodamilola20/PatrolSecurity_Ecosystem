import { useEffect, useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'

function initials(name?: string) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}

/** Round profile picture, falling back to initials. */
export function Avatar({ name, src: incoming, size = 48 }: { name?: string; src?: string | null; size?: number }) {
  // Each list refresh re-signs the URL with a new token. Keep the one already
  // loaded while it points at the same photo, so the image is not re-fetched.
  const [src, setSrc] = useState(incoming)
  useEffect(() => {
    setSrc((prev) => (prev && incoming && prev.split('?')[0] === incoming.split('?')[0] ? prev : incoming))
  }, [incoming])
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [src])
  return (
    <div
      className="shrink-0 overflow-hidden rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {src && !broken ? (
        <img src={src} alt={name ?? ''} className="h-full w-full object-cover" onError={() => setBroken(true)} />
      ) : (
        initials(name)
      )}
    </div>
  )
}

const MAX_BYTES = 5 * 1024 * 1024

/**
 * Circle the admin clicks to choose a picture. Shows the chosen file, or the
 * current photo, or a camera prompt. Reports the picked file (or null when
 * cleared) to the parent, which uploads it on save.
 */
export function PhotoPicker({
  name,
  currentUrl,
  file,
  onChange,
  onError,
  size = 96,
}: {
  name?: string
  currentUrl?: string | null
  file: File | null
  onChange: (file: File | null) => void
  onError?: (message: string) => void
  size?: number
}) {
  const input = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!file) return setPreview(null)
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const shown = preview ?? currentUrl ?? null

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="group relative rounded-full ring-2 ring-border hover:ring-primary transition"
        style={{ width: size, height: size }}
        aria-label="Choose a photo"
      >
        {shown ? (
          <Avatar name={name} src={shown} size={size} />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Camera className="h-6 w-6" />
            <span className="mt-1 text-[10px] font-medium">Add photo</span>
          </div>
        )}
        {shown && (
          <span className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
            <Camera className="h-3.5 w-3.5" />
          </span>
        )}
      </button>
      {file && (
        <button type="button" onClick={() => onChange(null)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <X className="h-3 w-3" /> Remove
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0] ?? null
          e.target.value = ''
          if (!picked) return
          if (!picked.type.startsWith('image/')) return onError?.('Choose an image file.')
          if (picked.size > MAX_BYTES) return onError?.('That photo is larger than 5 MB.')
          onChange(picked)
        }}
      />
    </div>
  )
}
