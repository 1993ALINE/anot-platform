import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { authAPI, usersAPI, adminAPI } from '../../services/api'

// ─── CONFIG ───────────────────────────────────────────────────────────────────

const ROLE_CFG = {
    clinician: { label: 'Clinician', bg: '#E6F1FB', color: '#0C447C', icon: '🩺' },
    scribe:    { label: 'Scribe',    bg: '#FAEEDA', color: '#633806', icon: '📝' },
    qps:       { label: 'QPS',      bg: '#E1F5EE', color: '#085041', icon: '✅' },
    admin:     { label: 'Admin',    bg: '#F1EFE8', color: '#5F5E5A', icon: '⚙️' },
}

const ACTION_CFG = {
    USER_UPDATED:      { label: 'User Updated',      color: '#378ADD', bg: '#E6F1FB' },
    USER_ACTIVATED:    { label: 'User Activated',    color: '#085041', bg: '#E1F5EE' },
    USER_DEACTIVATED:  { label: 'User Deactivated',  color: '#A32D2D', bg: '#FCEBEB' },
    USER_DELETED:      { label: 'User Deleted',      color: '#A32D2D', bg: '#FCEBEB' },
    PASSWORD_RESET:    { label: 'Password Reset',    color: '#633806', bg: '#FAEEDA' },
    RATE_UPDATED:      { label: 'Rate Updated',      color: '#085041', bg: '#E1F5EE' },
    NOTE_SUBMITTED:    { label: 'Note Submitted',    color: '#0C447C', bg: '#E6F1FB' },
    GRADE_SUBMITTED:   { label: 'Grade Submitted',   color: '#085041', bg: '#E1F5EE' },
    USER_REGISTERED:   { label: 'User Registered',   color: '#0D9E8A', bg: '#E1F5EE' },
}

