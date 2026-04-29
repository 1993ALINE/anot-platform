const BASE_URL = 'http://localhost:5000/api'

const getToken = () => localStorage.getItem('token')

const headers = (includeAuth = true) => {
  const h = { 'Content-Type': 'application/json' }
  if (includeAuth) {
    const token = getToken()
    if (token) h['Authorization'] = `Bearer ${token}`
  }
  return h
}

const handleResponse = async (res) => {
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Something went wrong')
  return data
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────

export const authAPI = {
  login: async (email, password, role) => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: headers(false),
      body: JSON.stringify({ email, password, role }),
    })
    const data = await handleResponse(res)
    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify(data.user))
    return data
  },
  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  },
  getCurrentUser: () => {
    const user = localStorage.getItem('user')
    return user ? JSON.parse(user) : null
  },
  isLoggedIn: () => !!getToken(),
  changePassword: async (currentPassword, newPassword) => {
    const res = await fetch(`${BASE_URL}/auth/change-password`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ currentPassword, newPassword }),
    })
    return handleResponse(res)
  },
}

// ─── USERS ────────────────────────────────────────────────────────────────────

export const usersAPI = {
  getAll: async () => {
    const res = await fetch(`${BASE_URL}/users`, { headers: headers() })
    return handleResponse(res)
  },
  register: async (userData) => {
    const res = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(userData),
    })
    return handleResponse(res)
  },
  update: async (id, userData) => {
    const res = await fetch(`${BASE_URL}/users/${id}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(userData),
    })
    return handleResponse(res)
  },
  toggleStatus: async (id) => {
    const res = await fetch(`${BASE_URL}/users/${id}/toggle-status`, {
      method: 'PUT',
      headers: headers(),
    })
    return handleResponse(res)
  },
  deleteUser: async (id) => {
    const res = await fetch(`${BASE_URL}/users/${id}`, {
      method: 'DELETE',
      headers: headers(),
    })
    return handleResponse(res)
  },
  getByRole: async (role) => {
    const res = await fetch(`${BASE_URL}/users/role/${role}`, { headers: headers() })
    return handleResponse(res)
  },
  getMyClinicans: async () => {
    const res = await fetch(`${BASE_URL}/assignments/my-clinicians`, { headers: headers() })
    return handleResponse(res)
  },
  resetPassword: async (id, password) => {
    const res = await fetch(`${BASE_URL}/users/${id}/reset-password`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ password }),
    })
    return handleResponse(res)
  },
  updateRate: async (id, rate) => {
    const res = await fetch(`${BASE_URL}/users/${id}/rate`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ rate_per_note: rate }),
    })
    return handleResponse(res)
  },
}

// ─── PATIENTS ─────────────────────────────────────────────────────────────────

export const patientsAPI = {
  getAll: async () => {
    const res = await fetch(`${BASE_URL}/patients`, { headers: headers() })
    return handleResponse(res)
  },
  create: async (patientData) => {
    const res = await fetch(`${BASE_URL}/patients`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(patientData),
    })
    return handleResponse(res)
  },
}

// ─── VISITS ───────────────────────────────────────────────────────────────────

function localDateStr(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export const visitsAPI = {
  getByDate: async (date) => {
    const res = await fetch(`${BASE_URL}/visits/my?date=${date}`, { headers: headers() })
    return handleResponse(res)
  },
  getHistory: async () => {
    const res = await fetch(`${BASE_URL}/visits/history`, { headers: headers() })
    return handleResponse(res)
  },
  getAll: async (providerId, date) => {
    const params = new URLSearchParams()
    if (providerId) params.append('provider_id', providerId)
    if (date)       params.append('date', date)
    const res = await fetch(`${BASE_URL}/visits?${params.toString()}`, { headers: headers() })
    return handleResponse(res)
  },
  create: async (visitData) => {
    const res = await fetch(`${BASE_URL}/visits`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(visitData),
    })
    return handleResponse(res)
  },
  updateStatus: async (id, status) => {
    const res = await fetch(`${BASE_URL}/visits/${id}/status`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ status }),
    })
    return handleResponse(res)
  },
  endVisit: async (id, durationSeconds) => {
    const res = await fetch(`${BASE_URL}/visits/${id}/end`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ duration_seconds: durationSeconds }),
    })
    return handleResponse(res)
  },
  updateVisit: async (id, data) => {
    const res = await fetch(`${BASE_URL}/visits/${id}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(data),
    })
    return handleResponse(res)
  },
  deleteVisit: async (id) => {
    const res = await fetch(`${BASE_URL}/visits/${id}`, {
      method: 'DELETE',
      headers: headers(),
    })
    return handleResponse(res)
  },
  uploadAudio: async (visitId, audioBlob) => {
    const formData = new FormData()
    const ext = audioBlob.type?.includes('mp4') ? 'mp4' : audioBlob.type?.includes('ogg') ? 'ogg' : 'webm'
    formData.append('audio', audioBlob, `visit_${visitId}_${Date.now()}.${ext}`)
    const res = await fetch(`${BASE_URL}/audio/${visitId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: formData,
    })
    return handleResponse(res)
  },
  appendAudio: async (visitId, audioBlob) => {
    const formData = new FormData()
    const ext = audioBlob.type?.includes('mp4') ? 'mp4' : audioBlob.type?.includes('ogg') ? 'ogg' : 'webm'
    formData.append('audio', audioBlob, `visit_${visitId}_extra_${Date.now()}.${ext}`)
    const res = await fetch(`${BASE_URL}/audio/${visitId}/append`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: formData,
    })
    return handleResponse(res)
  },
  uploadAudioFile: async (visitId, file) => {
    const formData = new FormData()
    formData.append('audio', file, file.name)
    const res = await fetch(`${BASE_URL}/audio/${visitId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: formData,
    })
    return handleResponse(res)
  },
}

