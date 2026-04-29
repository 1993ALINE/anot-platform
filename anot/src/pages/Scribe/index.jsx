import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import '../global.css'
import { useSidebar, Hamburger, Overlay } from '../shared'
import { authAPI, usersAPI, visitsAPI, notesAPI } from '../../services/api'

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function localDateStr(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function fmtDateLabel(dateStr) {
  if (!dateStr) return ''
  const [y, m, day] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

function fmtShortDate(dateStr) {
  if (!dateStr) return ''
  const [y, m, day] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDuration(secs) {
  if (!secs) return '—'
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
}

function fmtTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  return `${hour > 12 ? hour - 12 : hour === 0 ? 12 : hour}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
}

function fmtSecs(s) {
  if (!s || isNaN(s) || !isFinite(s) || s < 0) return '00:00'
  return `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(Math.floor(s % 60)).padStart(2,'0')}`
}

const STATUS_CFG = {
  'recording-uploaded': { label: 'Pending',   cls: 'badge-amber' },
  'note-ready':         { label: 'Pending',   cls: 'badge-amber' },
  draft:                { label: 'Draft',     cls: 'badge-blue'  },
  submitted:            { label: 'Submitted', cls: 'badge-green' },
  uploaded:             { label: 'Graded',    cls: 'badge-green' },
}

function ScoreBar({ value }) {
  if (!value) return <span style={{ color: '#B4B2A9', fontSize: 12 }}>—</span>
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: '#E8E8E4', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', borderRadius: 3,
          background: value >= 90 ? '#0D9E8A' : value >= 75 ? '#E8940A' : '#E24B4A',
          transition: 'width 0.3s ease' }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#0F1E3C', minWidth: 28, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

// ─── AUDIO PLAYER ─────────────────────────────────────────────────────────────

function AudioPlayer({ visitId, durationSecs }) {
  const [count, setCount]         = useState(1)
  const [activeIdx, setActiveIdx] = useState(0)
  const [status, setStatus]       = useState('loading')
  const [isPlaying, setPlaying]   = useState(false)
  const [current, setCurrent]     = useState(0)
  const [duration, setDuration]   = useState(durationSecs || 0)
  const audioRef   = useRef(null)
  const blobRef    = useRef(null)
  const maxTimeRef = useRef(durationSecs || 0)

  useEffect(() => {
    if (!visitId) return
    const token = localStorage.getItem('token')
    fetch(`http://localhost:5000/api/audio/${visitId}/count`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).then(d => { if (d.count > 0) setCount(d.count) }).catch(() => {})
  }, [visitId])

  useEffect(() => {
    if (!visitId) { setStatus('error'); return }
    setStatus('loading'); setPlaying(false); setCurrent(0)
    const initDur = activeIdx === 0 ? (durationSecs || 0) : 0
    setDuration(initDur); maxTimeRef.current = initDur

    if (blobRef.current) { URL.revokeObjectURL(blobRef.current); blobRef.current = null }

    const token = localStorage.getItem('token')
    fetch(`http://localhost:5000/api/audio/${visitId}?index=${activeIdx}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => { if (!res.ok) throw new Error('no audio'); return res.blob() })
      .then(blob => {
        if (!blob || blob.size === 0) throw new Error('empty')
        blobRef.current = URL.createObjectURL(blob)
        if (audioRef.current) { audioRef.current.src = blobRef.current; audioRef.current.load() }
        setStatus('ready')
      })
      .catch(() => setStatus('error'))

    return () => {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = '' }
      if (blobRef.current)  { URL.revokeObjectURL(blobRef.current); blobRef.current = null }
    }
  }, [visitId, activeIdx])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onMeta = () => {
      const dur = audio.duration
      if (dur && isFinite(dur) && dur > 0) { setDuration(Math.floor(dur)); maxTimeRef.current = Math.floor(dur) }
    }
    const onTime = () => {
      const cur = Math.floor(audio.currentTime)
      setCurrent(cur)
      if (cur > maxTimeRef.current) { maxTimeRef.current = cur; setDuration(cur) }
    }
    const onEnded = () => { setPlaying(false); setCurrent(0); if (maxTimeRef.current > 0) setDuration(maxTimeRef.current) }
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('durationchange', onMeta)
    audio.addEventListener('timeupdate',     onTime)
    audio.addEventListener('ended',          onEnded)
    return () => {
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('durationchange', onMeta)
      audio.removeEventListener('timeupdate',     onTime)
      audio.removeEventListener('ended',          onEnded)
    }
  }, [])

  const toggle = () => {
    const audio = audioRef.current
    if (!audio || status !== 'ready') return
    if (isPlaying) { audio.pause(); setPlaying(false) }
    else           { audio.play().then(() => setPlaying(true)).catch(() => {}) }
  }

  const skip = (secs) => {
    const audio = audioRef.current
    if (!audio || status !== 'ready') return
    const max = maxTimeRef.current || duration || 0
    const t = Math.max(0, Math.min(max, audio.currentTime + secs))
    audio.currentTime = t; setCurrent(Math.floor(t))
  }

  const seek = (e) => {
    const audio = audioRef.current
    if (!audio || status !== 'ready' || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const t = Math.round(((e.clientX - rect.left) / rect.width) * duration)
    audio.currentTime = t; setCurrent(t)
  }

  const canPlay  = status === 'ready'
  const progress = duration > 0 ? Math.min(100, (current / duration) * 100) : 0
  const totalStr = duration > 0 ? fmtSecs(duration) : '--:--'

  return (
    <div style={{ padding: '14px 20px', background: '#fff', borderBottom: '1px solid #E8E8E4' }}>
      <audio ref={audioRef} preload="metadata" style={{ display: 'none' }} />

      {/* Row 1 — Recording tabs + status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        {count > 1 && (
          <div style={{ display: 'flex', gap: 6 }}>
            {Array.from({ length: count }, (_, i) => (
              <button key={i} onClick={() => setActiveIdx(i)} style={{
                padding: '3px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                cursor: 'pointer', border: '1px solid',
                background:  activeIdx === i ? '#0F1E3C' : '#FAFAF8',
                color:       activeIdx === i ? '#fff'    : '#5F5E5A',
                borderColor: activeIdx === i ? '#0F1E3C' : '#E8E8E4',
                transition: 'all .15s',
              }}>Rec {i + 1}</button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#0F1E3C' }}>
            🎙 Recording {activeIdx + 1}{count > 1 ? ` of ${count}` : ''}
          </span>
          {status === 'loading' && <span style={{ fontSize: 10, color: '#888780', background: '#F1EFE8', padding: '2px 7px', borderRadius: 10 }}>Loading...</span>}
          {status === 'ready'   && <span style={{ fontSize: 10, color: '#085041', background: '#E1F5EE', padding: '2px 7px', borderRadius: 10 }}>● Ready</span>}
          {status === 'error'   && <span style={{ fontSize: 10, color: '#888780', background: '#F1EFE8', padding: '2px 7px', borderRadius: 10 }}>No audio</span>}
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#888780', fontWeight: 500 }}>
          {fmtSecs(current)} / {totalStr}
        </span>
      </div>

      {/* Row 2 — Controls + progress bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Play controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button onClick={() => skip(-5)} disabled={!canPlay} style={{
            padding: '5px 10px', borderRadius: 6, background: '#F1EFE8', color: '#5F5E5A',
            border: '1px solid #E8E8E4', fontSize: 11, fontWeight: 600, cursor: canPlay ? 'pointer' : 'not-allowed',
            opacity: canPlay ? 1 : 0.4, fontFamily: 'inherit',
          }}>−5s</button>

          <button onClick={toggle} disabled={!canPlay} style={{
            width: 38, height: 38, borderRadius: '50%', background: canPlay ? '#0F1E3C' : '#C4C2B9',
            color: '#fff', border: 'none', fontSize: 14, cursor: canPlay ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            transition: 'background .15s',
          }}>
            {status === 'loading' ? '⏳' : isPlaying ? '⏸' : '▶'}
          </button>

          <button onClick={() => skip(5)} disabled={!canPlay} style={{
            padding: '5px 10px', borderRadius: 6, background: '#F1EFE8', color: '#5F5E5A',
            border: '1px solid #E8E8E4', fontSize: 11, fontWeight: 600, cursor: canPlay ? 'pointer' : 'not-allowed',
            opacity: canPlay ? 1 : 0.4, fontFamily: 'inherit',
          }}>+5s</button>
        </div>

        {/* Progress bar — takes remaining space */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            onClick={canPlay ? seek : undefined}
            style={{ height: 6, background: '#E8E8E4', borderRadius: 3, overflow: 'hidden', cursor: canPlay ? 'pointer' : 'default', marginBottom: 4 }}>
            <div style={{
              height: '100%', background: '#0D9E8A', borderRadius: 3,
              width: `${progress}%`, transition: 'width 0.3s linear',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, color: '#888780' }}>{fmtSecs(current)}</span>
            <span style={{ fontSize: 10, color: '#888780', fontWeight: 500 }}>{totalStr}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export default function Scribe() {
  const navigate    = useNavigate()
  const sidebar     = useSidebar()
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}')

  const [screen, setScreen]                       = useState('providers')
  const [activeTab, setActiveTab]                 = useState('recordings')
  const [providers, setProviders]                 = useState([])
  const [selectedProvider, setSelectedProvider]   = useState(null)
  const [selectedDate, setSelectedDate]           = useState(localDateStr(0))
  const [recordings, setRecordings]               = useState([])
  const [selectedRec, setSelectedRec]             = useState(null)
  const [note, setNote]                           = useState(null)
  const [finalNote, setFinalNote]                 = useState('')
  const [myNotes, setMyNotes]                     = useState([])
  const [grades, setGrades]                       = useState([])
  const [selectedGrade, setSelectedGrade]         = useState(null)
  const [loadingProviders, setLoadingProviders]   = useState(true)
  const [loadingRecordings, setLoadingRecordings] = useState(false)
  const [loadingNote, setLoadingNote]             = useState(false)
  const [loadingNotes, setLoadingNotes]           = useState(false)
  const [loadingGrades, setLoadingGrades]         = useState(false)
  const [saving, setSaving]                       = useState(false)
  const [notif, setNotif]                         = useState(null)

  useEffect(() => { loadProviders() }, [])
  useEffect(() => {
    if (activeTab === 'notes')  loadMyNotes()
    if (activeTab === 'grades') loadGrades()
  }, [activeTab])

  const loadProviders = async () => {
    try {
      setLoadingProviders(true)
      const data = await usersAPI.getMyClinicans()
      setProviders(data.clinicians || [])
    } catch { showNotif('Failed to load providers.', 'red') }
    finally  { setLoadingProviders(false) }
  }

  const loadRecordings = async (providerId, date) => {
    try {
      setLoadingRecordings(true)
      const data = await visitsAPI.getAll(providerId, date)
      const all  = data.visits || []
      const relevant = all.filter(v => !['upcoming', 'scheduled', 'in-progress'].includes(v.status))
      setRecordings(relevant)
    } catch { showNotif('Failed to load recordings.', 'red') }
    finally  { setLoadingRecordings(false) }
  }

  const loadNote = async (visitId) => {
    try {
      setLoadingNote(true)
      const data = await notesAPI.getByVisit(visitId)
      setNote(data.note)
      setFinalNote(data.note?.final_note || '')
    } catch { setNote(null); setFinalNote('') }
    finally  { setLoadingNote(false) }
  }

  const loadMyNotes = async () => {
    try {
      setLoadingNotes(true)
      const data = await notesAPI.getMyNotes()
      setMyNotes(data.notes || [])
    } catch { showNotif('Failed to load notes.', 'red') }
    finally  { setLoadingNotes(false) }
  }

  const loadGrades = async () => {
    try {
      setLoadingGrades(true)
      const data = await notesAPI.getMyGrades()
      setGrades(data.grades || [])
    } catch { showNotif('Failed to load grades.', 'red') }
    finally  { setLoadingGrades(false) }
  }

  const showNotif = (msg, type = 'green') => {
    setNotif({ msg, type })
    setTimeout(() => setNotif(null), 3000)
  }

  const saveDraft = async () => {
    if (!finalNote.trim()) { showNotif('Please write the note before saving.', 'amber'); return }
    try {
      setSaving(true)
      await notesAPI.saveDraft(selectedRec.id, finalNote)
      showNotif('Draft saved successfully')
    } catch (err) { showNotif(`Save failed: ${err.message}`, 'red') }
    finally { setSaving(false) }
  }

  const uploadToEMR = async () => {
    if (!finalNote.trim()) { showNotif('Please write the note before uploading.', 'amber'); return }
    try {
      setSaving(true)
      const saved = await notesAPI.saveDraft(selectedRec.id, finalNote)
      await notesAPI.submitNote(note?.id || saved.note.id)
      setRecordings(prev => prev.map(r => r.id === selectedRec.id ? { ...r, status: 'submitted' } : r))
      setSelectedRec(prev => ({ ...prev, status: 'submitted' }))
      showNotif('Note submitted to clinician.')
    } catch (err) { showNotif(`Upload failed: ${err.message}`, 'red') }
    finally { setSaving(false) }
  }

  const openRecording = (rec) => { setSelectedRec(rec); loadNote(rec.id); setScreen('note') }

  const handleNav = (tab) => {
    setActiveTab(tab)
    if (tab === 'recordings') { if (selectedProvider) setScreen('date'); else setScreen('providers') }
    else setScreen(tab)
    sidebar.close()
  }

  // ─── SIDEBAR ──────────────────────────────────────

  const SidebarEl = () => (
    <div className={`sf-sidebar${sidebar.open ? ' open' : ''}`}>
      <div className="sf-sidebar-top">
        <div className="sf-logo">Anot</div>
        <div className="sf-logo-sub">Scribe Portal</div>
      </div>
      <nav className="sf-nav">
        {[['recordings','🎙','Recordings'],['notes','📋','My Notes'],['grades','⭐','My Grades'],['profile','👤','Profile']].map(([k, icon, label]) => (
          <div key={k} className={`sf-nav-item${activeTab === k ? ' active' : ''}`} onClick={() => handleNav(k)}>
            <span>{icon}</span>{label}
            {k === 'grades' && grades.length > 0 && <span style={st.navBadge}>{grades.length}</span>}
          </div>
        ))}
      </nav>
      {selectedProvider && activeTab === 'recordings' && (
        <div className="sf-provider-chip">
          <div className="sf-chip-label">Current Provider</div>
          <div className="sf-chip-name">{selectedProvider.name}</div>
          <div className="sf-chip-spec">{selectedProvider.specialty || 'Clinician'}</div>
          {selectedDate && screen !== 'providers' && (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', marginTop: 4 }}>📅 {fmtShortDate(selectedDate)}</div>
          )}
          <div className="sf-chip-change" onClick={() => { setScreen('providers'); setSelectedProvider(null); setSelectedRec(null); setRecordings([]); sidebar.close() }}>Change provider</div>
        </div>
      )}
      <div className="sf-sidebar-footer">
        <div className="sf-footer-name">{currentUser.name || 'Scribe'}</div>
        <div className="sf-footer-role">Medical Scribe</div>
        <div className="sf-logout" onClick={() => { authAPI.logout(); navigate('/') }}>Sign out</div>
      </div>
    </div>
  )

  // ─── MY NOTES ─────────────────────────────────────

  if (screen === 'notes') {
    const byProvider = myNotes.reduce((acc, n) => {
      const key = n.clinician_name || 'Unknown'
      if (!acc[key]) acc[key] = []
      acc[key].push(n)
      return acc
    }, {})
    return (
      <div className="sf-page">
        <SidebarEl /><Overlay open={sidebar.open} onClick={sidebar.close} /><Hamburger onClick={sidebar.toggle} />
        <div className="sf-main">
          <div className="sf-topbar">
            <div><div className="sf-topbar-title">My Notes</div><div className="sf-topbar-meta">All notes grouped by provider</div></div>
            <div className="sf-avatar">{(currentUser.name || 'S').charAt(0).toUpperCase()}</div>
          </div>
          <div className="sf-body">
            <div className="sf-stats" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
              {[['Total', myNotes.length, '#0F1E3C'],['Submitted', myNotes.filter(n => ['submitted','uploaded'].includes(n.status)).length, '#0D9E8A'],['Drafts', myNotes.filter(n => n.status === 'draft').length, '#378ADD'],['Graded', myNotes.filter(n => n.status === 'uploaded').length, '#E8940A']].map(([l, v, c]) => (
                <div key={l} className="sf-stat"><div className="sf-stat-val" style={{ color: c }}>{v}</div><div className="sf-stat-lbl">{l}</div></div>
              ))}
            </div>
            {loadingNotes ? <Empty icon="⏳" title="Loading..." /> :
             myNotes.length === 0 ? <Empty icon="📋" title="No notes yet" sub="Notes you write will appear here." /> :
             Object.entries(byProvider).map(([provName, provNotes]) => (
              <div key={provName} style={{ marginBottom: 24 }}>
                <div style={st.provHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={st.provDot} />
                    <div><div style={st.provName}>{provName}</div><div style={st.provMeta}>{provNotes.length} note{provNotes.length !== 1 ? 's' : ''}</div></div>
                  </div>
                </div>
                {provNotes.map(n => {
                  const s = STATUS_CFG[n.status] || { label: n.status, cls: 'badge-gray' }
                  return (
                    <div key={n.id} className="sf-row" style={{ marginLeft: 16 }}>
                      <div className="sf-row-left">
                        <span style={{ fontSize: 20 }}>📄</span>
                        <div><div className="sf-row-name">{n.patient_name}</div><div className="sf-row-meta">{n.mrn} · {n.visit_type} · {n.visit_date}</div></div>
                      </div>
                      <div className="sf-row-right"><span className={`badge ${s.cls}`}>{s.label}</span></div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ─── GRADES ───────────────────────────────────────

  if (screen === 'grades') {
    const avgScore = grades.length > 0 ? Math.round(grades.reduce((a, g) => a + (g.overall_score || 0), 0) / grades.length) : 0
    return (
      <div className="sf-page">
        <SidebarEl /><Overlay open={sidebar.open} onClick={sidebar.close} /><Hamburger onClick={sidebar.toggle} />
        <div className="sf-main">
          <div className="sf-topbar">
            <div><div className="sf-topbar-title">My Grades</div><div className="sf-topbar-meta">Feedback from QPS on your notes</div></div>
            <div className="sf-avatar">{(currentUser.name || 'S').charAt(0).toUpperCase()}</div>
          </div>
          <div className="sf-body">
            <div className="sf-stats" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
              {[['Notes Graded', grades.length, '#0F1E3C'],['Average Score', avgScore || '—', avgScore >= 90 ? '#0D9E8A' : avgScore >= 75 ? '#E8940A' : '#E24B4A'],['Top Score', grades.length > 0 ? Math.max(...grades.map(g => g.overall_score || 0)) : '—', '#0D9E8A']].map(([l, v, c]) => (
                <div key={l} className="sf-stat"><div className="sf-stat-val" style={{ color: c }}>{v}</div><div className="sf-stat-lbl">{l}</div></div>
              ))}
            </div>
            <div className="sf-section-label">Grade History</div>
            {loadingGrades ? <Empty icon="⏳" title="Loading grades..." /> :
             grades.length === 0 ? <Empty icon="⭐" title="No grades yet" sub="Grades from QPS will appear here once your notes are reviewed." /> :
             selectedGrade ? (
              <div>
                <button style={st.backLink} onClick={() => setSelectedGrade(null)}>← Back to grades</button>
                <div style={st.gradeCard}>
                  <div style={st.gradeCardTop}>
                    <div>
                      <div style={st.gradeName}>{selectedGrade.patient_name}</div>
                      <div style={st.gradeMeta}>{selectedGrade.mrn} · {selectedGrade.visit_type} · {selectedGrade.visit_date} · {selectedGrade.clinician_name}</div>
                    </div>
                    <div style={{ fontSize: 36, fontWeight: 700, color: selectedGrade.overall_score >= 90 ? '#0D9E8A' : selectedGrade.overall_score >= 75 ? '#E8940A' : '#E24B4A', lineHeight: 1 }}>
                      {selectedGrade.overall_score}<span style={{ fontSize: 14, color: '#888780', fontWeight: 400 }}>/100</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
                    {[['Accuracy', selectedGrade.accuracy],['Completeness', selectedGrade.completeness],['Medical Terminology', selectedGrade.terminology],['Formatting', selectedGrade.formatting]].map(([l, v]) => (
                      <div key={l}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: 13, color: '#0F1E3C', fontWeight: 500 }}>{l}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: v >= 90 ? '#0D9E8A' : v >= 75 ? '#E8940A' : '#E24B4A' }}>{v}/100</span>
                        </div>
                        <ScoreBar value={v} />
                      </div>
                    ))}
                  </div>
                  {selectedGrade.comment && (
                    <div style={st.commentBox}>
                      <div style={st.commentLabel}>💬 Feedback from QPS ({selectedGrade.qps_name})</div>
                      <div style={st.commentText}>{selectedGrade.comment}</div>
                    </div>
                  )}
                  {selectedGrade.final_note && (
                    <div style={{ marginTop: 16 }}>
                      <div style={st.commentLabel}>📄 Your Note</div>
                      <pre style={st.notePreview}>{selectedGrade.final_note}</pre>
                    </div>
                  )}
                </div>
              </div>
            ) : grades.map(g => (
              <div key={g.id} className="sf-row" style={{ cursor: 'pointer' }} onClick={() => setSelectedGrade(g)}>
                <div className="sf-row-left">
                  <div style={{ width: 48, height: 48, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, background: g.overall_score >= 90 ? '#E1F5EE' : g.overall_score >= 75 ? '#FAEEDA' : '#FCEBEB', color: g.overall_score >= 90 ? '#085041' : g.overall_score >= 75 ? '#633806' : '#501313' }}>{g.overall_score}</div>
                  <div>
                    <div className="sf-row-name">{g.patient_name}</div>
                    <div className="sf-row-meta">{g.mrn} · {g.visit_type} · {g.visit_date} · {g.clinician_name}</div>
                    {g.comment && <div style={{ fontSize: 12, color: '#5F5E5A', marginTop: 4, fontStyle: 'italic' }}>"{g.comment.length > 60 ? g.comment.slice(0, 60) + '...' : g.comment}"</div>}
                  </div>
                </div>
                <div className="sf-row-right"><span style={{ fontSize: 12, color: '#0D9E8A', fontWeight: 500 }}>View →</span></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ─── PROFILE ──────────────────────────────────────

  if (screen === 'profile') {
    return (
      <div className="sf-page">
        <SidebarEl /><Overlay open={sidebar.open} onClick={sidebar.close} /><Hamburger onClick={sidebar.toggle} />
        <div className="sf-main">
          <div className="sf-topbar">
            <div><div className="sf-topbar-title">My Profile</div><div className="sf-topbar-meta">Your account details</div></div>
            <div className="sf-avatar">{(currentUser.name || 'S').charAt(0).toUpperCase()}</div>
          </div>
          <div className="sf-body">
            <div style={st.card}>
              <div style={st.profileTop}>
                <div style={st.profileAvatar}>{(currentUser.name || 'S').charAt(0).toUpperCase()}</div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#0F1E3C' }}>{currentUser.name}</div>
                  <div style={{ fontSize: 13, color: '#888780', marginTop: 3 }}>Medical Scribe</div>
                  <span style={{ ...st.badge, background: '#E1F5EE', color: '#085041', marginTop: 8, display: 'inline-flex' }}>● Active</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[['Email', currentUser.email || '—'],['Phone', currentUser.phone || '—']].map(([l, v]) => (
                  <div key={l}><div style={st.fieldLabel}>{l}</div><div style={st.fieldVal}>{v}</div></div>
                ))}
              </div>
            </div>
            <div style={{ ...st.card, marginTop: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#0F1E3C', marginBottom: 14 }}>My Activity</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                {[['Notes Written', myNotes.length, '#0F1E3C'],['Notes Submitted', myNotes.filter(n => ['submitted','uploaded'].includes(n.status)).length, '#0D9E8A'],['Notes Graded', grades.length, '#E8940A']].map(([l, v, c]) => (
                  <div key={l} style={{ background: '#F5F5F3', borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 22, fontWeight: 600, color: c, lineHeight: 1 }}>{v}</div>
                    <div style={{ fontSize: 12, color: '#888780', marginTop: 5 }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ ...st.card, marginTop: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#0F1E3C', marginBottom: 14 }}>Change Password</div>
              <ChangePassword showNotif={showNotif} />
            </div>
          </div>
        </div>
        {notif && <Notif notif={notif} />}
      </div>
    )
  }

  // ─── PROVIDER SELECTION ───────────────────────────

  if (screen === 'providers') {
    return (
      <div className="sf-page">
        <SidebarEl /><Overlay open={sidebar.open} onClick={sidebar.close} /><Hamburger onClick={sidebar.toggle} />
        <div className="sf-main">
          <div className="sf-topbar">
            <div><div className="sf-topbar-title">Select Provider</div><div className="sf-topbar-meta">Step 1 of 2 — Choose your assigned clinician</div></div>
            <div className="sf-avatar">{(currentUser.name || 'S').charAt(0).toUpperCase()}</div>
          </div>
          <div className="sf-body">
            {loadingProviders ? <Empty icon="⏳" title="Loading..." /> :
             providers.length === 0 ? <Empty icon="🏥" title="No providers assigned" sub="Ask your admin to assign you to a clinician." /> : (
              <div className="sf-provider-grid">
                {providers.map(p => {
                  const id   = p.clinician_id || p.id
                  const name = p.clinician_name || p.name || 'Unknown'
                  return (
                    <div key={id} className="sf-provider-card"
                      onClick={() => { setSelectedProvider({ id, name, specialty: p.specialty || '' }); setSelectedDate(localDateStr(0)); setScreen('date') }}>
                      <div className="sf-provider-avatar">{(name || 'U').charAt(0).toUpperCase()}</div>
                      <div style={{ flex: 1 }}><div className="sf-provider-name">{name}</div><div className="sf-provider-spec">{p.specialty || 'Clinician'}</div></div>
                      <span style={{ fontSize: 18, color: '#C4C2B9' }}>→</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ─── DATE SELECTION ───────────────────────────────

  if (screen === 'date') {
    const QUICK = [{ label: 'Today', date: localDateStr(0) },{ label: 'Yesterday', date: localDateStr(-1) },{ label: '2 days ago', date: localDateStr(-2) },{ label: '3 days ago', date: localDateStr(-3) }]
    return (
      <div className="sf-page">
        <SidebarEl /><Overlay open={sidebar.open} onClick={sidebar.close} /><Hamburger onClick={sidebar.toggle} />
        <div className="sf-main">
          <div className="sf-topbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="sf-back" onClick={() => { setScreen('providers'); setSelectedProvider(null) }}>← Back</span>
              <div><div className="sf-topbar-title">{selectedProvider?.name}</div><div className="sf-topbar-meta">Step 2 of 2 — Select a date</div></div>
            </div>
            <div className="sf-avatar">{(currentUser.name || 'S').charAt(0).toUpperCase()}</div>
          </div>
          <div className="sf-body">
            <div style={{ maxWidth: 480 }}>
              <div className="sf-section-label">Quick Select</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
                {QUICK.map(({ label, date }) => {
                  const isSel = selectedDate === date
                  return (
                    <div key={date} onClick={() => setSelectedDate(date)} style={{ padding: '14px 16px', borderRadius: 12, cursor: 'pointer', border: `2px solid ${isSel ? '#0F1E3C' : '#E8E8E4'}`, background: isSel ? '#0F1E3C' : '#fff', transition: 'all .15s' }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: isSel ? '#fff' : '#0F1E3C' }}>{label}</div>
                      <div style={{ fontSize: 12, color: isSel ? 'rgba(255,255,255,.6)' : '#888780', marginTop: 3 }}>{fmtShortDate(date)}</div>
                    </div>
                  )
                })}
              </div>
              <div className="sf-section-label">Or Pick a Date</div>
              <input type="date" value={selectedDate} max={localDateStr(0)} onChange={e => setSelectedDate(e.target.value)}
                style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '2px solid #E8E8E4', fontSize: 14, color: '#0F1E3C', outline: 'none', fontFamily: 'inherit', background: '#FAFAF8', boxSizing: 'border-box', marginBottom: 24, cursor: 'pointer' }} />
              {selectedDate && (
                <div style={{ background: '#E1F5EE', border: '1px solid #9FE1CB', borderRadius: 12, padding: '12px 16px', marginBottom: 24 }}>
                  <div style={{ fontSize: 12, color: '#085041', fontWeight: 600, marginBottom: 2 }}>Selected Date</div>
                  <div style={{ fontSize: 14, color: '#0F1E3C', fontWeight: 500 }}>{fmtDateLabel(selectedDate)}</div>
                </div>
              )}
              <button style={{ width: '100%', padding: '14px', borderRadius: 12, background: '#0F1E3C', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                onClick={() => { loadRecordings(selectedProvider.id, selectedDate); setScreen('recordings') }}>
                View Recordings for {fmtShortDate(selectedDate)} →
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ─── RECORDINGS LIST ──────────────────────────────

  if (screen === 'recordings') {
    const pending   = recordings.filter(r => ['recording-uploaded','note-ready'].includes(r.status)).length
    const submitted = recordings.filter(r => ['submitted','uploaded'].includes(r.status)).length
    return (
      <div className="sf-page">
        <SidebarEl /><Overlay open={sidebar.open} onClick={sidebar.close} /><Hamburger onClick={sidebar.toggle} />
        <div className="sf-main">
          <div className="sf-topbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="sf-back" onClick={() => setScreen('date')}>← Back</span>
              <div><div className="sf-topbar-title">{selectedProvider?.name}</div><div className="sf-topbar-meta">{fmtDateLabel(selectedDate)} · {recordings.length} recording{recordings.length !== 1 ? 's' : ''}</div></div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => setScreen('date')} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: '#F1EFE8', color: '#5F5E5A', border: '1px solid #E8E8E4', cursor: 'pointer', fontFamily: 'inherit' }}>📅 Change Date</button>
              <div className="sf-avatar">{(currentUser.name || 'S').charAt(0).toUpperCase()}</div>
            </div>
          </div>
          <div className="sf-body">
            <div className="sf-stats" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
              <div className="sf-stat"><div className="sf-stat-val" style={{ color: '#0F1E3C' }}>{recordings.length}</div><div className="sf-stat-lbl">Total</div></div>
              <div className="sf-stat"><div className="sf-stat-val" style={{ color: '#E8940A' }}>{pending}</div><div className="sf-stat-lbl">Pending</div></div>
              <div className="sf-stat"><div className="sf-stat-val" style={{ color: '#0D9E8A' }}>{submitted}</div><div className="sf-stat-lbl">Submitted</div></div>
            </div>
            <div className="sf-section-label">Patient Recordings — {fmtShortDate(selectedDate)}</div>
            {loadingRecordings ? <Empty icon="⏳" title="Loading..." /> :
             recordings.length === 0 ? <Empty icon="📭" title="No recordings for this date" sub={`No visits found for ${selectedProvider?.name} on ${fmtDateLabel(selectedDate)}`} /> :
             recordings.map(rec => {
const effectiveStatus = ['submitted','uploaded'].includes(rec.note_status)
  ? rec.note_status
  : rec.status
const s      = STATUS_CFG[effectiveStatus] || { label: effectiveStatus, cls: 'badge-gray' }
const isDone = ['submitted','uploaded'].includes(rec.note_status)
              return (
                <div key={rec.id} className="sf-row">
                  <div className="sf-row-left">
                    <span style={{ fontSize: 22 }}>🎙</span>
                    <div>
                      <div className="sf-row-name">{rec.patient_name}</div>
                      <div className="sf-row-meta">{rec.mrn} · {rec.visit_type} · {fmtTime(rec.visit_time)} · {fmtDuration(rec.duration_seconds)}</div>
                    </div>
                  </div>
                  <div className="sf-row-right">
                    <span className={`badge ${s.cls}`}>{s.label}</span>
                    <button className={`btn ${isDone ? 'btn-ghost' : 'btn-navy'}`} onClick={() => openRecording(rec)}>{isDone ? 'View Note' : 'Start Note'}</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ─── NOTE EDITOR ──────────────────────────────────

  const isDone = ['submitted','uploaded'].includes(selectedRec?.status)
  return (
    <div className="sf-page-fixed">
      <SidebarEl /><Overlay open={sidebar.open} onClick={sidebar.close} /><Hamburger onClick={sidebar.toggle} />
      <div className="sf-main-fixed">
        <div className="sf-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="sf-back" onClick={() => setScreen('recordings')}>← Back</span>
            <div>
              <div className="sf-topbar-title">{selectedRec?.patient_name} — {selectedRec?.visit_type}</div>
              <div className="sf-topbar-meta">{selectedRec?.mrn} · {selectedProvider?.name} · {fmtTime(selectedRec?.visit_time)} · {selectedDate}</div>
            </div>
          </div>
          <div className="sf-avatar">{(currentUser.name || 'S').charAt(0).toUpperCase()}</div>
        </div>

        <AudioPlayer visitId={selectedRec?.id} durationSecs={selectedRec?.duration_seconds || 0} />

        {notif && <div className={`sf-notif sf-notif-${notif.type}`}>✓ {notif.msg}</div>}

        <div className="sf-panels">
          <div className="sf-panel">
            <div className="sf-panel-head"><span className="sf-panel-title">Transcription</span><span className="badge badge-gray">Auto</span></div>
            <div className="sf-panel-body">
              {loadingNote ? <div style={{ color: '#888780', fontSize: 13 }}>Loading...</div> :
               note?.transcription ? note.transcription.split('\n\n').map((block, i) => (
                <div key={i} className="sf-transcript-block"><span className="sf-speaker-txt">{block}</span></div>
              )) : (
                <div style={{ color: '#888780', fontSize: 13, lineHeight: 1.7 }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>🎙</div>
                  <div style={{ fontWeight: 500, color: '#0F1E3C', marginBottom: 4 }}>Transcription pending</div>
                  <div>Will appear after AI processing.</div>
                </div>
              )}
            </div>
          </div>
          <div className="sf-panel">
            <div className="sf-panel-head"><span className="sf-panel-title">AI Draft</span><span className="badge badge-blue">AI Generated</span></div>
            {loadingNote ? <div style={{ padding: 12, color: '#888780', fontSize: 13 }}>Loading...</div> :
             note?.ai_draft ? <textarea className="sf-textarea sf-textarea-readonly" value={note.ai_draft} readOnly /> : (
              <div style={{ padding: 16, color: '#888780', fontSize: 13, lineHeight: 1.7 }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>🤖</div>
                <div style={{ fontWeight: 500, color: '#0F1E3C', marginBottom: 4 }}>AI draft pending</div>
                <div>Will appear after transcription is processed.</div>
              </div>
            )}
          </div>
          <div className="sf-panel">
            <div className="sf-panel-head"><span className="sf-panel-title">Final Note</span><span className={`badge ${isDone ? 'badge-green' : 'badge-amber'}`}>{isDone ? 'Submitted' : 'Editing'}</span></div>
            {loadingNote ? <div style={{ padding: 12, color: '#888780', fontSize: 13 }}>Loading...</div> : (
              <textarea className="sf-textarea" value={finalNote} onChange={e => setFinalNote(e.target.value)}
                readOnly={isDone} style={isDone ? { background: '#FAFAF8', cursor: 'default' } : {}}
                placeholder="Write the final clinical note here..." spellCheck />
            )}
            {!isDone && (
              <div className="sf-bottom-bar">
                <button className="btn btn-amber" onClick={saveDraft} disabled={saving}>{saving ? 'Saving...' : 'Save Draft'}</button>
                <button className="btn btn-teal" style={{ marginLeft: 'auto' }} onClick={uploadToEMR} disabled={saving}>{saving ? 'Uploading...' : 'Upload to EMR'}</button>
              </div>
            )}
            {isDone && (
              <div className="sf-bottom-bar" style={{ justifyContent: 'center' }}>
                <span style={{ fontSize: 13, color: '#085041', fontWeight: 500 }}>✓ Note submitted — clinician has been notified</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function Empty({ icon, title, sub }) {
  return (
    <div style={{ padding: 48, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ fontSize: 36 }}>{icon}</div>
      {title && <div style={{ fontSize: 15, fontWeight: 600, color: '#0F1E3C' }}>{title}</div>}
      {sub   && <div style={{ fontSize: 13, color: '#888780' }}>{sub}</div>}
    </div>
  )
}

function Notif({ notif }) {
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 999, background: notif.type === 'red' ? '#FCEBEB' : '#0F1E3C', color: notif.type === 'red' ? '#A32D2D' : '#fff', padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 500, boxShadow: '0 4px 20px rgba(0,0,0,.15)' }}>
      {notif.type === 'red' ? '⚠ ' : '✓ '}{notif.msg}
    </div>
  )
}

function ChangePassword({ showNotif }) {
  const [current, setCurrent] = useState('')
  const [newPass, setNewPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving]   = useState(false)
  const handle = async () => {
    if (!current || !newPass) { showNotif('All fields are required.', 'red'); return }
    if (newPass !== confirm)  { showNotif('Passwords do not match.', 'red'); return }
    if (newPass.length < 6)   { showNotif('Minimum 6 characters.', 'red'); return }
    try {
      setSaving(true)
      await authAPI.changePassword(current, newPass)
      showNotif('Password changed successfully')
      setCurrent(''); setNewPass(''); setConfirm('')
    } catch (err) { showNotif(err.message, 'red') }
    finally { setSaving(false) }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[['Current Password', current, setCurrent],['New Password', newPass, setNewPass],['Confirm New Password', confirm, setConfirm]].map(([l, v, setter]) => (
        <div key={l} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={st.fieldLabel}>{l}</label>
          <input type="password" style={st.input} value={v} onChange={e => setter(e.target.value)} placeholder="••••••••" />
        </div>
      ))}
      <button style={st.btnTeal} onClick={handle} disabled={saving}>{saving ? 'Changing...' : 'Change Password'}</button>
    </div>
  )
}

// ─── STYLES ───────────────────────────────────────────────────────────────────

const st = {
  navBadge:     { marginLeft: 'auto', background: 'rgba(255,255,255,.15)', borderRadius: 10, fontSize: 10, padding: '1px 7px', color: 'rgba(255,255,255,.7)' },
  card:         { background: '#fff', border: '1px solid #E8E8E4', borderRadius: 12, padding: 24 },
  profileTop:   { display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid #F1EFE8' },
  profileAvatar:{ width: 64, height: 64, borderRadius: '50%', background: '#0F1E3C', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 600, flexShrink: 0 },
  fieldLabel:   { fontSize: 11, fontWeight: 600, color: '#888780', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 },
  fieldVal:     { fontSize: 14, color: '#0F1E3C' },
  badge:        { padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600 },
  input:        { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E8E8E4', fontSize: 13, color: '#0F1E3C', outline: 'none', fontFamily: 'inherit', background: '#FAFAF8', boxSizing: 'border-box' },
  btnTeal:      { padding: '8px 16px', borderRadius: 8, background: '#0D9E8A', color: '#fff', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  provHeader:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', marginBottom: 8, borderBottom: '2px solid #E8E8E4' },
  provDot:      { width: 10, height: 10, borderRadius: '50%', background: '#0D9E8A', flexShrink: 0 },
  provName:     { fontSize: 14, fontWeight: 700, color: '#0F1E3C' },
  provMeta:     { fontSize: 12, color: '#888780', marginTop: 2 },
  backLink:     { fontSize: 13, color: '#0D9E8A', cursor: 'pointer', fontWeight: 500, background: 'none', border: 'none', padding: '0 0 16px', display: 'block', fontFamily: 'inherit' },
  gradeCard:    { background: '#fff', border: '1px solid #E8E8E4', borderRadius: 12, padding: 24 },
  gradeCardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid #F1EFE8' },
  gradeName:    { fontSize: 16, fontWeight: 700, color: '#0F1E3C', marginBottom: 4 },
  gradeMeta:    { fontSize: 12, color: '#888780' },
  commentBox:   { background: '#F5F5F3', borderRadius: 10, padding: 16, marginTop: 16 },
  commentLabel: { fontSize: 11, fontWeight: 600, color: '#888780', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 },
  commentText:  { fontSize: 13, color: '#0F1E3C', lineHeight: 1.6 },
  notePreview:  { fontSize: 12, lineHeight: 1.7, color: '#5F5E5A', fontFamily: "'Segoe UI', system-ui, sans-serif", whiteSpace: 'pre-wrap', margin: 0, background: '#FAFAF8', padding: 12, borderRadius: 8, border: '1px solid #E8E8E4' },
}