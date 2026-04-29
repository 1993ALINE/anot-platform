import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { authAPI, visitsAPI, patientsAPI, notesAPI } from '../../services/api'

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function localDate(offsetDays = 0, fmt = 'long') {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const year  = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day   = String(d.getDate()).padStart(2, '0')
  if (fmt === 'input') return `${year}-${month}-${day}`
  if (fmt === 'short') return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

function fmtSecs(s) {
  if (!s) return '—'
  return `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`
}

function fmtTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  return `${hour > 12 ? hour - 12 : hour === 0 ? 12 : hour}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
}

function audiofmt(s) {
  if (!s || isNaN(s) || !isFinite(s)) return '00:00'
  return `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(Math.floor(s % 60)).padStart(2,'0')}`
}

const STATUS = {
  'in-progress':        { label: 'Recording',    bg: '#FCEBEB', color: '#A32D2D' },
  'upcoming':           { label: 'Upcoming',      bg: '#FAEEDA', color: '#633806' },
  'recording-uploaded': { label: 'Awaiting Note', bg: '#E6F1FB', color: '#0C447C' },
  'note-ready':         { label: 'Note Ready',    bg: '#E1F5EE', color: '#085041' },
  'done':               { label: 'Done',          bg: '#E1F5EE', color: '#085041' },
  'uploaded':           { label: 'Graded',        bg: '#E1F5EE', color: '#085041' },
  'scheduled':          { label: 'Scheduled',     bg: '#F1EFE8', color: '#5F5E5A' },
}

// ─── AUDIO PLAYER ─────────────────────────────────────────────────────────────

function AudioPlayer({ visitId, durationSecs }) {
  const [audioUrl, setAudioUrl]   = useState(null)
  const [count, setCount]         = useState(1)
  const [activeIdx, setActiveIdx] = useState(0)
  const [loading, setLoading]     = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [current, setCurrent]     = useState(0)
  const [duration, setDuration]   = useState(durationSecs || 0)
  const audioRef   = useRef(null)
  const maxTimeRef = useRef(durationSecs || 0)

  // Fetch recording count
  useEffect(() => {
    if (!visitId) return
    const token = localStorage.getItem('token')
    fetch(`http://localhost:5000/api/audio/${visitId}/count`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).then(d => { if (d.count > 0) setCount(d.count) }).catch(() => {})
  }, [visitId])

  // Fetch audio blob
  useEffect(() => {
    if (!visitId) { setLoading(false); return }
    setLoading(true)
    setAudioUrl(null)
    setCurrent(0)
    setIsPlaying(false)
    setDuration(durationSecs || 0)
    maxTimeRef.current = durationSecs || 0

    const token = localStorage.getItem('token')
    fetch(`http://localhost:5000/api/audio/${visitId}?index=${activeIdx}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => { if (res.ok) return res.blob(); throw new Error('no audio') })
      .then(blob => {
        if (blob.size === 0) throw new Error('empty')
        setAudioUrl(URL.createObjectURL(blob))
        setLoading(false)
      })
      .catch(() => setLoading(false))

    return () => {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = '' }
    }
  }, [visitId, activeIdx])

  // Attach audio events
  useEffect(() => {
    if (!audioUrl || !audioRef.current) return
    const audio = audioRef.current
    audio.src = audioUrl

    const onMeta = () => {
      const dur = audio.duration
      if (dur && isFinite(dur) && dur > 0) {
        setDuration(Math.floor(dur))
        maxTimeRef.current = Math.floor(dur)
      }
    }
    const onTime = () => {
      const cur = Math.floor(audio.currentTime)
      setCurrent(cur)
      // For webm files without metadata, track max position as duration
      if (cur > maxTimeRef.current) {
        maxTimeRef.current = cur
        setDuration(cur)
      }
    }
    const onEnded = () => {
      setIsPlaying(false)
      setCurrent(0)
      if (maxTimeRef.current > 0) setDuration(maxTimeRef.current)
    }

    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('durationchange', onMeta)
    audio.addEventListener('timeupdate',     onTime)
    audio.addEventListener('ended',          onEnded)
    audio.load()

    return () => {
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('durationchange', onMeta)
      audio.removeEventListener('timeupdate',     onTime)
      audio.removeEventListener('ended',          onEnded)
    }
  }, [audioUrl])

  const toggle = () => {
    if (!audioRef.current || !audioUrl) return
    if (isPlaying) { audioRef.current.pause(); setIsPlaying(false) }
    else           { audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {}) }
  }

  const skip = (secs) => {
    if (!audioRef.current || !audioUrl) return
    const max = maxTimeRef.current || duration || 0
    const newTime = Math.max(0, Math.min(max, audioRef.current.currentTime + secs))
    audioRef.current.currentTime = newTime
    setCurrent(Math.floor(newTime))
  }

  const seek = (e) => {
    if (!audioRef.current || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const newTime = Math.round(((e.clientX - rect.left) / rect.width) * duration)
    audioRef.current.currentTime = newTime
    setCurrent(newTime)
  }

  const canPlay  = !!audioUrl && !loading
  const progress = duration > 0 ? Math.min(100, (current / duration) * 100) : 0
  const totalStr = duration > 0 ? audiofmt(duration) : '--:--'

  return (
    <div>
      {/* Recording tabs */}
      {count > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {Array.from({ length: count }, (_, i) => (
            <button key={i} onClick={() => setActiveIdx(i)} style={{
              padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
              cursor: 'pointer', border: '1px solid',
              background:  activeIdx === i ? '#0F1E3C' : '#fff',
              color:       activeIdx === i ? '#fff'    : '#5F5E5A',
              borderColor: activeIdx === i ? '#0F1E3C' : '#E8E8E4',
            }}>
              Recording {i + 1}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <audio ref={audioRef} style={{ display: 'none' }} preload="metadata" />

        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0F1E3C', display: 'flex', alignItems: 'center', gap: 6 }}>
            🎙 Recording {activeIdx + 1} of {count}
            {loading  && <span style={{ fontSize: 10, color: '#888780', fontWeight: 400 }}>Loading...</span>}
            {!loading && canPlay  && <span style={{ fontSize: 10, color: '#0D9E8A', fontWeight: 400 }}>● Ready</span>}
            {!loading && !canPlay && <span style={{ fontSize: 10, color: '#B4B2A9', fontWeight: 400 }}>No audio</span>}
          </div>
          <div style={{ fontSize: 11, color: '#888780', marginTop: 2 }}>
            {audiofmt(current)} / {totalStr}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button style={{ ...s.skipBtn, opacity: canPlay ? 1 : 0.35 }} onClick={() => skip(-5)}>−5s</button>
          <button style={{ ...s.playBtn, opacity: canPlay ? 1 : 0.35, cursor: canPlay ? 'pointer' : 'not-allowed' }} onClick={toggle}>
            {loading ? '⏳' : isPlaying ? '⏸' : '▶'}
          </button>
          <button style={{ ...s.skipBtn, opacity: canPlay ? 1 : 0.35 }} onClick={() => skip(5)}>+5s</button>
        </div>

        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ height: 6, background: '#E8E8E4', borderRadius: 3, overflow: 'hidden', cursor: canPlay ? 'pointer' : 'default' }}
            onClick={canPlay ? seek : undefined}>
            <div style={{ height: '100%', background: '#0D9E8A', borderRadius: 3, width: `${progress}%`, transition: 'width 0.3s linear' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 10, color: '#888780' }}>{audiofmt(current)}</span>
            <span style={{ fontSize: 10, color: '#888780', fontWeight: duration > 0 ? 500 : 400 }}>{totalStr}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function Clinician() {
  const navigate    = useNavigate()
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}')

  const [screen, setScreen]                     = useState('schedule')
  const [dayOffset, setDayOffset]               = useState(0)
  const [visits, setVisits]                     = useState([])
  const [history, setHistory]                   = useState([])
  const [loading, setLoading]                   = useState(false)
  const [activeVisit, setActiveVisit]           = useState(null)
  const [paused, setPaused]                     = useState(false)
  const [timer, setTimer]                       = useState(0)
  const [uploadingAudio, setUploadingAudio]     = useState(false)
  const [additionalRec, setAdditionalRec]       = useState(null)
  const [additionalTimer, setAdditionalTimer]   = useState(0)
  const [additionalPaused, setAdditionalPaused] = useState(false)
  const [showAddForm, setShowAddForm]           = useState(false)
  const [showEndConfirm, setShowEndConfirm]     = useState(false)
  const [showCalendar, setShowCalendar]         = useState(false)
  const [reviewNote, setReviewNote]             = useState(null)
  const [playingVisit, setPlayingVisit]         = useState(null)
  const [histSearch, setHistSearch]             = useState('')
  const [toast, setToast]                       = useState(null)
  const [addError, setAddError]                 = useState('')
  const [editRequest, setEditRequest]           = useState({})
  const [editVisit, setEditVisit]               = useState(null)
  const [editDraft, setEditDraft]               = useState({})
  const [editSaving, setEditSaving]             = useState(false)
  const [editError, setEditError]               = useState('')
  const [newPt, setNewPt]                       = useState({ name: '', mrn: '', time: '', type: 'Follow-up', dob: '' })

  const timerRef         = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef   = useRef([])
  const addTimerRef      = useRef(null)
  const addRecorderRef   = useRef(null)
  const addChunksRef     = useRef([])

  const QUICK_DAYS = [-2, -1, 0, 1, 2]
  const isPast   = dayOffset < 0
  const isFuture = dayOffset > 0

  useEffect(() => { if (screen === 'schedule') loadVisits() }, [dayOffset, screen])
  useEffect(() => { if (screen === 'history')  loadHistory() }, [screen])

  const loadVisits = async () => {
    try { setLoading(true); const data = await visitsAPI.getByDate(localDate(dayOffset, 'input')); setVisits(data.visits || []) }
    catch (err) { showToast(err.message, 'error') }
    finally { setLoading(false) }
  }

  const loadHistory = async () => {
    try { setLoading(true); const data = await visitsAPI.getHistory(); setHistory(data.visits || []) }
    catch (err) { showToast(err.message, 'error') }
    finally { setLoading(false) }
  }

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const addPatient = async () => {
    setAddError('')
    if (!newPt.name.trim()) { setAddError('Patient name is required.'); return }
    if (!newPt.mrn.trim())  { setAddError('MRN is required.'); return }
    if (!newPt.time)        { setAddError('Appointment time is required.'); return }
    try {
      let patient
      try {
        const pd = await patientsAPI.create({ name: newPt.name.trim(), mrn: newPt.mrn.trim().toUpperCase(), date_of_birth: newPt.dob || null })
        patient = pd.patient
      } catch (err) {
        if (err.message.includes('already exists')) {
          const pd = await patientsAPI.getAll()
          patient = pd.patients.find(p => p.mrn === newPt.mrn.trim().toUpperCase())
          if (!patient) { setAddError(err.message); return }
        } else { setAddError(err.message); return }
      }
      const vd = await visitsAPI.create({ patient_id: patient.id, visit_date: localDate(dayOffset, 'input'), visit_time: newPt.time, visit_type: newPt.type })
      setVisits(prev => [...prev, { ...vd.visit, patient_name: patient.name, mrn: patient.mrn }].sort((a, b) => a.visit_time.localeCompare(b.visit_time)))
      setNewPt({ name: '', mrn: '', time: '', type: 'Follow-up', dob: '' })
      setShowAddForm(false)
      showToast(`${patient.name} added to schedule`)
    } catch (err) { setAddError(err.message) }
  }

  const saveEditVisit = async () => {
    setEditError('')
    if (!editDraft.visit_time) { setEditError('Time is required.'); return }
    try {
      setEditSaving(true)
      await visitsAPI.updateVisit(editVisit.id, { visit_time: editDraft.visit_time, visit_type: editDraft.visit_type })
      setVisits(prev => prev.map(v =>
        v.id === editVisit.id ? { ...v, visit_time: editDraft.visit_time, visit_type: editDraft.visit_type } : v
      ).sort((a, b) => a.visit_time.localeCompare(b.visit_time)))
      setEditVisit(null)
      showToast(`${editVisit.patient_name} updated.`)
    } catch (err) { setEditError(err.message) }
    finally { setEditSaving(false) }
  }

  const deleteVisit = async (visit) => {
    if (!window.confirm(`Remove ${visit.patient_name} from schedule?`)) return
    try {
      await visitsAPI.deleteVisit(visit.id)
      setVisits(prev => prev.filter(v => v.id !== visit.id))
      showToast(`${visit.patient_name} removed.`)
    } catch (err) { showToast(err.message, 'error') }
  }

  const getMimeType = () => {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4']
    return types.find(t => MediaRecorder.isTypeSupported(t)) || ''
  }

  const startVisit = async (visit) => {
    if (activeVisit) return
    try {
      const stream   = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      const mimeType = getMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {})
      audioChunksRef.current   = []
      mediaRecorderRef.current = recorder
      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.start(1000)
      await visitsAPI.updateStatus(visit.id, 'in-progress')
      setVisits(prev => prev.map(v => v.id === visit.id ? { ...v, status: 'in-progress' } : v))
      setActiveVisit(visit); setPaused(false); setTimer(0)
      timerRef.current = setInterval(() => setTimer(t => t + 1), 1000)
      showToast('🎙 Recording started')
    } catch (err) {
      if (err.name === 'NotAllowedError') showToast('Microphone access denied.', 'error')
      else showToast(`Could not start: ${err.message}`, 'error')
    }
  }

  const pauseResume = () => {
    if (!paused) {
      clearInterval(timerRef.current)
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.pause()
      setPaused(true)
    } else {
      timerRef.current = setInterval(() => setTimer(t => t + 1), 1000)
      if (mediaRecorderRef.current?.state === 'paused') mediaRecorderRef.current.resume()
      setPaused(false)
    }
  }

  const endVisit = async () => {
    try {
      clearInterval(timerRef.current)
      setUploadingAudio(true)
      setShowEndConfirm(false)
      const recorder = mediaRecorderRef.current
      const visitId  = activeVisit.id
      const patName  = activeVisit.patient_name

      if (recorder && recorder.state !== 'inactive') {
        await new Promise(resolve => {
          recorder.onstop = async () => {
            const chunks = audioChunksRef.current
            if (chunks.length > 0) {
              try {
                const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
                await visitsAPI.uploadAudio(visitId, blob)
                showToast('✓ Recording uploaded')
              } catch (err) { showToast('Audio upload failed.', 'error') }
            }
            recorder.stream.getTracks().forEach(t => t.stop())
            resolve()
          }
          recorder.stop()
        })
      }

      await visitsAPI.endVisit(visitId, timer)
      setVisits(prev => prev.map(v => v.id === visitId
        ? { ...v, status: 'recording-uploaded', audio_file: 'uploaded', duration_seconds: timer }
        : v
      ))
      showToast(`Visit ended for ${patName}. Awaiting scribe note.`)
      setActiveVisit(null); setTimer(0); setPaused(false)
      audioChunksRef.current = []; mediaRecorderRef.current = null
    } catch (err) { showToast(err.message, 'error') }
    finally { setUploadingAudio(false) }
  }

  const startAdditionalRec = async (visit) => {
    if (activeVisit || additionalRec) return
    try {
      const stream   = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = getMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {})
      addChunksRef.current   = []
      addRecorderRef.current = recorder
      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) addChunksRef.current.push(e.data) }
      recorder.start(1000)
      setAdditionalRec(visit); setAdditionalTimer(0); setAdditionalPaused(false)
      addTimerRef.current = setInterval(() => setAdditionalTimer(t => t + 1), 1000)
      showToast(`🎙 Additional recording started`)
    } catch (err) { showToast('Microphone access denied.', 'error') }
  }

  const pauseResumeAdditional = () => {
    if (!additionalPaused) {
      clearInterval(addTimerRef.current)
      if (addRecorderRef.current?.state === 'recording') addRecorderRef.current.pause()
      setAdditionalPaused(true)
    } else {
      addTimerRef.current = setInterval(() => setAdditionalTimer(t => t + 1), 1000)
      if (addRecorderRef.current?.state === 'paused') addRecorderRef.current.resume()
      setAdditionalPaused(false)
    }
  }

  const stopAdditionalRec = async () => {
    try {
      clearInterval(addTimerRef.current)
      setUploadingAudio(true)
      await new Promise(resolve => {
        addRecorderRef.current.onstop = async () => {
          if (addChunksRef.current.length > 0) {
            try {
              const blob = new Blob(addChunksRef.current, { type: addRecorderRef.current.mimeType || 'audio/webm' })
              await visitsAPI.appendAudio(additionalRec.id, blob)
              showToast('✓ Additional recording uploaded')
            } catch (err) { showToast('Upload failed: ' + err.message, 'error') }
          }
          addRecorderRef.current?.stream?.getTracks().forEach(t => t.stop())
          resolve()
        }
        addRecorderRef.current.stop()
      })
      setAdditionalRec(null); setAdditionalTimer(0)
      addChunksRef.current = []; addRecorderRef.current = null
    } catch (err) { showToast(err.message, 'error') }
    finally { setUploadingAudio(false) }
  }

  const pickDate = (e) => {
    const picked = new Date(e.target.value + 'T00:00:00')
    const today  = new Date(); today.setHours(0,0,0,0); picked.setHours(0,0,0,0)
    setDayOffset(Math.round((picked - today) / 86400000))
    setShowCalendar(false)
  }

  const requestEdit = async (noteId) => {
    try {
      await notesAPI.requestEdit(noteId, 'Clinician requested edit')
      setEditRequest(prev => ({ ...prev, [noteId]: true }))
      showToast('Edit request sent to scribe.')
    } catch (err) { showToast(err.message, 'error') }
  }

  // ─── SIDEBAR ──────────────────────────────────────────────────────────────

  const Sidebar = () => (
    <div style={s.sidebar}>
      <div style={s.sTop}>
        <div style={s.logo}>Anot</div>
        <div style={s.logoSub}>Clinician Portal</div>
      </div>
      <nav style={s.nav}>
        {[['schedule','📅','Schedule'],['history','🕐','History'],['profile','👤','Profile']].map(([k, icon, label]) => (
          <div key={k} style={{ ...s.navItem, ...(screen === k ? s.navActive : {}) }}
            onClick={() => { setScreen(k); setReviewNote(null); setShowAddForm(false) }}>
            <span>{icon}</span>{label}
          </div>
        ))}
      </nav>
      {screen === 'schedule' && (
        <div style={s.miniSection}>
          <div style={s.miniTitle}>Quick Jump</div>
          {QUICK_DAYS.map(o => (
            <div key={o} style={{ ...s.miniDay, background: o === dayOffset ? 'rgba(13,158,138,.2)' : 'transparent' }}
              onClick={() => setDayOffset(o)}>
              <span style={{ fontSize: 11, color: '#fff' }}>{o === -1 ? 'Yesterday' : o === 0 ? 'Today' : o === 1 ? 'Tomorrow' : localDate(o, 'short')}</span>
            </div>
          ))}
        </div>
      )}
      <div style={s.sFooter}>
        <div style={s.fName}>{currentUser.name}</div>
        <div style={s.fRole}>{currentUser.specialty || 'Clinician'}</div>
        <div style={s.logout} onClick={() => { authAPI.logout(); navigate('/') }}>Sign out</div>
      </div>
    </div>
  )

  const Topbar = ({ title, meta, right }) => (
    <div style={s.topbar}>
      <div><div style={s.topTitle}>{title}</div>{meta && <div style={s.topMeta}>{meta}</div>}</div>
      <div style={s.topRight}>{right}<div style={s.avatar}>{(currentUser.name || 'C').split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}</div></div>
    </div>
  )

  // ─── NOTE REVIEW ──────────────────────────────────────────────────────────

  if (reviewNote) {
    return (
      <div style={s.page}>
        <Sidebar />
        <div style={s.main}>
          <Topbar
            title={`${reviewNote.patient_name} — ${reviewNote.visit_type}`}
            meta={`${reviewNote.mrn} · Scribe: ${reviewNote.scribe_name || 'Pending'} · ${reviewNote.visit_date}`}
            right={<button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setReviewNote(null)}>← Back</button>}
          />
          <div style={{ padding: '16px 24px', background: '#fff', borderBottom: '1px solid #E8E8E4' }}>
            <AudioPlayer visitId={reviewNote.id} durationSecs={reviewNote.duration_seconds} />
          </div>
          <div style={s.body}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <span style={{ ...s.badge, background: '#E6F1FB', color: '#0C447C' }}>📄 Final Note — by {reviewNote.scribe_name || 'Scribe'}</span>
              {!editRequest[reviewNote.note_id] ? (
                <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => requestEdit(reviewNote.note_id)}>✏️ Request Edit</button>
              ) : (
                <span style={{ ...s.badge, background: '#FAEEDA', color: '#633806' }}>✓ Edit Requested</span>
              )}
            </div>
            <div style={s.noteCard}><pre style={s.notePre}>{reviewNote.final_note || 'Note not available.'}</pre></div>
          </div>
        </div>
        {toast && <Toast toast={toast} />}
      </div>
    )
  }

  // ─── HISTORY ──────────────────────────────────────────────────────────────

  if (screen === 'history') {
    const filtered = history.filter(h =>
      h.patient_name?.toLowerCase().includes(histSearch.toLowerCase()) ||
      h.mrn?.toLowerCase().includes(histSearch.toLowerCase())
    )
    return (
      <div style={s.page}>
        <Sidebar />
        <div style={s.main}>
          <Topbar title="Visit History" meta={`${history.length} visits`} />
          <div style={s.body}>
            <input style={{ ...s.input, maxWidth: 320, marginBottom: 16 }}
              placeholder="🔍 Search patient or MRN..."
              value={histSearch} onChange={e => setHistSearch(e.target.value)} />
            {loading ? <LoadingBox /> : filtered.length === 0 ? <Empty icon="🕐" title="No history yet" sub="Completed visits will appear here" /> : (
              <div style={s.table}>
                <div style={s.tHead}>
                  <div style={{ flex: 2 }}>Patient</div>
                  <div style={{ flex: 1 }}>Date</div>
                  <div style={{ flex: 1 }}>Type</div>
                  <div style={{ flex: 1 }}>Duration</div>
                  <div style={{ flex: 1 }}>Scribe</div>
                  <div style={{ flex: 1 }}>Score</div>
                  <div style={{ flex: 1.5 }}>Actions</div>
                </div>
                {filtered.map(h => (
                  <div key={h.id} style={s.tRow}>
                    <div style={{ flex: 2 }}><div style={{ fontWeight: 500 }}>{h.patient_name}</div><div style={{ fontSize: 11, color: '#888780' }}>{h.mrn}</div></div>
                    <div style={{ flex: 1, fontSize: 12 }}>{h.visit_date}</div>
                    <div style={{ flex: 1, fontSize: 12 }}>{h.visit_type}</div>
                    <div style={{ flex: 1, fontSize: 12 }}>{h.duration_seconds ? fmtSecs(h.duration_seconds) : '—'}</div>
                    <div style={{ flex: 1, fontSize: 12 }}>{h.scribe_name || '—'}</div>
                    <div style={{ flex: 1 }}>{h.score ? <span style={{ fontWeight: 600, color: h.score >= 90 ? '#0D9E8A' : '#E8940A' }}>{h.score}</span> : <span style={{ color: '#B4B2A9' }}>—</span>}</div>
                    <div style={{ flex: 1.5, display: 'flex', gap: 6 }}>
                      <button style={{ ...s.btn, background: '#E1F5EE', color: '#085041', border: '1px solid #9FE1CB', fontSize: 11, padding: '4px 10px' }}
                        onClick={() => setPlayingVisit(h)}>🔊 Audio</button>
                      {h.final_note && (
                        <button style={{ ...s.btn, ...s.btnGhost, fontSize: 11, padding: '4px 10px' }}
                          onClick={async () => {
  try {
    const data = await notesAPI.getByVisit(h.id)
    const note = data.note
    setReviewNote({
      ...h,
      final_note:  note?.final_note  || '',
      note_id:     note?.id          || null,
      scribe_name: note?.scribe_name || h.scribe_name || '—',
    })
  } catch { showToast('Failed to load note.', 'error') }
}}>📋 Note</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {toast && <Toast toast={toast} />}
      </div>
    )
  }

  // ─── PROFILE ──────────────────────────────────────────────────────────────

  if (screen === 'profile') {
    return (
      <div style={s.page}>
        <Sidebar />
        <div style={s.main}>
          <Topbar title="My Profile" meta="Your account details" />
          <div style={s.body}>
            <div style={s.card}>
              <div style={s.profTop}>
                <div style={s.profAvatar}>{(currentUser.name || 'C').split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}</div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#0F1E3C' }}>{currentUser.name}</div>
                  <div style={{ fontSize: 13, color: '#888780', marginTop: 3 }}>{currentUser.specialty || 'Clinician'}</div>
                  <span style={{ ...s.badge, background: '#E1F5EE', color: '#085041', marginTop: 8, display: 'inline-flex' }}>● Active</span>
                </div>
              </div>
              <div style={s.profGrid}>
                {[['Email', currentUser.email || '—'],['Phone', currentUser.phone || '—']].map(([l, v]) => (
                  <div key={l}><div style={s.profFieldLabel}>{l}</div><div style={s.profFieldVal}>{v}</div></div>
                ))}
              </div>
            </div>
            <div style={{ ...s.card, marginTop: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14 }}>My Statistics</div>
              <div style={s.statsGrid}>
                {[
                  ['Total Visits',  history.length, '#0F1E3C'],
                  ['Today',         visits.length,  '#0D9E8A'],
                  ['Awaiting Note', visits.filter(v => v.status === 'recording-uploaded').length, '#378ADD'],
                  ['Note Ready',    visits.filter(v => v.status === 'note-ready').length, '#0D9E8A'],
                ].map(([l, v, c]) => (
                  <div key={l} style={s.stat}><div style={{ ...s.statVal, color: c }}>{v}</div><div style={s.statLbl}>{l}</div></div>
                ))}
              </div>
            </div>
          </div>
        </div>
        {toast && <Toast toast={toast} />}
      </div>
    )
  }

  // ─── SCHEDULE ─────────────────────────────────────────────────────────────

  return (
    <div style={s.page}>
      <Sidebar />
      <div style={s.main}>
        <Topbar
          title={dayOffset === 0 ? "Today's Schedule" : dayOffset === -1 ? 'Yesterday' : dayOffset === 1 ? 'Tomorrow' : localDate(dayOffset, 'short')}
          meta={`${localDate(dayOffset)} · ${visits.length} patient${visits.length !== 1 ? 's' : ''}`}
          right={<button style={{ ...s.btn, ...s.btnTeal }} onClick={() => { setShowAddForm(f => !f); setAddError('') }}>+ Add Patient</button>}
        />

        {/* Date nav */}
        <div style={s.dateNav}>
          <button style={s.btn} onClick={() => setDayOffset(d => d - 1)}>←</button>
          <div style={{ display: 'flex', gap: 4, flex: 1, justifyContent: 'center', overflowX: 'auto' }}>
            {QUICK_DAYS.map(o => (
              <div key={o} style={{ ...s.dayPill, ...(o === dayOffset ? s.dayPillAct : {}) }} onClick={() => setDayOffset(o)}>
                <div style={{ fontSize: 11, fontWeight: 600, color: o === dayOffset ? '#fff' : '#0F1E3C' }}>{o === 0 ? 'Today' : o === -1 ? 'Yest' : o === 1 ? 'Tmrw' : localDate(o, 'short').split(',')[0]}</div>
                <div style={{ fontSize: 10, color: o === dayOffset ? 'rgba(255,255,255,.7)' : '#888780' }}>{localDate(o, 'short').split(' ').slice(1).join(' ')}</div>
              </div>
            ))}
          </div>
          <button style={s.btn} onClick={() => setDayOffset(d => d + 1)}>→</button>
          <div style={{ position: 'relative' }}>
            <button style={s.btn} onClick={() => setShowCalendar(c => !c)}>📅</button>
            {showCalendar && <div style={s.calPopup}><input type="date" style={s.input} defaultValue={localDate(dayOffset, 'input')} onChange={pickDate} /></div>}
          </div>
        </div>

        <div style={s.body}>

          {/* Active recording banner */}
          {activeVisit && (
            <div style={s.recBanner}>
              <div style={s.recDot} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#501313' }}>{activeVisit.patient_name}</div>
                <div style={{ fontSize: 11, color: '#A32D2D', marginTop: 2 }}>{fmtSecs(timer)} · {paused ? '⏸ Paused' : '🎙 Recording...'}</div>
              </div>
              <button style={{ ...s.btn, ...s.btnAmber }} onClick={pauseResume}>{paused ? '▶ Resume' : '⏸ Pause'}</button>
              <button style={{ ...s.btn, ...s.btnRed }}   onClick={() => setShowEndConfirm(true)}>■ End Visit</button>
            </div>
          )}

          {/* Additional recording banner */}
          {additionalRec && (
            <div style={{ ...s.recBanner, background: '#E6F1FB', borderColor: '#B8D6F5' }}>
              <div style={{ ...s.recDot, background: '#378ADD' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0C447C' }}>{additionalRec.patient_name} — Additional</div>
                <div style={{ fontSize: 11, color: '#378ADD', marginTop: 2 }}>{fmtSecs(additionalTimer)} · {additionalPaused ? '⏸ Paused' : '🎙 Recording...'}</div>
              </div>
              <button style={{ ...s.btn, ...s.btnAmber }} onClick={pauseResumeAdditional}>{additionalPaused ? '▶ Resume' : '⏸ Pause'}</button>
              <button style={{ ...s.btn, ...s.btnRed }}   onClick={stopAdditionalRec}>■ Stop & Upload</button>
            </div>
          )}

          {/* Uploading */}
          {uploadingAudio && (
            <div style={{ ...s.recBanner, background: '#E6F1FB', borderColor: '#B8D6F5' }}>
              <div style={{ fontSize: 13, color: '#0C447C', fontWeight: 500 }}>⏳ Uploading audio... please wait</div>
            </div>
          )}

          {/* End confirm */}
          {showEndConfirm && (
            <div style={s.confirm}>
              <div style={{ fontSize: 14 }}>End visit for <strong>{activeVisit?.patient_name}</strong>? Recording will be sent to scribe.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setShowEndConfirm(false)}>Cancel</button>
                <button style={{ ...s.btn, ...s.btnNavy }} onClick={endVisit}>Yes, End Visit</button>
              </div>
            </div>
          )}

          {/* Add patient form */}
          {showAddForm && (
            <div style={{ ...s.card, border: '1px dashed #B4B2A9', marginBottom: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Add Patient — {localDate(dayOffset, 'short')}</div>
              <div style={s.formGrid}>
                <div style={s.formGroup}><label style={s.formLabel}>Patient Name *</label><input style={s.input} placeholder="Full name" value={newPt.name} onChange={e => setNewPt({ ...newPt, name: e.target.value })} /></div>
                <div style={s.formGroup}><label style={s.formLabel}>MRN *</label><input style={s.input} placeholder="e.g. MRN-00421" value={newPt.mrn} onChange={e => setNewPt({ ...newPt, mrn: e.target.value })} /></div>
                <div style={s.formGroup}><label style={s.formLabel}>Date of Birth</label><input style={s.input} type="date" value={newPt.dob} onChange={e => setNewPt({ ...newPt, dob: e.target.value })} /></div>
                <div style={s.formGroup}><label style={s.formLabel}>Visit Type</label>
                  <select style={s.input} value={newPt.type} onChange={e => setNewPt({ ...newPt, type: e.target.value })}>
                    <option>Follow-up</option><option>New Patient</option><option>Virtual Visit</option>
                  </select>
                </div>
                <div style={s.formGroup}><label style={s.formLabel}>Appointment Time *</label><input style={s.input} type="time" value={newPt.time} onChange={e => setNewPt({ ...newPt, time: e.target.value })} /></div>
              </div>
              {addError && <div style={s.errorBox}>⚠ {addError}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={{ ...s.btn, ...s.btnTeal }} onClick={addPatient}>Schedule Patient</button>
                <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => { setShowAddForm(false); setAddError('') }}>Cancel</button>
              </div>
            </div>
          )}

          {/* Stats */}
          <div style={s.statsGrid}>
            {[
              ['Total',         visits.length, '#0F1E3C'],
              ['Awaiting Note', visits.filter(v => v.status === 'recording-uploaded').length, '#378ADD'],
              ['Note Ready',    visits.filter(v => v.status === 'note-ready').length, '#0D9E8A'],
              ['Remaining',     visits.filter(v => ['scheduled','upcoming','in-progress'].includes(v.status)).length, '#E8940A'],
            ].map(([l, v, c]) => (
              <div key={l} style={s.stat}><div style={{ ...s.statVal, color: c }}>{v}</div><div style={s.statLbl}>{l}</div></div>
            ))}
          </div>

          {isPast   && <div style={s.pastBanner}>📋 Past schedule.</div>}
          {isFuture && <div style={s.futureBanner}>📅 Upcoming schedule.</div>}
          {loading  && <LoadingBox />}

          {!loading && visits.length === 0 && (
            <div style={s.empty}>
              <div style={{ fontSize: 36 }}>📭</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#0F1E3C' }}>No patients scheduled</div>
              <div style={{ fontSize: 13, color: '#888780' }}>{localDate(dayOffset, 'short')}</div>
              <button style={{ ...s.btn, ...s.btnTeal, marginTop: 8 }} onClick={() => setShowAddForm(true)}>+ Add Patient</button>
            </div>
          )}

          {!loading && visits.length > 0 && <div style={s.secLabel}>Patient List</div>}

          {visits.map(visit => {
            const st       = STATUS[visit.status] || STATUS.scheduled
            const isActive = activeVisit?.id === visit.id
            const hasAudio = visit.audio_file && visit.audio_file.trim() !== ''

            return (
              <div key={visit.id} style={{ ...s.row, ...(isActive ? { border: '1px solid #0D9E8A', background: '#F0FAF8' } : {}) }}>
                <div style={s.rowLeft}>
                  <div style={s.rowTime}>{fmtTime(visit.visit_time)}</div>
                  <div>
                    <div style={s.rowName}>{visit.patient_name}</div>
                    <div style={s.rowMeta}>
                      {visit.mrn} · {visit.visit_type}
                      {visit.duration_seconds ? ` · ${fmtSecs(visit.duration_seconds)}` : ''}
                    </div>
                  </div>
                </div>
                <div style={{ ...s.rowRight, flexWrap: 'wrap' }}>
                  <span style={{ ...s.badge, background: st.bg, color: st.color }}>{st.label}</span>

                  {/* Audio play button */}
                  {hasAudio && !['upcoming','scheduled','in-progress'].includes(visit.status) && (
                    <button style={{ ...s.btn, background: '#E1F5EE', color: '#085041', border: '1px solid #9FE1CB', padding: '7px 10px' }}
                      onClick={() => setPlayingVisit(visit)} title="Play recording">🔊</button>
                  )}

                  {(isPast || isFuture) && <button style={s.btn} disabled>{isPast ? '✓ Past' : '⏳ Upcoming'}</button>}

                  {!isPast && !isFuture && visit.status === 'upcoming' && (
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button style={{ ...s.btn, ...s.btnNavy, ...(activeVisit ? { opacity: 0.4, cursor: 'not-allowed' } : {}) }}
                        onClick={() => startVisit(visit)} disabled={!!activeVisit}>🎙 Record Live</button>
                      <button style={{ ...s.btn, background: '#E6F1FB', color: '#0C447C', border: '1px solid #B8D6F5', padding: '7px 10px' }}
                        onClick={() => { setEditVisit(visit); setEditDraft({ visit_time: visit.visit_time, visit_type: visit.visit_type }); setEditError('') }}>✏️</button>
                      <button style={{ ...s.btn, ...s.btnRed, padding: '7px 10px' }} onClick={() => deleteVisit(visit)}>🗑</button>
                    </div>
                  )}

                  {!isPast && !isFuture && visit.status === 'scheduled' && (
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button style={{ ...s.btn, opacity: 0.4 }} disabled>🎙 Record Live</button>
                      <button style={{ ...s.btn, background: '#E6F1FB', color: '#0C447C', border: '1px solid #B8D6F5', padding: '7px 10px' }}
                        onClick={() => { setEditVisit(visit); setEditDraft({ visit_time: visit.visit_time, visit_type: visit.visit_type }); setEditError('') }}>✏️</button>
                      <button style={{ ...s.btn, ...s.btnRed, padding: '7px 10px' }} onClick={() => deleteVisit(visit)}>🗑</button>
                    </div>
                  )}

                  {!isPast && !isFuture && visit.status === 'in-progress' && (
                    <button style={{ ...s.btn, background: '#E1F5EE', color: '#085041', border: '1px solid #9FE1CB' }} disabled>🎙 Recording...</button>
                  )}

                  {!isPast && !isFuture && visit.status === 'recording-uploaded' && (
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button style={{ ...s.btn, background: '#E6F1FB', color: '#0C447C', border: '1px solid #B8D6F5', ...(activeVisit || additionalRec ? { opacity: 0.4, cursor: 'not-allowed' } : {}) }}
                        onClick={() => startAdditionalRec(visit)} disabled={!!activeVisit || !!additionalRec}>
                        🎙 + Record More
                      </button>
                    </div>
                  )}

{!isPast && !isFuture && visit.status === 'note-ready' && (
  <button style={{ ...s.btn, ...s.btnNavy }} onClick={async () => {
    try {
      const data = await notesAPI.getByVisit(visit.id)
      const note = data.note
      setReviewNote({
        ...visit,
        final_note:  note?.final_note  || '',
        note_id:     note?.id          || null,
        scribe_name: note?.scribe_name || visit.scribe_name || '—',
      })
    } catch (err) {
      showToast('Failed to load note.', 'error')
    }
  }}>📋 Review Note</button>
)}

                  {!isPast && !isFuture && ['done','uploaded'].includes(visit.status) && (
                    <button style={s.btn} disabled>✓ Done</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Edit Modal */}
      {editVisit && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <div style={s.modalTitle}>✏️ Edit — {editVisit.patient_name}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={s.formGroup}>
                <label style={s.formLabel}>Visit Type</label>
                <select style={s.input} value={editDraft.visit_type} onChange={e => setEditDraft({ ...editDraft, visit_type: e.target.value })}>
                  <option>Follow-up</option><option>New Patient</option><option>Virtual Visit</option>
                </select>
              </div>
              <div style={s.formGroup}>
                <label style={s.formLabel}>Appointment Time</label>
                <input style={s.input} type="time" value={editDraft.visit_time} onChange={e => setEditDraft({ ...editDraft, visit_time: e.target.value })} />
              </div>
            </div>
            {editError && <div style={{ ...s.errorBox, marginTop: 12 }}>⚠ {editError}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button style={{ ...s.btn, ...s.btnTeal }} onClick={saveEditVisit} disabled={editSaving}>{editSaving ? 'Saving...' : 'Save Changes'}</button>
              <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setEditVisit(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Audio Player Modal */}
      {playingVisit && (
        <div style={s.overlay}>
          <div style={{ ...s.modal, maxWidth: 560 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0F1E3C' }}>🔊 {playingVisit.patient_name}</div>
                <div style={{ fontSize: 12, color: '#888780', marginTop: 3 }}>
                  {playingVisit.mrn} · {playingVisit.visit_type} · {fmtTime(playingVisit.visit_time)}
                  {playingVisit.duration_seconds ? ` · Total: ${fmtSecs(playingVisit.duration_seconds)}` : ''}
                </div>
              </div>
              <button style={{ ...s.btn, ...s.btnGhost, padding: '4px 12px' }} onClick={() => setPlayingVisit(null)}>✕</button>
            </div>
            <div style={{ marginTop: 16 }}>
              <AudioPlayer visitId={playingVisit.id} durationSecs={playingVisit.duration_seconds} />
            </div>
          </div>
        </div>
      )}

      {toast && <Toast toast={toast} />}
      <style>{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.8)}}`}</style>
    </div>
  )
}

