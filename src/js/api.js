(function() {
  const BASE = '/api';

  function getToken() {
    return localStorage.getItem('auth_token') || '';
  }

  function setToken(token) {
    if (token) localStorage.setItem('auth_token', token);
    else localStorage.removeItem('auth_token');
  }

  function getHeaders() {
    const h = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) h['Authorization'] = 'Bearer ' + token;
    return h;
  }

  async function apiFetch(method, path, body) {
    const opts = { method, headers: getHeaders() };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(BASE + path, opts);
    return res.json();
  }

  function apiGet(path) { return apiFetch('GET', path); }
  function apiPost(path, body) { return apiFetch('POST', path, body); }
  function apiPut(path, body) { return apiFetch('PUT', path, body); }
  function apiDelete(path) { return apiFetch('DELETE', path); }

  // File helpers for web
  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function uploadFile(file) {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('file', file);
      fetch(BASE + '/upload', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + getToken() }
      }).then(r => r.json()).then(resolve).catch(reject);
    });
  }

  function uploadBase64(base64, filename) {
    return apiPost('/upload-base64', { base64, filename });
  }

  function openFileDialog(accept) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      if (accept) input.accept = accept;
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => resolve({ data: ev.target.result, fileName: file.name, file });
          reader.readAsDataURL(file);
        } else {
          resolve(null);
        }
      };
      input.click();
    });
  }

  function qs(obj) {
    if (!obj) return '';
    const parts = [];
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined && v !== null && v !== '') parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  // ─── API ───
  window.api = {
    // Auth
    login: (username, password) => apiPost('/auth/login', { username, password }).then(r => { if (r.success && r.token) setToken(r.token); return r; }),
    logout: () => { setToken(null); return Promise.resolve({ success: true }); },
    signup: (data) => apiPost('/auth/signup', data),
    getCurrentUser: () => apiGet('/auth/me'),
    changePassword: (userId, currentPw, newPw) => apiPost('/auth/change-password', { userId, currentPassword: currentPw, newPassword: newPw }),
    switchSchool: (schoolId) => apiPost('/auth/switch-school', { school_id: schoolId }).then(r => { if (r.success && r.token) setToken(r.token); return r; }),

    // Schools
    getSchools: () => apiGet('/schools'),
    getApprovedSchools: () => apiGet('/schools/approved'),
    getSchool: (id) => apiGet('/schools/' + id),
    addSchool: (data) => apiPost('/schools', data),
    updateSchool: (id, data) => apiPut('/schools/' + id, data),
    deleteSchool: (id) => apiDelete('/schools/' + id),
    approveSchool: (id) => apiPost('/schools/' + id + '/approve'),
    rejectSchool: (id) => apiPost('/schools/' + id + '/reject'),

    // Users
    getUsers: (schoolId) => apiGet('/users' + qs({ school_id: schoolId })),
    addUser: (data) => apiPost('/users', data),
    updateUser: (id, data) => apiPut('/users/' + id, data),
    deleteUser: (id) => apiDelete('/users/' + id),

    // Dashboard
    getGlobalDashboard: () => apiGet('/data/dashboard'),

    // Students
    addStudent: (data) => apiPost('/data/students', data),
    updateStudent: (id, data) => apiPut('/data/students/' + id, data),
    deleteStudent: (id) => apiDelete('/data/students/' + id),
    deleteMultipleStudents: (ids) => apiPost('/data/students/delete-multiple', { ids }),
    getStudents: (query) => apiGet('/data/students' + qs(query)),
    getStudent: (id) => apiGet('/data/students/' + id),

    // Subjects
    addSubject: (data) => apiPost('/data/subjects', data),
    updateSubject: (id, data) => apiPut('/data/subjects/' + id, data),
    deleteSubject: (id) => apiDelete('/data/subjects/' + id),
    deleteMultipleSubjects: (ids) => apiPost('/data/subjects/delete-multiple', { ids }),
    getSubjects: (query) => apiGet('/data/subjects' + qs(query)),
    getSubject: (id) => apiGet('/data/subjects/' + id),

    // Teachers
    addTeacher: (data) => apiPost('/data/teachers', data),
    updateTeacher: (id, data) => apiPut('/data/teachers/' + id, data),
    deleteTeacher: (id) => apiDelete('/data/teachers/' + id),
    deleteMultipleTeachers: (ids) => apiPost('/data/teachers/delete-multiple', { ids }),
    getTeachers: (query) => apiGet('/data/teachers' + qs(query)),
    getTeacher: (id) => apiGet('/data/teachers/' + id),

    // Staff
    addStaff: (data) => apiPost('/data/staff', data),
    updateStaff: (id, data) => apiPut('/data/staff/' + id, data),
    deleteStaff: (id) => apiDelete('/data/staff/' + id),
    deleteMultipleStaff: (ids) => apiPost('/data/staff/delete-multiple', { ids }),
    getStaffList: (query) => apiGet('/data/staff' + qs(query)),
    getStaff: (id) => apiGet('/data/staff/' + id),

    // Attendance
    saveAttendance: (data) => apiPost('/data/attendance', { records: Array.isArray(data) ? data : [data] }),
    getAttendance: (query) => apiGet('/data/attendance' + qs(query)),
    getAttendanceStats: (studentId, session) => apiGet('/data/attendance-stats' + qs({ student_id: studentId, session })),

    // Sections
    getSections: (query) => apiGet('/data/sections' + qs(query)),
    addSection: (data) => apiPost('/data/sections', data),
    updateSection: (id, data) => apiPut('/data/sections/' + id, data),
    deleteSection: (id) => apiDelete('/data/sections/' + id),

    // Routines
    getRoutines: (query) => apiGet('/data/routines' + qs(query)),
    saveRoutines: (data) => apiPost('/data/routines', data),

    // Fees
    getFeeItems: (query) => apiGet('/data/fee-items' + qs(query)),
    addFeeItem: (data) => apiPost('/data/fee-items', data),
    updateFeeItem: (id, data) => apiPut('/data/fee-items/' + id, data),
    deleteFeeItem: (id) => apiDelete('/data/fee-items/' + id),
    getFeeCollections: (query) => apiGet('/data/fee-collections' + qs(query)),
    saveFeeCollection: (data) => apiPost('/data/fee-collections', data),
    getFeeCollectionItems: (id) => apiGet('/data/fee-collections/' + id + '/items'),
    deleteFeeCollection: (id) => apiDelete('/data/fee-collections/' + id),

    // Subject Registrations
    saveSubjectRegistrations: (data) => apiPost('/data/subject-registrations', data),
    bulkSubjectRegistration: (data) => apiPost('/data/subject-registrations/bulk', data),
    getSubjectRegistrations: (student_id, session) => apiGet('/data/subject-registrations' + qs({ student_id, session })),

    // Marks
    saveMarks: (data) => apiPost('/data/marks', data),
    getMarks: (query) => apiGet('/data/marks' + qs(query)),

    // Results
    processResult: (data) => apiPost('/data/results/process', data),
    getResults: (query) => apiGet('/data/results' + qs(query)),

    // Export/Import
    exportJSON: (type) => apiGet('/data/export' + qs({ type })),
    importJSON: (data) => apiPost('/data/import', { data }),

    // Settings
    getSetting: (key) => apiGet('/data/settings/' + key),
    getAllSettings: () => apiGet('/data/settings'),
    setSetting: (key, value) => apiPost('/data/settings', { key, value }),
    saveLogo: (base64) => apiPost('/data/logo', { base64 }),

    // Books
    getBooks: (query) => apiGet('/data/books' + qs(query)),
    getBook: (id) => apiGet('/data/books/' + id),
    saveBook: (data) => apiPost('/data/books', data),
    deleteBook: (id) => apiDelete('/data/books/' + id),
    getBookIssues: (query) => apiGet('/data/book-issues' + qs(query)),
    issueBook: (data) => apiPost('/data/book-issues', data),
    returnBook: (id, date) => apiPut('/data/book-issues/' + id + '/return', { return_date: date }),

    // Backup (downloads all data as JSON)
    backup: async () => {
      const res = await apiGet('/data/backup');
      if (res.success) {
        const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const name = `backup-${new Date().toISOString().slice(0,10)}.json`;
        a.download = name;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return { success: true, path: name };
      }
      return res;
    },

    // Drive Backup (stubbed for web — will need OAuth redirect flow)
    driveConnect: () => Promise.resolve({ success: false, error: 'Drive backup requires Electron desktop app' }),
    driveDisconnect: () => Promise.resolve({ success: true }),
    driveBackupNow: () => Promise.resolve({ success: false, error: 'Drive backup requires Electron desktop app' }),
    driveGetStatus: () => Promise.resolve({ success: true, data: { connected: false, email: '', lastBackup: '', interval: 86400000, keepCount: 30, history: [], clientConfigured: false } }),
    driveSetSettings: () => Promise.resolve({ success: true }),
    driveRestoreFull: () => Promise.resolve({ success: false, error: 'Drive backup requires Electron desktop app' }),
    driveRestoreSchool: () => Promise.resolve({ success: false, error: 'Drive backup requires Electron desktop app' }),
    driveDeleteFile: () => Promise.resolve({ success: true }),
    driveDownloadFile: () => Promise.resolve({ success: false, error: 'Drive backup requires Electron desktop app' }),
    driveApplyFullRestore: () => Promise.resolve({ success: false, error: 'Drive backup requires Electron desktop app' }),

    // Utilities
    openExternal: (url) => { window.open(url, '_blank'); return Promise.resolve(true); },
    saveFile: (opts) => downloadFile(opts.data, opts.filename, opts.mimeType) || Promise.resolve(true),
    openFile: (opts) => openFileDialog(opts.accept),

    // Nepali date
    bsToAd: (bsDate) => apiGet('/data/nepali-bs-to-ad' + qs({ bs: bsDate })),

    // Upload helpers
    uploadFile,
    uploadBase64,

    // Token management (for internal use)
    _getToken: getToken,
    _setToken: setToken
  };
})();
