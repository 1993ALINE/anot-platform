import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login/index'
import Clinician from './pages/Clinician/index'
import Scribe from './pages/Scribe/index'
import QPS from './pages/QPS/index'
import Admin from './pages/Admin/index'

// ─── PROTECTED ROUTE ─────────────────────────────────────────────────────────
// Checks if user is logged in and has the correct role
// If not, redirects to login page

function ProtectedRoute({ element, allowedRole }) {
    const token = localStorage.getItem('token')
    const user = localStorage.getItem('user')

    // Not logged in at all
    if (!token || !user) {
        return <Navigate to="/" replace />
    }

    // Parse user
    let parsedUser
    try {
        parsedUser = JSON.parse(user)
    } catch {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        return <Navigate to="/" replace />
    }

    // Wrong role trying to access wrong dashboard
    if (parsedUser.role !== allowedRole) {
        return <Navigate to={`/${parsedUser.role}`} replace />
    }

    return element
}

// ─── APP ─────────────────────────────────────────────────────────────────────

function App() {
    return (
        <BrowserRouter>
            <Routes>
                {/* Public route — login page */}
                <Route path="/" element={<Login />} />

                {/* Protected routes — each checks role */}
                <Route
                    path="/clinician"
                    element={<ProtectedRoute element={<Clinician />} allowedRole="clinician" />}
                />
                <Route
                    path="/scribe"
                    element={<ProtectedRoute element={<Scribe />} allowedRole="scribe" />}
                />
                <Route
                    path="/qps"
                    element={<ProtectedRoute element={<QPS />} allowedRole="qps" />}
                />
                <Route
                    path="/admin"
                    element={<ProtectedRoute element={<Admin />} allowedRole="admin" />}
                />

                {/* Catch all — redirect to login */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    )
}

export default App