const NAV = [
    { key: 'overview',    icon: '📊', label: 'Overview' },
    { key: 'clinicians',  icon: '🩺', label: 'Clinicians' },
    { key: 'scribes',     icon: '📝', label: 'Scribes' },
    { key: 'qps',         icon: '✅', label: 'QPS Staff' },
    { key: 'admins',      icon: '⚙️', label: 'Admins' },
    { key: 'assignments', icon: '🔗', label: 'Assignments' },
    { key: 'payroll',     icon: '💳', label: 'Payroll' },
    { key: 'performance', icon: '📈', label: 'Performance' },
    { key: 'audit',       icon: '🔍', label: 'Audit Logs' },
    { key: 'settings',    icon: '🛠', label: 'Settings' },
]

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function Admin() {
    const navigate    = useNavigate()
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}')

    const [tab, setTab]                 = useState('overview')
    const [users, setUsers]             = useState([])
    const [assignments, setAssignments] = useState([])
    const [payroll, setPayroll]         = useState([])
    const [performance, setPerformance] = useState([])
    const [auditLogs, setAuditLogs]     = useState([])
    const [loading, setLoading]         = useState(true)
    const [payrollLoading, setPayrollLoading]   = useState(false)
    const [perfLoading, setPerfLoading]         = useState(false)
    const [auditLoading, setAuditLoading]       = useState(false)
    const [payrollRate, setPayrollRate] = useState(2.50)
    const [toast, setToast]             = useState(null)

    // Audit filters
    const [auditRoleFilter, setAuditRoleFilter]     = useState('')
    const [auditActionFilter, setAuditActionFilter] = useState('')
    const [auditSearch, setAuditSearch]             = useState('')

    // Add user modal
    const [showAdd, setShowAdd]       = useState(false)
    const [addRole, setAddRole]       = useState('scribe')
    const [newUser, setNewUser]       = useState({ name: '', email: '', specialty: '', phone: '', npi: '', license: '' })
    const [addError, setAddError]     = useState('')
    const [addLoading, setAddLoading] = useState(false)

    // Edit user modal
    const [editUser, setEditUser]       = useState(null)
    const [editLoading, setEditLoading] = useState(false)

    // Reset password modal
    const [resetUser, setResetUser]           = useState(null)
    const [resetPass, setResetPass]           = useState('')
    const [showResetPass, setShowResetPass]   = useState(false)
    const [resetLoading, setResetLoading]     = useState(false)
    const [resetError, setResetError]         = useState('')

    // Assignment
    const [assignClinicianId, setAssignClinicianId] = useState('')
    const [assignScribeId, setAssignScribeId]       = useState('')
    const [assignLoading, setAssignLoading]         = useState(false)

    // ── Load data ─────────────────────────────────────
    useEffect(() => { loadAll() }, [])

    useEffect(() => {
        if (tab === 'payroll')     loadPayroll()
        if (tab === 'performance') loadPerformance()
        if (tab === 'audit')       loadAuditLogs()
    }, [tab])

    // Auto-refresh payroll, performance and audit every 30 seconds
    useEffect(() => {
        if (!['payroll','performance','audit'].includes(tab)) return
        const interval = setInterval(() => {
            if (tab === 'payroll')     loadPayroll()
            if (tab === 'performance') loadPerformance()
            if (tab === 'audit')       loadAuditLogs()
        }, 30000)
        return () => clearInterval(interval)
    }, [tab])

    const loadAll = async () => {
        try {
            setLoading(true)
            const [usersRes, assignRes] = await Promise.allSettled([
                usersAPI.getAll(),
                fetchAssignments(),
            ])
            if (usersRes.status === 'fulfilled')  setUsers(usersRes.value.users || [])
            if (assignRes.status === 'fulfilled') setAssignments(assignRes.value || [])
        } catch (err) { showToast(`Failed to load: ${err.message}`, 'error') }
        finally { setLoading(false) }
    }

    const fetchAssignments = async () => {
        try {
            const res = await fetch('http://localhost:5000/api/assignments', {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            })
            const data = await res.json()
            return data.assignments || []
        } catch { return [] }
    }

    const loadPayroll = async () => {
        try {
            setPayrollLoading(true)
            const data = await adminAPI.getPayroll()
            setPayroll(data.payroll || [])
        } catch (err) { showToast(`Failed to load payroll: ${err.message}`, 'error') }
        finally { setPayrollLoading(false) }
    }

    const loadPerformance = async () => {
        try {
            setPerfLoading(true)
            const data = await adminAPI.getPerformance()
            setPerformance(data.performance || [])
        } catch (err) { showToast(`Failed to load performance: ${err.message}`, 'error') }
        finally { setPerfLoading(false) }
    }

    const loadAuditLogs = async () => {
        try {
            setAuditLoading(true)
            const res = await fetch('http://localhost:5000/api/audit?limit=200', {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            })
            const data = await res.json()
            setAuditLogs(data.logs || [])
        } catch (err) { showToast(`Failed to load audit logs: ${err.message}`, 'error') }
        finally { setAuditLoading(false) }
    }

    // ── Toast ─────────────────────────────────────────
    const showToast = (msg, type = 'success') => {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 3500)
    }

    // ── Derived ───────────────────────────────────────
    const safe       = Array.isArray(users) ? users : []
    const clinicians = safe.filter(u => u.role === 'clinician')
    const scribes    = safe.filter(u => u.role === 'scribe')
    const qpsStaff   = safe.filter(u => u.role === 'qps')
    const admins     = safe.filter(u => u.role === 'admin')

    // Filtered audit logs
    const filteredLogs = auditLogs.filter(log => {
        const matchRole   = !auditRoleFilter   || log.user_role === auditRoleFilter
        const matchAction = !auditActionFilter || log.action === auditActionFilter
        const matchSearch = !auditSearch       ||
            log.user_name?.toLowerCase().includes(auditSearch.toLowerCase()) ||
            log.details?.toLowerCase().includes(auditSearch.toLowerCase()) ||
            log.action?.toLowerCase().includes(auditSearch.toLowerCase())
        return matchRole && matchAction && matchSearch
    })

    // ── Register user ─────────────────────────────────
    const registerUser = async () => {
        setAddError('')
        if (!newUser.name.trim())  { setAddError('Name is required.'); return }
        if (!newUser.email.trim()) { setAddError('Email is required.'); return }
        if (!newUser.email.includes('@')) { setAddError('Enter a valid email.'); return }
        try {
            setAddLoading(true)
            const data = await usersAPI.register({ ...newUser, role: addRole, password: 'password*2026' })
            setUsers(prev => [data.user, ...prev])
            setNewUser({ name: '', email: '', specialty: '', phone: '', npi: '', license: '' })
            setShowAdd(false)
            showToast(`${data.user.name} registered successfully`)
        } catch (err) { setAddError(err.message) }
        finally { setAddLoading(false) }
    }

    // ── Edit user ─────────────────────────────────────
    const saveEdit = async () => {
        try {
            setEditLoading(true)
            const data = await usersAPI.update(editUser.id, editUser)
            setUsers(prev => prev.map(u => u.id === editUser.id ? data.user : u))
            setEditUser(null)
            showToast(`${data.user.name} updated successfully`)
        } catch (err) { showToast(err.message, 'error') }
        finally { setEditLoading(false) }
    }

    // ── Toggle status ─────────────────────────────────
    const toggleStatus = async (user) => {
        try {
            await usersAPI.toggleStatus(user.id)
            setUsers(prev => prev.map(u =>
                u.id === user.id ? { ...u, status: u.status === 'active' ? 'inactive' : 'active' } : u
            ))
            showToast(`${user.name} ${user.status === 'active' ? 'deactivated' : 'activated'}`)
        } catch (err) { showToast(err.message, 'error') }
    }

    // ── Reset password ────────────────────────────────
    const resetPassword = async () => {
        setResetError('')
        if (!resetPass || resetPass.length < 6) { setResetError('Password must be at least 6 characters.'); return }
        try {
            setResetLoading(true)
            await usersAPI.resetPassword(resetUser.id, resetPass)
            showToast(`Password reset for ${resetUser.name}`)
            setResetUser(null); setResetPass(''); setShowResetPass(false)
        } catch (err) { setResetError(err.message) }
        finally { setResetLoading(false) }
    }

    // ── Assignments ───────────────────────────────────
    const addAssignment = async () => {
        if (!assignClinicianId || !assignScribeId) { showToast('Select both a clinician and a scribe.', 'error'); return }
        try {
            setAssignLoading(true)
            const res = await fetch('http://localhost:5000/api/assignments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
                body: JSON.stringify({ clinician_id: assignClinicianId, scribe_id: assignScribeId }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            setAssignments(prev => [...prev, data.assignment])
            setAssignClinicianId(''); setAssignScribeId('')
            showToast('Scribe assigned successfully')
        } catch (err) { showToast(err.message, 'error') }
        finally { setAssignLoading(false) }
    }

    const removeAssignment = async (id) => {
        try {
            await fetch(`http://localhost:5000/api/assignments/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            })
            setAssignments(prev => prev.filter(a => a.id !== id))
            showToast('Assignment removed')
        } catch (err) { showToast(err.message, 'error') }
    }

    // ─── SIDEBAR ──────────────────────────────────────
    const Sidebar = () => (
        <div style={s.sidebar}>
            <div style={s.sTop}>
                <div style={s.logo}>Anot</div>
                <div style={s.logoSub}>Admin Panel</div>
            </div>
            <nav style={s.nav}>
                {NAV.map(item => (
                    <div key={item.key}
                         style={{ ...s.navItem, ...(tab === item.key ? s.navActive : {}) }}
                         onClick={() => setTab(item.key)}>
                        <span>{item.icon}</span>
                        <span style={{ flex: 1 }}>{item.label}</span>
                        {item.key === 'clinicians'  && <span style={s.navBadge}>{clinicians.length}</span>}
                        {item.key === 'scribes'     && <span style={s.navBadge}>{scribes.length}</span>}
                        {item.key === 'qps'         && <span style={s.navBadge}>{qpsStaff.length}</span>}
                        {item.key === 'assignments' && <span style={s.navBadge}>{assignments.length}</span>}
                        {item.key === 'audit'       && auditLogs.length > 0 && <span style={s.navBadge}>{auditLogs.length}</span>}
                    </div>
                ))}
            </nav>
            <div style={s.sFooter}>
                <div style={s.fName}>{currentUser.name || 'Admin'}</div>
                <div style={s.fRole}>Full Access</div>
                <div style={s.logout} onClick={() => { authAPI.logout(); navigate('/') }}>Sign out</div>
            </div>
        </div>
    )

    // ─── USER TABLE ───────────────────────────────────
    const UserTable = ({ userList, role }) => {
        const [search, setSearch] = useState('')
        const [filter, setFilter] = useState('all')
        const cfg = ROLE_CFG[role]
        const filtered = userList.filter(u => {
            const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) ||
                u.email.toLowerCase().includes(search.toLowerCase())
            return matchSearch && (filter === 'all' || u.status === filter)
        })
        return (
            <div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input style={{ ...s.input, maxWidth: 260 }}
                           placeholder={`🔍 Search ${cfg.label}s...`}
                           value={search} onChange={e => setSearch(e.target.value)} />
                    <select style={{ ...s.input, width: 'auto' }} value={filter} onChange={e => setFilter(e.target.value)}>
                        <option value="all">All Status</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </select>
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 12, color: '#888780' }}>{filtered.length} {cfg.label}{filtered.length !== 1 ? 's' : ''}</span>
                        <button style={s.addBtn} onClick={() => { setAddRole(role); setShowAdd(true); setAddError('') }}>
                            + Add {cfg.label}
                        </button>
                    </div>
                </div>
                {loading ? <LoadingBox /> : filtered.length === 0 ? <EmptyBox text={`No ${cfg.label}s found.`} /> : (
                    <div style={s.table}>
                        <div style={s.tHead}>
                            <div style={{ flex: 2 }}>Name</div>
                            <div style={{ flex: 2 }}>Email</div>
                            {role === 'clinician' && <div style={{ flex: 2 }}>Specialty</div>}
                            <div style={{ flex: 1 }}>Phone</div>
                            <div style={{ flex: 1 }}>Status</div>
                            <div style={{ flex: 2 }}>Actions</div>
                        </div>
                        {filtered.map(u => (
                            <div key={u.id} style={s.tRow}>
                                <div style={{ flex: 2 }}><div style={{ fontWeight: 500, color: '#0F1E3C' }}>{u.name}</div></div>
                                <div style={{ flex: 2, fontSize: 12, color: '#888780' }}>{u.email}</div>
                                {role === 'clinician' && <div style={{ flex: 2, fontSize: 12, color: '#5F5E5A' }}>{u.specialty || '—'}</div>}
                                <div style={{ flex: 1, fontSize: 12, color: '#5F5E5A' }}>{u.phone || '—'}</div>
                                <div style={{ flex: 1 }}>
                  <span style={{ ...s.badge, background: u.status === 'active' ? '#E1F5EE' : '#F1EFE8', color: u.status === 'active' ? '#085041' : '#5F5E5A' }}>
                    {u.status === 'active' ? '● Active' : '○ Inactive'}
                  </span>
                                </div>
                                <div style={{ flex: 2, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                    <button style={s.actionBtn} onClick={() => setEditUser({ ...u })}>Edit</button>
                                    <button style={{ ...s.actionBtn, color: '#633806' }}
                                            onClick={() => { setResetUser(u); setResetPass(''); setResetError(''); setShowResetPass(false) }}>
                                        🔑 Reset
                                    </button>
                                    <button style={{ ...s.actionBtn, color: u.status === 'active' ? '#A32D2D' : '#085041' }}
                                            onClick={() => toggleStatus(u)}>
                                        {u.status === 'active' ? 'Disable' : 'Enable'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )
    }

    // ─── RENDER ───────────────────────────────────────
    return (
        <div style={s.page}>
            <Sidebar />
            <div style={s.main}>

                {/* Topbar */}
                <div style={s.topbar}>
                    <div>
                        <div style={s.topTitle}>{NAV.find(n => n.key === tab)?.label}</div>
                        <div style={s.topMeta}>Anot Platform · {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
                    </div>
                    <div style={s.avatar}>{(currentUser.name || 'A').charAt(0).toUpperCase()}</div>
                </div>

                {/* Toast */}
                {toast && (
                    <div style={{
                        margin: '10px 24px 0', padding: '10px 16px', borderRadius: 8,
                        fontSize: 13, fontWeight: 500, border: '1px solid', flexShrink: 0,
                        background:  toast.type === 'error' ? '#FCEBEB' : '#E1F5EE',
                        color:       toast.type === 'error' ? '#501313' : '#085041',
                        borderColor: toast.type === 'error' ? '#F09595' : '#9FE1CB',
                    }}>
                        {toast.type === 'error' ? '⚠ ' : '✓ '}{toast.msg}
                    </div>
                )}

                <div style={s.body}>

                    {/* ── OVERVIEW ──────────────────────────────── */}
                    {tab === 'overview' && (
                        <>
                            <div style={s.statsGrid}>
                                {[
                                    ['Clinicians',  clinicians.length, '#0F1E3C', '🩺'],
                                    ['Scribes',     scribes.length,    '#0D9E8A', '📝'],
                                    ['QPS Staff',   qpsStaff.length,   '#378ADD', '✅'],
                                    ['Admins',      admins.length,     '#888780', '⚙️'],
                                    ['Total Users', safe.length,       '#E8940A', '👥'],
                                    ['Active',      safe.filter(u => u.status === 'active').length,   '#0D9E8A', '🟢'],
                                    ['Inactive',    safe.filter(u => u.status === 'inactive').length, '#E24B4A', '🔴'],
                                    ['Assignments', assignments.length, '#378ADD', '🔗'],
                                ].map(([l, v, c, icon]) => (
                                    <div key={l} style={s.statCard}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <div style={{ fontSize: 22, fontWeight: 600, color: c, lineHeight: 1 }}>{v}</div>
                                            <div style={{ fontSize: 18 }}>{icon}</div>
                                        </div>
                                        <div style={{ fontSize: 12, color: '#888780', marginTop: 6 }}>{l}</div>
                                    </div>
                                ))}
                            </div>
                            <div style={s.overviewGrid}>
                                <div style={s.overCard}>
                                    <div style={s.overTitle}>🩺 Clinicians</div>
                                    {clinicians.length === 0 ? <div style={{ fontSize: 13, color: 'rgba(255,255,255,.4)' }}>No clinicians yet.</div> :
                                        clinicians.slice(0, 6).map((u, i) => (
                                            <div key={i} style={s.overRow}>
                                                <div style={{ ...s.dot, background: u.status === 'active' ? '#0D9E8A' : '#E24B4A' }} />
                                                <div style={{ flex: 1 }}>
                                                    <div style={s.overName}>{u.name}</div>
                                                    <div style={s.overSub}>{u.specialty || 'Clinician'}</div>
                                                </div>
                                                <span style={{ ...s.badge, background: u.status === 'active' ? '#E1F5EE' : '#F1EFE8', color: u.status === 'active' ? '#085041' : '#5F5E5A', fontSize: 10 }}>{u.status}</span>
                                            </div>
                                        ))}
                                </div>
                                <div style={s.overCard}>
                                    <div style={s.overTitle}>📝 Scribes</div>
                                    {scribes.length === 0 ? <div style={{ fontSize: 13, color: 'rgba(255,255,255,.4)' }}>No scribes yet.</div> :
                                        scribes.map((u, i) => (
                                            <div key={i} style={s.overRow}>
                                                <div style={{ ...s.dot, background: u.status === 'active' ? '#0D9E8A' : '#E24B4A' }} />
                                                <div style={{ flex: 1 }}>
                                                    <div style={s.overName}>{u.name}</div>
                                                    <div style={s.overSub}>{u.email}</div>
                                                </div>
                                                <span style={{ ...s.badge, background: u.status === 'active' ? '#E1F5EE' : '#F1EFE8', color: u.status === 'active' ? '#085041' : '#5F5E5A', fontSize: 10 }}>{u.status}</span>
                                            </div>
                                        ))}
                                </div>
                                <div style={s.overCard}>
                                    <div style={s.overTitle}>🔗 Assignments</div>
                                    {assignments.length === 0 ? (
                                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,.4)' }}>
                                            No assignments.{' '}
                                            <span style={{ color: '#0D9E8A', cursor: 'pointer' }} onClick={() => setTab('assignments')}>Assign now →</span>
                                        </div>
                                    ) : assignments.slice(0, 6).map((a, i) => (
                                        <div key={i} style={s.overRow}>
                                            <div style={{ flex: 1 }}>
                                                <div style={s.overName}>{a.clinician_name}</div>
                                                <div style={s.overSub}>→ {a.scribe_name}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}

                    {/* ── ROLE TABS ─────────────────────────────── */}
                    {tab === 'clinicians' && <UserTable userList={clinicians} role="clinician" />}
                    {tab === 'scribes'    && <UserTable userList={scribes}    role="scribe" />}
                    {tab === 'qps'        && <UserTable userList={qpsStaff}   role="qps" />}
                    {tab === 'admins'     && <UserTable userList={admins}     role="admin" />}

                    {/* ── ASSIGNMENTS ───────────────────────────── */}
                    {tab === 'assignments' && (
                        <>
                            <div style={{ ...s.formCard, marginBottom: 20 }}>
                                <div style={s.formTitle}>🔗 Assign Scribe to Clinician</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'flex-end' }}>
                                    <div style={s.formGroup}>
                                        <label style={s.formLabel}>Clinician</label>
                                        <select style={s.input} value={assignClinicianId} onChange={e => setAssignClinicianId(e.target.value)}>
                                            <option value="">Select clinician...</option>
                                            {clinicians.filter(c => c.status === 'active').map(c => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div style={s.formGroup}>
                                        <label style={s.formLabel}>Scribe</label>
                                        <select style={s.input} value={assignScribeId} onChange={e => setAssignScribeId(e.target.value)}>
                                            <option value="">Select scribe...</option>
                                            {scribes.filter(s => s.status === 'active').map(sc => (
                                                <option key={sc.id} value={sc.id}>{sc.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <button style={{ ...s.addBtn, height: 40 }} onClick={addAssignment} disabled={assignLoading}>
                                        {assignLoading ? 'Assigning...' : '+ Assign'}
                                    </button>
                                </div>
                            </div>
                            <div style={s.secLabel}>Current Assignments ({assignments.length})</div>
                            {assignments.length === 0 ? <EmptyBox text="No assignments yet." /> : (
                                <div style={s.table}>
                                    <div style={s.tHead}>
                                        <div style={{ flex: 2 }}>Clinician</div>
                                        <div style={{ flex: 2 }}>Scribe</div>
                                        <div style={{ flex: 1 }}>Date</div>
                                        <div style={{ flex: 1 }}>Action</div>
                                    </div>
                                    {assignments.map(a => (
                                        <div key={a.id} style={s.tRow}>
                                            <div style={{ flex: 2 }}><div style={{ fontWeight: 500 }}>{a.clinician_name}</div></div>
                                            <div style={{ flex: 2 }}><div style={{ fontWeight: 500 }}>{a.scribe_name}</div><div style={{ fontSize: 11, color: '#888780' }}>{a.scribe_email}</div></div>
                                            <div style={{ flex: 1, fontSize: 12, color: '#888780' }}>{new Date(a.assigned_at).toLocaleDateString()}</div>
                                            <div style={{ flex: 1 }}>
                                                <button style={{ ...s.actionBtn, color: '#A32D2D' }} onClick={() => removeAssignment(a.id)}>Remove</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {/* ── PAYROLL ───────────────────────────────── */}
                    {tab === 'payroll' && (
                        <>
                            <div style={s.statsGrid}>
                                {[
                                    ['Total Staff',  payroll.length, '#0F1E3C', '📝'],
                                    ['Active',       payroll.filter(p => p.status === 'active').length, '#0D9E8A', '✅'],
                                    ['Total Notes',  payroll.reduce((a, p) => a + parseInt(p.notes_completed || 0), 0), '#378ADD', '📄'],
                                    ['Total Due',    `$${payroll.reduce((a, p) => a + parseFloat(p.total_amount || 0), 0).toFixed(2)}`, '#E8940A', '💰'],
                                ].map(([l, v, c, icon]) => (
                                    <div key={l} style={s.statCard}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <div style={{ fontSize: 22, fontWeight: 600, color: c }}>{v}</div>
                                            <div style={{ fontSize: 18 }}>{icon}</div>
                                        </div>
                                        <div style={{ fontSize: 12, color: '#888780', marginTop: 6 }}>{l}</div>
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <div style={s.secLabel}>Staff Payroll</div>
                                <button style={s.addBtn} onClick={loadPayroll}>🔄 Refresh</button>
                            </div>
                            {payrollLoading ? <LoadingBox /> : (
                                <div style={s.table}>
                                    <div style={s.tHead}>
                                        <div style={{ flex: 2 }}>Name</div>
                                        <div style={{ flex: 1 }}>Role</div>
                                        <div style={{ flex: 1 }}>Status</div>
                                        <div style={{ flex: 1 }}>Notes</div>
                                        <div style={{ flex: 1 }}>Rate/Note</div>
                                        <div style={{ flex: 1 }}>Total Due</div>
                                    </div>
                                    {payroll.length === 0 ? (
                                        <div style={{ padding: 24, textAlign: 'center', color: '#888780', fontSize: 13 }}>No payroll data yet.</div>
                                    ) : payroll.map((p, i) => (
                                        <div key={i} style={s.tRow}>
                                            <div style={{ flex: 2 }}>
                                                <div style={{ fontWeight: 500 }}>{p.name}</div>
                                                <div style={{ fontSize: 11, color: '#888780' }}>{p.email}</div>
                                            </div>
                                            <div style={{ flex: 1 }}>
                        <span style={{ ...s.badge, ...ROLE_CFG[p.role] && { background: ROLE_CFG[p.role].bg, color: ROLE_CFG[p.role].color } }}>
                          {ROLE_CFG[p.role]?.icon} {p.role}
                        </span>
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <span style={{ ...s.badge, background: p.status === 'active' ? '#E1F5EE' : '#F1EFE8', color: p.status === 'active' ? '#085041' : '#5F5E5A' }}>{p.status}</span>
                                            </div>
                                            <div style={{ flex: 1, fontWeight: 600 }}>{p.notes_completed}</div>
                                            <div style={{ flex: 1, fontSize: 13 }}>${parseFloat(p.rate_per_note || 0).toFixed(2)}</div>
                                            <div style={{ flex: 1, fontWeight: 600, color: '#0D9E8A' }}>${parseFloat(p.total_amount || 0).toFixed(2)}</div>
                                        </div>
                                    ))}
                                    {payroll.length > 0 && (
                                        <div style={{ ...s.tRow, background: '#F5F5F3', borderTop: '2px solid #E8E8E4' }}>
                                            <div style={{ flex: 2, fontWeight: 700, color: '#0F1E3C' }}>Total</div>
                                            <div style={{ flex: 1 }} /><div style={{ flex: 1 }} />
                                            <div style={{ flex: 1, fontWeight: 700 }}>{payroll.reduce((a, p) => a + parseInt(p.notes_completed || 0), 0)}</div>
                                            <div style={{ flex: 1 }} />
                                            <div style={{ flex: 1, fontWeight: 700, color: '#0D9E8A' }}>${payroll.reduce((a, p) => a + parseFloat(p.total_amount || 0), 0).toFixed(2)}</div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {/* ── PERFORMANCE ───────────────────────────── */}
                    {tab === 'performance' && (
                        <>
                            <div style={s.statsGrid}>
                                {[
                                    ['Total Staff', performance.length, '#0F1E3C', '📝'],
                                    ['Active',      performance.filter(p => p.status === 'active').length, '#0D9E8A', '✅'],
                                    ['Avg Score',   performance.length > 0 ? Math.round(performance.reduce((a, p) => a + parseInt(p.overall_avg || 0), 0) / performance.length) : '—', '#378ADD', '⭐'],
                                    ['Total Notes', performance.reduce((a, p) => a + parseInt(p.notes_completed || 0), 0), '#E8940A', '📋'],
                                ].map(([l, v, c, icon]) => (
                                    <div key={l} style={s.statCard}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <div style={{ fontSize: 22, fontWeight: 600, color: c }}>{v}</div>
                                            <div style={{ fontSize: 18 }}>{icon}</div>
                                        </div>
                                        <div style={{ fontSize: 12, color: '#888780', marginTop: 6 }}>{l}</div>
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <div style={s.secLabel}>Staff Performance</div>
                                <button style={s.addBtn} onClick={loadPerformance}>🔄 Refresh</button>
                            </div>
                            {perfLoading ? <LoadingBox /> : performance.length === 0 ? (
                                <EmptyBox text="No performance data yet. Notes need to be graded by QPS first." />
                            ) : (
                                <div style={s.table}>
                                    <div style={s.tHead}>
                                        <div style={{ flex: 2 }}>Name</div>
                                        <div style={{ flex: 1 }}>Role</div>
                                        <div style={{ flex: 1 }}>Notes</div>
                                        <div style={{ flex: 1 }}>Accuracy</div>
                                        <div style={{ flex: 1 }}>Completeness</div>
                                        <div style={{ flex: 1 }}>Terminology</div>
                                        <div style={{ flex: 1 }}>Formatting</div>
                                        <div style={{ flex: 1 }}>Overall</div>
                                    </div>
                                    {performance.map((p, i) => (
                                        <div key={i} style={s.tRow}>
                                            <div style={{ flex: 2 }}>
                                                <div style={{ fontWeight: 500 }}>{p.name}</div>
                                                <div style={{ fontSize: 11, color: '#888780' }}>{p.email}</div>
                                            </div>
                                            <div style={{ flex: 1 }}>
                        <span style={{ ...s.badge, ...ROLE_CFG[p.role] && { background: ROLE_CFG[p.role].bg, color: ROLE_CFG[p.role].color } }}>
                          {ROLE_CFG[p.role]?.icon} {p.role}
                        </span>
                                            </div>
                                            <div style={{ flex: 1, fontSize: 13 }}>{p.notes_completed}</div>
                                            <div style={{ flex: 1 }}><ScoreBar value={parseInt(p.accuracy_avg)} /></div>
                                            <div style={{ flex: 1 }}><ScoreBar value={parseInt(p.completeness_avg)} /></div>
                                            <div style={{ flex: 1 }}><ScoreBar value={parseInt(p.terminology_avg)} /></div>
                                            <div style={{ flex: 1 }}><ScoreBar value={parseInt(p.formatting_avg)} /></div>
                                            <div style={{ flex: 1 }}>
                                                {parseInt(p.overall_avg) > 0
                                                    ? <span style={{ fontWeight: 700, fontSize: 15, color: p.overall_avg >= 90 ? '#0D9E8A' : p.overall_avg >= 75 ? '#E8940A' : '#E24B4A' }}>{p.overall_avg}</span>
                                                    : <span style={{ color: '#B4B2A9' }}>—</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {/* ── AUDIT LOGS ────────────────────────────── */}
                    {tab === 'audit' && (
                        <>
                            <div style={s.statsGrid}>
                                {[
                                    ['Total Events',   auditLogs.length, '#0F1E3C', '🔍'],
                                    ['Today',          auditLogs.filter(l => l.created_at?.split('T')[0] === new Date().toISOString().split('T')[0]).length, '#0D9E8A', '📅'],
                                    ['Admin Actions',  auditLogs.filter(l => l.user_role === 'admin').length, '#378ADD', '⚙️'],
                                    ['Note Events',    auditLogs.filter(l => ['NOTE_SUBMITTED','GRADE_SUBMITTED'].includes(l.action)).length, '#E8940A', '📋'],
                                ].map(([l, v, c, icon]) => (
                                    <div key={l} style={s.statCard}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <div style={{ fontSize: 22, fontWeight: 600, color: c }}>{v}</div>
                                            <div style={{ fontSize: 18 }}>{icon}</div>
                                        </div>
                                        <div style={{ fontSize: 12, color: '#888780', marginTop: 6 }}>{l}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Filters */}
                            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                                <input style={{ ...s.input, maxWidth: 220 }}
                                       placeholder="🔍 Search user or details..."
                                       value={auditSearch} onChange={e => setAuditSearch(e.target.value)} />
                                <select style={{ ...s.input, width: 'auto' }} value={auditRoleFilter} onChange={e => setAuditRoleFilter(e.target.value)}>
                                    <option value="">All Roles</option>
                                    <option value="admin">Admin</option>
                                    <option value="clinician">Clinician</option>
                                    <option value="scribe">Scribe</option>
                                    <option value="qps">QPS</option>
                                </select>
                                <select style={{ ...s.input, width: 'auto' }} value={auditActionFilter} onChange={e => setAuditActionFilter(e.target.value)}>
                                    <option value="">All Actions</option>
                                    {Object.entries(ACTION_CFG).map(([key, cfg]) => (
                                        <option key={key} value={key}>{cfg.label}</option>
                                    ))}
                                </select>
                                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <span style={{ fontSize: 12, color: '#888780' }}>{filteredLogs.length} events</span>
                                    <button style={s.addBtn} onClick={loadAuditLogs}>🔄 Refresh</button>
                                </div>
                            </div>

                            {auditLoading ? <LoadingBox /> : filteredLogs.length === 0 ? (
                                <EmptyBox text="No audit logs found." />
                            ) : (
                                <div style={s.table}>
                                    <div style={s.tHead}>
                                        <div style={{ flex: 1.5 }}>Time</div>
                                        <div style={{ flex: 1.5 }}>User</div>
                                        <div style={{ flex: 1 }}>Role</div>
                                        <div style={{ flex: 2 }}>Action</div>
                                        <div style={{ flex: 3 }}>Details</div>
                                    </div>
                                    {filteredLogs.map(log => {
                                        const actionCfg = ACTION_CFG[log.action] || { label: log.action, color: '#5F5E5A', bg: '#F1EFE8' }
                                        const roleCfg   = ROLE_CFG[log.user_role] || { label: log.user_role, bg: '#F1EFE8', color: '#5F5E5A' }
                                        const time = new Date(log.created_at)
                                        return (
                                            <div key={log.id} style={{ ...s.tRow, alignItems: 'flex-start' }}>
                                                <div style={{ flex: 1.5 }}>
                                                    <div style={{ fontSize: 12, color: '#0F1E3C', fontWeight: 500 }}>
                                                        {time.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                    </div>
                                                    <div style={{ fontSize: 11, color: '#888780', marginTop: 2 }}>
                                                        {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </div>
                                                <div style={{ flex: 1.5 }}>
                                                    <div style={{ fontSize: 13, fontWeight: 500, color: '#0F1E3C' }}>{log.user_name || 'System'}</div>
                                                </div>
                                                <div style={{ flex: 1 }}>
                          <span style={{ ...s.badge, background: roleCfg.bg, color: roleCfg.color, fontSize: 10 }}>
                            {log.user_role}
                          </span>
                                                </div>
                                                <div style={{ flex: 2 }}>
                          <span style={{ ...s.badge, background: actionCfg.bg, color: actionCfg.color, fontSize: 10 }}>
                            {actionCfg.label}
                          </span>
                                                </div>
                                                <div style={{ flex: 3, fontSize: 12, color: '#5F5E5A' }}>{log.details || '—'}</div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </>
                    )}

                    {/* ── SETTINGS ──────────────────────────────── */}
                    {tab === 'settings' && (
                        <>
                            <div style={s.secLabel}>Platform Configuration</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                                {[
                                    { icon: '🔑', title: 'Default Password',    desc: 'Assigned to all new users',            value: 'password*2026' },
                                    { icon: '💰', title: 'Default Scribe Rate', desc: 'Base rate per note for payroll',        value: '$2.50 / note' },
                                    { icon: '⏱', title: 'Session Timeout',     desc: 'Auto logout after period',              value: '8 hours (JWT)' },
                                    { icon: '🌐', title: 'Platform Name',       desc: 'Displayed across all portals',          value: 'Anot' },
                                ].map((item, i) => (
                                    <div key={i} style={s.formCard}>
                                        <div style={{ fontWeight: 600, fontSize: 13, color: '#0F1E3C', marginBottom: 4 }}>{item.icon} {item.title}</div>
                                        <div style={{ fontSize: 12, color: '#888780', marginBottom: 10 }}>{item.desc}</div>
                                        <div style={{ fontSize: 13, color: '#0F1E3C', fontWeight: 500, background: '#F5F5F3', padding: '8px 12px', borderRadius: 8 }}>{item.value}</div>
                                    </div>
                                ))}
                            </div>
                            <div style={s.secLabel}>Security</div>
                            <div style={s.formCard}>
                                <div style={{ fontWeight: 600, fontSize: 13, color: '#0F1E3C', marginBottom: 12 }}>🔒 Security Features</div>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {['JWT Authentication ✓','Role-based Access ✓','bcrypt Password Hashing ✓','Protected API Routes ✓','Audit Logging ✓'].map((f, i) => (
                                        <span key={i} style={{ ...s.badge, background: '#E1F5EE', color: '#085041' }}>{f}</span>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}

                </div>
            </div>

            {/* ── ADD USER MODAL ────────────────────────────── */}
            {showAdd && (
                <div style={s.overlay}>
                    <div style={s.modal}>
                        <div style={s.modalTitle}>{ROLE_CFG[addRole]?.icon} Register New {ROLE_CFG[addRole]?.label}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                            {[
                                ['Full Name *', 'name', 'text', 'Full name'],
                                ['Email *', 'email', 'email', 'name@anot.ai'],
                                ['Phone', 'phone', 'text', '+1 (555) 000-0000'],
                                ...(addRole === 'clinician' ? [
                                    ['Specialty', 'specialty', 'text', 'e.g. Internal Medicine'],
                                    ['NPI Number', 'npi', 'text', 'NPI-0000000000'],
                                    ['License', 'license', 'text', 'MD-XX-00000'],
                                ] : [['Specialty', 'specialty', 'text', 'Optional']]),
                            ].map(([l, k, type, ph]) => (
                                <div key={k} style={s.formGroup}>
                                    <label style={s.formLabel}>{l}</label>
                                    <input style={s.input} type={type} placeholder={ph}
                                           value={newUser[k] || ''} onChange={e => setNewUser({ ...newUser, [k]: e.target.value })} />
                                </div>
                            ))}
                        </div>
                        {addError && <div style={s.errBox}>⚠ {addError}</div>}
                        <div style={{ fontSize: 11, color: '#888780', marginBottom: 12 }}>Default password: <strong>password*2026</strong></div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button style={s.addBtn} onClick={registerUser} disabled={addLoading}>
                                {addLoading ? 'Registering...' : `Register ${ROLE_CFG[addRole]?.label}`}
                            </button>
                            <button style={s.cancelBtn} onClick={() => { setShowAdd(false); setAddError('') }}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── EDIT USER MODAL ───────────────────────────── */}
            {editUser && (
                <div style={s.overlay}>
                    <div style={s.modal}>
                        <div style={s.modalTitle}>✏️ Edit — {editUser.name}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                            {[['Full Name', 'name'],['Email', 'email'],['Phone', 'phone'],['Specialty', 'specialty'],
                                ...(editUser.role === 'clinician' ? [['NPI', 'npi'],['License', 'license']] : []),
                            ].map(([l, k]) => (
                                <div key={k} style={s.formGroup}>
                                    <label style={s.formLabel}>{l}</label>
                                    <input style={s.input} value={editUser[k] || ''}
                                           onChange={e => setEditUser({ ...editUser, [k]: e.target.value })} />
                                </div>
                            ))}
                            <div style={s.formGroup}>
                                <label style={s.formLabel}>Role</label>
                                <select style={s.input} value={editUser.role} onChange={e => setEditUser({ ...editUser, role: e.target.value })}>
                                    <option value="clinician">Clinician</option>
                                    <option value="scribe">Scribe</option>
                                    <option value="qps">QPS</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                            <div style={s.formGroup}>
                                <label style={s.formLabel}>Rate Per Note ($)</label>
                                <input style={s.input} type="number" step="0.50" min="0"
                                       value={editUser.rate_per_note || 2.50}
                                       onChange={e => setEditUser({ ...editUser, rate_per_note: e.target.value })} />
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button style={s.addBtn} onClick={saveEdit} disabled={editLoading}>
                                {editLoading ? 'Saving...' : 'Save Changes'}
                            </button>
                            <button style={s.cancelBtn} onClick={() => setEditUser(null)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── RESET PASSWORD MODAL ──────────────────────── */}
            {resetUser && (
                <div style={s.overlay}>
                    <div style={s.modal}>
                        <div style={s.modalTitle}>🔑 Reset Password</div>
                        <div style={{ fontSize: 13, color: '#888780', marginBottom: 20 }}>
                            <strong style={{ color: '#0F1E3C' }}>{resetUser.name}</strong> · {resetUser.email} · {resetUser.role}
                        </div>
                        <div style={s.formGroup}>
                            <label style={s.formLabel}>New Password</label>
                            <div style={{ position: 'relative' }}>
                                <input style={{ ...s.input, paddingRight: 42 }}
                                       type={showResetPass ? 'text' : 'password'}
                                       placeholder="Minimum 6 characters"
                                       value={resetPass}
                                       onChange={e => setResetPass(e.target.value)} />
                                <button type="button" onClick={() => setShowResetPass(p => !p)}
                                        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: '#888780', padding: 0, lineHeight: 1 }}>
                                    {showResetPass ? '🙈' : '👁️'}
                                </button>
                            </div>
                        </div>
                        <div style={{ fontSize: 12, color: '#888780', margin: '10px 0 16px', padding: '8px 12px', background: '#F5F5F3', borderRadius: 8 }}>
                            💡 Share the new password securely with the user.
                        </div>
                        {resetError && <div style={s.errBox}>⚠ {resetError}</div>}
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button style={s.addBtn} onClick={resetPassword} disabled={resetLoading}>
                                {resetLoading ? 'Resetting...' : 'Reset Password'}
                            </button>
                            <button style={s.cancelBtn} onClick={() => { setResetUser(null); setResetPass(''); setShowResetPass(false) }}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    )
}

// ─── SUB COMPONENTS ───────────────────────────────────────────────────────────

function LoadingBox() {
    return <div style={{ padding: 32, textAlign: 'center', color: '#888780', fontSize: 13 }}>Loading...</div>
}

function EmptyBox({ text }) {
    return <div style={{ padding: 32, textAlign: 'center', color: '#888780', fontSize: 13 }}>{text}</div>
}

function ScoreBar({ value }) {
    if (!value || value === 0) return <span style={{ color: '#B4B2A9', fontSize: 12 }}>—</span>
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ flex: 1, height: 4, background: '#E8E8E4', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${value}%`, height: '100%', borderRadius: 2, background: value >= 90 ? '#0D9E8A' : value >= 75 ? '#E8940A' : '#E24B4A' }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 500, color: '#0F1E3C', minWidth: 24 }}>{value}</span>
        </div>
    )
}

