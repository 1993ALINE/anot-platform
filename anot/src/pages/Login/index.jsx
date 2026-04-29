import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import '../global.css'
import { authAPI } from '../../services/api'

const roles = [
    { id: 'clinician', label: 'Clinician', path: '/clinician', icon: '🩺', desc: 'Record visits & review notes' },
    { id: 'scribe',    label: 'Scribe',    path: '/scribe',    icon: '📝', desc: 'Transcribe & write final notes' },
    { id: 'qps',       label: 'QPS',       path: '/qps',       icon: '✅', desc: 'Review & grade scribe notes' },
    { id: 'admin',     label: 'Admin',     path: '/admin',     icon: '⚙️', desc: 'Manage users & payroll' },
]

export default function Login() {
    const navigate = useNavigate()
    const [role, setRole]         = useState('clinician')
    const [email, setEmail]       = useState('')
    const [password, setPassword] = useState('')
    const [showPass, setShowPass] = useState(false)
    const [loading, setLoading]   = useState(false)
    const [error, setError]       = useState('')

    const handleLogin = async (e) => {
        e.preventDefault()
        setError('')
        if (!email || !password) {
            setError('Please enter your email and password.')
            return
        }
        setLoading(true)
        try {
            const data = await authAPI.login(email, password, role)
            navigate(`/${data.user.role}`)
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="sf-login-page">
            <div className="sf-login-card">

                {/* ── Left panel ── */}
                <div className="sf-login-left">
                    <div>
                        <div className="sf-login-logo">Anot</div>
                        <div className="sf-login-tagline">Clinical Documentation, Simplified.</div>
                        <div className="sf-login-divider" />
                        {[
                            'Save 2–3 hours daily',
                            'Reduce clinician burnout',
                            'Improve note accuracy',
                            'Increase patient volume',
                            'Secure multi-role access',
                        ].map((f, i) => (
                            <div key={i} className="sf-login-feature">
                                <div className="sf-login-feature-dot" />
                                <div className="sf-login-feature-txt">{f}</div>
                            </div>
                        ))}
                    </div>
                    <div className="sf-login-footer">© 2026 Anot · All rights reserved</div>
                </div>

                {/* ── Right panel ── */}
                <div className="sf-login-right">
                    <div className="sf-login-title">Welcome back</div>
                    <div className="sf-login-sub">Sign in to your portal</div>

                    {/* Role selector */}
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#5F5E5A', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                        I am a
                    </div>
                    <div className="sf-role-grid">
                        {roles.map(r => (
                            <div key={r.id}
                                 className={`sf-role-card${role === r.id ? ' active' : ''}`}
                                 onClick={() => setRole(r.id)}>
                                <div className="sf-role-icon">{r.icon}</div>
                                <div className="sf-role-label">{r.label}</div>
                                <div className="sf-role-desc">{r.desc}</div>
                            </div>
                        ))}
                    </div>

                    {/* Form */}
                    <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                        {/* Email */}
                        <div className="sf-form-group">
                            <label className="sf-form-label">Email address</label>
                            <input
                                className="sf-input"
                                type="email"
                                placeholder="you@clinic.com"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                autoComplete="email"
                            />
                        </div>

                        {/* Password */}
                        <div className="sf-form-group">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                                <label className="sf-form-label" style={{ marginBottom: 0 }}>Password</label>
                                <span style={{ fontSize: 12, color: '#0D9E8A', cursor: 'pointer' }}>Forgot password?</span>
                            </div>
                            <div style={{ position: 'relative' }}>
                                <input
                                    className="sf-input"
                                    type={showPass ? 'text' : 'password'}
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    autoComplete="current-password"
                                    style={{ paddingRight: 42 }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPass(p => !p)}
                                    style={{
                                        position: 'absolute', right: 12, top: '50%',
                                        transform: 'translateY(-50%)',
                                        background: 'none', border: 'none',
                                        cursor: 'pointer', padding: 0,
                                        fontSize: 15, color: '#888780',
                                        lineHeight: 1, display: 'flex',
                                        alignItems: 'center', justifyContent: 'center',
                                    }}
                                    title={showPass ? 'Hide password' : 'Show password'}>
                                    {showPass ? '🙈' : '👁️'}
                                </button>
                            </div>
                        </div>

                        {/* Error */}
                        {error && (
                            <div style={{
                                background: '#FCEBEB', border: '1px solid #F09595',
                                borderRadius: 8, padding: '10px 14px',
                                fontSize: 13, color: '#A32D2D',
                            }}>
                                ⚠ {error}
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            className="btn btn-navy btn-lg btn-full"
                            style={{ marginTop: 4, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
                            disabled={loading}>
                            {loading ? 'Signing in...' : `Sign in as ${roles.find(r => r.id === role)?.label}`}
                        </button>
                    </form>

                    <div style={{ fontSize: 12, color: '#888780', textAlign: 'center', marginTop: 20 }}>
                        Having trouble?{' '}
                        <span style={{ color: '#0D9E8A', cursor: 'pointer' }}>Contact your administrator</span>
                    </div>
                </div>
            </div>
        </div>
    )
}