import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { authAPI, usersAPI, notesAPI } from '../../services/api'

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function fmtTime(t) {
    if (!t) return ''
    const [h, m] = t.split(':')
    const hour = parseInt(h)
    return `${hour > 12 ? hour - 12 : hour === 0 ? 12 : hour}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
}

function fmtSecs(s) {
    if (!s || isNaN(s) || !isFinite(s) || s < 0) return '00:00'
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

// ─── AUDIO PLAYER ─────────────────────────────────────────────────────────────

function AudioPlayer({ visitId }) {
    const [status, setStatus]     = useState('loading')
    const [isPlaying, setPlaying] = useState(false)
    const [current, setCurrent]   = useState(0)
    const [duration, setDuration] = useState(0)
    const audioRef = useRef(null)
    const blobRef  = useRef(null)

    useEffect(() => {
        if (!visitId) { setStatus('error'); return }
        setStatus('loading'); setPlaying(false); setCurrent(0); setDuration(0)

        const token = localStorage.getItem('token')
        fetch(`http://localhost:5000/api/audio/${visitId}`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(res => { if (!res.ok) throw new Error('no audio'); return res.blob() })
            .then(blob => {
                if (!blob || blob.size === 0) throw new Error('empty')
                if (blobRef.current) URL.revokeObjectURL(blobRef.current)
                blobRef.current = URL.createObjectURL(blob)
                if (audioRef.current) {
                    audioRef.current.src = blobRef.current
                    audioRef.current.load()
                }
                setStatus('ready')
            })
            .catch(() => setStatus('error'))

        return () => {
            if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = '' }
            if (blobRef.current)  { URL.revokeObjectURL(blobRef.current); blobRef.current = null }
        }
    }, [visitId])

    useEffect(() => {
        const audio = audioRef.current
        if (!audio) return

        const onMeta = () => {
            const dur = audio.duration
            if (dur && isFinite(dur) && !isNaN(dur) && dur > 0) {
                setDuration(Math.floor(dur))
            }
        }
        const onTime  = () => { if (audio.currentTime >= 0) setCurrent(Math.floor(audio.currentTime)) }
        const onEnded = () => { setPlaying(false); setCurrent(0) }

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
        const t = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + secs))
        audio.currentTime = t
        setCurrent(Math.floor(t))
    }

    const seek = (e) => {
        const audio = audioRef.current
        if (!audio || status !== 'ready' || !duration) return
        const rect = e.currentTarget.getBoundingClientRect()
        const t = Math.round(((e.clientX - rect.left) / rect.width) * duration)
        audio.currentTime = t
        setCurrent(t)
    }

    const canPlay  = status === 'ready'
    const progress = duration > 0 ? Math.min(100, (current / duration) * 100) : 0
    const totalStr = duration > 0 && isFinite(duration) ? fmtSecs(duration) : '--:--'

    return (
        <div style={s.audioBar}>
            <audio ref={audioRef} preload="metadata" style={{ display: 'none' }} />

            <div style={{ flexShrink: 0 }}>
                <div style={{ ...s.audioLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
                    🎙 Visit Recording
                    {status === 'loading' && <span style={{ fontSize: 10, color: '#888780', fontWeight: 400 }}>Loading...</span>}
                    {status === 'ready'   && <span style={{ fontSize: 10, color: '#0D9E8A', fontWeight: 400 }}>● Ready</span>}
                    {status === 'error'   && <span style={{ fontSize: 10, color: '#B4B2A9', fontWeight: 400 }}>No audio</span>}
                </div>
                <div style={s.audioTime}>{fmtSecs(current)} / {totalStr}</div>
            </div>

            <div style={s.audioControls}>
                <button style={{ ...s.skipBtn, opacity: canPlay ? 1 : 0.35 }} onClick={() => skip(-5)}>−5s</button>
                <button style={{ ...s.playBtn, opacity: canPlay ? 1 : 0.35, cursor: canPlay ? 'pointer' : 'not-allowed' }} onClick={toggle}>
                    {status === 'loading' ? '⏳' : isPlaying ? '⏸' : '▶'}
                </button>
                <button style={{ ...s.skipBtn, opacity: canPlay ? 1 : 0.35 }} onClick={() => skip(5)}>+5s</button>
            </div>

            <div style={{ flex: 1 }}>
                <div style={{ height: 5, background: '#E8E8E4', borderRadius: 3, overflow: 'hidden', cursor: canPlay ? 'pointer' : 'default' }}
                     onClick={canPlay ? seek : undefined}>
                    <div style={{ height: '100%', background: '#0D9E8A', borderRadius: 3, width: `${progress}%`, transition: 'width 0.5s linear' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                    <span style={{ fontSize: 10, color: '#888780' }}>{fmtSecs(current)}</span>
                    <span style={{ fontSize: 10, color: '#888780' }}>{totalStr}</span>
                </div>
            </div>
        </div>
    )
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export default function QPS() {
    const navigate    = useNavigate()
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}')

    const [screen, setScreen]                     = useState('provider')
    const [activeTab, setActiveTab]               = useState('notes')
    const [providers, setProviders]               = useState([])
    const [selectedProvider, setSelectedProvider] = useState(null)
    const [notes, setNotes]                       = useState([])
    const [gradedNotes, setGradedNotes]           = useState([])
    const [selectedNote, setSelectedNote]         = useState(null)
    const [profile, setProfile]                   = useState({
        name: currentUser.name || '', email: currentUser.email || '', phone: currentUser.phone || ''
    })
    const [profileEdit, setProfileEdit]           = useState(false)
    const [profDraft, setProfDraft]               = useState(profile)
    const [loadingProviders, setLoadingProviders] = useState(true)
    const [loadingNotes, setLoadingNotes]         = useState(false)
    const [loadingGraded, setLoadingGraded]       = useState(false)
    const [submitting, setSubmitting]             = useState(false)
    const [notif, setNotif]                       = useState(null)
    const [scores, setScores] = useState({ accuracy: 88, completeness: 92, terminology: 85, formatting: 95 })
    const [comment, setComment] = useState('')

    const overallScore = Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / 4)
    const isGraded     = selectedNote?.status === 'uploaded'

    useEffect(() => { loadProviders() }, [])
    useEffect(() => { if (activeTab === 'graded') loadGradedNotes() }, [activeTab])

    // ── API ───────────────────────────────────────────

    const loadProviders = async () => {
        try {
            setLoadingProviders(true)
            const data = await usersAPI.getByRole('clinician')
            setProviders(data.users || [])
        } catch (err) { showNotif(`Failed to load providers: ${err.message}`, 'error') }
        finally { setLoadingProviders(false) }
    }

    const loadNotes = async (providerId) => {
        try {
            setLoadingNotes(true)
            const data = await notesAPI.getAllNotes(providerId, null)
            setNotes((data.notes || []).filter(n => ['submitted','uploaded','draft'].includes(n.status)))
        } catch (err) { showNotif(`Failed to load notes: ${err.message}`, 'error') }
        finally { setLoadingNotes(false) }
    }

    const loadGradedNotes = async () => {
        try {
            setLoadingGraded(true)
            const data = await notesAPI.getAllNotes(null, 'uploaded')
            setGradedNotes(data.notes || [])
        } catch (err) { showNotif(`Failed to load graded notes: ${err.message}`, 'error') }
        finally { setLoadingGraded(false) }
    }

    const showNotif = (msg, type = 'success') => {
        setNotif({ msg, type })
        setTimeout(() => setNotif(null), 3000)
    }

    const openNote = (note) => {
        setSelectedNote(note)
        setScores({ accuracy: 88, completeness: 92, terminology: 85, formatting: 95 })
        setComment('')
        setScreen('review')
    }

    const handleSubmit = async () => {
        if (!comment.trim()) { showNotif('Please write a comment before submitting.', 'error'); return }
        try {
            setSubmitting(true)
            await notesAPI.submitGrade({
                note_id: selectedNote.id,
                accuracy: scores.accuracy, completeness: scores.completeness,
                terminology: scores.terminology, formatting: scores.formatting,
                comment,
            })
            setNotes(prev => prev.map(n => n.id === selectedNote.id ? { ...n, status: 'uploaded' } : n))
            showNotif('Grade submitted successfully')
            setTimeout(() => {
                setScreen('recordings')
                setComment('')
                setScores({ accuracy: 88, completeness: 92, terminology: 85, formatting: 95 })
            }, 2000)
        } catch (err) { showNotif(`Failed to submit: ${err.message}`, 'error') }
        finally { setSubmitting(false) }
    }

    const handleNav = (tab) => {
        setActiveTab(tab)
        if (tab === 'notes') selectedProvider ? setScreen('recordings') : setScreen('provider')
        else setScreen(tab)
    }

    // ─── SIDEBAR ──────────────────────────────────────
    const Sidebar = () => (
        <div style={s.sidebar}>
            <div style={s.sTop}>
                <div style={s.logo}>Anot</div>
                <div style={s.logoSub}>QPS Portal</div>
            </div>
            <nav style={s.nav}>
                {[['notes','📋','Notes'],['graded','⭐','Graded'],['profile','👤','Profile']].map(([k, icon, label]) => (
                    <div key={k} style={{ ...s.navItem, ...(activeTab === k ? s.navActive : {}) }}
                         onClick={() => handleNav(k)}>
                        <span>{icon}</span>{label}
                        {k === 'graded' && gradedNotes.length > 0 && (
                            <span style={s.navBadge}>{gradedNotes.length}</span>
                        )}
                    </div>
                ))}
            </nav>
            {selectedProvider && activeTab === 'notes' && (
                <div style={s.provChip}>
                    <div style={s.chipLabel}>Current Provider</div>
                    <div style={s.chipName}>{selectedProvider.name}</div>
                    <div style={s.chipSpec}>{selectedProvider.specialty || 'Clinician'}</div>
                    <div style={s.changeBtn} onClick={() => {
                        setScreen('provider'); setSelectedProvider(null)
                        setSelectedNote(null); setNotes([])
                    }}>Change provider</div>
                </div>
            )}
            <div style={s.sFooter}>
                <div style={s.fName}>{currentUser.name || 'QPS'}</div>
                <div style={s.fRole}>Quality & Performance</div>
                <div style={s.logout} onClick={() => { authAPI.logout(); navigate('/') }}>Sign out</div>
            </div>
        </div>
    )

    // ─── GRADED NOTES ─────────────────────────────────
    if (screen === 'graded') {
        return (
            <div style={s.page}>
                <Sidebar />
                <div style={s.main}>
                    <div style={s.topbar}>
                        <div>
                            <div style={s.topTitle}>Graded Notes</div>
                            <div style={s.topMeta}>All notes you have graded</div>
                        </div>
                        <div style={s.avatar}>{(currentUser.name || 'Q').charAt(0).toUpperCase()}</div>
                    </div>
                    <div style={s.body}>
                        <div style={s.statsRow}>
                            <StatCard label="Total Graded"      value={gradedNotes.length} color="#0F1E3C" />
                            <StatCard label="Providers Covered" value={[...new Set(gradedNotes.map(n => n.clinician_id))].length} color="#0D9E8A" />
                            <StatCard label="This Month"        value={gradedNotes.filter(n => {
                                const d = new Date(n.updated_at), now = new Date()
                                return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
                            }).length} color="#378ADD" />
                        </div>
                        <div style={s.secLabel}>All Graded Notes</div>
                        {loadingGraded ? <Loading /> : gradedNotes.length === 0 ? (
                            <Empty icon="⭐" title="No graded notes yet" sub="Notes you grade will appear here." />
                        ) : gradedNotes.map(note => (
                            <div key={note.id} style={s.recRow}>
                                <div style={s.recLeft}>
                                    <div style={s.recIcon}>📋</div>
                                    <div>
                                        <div style={s.recName}>{note.patient_name}</div>
                                        <div style={s.recMeta}>
                                            {note.mrn} · {note.visit_type} · {fmtTime(note.visit_time)} · {note.clinician_name}
                                            {note.scribe_name ? ` · Scribe: ${note.scribe_name}` : ''}
                                        </div>
                                    </div>
                                </div>
                                <div style={s.recRight}>
                                    <span style={{ ...s.badge, background: '#E1F5EE', color: '#085041' }}>Graded</span>
                                    <button style={{ ...s.openBtn, ...s.openBtnGray }} onClick={() => openNote(note)}>View Grade</button>
                                </div>
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
            <div style={s.page}>
                <Sidebar />
                <div style={s.main}>
                    <div style={s.topbar}>
                        <div>
                            <div style={s.topTitle}>My Profile</div>
                            <div style={s.topMeta}>Manage your account</div>
                        </div>
                        <div style={s.avatar}>{(currentUser.name || 'Q').charAt(0).toUpperCase()}</div>
                    </div>
                    <div style={s.body}>
                        <div style={s.profileCard}>
                            <div style={s.profileTop}>
                                <div style={s.profileAvatar}>{(profile.name || 'Q').charAt(0).toUpperCase()}</div>
                                <div>
                                    <div style={{ fontSize: 18, fontWeight: 700, color: '#0F1E3C' }}>{profile.name}</div>
                                    <div style={{ fontSize: 13, color: '#888780', marginTop: 3 }}>Quality & Performance Specialist</div>
                                    <span style={{ ...s.badge, background: '#E1F5EE', color: '#085041', marginTop: 8, display: 'inline-flex' }}>● Active</span>
                                </div>
                            </div>
                            {!profileEdit ? (
                                <>
                                    <div style={s.profileGrid}>
                                        {[['Email', profile.email],['Phone', profile.phone || '—']].map(([l, v]) => (
                                            <div key={l}><div style={s.fieldLabel}>{l}</div><div style={s.fieldVal}>{v}</div></div>
                                        ))}
                                    </div>
                                    <button style={s.btnNavy} onClick={() => { setProfDraft(profile); setProfileEdit(true) }}>✏️ Edit Profile</button>
                                </>
                            ) : (
                                <>
                                    <div style={s.profileGrid}>
                                        {[['Full Name','name'],['Email','email'],['Phone','phone']].map(([l, k]) => (
                                            <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
                                                <label style={s.fieldLabel}>{l}</label>
                                                <input style={s.input} value={profDraft[k] || ''}
                                                       onChange={e => setProfDraft({ ...profDraft, [k]: e.target.value })} />
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button style={s.btnTeal} onClick={() => { setProfile(profDraft); setProfileEdit(false); showNotif('Profile updated') }}>Save Changes</button>
                                        <button style={s.btnGhost} onClick={() => setProfileEdit(false)}>Cancel</button>
                                    </div>
                                </>
                            )}
                        </div>
                        <div style={{ ...s.profileCard, marginTop: 16 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: '#0F1E3C', marginBottom: 14 }}>My Statistics</div>
                            <div style={s.statsRow}>
                                <StatCard label="Notes Graded"       value={gradedNotes.length} color="#0F1E3C" />
                                <StatCard label="Providers Reviewed" value={[...new Set(gradedNotes.map(n => n.clinician_id))].length} color="#0D9E8A" />
                                <StatCard label="Pending Review"     value={notes.filter(n => n.status !== 'uploaded').length} color="#E8940A" />
                            </div>
                        </div>
                        <div style={{ ...s.profileCard, marginTop: 16 }}>
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
    if (screen === 'provider') {
        return (
            <div style={s.page}>
                <Sidebar />
                <div style={s.main}>
                    <div style={s.topbar}>
                        <div>
                            <div style={s.topTitle}>Select Provider</div>
                            <div style={s.topMeta}>Choose a provider to review submitted notes</div>
                        </div>
                        <div style={s.avatar}>{(currentUser.name || 'Q').charAt(0).toUpperCase()}</div>
                    </div>
                    <div style={s.body}>
                        {loadingProviders ? <Loading /> : providers.length === 0 ? (
                            <Empty icon="🏥" title="No providers found" sub="Clinicians need to be registered first." />
                        ) : (
                            <div style={s.provGrid}>
                                {providers.map(p => (
                                    <div key={p.id} style={s.provCard}
                                         onClick={() => { setSelectedProvider(p); loadNotes(p.id); setScreen('recordings'); setActiveTab('notes') }}>
                                        <div style={s.provAvatar}>{p.name.charAt(0).toUpperCase()}</div>
                                        <div style={s.provInfo}>
                                            <div style={s.provName}>{p.name}</div>
                                            <div style={s.provSpec}>{p.specialty || 'Clinician'}</div>
                                        </div>
                                        <div style={s.arrow}>→</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )
    }

    // ─── NOTES LIST ───────────────────────────────────
    if (screen === 'recordings') {
        const pending = notes.filter(n => ['submitted','draft'].includes(n.status)).length
        const graded  = notes.filter(n => n.status === 'uploaded').length

        return (
            <div style={s.page}>
                <Sidebar />
                <div style={s.main}>
                    <div style={s.topbar}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={s.backBtn} onClick={() => { setScreen('provider'); setActiveTab('notes') }}>← Back</div>
                            <div>
                                <div style={s.topTitle}>{selectedProvider.name}</div>
                                <div style={s.topMeta}>{notes.length} submitted notes</div>
                            </div>
                        </div>
                        <div style={s.avatar}>{(currentUser.name || 'Q').charAt(0).toUpperCase()}</div>
                    </div>
                    <div style={s.body}>
                        <div style={s.statsRow}>
                            <StatCard label="Total"        value={notes.length} color="#0F1E3C" />
                            <StatCard label="Needs Review" value={pending}      color="#E8940A" />
                            <StatCard label="Graded"       value={graded}       color="#0D9E8A" />
                        </div>
                        <div style={s.secLabel}>Submitted Notes</div>
                        {loadingNotes ? <Loading /> : notes.length === 0 ? (
                            <Empty icon="📭" title="No notes submitted yet" sub="Notes will appear here after scribes submit them." />
                        ) : notes.map(note => {
                            const isGr = note.status === 'uploaded'
                            return (
                                <div key={note.id} style={s.recRow}>
                                    <div style={s.recLeft}>
                                        <div style={s.recIcon}>📄</div>
                                        <div>
                                            <div style={s.recName}>{note.patient_name}</div>
                                            <div style={s.recMeta}>
                                                {note.mrn} · {note.visit_type} · {fmtTime(note.visit_time)}
                                                {note.scribe_name ? ` · Scribe: ${note.scribe_name}` : ' · Scribe: —'}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={s.recRight}>
                    <span style={{ ...s.badge, background: isGr ? '#E1F5EE' : '#FAEEDA', color: isGr ? '#085041' : '#633806' }}>
                      {isGr ? 'Graded' : 'Needs Review'}
                    </span>
                                        <button style={{ ...s.openBtn, ...(isGr ? s.openBtnGray : {}) }}
                                                onClick={() => openNote(note)}>
                                            {isGr ? 'View Grade' : 'Review Note'}
                                        </button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
        )
    }

    // ─── REVIEW / GRADING ─────────────────────────────
    return (
        <div style={{ ...s.page, overflow: 'hidden', height: '100vh' }}>
            <Sidebar />
            <div style={{ ...s.main, overflow: 'hidden', height: '100vh' }}>
                <div style={s.topbar}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={s.backBtn} onClick={() => setScreen(activeTab === 'graded' ? 'graded' : 'recordings')}>← Back</div>
                        <div>
                            <div style={s.topTitle}>{selectedNote?.patient_name} — {selectedNote?.visit_type}</div>
                            <div style={s.topMeta}>
                                {selectedNote?.mrn} · Scribe: <strong>{selectedNote?.scribe_name || 'Not assigned'}</strong> · {fmtTime(selectedNote?.visit_time)}
                            </div>
                        </div>
                    </div>
                    <div style={s.avatar}>{(currentUser.name || 'Q').charAt(0).toUpperCase()}</div>
                </div>

                {/* Audio player using visit_id */}
                <AudioPlayer visitId={selectedNote?.visit_id} />

                {notif && (
                    <div style={{
                        padding: '10px 20px', fontSize: 13, fontWeight: 500, flexShrink: 0,
                        background: notif.type === 'error' ? '#FCEBEB' : '#E1F5EE',
                        color:      notif.type === 'error' ? '#501313' : '#085041',
                        borderBottom: `1px solid ${notif.type === 'error' ? '#F09595' : '#9FE1CB'}`,
                    }}>
                        {notif.type === 'error' ? '⚠ ' : '✓ '}{notif.msg}
                    </div>
                )}

                {/* Three Panels */}
                <div style={s.panels}>

                    {/* Transcription */}
                    <div style={s.panel}>
                        <div style={s.panelHead}>
                            <span style={s.panelTitle}>Transcription</span>
                            <span style={{ ...s.panelBadge, background: '#F1EFE8', color: '#5F5E5A' }}>Read-only</span>
                        </div>
                        <div style={s.panelBody}>
                            {selectedNote?.transcription ? (
                                selectedNote.transcription.split('\n\n').map((block, i) => (
                                    <div key={i} style={{ marginBottom: 10, fontSize: 13, lineHeight: 1.65 }}>{block}</div>
                                ))
                            ) : (
                                <div style={{ color: '#888780', fontSize: 13, lineHeight: 1.6 }}>
                                    <div style={{ fontSize: 22, marginBottom: 8 }}>🎙</div>
                                    <div style={{ fontWeight: 500, color: '#0F1E3C', marginBottom: 4 }}>Transcription pending</div>
                                    <div>Will appear after AI processing.</div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Final Note */}
                    <div style={{ ...s.panel, flexDirection: 'column', display: 'flex' }}>
                        <div style={s.panelHead}>
                            <span style={s.panelTitle}>Final Note</span>
                            <span style={{ ...s.panelBadge, background: '#E6F1FB', color: '#0C447C' }}>Read-only</span>
                        </div>
                        {selectedNote?.final_note ? (
                            <textarea style={s.noteArea} value={selectedNote.final_note} readOnly />
                        ) : (
                            <div style={{ padding: 16, color: '#888780', fontSize: 13, lineHeight: 1.6 }}>
                                <div style={{ fontSize: 22, marginBottom: 8 }}>📄</div>
                                <div style={{ fontWeight: 500, color: '#0F1E3C', marginBottom: 4 }}>Note not written yet</div>
                                <div>The scribe has not submitted the final note yet.</div>
                            </div>
                        )}
                    </div>

                    {/* Grade & Comment */}
                    <div style={{ ...s.panel, flexDirection: 'column', display: 'flex' }}>
                        <div style={s.panelHead}>
                            <span style={s.panelTitle}>Grade & Comment</span>
                            <span style={{
                                ...s.panelBadge,
                                background: overallScore >= 90 ? '#E1F5EE' : overallScore >= 75 ? '#FAEEDA' : '#FCEBEB',
                                color:      overallScore >= 90 ? '#085041' : overallScore >= 75 ? '#633806' : '#501313',
                            }}>Score: {overallScore}</span>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>

                            {/* Scribe info banner */}
                            {selectedNote?.scribe_name && (
                                <div style={{ background: '#F5F5F3', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 12, color: '#5F5E5A' }}>
                                    📝 Grading note by <strong style={{ color: '#0F1E3C' }}>{selectedNote.scribe_name}</strong>
                                </div>
                            )}

                            {[
                                { key: 'accuracy',     label: 'Accuracy' },
                                { key: 'completeness', label: 'Completeness' },
                                { key: 'terminology',  label: 'Medical Terminology' },
                                { key: 'formatting',   label: 'Formatting' },
                            ].map(({ key, label }) => (
                                <div key={key} style={{ marginBottom: 16 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <div style={{ fontSize: 12, fontWeight: 500, color: '#0F1E3C' }}>{label}</div>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: scores[key] >= 90 ? '#0D9E8A' : scores[key] >= 75 ? '#E8940A' : '#E24B4A' }}>
                                            {scores[key]}
                                        </div>
                                    </div>
                                    <input type="range" min="0" max="100" value={scores[key]}
                                           onChange={e => setScores({ ...scores, [key]: Number(e.target.value) })}
                                           style={{ width: '100%', accentColor: '#0D9E8A', cursor: isGraded ? 'default' : 'pointer' }}
                                           disabled={isGraded} />
                                </div>
                            ))}

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F5F5F3', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#0F1E3C' }}>Overall Score</div>
                                <div style={{ fontSize: 22, fontWeight: 700, color: overallScore >= 90 ? '#0D9E8A' : overallScore >= 75 ? '#E8940A' : '#E24B4A' }}>
                                    {overallScore} / 100
                                </div>
                            </div>

                            <div style={{ fontSize: 11, fontWeight: 600, color: '#5F5E5A', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                                Comment to Scribe *
                            </div>
                            <textarea
                                style={{
                                    width: '100%', padding: '10px 12px', borderRadius: 8,
                                    border: '1px solid #E8E8E4', fontSize: 13, lineHeight: 1.6,
                                    color: '#0F1E3C', fontFamily: "'Segoe UI', system-ui, sans-serif",
                                    outline: 'none', resize: 'none', boxSizing: 'border-box',
                                    background: isGraded ? '#F5F5F3' : '#FAFAF8',
                                    cursor: isGraded ? 'default' : 'text',
                                }}
                                value={comment}
                                onChange={e => setComment(e.target.value)}
                                placeholder="Write feedback or comments for the scribe..."
                                rows={5}
                                readOnly={isGraded}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderTop: '1px solid #E8E8E4', background: '#FAFAF8', flexShrink: 0, alignItems: 'center' }}>
                            <button style={s.btnCancel}
                                    onClick={() => setScreen(activeTab === 'graded' ? 'graded' : 'recordings')}>
                                Cancel
                            </button>
                            {!isGraded && (
                                <button style={s.btnSubmit} onClick={handleSubmit} disabled={submitting}>
                                    {submitting ? 'Submitting...' : 'Submit Grade'}
                                </button>
                            )}
                            {isGraded && (
                                <span style={{ fontSize: 12, color: '#085041', fontWeight: 500, marginLeft: 'auto' }}>
                  ✓ Already graded
                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─── HELPER COMPONENTS ────────────────────────────────────────────────────────

function StatCard({ label, value, color }) {
    return (
        <div style={{ background: '#fff', border: '1px solid #E8E8E4', borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 26, fontWeight: 600, color, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 12, color: '#888780', marginTop: 5 }}>{label}</div>
        </div>
    )
}

function Loading() {
    return <div style={{ padding: 48, textAlign: 'center', color: '#888780', fontSize: 13 }}>Loading...</div>
}

function Empty({ icon, title, sub }) {
    return (
        <div style={{ textAlign: 'center', padding: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 36 }}>{icon}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#0F1E3C' }}>{title}</div>
            <div style={{ fontSize: 13, color: '#888780' }}>{sub}</div>
        </div>
    )
}

function Notif({ notif }) {
    return (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 999, background: notif.type === 'error' ? '#FCEBEB' : '#0F1E3C', color: notif.type === 'error' ? '#A32D2D' : '#fff', padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 500, boxShadow: '0 4px 20px rgba(0,0,0,.15)' }}>
            {notif.type === 'error' ? '⚠ ' : '✓ '}{notif.msg}
        </div>
    )
}

function ChangePassword({ showNotif }) {
    const [current, setCurrent] = useState('')
    const [newPass, setNewPass] = useState('')
    const [confirm, setConfirm] = useState('')
    const [saving, setSaving]   = useState(false)

    const handle = async () => {
        if (!current || !newPass) { showNotif('All fields are required.', 'error'); return }
        if (newPass !== confirm)  { showNotif('Passwords do not match.', 'error'); return }
        if (newPass.length < 6)   { showNotif('Minimum 6 characters.', 'error'); return }
        try {
            setSaving(true)
            await authAPI.changePassword(current, newPass)
            showNotif('Password changed successfully')
            setCurrent(''); setNewPass(''); setConfirm('')
        } catch (err) { showNotif(err.message, 'error') }
        finally { setSaving(false) }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[['Current Password', current, setCurrent],['New Password', newPass, setNewPass],['Confirm New Password', confirm, setConfirm]].map(([l, v, setter]) => (
                <div key={l} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label style={s.fieldLabel}>{l}</label>
                    <input type="password" style={s.input} value={v}
                           onChange={e => setter(e.target.value)} placeholder="••••••••" />
                </div>
            ))}
            <button style={s.btnTeal} onClick={handle} disabled={saving}>
                {saving ? 'Changing...' : 'Change Password'}
            </button>
        </div>
    )
}

// ─── STYLES ───────────────────────────────────────────────────────────────────

const s = {
    page:        { display: 'flex', minHeight: '100vh', fontFamily: "'Segoe UI', system-ui, sans-serif", background: '#F5F5F3' },
    sidebar:     { width: 210, background: '#0F1E3C', display: 'flex', flexDirection: 'column', flexShrink: 0, position: 'fixed', top: 0, left: 0, height: '100vh', overflowY: 'auto', zIndex: 100 },
    sTop:        { padding: '22px 18px 14px', borderBottom: '1px solid rgba(255,255,255,.08)' },
    logo:        { fontSize: 17, fontWeight: 700, color: '#fff' },
    logoSub:     { fontSize: 10, color: 'rgba(255,255,255,.3)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '.07em' },
    nav:         { padding: '10px 0', flex: 1 },
    navItem:     { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', fontSize: 13, color: 'rgba(255,255,255,.45)', cursor: 'pointer', borderLeft: '2px solid transparent', transition: 'all .15s' },
    navActive:   { color: '#fff', background: 'rgba(13,158,138,.15)', borderLeft: '2px solid #0D9E8A' },
    navBadge:    { marginLeft: 'auto', background: 'rgba(255,255,255,.15)', borderRadius: 10, fontSize: 10, padding: '1px 7px', color: 'rgba(255,255,255,.7)' },
    provChip:    { margin: '0 12px 12px', padding: 12, background: 'rgba(13,158,138,.12)', borderRadius: 10, border: '1px solid rgba(13,158,138,.2)' },
    chipLabel:   { fontSize: 9, color: 'rgba(255,255,255,.3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 },
    chipName:    { fontSize: 12, fontWeight: 600, color: '#fff' },
    chipSpec:    { fontSize: 11, color: 'rgba(255,255,255,.35)', marginTop: 2 },
    changeBtn:   { fontSize: 11, color: '#0D9E8A', marginTop: 8, cursor: 'pointer', textDecoration: 'underline' },
    sFooter:     { padding: '14px 18px', borderTop: '1px solid rgba(255,255,255,.08)' },
    fName:       { fontSize: 12, color: 'rgba(255,255,255,.65)', fontWeight: 500 },
    fRole:       { fontSize: 11, color: 'rgba(255,255,255,.3)', marginTop: 2 },
    logout:      { marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,.4)', cursor: 'pointer', textDecoration: 'underline' },
    main:        { marginLeft: 210, flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
    topbar:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 22px', height: 56, background: '#fff', borderBottom: '1px solid #E8E8E4', flexShrink: 0, position: 'sticky', top: 0, zIndex: 10 },
    topTitle:    { fontSize: 15, fontWeight: 600, color: '#0F1E3C' },
    topMeta:     { fontSize: 12, color: '#888780', marginTop: 2 },
    avatar:      { width: 32, height: 32, borderRadius: '50%', background: '#0F1E3C', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, flexShrink: 0 },
    backBtn:     { fontSize: 13, color: '#0D9E8A', cursor: 'pointer', fontWeight: 500, flexShrink: 0 },
    body:        { flex: 1, padding: '22px 26px', overflowY: 'auto' },
    statsRow:    { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 },
    secLabel:    { fontSize: 11, fontWeight: 600, color: '#888780', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 },
    recRow:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', border: '1px solid #E8E8E4', borderRadius: 10, padding: '12px 16px', marginBottom: 8 },
    recLeft:     { display: 'flex', alignItems: 'center', gap: 12 },
    recIcon:     { fontSize: 20, flexShrink: 0 },
    recName:     { fontSize: 14, fontWeight: 600, color: '#0F1E3C' },
    recMeta:     { fontSize: 11, color: '#888780', marginTop: 2 },
    recRight:    { display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 },
    badge:       { padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600 },
    openBtn:     { padding: '6px 14px', borderRadius: 8, background: '#0F1E3C', color: '#fff', border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
    openBtnGray: { background: '#F1EFE8', color: '#5F5E5A', border: '1px solid #E8E8E4' },
    audioBar:    { display: 'flex', alignItems: 'center', gap: 14, padding: '10px 20px', background: '#fff', borderBottom: '1px solid #E8E8E4', flexShrink: 0 },
    audioLabel:  { fontSize: 12, fontWeight: 600, color: '#0F1E3C' },
    audioTime:   { fontSize: 11, color: '#888780', marginTop: 2 },
    audioControls: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
    playBtn:     { width: 34, height: 34, borderRadius: '50%', background: '#0F1E3C', color: '#fff', border: 'none', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' },
    skipBtn:     { padding: '5px 9px', borderRadius: 6, background: '#F1EFE8', color: '#5F5E5A', border: '1px solid #E8E8E4', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
    panels:      { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', flex: 1, overflow: 'hidden' },
    panel:       { borderRight: '1px solid #E8E8E4', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff', minWidth: 0 },
    panelHead:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', borderBottom: '1px solid #E8E8E4', flexShrink: 0, background: '#FAFAF8' },
    panelTitle:  { fontSize: 11, fontWeight: 600, color: '#0F1E3C', textTransform: 'uppercase', letterSpacing: '.05em' },
    panelBadge:  { padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600 },
    panelBody:   { flex: 1, overflowY: 'auto', padding: '12px 14px' },
    noteArea:    { flex: 1, border: 'none', resize: 'none', padding: '12px 14px', fontSize: 13, lineHeight: 1.7, color: '#0F1E3C', fontFamily: "'Segoe UI', system-ui, sans-serif", outline: 'none', width: '100%', boxSizing: 'border-box', background: '#FAFAF8', cursor: 'default' },
    btnCancel:   { padding: '8px 14px', borderRadius: 8, background: '#F1EFE8', color: '#5F5E5A', border: '1px solid #E8E8E4', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
    btnSubmit:   { padding: '8px 14px', borderRadius: 8, background: '#0D9E8A', color: '#fff', border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', marginLeft: 'auto', fontFamily: 'inherit' },
    provGrid:    { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxWidth: 760 },
    provCard:    { background: '#fff', border: '1px solid #E8E8E4', borderRadius: 12, padding: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 },
    provAvatar:  { width: 44, height: 44, borderRadius: '50%', background: '#0F1E3C', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 600, flexShrink: 0 },
    provInfo:    { flex: 1 },
    provName:    { fontSize: 14, fontWeight: 600, color: '#0F1E3C' },
    provSpec:    { fontSize: 12, color: '#888780', marginTop: 2 },
    arrow:       { fontSize: 16, color: '#C4C2B9' },
    profileCard: { background: '#fff', border: '1px solid #E8E8E4', borderRadius: 12, padding: 24 },
    profileTop:  { display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid #F1EFE8' },
    profileAvatar: { width: 64, height: 64, borderRadius: '50%', background: '#0F1E3C', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 600, flexShrink: 0 },
    profileGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 },
    fieldLabel:  { fontSize: 11, fontWeight: 600, color: '#888780', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 },
    fieldVal:    { fontSize: 14, color: '#0F1E3C' },
    input:       { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E8E8E4', fontSize: 13, color: '#0F1E3C', outline: 'none', fontFamily: 'inherit', background: '#FAFAF8', boxSizing: 'border-box' },
    btnNavy:     { padding: '8px 16px', borderRadius: 8, background: '#0F1E3C', color: '#fff', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
    btnTeal:     { padding: '8px 16px', borderRadius: 8, background: '#0D9E8A', color: '#fff', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
    btnGhost:    { padding: '8px 16px', borderRadius: 8, background: '#F1EFE8', color: '#5F5E5A', border: '1px solid #E8E8E4', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
}