import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from '../components/Modal'
import { useRecordings } from '../state/RecordingsContext'
import { formatDuration } from '../utils/format'

export default function RecordPage() {
  const navigate = useNavigate()
  const { addRecording } = useRecordings()

  const [script, setScript] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showNameModal, setShowNameModal] = useState(false)
  const [proposedName, setProposedName] = useState('')
  const [duration, setDuration] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startTimeRef = useRef<number | null>(null)
  const mimeTypeRef = useRef('audio/webm')

  const fallbackName = useMemo(() => {
    if (script.trim()) return script.trim().slice(0, 30)
    const now = new Date()
    return `Recording ${now.toLocaleString()}`
  }, [script])

  useEffect(() => {
    setProposedName(fallbackName)
  }, [fallbackName])

  useEffect(() => () => mediaRecorderRef.current?.stream.getTracks().forEach((t) => t.stop()), [])

  const startRecording = async () => {
    setError(null)
    if (!('MediaRecorder' in window)) {
      setError('Recording is not supported in this browser. Please try Safari 14.3+ or Chrome.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const options = MediaRecorder.isTypeSupported('audio/mp4')
        ? { mimeType: 'audio/mp4' }
        : undefined
      const recorder = new MediaRecorder(stream, options)
      mimeTypeRef.current = recorder.mimeType || 'audio/webm'
      chunksRef.current = []
      startTimeRef.current = Date.now()
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const elapsed = startTimeRef.current ? (Date.now() - startTimeRef.current) / 1000 : 0
        setDuration(elapsed)
        setShowNameModal(true)
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setIsRecording(true)
    } catch (err) {
      console.error(err)
      setError('Microphone access failed. Ensure the mic permission is allowed and you are on HTTPS.')
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    mediaRecorderRef.current?.stream.getTracks().forEach((t) => t.stop())
    setIsRecording(false)
  }

  const discardAndExit = () => {
    setShowNameModal(false)
    navigate('/')
  }

  const saveRecording = async () => {
    const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current })
    await addRecording({ name: proposedName || fallbackName, duration, blob, scriptText: script })
    setShowNameModal(false)
    navigate('/')
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[2fr,1fr]">
      <div className="rounded-2xl bg-white/80 p-5 shadow-md">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-wide text-slate-500">Prepare</p>
            <h2 className="text-xl font-bold text-slate-900">Paste your script</h2>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${isRecording ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
            {isRecording ? 'Recording…' : 'Idle'}
          </span>
        </div>
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          disabled={isRecording}
          className="mt-4 h-72 w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-inner"
          placeholder="Paste or type what you want to memorize. The text stays visible while you record."
        />
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            className="rounded-full px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            onClick={() => navigate('/')}
            disabled={isRecording}
          >
            Cancel
          </button>
          {!isRecording ? (
            <button
              className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
              onClick={startRecording}
            >
              Start recording
            </button>
          ) : (
            <button
              className="rounded-full bg-rose-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-500"
              onClick={stopRecording}
            >
              Stop & save
            </button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 shadow-inner">
        <h3 className="text-sm font-semibold text-slate-800">Safari note</h3>
        <p className="mt-2 text-sm text-slate-600">
          On iOS Safari, start recording after tapping the microphone permission. Keep this page open; backgrounding the app may stop the recording. Use wired or Bluetooth mics for clearer capture.
        </p>
        {isRecording && (
          <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
            Recording… {duration ? formatDuration(duration) : ''}
          </div>
        )}
      </div>

      <Modal
        open={showNameModal}
        title="Name your recording"
        onClose={discardAndExit}
        footer={
          <>
            <button
              className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              onClick={discardAndExit}
            >
              Discard
            </button>
            <button
              className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
              onClick={saveRecording}
            >
              Save & return
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="text-sm text-slate-600">Length: {formatDuration(duration)}</div>
          <label className="text-sm font-medium text-slate-700" htmlFor="rec-name">
            Recording name
          </label>
          <input
            id="rec-name"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={proposedName}
            onChange={(e) => setProposedName(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  )
}