// ─── SMALL COMPONENTS ─────────────────────────────────────────────────────────

function Toast({ toast }) {
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, background: toast.type === 'error' ? '#FCEBEB' : '#0F1E3C', color: toast.type === 'error' ? '#A32D2D' : '#fff', padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 500, zIndex: 999, boxShadow: '0 4px 20px rgba(0,0,0,.15)' }}>
      {toast.type === 'error' ? '⚠ ' : '✓ '}{toast.msg}
    </div>
  )
}

function LoadingBox() {
  return <div style={{ padding: 32, textAlign: 'center', color: '#888780', fontSize: 13 }}>Loading...</div>
}

function Empty({ icon, title, sub }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ fontSize: 36 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#0F1E3C' }}>{title}</div>
      <div style={{ fontSize: 13, color: '#888780' }}>{sub}</div>
    </div>
  )
}

// ─── STYLES ───────────────────────────────────────────────────────────────────

const s = {
  page:        { display: 'flex', minHeight: '100vh', fontFamily: "'Segoe UI', system-ui, sans-serif", background: '#F5F5F3' },
  sidebar:     { width: 220, background: '#0F1E3C', display: 'flex', flexDirection: 'column', flexShrink: 0, position: 'fixed', top: 0, left: 0, height: '100vh', overflowY: 'auto', zIndex: 200 },
  sTop:        { padding: '22px 18px 14px', borderBottom: '1px solid rgba(255,255,255,.08)' },
  logo:        { fontSize: 17, fontWeight: 700, color: '#fff' },
  logoSub:     { fontSize: 10, color: 'rgba(255,255,255,.3)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '.07em' },
  nav:         { padding: '10px 0' },
  navItem:     { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', fontSize: 13, color: 'rgba(255,255,255,.45)', cursor: 'pointer', borderLeft: '2px solid transparent' },
  navActive:   { color: '#fff', background: 'rgba(13,158,138,.15)', borderLeft: '2px solid #0D9E8A' },
  miniSection: { padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,.08)' },
  miniTitle:   { fontSize: 9, color: 'rgba(255,255,255,.3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 },
  miniDay:     { display: 'flex', padding: '6px 10px', borderRadius: 7, cursor: 'pointer', marginBottom: 3 },
  sFooter:     { padding: '14px 18px', borderTop: '1px solid rgba(255,255,255,.08)', marginTop: 'auto' },
  fName:       { fontSize: 12, color: 'rgba(255,255,255,.65)', fontWeight: 500 },
  fRole:       { fontSize: 11, color: 'rgba(255,255,255,.3)', marginTop: 2 },
  logout:      { marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,.3)', cursor: 'pointer', textDecoration: 'underline' },
  main:        { marginLeft: 220, flex: 1, display: 'flex', flexDirection: 'column' },
  topbar:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', height: 56, background: '#fff', borderBottom: '1px solid #E8E8E4', position: 'sticky', top: 0, zIndex: 10, flexShrink: 0 },
  topTitle:    { fontSize: 15, fontWeight: 600, color: '#0F1E3C' },
  topMeta:     { fontSize: 12, color: '#888780', marginTop: 2 },
  topRight:    { display: 'flex', alignItems: 'center', gap: 12 },
  avatar:      { width: 34, height: 34, borderRadius: '50%', background: '#0F1E3C', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 },
  body:        { padding: '22px 24px', flex: 1, overflowY: 'auto' },
  btn:         { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: '1px solid #E8E8E4', background: '#fff', color: '#0F1E3C', fontFamily: 'inherit' },
  btnNavy:     { background: '#0F1E3C', color: '#fff', border: 'none' },
  btnTeal:     { background: '#0D9E8A', color: '#fff', border: 'none' },
  btnRed:      { background: '#E24B4A', color: '#fff', border: 'none' },
  btnAmber:    { background: '#FAEEDA', color: '#633806', border: '1px solid #FAC775' },
  btnGhost:    { background: '#F1EFE8', color: '#5F5E5A', border: '1px solid #E8E8E4' },
  badge:       { display: 'inline-flex', padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600 },
  card:        { background: '#fff', border: '1px solid #E8E8E4', borderRadius: 12, padding: 16 },
  statsGrid:   { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 18 },
  stat:        { background: '#fff', border: '1px solid #E8E8E4', borderRadius: 12, padding: 14 },
  statVal:     { fontSize: 26, fontWeight: 600, lineHeight: 1 },
  statLbl:     { fontSize: 12, color: '#888780', marginTop: 5 },
  secLabel:    { fontSize: 11, fontWeight: 600, color: '#888780', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 },
  row:         { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', border: '1px solid #E8E8E4', borderRadius: 12, padding: '12px 16px', marginBottom: 8 },
  rowLeft:     { display: 'flex', alignItems: 'center', gap: 14 },
  rowRight:    { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  rowTime:     { fontSize: 12, color: '#888780', minWidth: 60, fontWeight: 500 },
  rowName:     { fontSize: 14, fontWeight: 600, color: '#0F1E3C' },
  rowMeta:     { fontSize: 11, color: '#888780', marginTop: 2 },
  formGrid:    { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 },
  formGroup:   { display: 'flex', flexDirection: 'column', gap: 5 },
  formLabel:   { fontSize: 11, fontWeight: 600, color: '#5F5E5A', textTransform: 'uppercase', letterSpacing: '.05em' },
  input:       { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E8E8E4', fontSize: 13, color: '#0F1E3C', outline: 'none', fontFamily: 'inherit', background: '#FAFAF8', boxSizing: 'border-box' },
  errorBox:    { background: '#FCEBEB', border: '1px solid #F09595', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#A32D2D', marginBottom: 10 },
  table:       { background: '#fff', border: '1px solid #E8E8E4', borderRadius: 12, overflow: 'hidden' },
  tHead:       { display: 'flex', padding: '10px 16px', background: '#FAFAF8', borderBottom: '1px solid #E8E8E4', fontSize: 11, fontWeight: 600, color: '#888780', textTransform: 'uppercase', letterSpacing: '.05em' },
  tRow:        { display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #F1EFE8', fontSize: 13 },
  dateNav:     { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', background: '#fff', borderBottom: '1px solid #E8E8E4', flexShrink: 0, flexWrap: 'wrap' },
  dayPill:     { padding: '6px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'center', border: '1px solid #E8E8E4', background: '#FAFAF8' },
  dayPillAct:  { background: '#0F1E3C', borderColor: '#0F1E3C' },
  calPopup:    { position: 'absolute', top: 42, right: 0, background: '#fff', border: '1px solid #E8E8E4', borderRadius: 10, padding: 12, zIndex: 100, boxShadow: '0 4px 20px rgba(0,0,0,.1)' },
  recBanner:   { display: 'flex', alignItems: 'center', gap: 14, background: '#FCEBEB', border: '1px solid #F09595', borderRadius: 12, padding: '12px 16px', marginBottom: 14, flexWrap: 'wrap' },
  recDot:      { width: 9, height: 9, borderRadius: '50%', background: '#E24B4A', flexShrink: 0, animation: 'pulse 1.2s infinite' },
  confirm:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', border: '1px solid #E8E8E4', borderRadius: 12, padding: '14px 18px', marginBottom: 14, gap: 16, flexWrap: 'wrap' },
  pastBanner:  { background: '#F1EFE8', border: '1px solid #E8E8E4', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#5F5E5A', marginBottom: 12 },
  futureBanner:{ background: '#E6F1FB', border: '1px solid #B8D6F5', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#0C447C', marginBottom: 12 },
  empty:       { textAlign: 'center', padding: '48px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  noteCard:    { background: '#fff', border: '1px solid #E8E8E4', borderRadius: 12, padding: 24 },
  notePre:     { fontSize: 13, lineHeight: 1.8, color: '#0F1E3C', fontFamily: "'Segoe UI', system-ui, sans-serif", whiteSpace: 'pre-wrap', margin: 0 },
  profTop:     { display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid #F1EFE8' },
  profAvatar:  { width: 64, height: 64, borderRadius: '50%', background: '#0F1E3C', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 600, flexShrink: 0 },
  profGrid:    { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 },
  profFieldLabel: { fontSize: 11, fontWeight: 600, color: '#888780', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 },
  profFieldVal:   { fontSize: 14, color: '#0F1E3C' },
  skipBtn:     { padding: '5px 9px', borderRadius: 6, background: '#F1EFE8', color: '#5F5E5A', border: '1px solid #E8E8E4', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  playBtn:     { width: 34, height: 34, borderRadius: '50%', background: '#0F1E3C', color: '#fff', border: 'none', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  overlay:     { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 20 },
  modal:       { background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 420, boxShadow: '0 8px 40px rgba(0,0,0,.18)' },
  modalTitle:  { fontSize: 16, fontWeight: 700, color: '#0F1E3C', marginBottom: 20 },
}