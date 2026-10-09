import { useRef, useState, useCallback } from 'react'
import { Camera, RefreshCw, Check } from 'lucide-react'

interface Props {
  onCapture: (blob: Blob) => void
}

export default function CameraCapture({ onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [captured, setCaptured] = useState<string | null>(null)
  const [error, setError] = useState('')

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
    } catch {
      setError('Camera access denied')
    }
  }, [])

  const capture = () => {
    if (!videoRef.current || !canvasRef.current) return
    canvasRef.current.width = videoRef.current.videoWidth
    canvasRef.current.height = videoRef.current.videoHeight
    const ctx = canvasRef.current.getContext('2d')
    if (!ctx) return
    ctx.drawImage(videoRef.current, 0, 0)
    const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.8)
    setCaptured(dataUrl)
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
  }

  const retake = () => {
    setCaptured(null)
    startCamera()
  }

  const confirm = async () => {
    if (!captured) return
    const res = await fetch(captured)
    const blob = await res.blob()
    onCapture(blob)
  }

  if (!navigator.mediaDevices) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        Camera not available on this device
      </div>
    )
  }

  if (!captured && !streamRef.current && !error) {
    startCamera()
  }

  return (
    <div className="space-y-3">
      <div className="relative rounded-xl overflow-hidden bg-black/40 aspect-[4/3] flex items-center justify-center">
        {error ? (
          <div className="text-sm text-destructive">{error}</div>
        ) : captured ? (
          <img src={captured} alt="Selfie" className="w-full h-full object-cover" />
        ) : (
          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>
      <div className="flex gap-2">
        {captured ? (
          <>
            <button onClick={retake} className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-border py-2 text-sm hover:bg-accent">
              <RefreshCw className="h-4 w-4" /> Retake
            </button>
            <button onClick={confirm} className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
              <Check className="h-4 w-4" /> Use Photo
            </button>
          </>
        ) : (
          <button onClick={capture} className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            <Camera className="h-4 w-4" /> Capture
          </button>
        )}
      </div>
    </div>
  )
}