// ─── NOTES ────────────────────────────────────────────────────────────────────

export const notesAPI = {
  getByVisit: async (visitId) => {
    const res = await fetch(`${BASE_URL}/notes/visit/${visitId}`, { headers: headers() })
    return handleResponse(res)
  },
  getMyNotes: async () => {
    const res = await fetch(`${BASE_URL}/notes/my`, { headers: headers() })
    return handleResponse(res)
  },
  getClinicianNotes: async () => {
    const res = await fetch(`${BASE_URL}/notes/clinician`, { headers: headers() })
    return handleResponse(res)
  },
  getAllNotes: async (providerId, status) => {
    const params = new URLSearchParams()
    if (providerId) params.append('provider_id', providerId)
    if (status)     params.append('status', status)
    const res = await fetch(`${BASE_URL}/notes?${params.toString()}`, { headers: headers() })
    return handleResponse(res)
  },
  saveDraft: async (visitId, finalNote, transcription, aiDraft) => {
    const res = await fetch(`${BASE_URL}/notes/draft`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        visit_id:      visitId,
        final_note:    finalNote,
        transcription: transcription || null,
        ai_draft:      aiDraft || null,
      }),
    })
    return handleResponse(res)
  },
  submitNote: async (noteId) => {
    const res = await fetch(`${BASE_URL}/notes/${noteId}/submit`, {
      method: 'PUT',
      headers: headers(),
    })
    return handleResponse(res)
  },
  requestEdit: async (noteId, message) => {
    const res = await fetch(`${BASE_URL}/notes/${noteId}/request-edit`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ message }),
    })
    return handleResponse(res)
  },
  submitGrade: async (gradeData) => {
    const res = await fetch(`${BASE_URL}/notes/grade`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(gradeData),
    })
    return handleResponse(res)
  },
  getMyGrades: async () => {
    const res = await fetch(`${BASE_URL}/notes/my-grades`, { headers: headers() })
    return handleResponse(res)
  },
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────

export const adminAPI = {
  getStats: async () => {
    const res = await fetch(`${BASE_URL}/users/stats`, { headers: headers() })
    return handleResponse(res)
  },
  getPayroll: async () => {
    const res = await fetch(`${BASE_URL}/users/payroll`, { headers: headers() })
    return handleResponse(res)
  },
  getPerformance: async () => {
    const res = await fetch(`${BASE_URL}/users/performance`, { headers: headers() })
    return handleResponse(res)
  },
  getAuditLogs: async (params = {}) => {
    const query = new URLSearchParams(params).toString()
    const res = await fetch(`${BASE_URL}/audit?${query}`, { headers: headers() })
    return handleResponse(res)
  },
}