// ─── STYLES ───────────────────────────────────────────────────────────────────

const s = {
    page:        { display: 'flex', minHeight: '100vh', fontFamily: "'Segoe UI', system-ui, sans-serif", background: '#F5F5F3' },
    sidebar:     { width: 220, background: '#0F1E3C', display: 'flex', flexDirection: 'column', flexShrink: 0, position: 'fixed', top: 0, left: 0, height: '100vh', overflowY: 'auto', zIndex: 100 },
    sTop:        { padding: '22px 18px 14px', borderBottom: '1px solid rgba(255,255,255,.08)' },
    logo:        { fontSize: 17, fontWeight: 700, color: '#fff' },
    logoSub:     { fontSize: 10, color: 'rgba(255,255,255,.3)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '.07em' },
    nav:         { padding: '10px 0', flex: 1 },
    navItem:     { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', fontSize: 13, color: 'rgba(255,255,255,.45)', cursor: 'pointer', borderLeft: '2px solid transparent', transition: 'all .15s' },
    navActive:   { color: '#fff', background: 'rgba(13,158,138,.15)', borderLeft: '2px solid #0D9E8A' },
    navBadge:    { background: 'rgba(255,255,255,.15)', borderRadius: 10, fontSize: 10, padding: '1px 7px', color: 'rgba(255,255,255,.7)' },
    sFooter:     { padding: '14px 18px', borderTop: '1px solid rgba(255,255,255,.08)' },
    fName:       { fontSize: 12, color: 'rgba(255,255,255,.65)', fontWeight: 500 },
    fRole:       { fontSize: 11, color: 'rgba(255,255,255,.3)', marginTop: 2 },
    logout:      { marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,.3)', cursor: 'pointer', textDecoration: 'underline' },
    main:        { marginLeft: 220, flex: 1, display: 'flex', flexDirection: 'column' },
    topbar:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', height: 56, background: '#fff', borderBottom: '1px solid #E8E8E4', position: 'sticky', top: 0, zIndex: 10 },
    topTitle:    { fontSize: 15, fontWeight: 600, color: '#0F1E3C' },
    topMeta:     { fontSize: 12, color: '#888780', marginTop: 2 },
    avatar:      { width: 34, height: 34, borderRadius: '50%', background: '#0F1E3C', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600 },
    body:        { padding: '22px 24px', flex: 1, overflowY: 'auto' },
    statsGrid:   { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 22 },
    statCard:    { background: '#fff', border: '1px solid #E8E8E4', borderRadius: 12, padding: 16 },
    overviewGrid:{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 },
    overCard:    { background: '#0F1E3C', borderRadius: 12, padding: 18 },
    overTitle:   { fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 14 },
    overRow:     { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,.06)' },
    overName:    { fontSize: 13, color: '#fff', fontWeight: 500 },
    overSub:     { fontSize: 11, color: 'rgba(255,255,255,.35)', marginTop: 1 },
    dot:         { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },
    secLabel:    { fontSize: 11, fontWeight: 600, color: '#888780', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 },
    table:       { background: '#fff', border: '1px solid #E8E8E4', borderRadius: 12, overflow: 'hidden' },
    tHead:       { display: 'flex', padding: '10px 16px', background: '#FAFAF8', borderBottom: '1px solid #E8E8E4', fontSize: 11, fontWeight: 600, color: '#888780', textTransform: 'uppercase', letterSpacing: '.05em' },
    tRow:        { display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #F1EFE8', fontSize: 13 },
    badge:       { display: 'inline-flex', padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600 },
    actionBtn:   { padding: '4px 10px', borderRadius: 6, background: '#F1EFE8', color: '#5F5E5A', border: '1px solid #E8E8E4', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' },
    addBtn:      { padding: '8px 16px', borderRadius: 8, background: '#0D9E8A', color: '#fff', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
    cancelBtn:   { padding: '8px 16px', borderRadius: 8, background: '#F1EFE8', color: '#5F5E5A', border: '1px solid #E8E8E4', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
    input:       { padding: '9px 12px', borderRadius: 8, border: '1px solid #E8E8E4', fontSize: 13, color: '#0F1E3C', outline: 'none', fontFamily: 'inherit', background: '#FAFAF8', width: '100%', boxSizing: 'border-box' },
    formCard:    { background: '#fff', border: '1px dashed #B4B2A9', borderRadius: 12, padding: 20, marginBottom: 16 },
    formTitle:   { fontSize: 14, fontWeight: 600, color: '#0F1E3C', marginBottom: 14 },
    formGroup:   { display: 'flex', flexDirection: 'column', gap: 5 },
    formLabel:   { fontSize: 11, fontWeight: 600, color: '#5F5E5A', textTransform: 'uppercase', letterSpacing: '.05em' },
    errBox:      { background: '#FCEBEB', border: '1px solid #F09595', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#A32D2D', marginBottom: 10 },
    overlay:     { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 20 },
    modal:       { background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 560, boxShadow: '0 8px 40px rgba(0,0,0,.18)', maxHeight: '90vh', overflowY: 'auto' },
    modalTitle:  { fontSize: 16, fontWeight: 700, color: '#0F1E3C', marginBottom: 20 },
}