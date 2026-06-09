// All supported classes
window._ALL_CLASSES = ['ECD','1','2','3','4','5','6','7','8','9','10','11','12'];
function _classOpts(sel) { return window._ALL_CLASSES.map(c => `<option value="${c}" ${sel===c?'selected':''}>${c}</option>`).join(''); }
function _classOptsAll(sel) { return '<option value="">All</option>'+_classOpts(sel); }

const App = {
  currentPage: 'dashboard',
  user: null,
  state: {
    students: [], subjects: [], marks: [], results: [],
    currentStudent: null, session: '', currentMarksStudent: null,
    school: {},
    schools: [],
    studentPage: 1,
    rowsPerPage: 25,
    subjectPage: 1,
    subjectRowsPerPage: 25,
    regPage: 1,
    regRowsPerPage: 25,
    acPage: 1,
    acRowsPerPage: 25,
    marksPage: 1,
    marksRowsPerPage: 25,
    resultPage: 1,
    resultRowsPerPage: 25
  },

  async bsToAd(bsDate) {
    if (!bsDate || !/^\d{4}-\d{2}-\d{2}$/.test(bsDate)) return '';
    const res = await api.bsToAd(bsDate);
    return res.success ? res.data : '';
  },

  async convertDobBs(input) {
    const ad = await this.bsToAd(input.value);
    if (!ad) return;
    const adInput = document.querySelector('[name="dob"]');
    if (adInput) adInput.value = ad;
  },

  async init() {
    const userRes = await api.getCurrentUser();
    if (!userRes.success || !userRes.user) {
      document.getElementById('landingPage').style.display = 'flex';
      document.getElementById('loginPage').style.display = 'none';
      document.getElementById('app').style.display = 'none';
      this.loadApprovedSchools();
      return;
    }
    this.user = userRes.user;
    document.getElementById('landingPage').style.display = 'none';
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    document.getElementById('userMenuName').textContent = this.user.full_name || this.user.username;
    document.getElementById('userRoleDisplay').textContent = this.user.role === 'super_admin' ? 'Super Admin' : (this.user.role || 'User');
    if (this.user.role === 'super_admin') {
      document.getElementById('schoolSwitcher').style.display = 'inline-block';
      await this.loadSchoolSwitcher();
    }
    await this.loadSession();
    await this.loadSchoolProfile();
    await this.loadSidebarYears();
    this.renderSidebar();
    this.setupNavigation();
    this.setupBackup();
    document.addEventListener('click', (e) => {
      const menu = document.getElementById('userMenuDropdown');
      if (menu && !e.target.closest('.user-menu') && menu.style.display !== 'none') {
        menu.style.display = 'none';
      }
    });
    await this.navigate('dashboard');
  },

  async loadSession() {
    const res = await api.getSetting('current_session');
    if (res.success && res.value) {
      this.state.session = res.value;
      document.getElementById('sessionDropdown').value = this.state.session;
    }
  },

  async loadSidebarYears() {
    const acRes = await api.getSetting('academic_years');
    const years = acRes.success && acRes.value ? this.normalizeAcademicYears(JSON.parse(acRes.value)) : [];
    const sel = document.getElementById('sessionDropdown');
    sel.innerHTML = years.map(y => `<option value="${y.year}" ${y.year===this.state.session?'selected':''}>${y.year}</option>`).join('');
    if (!years.length) sel.innerHTML = '<option value="">— No years —</option>';
  },

  async loadSchoolProfile() {
    if (this.user && this.user.school_id) {
      const res = await api.getSchool(this.user.school_id);
      if (res.success && res.data) {
        const s = res.data;
        // Backward compat: map to old setting keys for existing pages
        this.state.school = {
          ...s,
          school_name: s.name,
          school_logo: s.school_logo,
          municipality: s.municipality || '',
          province: s.province || '',
          estd: s.estd || '',
          iemis_id: s.iemis_id || '',
          phone: s.phone || '',
          head_teacher: s.head_teacher || '',
        };
        this.updateSidebarProfile(s);
        return;
      }
    }
    const nameEl = document.getElementById('schoolNameDisplay');
    if (nameEl) nameEl.textContent = 'All Schools';
    document.getElementById('userRoleDisplay').textContent = 'Super Admin';
  },

  updateSidebarProfile(data) {
    const nameEl = document.getElementById('schoolNameDisplay');
    const logoDiv = document.getElementById('sidebarLogo');
    if (nameEl) nameEl.textContent = data.name || 'School Name';
    if (logoDiv) {
      if (data.school_logo) {
        logoDiv.style.display = 'block';
        logoDiv.innerHTML = `<img src="${data.school_logo}" alt="Logo">`;
      } else {
        logoDiv.style.display = 'none';
      }
    }
  },

  toggleNavCategory(header) {
    const cat = header.closest('.nav-category');
    if (cat) {
      cat.classList.toggle('open');
      document.querySelectorAll('.nav-category.open').forEach(c => {
        if (c !== cat) c.classList.remove('open');
      });
    }
  },

  toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      sidebar.classList.toggle('collapsed');
      const icon = document.querySelector('#sidebarToggle i');
      if (icon) icon.className = sidebar.classList.contains('collapsed') ? 'fas fa-bars' : 'fas fa-times';
    }
  },

  togglePassword() {
    const pw = document.getElementById('loginPassword');
    const icon = document.querySelector('#pwToggle i');
    if (pw.type === 'password') {
      pw.type = 'text';
      icon.className = 'fas fa-eye-slash';
    } else {
      pw.type = 'password';
      icon.className = 'fas fa-eye';
    }
  },

  // ─── Landing Page ───

  showLandingLogin() {
    document.getElementById('loginOverlay').classList.add('active');
    document.getElementById('landingLoginError').style.display = 'none';
    document.getElementById('landLoginUser').value = '';
    document.getElementById('landLoginPass').value = '';
    document.getElementById('landLoginUser').focus();
  },

  showLandingSignup() {
    document.getElementById('signupOverlay').classList.add('active');
    document.getElementById('landingSignupError').style.display = 'none';
    document.getElementById('landingSignupSuccess').style.display = 'none';
    document.getElementById('landingSignupForm').style.display = 'block';
  },

  closeLandingOverlays() {
    document.querySelectorAll('.landing-overlay').forEach(o => o.classList.remove('active'));
  },

  switchLandingForm(form) {
    this.closeLandingOverlays();
    if (form === 'login') this.showLandingLogin();
    else this.showLandingSignup();
  },

  async handleLandingLogin(e) {
    e.preventDefault();
    const username = document.getElementById('landLoginUser').value.trim();
    const password = document.getElementById('landLoginPass').value;
    const btn = document.getElementById('landLoginBtn');
    const errDiv = document.getElementById('landingLoginError');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';
    errDiv.style.display = 'none';
    const res = await api.login(username, password);
    if (res.success) {
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
      document.getElementById('landingPage').style.display = 'none';
      document.getElementById('loginPage').style.display = 'none';
      this.closeLandingOverlays();
      await this.init();
    } else {
      errDiv.textContent = res.error || 'Login failed';
      errDiv.style.display = 'block';
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
    }
  },

  async loadApprovedSchools() {
    const res = await api.getApprovedSchools();
    const grid = document.getElementById('schoolsGrid');
    if (!res.success || !res.data || !res.data.length) {
      grid.innerHTML = '<div class="schools-empty">No schools registered yet. Be the first one!</div>';
      return;
    }
    grid.innerHTML = res.data.map(s => `
      <div class="school-card">
        <div class="school-logo-wrap">
          ${s.school_logo ? `<img src="${s.school_logo}" alt="${s.name}">` : '<span class="material-symbols-outlined no-logo">school</span>'}
        </div>
        <h4>${s.name}</h4>
        ${s.iemis_id ? `<p class="school-iemis"><i class="fas fa-fingerprint" style="font-size:10px;"></i> IEMIS: ${s.iemis_id}</p>` : ''}
        ${(s.municipality || s.district) ? `<p class="school-location"><i class="fas fa-map-marker-alt" style="font-size:10px;"></i> ${[s.municipality, s.district].filter(Boolean).join(', ')}</p>` : ''}
      </div>
    `).join('');
  },

  async handleLandingSignup(e) {
    e.preventDefault();
    const data = {
      school_name: document.getElementById('signupSchool').value.trim(),
      municipality: document.getElementById('signupMunicipality').value.trim(),
      district: document.getElementById('signupDistrict').value.trim(),
      province: document.getElementById('signupProvince').value.trim(),
      iemis_id: document.getElementById('signupIemis').value.trim(),
      phone: document.getElementById('signupPhone').value.trim(),
      email: document.getElementById('signupEmail').value.trim(),
      admin_username: document.getElementById('signupUser').value.trim(),
      admin_password: document.getElementById('signupPass').value,
    };
    if (!data.school_name) { alert('School name is required'); return; }
    if (!data.admin_username || data.admin_username.length < 3) { alert('Username must be at least 3 characters'); return; }
    if (!data.admin_password || data.admin_password.length < 4) { alert('Password must be at least 4 characters'); return; }
    const btn = document.getElementById('signupBtn');
    const errDiv = document.getElementById('landingSignupError');
    const successDiv = document.getElementById('landingSignupSuccess');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registering...';
    errDiv.style.display = 'none';
    successDiv.style.display = 'none';
    const res = await api.signup(data);
    if (res.success) {
      successDiv.textContent = res.message || 'School registered successfully!';
      successDiv.style.display = 'block';
      document.getElementById('landingSignupForm').style.display = 'none';
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-school"></i> Register School';
      this.loadApprovedSchools();
    } else {
      errDiv.textContent = res.error || 'Registration failed';
      errDiv.style.display = 'block';
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-school"></i> Register School';
    }
  },

  async handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const btn = document.getElementById('loginBtn');
    const errDiv = document.getElementById('loginError');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';
    errDiv.style.display = 'none';
    const res = await api.login(username, password);
    if (res.success) {
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
      await this.init();
    } else {
      errDiv.textContent = res.error || 'Login failed';
      errDiv.style.display = 'block';
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
    }
  },

  async loadSchoolSwitcher() {
    const res = await api.getSchools();
    if (res.success && res.data.length) {
      this.state.schools = res.data;
      const sel = document.getElementById('schoolSwitcherSelect');
      sel.innerHTML = '<option value="">All Schools</option>' + res.data.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    }
  },

  async switchSchool(schoolId) {
    const res = await api.switchSchool(schoolId ? parseInt(schoolId) : null);
    if (!res.success) { this.notify(res.error || 'Switch failed', 'error'); return; }
    if (!schoolId) {
      document.getElementById('schoolNameDisplay').textContent = 'All Schools';
      document.getElementById('userRoleDisplay').textContent = 'Super Admin';
      document.getElementById('sidebarLogo').style.display = 'none';
      this.state.school = {};
    } else {
      const sRes = await api.getSchool(parseInt(schoolId));
      if (sRes.success) {
        const s = sRes.data;
        this.state.school = { ...s, school_name: s.name, school_logo: s.school_logo, municipality: s.municipality||'', province: s.province||'', estd: s.estd||'', iemis_id: s.iemis_id||'', phone: s.phone||'', head_teacher: s.head_teacher||'' };
        this.updateSidebarProfile(s);
      }
    }
    await this.navigate(this.currentPage);
  },

  renderSidebar() {
    const nav = document.getElementById('sidebarNav');
    if (!nav) return;
    const role = this.user ? this.user.role : 'school_admin';
    const isSuperAdmin = role === 'super_admin';

    const menu = {
      super_admin: [
        { type: 'link', page: 'dashboard', icon: 'dashboard', label: 'Dashboard', cls: 'super-admin' },
        { type: 'link', page: 'schools', icon: 'school', label: 'School Management', cls: 'super-admin' },
        { type: 'link', page: 'users', icon: 'group', label: 'User Management', cls: 'super-admin' },
        { type: 'separator' },
        { type: 'category', icon: 'assignment_ind', label: 'Student Manage', cls: 'super-admin', items: [
          { page: 'student-list', icon: 'circle', label: 'Student List' },
          { page: 'student-profile', icon: 'circle', label: 'Student Profile' },
          { page: 'student-bulk-import', icon: 'circle', label: 'Bulk Import' },
          { page: 'id-card', icon: 'circle', label: 'ID Card' },
          { page: 'transfer-cert', icon: 'circle', label: 'TC' },
        ]},
        { type: 'category', icon: 'badge', label: 'Teacher & Staff', cls: 'super-admin', items: [
          { page: 'teacher-reg', icon: 'circle', label: 'Teacher Registration' },
          { page: 'staff-reg', icon: 'circle', label: 'Staff Registration' },
          { page: 'teacher-list', icon: 'circle', label: 'Teacher List' },
          { page: 'staff-attendance', icon: 'circle', label: 'Staff Attendance' },
        ]},
        { type: 'category', icon: 'menu_book', label: 'Academic', cls: 'super-admin', items: [
          { page: 'class-manage', icon: 'circle', label: 'Class Manage' },
          { page: 'section-manage', icon: 'circle', label: 'Section Manage' },
          { page: 'subjects', icon: 'circle', label: 'Subject Manage' },
          { page: 'class-routine', icon: 'circle', label: 'Class Routine' },
        ]},
        { type: 'category', icon: 'edit_note', label: 'Exam', cls: 'super-admin', items: [
          { page: 'subjectreg', icon: 'circle', label: 'Sub. Registration' },
          { page: 'admitcard', icon: 'circle', label: 'Admit Card' },
          { page: 'marks', icon: 'circle', label: 'Marks Entry' },
          { page: 'markledger', icon: 'circle', label: 'Mark Ledger' },
          { page: 'gradeledger', icon: 'circle', label: 'Grade Ledger' },
          { page: 'gpledger', icon: 'circle', label: 'GP Ledger' },
          { page: 'results', icon: 'circle', label: 'Results' },
        ]},
        { type: 'category', icon: 'calendar_month', label: 'Attendance', cls: 'super-admin', items: [
          { page: 'student-attendance', icon: 'circle', label: 'Student Attendance' },
          { page: 'teacher-attendance', icon: 'circle', label: 'Teacher Attendance' },
          { page: 'attendance-report', icon: 'circle', label: 'Attendance Report' },
        ]},
        { type: 'category', icon: 'payments', label: 'Bill', cls: 'super-admin', items: [
          { page: 'fee-setup', icon: 'circle', label: 'Fee Setup' },
          { page: 'fee-collection', icon: 'circle', label: 'Fee Collection' },
          { page: 'due-list', icon: 'circle', label: 'Due List' },
          { page: 'receipt-print', icon: 'circle', label: 'Receipt Print' },
          { page: 'income-report', icon: 'circle', label: 'Income Report' },
        ]},
        { type: 'category', icon: 'library_books', label: 'Library', cls: 'super-admin', items: [
          { page: 'book-entry', icon: 'circle', label: 'Book Entry' },
          { page: 'book-issue', icon: 'circle', label: 'Book Issue' },
          { page: 'book-return', icon: 'circle', label: 'Book Return' },
          { page: 'book-list', icon: 'circle', label: 'Book List' },
        ]},
        { type: 'link', page: 'notices', icon: 'campaign', label: 'Notice Board', cls: 'super-admin' },
        { type: 'link', page: 'settings', icon: 'settings', label: 'Settings', cls: 'super-admin' },
      ],
      school_admin: [
        { type: 'link', page: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
        { type: 'link', page: 'students', icon: 'person_add', label: 'Student Registration' },
        { type: 'category', icon: 'assignment_ind', label: 'Student Manage', items: [
          { page: 'student-list', icon: 'circle', label: 'Student List' },
          { page: 'student-profile', icon: 'circle', label: 'Student Profile' },
          { page: 'student-bulk-import', icon: 'circle', label: 'Bulk Import' },
          { page: 'student-promotion', icon: 'circle', label: 'Promotion' },
          { page: 'id-card', icon: 'circle', label: 'ID Card' },
          { page: 'transfer-cert', icon: 'circle', label: 'TC' },
        ]},
        { type: 'category', icon: 'badge', label: 'Teacher & Staff', items: [
          { page: 'teacher-reg', icon: 'circle', label: 'Teacher Registration' },
          { page: 'staff-reg', icon: 'circle', label: 'Staff Registration' },
          { page: 'teacher-list', icon: 'circle', label: 'Teacher List' },
          { page: 'staff-attendance', icon: 'circle', label: 'Staff Attendance' },
        ]},
        { type: 'category', icon: 'menu_book', label: 'Academic', items: [
          { page: 'class-manage', icon: 'circle', label: 'Class Manage' },
          { page: 'section-manage', icon: 'circle', label: 'Section Manage' },
          { page: 'subjects', icon: 'circle', label: 'Subject Manage' },
          { page: 'class-routine', icon: 'circle', label: 'Class Routine' },
        ]},
        { type: 'category', icon: 'edit_note', label: 'Exam', items: [
          { page: 'subjectreg', icon: 'circle', label: 'Sub. Registration' },
          { page: 'admitcard', icon: 'circle', label: 'Admit Card' },
          { page: 'marks', icon: 'circle', label: 'Marks Entry' },
          { page: 'markledger', icon: 'circle', label: 'Mark Ledger' },
          { page: 'gradeledger', icon: 'circle', label: 'Grade Ledger' },
          { page: 'gpledger', icon: 'circle', label: 'GP Ledger' },
          { page: 'results', icon: 'circle', label: 'Results' },
        ]},
        { type: 'category', icon: 'calendar_month', label: 'Attendance', items: [
          { page: 'student-attendance', icon: 'circle', label: 'Student Attendance' },
          { page: 'teacher-attendance', icon: 'circle', label: 'Teacher Attendance' },
          { page: 'attendance-report', icon: 'circle', label: 'Attendance Report' },
        ]},
        { type: 'category', icon: 'payments', label: 'Bill', items: [
          { page: 'fee-setup', icon: 'circle', label: 'Fee Setup' },
          { page: 'fee-collection', icon: 'circle', label: 'Fee Collection' },
          { page: 'due-list', icon: 'circle', label: 'Due List' },
          { page: 'receipt-print', icon: 'circle', label: 'Receipt Print' },
          { page: 'income-report', icon: 'circle', label: 'Income Report' },
        ]},
        { type: 'category', icon: 'library_books', label: 'Library', items: [
          { page: 'book-entry', icon: 'circle', label: 'Book Entry' },
          { page: 'book-issue', icon: 'circle', label: 'Book Issue' },
          { page: 'book-return', icon: 'circle', label: 'Book Return' },
          { page: 'book-list', icon: 'circle', label: 'Book List' },
        ]},
        { type: 'category', icon: 'description', label: 'Certificate', items: [
          { page: 'character-cert', icon: 'circle', label: 'Character Cert' },
          { page: 'bonafide-cert', icon: 'circle', label: 'Bonafide Cert' },
          { page: 'transfer-cert', icon: 'circle', label: 'TC' },
        ]},
        { type: 'category', icon: 'bar_chart', label: 'Reports', items: [
          { page: 'student-report', icon: 'circle', label: 'Student Report' },
          { page: 'attendance-report', icon: 'circle', label: 'Attendance Report' },
          { page: 'exam-report', icon: 'circle', label: 'Exam Report' },
          { page: 'fee-report', icon: 'circle', label: 'Fee Report' },
        ]},
        { type: 'link', page: 'notices', icon: 'campaign', label: 'Notice Board' },
        { type: 'link', page: 'settings', icon: 'settings', label: 'Settings' },
      ],
      teacher: [
        { type: 'link', page: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
        { type: 'category', icon: 'edit_note', label: 'Exam', items: [
          { page: 'marks', icon: 'circle', label: 'Marks Entry' },
          { page: 'results', icon: 'circle', label: 'Results' },
        ]},
        { type: 'category', icon: 'calendar_month', label: 'Attendance', items: [
          { page: 'student-attendance', icon: 'circle', label: 'Student Attendance' },
        ]},
      ],
      accountant: [
        { type: 'link', page: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
        { type: 'category', icon: 'payments', label: 'Bill', items: [
          { page: 'fee-setup', icon: 'circle', label: 'Fee Setup' },
          { page: 'fee-collection', icon: 'circle', label: 'Fee Collection' },
          { page: 'due-list', icon: 'circle', label: 'Due List' },
          { page: 'receipt-print', icon: 'circle', label: 'Receipt Print' },
          { page: 'income-report', icon: 'circle', label: 'Income Report' },
        ]},
      ],
      librarian: [
        { type: 'link', page: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
        { type: 'category', icon: 'library_books', label: 'Library', items: [
          { page: 'book-entry', icon: 'circle', label: 'Book Entry' },
          { page: 'book-issue', icon: 'circle', label: 'Book Issue' },
          { page: 'book-return', icon: 'circle', label: 'Book Return' },
          { page: 'book-list', icon: 'circle', label: 'Book List' },
        ]},
      ],
      staff: [
        { type: 'link', page: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
        { type: 'category', icon: 'calendar_month', label: 'Attendance', items: [
          { page: 'student-attendance', icon: 'circle', label: 'Attendance' },
          { page: 'attendance-report', icon: 'circle', label: 'Report' },
        ]},
      ],
    };
    const items = menu[role] || menu.school_admin;
    let html = '';
    items.forEach(item => {
      if (item.type === 'separator') { html += '<hr style="border-color:rgba(255,255,255,0.08);margin:4px 0;">'; return; }
      if (item.type === 'link') {
        html += `<a href="#" data-page="${item.page}" class="nav-item ${item.cls||''}"><span class="material-symbols-outlined">${item.icon}</span> ${item.label}</a>`;
      } else if (item.type === 'category') {
        html += `<div class="nav-category ${item.cls||''}">
          <div class="nav-category-header" onclick="App.toggleNavCategory(this)">
            <span class="material-symbols-outlined">${item.icon}</span> ${item.label} <span class="material-symbols-outlined nav-arrow">chevron_right</span>
          </div>
          <div class="nav-submenu">`;
        item.items.forEach(sub => {
          html += `<a href="#" data-page="${sub.page}" class="nav-item"><span class="material-symbols-outlined sub-icon">${sub.icon}</span> ${sub.label}</a>`;
        });
        html += `</div></div>`;
      }
    });
    nav.innerHTML = html;
  },

  setupNavigation() {
    document.getElementById('sidebarNav').addEventListener('click', async (e) => {
      const link = e.target.closest('a.nav-item');
      if (!link) return;
      e.preventDefault();
      const page = link.dataset.page;
      if (!page) return;
      document.querySelectorAll('.sidebar-nav a.nav-item').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      const cat = link.closest('.nav-category');
      if (cat) cat.classList.add('open');
      await this.navigate(page);
    });
    document.getElementById('globalSearch')?.addEventListener('input', (e) => {
      if (this.currentPage === 'students') this.renderStudents(e.target.value);
    });
  },

  setupBackup() {
    document.getElementById('btnBackup').addEventListener('click', async () => {
      const res = await api.backup();
      if (res.success) this.notify('Backup created: ' + res.path, 'success');
      else this.notify('Backup failed: ' + res.error, 'error');
    });
  },

  toggleUserMenu() {
    const menu = document.getElementById('userMenuDropdown');
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
  },

  checkUpdate() {
    this.notify('You are using the latest version (v1.0)', 'success');
  },

  showUserProfile() {
    document.getElementById('userMenuDropdown').style.display = 'none';
    const u = this.user || {};
    const roleLabels = { super_admin:'Super Admin', school_admin:'School Admin', teacher:'Teacher', accountant:'Accountant', librarian:'Librarian', staff:'Staff' };
    this.showModal(`
      <h3>User Profile</h3>
      <div style="padding:16px 0;">
        <p><strong>Username:</strong> ${u.username||'N/A'}</p>
        <p><strong>Name:</strong> ${u.full_name||'N/A'}</p>
        <p><strong>Role:</strong> ${roleLabels[u.role]||u.role||'N/A'}</p>
        <p><strong>School:</strong> ${u.school_name || this.state.school.name || 'N/A'}</p>
        <p><strong>Email:</strong> ${u.email||'N/A'}</p>
        <p><strong>Phone:</strong> ${u.phone||'N/A'}</p>
      </div>
      <button class="btn btn-primary" onclick="App.closeModal()">Close</button>
    `);
  },

  showChangePassword() {
    document.getElementById('userMenuDropdown').style.display = 'none';
    const userId = this.user ? this.user.id : null;
    this.showModal(`
      <h3>Change Password</h3>
      <form onsubmit="event.preventDefault(); App.handleChangePassword(${userId})">
        <div class="form-group"><label>Current Password</label><input type="password" id="cpCurrent" class="form-control" required></div>
        <div class="form-group"><label>New Password</label><input type="password" id="cpNew" class="form-control" required minlength="6"></div>
        <div class="form-group"><label>Confirm Password</label><input type="password" id="cpConfirm" class="form-control" required></div>
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button type="submit" class="btn btn-primary">Save</button>
          <button type="button" class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
        </div>
      </form>
    `);
  },

  async handleChangePassword(userId) {
    const current = document.getElementById('cpCurrent').value;
    const newPw = document.getElementById('cpNew').value;
    const confirm = document.getElementById('cpConfirm').value;
    if (newPw !== confirm) { this.notify('Passwords do not match', 'error'); return; }
    const res = await api.changePassword(userId, current, newPw);
    if (res.success) { this.notify('Password changed successfully'); this.closeModal(); }
    else { this.notify(res.error || 'Failed to change password', 'error'); }
  },

  showAboutModal() {
    document.getElementById('userMenuDropdown').style.display = 'none';
    this.navigate('settings');
    setTimeout(() => {
      const aboutTab = document.querySelector('.settings-tab[data-tab="about"]');
      if (aboutTab) aboutTab.click();
    }, 100);
  },

  showUserGuide() {
    document.getElementById('userMenuDropdown').style.display = 'none';
    this.showModal(`
      <style>
        .guide-container { max-height:70vh; overflow-y:auto; padding:0 4px; font-size:13px; }
        .guide-container h4 { font-size:14px; color:var(--primary); margin:16px 0 6px; border-bottom:1px solid var(--border); padding-bottom:4px; }
        .guide-container h5 { font-size:13px; color:var(--text); margin:10px 0 4px; }
        .guide-container p { margin:4px 0; line-height:1.6; color:var(--text); }
        .guide-container ul { margin:4px 0 8px 18px; }
        .guide-container li { margin:3px 0; line-height:1.5; }
        .guide-container .tag { display:inline-block; background:var(--primary-light); color:var(--primary); font-size:10px; padding:1px 7px; border-radius:3px; font-weight:600; margin-right:3px; }
        .guide-container .tag.green { background:#d4edda; color:#155724; }
        .guide-container .tag.orange { background:#fff3cd; color:#856404; }
        .guide-container .tag.blue { background:#cce5ff; color:#004085; }
        .guide-container b { color:var(--text); }
      </style>
      <h3><i class="fas fa-book-open" style="color:var(--primary);"></i> Software User Guide</h3>
      <div class="guide-container">
        <p>यो <b>NEB Result Management System</b> कक्षा ११ र १२ को परीक्षा परिणाम, विद्यार्थी व्यवस्थापन, शुल्क, पुस्तकालय, उपस्थिति, प्रमाणपत्र, र रिपोर्ट व्यवस्थापन गर्ने एउटा पूर्ण सफ्टवेर हो। तल प्रत्येक मेनुको विस्तृत जानकारी दिइएको छ।</p>

        <h4>1. Dashboard (ड्यासबोर्ड)</h4>
        <p>मुख्य पृष्ठमा विद्यालयको सम्पूर्ण जानकारी एकै ठाउँमा हेर्न सकिन्छ:</p>
        <ul>
          <li><b>School Header</b> — विद्यालयको लोगो, नाम, ठेगाना, फोन, IEMIS कोड, र session badge देखिन्छ।</li>
          <li><b>Stats Cards</b> — कुल विद्यार्थी, कक्षा ११/१२, विषयहरू, पास/फेल/पूरकको तथ्यांक।</li>
          <li><b>Quick Actions</b> — मुख्य पृष्ठहरूमा छिटो पुग्न १६ वटा बटनहरू।</li>
          <li><b>Recent Students</b> — हालै थपिएका ६ जना विद्यार्थीको सूची।</li>
          <li><b>Session Info</b> — वर्तमान सत्र, मिति, विद्यार्थी संख्या, परिणामको सारांश।</li>
          <li><b>Top 3 Rank</b> — उत्कृष्ट ३ विद्यार्थीको GPA सहित प्रदर्शन।</li>
          <li><b>Grade Distribution</b> — ग्रेड अनुसार विद्यार्थीको बार चार्ट।</li>
          <li><b>Class Performance</b> — कक्षा ११ र १२ को तुलनात्मक प्रदर्शन तालिका।</li>
          <li><b>Gender & Faculty</b> — लिङ्ग र संकाय अनुसारको विवरण डोनट चार्टसहित।</li>
        </ul>

        <h4>2. Student Registration (विद्यार्थी दर्ता)</h4>
        <p>नयाँ विद्यार्थी दर्ता गर्ने, सम्पादन गर्ने, र हटाउने सुविधा:</p>
        <ul>
          <li><b>फारम भर्ने</b> — नाम, रोल, कक्षा, संकाय, SYM, REG, लिङ्ग, जन्म मिति (BS/AD), बुवा/आमा/अभिभावकको नाम, फोन, ठेगाना, फोटो।</li>
          <li><b>खोज्ने</b> — नाम वा रोल नम्बरले तुरुन्त खोज्न सकिन्छ।</li>
          <li><b>फिल्टर</b> — कक्षा र संकाय अनुसार फिल्टर गर्न सकिन्छ।</li>
          <li><b>बल्क इम्पोर्ट</b> — Excel (.xlsx) बाट धेरै विद्यार्थी एकै पटक थप्न सकिन्छ।</li>
        </ul>

        <h4>3. Student Manage (विद्यार्थी व्यवस्थापन)</h4>
        <ul>
          <li><b>Student List</b> — सबै विद्यार्थीको तालिका, खोज, पेजिनेसन, छानेर मेटाउने।</li>
          <li><b>Student Profile</b> — विद्यार्थीको पूर्ण प्रोफाइल हेर्ने र सम्पादन गर्ने।</li>
          <li><b>Bulk Import</b> — Excel बाट धेरै विद्यार्थी एकै पटक आयात गर्ने।</li>
          <li><b>Student Promotion</b> — कक्षा ११ बाट १२ मा प्रमोशन गर्ने (सामूहिक वा एकल)।</li>
          <li><b>ID Card</b> — विद्यार्थीको ID Card प्रिन्ट गर्ने।</li>
          <li><b>Transfer Certificate (TC)</b> — स्थानान्तरण प्रमाणपत्र जारी गर्ने र प्रिन्ट गर्ने।</li>
        </ul>

        <h4>4. Teacher & Staff Manage (शिक्षक तथा कर्मचारी)</h4>
        <ul>
          <li><b>Teacher Registration</b> — नयाँ शिक्षक दर्ता (नाम, योग्यता, विषय, फोन, ईमेल, लिङ्ग)।</li>
          <li><b>Staff Registration</b> — कर्मचारी दर्ता।</li>
          <li><b>Teacher List</b> — सबै शिक्षकको सूची, खोज, मेटाउने।</li>
          <li><b>Staff Attendance</b> — कर्मचारीको उपस्थिति ट्र्याक गर्ने।</li>
        </ul>

        <h4>5. Academic Manage (शैक्षिक व्यवस्थापन)</h4>
        <ul>
          <li><b>Class Manage</b> — कक्षा व्यवस्थापन (थप्ने/मेटाउने)।</li>
          <li><b>Section Manage</b> — सेक्सन व्यवस्थापन।</li>
          <li><b>Subject Manage</b> — विषयहरू थप्ने/सम्पादन/मेटाउने (कोड, नाम, पूर्णांक, सैद्धान्तिक/प्रयोगात्मक)।</li>
          <li><b>Class Routine</b> — कक्षा रुटिन हेर्ने र व्यवस्थापन गर्ने।</li>
        </ul>

        <h4>6. Exam Manage (परीक्षा व्यवस्थापन)</h4>
        <ul>
          <li><b>Subjects (Exams)</b> — परीक्षाका विषयहरू व्यवस्थापन।</li>
          <li><b>Sub. Registration</b> — विद्यार्थीले लिएका विषयहरू दर्ता गर्ने।</li>
          <li><b>Admit Card</b> — प्रवेश पत्र प्रिन्ट गर्ने।</li>
          <li><b>Marks Entry</b> — प्राप्ताङ्क प्रविष्ट गर्ने (सैद्धान्तिक + प्रयोगात्मक) र GPA स्वतः गणना।</li>
          <li><b>Mark Ledger</b> — सबै विद्यार्थीको अंकको विस्तृत तालिका।</li>
          <li><b>Grade Ledger</b> — ग्रेड तालिका (A+, A, B+, ... NG)।</li>
          <li><b>GP Ledger</b> — ग्रेड पोइन्ट तालिका (4.0, 3.6, 3.2, ... 0.0)।</li>
          <li><b>Results</b> — नतिजा प्रकाशन, रिपोर्ट कार्ड प्रिन्ट, ग्रेडशीट, र्याङ्किङ।</li>
        </ul>

        <h4>7. Attendance Manage (उपस्थिति)</h4>
        <ul>
          <li><b>Student Attendance</b> — विद्यार्थीको दैनिक उपस्थिति ट्र्याक।</li>
          <li><b>Teacher Attendance</b> — शिक्षकको उपस्थिति।</li>
          <li><b>Attendance Report</b> — उपस्थिति रिपोर्ट हेर्ने।</li>
        </ul>

        <h4>8. Bill Manage (शुल्क व्यवस्थापन)</h4>
        <ul>
          <li><b>Fee Setup</b> — शुल्क संरचना सेटअप (विभिन्न कक्षा/संकायको शुल्क निर्धारण)।</li>
          <li><b>Fee Collection</b> — विद्यार्थीबाट शुल्क संकलन गर्ने।</li>
          <li><b>Due List</b> — बकाया शुल्क भएका विद्यार्थीको सूची।</li>
          <li><b>Receipt Print</b> — शुल्क रसिद प्रिन्ट गर्ने।</li>
          <li><b>Income Report</b> — आय रिपोर्ट हेर्ने।</li>
        </ul>

        <h4>9. Library Manage (पुस्तकालय)</h4>
        <ul>
          <li><b>Book Entry</b> — नयाँ पुस्तक थप्ने (नाम, लेखक, ISBN, प्रकाशक, मूल्य, र्याक)।</li>
          <li><b>Book Issue</b> — विद्यार्थीलाई पुस्तक उपलब्ध गराउने।</li>
          <li><b>Book Return</b> — पुस्तक फिर्ता लिने।</li>
          <li><b>Book List</b> — सबै पुस्तकको सूची र खोज।</li>
        </ul>

        <h4>10. Certificate Manage (प्रमाणपत्र)</h4>
        <ul>
          <li><b>Character Certificate</b> — चरित्र प्रमाणपत्र जारी गर्ने (मिति, आचरण, टिप्पणी सहित प्रिन्ट)।</li>
          <li><b>Bonafide Certificate</b> — बोनाफाइड प्रमाणपत्र (उद्देश्य, अध्ययन वर्ष सहित)।</li>
          <li><b>Transfer Certificate</b> — स्थानान्तरण प्रमाणपत्र (छाडेको मिति, कारण, आचरण सहित)।</li>
          <li>सबै प्रमाणपत्र <b>A4 साइज</b> मा प्रिन्ट हुन्छन् र विद्यालयको लोगो, नाम, ठेगाना स्वतः देखिन्छ।</li>
        </ul>

        <h4>11. Reports (रिपोर्ट)</h4>
        <ul>
          <li><b>Student Report</b> — विद्यार्थी सम्बन्धी रिपोर्ट।</li>
          <li><b>Attendance Report</b> — उपस्थिति रिपोर्ट।</li>
          <li><b>Exam Report</b> — परीक्षा परिणाम रिपोर्ट।</li>
          <li><b>Fee Report</b> — शुल्क रिपोर्ट।</li>
        </ul>

        <h4>12. Settings (सेटिङ्ग्स)</h4>
        <ul>
          <li><b>School Info</b> — विद्यालयको नाम, ठेगाना, फोन, IEMIS कोड, लोगो, प्रदेश, estd. etc. सेट गर्ने।</li>
          <li><b>Backup / Restore</b> — डाटाबेसको ब्याकअप र पुनर्स्थापना।</li>
          <li><b>Session Manage</b> — शैक्षिक सत्र थप्ने/सम्पादन।</li>
          <li><b>About</b> — सफ्टवेरको बारेमा जानकारी।</li>
        </ul>

        <h4>13. Top Bar (माथिल्लो पट्टी)</h4>
        <ul>
          <li><b>Sidebar Toggle (☰)</b> — साइडबार लुकाउने/देखाउने।</li>
          <li><b>Search</b> — विद्यार्थी खोज्ने (Student List पृष्ठमा मात्र)।</li>
          <li><b>User Menu</b> — प्रोफाइल, पासवर्ड परिवर्तन, ब्याकअप, About, User Guide, लगआउट।</li>
        </ul>

        <h4>14. Keyboard & General Tips</h4>
        <ul>
          <li>सबै तालिकामा <b>पेजिनेसन</b> (page navigation) छ — तल्लो भागबाट पेज छान्नुहोस्।</li>
          <li>धेरैजसो पृष्ठमा <b>फिल्टर र खोज</b> सुविधा छ।</li>
          <li>प्रमाणपत्र र रिपोर्टहरू <b>A4 पेपर</b> मा प्रिन्ट हुन डिजाइन गरिएको छ।</li>
          <li>डाटा हराउनबाट बच्न <b>नियमित ब्याकअप</b> गर्नुहोस् (User Menu > Backup Data)।</li>
          <li>कुनै पनि पृष्ठमा <b>Quick Actions</b> बाट ड्यासबोर्डमै छिटो पुग्न सकिन्छ।</li>
        </ul>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="App.closeModal()">Close</button>
      </div>`);
  },

  async logout() {
    if (!confirm('Are you sure you want to logout?')) return;
    document.getElementById('userMenuDropdown').style.display = 'none';
    await api.logout();
    this.user = null;
    document.getElementById('app').style.display = 'none';
    document.getElementById('loginPage').style.display = 'flex';
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginError').style.display = 'none';
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) { loginBtn.disabled = false; loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login'; }
    this.notify('Logged out successfully');
  },

  async navigate(page) {
    this.currentPage = page;
    const titles = {
      dashboard:'Dashboard',
      schools:'School Management', users:'User Management',
      students:'Student Registration', 'student-list':'Student List', 'student-profile':'Student Profile',
      'student-promotion':'Student Promotion', 'transfer-cert':'Transfer Certificate (TC)', 'id-card':'ID Card',
      'teacher-reg':'Teacher Registration', 'staff-reg':'Staff Registration', 'teacher-list':'Teacher List',
      'staff-attendance':'Staff Attendance',
      'class-manage':'Class Manage', 'section-manage':'Section Manage',
      subjects:'Subject Manage', 'class-routine':'Class Routine',
      'exam-subjects':'Subjects', subjectreg:'Sub. Registration', admitcard:'Admit Card',
      marks:'Marks Entry', markledger:'Mark Ledger', gradeledger:'Grade Ledger',
      gpledger:'GP Ledger', results:'Results',
      'student-attendance':'Student Attendance', 'teacher-attendance':'Teacher Attendance',
      'attendance-report':'Attendance Report',
      'fee-setup':'Fee Setup', 'fee-collection':'Fee Collection', 'due-list':'Due List',
      'receipt-print':'Receipt Print', 'income-report':'Income Report',
      'book-entry':'Book Entry', 'book-issue':'Book Issue', 'book-return':'Book Return',
      'book-list':'Book List',
      'character-cert':'Character Certificate', 'bonafide-cert':'Bonafide Certificate',
      'student-report':'Student Report', 'exam-report':'Exam Report', 'fee-report':'Fee Report',
      notices:'Notice Board',
      settings:'Settings'
    };
    document.getElementById('pageTitle').textContent = titles[page] || page;
    const search = document.getElementById('globalSearch');
    search.style.display = (page === 'students') ? 'block' : 'none';
    const container = document.getElementById('pageContent');
    container.innerHTML = '<div class="loading">Loading...</div>';
    switch (page) {
      case 'dashboard': await this.renderDashboard(); break;
      case 'schools': await this.renderSchoolsPage(); break;
      case 'users': await this.renderUsersPage(); break;
      case 'students': await this.renderStudents(); break;
      case 'student-list': await this.renderStudentList(); break;
      case 'student-profile': await this.renderStudentProfile(); break;
      case 'student-promotion': await this.renderStudentPromotion(); break;
      case 'subjects': await this.renderSubjects(); break;
      case 'subjectreg': await this.renderSubjectRegistration(); break;
      case 'admitcard': await this.renderAdmitCard(); break;
      case 'id-card': await this.renderIDCard(); break;
      case 'transfer-cert': await this.renderTransferCertificate(); break;
      case 'teacher-reg': await this.renderTeacherRegistration(); break;
      case 'teacher-list': await this.renderTeacherList(); break;
      case 'staff-reg': await this.renderStaffRegistration(); break;
      case 'staff-attendance': await this.renderStaffAttendance(); break;
      case 'class-manage': await this.renderClassManage(); break;
      case 'section-manage': await this.renderSectionManage(); break;
      case 'class-routine': await this.renderClassRoutine(); break;
      case 'student-attendance': await this.renderStudentAttendance(); break;
      case 'teacher-attendance': await this.renderTeacherAttendance(); break;
      case 'attendance-report': await this.renderAttendanceReport(); break;
      case 'student-report': await this.renderStudentReport(); break;
      case 'exam-report': await this.renderExamReport(); break;
      case 'fee-report': await this.renderFeeReport(); break;
      case 'fee-setup': await this.renderFeeSetup(); break;
      case 'fee-collection': await this.renderFeeCollection(); break;
      case 'due-list': await this.renderDueList(); break;
      case 'receipt-print': await this.renderReceiptPrint(); break;
      case 'income-report': await this.renderIncomeReport(); break;
      case 'book-entry': await this.renderBookEntry(); break;
      case 'book-issue': await this.renderBookIssue(); break;
      case 'book-return': await this.renderBookReturn(); break;
      case 'book-list': await this.renderBookList(); break;
      case 'marks': await this.renderMarksPage(); break;
      case 'results': await this.renderResultsPage(); break;
      case 'markledger': await this.renderLedger('marks'); break;
      case 'gradeledger': await this.renderLedger('grades'); break;
      case 'gpledger': await this.renderLedger('gradepoints'); break;
      case 'notices': await this.renderNoticesPage(); break;
      case 'settings': await this.renderSettings(); break;
      case 'character-cert': await this.renderCharacterCertificate(); break;
      case 'bonafide-cert': await this.renderBonafideCertificate(); break;
      case 'student-bulk-import':
        await this.renderStudents();
        break;
      default: await this.renderPlaceholder(page, titles[page] || page); break;
    }
  },

  showModal(html) {
    document.getElementById('modalContent').innerHTML = html;
    document.getElementById('modalOverlay').style.display = 'flex';
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.closeModal();
    });
  },

  closeModal() {
    document.getElementById('modalOverlay').style.display = 'none';
  },

  notify(message, type = 'success') {
    const div = document.createElement('div');
    div.className = `notification ${type}`;
    div.textContent = message;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3500);
  },

  // ---- SCHOOL MANAGEMENT ----
  async renderSchoolsPage() {
    const res = await api.getSchools();
    const schools = res.success ? res.data : [];
    const container = document.getElementById('pageContent');
    container.innerHTML = `
      <div class="schools-page">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h3 style="font-size:16px;">School Management</h3>
        <button class="btn btn-primary" onclick="App.showAddSchoolModal()"><i class="fas fa-plus"></i> Add School</button>
      </div>
      <div class="table-container">
        <table>
          <thead><tr><th>#</th><th>School Name</th><th>Municipality</th><th>Province</th><th>IEMIS</th><th>Phone</th><th>Head Teacher</th><th>Students</th><th>Approval</th><th>Actions</th></tr></thead>
          <tbody>${schools.length ? schools.map((s, i) => {
            const statusLabel = s.is_approved === 1 ? 'Approved' : s.is_approved === -1 ? 'Rejected' : 'Pending';
            const statusColor = s.is_approved === 1 ? '#d4edda' : s.is_approved === -1 ? '#f8d7da' : '#fff3cd';
            const statusTextColor = s.is_approved === 1 ? '#155724' : s.is_approved === -1 ? '#721c24' : '#856404';
            return `<tr>
              <td>${i+1}</td>
              <td><strong>${s.name}</strong></td>
              <td>${s.municipality||'-'}</td>
              <td>${s.province||'-'}</td>
              <td>${s.iemis_id||'-'}</td>
              <td>${s.phone||'-'}</td>
              <td>${s.head_teacher||'-'}</td>
              <td>${s.student_count||0}</td>
              <td><span class="grade-tag" style="background:${statusColor};color:${statusTextColor};">${statusLabel}</span></td>
              <td style="white-space:nowrap;">
                ${s.is_approved === 0 ? `<button class="btn btn-sm btn-success" onclick="App.approveSchool(${s.id})" title="Approve"><i class="fas fa-check"></i></button> <button class="btn btn-sm btn-danger" onclick="App.rejectSchool(${s.id})" title="Reject"><i class="fas fa-times"></i></button> ` : ''}
                <button class="btn btn-sm btn-primary" onclick="App.showEditSchoolModal(${s.id})"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-danger" onclick="App.deleteSchool(${s.id})"><i class="fas fa-trash"></i></button>
              </td>
            </tr>`;
          }).join('') : '<tr><td colspan="10" class="text-center text-muted">No schools found</td></tr>'}</tbody>
        </table>
      </div>
      </div>`;
  },

  async approveSchool(id) {
    if (!confirm('Approve this school?')) return;
    const res = await api.approveSchool(id);
    if (res.success) { this.notify('School approved'); this.renderSchoolsPage(); }
    else { this.notify(res.error || 'Failed', 'error'); }
  },

  async rejectSchool(id) {
    if (!confirm('Reject this school?')) return;
    const res = await api.rejectSchool(id);
    if (res.success) { this.notify('School rejected'); this.renderSchoolsPage(); }
    else { this.notify(res.error || 'Failed', 'error'); }
  },

  async showAddSchoolModal() {
    this.showModal(`
      <h3><i class="fas fa-plus-circle"></i> Add School</h3>
      <form id="schoolForm" onsubmit="event.preventDefault(); App.saveSchool()">
        <div class="form-group"><label>School Name *</label><input id="sf_name" class="form-control" required></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="form-group"><label>Municipality</label><input id="sf_municipality" class="form-control"></div>
          <div class="form-group"><label>District</label><input id="sf_district" class="form-control"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="form-group"><label>Province</label><input id="sf_province" class="form-control"></div>
          <div class="form-group"><label>Established (BS)</label><input id="sf_estd" class="form-control"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="form-group"><label>IEMIS ID</label><input id="sf_iemis" class="form-control"></div>
          <div class="form-group"><label>Phone</label><input id="sf_phone" class="form-control"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="form-group"><label>Email</label><input id="sf_email" class="form-control" type="email"></div>
          <div class="form-group"><label>Head Teacher</label><input id="sf_head" class="form-control"></div>
        </div>
        <div class="modal-actions">
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save</button>
          <button type="button" class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
        </div>
      </form>`);
  },

  async showEditSchoolModal(id) {
    const res = await api.getSchool(id);
    if (!res.success) { this.notify('School not found', 'error'); return; }
    const s = res.data;
    this.showModal(`
      <h3><i class="fas fa-edit"></i> Edit School</h3>
      <form id="schoolForm" onsubmit="event.preventDefault(); App.saveSchool(${id})">
        <div class="form-group"><label>School Name *</label><input id="sf_name" class="form-control" value="${this.escHtml(s.name)}" required></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="form-group"><label>Municipality</label><input id="sf_municipality" class="form-control" value="${this.escHtml(s.municipality||'')}"></div>
          <div class="form-group"><label>District</label><input id="sf_district" class="form-control" value="${this.escHtml(s.district||'')}"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="form-group"><label>Province</label><input id="sf_province" class="form-control" value="${this.escHtml(s.province||'')}"></div>
          <div class="form-group"><label>Established (BS)</label><input id="sf_estd" class="form-control" value="${this.escHtml(s.estd||'')}"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="form-group"><label>IEMIS ID</label><input id="sf_iemis" class="form-control" value="${this.escHtml(s.iemis_id||'')}"></div>
          <div class="form-group"><label>Phone</label><input id="sf_phone" class="form-control" value="${this.escHtml(s.phone||'')}"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="form-group"><label>Email</label><input id="sf_email" class="form-control" type="email" value="${this.escHtml(s.email||'')}"></div>
          <div class="form-group"><label>Head Teacher</label><input id="sf_head" class="form-control" value="${this.escHtml(s.head_teacher||'')}"></div>
        </div>
        <div class="form-group"><label><input type="checkbox" id="sf_active" ${s.is_active?'checked':''}> Active</label></div>
        <div class="modal-actions">
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Update</button>
          <button type="button" class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
        </div>
      </form>`);
  },

  async saveSchool(id) {
    const data = {
      name: document.getElementById('sf_name').value.trim(),
      municipality: document.getElementById('sf_municipality').value.trim(),
      district: document.getElementById('sf_district').value.trim(),
      province: document.getElementById('sf_province').value.trim(),
      estd: document.getElementById('sf_estd').value.trim(),
      iemis_id: document.getElementById('sf_iemis').value.trim(),
      phone: document.getElementById('sf_phone').value.trim(),
      email: document.getElementById('sf_email').value.trim(),
      head_teacher: document.getElementById('sf_head').value.trim(),
    };
    if (document.getElementById('sf_active')) data.is_active = document.getElementById('sf_active').checked ? 1 : 0;
    if (!data.name) { this.notify('School name is required', 'error'); return; }
    const res = id ? await api.updateSchool(id, data) : await api.addSchool(data);
    if (res.success) { this.notify(id ? 'School updated' : 'School added'); this.closeModal(); this.renderSchoolsPage(); }
    else { this.notify(res.error || 'Failed to save school', 'error'); }
  },

  async deleteSchool(id) {
    if (!confirm('Delete this school and all its data?')) return;
    const res = await api.deleteSchool(id);
    if (res.success) { this.notify('School deleted'); this.renderSchoolsPage(); }
    else { this.notify(res.error || 'Failed to delete', 'error'); }
  },

  // ---- USER MANAGEMENT ----
  async renderUsersPage() {
    const [usersRes, schoolsRes] = await Promise.all([api.getUsers(), api.getSchools()]);
    const users = usersRes.success ? usersRes.data : [];
    const schools = schoolsRes.success ? schoolsRes.data : [];
    const schoolMap = {};
    schools.forEach(s => schoolMap[s.id] = s.name);
    const roleLabels = { super_admin:'Super Admin', school_admin:'School Admin', teacher:'Teacher', accountant:'Accountant', librarian:'Librarian', staff:'Staff' };
    const container = document.getElementById('pageContent');
    container.innerHTML = `
      <div class="users-page">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h3 style="font-size:16px;">User Management</h3>
        <button class="btn btn-primary" onclick="App.showAddUserModal()"><i class="fas fa-plus"></i> Add User</button>
      </div>
      <div class="table-container">
        <table>
          <thead><tr><th>#</th><th>Username</th><th>Full Name</th><th>Role</th><th>School</th><th>Email</th><th>Phone</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>${users.length ? users.map((u, i) => `
            <tr>
              <td>${i+1}</td>
              <td><strong>${u.username}</strong></td>
              <td>${u.full_name||'-'}</td>
              <td><span class="grade-tag">${roleLabels[u.role]||u.role}</span></td>
              <td>${schoolMap[u.school_id]||'All Schools'}</td>
              <td>${u.email||'-'}</td>
              <td>${u.phone||'-'}</td>
              <td><span class="grade-tag" style="background:${u.is_active?'#d4edda':'#f8d7da'};color:${u.is_active?'#155724':'#721c24'};">${u.is_active ? 'Active' : 'Inactive'}</span></td>
              <td>
                <button class="btn btn-sm btn-primary" onclick="App.showEditUserModal(${u.id})"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-danger" onclick="App.deleteUser(${u.id})" ${u.id===this.user.id?'disabled':''}><i class="fas fa-trash"></i></button>
              </td>
            </tr>`).join('') : '<tr><td colspan="9" class="text-center text-muted">No users found</td></tr>'}</tbody>
        </table>
      </div>
      </div>`;
  },

  async showAddUserModal() {
    const schoolsRes = await api.getSchools();
    const schools = schoolsRes.success ? schoolsRes.data : [];
    this.showModal(`
      <h3><i class="fas fa-user-plus"></i> Add User</h3>
      <form id="userForm" onsubmit="event.preventDefault(); App.saveUser()">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="form-group"><label>Username *</label><input id="uf_username" class="form-control" required></div>
          <div class="form-group"><label>Password *</label><input id="uf_password" class="form-control" type="password" required minlength="4"></div>
        </div>
        <div class="form-group"><label>Full Name</label><input id="uf_fullname" class="form-control"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="form-group"><label>Role</label><select id="uf_role" class="form-control">
            <option value="school_admin">School Admin</option>
            <option value="teacher">Teacher</option>
            <option value="accountant">Accountant</option>
            <option value="librarian">Librarian</option>
            <option value="staff">Staff</option>
          </select></div>
          <div class="form-group"><label>School</label><select id="uf_school" class="form-control">
            ${this.user && this.user.role==='super_admin' ? schools.map(s => `<option value="${s.id}">${s.name}</option>`).join('') : `<option value="${this.user.school_id}">${this.state.school.name||'My School'}</option>`}
          </select></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="form-group"><label>Email</label><input id="uf_email" class="form-control" type="email"></div>
          <div class="form-group"><label>Phone</label><input id="uf_phone" class="form-control"></div>
        </div>
        <div class="modal-actions">
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save</button>
          <button type="button" class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
        </div>
      </form>`);
  },

  async showEditUserModal(id) {
    const [usersRes, schoolsRes] = await Promise.all([api.getUsers(), api.getSchools()]);
    const users = usersRes.success ? usersRes.data : [];
    const schools = schoolsRes.success ? schoolsRes.data : [];
    const u = users.find(x => x.id === id);
    if (!u) { this.notify('User not found', 'error'); return; }
    this.showModal(`
      <h3><i class="fas fa-user-edit"></i> Edit User</h3>
      <form id="userForm" onsubmit="event.preventDefault(); App.saveUser(${id})">
        <div class="form-group"><label>Username</label><input class="form-control" value="${this.escHtml(u.username)}" disabled></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="form-group"><label>Full Name</label><input id="uf_fullname" class="form-control" value="${this.escHtml(u.full_name||'')}"></div>
          <div class="form-group"><label>New Password (leave blank to keep)</label><input id="uf_password" class="form-control" type="password"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="form-group"><label>Role</label><select id="uf_role" class="form-control">
            ${['super_admin','school_admin','teacher','accountant','librarian','staff'].map(r => `<option value="${r}" ${u.role===r?'selected':''}>${r.replace('_',' ').replace(/\b\w/g,l=>l.toUpperCase())}</option>`).join('')}
          </select></div>
          <div class="form-group"><label>School</label><select id="uf_school" class="form-control">
            <option value="">All Schools</option>
            ${schools.map(s => `<option value="${s.id}" ${u.school_id==s.id?'selected':''}>${s.name}</option>`).join('')}
          </select></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="form-group"><label>Email</label><input id="uf_email" class="form-control" value="${this.escHtml(u.email||'')}"></div>
          <div class="form-group"><label>Phone</label><input id="uf_phone" class="form-control" value="${this.escHtml(u.phone||'')}"></div>
        </div>
        <div class="form-group"><label><input type="checkbox" id="uf_active" ${u.is_active?'checked':''}> Active</label></div>
        <div class="modal-actions">
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Update</button>
          <button type="button" class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
        </div>
      </form>`);
  },

  async saveUser(id) {
    const data = {
      full_name: document.getElementById('uf_fullname').value.trim(),
      role: document.getElementById('uf_role').value,
      school_id: parseInt(document.getElementById('uf_school').value) || null,
      email: document.getElementById('uf_email').value.trim(),
      phone: document.getElementById('uf_phone').value.trim(),
    };
    const pwEl = document.getElementById('uf_password');
    if (!id && !pwEl.value) { this.notify('Password is required', 'error'); return; }
    if (pwEl.value) data.password = pwEl.value;
    if (document.getElementById('uf_username')) data.username = document.getElementById('uf_username').value.trim();
    if (document.getElementById('uf_active')) data.is_active = document.getElementById('uf_active').checked ? 1 : 0;
    if (!data.role) { this.notify('Role is required', 'error'); return; }
    const res = id ? await api.updateUser(id, data) : await api.addUser(data);
    if (res.success) { this.notify(id ? 'User updated' : 'User added'); this.closeModal(); this.renderUsersPage(); }
    else { this.notify(res.error || 'Failed to save user', 'error'); }
  },

  async deleteUser(id) {
    if (!confirm('Delete this user?')) return;
    const res = await api.deleteUser(id);
    if (res.success) { this.notify('User deleted'); this.renderUsersPage(); }
    else { this.notify(res.error || 'Failed to delete', 'error'); }
  },

  escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  },

  // ---- DASHBOARD ----
  async renderDashboard() {
    const [sRes, subRes, rRes, studRes, teaRes, attRes, notRes] = await Promise.all([
      api.getStudents({}), api.getSubjects({}), api.getResults({}),
      api.getStudents({ session: this.state.session }),
      api.getTeachers({}), api.getAttendance({}),
      api.getNotices()
    ]);
    const students = studRes.success ? studRes.data : [];
    const allStudents = sRes.success ? sRes.data : [];
    const subjects = subRes.success ? subRes.data : [];
    const allResults = rRes.success ? rRes.data : [];
    const results = allResults.filter(r => r.session === this.state.session);
    const passed = results.filter(r => r.status === 'Pass').length;
    const failed = results.filter(r => r.status === 'Fail').length;
    const supp = results.filter(r => r.status === 'Supplementary').length;
    const notices = notRes.success ? notRes.data.slice(0, 5) : [];
    const recentStudents = allStudents.slice(-6).reverse();
    const s = this.state.school;
    const logoHtml = s.school_logo ? `<img src="${s.school_logo}" style="height:50px;width:50px;object-fit:cover;border-radius:50%;border:3px solid var(--primary);">` : '';
    const teachers = teaRes.success ? teaRes.data : [];
    const attendances = attRes.success ? attRes.data : [];

    const top3 = results.filter(r => r.rank >= 1 && r.rank <= 3).sort((a, b) => a.rank - b.rank);
    const grades = ['A+','A','B+','B','C+','C','D','E','NG'];
    const gradeCount = {};
    grades.forEach(g => gradeCount[g] = 0);
    results.forEach(r => { const g = r.grade || 'NG'; if (gradeCount[g] !== undefined) gradeCount[g]++; });
    const maxGrade = Math.max(...Object.values(gradeCount), 1);
    const male = students.filter(st => st.gender === 'Male').length;
    const female = students.filter(st => st.gender === 'Female').length;
    const totalGendered = male + female || 1;
    const faculties = { 'Common': 0, 'General': 0, 'Technical': 0 };
    students.forEach(st => { if (st.faculty) faculties[st.faculty] = (faculties[st.faculty] || 0) + 1; });
    const avgGpa = (arr) => arr.length ? (arr.reduce((sum, r) => sum + parseFloat(r.gpa||0), 0) / arr.length).toFixed(2) : '—';
    const gradeColors = {'A+':'#059669','A':'#10b981','B+':'#34d399','B':'#facc15','C+':'#f59e0b','C':'#f97316','D':'#ef4444','E':'#dc2626','NG':'#6b7280'};
    const genderPct = (n) => (n / totalGendered * 100).toFixed(1);
    const today = new Date();

    const classes = {};
    students.forEach(st => { classes[st.class] = (classes[st.class] || 0) + 1; });
    const classKeys = Object.keys(classes).sort((a,b) => {
      if (a === 'ECD') return -1; if (b === 'ECD') return 1;
      return parseInt(a) - parseInt(b);
    });
    const maxClass = Math.max(...Object.values(classes), 1);
    const subjectsByClass = {};
    subjects.forEach(sub => { const c = sub.class || 'N/A'; subjectsByClass[c] = (subjectsByClass[c] || 0) + 1; });
    const subjectClassKeys = Object.keys(subjectsByClass).sort((a,b) => {
      if (a === 'ECD') return -1; if (b === 'ECD') return 1;
      if (a === 'N/A') return 1; if (b === 'N/A') return -1;
      return parseInt(a) - parseInt(b);
    });
    const maxSubjClass = Math.max(...Object.values(subjectsByClass), 1);
    const studentsWithGender = students.filter(st => st.gender);
    const maleByClass = {}, femaleByClass = {};
    studentsWithGender.forEach(st => {
      const c = st.class || 'N/A';
      if (st.gender === 'Male') maleByClass[c] = (maleByClass[c] || 0) + 1;
      else femaleByClass[c] = (femaleByClass[c] || 0) + 1;
    });

    document.getElementById('pageContent').innerHTML = `
      <style>
        .dash-school-header { background:linear-gradient(135deg,#1e3a5f 0%,#1a56db 100%); border-radius:10px; padding:16px 22px; margin-bottom:12px; display:flex; align-items:center; gap:16px; color:#fff; box-shadow:0 4px 15px rgba(26,86,219,0.3); }
        .dash-school-header .sch-info h2 { font-size:17px; font-weight:700; }
        .dash-school-header .sch-info p { font-size:11px; opacity:0.85; margin-top:2px; }
        .dash-school-header .sch-badge { margin-left:auto; background:rgba(255,255,255,0.15); padding:6px 14px; border-radius:20px; font-size:11px; border:1px solid rgba(255,255,255,0.2); text-align:center; }
        .dash-school-header .sch-badge .b-label { opacity:0.7; font-size:9px; }
        .dash-school-header .sch-badge .b-val { font-weight:700; font-size:13px; }
        .stat-card { position:relative; overflow:hidden; }
        .stat-card .stat-icon { position:absolute; right:12px; top:10px; font-size:28px; opacity:0.12; }
        .stat-card .value { display:flex; align-items:center; gap:4px; }
        .dash-cards-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:10px; margin-bottom:10px; }
        .dash-card { background:var(--card); border-radius:var(--radius); padding:14px 16px; box-shadow:var(--shadow); }
        .dash-card h3 { font-size:13px; margin-bottom:8px; border-bottom:2px solid var(--primary); padding-bottom:5px; display:flex; align-items:center; gap:6px; }
        .action-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:5px; }
        .action-grid .btn { justify-content:center; padding:6px 6px; font-size:11px; border-radius:6px; }
        .student-mini { display:flex; align-items:center; gap:8px; padding:5px 0; border-bottom:1px solid var(--border); font-size:12px; }
        .student-mini:last-child { border-bottom:none; }
        .student-mini .s-avatar { width:28px; height:28px; border-radius:50%; background:var(--primary-light); color:var(--primary); display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; flex-shrink:0; }
        .student-mini .s-info { flex:1; }
        .student-mini .s-info .s-name { font-weight:600; }
        .student-mini .s-info .s-detail { font-size:10px; color:var(--text-muted); }
        .info-strip { display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:12px; }
        .info-strip .is-item { padding:6px 8px; background:var(--bg); border-radius:6px; }
        .info-strip .is-item .is-lbl { font-size:10px; color:var(--text-muted); }
        .info-strip .is-item .is-val { font-weight:600; }
        .gender-donut { display:flex; align-items:center; gap:16px; padding:6px 0; }
        .gender-donut .donut { width:100px; height:100px; border-radius:50%; position:relative; flex-shrink:0; }
        .gender-donut .donut-center { position:absolute; inset:18px; border-radius:50%; background:var(--card); display:flex; flex-direction:column; align-items:center; justify-content:center; font-size:18px; font-weight:700; }
        .gender-donut .donut-center small { font-size:9px; font-weight:400; color:var(--text-muted); }
        .gender-legend { flex:1; }
        .gender-legend .gl-item { display:flex; align-items:center; gap:6px; padding:3px 0; font-size:12px; }
        .gender-legend .gl-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
        .gender-legend .gl-count { margin-left:auto; font-weight:600; }
        .cmp-bar { display:flex; align-items:center; gap:8px; padding:2px 0; }
        .cmp-bar .cmp-lbl { width:90px; font-size:11px; flex-shrink:0; color:var(--text-muted); }
        .cmp-bar .cmp-track { flex:1; height:8px; background:#f3f4f6; border-radius:4px; overflow:hidden; display:flex; gap:2px; }
        .cmp-bar .cmp-fill { height:100%; border-radius:4px; }
        .cmp-bar .cmp-val { width:40px; font-size:11px; font-weight:600; text-align:right; }
        .report-table { width:100%; border-collapse:collapse; font-size:12px; }
        .report-table th { background:var(--primary-light); color:var(--primary); font-weight:600; text-align:left; padding:5px 8px; border-bottom:2px solid var(--primary); font-size:11px; }
        .report-table td { padding:4px 8px; border-bottom:1px solid var(--border); }
        .rank-list { display:flex; flex-direction:column; gap:6px; }
        .rank-item { display:flex; align-items:center; gap:10px; padding:8px 10px; border-radius:6px; background:#f8fafc; border:1px solid var(--border); }
        .rank-item .rank-num { width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:12px; color:#fff; flex-shrink:0; }
        .rank-item .rank-1 { background:linear-gradient(135deg,#f59e0b,#d97706); }
        .rank-item .rank-2 { background:linear-gradient(135deg,#9ca3af,#6b7280); }
        .rank-item .rank-3 { background:linear-gradient(135deg,#d97706,#92400e); }
        .rank-item .rank-info { flex:1; min-width:0; }
        .rank-item .rank-info .name { font-weight:600; font-size:13px; overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
        .rank-item .rank-info .detail { font-size:11px; color:var(--text-muted); }
        .rank-item .rank-gpa { text-align:right; }
        .rank-item .rank-gpa .gpa { font-weight:700; font-size:15px; color:var(--primary); }
        .rank-item .rank-gpa .grade-label { font-size:10px; color:var(--text-muted); }
        .dist-bar { display:flex; align-items:center; gap:6px; padding:3px 0; }
        .dist-bar .dist-lbl { width:30px; font-size:12px; font-weight:600; text-align:right; }
        .dist-bar .dist-track { flex:1; height:10px; background:#f3f4f6; border-radius:5px; overflow:hidden; }
        .dist-bar .dist-fill { height:100%; border-radius:5px; }
        .dist-bar .dist-count { width:30px; font-size:12px; color:var(--text-muted); text-align:left; }
        .cls-bar { display:flex; align-items:center; gap:6px; padding:2px 0; font-size:11px; }
        .cls-bar .cl-lbl { width:36px; font-weight:600; flex-shrink:0; text-align:right; }
        .cls-bar .cl-track { flex:1; height:14px; background:#f3f4f6; border-radius:7px; overflow:hidden; }
        .cls-bar .cl-fill { height:100%; border-radius:7px; background:linear-gradient(90deg,var(--primary),#6366f1); transition:width 0.5s; }
        .cls-bar .cl-count { width:28px; text-align:right; color:var(--text-muted); font-weight:600; }
        .dash-stat-row { display:flex; gap:10px; flex-wrap:wrap; }
        .dash-stat-row .ds-item { flex:1; min-width:80px; text-align:center; padding:8px; background:var(--bg); border-radius:8px; }
        .dash-stat-row .ds-item .ds-num { font-size:20px; font-weight:700; color:var(--primary); }
        .dash-stat-row .ds-item .ds-lbl { font-size:10px; color:var(--text-muted); }
      </style>
      <div class="dash-school-header">
        ${logoHtml}
        <div class="sch-info">
          <h2>${s.school_name || 'School Name'}</h2>
          <p>${[s.municipality, s.district, s.province].filter(Boolean).join(', ')}${s.estd ? ' | Estd: '+s.estd : ''}${s.iemis_id ? ' | IEMIS: '+s.iemis_id : ''}${s.phone ? ' | Phone: '+s.phone : ''}</p>
        </div>
        <div class="sch-badge">
          <div class="b-label">Session</div>
          <div class="b-val">${this.state.session}</div>
        </div>
      </div>
      <div class="stats-grid">
        <div class="stat-card"><i class="fas fa-users stat-icon"></i><div class="label">Total Students</div><div class="value">${students.length}</div></div>
        <div class="stat-card green"><i class="fas fa-chalkboard-user stat-icon"></i><div class="label">Teachers</div><div class="value">${teachers.length}</div></div>
        <div class="stat-card yellow"><i class="fas fa-clock stat-icon"></i><div class="label">Attendance Today</div><div class="value">${attendances.filter(a => a.date === today.toISOString().split('T')[0]).length}</div></div>
        <div class="stat-card"><i class="fas fa-book stat-icon"></i><div class="label">Subjects</div><div class="value">${subjects.length}</div></div>
        <div class="stat-card green"><i class="fas fa-check-circle stat-icon"></i><div class="label">Passed</div><div class="value">${passed}</div></div>
        ${results.length ? `
        <div class="stat-card red"><i class="fas fa-chart-line stat-icon"></i><div class="label">Pass Rate</div><div class="value">${(passed/results.length*100).toFixed(1)}%</div></div>
        ` : `
        <div class="stat-card red"><i class="fas fa-hourglass-half stat-icon"></i><div class="label">Results Published</div><div class="value">${results.length}</div></div>
        `}
      </div>
      <div class="dash-cards-grid">
        <div class="dash-card">
          <h3><i class="fas fa-bolt" style="color:var(--warning);"></i> Quick Actions</h3>
          <div class="action-grid">
            <button class="btn btn-primary w-full" onclick="App.navigate('students')"><i class="fas fa-user-plus"></i> Add Student</button>
            <button class="btn btn-info w-full" onclick="App.navigate('student-list')"><i class="fas fa-list"></i> Student List</button>
            <button class="btn btn-secondary w-full" onclick="App.navigate('subjects')"><i class="fas fa-book"></i> Subjects</button>
            <button class="btn btn-warning w-full" onclick="App.navigate('subjectreg')"><i class="fas fa-clipboard-list"></i> Registration</button>
            <button class="btn btn-success w-full" onclick="App.navigate('marks')"><i class="fas fa-pen"></i> Marks Entry</button>
            <button class="btn btn-primary w-full" onclick="App.navigate('results')"><i class="fas fa-chart-bar"></i> Results</button>
            <button class="btn btn-outline w-full" onclick="App.navigate('admitcard')"><i class="fas fa-id-card"></i> Admit Card</button>
            <button class="btn btn-info w-full" onclick="App.navigate('markledger')"><i class="fas fa-table"></i> Mark Ledger</button>
            <button class="btn btn-secondary w-full" onclick="App.navigate('gradeledger')"><i class="fas fa-layer-group"></i> Grade Ledger</button>
            <button class="btn btn-warning w-full" onclick="App.navigate('gpledger')"><i class="fas fa-star"></i> GP Ledger</button>
            <button class="btn btn-success w-full" onclick="App.navigate('fee-collection')"><i class="fas fa-hand-holding-dollar"></i> Fee Collection</button>
            <button class="btn btn-danger w-full" onclick="App.navigate('due-list')"><i class="fas fa-exclamation-triangle"></i> Due List</button>
            <button class="btn btn-outline w-full" onclick="App.navigate('character-cert')"><i class="fas fa-scroll"></i> Character Cert</button>
            <button class="btn btn-outline w-full" onclick="App.navigate('bonafide-cert')"><i class="fas fa-certificate"></i> Bonafide Cert</button>
            <button class="btn btn-outline w-full" onclick="App.navigate('student-attendance')"><i class="fas fa-calendar-check"></i> Attendance</button>
            <button class="btn btn-outline w-full" onclick="App.navigate('settings')"><i class="fas fa-cog"></i> Settings</button>
          </div>
        </div>
        <div class="dash-card">
          <h3><i class="fas fa-clock" style="color:var(--primary);"></i> Recent Students</h3>
          ${recentStudents.length ? recentStudents.map(s => {
            const initial = (s.name||'?').charAt(0).toUpperCase();
            return `<div class="student-mini"><div class="s-avatar">${initial}</div><div class="s-info"><div class="s-name">${s.name}</div><div class="s-detail">Class ${s.class}${s.faculty ? ' ('+s.faculty+')' : ''} - Roll ${s.roll_no}</div></div></div>`;
          }).join('') : '<div class="text-muted" style="text-align:center;padding:12px;">No students yet</div>'}
        </div>
        <div class="dash-card">
          <h3><i class="fas fa-info-circle" style="color:var(--success);"></i> Session Info</h3>
          <div class="info-strip">
            <div class="is-item"><div class="is-lbl">Current Session</div><div class="is-val">${this.state.session}</div></div>
            <div class="is-item"><div class="is-lbl">Today</div><div class="is-val">${today.toLocaleDateString('en-CA')}</div></div>
            <div class="is-item"><div class="is-lbl">Total Students</div><div class="is-val">${students.length}</div></div>
            <div class="is-item"><div class="is-lbl">Results Published</div><div class="is-val">${results.length}</div></div>
            <div class="is-item"><div class="is-lbl">Pass / Fail / Supp</div><div class="is-val">${passed} / ${failed} / ${supp}</div></div>
            <div class="is-item"><div class="is-lbl">Teachers</div><div class="is-val">${teachers.length}</div></div>
          </div>
        </div>
        <div class="dash-card">
          <h3><i class="fas fa-trophy" style="color:#f59e0b;"></i> Top 3 <span class="badge">${this.state.session}</span></h3>
          ${top3.length ? `<div class="rank-list">${top3.map((r) => {
            return `<div class="rank-item">
              <div class="rank-num rank-${r.rank}">${r.rank}</div>
              <div class="rank-info"><div class="name">${r.student_name}</div><div class="detail">${r.class}${r.faculty ? ' ('+r.faculty+')' : ''}</div></div>
              <div class="rank-gpa"><div class="gpa">${parseFloat(r.gpa).toFixed(2)}</div><div class="grade-label">${r.grade}</div></div>
            </div>`;
          }).join('')}</div>` : '<div class="text-muted" style="padding:16px;text-align:center;font-size:12px;">No results yet</div>'}
        </div>
        <div class="dash-card">
          <h3><i class="fas fa-chart-bar" style="color:var(--primary);"></i> Grade Distribution</h3>
          ${grades.filter(g => gradeCount[g] > 0).length ? `<div style="padding:2px 0;">${grades.filter(g => gradeCount[g] > 0).map(g => `
            <div class="dist-bar">
              <span class="dist-lbl"><span class="grade-tag" style="background:${gradeColors[g]};color:#fff;font-size:9px;padding:1px 6px;border-radius:3px;">${g}</span></span>
              <div class="dist-track"><div class="dist-fill" style="width:${(gradeCount[g]/maxGrade*100).toFixed(0)}%;background:${gradeColors[g]};"></div></div>
              <span class="dist-count"><strong>${gradeCount[g]}</strong></span>
            </div>`).join('')}</div>` : '<div class="text-muted" style="padding:16px;text-align:center;font-size:12px;">No results yet</div>'}
        </div>
        ${(() => {
          const classOrder = ['ECD','1','2','3','4','5','6','7','8','9','10','11','12'];
          const clsResults = {};
          classOrder.forEach(c => { clsResults[c] = results.filter(r => r.class === c); });
          return `
        <div class="dash-card">
          <h3><i class="fas fa-chart-simple" style="color:var(--success);"></i> Class-wise Performance</h3>
          <div style="overflow-x:auto;">
          <table class="report-table" style="min-width:400px;">
            <thead><tr><th></th>${classOrder.filter(c => clsResults[c].length).map(c => `<th>${c}</th>`).join('')}<th>Total</th></tr></thead>
            <tbody>
              <tr><td>Students</td>${classOrder.filter(c => clsResults[c].length).map(c => `<td>${clsResults[c].length}</td>`).join('')}<td>${results.length}</td></tr>
              <tr><td>Passed</td>${classOrder.filter(c => clsResults[c].length).map(c => `<td>${clsResults[c].filter(r=>r.status==='Pass').length}</td>`).join('')}<td>${passed}</td></tr>
              <tr><td>Failed</td>${classOrder.filter(c => clsResults[c].length).map(c => `<td>${clsResults[c].filter(r=>r.status==='Fail').length}</td>`).join('')}<td>${failed}</td></tr>
              <tr><td>Supp.</td>${classOrder.filter(c => clsResults[c].length).map(c => `<td>${clsResults[c].filter(r=>r.status==='Supplementary').length}</td>`).join('')}<td>${supp}</td></tr>
              <tr><td>Avg GPA</td>${classOrder.filter(c => clsResults[c].length).map(c => `<td>${avgGpa(clsResults[c])}</td>`).join('')}<td>${results.length ? (results.reduce((s,r)=>s+parseFloat(r.gpa||0),0)/results.length).toFixed(2) : '—'}</td></tr>
              <tr><td>Pass %</td>${classOrder.filter(c => clsResults[c].length).map(c => `<td>${clsResults[c].length ? (clsResults[c].filter(r=>r.status==='Pass').length/clsResults[c].length*100).toFixed(1) : '—'}</td>`).join('')}<td>${results.length ? (passed/results.length*100).toFixed(1) : '—'}</td></tr>
            </tbody>
          </table>
          </div>
          ${results.length ? `<div style="margin-top:8px;">${classOrder.filter(c => clsResults[c].length).map(c => {
            const pct = clsResults[c].length ? (clsResults[c].filter(r=>r.status==='Pass').length/clsResults[c].length*100).toFixed(0) : 0;
            return `<div class="cmp-bar"><span class="cmp-lbl" style="width:24px;font-weight:600;font-size:10px;">${c}</span><div class="cmp-track"><div class="cmp-fill" style="width:${Math.min(pct,100)}%;background:var(--success);"></div></div><span class="cmp-val" style="width:40px;font-size:10px;color:var(--success);">${pct}%</span></div>`;
          }).join('')}</div>` : ''}
        </div>
        <div class="dash-card">
          <h3><i class="fas fa-chart-pie" style="color:#8b5cf6;"></i> Pass Rate by Class</h3>
          ${results.length ? classOrder.filter(c => clsResults[c].length).map(c => {
            const pct = clsResults[c].length ? (clsResults[c].filter(r=>r.status==='Pass').length/clsResults[c].length*100).toFixed(0) : 0;
            const failPct = 100 - parseInt(pct);
            return `<div class="cls-bar">
              <span class="cl-lbl" style="width:36px;">${c}</span>
              <div class="cl-track" style="height:16px;background:#f3f4f6;display:flex;gap:1px;">
                <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#059669,#10b981);border-radius:${failPct > 0 ? '7px 0 0 7px' : '7px'};"></div>
                ${failPct > 0 ? `<div style="width:${failPct}%;height:100%;background:linear-gradient(90deg,#ef4444,#dc2626);border-radius:0 7px 7px 0;"></div>` : ''}
              </div>
              <span class="cl-count" style="width:44px;font-size:10px;">${pct}%</span>
            </div>`;
          }).join('') : '<div class="text-muted" style="text-align:center;padding:12px;font-size:12px;">No results yet</div>'}
        </div>`;
        })()}
        <div class="dash-card">
          <h3><i class="fas fa-venus-mars" style="color:#d97706;"></i> Gender Ratio</h3>
          <div class="gender-donut" style="gap:8px;">
            <div class="donut" style="width:65px;height:65px;background:conic-gradient(#1a56db 0% ${genderPct(male)}%, #059669 ${genderPct(male)}% 100%);">
              <div class="donut-center" style="inset:10px;font-size:14px;">${students.length}</div>
            </div>
            <div class="gender-legend">
              <div class="gl-item" style="font-size:10px;padding:1px 0;"><span class="gl-dot" style="width:8px;height:8px;background:#1a56db;"></span> Male <span class="gl-count" style="font-size:10px;">${male} (${genderPct(male)}%)</span></div>
              <div class="gl-item" style="font-size:10px;padding:1px 0;"><span class="gl-dot" style="width:8px;height:8px;background:#059669;"></span> Female <span class="gl-count" style="font-size:10px;">${female} (${genderPct(female)}%)</span></div>
            </div>
          </div>
        </div>
        <div class="dash-card">
          <h3><i class="fas fa-building-columns" style="color:#8b5cf6;"></i> Faculty Distribution</h3>
          ${Object.entries(faculties).length ? `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">
            ${Object.entries(faculties).sort((a,b)=>b[1]-a[1]).map(([f, c]) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;background:var(--bg);border-radius:6px;font-size:11px;">
              <span style="font-weight:500;">${f}</span>
              <span style="font-weight:700;color:var(--primary);background:var(--primary-light);padding:1px 8px;border-radius:10px;font-size:10px;">${c}</span>
            </div>`).join('')}
          </div>` : '<div class="text-muted" style="text-align:center;padding:12px;font-size:12px;">No students</div>'}
        </div>
        <div class="dash-card">
          <h3><i class="fas fa-layer-group" style="color:#8b5cf6;"></i> Class Distribution</h3>
          ${classKeys.length ? classKeys.map(cls => `
            <div class="cls-bar">
              <span class="cl-lbl">${cls}</span>
              <div class="cl-track"><div class="cl-fill" style="width:${(classes[cls]/maxClass*100).toFixed(0)}%;"></div></div>
              <span class="cl-count">${classes[cls]}</span>
            </div>`).join('') : '<div class="text-muted" style="text-align:center;padding:12px;font-size:12px;">No students</div>'}
        </div>
        <div class="dash-card">
          <h3><i class="fas fa-book-open" style="color:#6366f1;"></i> Subjects by Class</h3>
          ${subjectClassKeys.length ? subjectClassKeys.map(cls => `
            <div class="cls-bar">
              <span class="cl-lbl">${cls}</span>
              <div class="cl-track"><div class="cl-fill" style="width:${(subjectsByClass[cls]/maxSubjClass*100).toFixed(0)}%;background:linear-gradient(90deg,#6366f1,#8b5cf6);"></div></div>
              <span class="cl-count">${subjectsByClass[cls]}</span>
            </div>`).join('') : '<div class="text-muted" style="text-align:center;padding:12px;font-size:12px;">No subjects</div>'}
        </div>
        <div class="dash-card">
          <h3><i class="fas fa-chart-line" style="color:#059669;"></i> Student-Teacher Ratio</h3>
          <div style="text-align:center;padding:8px 0;">
            <div style="font-size:36px;font-weight:800;color:var(--primary);">${teachers.length ? (students.length/teachers.length).toFixed(1) : '—'}</div>
            <div style="font-size:11px;color:var(--text-muted);">:1 (Student:Teacher)</div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:4px;">
            <div style="text-align:center;padding:6px;background:var(--bg);border-radius:6px;">
              <div style="font-size:18px;font-weight:700;color:var(--primary);">${students.length}</div>
              <div style="font-size:10px;color:var(--text-muted);">Total Students</div>
            </div>
            <div style="text-align:center;padding:6px;background:var(--bg);border-radius:6px;">
              <div style="font-size:18px;font-weight:700;color:var(--success);">${teachers.length}</div>
              <div style="font-size:10px;color:var(--text-muted);">Teachers</div>
            </div>
          </div>
        </div>
        <div class="dash-card">
          <h3><i class="fas fa-clipboard-check" style="color:#059669;"></i> Attendance Overview</h3>
          <div class="dash-stat-row">
            <div class="ds-item"><div class="ds-num">${attendances.length}</div><div class="ds-lbl">Total Records</div></div>
            <div class="ds-item"><div class="ds-num">${Object.groupBy ? Object.groupBy(attendances, a => a.student_id).size : new Set(attendances.map(a => a.student_id)).size}</div><div class="ds-lbl">Students</div></div>
            <div class="ds-item"><div class="ds-num">${attendances.filter(a => a.status === 'Present').length}</div><div class="ds-lbl">Present</div></div>
            <div class="ds-item"><div class="ds-num">${attendances.filter(a => a.status === 'Absent').length}</div><div class="ds-lbl">Absent</div></div>
          </div>
        </div>
        <div class="dash-card">
          <h3><i class="fas fa-bullhorn" style="color:#d97706;"></i> Notice Board <span class="badge">${notices.length}</span></h3>
          <div style="max-height:260px;overflow-y:auto;">
          ${notices.length ? notices.map(n => `
            <div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:12px;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">
                <a href="#" onclick="App.navigate('notices');return false;" style="font-weight:600;color:var(--text);text-decoration:none;flex:1;min-width:0;">${App.escHtml(n.title)}</a>
                <span style="font-size:10px;color:var(--text-muted);white-space:nowrap;">${(n.created_at||'').split(' ')[0]}</span>
              </div>
              ${n.content ? `<div style="color:var(--text-muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${App.escHtml(n.content).substring(0,80)}${n.content.length>80?'...':''}</div>` : ''}
            </div>
          `).join('') : '<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:12px;"><i class="fas fa-bullhorn" style="font-size:24px;opacity:0.3;display:block;margin-bottom:6px;"></i>No notices yet</div>'}
          ${notices.length ? '<div style="text-align:center;padding-top:6px;"><a href="#" onclick="App.navigate(\'notices\');return false;" style="font-size:11px;color:var(--primary);">View all notices →</a></div>' : ''}
          </div>
        </div>
      </div>`;
  },

  // ---- NOTICES ----
  async renderNoticesPage() {
    const isSuperAdmin = this.user && this.user.role === 'super_admin';
    const res = await api.getNotices();
    const notices = res.success ? res.data : [];
    const html = `
      <style>
        .notice-card { background:var(--card); border-radius:var(--radius); padding:16px 18px; margin-bottom:10px; box-shadow:var(--shadow); border-left:4px solid var(--primary); }
        .notice-card .n-header { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; }
        .notice-card .n-title { font-size:15px; font-weight:600; color:var(--text); margin:0 0 4px; }
        .notice-card .n-meta { font-size:11px; color:var(--text-muted); display:flex; gap:12px; flex-wrap:wrap; }
        .notice-card .n-content { margin-top:8px; font-size:13px; color:var(--text); line-height:1.6; white-space:pre-wrap; }
        .notice-card .n-actions { display:flex; gap:6px; flex-shrink:0; }
        .notice-card .n-file { display:inline-flex; align-items:center; gap:6px; margin-top:8px; padding:6px 12px; background:var(--bg); border-radius:6px; font-size:12px; color:var(--primary); cursor:pointer; border:1px solid var(--border); text-decoration:none; }
        .notice-card .n-file:hover { background:var(--primary-light); }
        .notice-empty { text-align:center; padding:40px; color:var(--text-muted); font-size:14px; }
        .notice-badge { display:inline-block; font-size:9px; padding:1px 8px; border-radius:10px; background:var(--primary-light); color:var(--primary); font-weight:600; }
      </style>
      <div class="filter-bar">
        <div style="flex:1;"><h3 style="margin:0;font-size:16px;"><i class="fas fa-bullhorn" style="color:var(--primary);"></i> Notices & Announcements</h3></div>
        ${isSuperAdmin ? '<button class="btn btn-primary" onclick="App.showAddNoticeModal()"><i class="fas fa-plus"></i> Add Notice</button>' : ''}
      </div>
      <div style="margin-top:10px;">
        ${notices.length ? notices.map(n => `
          <div class="notice-card">
            <div class="n-header">
              <div style="flex:1;min-width:0;">
                <div class="n-title">${n.title}</div>
                <div class="n-meta">
                  <span><i class="far fa-calendar-alt"></i> ${n.created_at||''}</span>
                  <span><i class="far fa-user"></i> ${n.created_by_name||'Admin'}</span>
                  ${n.file_name ? '<span class="notice-badge"><i class="fas fa-paperclip"></i> '+n.file_name+'</span>' : ''}
                </div>
              </div>
              ${isSuperAdmin ? `<div class="n-actions">
                <button class="btn btn-sm btn-outline" onclick="App.showEditNoticeModal(${n.id})" title="Edit"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-danger" onclick="App.deleteNotice(${n.id})" title="Delete"><i class="fas fa-trash"></i></button>
              </div>` : ''}
            </div>
            ${n.content ? `<div class="n-content">${n.content}</div>` : ''}
            ${n.file_name && n.file_data ? `<a class="n-file" href="${n.file_data}" download="${n.file_name}"><i class="fas fa-download"></i> Download ${n.file_name}</a>` : ''}
            ${n.file_name && !n.file_data ? `<div class="n-file" style="cursor:default;color:var(--text-muted);"><i class="fas fa-paperclip"></i> ${n.file_name}</div>` : ''}
          </div>
        `).join('') : '<div class="notice-empty"><i class="fas fa-bullhorn" style="font-size:36px;opacity:0.3;display:block;margin-bottom:8px;"></i>No notices yet</div>'}
      </div>`;
    document.getElementById('pageContent').innerHTML = html;
  },

  async showAddNoticeModal() {
    this.showModal(`
      <h3><i class="fas fa-plus-circle"></i> Add Notice</h3>
      <form id="noticeForm" onsubmit="return App.saveNotice(event)">
        <div class="form-group"><label>Title *</label><input type="text" id="noticeTitle" class="form-control" placeholder="Notice title" required></div>
        <div class="form-group"><label>Content</label><textarea id="noticeContent" class="form-control" rows="4" placeholder="Notice details..."></textarea></div>
        <div class="form-group"><label>Attachment</label><input type="file" id="noticeFile" class="form-control" onchange="App.previewNoticeFileName(this)"><div id="noticeFileName" style="font-size:11px;color:var(--text-muted);margin-top:4px;"></div></div>
        <button type="submit" id="noticeSaveBtn" class="btn btn-primary w-full"><i class="fas fa-save"></i> Publish Notice</button>
      </form>
    `);
  },

  previewNoticeFileName(input) {
    document.getElementById('noticeFileName').textContent = input.files[0] ? 'Selected: ' + input.files[0].name : '';
  },

  async saveNotice(e) {
    e.preventDefault();
    const title = document.getElementById('noticeTitle').value.trim();
    const content = document.getElementById('noticeContent').value.trim();
    const fileInput = document.getElementById('noticeFile');
    const btn = document.getElementById('noticeSaveBtn');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    let fileData = null, fileName = '', fileType = '';
    if (fileInput.files && fileInput.files[0]) {
      const file = fileInput.files[0];
      fileName = file.name;
      fileType = file.type;
      fileData = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
      });
    }
    const res = await api.addNotice({ title, content, file_name: fileName, file_data: fileData, file_type: fileType });
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Publish Notice';
    if (res.success) {
      this.closeModal();
      this.notify('Notice published', 'success');
      this.renderNoticesPage();
    } else {
      this.notify(res.error || 'Failed to save notice', 'error');
    }
  },

  async showEditNoticeModal(id) {
    const res = await api.getNotice(id);
    if (!res.success) { this.notify('Notice not found', 'error'); return; }
    const n = res.data;
    this.showModal(`
      <h3><i class="fas fa-edit"></i> Edit Notice</h3>
      <form id="noticeForm" onsubmit="return App.updateNotice(event, ${id})">
        <div class="form-group"><label>Title *</label><input type="text" id="noticeTitle" class="form-control" value="${n.title.replace(/"/g,'&quot;')}" required></div>
        <div class="form-group"><label>Content</label><textarea id="noticeContent" class="form-control" rows="4">${(n.content||'').replace(/"/g,'&quot;')}</textarea></div>
        <div class="form-group"><label>Attachment${n.file_name ? ' (current: '+n.file_name+')' : ''}</label><input type="file" id="noticeFile" class="form-control" onchange="App.previewNoticeFileName(this)"><div id="noticeFileName" style="font-size:11px;color:var(--text-muted);margin-top:4px;"></div></div>
        <button type="submit" id="noticeSaveBtn" class="btn btn-primary w-full"><i class="fas fa-save"></i> Update Notice</button>
      </form>
    `);
  },

  async updateNotice(e, id) {
    e.preventDefault();
    const title = document.getElementById('noticeTitle').value.trim();
    const content = document.getElementById('noticeContent').value.trim();
    const fileInput = document.getElementById('noticeFile');
    const btn = document.getElementById('noticeSaveBtn');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    const data = { title, content };
    if (fileInput.files && fileInput.files[0]) {
      const file = fileInput.files[0];
      data.file_name = file.name;
      data.file_type = file.type;
      data.file_data = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
      });
    }
    const res = await api.updateNotice(id, data);
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Update Notice';
    if (res.success) {
      this.closeModal();
      this.notify('Notice updated', 'success');
      this.renderNoticesPage();
    } else {
      this.notify(res.error || 'Failed to update notice', 'error');
    }
  },

  async deleteNotice(id) {
    if (!confirm('Delete this notice?')) return;
    const res = await api.deleteNotice(id);
    if (res.success) {
      this.notify('Notice deleted', 'success');
      this.renderNoticesPage();
    } else {
      this.notify(res.error || 'Failed to delete', 'error');
    }
  },

  // ---- STUDENTS ----
  renderStudentTable(data, page, rowsPerPage) {
    const total = data.length;
    const totalPages = Math.ceil(total / rowsPerPage) || 1;
    const start = (page - 1) * rowsPerPage;
    const slice = data.slice(start, start + rowsPerPage);
    const tbody = document.querySelector('.table-container tbody');
    const pagination = document.getElementById('studentPagination');
    if (tbody) {
      tbody.innerHTML = slice.length ? slice.map((s, i) => `
        <tr>
          <td><input type="checkbox" class="student-select" value="${s.id}" onchange="App.updateDeleteSelectedBtn('student')"></td>
          <td>${start + i + 1}</td><td>${s.session}</td><td>${s.class}</td><td>${s.sym||'-'}</td><td>${s.reg||'-'}</td><td>${s.name}</td>
          <td>${s.photo_path ? `<img src="${s.photo_path}" style="width:30px;height:35px;object-fit:cover;border-radius:2px;border:1px solid var(--border);">` : '—'}</td>
          <td>${s.dob_bs||'-'}</td><td>${s.dob||'-'}</td><td>${s.faculty}</td><td>${s.gender||'-'}</td>
          <td>${s.father_name||'-'}</td><td>${s.mother_name||'-'}</td><td>${s.guardian_name||'-'}</td><td>${s.phone||'-'}</td><td>${s.address||'-'}</td>
          <td>
            <button class="btn btn-sm btn-primary" onclick="App.showEditStudentModal(${s.id})"><i class="fas fa-edit"></i></button>
            <button class="btn btn-sm btn-danger" onclick="App.deleteStudent(${s.id})"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`).join('') : '<tr><td colspan="18" class="text-center text-muted">No students found</td></tr>';
    }
    if (pagination) {
      pagination.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:8px 0;font-size:12px;">
          <span>Showing ${total ? start+1 : 0}–${Math.min(start+rowsPerPage, total)} of ${total}</span>
          <div style="display:flex;align-items:center;gap:4px;">
            <button class="btn btn-sm btn-outline" onclick="App.goToStudentPage(${page-1})" ${page<=1?'disabled':''}>« Prev</button>
            ${Array.from({length: totalPages}, (_, i) => i+1).map(p =>
              `<button class="btn btn-sm ${p===page?'btn-primary':'btn-outline'}" onclick="App.goToStudentPage(${p})" style="min-width:28px;">${p}</button>`
            ).join('')}
            <button class="btn btn-sm btn-outline" onclick="App.goToStudentPage(${page+1})" ${page>=totalPages?'disabled':''}>Next »</button>
          </div>
          <label><select onchange="App.changeRowsPerPage(this.value)" style="padding:3px 6px;border-radius:4px;border:1px solid var(--border);font-size:12px;">
            ${[10,25,50,100].map(n => `<option value="${n}" ${n==rowsPerPage?'selected':''}>${n} / page</option>`).join('')}
          </select></label>
        </div>`;
    }
  },

  goToStudentPage(page) {
    const totalPages = Math.ceil(this.state.students.length / this.state.rowsPerPage) || 1;
    if (page < 1 || page > totalPages) return;
    this.state.studentPage = page;
    this.renderStudentTable(this.state.students, page, this.state.rowsPerPage);
  },

  changeRowsPerPage(n) {
    this.state.rowsPerPage = parseInt(n);
    this.state.studentPage = 1;
    this.renderStudentTable(this.state.students, 1, this.state.rowsPerPage);
  },

  async renderStudents(search = '') {
    const query = { session: this.state.session };
    if (search) query.search = search;
    const res = await api.getStudents(query);
    const students = res.success ? res.data : [];
    this.state.students = students;
    this.state.studentPage = 1;
    document.getElementById('pageContent').innerHTML = `
      <div class="filter-bar">
        <div class="form-group">
          <label>Class</label>
          <select class="form-control" id="filterStudentClass" onchange="App.filterStudents()">
            ${_classOptsAll()}
          </select>
        </div>
        <div class="form-group">
          <label>Faculty</label>
          <select class="form-control" id="filterStudentFaculty" onchange="App.filterStudents()">
            <option value="">All</option>
            <option value="Common">Common</option><option value="General">General</option><option value="Technical">Technical</option>
          </select>
        </div>
        <button class="btn btn-primary" onclick="App.showAddStudentModal()"><i class="fas fa-plus"></i> Add Student</button>
        <button class="btn btn-outline" onclick="App.downloadStudentTemplate()"><i class="fas fa-file-download"></i> Template</button>
        <button class="btn btn-outline" onclick="App.exportData('students')"><i class="fas fa-download"></i> Export</button>
        <button class="btn btn-outline" onclick="App.importData()"><i class="fas fa-upload"></i> Import</button>
        <button class="btn btn-danger" id="btnDeleteSelectedStudents" style="display:none;" onclick="App.deleteSelectedStudents()"><i class="fas fa-trash"></i> Delete <span id="selectedStudentCount">0</span></button>
      </div>
      <div class="table-container">
        <table>
          <thead><tr>
            <th><input type="checkbox" id="selectAllStudents" onchange="App.toggleSelectAllStudents(this.checked)"></th>
            <th>SN</th><th>Year</th><th>Class</th><th>SYM</th><th>REG</th><th>Name</th><th>Photo</th><th>DOB BS</th><th>DOB AD</th><th>Faculty</th><th>Gender</th><th>Father</th><th>Mother</th><th>Guardian</th><th>Phone</th><th>Address</th><th>Actions</th>
          </tr></thead>
          <tbody></tbody>
        </table>
        <div id="studentPagination"></div>
      </div>`;
    this.renderStudentTable(students, 1, this.state.rowsPerPage);
  },

  async renderStudentList() {
    const res = await api.getStudents({ session: this.state.session });
    const students = res.success ? res.data : [];
    this.state._studentListData = students;
    this.state.studentPage = 1;
    document.getElementById('pageContent').innerHTML = `
      <div class="filter-bar">
        <div class="form-group">
          <label>Class</label>
          <select class="form-control" id="slClassFilter" onchange="App.renderStudentListTable()">
            ${_classOptsAll()}
          </select>
        </div>
        <div class="form-group">
          <label>Faculty</label>
          <select class="form-control" id="slFacultyFilter" onchange="App.renderStudentListTable()">
            <option value="">All</option>
            <option value="Common">Common</option><option value="General">General</option><option value="Technical">Technical</option>
          </select>
        </div>
        <div class="form-group" style="flex:1;min-width:150px;">
          <label>Search</label>
          <input class="form-control" id="slSearch" placeholder="Name or Roll No..." oninput="App.renderStudentListTable()">
        </div>
        <button class="btn btn-outline" onclick="App.exportData('students')"><i class="fas fa-download"></i> Export</button>
      </div>
      <div class="table-container">
        <table>
          <thead><tr>
            <th>SN</th><th>Roll</th><th>Name</th><th>Photo</th><th>Class</th><th>Faculty</th><th>Gender</th><th>Father</th><th>Mother</th><th>Guardian</th><th>Phone</th><th>Actions</th>
          </tr></thead>
          <tbody id="studentListBody"></tbody>
        </table>
        <div id="studentListPagination"></div>
      </div>`;
    this.renderStudentListTable(students, 1, this.state.rowsPerPage);
  },

  renderStudentListTable() {
    const cls = document.getElementById('slClassFilter').value;
    const faculty = document.getElementById('slFacultyFilter').value;
    const search = document.getElementById('slSearch').value.toLowerCase();
    let data = this.state._studentListData || [];
    data = data.filter(s =>
      (!cls || s.class === cls) && (!faculty || s.faculty === faculty) &&
      (!search || s.name.toLowerCase().includes(search) || s.roll_no.includes(search))
    );
    this.state.students = data;
    this.state.studentPage = 1;
    this.renderStudentListPaged(data, 1, this.state.rowsPerPage);
  },

  renderStudentListPaged(data, page, rowsPerPage) {
    const total = data.length;
    const start = (page - 1) * rowsPerPage;
    const slice = data.slice(start, start + rowsPerPage);
    const tbody = document.getElementById('studentListBody');
    const pagination = document.getElementById('studentListPagination');
    if (tbody) {
      tbody.innerHTML = slice.length ? slice.map((s, i) => `
        <tr>
          <td>${start + i + 1}</td>
          <td>${s.roll_no}</td>
          <td>${s.name}</td>
          <td>${s.photo_path ? `<img src="${s.photo_path}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">` : '<span class="text-muted" style="font-size:11px;">—</span>'}</td>
          <td>${s.class}</td>
          <td>${s.faculty}</td>
          <td>${s.gender || '-'}</td>
          <td>${s.father_name || '-'}</td>
          <td>${s.mother_name || '-'}</td>
          <td>${s.guardian_name || '-'}</td>
          <td>${s.phone || '-'}</td>
          <td style="white-space:nowrap;">
            <button class="btn btn-sm btn-primary" onclick="App.viewStudentProfile(${s.id})" title="View Profile"><i class="fas fa-eye"></i></button>
            <button class="btn btn-sm btn-warning" onclick="App.showEditStudentModal(${s.id})" title="Edit"><i class="fas fa-edit"></i></button>
            <button class="btn btn-sm btn-danger" onclick="App.deleteStudent(${s.id})" title="Delete"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`).join('') : '<tr><td colspan="10" class="text-center text-muted">No students found</td></tr>';
    }
    if (pagination) {
      pagination.innerHTML = this.renderPagination(total, page, rowsPerPage, 'App.goToStudentListPage', 'App.changeStudentListRowsPerPage');
    }
  },

  goToStudentListPage(page) {
    const data = this.state.students || [];
    const totalPages = Math.ceil(data.length / this.state.rowsPerPage) || 1;
    if (page < 1 || page > totalPages) return;
    this.state.studentPage = page;
    this.renderStudentListPaged(data, page, this.state.rowsPerPage);
  },

  changeStudentListRowsPerPage(n) {
    const data = this.state.students || [];
    this.state.rowsPerPage = parseInt(n);
    this.state.studentPage = 1;
    this.renderStudentListPaged(data, 1, this.state.rowsPerPage);
  },

  async renderStudentProfile() {
    const sRes = await api.getStudents({ session: this.state.session });
    const students = sRes.success ? sRes.data : [];
    this.state._profileStudents = students;
    document.getElementById('pageContent').innerHTML = `
      <div class="filter-bar" style="flex-wrap:wrap;">
        <div class="form-group">
          <label>Class</label>
          <select class="form-control" id="profileClassFilter" onchange="App.filterProfileStudents()">
            ${_classOptsAll()}
          </select>
        </div>
        <div class="form-group">
          <label>Faculty</label>
          <select class="form-control" id="profileFacultyFilter" onchange="App.filterProfileStudents()">
            <option value="">All</option>
            <option value="Common">Common</option><option value="General">General</option><option value="Technical">Technical</option>
          </select>
        </div>
        <div class="form-group" style="flex:1;min-width:220px;">
          <label>Select Student</label>
          <select class="form-control" id="profileStudentSelect" onchange="App.loadStudentProfile(this.value)">
            <option value="">-- All Students --</option>
            ${students.map(s => `<option value="${s.id}">${s.name} (Roll: ${s.roll_no} | ${s.class} ${s.faculty})</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="align-self:flex-end;">
          <button class="btn btn-outline" onclick="App.showAllStudentProfiles()"><i class="fas fa-users"></i> All Profiles</button>
          <button class="btn btn-outline" onclick="App.printAllStudentProfiles()"><i class="fas fa-print"></i> Print All</button>
        </div>
      </div>
      <div id="profileDisplay">
        <div class="card" style="background:var(--card);border-radius:var(--radius);padding:40px;box-shadow:var(--shadow);text-align:center;">
          <p class="text-muted" style="font-size:16px;">Select a student or click "All Profiles" to view</p>
        </div>
      </div>`;
  },

  filterProfileStudents() {
    const cls = document.getElementById('profileClassFilter').value;
    const faculty = document.getElementById('profileFacultyFilter').value;
    const select = document.getElementById('profileStudentSelect');
    const prevVal = select.value;
    select.innerHTML = '<option value="">-- All Students --</option>' +
      this.state._profileStudents.filter(s => (!cls || s.class === cls) && (!faculty || s.faculty === faculty))
        .map(s => `<option value="${s.id}">${s.name} (Roll: ${s.roll_no} | ${s.class} ${s.faculty})</option>`).join('');
    if (prevVal && [...select.options].some(o => o.value === prevVal)) {
      select.value = prevVal;
      this.loadStudentProfile(prevVal);
    } else {
      select.value = '';
      this.showAllStudentProfiles();
    }
  },

  async showAllStudentProfiles() {
    const cls = document.getElementById('profileClassFilter').value;
    const faculty = document.getElementById('profileFacultyFilter').value;
    const students = this.state._profileStudents.filter(s =>
      (!cls || s.class === cls) && (!faculty || s.faculty === faculty));
    if (!students.length) {
      document.getElementById('profileDisplay').innerHTML = `<div class="card" style="background:var(--card);border-radius:var(--radius);padding:40px;box-shadow:var(--shadow);text-align:center;"><p class="text-muted" style="font-size:16px;">No students found</p></div>`;
      return;
    }
    document.getElementById('profileStudentSelect').value = '';
    // Fetch attendance stats for all students in one call per student (batch not available)
    const attPromises = students.map(s => api.getAttendanceStats(s.id, this.state.session).catch(() => ({ success: false })));
    const attResults = await Promise.all(attPromises);
    const html = students.map((s, i) => {
      const att = attResults[i].success ? attResults[i].data : null;
      return `
      <div class="card" style="background:var(--card);border-radius:var(--radius);padding:12px 16px;box-shadow:var(--shadow);margin-bottom:10px;cursor:pointer;" onclick="App.loadStudentProfile(${s.id})">
        <div style="display:flex;gap:12px;align-items:center;">
          <div style="flex-shrink:0;width:50px;height:60px;border-radius:4px;overflow:hidden;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--text-muted);">
            ${s.photo_path ? `<img src="${s.photo_path}" style="width:100%;height:100%;object-fit:cover;">` : 'No Photo'}
          </div>
          <div style="flex:1;font-size:13px;line-height:1.8;">
            <strong>${s.name}</strong> (Roll: ${s.roll_no}) — ${s.class} ${s.faculty}
            <div style="font-size:11px;color:var(--text-muted);">
              ${s.father_name ? 'Father: '+s.father_name : ''}${s.father_name && s.mother_name ? ' | ' : ''}${s.mother_name ? 'Mother: '+s.mother_name : ''}
              ${att ? ` | Open: ${att.schoolOpenDays} | Present: ${att.presentDays} | ${att.percentage}%` : ''}
            </div>
          </div>
          <div style="font-size:11px;color:var(--primary);"><i class="fas fa-chevron-right"></i></div>
        </div>
      </div>`;
    }).join('');
    document.getElementById('profileDisplay').innerHTML = `
      <div class="card" style="background:var(--card);border-radius:var(--radius);padding:16px 20px;box-shadow:var(--shadow);margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <h3 style="font-size:14px;margin:0;">All Profiles (${students.length})</h3>
          <button class="btn btn-sm btn-outline" onclick="App.printAllStudentProfiles()"><i class="fas fa-print"></i> Print All</button>
        </div>
        ${html}
      </div>`;
  },

  async printAllStudentProfiles() {
    const cls = document.getElementById('profileClassFilter').value;
    const faculty = document.getElementById('profileFacultyFilter').value;
    const students = this.state._profileStudents.filter(s =>
      (!cls || s.class === cls) && (!faculty || s.faculty === faculty));
    if (!students.length) return this.notify('No students to print', 'warning');
    const school = this.state.school;
    const regRes = await api.getSubjectRegistrations('all', this.state.session);
    const allRegs = regRes.success ? regRes.data : [];
    const subRes = await api.getSubjects({});
    const allSubjects = subRes.success ? subRes.data : [];
    const subjMap = {};
    for (const sb of allSubjects) subjMap[sb.id] = sb;
    const win = window.open('', '_blank');
    let bodyHtml = '';
    for (const s of students) {
      const regSubjIds = allRegs.filter(r => r.student_id == s.id).map(r => r.subject_id);
      const regSubjects = regSubjIds.map(sid => subjMap[sid]).filter(Boolean);
      const [attStats, mFinal, mTerm1, mTerm2, rFinal, rTerm1, rTerm2] = await Promise.all([
        api.getAttendanceStats(s.id, this.state.session),
        api.getMarks({ student_id: s.id, session: this.state.session, exam_type: 'final' }),
        api.getMarks({ student_id: s.id, session: this.state.session, exam_type: 'term1' }),
        api.getMarks({ student_id: s.id, session: this.state.session, exam_type: 'term2' }),
        api.getResults({ student_id: s.id, session: this.state.session, exam_type: 'final' }),
        api.getResults({ student_id: s.id, session: this.state.session, exam_type: 'term1' }),
        api.getResults({ student_id: s.id, session: this.state.session, exam_type: 'term2' })
      ]);
      const att = attStats.success ? attStats.data : null;
      const marksByExam = {
        annual: mFinal.success ? mFinal.data : [],
        term1: mTerm1.success ? mTerm1.data : [],
        term2: mTerm2.success ? mTerm2.data : []
      };
      const resultByExam = {
        annual: rFinal.success ? rFinal.data[0] : null,
        term1: rTerm1.success ? rTerm1.data[0] : null,
        term2: rTerm2.success ? rTerm2.data[0] : null
      };
      function renderTermTable(termLabel, term, mks, res) {
        const isTerm = term !== 'annual';
        mks.sort((a, b) => (a.subject_code||'').localeCompare(b.subject_code||'', undefined, { numeric: true }));
        let totalCH = 0, wGP = 0, hF = false, hNG = false;
        for (const mm of mks) {
          const ch = isTerm ? parseFloat(mm[`${term}_credit_hours`]) : parseFloat(mm.credit_hours);
          totalCH += ch || 1;
          const gp = isTerm ? (parseFloat(mm.theory_grade_point) || 0) : (parseFloat(mm.grade_point) || 0);
          wGP += gp * (ch || 1);
          const g = isTerm ? mm.theory_grade : mm.grade;
          if (g === 'NG' || g === 'E') hF = true;
          if (g === 'NG') hNG = true;
        }
        const gpa = totalCH > 0 ? Math.round((wGP / totalCH) * 100) / 100 : 0;
        let grade = 'NG', status = 'Pass';
        if (hNG) { grade = 'NG'; status = 'Fail'; }
        else if (hF) { grade = 'E'; status = 'Supplementary'; }
        else if (gpa >= 3.6) grade = 'A+';
        else if (gpa >= 3.2) grade = 'A';
        else if (gpa >= 2.8) grade = 'B+';
        else if (gpa >= 2.4) grade = 'B';
        else if (gpa >= 2.0) grade = 'C+';
        else if (gpa >= 1.6) grade = 'C';
        else if (gpa >= 1.0) grade = 'D';
        else { grade = 'E'; status = 'Fail'; }
        const rank = res && res.rank ? res.rank : '-';
        const fmKey = isTerm ? `${term}_full_marks` : 'full_marks_theory';
        const pmKey = isTerm ? `${term}_pass_marks` : 'pass_marks_theory';
        return `
          <div class="section">
            <h4>${termLabel} — GPA: ${gpa} | Grade: ${grade} | ${status} | Rank: ${rank}</h4>
            ${mks.length ? `
            <table class="data">
              <thead><tr><th>Code</th><th>Subject</th>
                ${isTerm ? '<th>FM</th><th>PM</th><th>Obtained</th><th>Gr.</th>' : '<th>Th</th><th>In</th><th>Total</th><th>Gr.</th>'}
              </tr></thead>
              <tbody>${mks.map(mm => {
                const theory = parseFloat(mm.theory_marks) || 0;
                const practical = parseFloat(mm.practical_marks) || 0;
                const total = theory + practical;
                const fm = parseFloat(mm[fmKey]) || 0;
                const pm = parseFloat(mm[pmKey]) || 0;
                return isTerm ? `
                <tr>
                  <td>${mm.subject_code||'-'}</td>
                  <td style="text-align:left;">${mm.subject_name||'-'}</td>
                  <td>${fm}</td><td>${pm}</td><td>${theory}</td>
                  <td>${mm.theory_grade||'-'}</td>
                </tr>` : `
                <tr>
                  <td>${mm.subject_code||'-'}</td>
                  <td style="text-align:left;">${mm.subject_name||'-'}</td>
                  <td>${theory}</td><td>${practical}</td><td>${total}</td>
                  <td>${mm.grade||'-'}</td>
                </tr>`;
              }).join('')}
              </tbody>
            </table>` : '<p style="font-size:11px;color:#666;">No marks entered</p>'}
          </div>`;
      }
      bodyHtml += `
        <div style="page-break-after:always;">
          <div class="header">
            ${school.school_logo ? `<img src="${school.school_logo}" class="logo">` : ''}
            <h2>${school.school_name || 'School Name'}</h2>
            <h3>${school.municipality || ''} | ${school.province || ''} | Estd: ${school.estd || ''}</h3>
          </div>
          <div class="info-row">
            <div class="info-col">
              <table class="info-table">
                <tr><td class="lbl">Student's Name</td><td>${s.name}</td></tr>
                <tr><td class="lbl">Roll No.</td><td>${s.roll_no}</td></tr>
                <tr><td class="lbl">Symbol No.</td><td>${s.sym || '-'}</td></tr>
                <tr><td class="lbl">Reg. No.</td><td>${s.reg || '-'}</td></tr>
                <tr><td class="lbl">Class</td><td>${s.class}</td></tr>
                <tr><td class="lbl">Faculty</td><td>${s.faculty}</td></tr>
                <tr><td class="lbl">Gender</td><td>${s.gender || '-'}</td></tr>
                <tr><td class="lbl">DOB (BS)</td><td>${s.dob_bs || '-'}</td></tr>
                <tr><td class="lbl">DOB (AD)</td><td>${s.dob ? s.dob.split('T')[0] : '-'}</td></tr>
              </table>
            </div>
            <div class="info-col">
              <table class="info-table">
                <tr><td class="lbl2">Father</td><td>${s.father_name || '-'}</td></tr>
                <tr><td class="lbl2">Mother</td><td>${s.mother_name || '-'}</td></tr>
                <tr><td class="lbl2">Guardian</td><td>${s.guardian_name || '-'}</td></tr>
                <tr><td class="lbl2">Phone</td><td>${s.phone || '-'}</td></tr>
                <tr><td class="lbl2">Address</td><td>${s.address || '-'}</td></tr>
                <tr><td class="lbl2">Session</td><td>${this.state.session}</td></tr>
                <tr><td class="lbl2">Open Days</td><td>${att ? att.schoolOpenDays : '-'}</td></tr>
                <tr><td class="lbl2">Attendance</td><td>${att ? att.presentDays + ' (' + att.percentage + '%)' : '-'}</td></tr>
              </table>
            </div>
            <div class="photo-box">${s.photo_path ? `<img src="${s.photo_path}" style="width:100%;height:100%;object-fit:cover;">` : 'Photo'}</div>
          </div>
          <div class="section">
            <h4>Registered Subjects (${regSubjects.length})</h4>
            <div class="subjects">${regSubjects.length ? regSubjects.map(sb => `<span>${sb.code} - ${sb.name}</span>`).join('') : '<span>No subjects registered</span>'}</div>
          </div>
          ${renderTermTable('Annual', 'annual', marksByExam.annual, resultByExam.annual)}
          ${renderTermTable('First Term', 'term1', marksByExam.term1, resultByExam.term1)}
          ${renderTermTable('Second Term', 'term2', marksByExam.term2, resultByExam.term2)}
        <div class="section notes" style="margin-top:8px;">
          <h4>Notes</h4>
          <p style="font-size:11px;line-height:1.6;margin:4px 0;">This is to certify that the above-mentioned student has successfully completed the academic session ${this.state.session}. The student has shown satisfactory performance in both academic and co-curricular activities. Attendance records reflect the student's regularity and punctuality throughout the session. All the information provided in this profile is verified and accurate as per school records.</p>
        </div>
        <div class="signatures" style="display:flex;justify-content:space-between;margin-top:12px;padding-top:8px;border-top:1px solid #000;">
          <div style="text-align:center;font-size:11px;">
            <div style="width:120px;border-top:1px solid #000;margin-top:35px;padding-top:4px;">Taken By</div>
          </div>
          <div style="text-align:center;font-size:11px;">
            <div style="width:120px;border-top:1px solid #000;margin-top:35px;padding-top:4px;">Class Teacher</div>
          </div>
          <div style="text-align:center;font-size:11px;">
            <div style="width:120px;border-top:1px solid #000;margin-top:35px;padding-top:4px;">Principal</div>
          </div>
        </div>
        </div>`;
    }
    win.document.write(`
      <html><head><title>All Student Profiles</title>
      <style>
        @page { size: A4; margin: 6mm; }
        body { font-family: 'Times New Roman', serif; margin:0; padding:12px; font-size:12px; }
        .header { text-align:center; border-bottom:2px solid #000; padding-bottom:5px; margin-bottom:8px; }
        .header .logo { max-height:45px; }
        .header h2 { margin:3px 0; font-size:15px; text-transform:uppercase; }
        .header h3 { margin:2px 0; font-size:11px; font-weight:400; }
        .section { margin-bottom:6px; }
        .section h4 { font-size:12px; border-bottom:1px solid #999; padding-bottom:2px; margin-bottom:4px; text-transform:uppercase; }
        .info-table { width:100%; border-collapse:collapse; font-size:11px; }
        .info-table td { padding:2px 5px; vertical-align:top; }
        .info-table .lbl { font-weight:700; width:95px; }
        .info-table .lbl2 { font-weight:700; width:70px; }
        .photo-box { float:right; width:85px; height:100px; border:1.5px solid #000; text-align:center; font-size:9px; color:#666; display:flex; align-items:center; justify-content:center; overflow:hidden; margin-left:8px; }
        table.data { width:100%; border-collapse:collapse; font-size:10px; margin-top:3px; }
        table.data th, table.data td { border:1px solid #888; padding:2px 4px; text-align:center; }
        table.data th { background:#e5e7eb; font-size:9.5px; }
        .subjects { display:flex; flex-wrap:wrap; gap:3px; }
        .subjects span { border:1px solid #aaa; padding:1px 6px; border-radius:2px; font-size:10px; }
        .footer { text-align:center; font-size:8px; color:#666; margin-top:8px; border-top:1px solid #ccc; padding-top:5px; }
        .info-row { display:flex; }
        .info-col { flex:1; }
      </style></head><body>
        ${bodyHtml}
        <div class="footer">Generated on ${new Date().toLocaleDateString()}</div>
      </body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 500);
  },

  async loadStudentProfile(id) {
    if (!id) {
      document.getElementById('profileDisplay').innerHTML = `
        <div class="card" style="background:var(--card);border-radius:var(--radius);padding:40px;box-shadow:var(--shadow);text-align:center;">
          <p class="text-muted" style="font-size:16px;">Select a student to view profile</p>
        </div>`;
      return;
    }
    const sRes = await api.getStudent(id);
    if (!sRes.success) return this.notify('Student not found', 'error');
    const s = sRes.data;
    const subRes = await api.getSubjects({});
    const allSubjects = subRes.success ? subRes.data : [];
    const subjMap = {};
    for (const sb of allSubjects) subjMap[sb.id] = sb;
    const regRes = await api.getSubjectRegistrations('all', this.state.session);
    const allRegs = regRes.success ? regRes.data : [];
    const regSubjIds = allRegs.filter(r => r.student_id == id).map(r => r.subject_id);
    const regSubjects = regSubjIds.map(sid => subjMap[sid]).filter(Boolean);
    // Fetch marks, results, and attendance stats
    const [mFinal, mTerm1, mTerm2, rFinal, rTerm1, rTerm2, attStats] = await Promise.all([
      api.getMarks({ student_id: id, session: this.state.session, exam_type: 'final' }),
      api.getMarks({ student_id: id, session: this.state.session, exam_type: 'term1' }),
      api.getMarks({ student_id: id, session: this.state.session, exam_type: 'term2' }),
      api.getResults({ student_id: id, session: this.state.session, exam_type: 'final' }),
      api.getResults({ student_id: id, session: this.state.session, exam_type: 'term1' }),
      api.getResults({ student_id: id, session: this.state.session, exam_type: 'term2' }),
      api.getAttendanceStats(id, this.state.session)
    ]);
    this.state._profileStudent = s;
    this.state._profileRegSubjects = regSubjects;
    this.state._profileAttendance = attStats.success ? attStats.data : { schoolOpenDays: 0, presentDays: 0, percentage: 0 };
    this.state._profileMarks = {
      annual: mFinal.success ? mFinal.data : [],
      term1: mTerm1.success ? mTerm1.data : [],
      term2: mTerm2.success ? mTerm2.data : []
    };
    this.state._profileResult = {
      annual: rFinal.success ? rFinal.data[0] : null,
      term1: rTerm1.success ? rTerm1.data[0] : null,
      term2: rTerm2.success ? rTerm2.data[0] : null
    };
    this._renderProfileDisplay();
  },

  _calcTermData(marks, term) {
    const isTerm = term === 'term1' || term === 'term2';
    let totalCreditHours = 0, weightedGP = 0, hasFail = false, hasNG = false;
    for (const m of marks) {
      const ch = isTerm ? parseFloat(m[`${term}_credit_hours`]) : parseFloat(m.credit_hours);
      totalCreditHours += ch || 1;
      const gp = isTerm ? (parseFloat(m.theory_grade_point) || 0) : (parseFloat(m.grade_point) || 0);
      weightedGP += gp * (ch || 1);
      const g = isTerm ? m.theory_grade : m.grade;
      if (g === 'NG' || g === 'E') hasFail = true;
      if (g === 'NG') hasNG = true;
    }
    const gpa = totalCreditHours > 0 ? Math.round((weightedGP / totalCreditHours) * 100) / 100 : 0;
    let grade = 'NG', status = 'Pass';
    if (hasNG) { grade = 'NG'; status = 'Fail'; }
    else if (hasFail) { grade = 'E'; status = 'Supplementary'; }
    else if (gpa >= 3.6) { grade = 'A+'; }
    else if (gpa >= 3.2) { grade = 'A'; }
    else if (gpa >= 2.8) { grade = 'B+'; }
    else if (gpa >= 2.4) { grade = 'B'; }
    else if (gpa >= 2.0) { grade = 'C+'; }
    else if (gpa >= 1.6) { grade = 'C'; }
    else if (gpa >= 1.0) { grade = 'D'; }
    else { grade = 'E'; status = 'Fail'; }
    return { gpa, grade, status, hasFail, hasNG };
  },

  _renderTermMarksCard(termLabel, term, marks, result) {
    const isTerm = term !== 'annual';
    marks.sort((a, b) => (a.subject_code||'').localeCompare(b.subject_code||'', undefined, { numeric: true }));
    const { gpa, grade, status } = this._calcTermData(marks, term);
    const fmKey = isTerm ? `${term}_full_marks` : 'full_marks_theory';
    const pmKey = isTerm ? `${term}_pass_marks` : 'pass_marks_theory';
    const rank = result && result.rank ? result.rank : '-';
    return `
      <div class="card" style="background:var(--card);border-radius:var(--radius);padding:16px 20px;box-shadow:var(--shadow);margin-bottom:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <h3 style="font-size:14px;margin:0;">${termLabel}</h3>
          <div style="display:flex;gap:16px;align-items:center;">
            <div style="text-align:center;">
              <div style="font-size:20px;font-weight:700;color:${status==='Pass'?'var(--success)':'var(--danger)'};">${gpa}</div>
              <div style="font-size:10px;color:var(--text-muted);">GPA</div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:16px;font-weight:700;"><span class="grade-badge grade-${grade}" style="font-size:12px;">${grade}</span></div>
              <div style="font-size:10px;color:var(--text-muted);">Grade</div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:14px;font-weight:600;color:${status==='Pass'?'var(--success)':'var(--danger)'};">${status}</div>
              <div style="font-size:10px;color:var(--text-muted);">Status</div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:14px;font-weight:600;">${rank}</div>
              <div style="font-size:10px;color:var(--text-muted);">Rank</div>
            </div>
          </div>
        </div>
        ${marks.length ? `
        <div class="table-container">
          <table style="font-size:12px;">
            <thead><tr>
              <th>Code</th><th>Subject</th>
              ${isTerm ? '<th>FM</th><th>PM</th><th>Obtained</th><th>Gr.</th>' : '<th>Th</th><th>In</th><th>Total</th><th>Gr.</th>'}
            </tr></thead>
            <tbody>${marks.map(m => {
              const theory = parseFloat(m.theory_marks) || 0;
              const practical = parseFloat(m.practical_marks) || 0;
              const total = theory + practical;
              const fm = parseFloat(m[fmKey]) || 0;
              const pm = parseFloat(m[pmKey]) || 0;
              return isTerm ? `
              <tr>
                <td>${m.subject_code||'-'}</td>
                <td>${m.subject_name||'-'}</td>
                <td>${fm}</td>
                <td>${pm}</td>
                <td>${theory}</td>
                <td><span class="grade-badge grade-${m.theory_grade||'NG'}">${m.theory_grade||'NG'}</span></td>
              </tr>` : `
              <tr>
                <td>${m.subject_code||'-'}</td>
                <td>${m.subject_name||'-'}</td>
                <td>${theory}</td>
                <td>${practical}</td>
                <td>${total}</td>
                <td><span class="grade-badge grade-${m.grade||'NG'}">${m.grade||'NG'}</span></td>
              </tr>`;
            }).join('')}
            </tbody>
          </table>
        </div>` : '<p class="text-muted" style="font-size:13px;">No marks entered</p>'}
      </div>`;
  },

  _renderProfileDisplay() {
    const s = this.state._profileStudent;
    if (!s) return;
    const regSubjects = this.state._profileRegSubjects || [];
    const marksAll = this.state._profileMarks || { annual: [], term1: [], term2: [] };
    const resultAll = this.state._profileResult || {};
    const att = this.state._profileAttendance || { schoolOpenDays: 0, presentDays: 0, percentage: 0 };
    const terms = [
      { label: 'Annual', key: 'annual' },
      { label: 'First Term', key: 'term1' },
      { label: 'Second Term', key: 'term2' }
    ];

    document.getElementById('profileDisplay').innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 2fr;gap:20px;">
        <div class="card" style="background:var(--card);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow);text-align:center;">
          <div style="margin-bottom:12px;">
            ${s.photo_path ? `<img src="${s.photo_path}" style="width:150px;height:180px;border-radius:8px;object-fit:cover;border:3px solid var(--border);">` : `<div style="width:150px;height:180px;border:3px dashed var(--border);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:14px;margin:0 auto;">No Photo</div>`}
          </div>
          <h3 style="font-size:18px;margin-bottom:4px;">${s.name}</h3>
          <p class="text-muted" style="font-size:13px;">Roll No: ${s.roll_no} | ${s.class} ${s.faculty}</p>
          <hr style="margin:12px 0;border-color:var(--border);">
          <div style="text-align:left;font-size:13px;line-height:2;">
            <div><strong>SYM:</strong> ${s.sym || '-'}</div>
            <div><strong>REG:</strong> ${s.reg || '-'}</div>
            <div><strong>Gender:</strong> ${s.gender || '-'}</div>
            <div><strong>DOB BS:</strong> ${s.dob_bs || '-'}</div>
            <div><strong>DOB AD:</strong> ${s.dob ? s.dob.split('T')[0] : '-'}</div>
            <div><strong>Father:</strong> ${s.father_name || '-'}</div>
            <div><strong>Mother:</strong> ${s.mother_name || '-'}</div>
            <div><strong>Guardian:</strong> ${s.guardian_name || '-'}</div>
            <div><strong>Phone:</strong> ${s.phone || '-'}</div>
            <div><strong>Address:</strong> ${s.address || '-'}</div>
          </div>
          <hr style="margin:8px 0;border-color:var(--border);">
          <div style="text-align:left;font-size:12px;line-height:2;">
            <div><strong>School Open Days:</strong> ${att.schoolOpenDays}</div>
            <div><strong>Attendance Days:</strong> ${att.presentDays}</div>
            <div><strong>Attendance %:</strong> ${att.percentage}%</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-top:12px;">
            <button class="btn btn-sm btn-primary" onclick="App.closeModal();App.showEditStudentModal(${s.id})"><i class="fas fa-edit"></i> Edit Profile</button>
            <button class="btn btn-sm btn-outline" onclick="App.printResultCard(${s.id})"><i class="fas fa-print"></i> Print Grade Sheet</button>
            <button class="btn btn-sm btn-outline" onclick="App.printStudentProfile(${s.id})"><i class="fas fa-id-card"></i> Print Profile</button>
          </div>
        </div>
        <div>
          <div class="card" style="background:var(--card);border-radius:var(--radius);padding:16px 20px;box-shadow:var(--shadow);margin-bottom:16px;">
            <h3 style="font-size:14px;margin-bottom:10px;">Registered Subjects (${regSubjects.length})</h3>
            ${regSubjects.length ? `<div style="display:flex;flex-wrap:wrap;gap:4px;">${regSubjects.map(sb =>
              `<span style="background:var(--primary-light);color:var(--primary);padding:2px 10px;border-radius:12px;font-size:12px;">${sb.code} - ${sb.name}</span>`
            ).join('')}</div>` : '<p class="text-muted" style="font-size:13px;">No subjects registered</p>'}
          </div>
          ${terms.map(t => this._renderTermMarksCard(t.label, t.key, marksAll[t.key], resultAll[t.key])).join('')}
        </div>
      </div>`;
  },

  async renderStudentPromotion() {
    const sRes = await api.getStudents({ session: this.state.session });
    const allStudents = sRes.success ? sRes.data : [];
    document.getElementById('pageContent').innerHTML = `
      <div class="filter-bar">
        <div class="form-group">
          <label>From Class</label>
          <select class="form-control" id="promFromClass" onchange="App.renderPromotionTable()">
            ${_classOpts()}
          </select>
        </div>
        <div class="form-group">
          <label>To Class</label>
          <select class="form-control" id="promToClass" onchange="App.renderPromotionTable()">
            ${_classOpts()}
          </select>
        </div>
        <div class="form-group">
          <label>Faculty</label>
          <select class="form-control" id="promFacultyFilter" onchange="App.renderPromotionTable()">
            <option value="">All</option>
            <option value="Common">Common</option><option value="General">General</option><option value="Technical">Technical</option>
          </select>
        </div>
        <button class="btn btn-success" onclick="App.promoteSelectedStudents()" id="btnPromote"><i class="fas fa-arrow-up"></i> Promote Selected</button>
        <button class="btn btn-outline" onclick="App.promoteAllStudents()"><i class="fas fa-forward"></i> Promote All</button>
      </div>
      <div class="card" style="background:var(--card);border-radius:var(--radius);padding:16px 20px;box-shadow:var(--shadow);margin-bottom:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div>
            <strong>From:</strong> <span id="promFromLabel">Class 11</span> → <strong>To:</strong> <span id="promToLabel">Class 12</span>
          </div>
          <div>
            <label style="font-size:12px;"><input type="checkbox" id="promKeepSession" checked> Keep current session</label>
            <label style="font-size:12px;margin-left:12px;"><input type="checkbox" id="promResetRoll" checked> Reset Roll No</label>
          </div>
        </div>
      </div>
      <div class="table-container">
        <table>
          <thead><tr>
            <th><input type="checkbox" id="selectAllPromStudents" onchange="App.togglePromStudents(this.checked)"></th>
            <th>SN</th><th>Roll</th><th>Name</th><th>Class</th><th>Faculty</th><th>Gender</th><th>Status</th>
          </tr></thead>
          <tbody id="promStudentBody"></tbody>
        </table>
      </div>`;
    this.state._promStudents = allStudents;
    this.renderPromotionTable();
  },

  renderPromotionTable() {
    const fromClass = document.getElementById('promFromClass').value;
    const toClass = document.getElementById('promToClass').value;
    const faculty = document.getElementById('promFacultyFilter').value;
    document.getElementById('promFromLabel').textContent = `Class ${fromClass}`;
    document.getElementById('promToLabel').textContent = `Class ${toClass}`;
    const students = (this.state._promStudents || []).filter(s =>
      s.class === fromClass && (!faculty || s.faculty === faculty)
    );
    this.state._promFiltered = students;
    const tbody = document.getElementById('promStudentBody');
    if (tbody) {
      tbody.innerHTML = students.length ? students.map((s, i) => `
        <tr>
          <td><input type="checkbox" class="prom-select" value="${s.id}"></td>
          <td>${i+1}</td><td>${s.roll_no}</td><td>${s.name}</td>
          <td>${s.class}</td><td>${s.faculty}</td><td>${s.gender || '-'}</td>
          <td><span class="grade-badge grade-OK" style="font-size:11px;">Active</span></td>
        </tr>`).join('') : '<tr><td colspan="8" class="text-center text-muted">No students in this class</td></tr>';
    }
  },

  togglePromStudents(checked) {
    document.querySelectorAll('.prom-select').forEach(cb => cb.checked = checked);
  },

  async promoteSelectedStudents() {
    const ids = [...document.querySelectorAll('.prom-select:checked')].map(cb => parseInt(cb.value));
    if (!ids.length) return this.notify('Select students to promote', 'warning');
    const toClass = document.getElementById('promToClass').value;
    const keepSession = document.getElementById('promKeepSession').checked;
    const resetRoll = document.getElementById('promResetRoll').checked;
    if (!confirm(`Promote ${ids.length} student(s) to Class ${toClass}?`)) return;
    let count = 0;
    for (const id of ids) {
      const sRes = await api.getStudent(id);
      if (!sRes.success) continue;
      const student = sRes.data;
      const data = { ...student };
      data.class = toClass;
      if (resetRoll) data.roll_no = '';
      if (!keepSession) data.session = this.state.session;
      const res = await api.updateStudent(id, data);
      if (res.success) count++;
    }
    this.notify(`${count} student(s) promoted to Class ${toClass}`);
    const sRes = await api.getStudents({ session: this.state.session });
    this.state._promStudents = sRes.success ? sRes.data : [];
    this.renderPromotionTable();
    // Uncheck select all
    const sa = document.getElementById('selectAllPromStudents');
    if (sa) sa.checked = false;
  },

  async promoteAllStudents() {
    const fromClass = document.getElementById('promFromClass').value;
    const toClass = document.getElementById('promToClass').value;
    const faculty = document.getElementById('promFacultyFilter').value;
    const students = (this.state._promStudents || []).filter(s =>
      s.class === fromClass && (!faculty || s.faculty === faculty)
    );
    if (!students.length) return this.notify('No students to promote', 'warning');
    const keepSession = document.getElementById('promKeepSession').checked;
    const resetRoll = document.getElementById('promResetRoll').checked;
    if (!confirm(`Promote all ${students.length} student(s) from Class ${fromClass} to Class ${toClass}?`)) return;
    let count = 0;
    for (const student of students) {
      const data = { ...student };
      data.class = toClass;
      if (resetRoll) data.roll_no = '';
      if (!keepSession) data.session = this.state.session;
      const res = await api.updateStudent(student.id, data);
      if (res.success) count++;
    }
    this.notify(`${count} student(s) promoted to Class ${toClass}`);
    const sRes = await api.getStudents({ session: this.state.session });
    this.state._promStudents = sRes.success ? sRes.data : [];
    this.renderPromotionTable();
  },

  async renderIDCard() {
    const sRes = await api.getStudents({ session: this.state.session });
    const allStudents = sRes.success ? sRes.data : [];
    const school = this.state.school;
    document.getElementById('pageContent').innerHTML = `
      <div class="filter-bar">
        <div class="form-group">
          <label>Class</label>
          <select class="form-control" id="idcClassFilter" onchange="App.renderIDCardTable()">
            ${_classOptsAll()}
          </select>
        </div>
        <div class="form-group">
          <label>Faculty</label>
          <select class="form-control" id="idcFacultyFilter" onchange="App.renderIDCardTable()">
            <option value="">All</option><option value="Common">Common</option><option value="General">General</option><option value="Technical">Technical</option>
          </select>
        </div>
        <div class="form-group">
          <label>Search</label>
          <input type="text" class="form-control" id="idcSearch" placeholder="Name or Roll..." oninput="App.renderIDCardTable()">
        </div>
        <button class="btn btn-outline" onclick="App.previewAllIDCards()"><i class="fas fa-eye"></i> Preview All</button>
        <button class="btn btn-primary" onclick="App.printAllIDCards()"><i class="fas fa-print"></i> Print All</button>
      </div>
      <div class="table-container">
        <table>
          <thead><tr>
            <th>SN</th><th>Roll</th><th>Name</th><th>Class</th><th>Faculty</th><th>Photo</th><th>Action</th>
          </tr></thead>
          <tbody id="idcStudentBody"></tbody>
        </table>
      </div>`;
    this.state._idcStudents = allStudents;
    this.renderIDCardTable();
  },

  renderIDCardTable() {
    const cls = document.getElementById('idcClassFilter').value;
    const faculty = document.getElementById('idcFacultyFilter').value;
    const search = document.getElementById('idcSearch').value.toLowerCase();
    const students = (this.state._idcStudents || []).filter(s =>
      (!cls || s.class === cls) && (!faculty || s.faculty === faculty) &&
      (!search || s.name.toLowerCase().includes(search) || s.roll_no.includes(search))
    );
    const tbody = document.getElementById('idcStudentBody');
    if (tbody) {
      tbody.innerHTML = students.length ? students.map((s, i) => `
        <tr>
          <td>${i+1}</td><td>${s.roll_no}</td><td>${s.name}</td>
          <td>${s.class}</td><td>${s.faculty}</td>
          <td>${s.photo_path ? `<img src="${s.photo_path}" style="width:35px;height:40px;border-radius:4px;object-fit:cover;">` : '<span class="text-muted">—</span>'}</td>
          <td>
            <button class="btn btn-sm btn-primary" onclick="App.previewIDCard(${s.id})"><i class="fas fa-eye"></i> View</button>
            <button class="btn btn-sm btn-outline" onclick="App.printSingleIDCard(${s.id})"><i class="fas fa-print"></i></button>
          </td>
        </tr>`).join('') : '<tr><td colspan="7" class="text-center text-muted">No students found</td></tr>';
    }
  },

  previewIDCard(studentId) {
    const student = (this.state._idcStudents || []).find(s => s.id == studentId);
    if (!student) return;
    const school = this.state.school;
    const logo = school.school_logo ? school.school_logo : '';
    this.showModal(`
      <h3>ID Card Preview — ${student.name}</h3>
      <div style="display:flex;justify-content:center;padding:12px 0;">
        <div style="width:88mm;border:3px double #000;border-radius:10px;padding:14px 16px;font-family:'Times New Roman',serif;background:#fff;box-shadow:0 4px 12px rgba(0,0,0,0.15);">
          <div style="display:flex;align-items:center;gap:10px;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:8px;">
            ${logo ? `<img src="${logo}" style="height:38px;flex-shrink:0;">` : ''}
            <div style="flex:1;text-align:center;">
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;line-height:1.3;">${school.school_name || 'School Name'}</div>
              <div style="font-size:8px;color:#555;">${school.municipality||''}${school.municipality&&school.district?', ':''}${school.district||''}</div>
            </div>
          </div>
          <div style="display:flex;gap:12px;">
            <div style="width:75px;height:90px;border:2px solid #333;border-radius:6px;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:#f0f0f0;">
              ${student.photo_path ? `<img src="${student.photo_path}" style="width:100%;height:100%;object-fit:cover;">` : '<span style="font-size:9px;color:#999;">Photo</span>'}
            </div>
            <div style="flex:1;font-size:10px;">
              <div style="font-size:14px;font-weight:700;margin-bottom:6px;">${student.name}</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 8px;">
                <span><strong>Roll:</strong> ${student.roll_no}</span>
                <span><strong>Class:</strong> ${student.class}</span>
                <span><strong>Faculty:</strong> ${student.faculty}</span>
                <span><strong>SYM:</strong> ${student.sym||'-'}</span>
                <span><strong>REG:</strong> ${student.reg||'-'}</span>
                <span><strong>Session:</strong> ${this.state.session}</span>
              </div>
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:10px;padding-top:6px;border-top:1px solid #000;font-size:8px;">
            <div style="text-align:center;"><div style="border-top:1px solid #000;width:55px;margin-top:15px;padding-top:2px;">Principal</div></div>
            <div style="text-align:center;"><div style="border-top:1px solid #000;width:55px;margin-top:15px;padding-top:2px;">Class Teacher</div></div>
          </div>
          <div style="font-size:7px;color:#666;text-align:center;margin-top:6px;">This ID card is the property of the school. If found, please return to the school office.</div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="App.closeModal();App.printSingleIDCard(${student.id})"><i class="fas fa-print"></i> Print</button>
        <button class="btn btn-outline" onclick="App.closeModal()">Close</button>
      </div>`);
  },

  async printSingleIDCard(studentId) {
    const student = (this.state._idcStudents || []).find(s => s.id == studentId);
    if (!student) return this.notify('Student not found', 'error');
    const school = this.state.school;
    const logo = school.school_logo ? school.school_logo : '';
    const cardHtml = this._buildIDCardHtml(student, school, logo);
    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>ID Card - ${student.name}</title>
      <style>
        @page { size: A4; margin: 5mm; }
        body { font-family: 'Times New Roman', serif; margin:0; padding:0; }
        .page { display:flex; flex-wrap:wrap; justify-content:center; align-items:center; min-height:100vh; gap:8mm; padding:5mm; }
        .id-card { width:88mm; border:3px double #000; border-radius:10px; padding:14px 16px; background:#fff; }
        .id-card .head { display:flex; align-items:center; gap:10px; border-bottom:2px solid #000; padding-bottom:8px; margin-bottom:8px; }
        .id-card .head .logo-img { height:38px; flex-shrink:0; }
        .id-card .head .head-text { flex:1; text-align:center; }
        .id-card .head .head-text .sname { font-size:11px; font-weight:700; text-transform:uppercase; line-height:1.3; }
        .id-card .head .head-text .addr { font-size:8px; color:#555; }
        .id-card .body { display:flex; gap:12px; }
        .id-card .body .photo { width:75px; height:90px; border:2px solid #333; border-radius:6px; overflow:hidden; flex-shrink:0; display:flex; align-items:center; justify-content:center; background:#f0f0f0; }
        .id-card .body .photo img { width:100%; height:100%; object-fit:cover; }
        .id-card .body .info { flex:1; font-size:10px; }
        .id-card .body .info .sname-lg { font-size:14px; font-weight:700; margin-bottom:6px; }
        .id-card .body .info .grid { display:grid; grid-template-columns:1fr 1fr; gap:3px 8px; }
        .id-card .body .info .grid span { font-size:10px; }
        .id-card .footer { display:flex; justify-content:space-between; margin-top:10px; padding-top:6px; border-top:1px solid #000; font-size:8px; }
        .id-card .footer .sign-line { border-top:1px solid #000; width:55px; margin-top:15px; padding-top:2px; text-align:center; }
        .id-card .note { font-size:7px; color:#666; text-align:center; margin-top:6px; }
      </style></head><body>
        <div class="page">${cardHtml}</div>
        <script>window.onload = function() { window.print(); window.close(); }</script>
      </body></html>`);
    win.document.close();
  },

  _filteredIDCStudents() {
    const cls = document.getElementById('idcClassFilter')?.value || '';
    const faculty = document.getElementById('idcFacultyFilter')?.value || '';
    const search = (document.getElementById('idcSearch')?.value || '').toLowerCase();
    return (this.state._idcStudents || []).filter(s =>
      (!cls || s.class === cls) && (!faculty || s.faculty === faculty) &&
      (!search || s.name.toLowerCase().includes(search) || s.roll_no.includes(search))
    );
  },

  async printAllIDCards() {
    const students = this._filteredIDCStudents();
    if (!students.length) return this.notify('No students match filters', 'warning');
    const school = this.state.school;
    const logo = school.school_logo ? school.school_logo : '';
    const cards = students.map(s => this._buildCompactIDCardHtml(s, school, logo));
    this._printIDCardsPage(cards);
  },

  previewAllIDCards() {
    const students = this._filteredIDCStudents();
    if (!students.length) return this.notify('No students match filters', 'warning');
    const school = this.state.school;
    const logo = school.school_logo ? school.school_logo : '';
    const cardsHtml = students.map(s => this._buildCompactIDCardHtml(s, school, logo)).join('');
    this.showModal(`
      <style>
        .idc-grid { display:grid; grid-template-columns:repeat(3,53.98mm); gap:4mm; max-height:70vh; overflow-y:auto; padding:4px; justify-content:center; }
        .idc-grid .id-card { width:53.98mm; height:85.60mm; border:1.5px solid #1a3a5c; border-radius:4px; background:linear-gradient(180deg,#f8fbff,#fff); text-align:center; display:flex; flex-direction:column; overflow:hidden; margin:0 auto; }
        .idc-grid .id-card .head { display:flex; align-items:center; gap:3px; border-bottom:1.5px solid #1a3a5c; text-align:center; background:#eef3f9; padding:3px 4px; flex-shrink:0; }
        .idc-grid .id-card .head .logo-img { height:14px; flex-shrink:0; }
        .idc-grid .id-card .head .head-text { flex:1; }
        .idc-grid .id-card .head .head-text .sname { font-size:6px; font-weight:700; text-transform:uppercase; line-height:1.15; color:#1a3a5c; }
        .idc-grid .id-card .head .head-text .addr { font-size:4.5px; color:#666; line-height:1.1; }
        .idc-grid .id-card .photo { width:28mm; height:33mm; border:1.5px solid #1a3a5c; border-radius:3px; overflow:hidden; display:flex; align-items:center; justify-content:center; background:#f5f5f5; margin:2mm auto 1mm; flex-shrink:0; }
        .idc-grid .id-card .photo img { width:100%; height:100%; object-fit:cover; }
        .idc-grid .id-card .photo span { font-size:6px; color:#999; }
        .idc-grid .id-card .info { flex:1; font-size:5.5px; padding:0 3px; display:flex; flex-direction:column; justify-content:center; }
        .idc-grid .id-card .info .sname-lg { font-size:7.5px; font-weight:700; color:#1a3a5c; margin-bottom:1px; line-height:1.15; }
        .idc-grid .id-card .info .grid { display:grid; grid-template-columns:1fr 1fr; gap:0 3px; text-align:left; font-size:5.5px; }
        .idc-grid .id-card .info .grid span { font-size:5.5px; line-height:1.4; }
        .idc-grid .id-card .footer { display:flex; justify-content:space-around; border-top:1px solid #1a3a5c; font-size:5px; color:#444; padding:1.5mm 2mm 0; flex-shrink:0; }
        .idc-grid .id-card .footer .sign-line { border-top:1px solid #333; width:18mm; margin-top:3mm; padding-top:0.5mm; text-align:center; }
        .idc-grid .id-card .note { font-size:4px; color:#888; text-align:center; padding:0.5mm 2mm; flex-shrink:0; font-style:italic; }
      </style>
      <h3>All ID Cards (${students.length})</h3>
      <div class="idc-grid">
        ${cardsHtml}
      </div>
      <div class="modal-actions" style="margin-top:8px;">
        <button class="btn btn-primary" onclick="App.closeModal();App.printAllIDCards()"><i class="fas fa-print"></i> Print All</button>
        <button class="btn btn-outline" onclick="App.closeModal()">Close</button>
      </div>`);
  },

  _buildIDCardHtml(student, school, logo) {
    return `<div class="id-card">
      <div class="head">
        ${logo ? `<img src="${logo}" class="logo-img">` : ''}
        <div class="head-text">
          <div class="sname">${school.school_name || 'School Name'}</div>
          <div class="addr">${school.municipality||''}${school.municipality&&school.district?', ':''}${school.district||''}</div>
        </div>
      </div>
      <div class="body">
        <div class="photo">${student.photo_path ? `<img src="${student.photo_path}">` : '<span style="font-size:9px;color:#999;">Photo</span>'}</div>
        <div class="info">
          <div class="sname-lg">${student.name}</div>
          <div class="grid">
            <span><strong>Roll:</strong> ${student.roll_no}</span>
            <span><strong>Class:</strong> ${student.class}</span>
            <span><strong>Faculty:</strong> ${student.faculty}</span>
            <span><strong>SYM:</strong> ${student.sym||'-'}</span>
            <span><strong>REG:</strong> ${student.reg||'-'}</span>
            <span><strong>Session:</strong> ${this.state.session}</span>
          </div>
        </div>
      </div>
      <div class="footer">
        <div style="text-align:center;"><div class="sign-line">Principal</div></div>
        <div style="text-align:center;"><div class="sign-line">Class Teacher</div></div>
      </div>
      <div class="note">This ID card is the property of the school. If found, please return to the school office.</div>
    </div>`;
  },

  _buildCompactIDCardHtml(s, school, logo) {
    return `<div class="id-card">
      <div class="head">
        ${logo ? `<img src="${logo}" class="logo-img">` : ''}
        <div class="head-text">
          <div class="sname">${school.school_name || 'School Name'}</div>
          <div class="addr">${school.municipality||''}${school.municipality&&school.district?', ':''}${school.district||''}</div>
        </div>
      </div>
      <div class="photo">${s.photo_path ? `<img src="${s.photo_path}">` : '<span style="font-size:6px;color:#999;">Photo</span>'}</div>
      <div class="info">
        <div class="sname-lg">${s.name}</div>
        <div class="grid">
          <span><strong>Roll:</strong> ${s.roll_no}</span>
          <span><strong>Class:</strong> ${s.class}</span>
          <span><strong>Faculty:</strong> ${s.faculty}</span>
          <span><strong>SYM:</strong> ${s.sym||'-'}</span>
          <span><strong>REG:</strong> ${s.reg||'-'}</span>
          <span><strong>Session:</strong> ${this.state.session}</span>
        </div>
      </div>
      <div class="footer">
        <div><div class="sign-line">Principal</div></div>
        <div><div class="sign-line">Class Teacher</div></div>
      </div>
      <div class="note">This ID card is the property of the school. If found, please return to the school office.</div>
    </div>`;
  },

  _printIDCardsPage(cardsHtml) {
    const perPage = 9;
    const pages = [];
    for (let i = 0; i < cardsHtml.length; i += perPage) {
      pages.push(cardsHtml.slice(i, i + perPage).join(''));
    }
    const win = window.open('', '_blank');
    if (!win) return this.notify('Popup blocked. Please allow popups.', 'error');
    win.document.write(`
      <html><head><title>ID Cards - ${this.state.session}</title>
      <style>
        @page { size: A4; margin: 0; }
        body { font-family: 'Times New Roman', serif; margin:0; padding:0; }
        .page { page-break-after:always; display:grid; grid-template-columns:repeat(3,53.98mm); gap:4mm; justify-content:center; align-content:center; min-height:297mm; padding:6mm; box-sizing:border-box; }
        .page:last-child { page-break-after:auto; }
        .id-card { width:53.98mm; height:85.60mm; border:1.5px solid #1a3a5c; border-radius:4px; background:linear-gradient(180deg,#f8fbff,#fff); page-break-inside:avoid; text-align:center; display:flex; flex-direction:column; overflow:hidden; }
        .id-card .head { display:flex; align-items:center; gap:3px; border-bottom:1.5px solid #1a3a5c; text-align:center; background:#eef3f9; padding:3px 4px; flex-shrink:0; }
        .id-card .head .logo-img { height:14px; flex-shrink:0; }
        .id-card .head .head-text { flex:1; }
        .id-card .head .head-text .sname { font-size:6px; font-weight:700; text-transform:uppercase; line-height:1.15; color:#1a3a5c; }
        .id-card .head .head-text .addr { font-size:4.5px; color:#666; line-height:1.1; }
        .id-card .photo { width:28mm; height:33mm; border:1.5px solid #1a3a5c; border-radius:3px; overflow:hidden; display:flex; align-items:center; justify-content:center; background:#f5f5f5; margin:2mm auto 1mm; flex-shrink:0; }
        .id-card .photo img { width:100%; height:100%; object-fit:cover; }
        .id-card .photo span { font-size:6px; color:#999; }
        .id-card .info { flex:1; font-size:5.5px; padding:0 3px; display:flex; flex-direction:column; justify-content:center; }
        .id-card .info .sname-lg { font-size:7.5px; font-weight:700; color:#1a3a5c; margin-bottom:1px; line-height:1.15; }
        .id-card .info .grid { display:grid; grid-template-columns:1fr 1fr; gap:0 3px; text-align:left; font-size:5.5px; }
        .id-card .info .grid span { font-size:5.5px; line-height:1.4; }
        .id-card .footer { display:flex; justify-content:space-around; border-top:1px solid #1a3a5c; font-size:5px; color:#444; padding:1.5mm 2mm 0; flex-shrink:0; }
        .id-card .footer .sign-line { border-top:1px solid #333; width:18mm; margin-top:3mm; padding-top:0.5mm; text-align:center; }
        .id-card .note { font-size:4px; color:#888; text-align:center; padding:0.5mm 2mm; flex-shrink:0; font-style:italic; }
      </style></head><body>
        ${pages.map(p => `<div class="page">${p}</div>`).join('')}
        <script>window.onload = function() { window.print(); window.close(); }</script>
      </body></html>`);
    win.document.close();
  },

  async renderTransferCertificate() {
    const sRes = await api.getStudents({ session: this.state.session });
    const students = sRes.success ? sRes.data : [];
    this.state._tcStudents = students;
    document.getElementById('pageContent').innerHTML = `
      <div class="filter-bar">
        <div class="form-group"><label>Class</label>
          <select class="form-control" id="tcClass" onchange="App.renderTCTable()">
            ${_classOptsAll()}
          </select>
        </div>
        <div class="form-group"><label>Faculty</label>
          <select class="form-control" id="tcFaculty" onchange="App.renderTCTable()">
            <option value="">All</option><option value="Common">Common</option><option value="General">General</option><option value="Technical">Technical</option>
          </select>
        </div>
        <div class="form-group"><label>Search</label>
          <input class="form-control" id="tcSearch" placeholder="Name or Roll..." oninput="App.renderTCTable()">
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-outline" onclick="App.previewAllTC()"><i class="fas fa-eye"></i> Preview All TC</button>
          <button class="btn btn-primary" onclick="App.printAllTC()"><i class="fas fa-print"></i> Print All TC</button>
        </div>
      </div>
      <div class="table-container" id="tcTableContainer"></div>
      <div id="tcContent" style="max-width:850px;margin:0 auto;margin-top:16px;"></div>`;
    this.renderTCTable();
  },

  renderTCTable() {
    const cls = document.getElementById('tcClass')?.value || '';
    const faculty = document.getElementById('tcFaculty')?.value || '';
    const search = (document.getElementById('tcSearch')?.value || '').toLowerCase();
    let students = this.state._tcStudents || [];
    if (cls) students = students.filter(s => s.class === cls);
    if (faculty) students = students.filter(s => s.faculty === faculty);
    if (search) students = students.filter(s => s.name.toLowerCase().includes(search) || s.roll_no?.toString().includes(search));
    this.state._tcFiltered = students;
    document.getElementById('tcTableContainer').innerHTML = `
      <table class="table">
        <thead><tr><th>SN</th><th>Roll</th><th>Name</th><th>Class</th><th>Faculty</th><th>Action</th></tr></thead>
        <tbody>${students.length ? students.map((s, i) =>
          `<tr>
            <td>${i+1}</td>
            <td>${s.roll_no || '-'}</td>
            <td>${s.name}</td>
            <td>${s.class || '-'}</td>
            <td>${s.faculty || '-'}</td>
            <td>
              <button class="btn btn-sm btn-outline-primary" onclick="App.loadTCDetails('${s.id}', 'view')"><i class="fas fa-eye"></i> View</button>
              <button class="btn btn-sm btn-outline-secondary" onclick="App.loadTCDetails('${s.id}', 'edit')"><i class="fas fa-edit"></i> Edit</button>
            </td>
          </tr>`
        ).join('') : '<tr><td colspan="6" class="text-center text-muted">No students found</td></tr>'}
        </tbody>
      </table>`;
    document.getElementById('tcContent').innerHTML = '';
  },

  async loadTCDetails(studentId, mode) {
    const sRes = await api.getStudent(studentId);
    const s = sRes.success ? sRes.data : null;
    if (!s) return this.notify('Student not found', 'error');
    this.state._tcCurrentStudent = s;
    const today = new Date().toISOString().split('T')[0];
    const isView = mode === 'view';
    const photoHtml = s.photo_path ? `<img src="${s.photo_path}" style="width:50px;height:60px;border-radius:6px;object-fit:cover;border:2px solid #1a3a5c;">` : `<div style="width:50px;height:60px;border-radius:6px;border:2px dashed #ccc;display:flex;align-items:center;justify-content:center;font-size:9px;color:#999;">No<br>Photo</div>`;
    this.showModal(`
      <div style="min-width:680px;font-family:'Times New Roman',serif;">
        <div style="display:flex;align-items:center;gap:14px;background:linear-gradient(135deg,#eef3f9,#fff);border:1px solid #d0dce8;border-radius:8px;padding:12px 16px;margin-bottom:12px;">
          ${photoHtml}
          <div style="flex:1;">
            <div style="font-size:16px;font-weight:700;color:#1a3a5c;">${s.name}</div>
            <div style="display:flex;gap:16px;margin-top:3px;font-size:11px;color:#555;">
              <span><strong>Roll:</strong> ${s.roll_no}</span>
              <span><strong>Class:</strong> ${s.class}</span>
              <span><strong>Faculty:</strong> ${s.faculty || '-'}</span>
              <span><strong>Father:</strong> ${s.father_name || '-'}</span>
            </div>
          </div>
          <button class="btn btn-sm btn-primary" onclick="App.printTCModel()" style="background:#1a3a5c;white-space:nowrap;"><i class="fas fa-print"></i> Print</button>
        </div>
        ${isView ? `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;background:#fafbfc;border:1px solid #e8ecf0;border-radius:6px;padding:10px 14px;margin-bottom:10px;font-size:11px;color:#444;">
          <span><strong>Issue Date:</strong> ${today}</span>
          <span><strong>Conduct:</strong> Good</span>
          <span><strong>Leaving Class:</strong> ${s.class}</span>
          <span><strong>Reason:</strong> Transfer to another institution</span>
        </div>
        ` : `
        <div style="background:#fafbfc;border:1px solid #e8ecf0;border-radius:6px;padding:12px 14px;margin-bottom:10px;">
          <div style="font-size:12px;font-weight:600;color:#1a3a5c;margin-bottom:8px;border-bottom:1px solid #d0dce8;padding-bottom:6px;"><i class="fas fa-cog"></i> TC Settings</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div class="form-group"><label style="font-size:11px;font-weight:600;color:#333;">Issue Date</label><input class="form-control" id="tcDate" type="date" value="${today}"></div>
            <div class="form-group"><label style="font-size:11px;font-weight:600;color:#333;">Date of Leaving (BS)</label><input class="form-control" id="tcLeaveDate" placeholder="YYYY-MM-DD"></div>
            <div class="form-group"><label style="font-size:11px;font-weight:600;color:#333;">Leaving Class</label>
              <select class="form-control" id="tcLeaveClass">${_classOpts()}</select>
            </div>
            <div class="form-group"><label style="font-size:11px;font-weight:600;color:#333;">Conduct</label>
              <select class="form-control" id="tcConduct" style="color:#1a3a5c;font-weight:500;">
                <option value="Excellent">Excellent</option><option value="Very Good">Very Good</option>
                <option value="Good" selected>Good</option><option value="Satisfactory">Satisfactory</option>
              </select>
            </div>
            <div class="form-group" style="grid-column:1/-1;"><label style="font-size:11px;font-weight:600;color:#333;">Reason for Leaving</label>
              <textarea class="form-control" id="tcReason" rows="2">Transfer to another institution</textarea>
            </div>
            <div class="form-group" style="grid-column:1/-1;"><label style="font-size:11px;font-weight:600;color:#333;">Remarks</label>
              <textarea class="form-control" id="tcRemarks" rows="2">Cleared all dues. Eligible for TC.</textarea>
            </div>
          </div>
          <button class="btn btn-outline-primary btn-sm" onclick="App.previewTCModel('${s.id}')" style="margin-top:8px;border-color:#1a3a5c;color:#1a3a5c;"><i class="fas fa-eye"></i> Preview TC</button>
        </div>
        `}
        <div id="tcPreviewModal" style="margin-top:8px;">${isView ? '<p class="text-muted" style="text-align:center;padding:20px;font-size:13px;">Generating preview...</p>' : '<p class="text-muted" style="text-align:center;padding:20px;font-size:13px;">Set options and click Preview</p>'}</div>
      </div>`);
    if (isView) await this.previewTCModel(s.id);
  },

  _buildTCHtml(s, date, leaveDate, leaveClass, reason, conduct, remarks) {
    const school = this.state.school || {};
    const schoolName = school.school_name || 'School Name';
    const schoolAddress = [school.municipality, school.district].filter(Boolean).join(', ');
    const schoolPhone = school.phone || '';
    const logo = school.school_logo || '';
    const { year, month, day } = this.parseDate(date);
    const formattedDate = `${year}-${month}-${day}`;
    const gender = s.gender === 'Female' ? 'she' : s.gender === 'Other' ? 'they' : 'he';
    const gender2 = s.gender === 'Female' ? 'her' : s.gender === 'Other' ? 'their' : 'him';
    const genderTitle = s.gender === 'Female' ? 'Ms.' : s.gender === 'Other' ? 'Mx.' : 'Mr.';
    return `<div class="tc-cert">
      <div class="tc-border-ornament">
        <div class="tc-corner tl"></div><div class="tc-corner tr"></div>
        <div class="tc-corner bl"></div><div class="tc-corner br"></div>
      </div>
      <div class="tc-header">
        ${logo ? `<img src="${logo}" class="tc-logo">` : ''}
        <div class="tc-header-text">
          <div class="tc-school-name">${schoolName}</div>
          <div class="tc-school-addr">${schoolAddress}${schoolPhone ? ' | Phone: '+schoolPhone : ''}</div>
        </div>
      </div>
      <div class="tc-divider"><span class="tc-diamond">&#9670;</span></div>
      <div class="tc-title">Transfer Certificate</div>
      <div class="tc-divider"><span class="tc-diamond">&#9670;</span></div>
      <div class="tc-date">Date: ${formattedDate}</div>
      <div class="tc-body">
        <p>This is to certify that <strong>${genderTitle} ${s.name}</strong>, ${s.gender === 'Female' ? 'daughter' : 'son'} of <strong>${s.father_name || 'Mr. ...'}</strong> and <strong>${s.mother_name || 'Mrs. ...'}</strong>, was a bonafide student of this institution. ${gender2.charAt(0).toUpperCase() + gender2.slice(1)} was enrolled in <strong>Class ${s.class || '...'}${s.faculty ? ' ('+s.faculty+')' : ''}</strong> bearing Roll Number <strong>${s.roll_no || '...'}</strong>${s.sym ? ', Symbol No <strong>'+s.sym+'</strong>' : ''}${s.reg ? ', Registration No <strong>'+s.reg+'</strong>' : ''} during the academic session <strong>${this.state.session}</strong>.</p>
        <p>According to the school record, ${gender} date of birth is <strong>${s.dob_bs || '...'}</strong> (BS) / <strong>${s.dob ? s.dob.split('T')[0] : '...'}</strong> (AD).</p>
        <p>${gender2.charAt(0).toUpperCase() + gender2.slice(1)} left the school on <strong>${leaveDate || '___________'}</strong> from Class <strong>${leaveClass}</strong> due to <strong>${reason}</strong>.</p>
        <p>During ${gender} stay, ${gender} bore a <strong>${conduct}</strong> moral character and was found to be hardworking, disciplined, and sincere. ${remarks}</p>
        <p>Certified that all school dues have been cleared and ${gender} is hereby issued this Transfer Certificate for further studies. We wish ${gender2} all the best for ${gender} future endeavors.</p>
      </div>
      <div class="tc-signatures">
        <div class="tc-sign"><div class="tc-sign-line"></div><strong>Class Teacher</strong></div>
        <div class="tc-sign"><div class="tc-sign-line"></div><strong>Principal</strong></div>
      </div>
      <div class="tc-stamp"><div class="tc-sign-line" style="margin:0 auto;"></div><strong>School Stamp</strong></div>
      <div class="tc-footer">TC No: ___________ &nbsp;|&nbsp; Date: ${formattedDate}</div>
    </div>`;
  },

  _tcCertStyle() {
    return `
      .tc-cert{position:relative;background:#fff;padding:35px 40px 30px;text-align:center;border:3px double #1a3a5c;border-radius:6px;box-shadow:0 4px 20px rgba(26,58,92,0.1);}
      .tc-border-ornament{position:absolute;top:8px;left:8px;right:8px;bottom:8px;pointer-events:none;border:1px solid #c9a84c;border-radius:4px;}
      .tc-corner{position:absolute;width:16px;height:16px;border-color:#c9a84c;border-style:solid;}
      .tc-corner.tl{top:-1px;left:-1px;border-width:2px 0 0 2px;}
      .tc-corner.tr{top:-1px;right:-1px;border-width:2px 2px 0 0;}
      .tc-corner.bl{bottom:-1px;left:-1px;border-width:0 0 2px 2px;}
      .tc-corner.br{bottom:-1px;right:-1px;border-width:0 2px 2px 0;}
      .tc-header{display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:6px;}
      .tc-logo{height:50px;}
      .tc-header-text{text-align:center;}
      .tc-school-name{font-size:20px;font-weight:700;text-transform:uppercase;color:#1a3a5c;letter-spacing:0.5px;}
      .tc-school-addr{font-size:11px;color:#666;margin-top:2px;}
      .tc-divider{display:flex;align-items:center;justify-content:center;gap:10px;margin:8px 0;color:#c9a84c;font-size:14px;}
      .tc-divider::before,.tc-divider::after{content:'';flex:1;height:1.5px;background:linear-gradient(90deg,transparent,#c9a84c,transparent);}
      .tc-diamond{color:#c9a84c;}
      .tc-title{font-size:18px;font-weight:700;text-transform:uppercase;color:#1a3a5c;letter-spacing:2px;margin:6px 0;}
      .tc-date{text-align:right;font-size:11px;color:#555;margin-bottom:10px;}
      .tc-body{text-align:justify;font-size:12.5px;line-height:1.8;padding:0 5px;}
      .tc-body p{margin:6px 0;text-indent:25px;}
      .tc-body strong{color:#1a3a5c;}
      .tc-signatures{display:flex;justify-content:space-between;margin-top:30px;padding:0 15px;font-size:11px;}
      .tc-sign{text-align:center;width:140px;}
      .tc-sign-line{border-top:1px solid #333;width:130px;margin:28px auto 4px;}
      .tc-stamp{text-align:center;margin-top:8px;font-size:11px;}
      .tc-stamp .tc-sign-line{width:120px;margin:28px auto 4px;}
      .tc-footer{text-align:center;margin-top:12px;font-size:9px;color:#999;}
      .tc-page-break{page-break-after:always;}
      .tc-cert-wrapper{max-width:800px;margin:20px auto;}`;
  },

  async previewTCModel(studentId) {
    const sRes = await api.getStudent(studentId);
    const s = sRes.success ? sRes.data : null;
    if (!s) return this.notify('Student not found', 'error');
    const date = document.getElementById('tcDate')?.value || new Date().toISOString().split('T')[0];
    const leaveDate = document.getElementById('tcLeaveDate')?.value || '';
    const leaveClass = document.getElementById('tcLeaveClass')?.value || s.class;
    const reason = document.getElementById('tcReason')?.value || 'Transfer to another institution';
    const conduct = document.getElementById('tcConduct')?.value || 'Good';
    const remarks = document.getElementById('tcRemarks')?.value || '';
    const el = document.getElementById('tcPreviewModal');
    if (!el) return;
    el.innerHTML = `<div id="tcCertInner" class="tc-cert-wrapper">${this._buildTCHtml(s, date, leaveDate, leaveClass, reason, conduct, remarks)}</div>`;
  },

  async _printTC(students, title) {
    const school = this.state.school || {};
    const logo = school.school_logo || '';
    const date = new Date().toISOString().split('T')[0];
    const bodyHtml = students.map(s => {
      const leaveClass = s.class;
      const reason = 'Transfer to another institution';
      const conduct = 'Good';
      return this._buildTCHtml(s, date, '', leaveClass, reason, conduct, '');
    }).join('<div class="tc-page-break"></div>');
    const win = window.open('', '_blank');
    if (!win) return this.notify('Popup blocked', 'error');
    win.document.write(`<html><head><title>${title}</title>
      <style>
        @page{size:A4;margin:12mm;}
        body{font-family:'Times New Roman',serif;margin:0;padding:0;background:#f5f5f5;}
        ${this._tcCertStyle()}
      </style></head><body>${bodyHtml}</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 400);
  },

  printTCModel() {
    const s = this.state._tcCurrentStudent;
    if (!s) return this.notify('Student data not found', 'error');
    const date = document.getElementById('tcDate')?.value || new Date().toISOString().split('T')[0];
    const leaveDate = document.getElementById('tcLeaveDate')?.value || '';
    const leaveClass = document.getElementById('tcLeaveClass')?.value || s.class;
    const reason = document.getElementById('tcReason')?.value || 'Transfer to another institution';
    const conduct = document.getElementById('tcConduct')?.value || 'Good';
    const remarks = document.getElementById('tcRemarks')?.value || '';
    const html = this._buildTCHtml(s, date, leaveDate, leaveClass, reason, conduct, remarks);
    const win = window.open('', '_blank');
    if (!win) return this.notify('Popup blocked', 'error');
    win.document.write(`<html><head><title>Transfer Certificate</title>
      <style>
        @page{size:A4;margin:12mm;}
        body{font-family:'Times New Roman',serif;margin:0;padding:0;background:#f5f5f5;}
        .tc-cert{max-width:800px;margin:20px auto;}
        ${this._tcCertStyle()}
      </style></head><body>${html}</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 400);
  },

  async previewAllTC() {
    const students = this.state._tcFiltered || [];
    if (!students.length) return this.notify('No students match filters', 'warning');
    const date = new Date().toISOString().split('T')[0];
    const cardsHtml = students.map(s => {
      const leaveClass = s.class;
      return this._buildTCHtml(s, date, '', leaveClass, 'Transfer to another institution', 'Good', '');
    }).join('<hr style="margin:20px 0;border:1px dashed #ccc;">');
    this.showModal(`
      <style>
        ${this._tcCertStyle()}
        .tc-cert{margin-bottom:12px;}
      </style>
      <h3>All Transfer Certificates (${students.length})</h3>
      <div style="max-height:70vh;overflow-y:auto;padding:8px;">
        ${cardsHtml}
      </div>
      <div class="modal-actions" style="margin-top:8px;">
        <button class="btn btn-primary" onclick="App.closeModal();App.printAllTC()"><i class="fas fa-print"></i> Print All TC</button>
        <button class="btn btn-outline" onclick="App.closeModal()">Close</button>
      </div>`);
  },

  async printAllTC() {
    const students = this.state._tcFiltered || [];
    if (!students.length) return this.notify('No students match filters', 'warning');
    await this._printTC(students, 'Transfer Certificates');
  },

  /* ======= Teacher Registration ======= */

  async renderTeacherRegistration() {
    const tRes = await api.getTeachers({});
    const teachers = tRes.success ? tRes.data : [];
    this.state._teachers = teachers;
    const pageContent = document.getElementById('pageContent');
    pageContent.innerHTML = `
      <div class="filter-bar">
        <div class="form-group">
          <label>Search</label>
          <input type="text" class="form-control" id="teacherSearch" placeholder="Name, phone or subject..." oninput="App.renderTeacherTable()">
        </div>
        <button class="btn btn-primary" onclick="App.showAddTeacherModal()"><i class="fas fa-plus"></i> Add Teacher</button>
      </div>
      <div class="table-container">
        <table>
          <thead><tr>
            <th><input type="checkbox" id="selectAllTeachers" onchange="App.toggleTeacherSelect(this.checked)"></th>
            <th>SN</th><th>Name</th><th>Qualification</th><th>Subject</th><th>Phone</th><th>Email</th><th>Gender</th><th>Action</th>
          </tr></thead>
          <tbody id="teacherTableBody"></tbody>
        </table>
      </div>
      <div style="margin-top:10px;">
        <button class="btn btn-sm btn-danger" onclick="App.deleteSelectedTeachers()"><i class="fas fa-trash"></i> Delete Selected</button>
      </div>
      <div id="teacherPagination" style="margin-top:12px;"></div>`;
    this.state._teacherPage = 1;
    this.state._teacherRowsPerPage = this.state.teacherRowsPerPage || 25;
    this.state._teacherSortCol = 'name';
    this.state._teacherSortDir = 'asc';
    this.renderTeacherTable();
  },

  renderTeacherTable() {
    const search = document.getElementById('teacherSearch')?.value?.toLowerCase() || '';
    let teachers = this.state._teachers || [];
    if (search) {
      teachers = teachers.filter(t =>
        t.name.toLowerCase().includes(search) ||
        (t.phone || '').includes(search) ||
        (t.subject || '').toLowerCase().includes(search)
      );
    }
    this.state._teacherFiltered = teachers;
    const page = this.state._teacherPage || 1;
    const rpp = this.state._teacherRowsPerPage || 25;
    const total = teachers.length;
    const totalPages = Math.ceil(total / rpp) || 1;
    const start = (page - 1) * rpp;
    const pageData = teachers.slice(start, start + rpp);
    const tbody = document.getElementById('teacherTableBody');
    if (tbody) {
      tbody.innerHTML = pageData.length ? pageData.map((t, i) => `
        <tr>
          <td><input type="checkbox" class="teacher-select" value="${t.id}"></td>
          <td>${start + i + 1}</td>
          <td>${t.name}</td>
          <td>${t.qualification || '-'}</td>
          <td>${t.subject || '-'}</td>
          <td>${t.phone || '-'}</td>
          <td>${t.email || '-'}</td>
          <td>${t.gender || '-'}</td>
          <td>
            <button class="btn btn-sm btn-outline" onclick="App.showEditTeacherModal(${t.id})"><i class="fas fa-edit"></i></button>
            <button class="btn btn-sm btn-danger" onclick="App.deleteTeacher(${t.id})"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`).join('') : '<tr><td colspan="9" class="text-center text-muted">No teachers found</td></tr>';
    }
    this.renderTeacherPagination(total, page, rpp);
  },

  renderTeacherPagination(total, page, rpp) {
    const container = document.getElementById('teacherPagination');
    if (!container) return;
    const totalPages = Math.ceil(total / rpp) || 1;
    container.innerHTML = `
      <div class="pagination">
        <span class="page-info">${total} records, Page ${page} of ${totalPages}</span>
        <select class="page-select" onchange="App.state._teacherRowsPerPage=Number(this.value); App.state._teacherPage=1; App.renderTeacherTable()">
          ${[10,25,50,100].map(n => `<option value="${n}" ${n===rpp?'selected':''}>${n}/page</option>`).join('')}
        </select>
        <button class="page-btn" onclick="App.state._teacherPage=Math.max(1,${page}-1); App.renderTeacherTable()" ${page<=1?'disabled':''}>«</button>
        <span class="page-num">${page}</span>
        <button class="page-btn" onclick="App.state._teacherPage=Math.min(${totalPages},${page}+1); App.renderTeacherTable()" ${page>=totalPages?'disabled':''}>»</button>
      </div>`;
  },

  toggleTeacherSelect(checked) {
    document.querySelectorAll('.teacher-select').forEach(cb => cb.checked = checked);
  },

  showAddTeacherModal() {
    this.showModal(`
      <h3>Add Teacher</h3>
      <form id="teacherForm" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div class="form-group"><label>Name *</label><input class="form-control" name="name" required></div>
        <div class="form-group"><label>Date of Birth</label><input class="form-control" name="dob" type="date"></div>
        <div class="form-group"><label>Qualification</label><input class="form-control" name="qualification" placeholder="e.g. M.Ed., B.Ed."></div>
        <div class="form-group"><label>Teaching Subject</label><input class="form-control" name="subject" placeholder="e.g. Mathematics"></div>
        <div class="form-group"><label>Phone</label><input class="form-control" name="phone"></div>
        <div class="form-group"><label>Email</label><input class="form-control" name="email" type="email"></div>
        <div class="form-group"><label>Gender</label>
          <select class="form-control" name="gender"><option value="">Select</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option></select>
        </div>
        <div class="form-group"><label>Join Date</label><input class="form-control" name="join_date" type="date"></div>
        <div class="form-group" style="grid-column:1/-1;"><label>Address</label><input class="form-control" name="address"></div>
        <div class="form-group" style="grid-column:1/-1;"><label>Salary</label><input class="form-control" name="salary" type="number" step="0.01" placeholder="Monthly salary"></div>
        <div class="form-group" style="grid-column:1/-1;">
          <label>Photo</label>
          <input type="file" class="form-control" id="teacherPhotoInput" accept="image/*" onchange="App.previewTeacherPhoto(event)">
          <div id="teacherPhotoPreview" style="margin-top:6px;"></div>
        </div>
      </form>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="App.saveTeacher()"><i class="fas fa-save"></i> Save</button>
        <button class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
      </div>`);
  },

  previewTeacherPhoto(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      document.getElementById('teacherPhotoPreview').innerHTML =
        `<img src="${e.target.result}" style="max-width:100px;max-height:110px;border-radius:6px;border:1px solid var(--border);object-fit:cover;">`;
    };
    reader.readAsDataURL(file);
  },

  showEditTeacherModal(id) {
    const t = (this.state._teachers || []).find(x => x.id == id);
    if (!t) return this.notify('Teacher not found', 'error');
    this._editTeacherId = id;
    this.showModal(`
      <h3>Edit Teacher</h3>
      <form id="teacherForm" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div class="form-group"><label>Name *</label><input class="form-control" name="name" value="${t.name}" required></div>
        <div class="form-group"><label>Date of Birth</label><input class="form-control" name="dob" type="date" value="${t.dob||''}"></div>
        <div class="form-group"><label>Qualification</label><input class="form-control" name="qualification" value="${t.qualification||''}"></div>
        <div class="form-group"><label>Teaching Subject</label><input class="form-control" name="subject" value="${t.subject||''}"></div>
        <div class="form-group"><label>Phone</label><input class="form-control" name="phone" value="${t.phone||''}"></div>
        <div class="form-group"><label>Email</label><input class="form-control" name="email" type="email" value="${t.email||''}"></div>
        <div class="form-group"><label>Gender</label>
          <select class="form-control" name="gender">
            <option value="">Select</option>
            ${['Male','Female','Other'].map(g => `<option value="${g}" ${t.gender===g?'selected':''}>${g}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Join Date</label><input class="form-control" name="join_date" type="date" value="${t.join_date||''}"></div>
        <div class="form-group" style="grid-column:1/-1;"><label>Address</label><input class="form-control" name="address" value="${t.address||''}"></div>
        <div class="form-group" style="grid-column:1/-1;"><label>Salary</label><input class="form-control" name="salary" type="number" step="0.01" value="${t.salary||''}"></div>
        <div class="form-group" style="grid-column:1/-1;">
          <label>Photo</label>
          <input type="file" class="form-control" id="teacherPhotoInput" accept="image/*" onchange="App.previewTeacherPhoto(event)">
          <div id="teacherPhotoPreview">${t.photo_path ? `<img src="${t.photo_path}" style="max-width:100px;max-height:110px;border-radius:6px;border:1px solid var(--border);object-fit:cover;">` : ''}</div>
        </div>
      </form>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="App.saveTeacher(${id})"><i class="fas fa-save"></i> Update</button>
        <button class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
      </div>`);
  },

  async saveTeacher(editId) {
    const form = document.getElementById('teacherForm');
    if (!form) return;
    const fd = new FormData(form);
    const data = Object.fromEntries(fd);
    const photoPreview = document.getElementById('teacherPhotoPreview');
    if (photoPreview && photoPreview.querySelector('img')) {
      data.photo_path = photoPreview.querySelector('img').src;
    }
    if (editId) {
      const res = await api.updateTeacher(editId, data);
      if (!res.success) return this.notify('Update failed: ' + (res.error || ''), 'error');
      this.notify('Teacher updated successfully');
    } else {
      const res = await api.addTeacher(data);
      if (!res.success) return this.notify('Save failed: ' + (res.error || ''), 'error');
      this.notify('Teacher added successfully');
    }
    this.closeModal();
    const tRes = await api.getTeachers({});
    this.state._teachers = tRes.success ? tRes.data : [];
    this.renderTeacherTable();
  },

  async deleteTeacher(id) {
    if (!confirm('Delete this teacher?')) return;
    const res = await api.deleteTeacher(id);
    if (!res.success) return this.notify('Delete failed', 'error');
    this.notify('Teacher deleted');
    const tRes = await api.getTeachers({});
    this.state._teachers = tRes.success ? tRes.data : [];
    this.renderTeacherTable();
  },

  async deleteSelectedTeachers() {
    const ids = [...document.querySelectorAll('.teacher-select:checked')].map(cb => parseInt(cb.value));
    if (!ids.length) return this.notify('Select teachers to delete', 'warning');
    if (!confirm(`Delete ${ids.length} teacher(s)?`)) return;
    const res = await api.deleteMultipleTeachers(ids);
    if (!res.success) return this.notify('Delete failed', 'error');
    this.notify(`${ids.length} teacher(s) deleted`);
    document.getElementById('selectAllTeachers').checked = false;
    const tRes = await api.getTeachers({});
    this.state._teachers = tRes.success ? tRes.data : [];
    this.renderTeacherTable();
  },

  async renderTeacherList() {
    await this.renderTeacherRegistration();
  },

  /* ======= Staff Registration ======= */

  async renderStaffRegistration() {
    const sRes = await api.getStaffList({});
    const staffList = sRes.success ? sRes.data : [];
    this.state._staffList = staffList;
    document.getElementById('pageContent').innerHTML = `
      <div class="filter-bar">
        <div class="form-group">
          <label>Search</label>
          <input type="text" class="form-control" id="staffSearch" placeholder="Name, phone or designation..." oninput="App.renderStaffTable()">
        </div>
        <button class="btn btn-primary" onclick="App.showAddStaffModal()"><i class="fas fa-plus"></i> Add Staff</button>
      </div>
      <div class="table-container">
        <table>
          <thead><tr>
            <th><input type="checkbox" id="selectAllStaff" onchange="App.toggleStaffSelect(this.checked)"></th>
            <th>SN</th><th>Name</th><th>Designation</th><th>Phone</th><th>Email</th><th>Gender</th><th>Action</th>
          </tr></thead>
          <tbody id="staffTableBody"></tbody>
        </table>
      </div>
      <div style="margin-top:10px;">
        <button class="btn btn-sm btn-danger" onclick="App.deleteSelectedStaff()"><i class="fas fa-trash"></i> Delete Selected</button>
      </div>
      <div id="staffPagination" style="margin-top:12px;"></div>`;
    this.state._staffPage = 1;
    this.state._staffRowsPerPage = this.state.staffRowsPerPage || 25;
    this.renderStaffTable();
  },

  renderStaffTable() {
    const search = document.getElementById('staffSearch')?.value?.toLowerCase() || '';
    let staffList = this.state._staffList || [];
    if (search) {
      staffList = staffList.filter(s =>
        s.name.toLowerCase().includes(search) ||
        (s.phone || '').includes(search) ||
        (s.designation || '').toLowerCase().includes(search)
      );
    }
    this.state._staffFiltered = staffList;
    const page = this.state._staffPage || 1;
    const rpp = this.state._staffRowsPerPage || 25;
    const total = staffList.length;
    const totalPages = Math.ceil(total / rpp) || 1;
    const start = (page - 1) * rpp;
    const pageData = staffList.slice(start, start + rpp);
    const tbody = document.getElementById('staffTableBody');
    if (tbody) {
      tbody.innerHTML = pageData.length ? pageData.map((s, i) => `
        <tr>
          <td><input type="checkbox" class="staff-select" value="${s.id}"></td>
          <td>${start + i + 1}</td>
          <td>${s.name}</td>
          <td>${s.designation || '-'}</td>
          <td>${s.phone || '-'}</td>
          <td>${s.email || '-'}</td>
          <td>${s.gender || '-'}</td>
          <td>
            <button class="btn btn-sm btn-outline" onclick="App.showEditStaffModal(${s.id})"><i class="fas fa-edit"></i></button>
            <button class="btn btn-sm btn-danger" onclick="App.deleteStaff(${s.id})"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`).join('') : '<tr><td colspan="8" class="text-center text-muted">No staff found</td></tr>';
    }
    this.renderStaffPagination(total, page, rpp);
  },

  renderStaffPagination(total, page, rpp) {
    const container = document.getElementById('staffPagination');
    if (!container) return;
    const totalPages = Math.ceil(total / rpp) || 1;
    container.innerHTML = `
      <div class="pagination">
        <span class="page-info">${total} records, Page ${page} of ${totalPages}</span>
        <select class="page-select" onchange="App.state._staffRowsPerPage=Number(this.value); App.state._staffPage=1; App.renderStaffTable()">
          ${[10,25,50,100].map(n => `<option value="${n}" ${n===rpp?'selected':''}>${n}/page</option>`).join('')}
        </select>
        <button class="page-btn" onclick="App.state._staffPage=Math.max(1,${page}-1); App.renderStaffTable()" ${page<=1?'disabled':''}>«</button>
        <span class="page-num">${page}</span>
        <button class="page-btn" onclick="App.state._staffPage=Math.min(${totalPages},${page}+1); App.renderStaffTable()" ${page>=totalPages?'disabled':''}>»</button>
      </div>`;
  },

  toggleStaffSelect(checked) {
    document.querySelectorAll('.staff-select').forEach(cb => cb.checked = checked);
  },

  showAddStaffModal() {
    this.showModal(`
      <h3>Add Staff</h3>
      <form id="staffForm" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div class="form-group"><label>Name *</label><input class="form-control" name="name" required></div>
        <div class="form-group"><label>Date of Birth</label><input class="form-control" name="dob" type="date"></div>
        <div class="form-group"><label>Designation</label><input class="form-control" name="designation" placeholder="e.g. Accountant, Admin"></div>
        <div class="form-group"><label>Phone</label><input class="form-control" name="phone"></div>
        <div class="form-group"><label>Email</label><input class="form-control" name="email" type="email"></div>
        <div class="form-group"><label>Gender</label>
          <select class="form-control" name="gender"><option value="">Select</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option></select>
        </div>
        <div class="form-group"><label>Join Date</label><input class="form-control" name="join_date" type="date"></div>
        <div class="form-group" style="grid-column:1/-1;"><label>Address</label><input class="form-control" name="address"></div>
        <div class="form-group" style="grid-column:1/-1;"><label>Salary</label><input class="form-control" name="salary" type="number" step="0.01"></div>
        <div class="form-group" style="grid-column:1/-1;">
          <label>Photo</label>
          <input type="file" class="form-control" id="staffPhotoInput" accept="image/*" onchange="App.previewStaffPhoto(event)">
          <div id="staffPhotoPreview" style="margin-top:6px;"></div>
        </div>
      </form>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="App.saveStaff()"><i class="fas fa-save"></i> Save</button>
        <button class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
      </div>`);
  },

  previewStaffPhoto(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      document.getElementById('staffPhotoPreview').innerHTML =
        `<img src="${e.target.result}" style="max-width:100px;max-height:110px;border-radius:6px;border:1px solid var(--border);object-fit:cover;">`;
    };
    reader.readAsDataURL(file);
  },

  showEditStaffModal(id) {
    const s = (this.state._staffList || []).find(x => x.id == id);
    if (!s) return this.notify('Staff not found', 'error');
    this._editStaffId = id;
    this.showModal(`
      <h3>Edit Staff</h3>
      <form id="staffForm" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div class="form-group"><label>Name *</label><input class="form-control" name="name" value="${s.name}" required></div>
        <div class="form-group"><label>Date of Birth</label><input class="form-control" name="dob" type="date" value="${s.dob||''}"></div>
        <div class="form-group"><label>Designation</label><input class="form-control" name="designation" value="${s.designation||''}"></div>
        <div class="form-group"><label>Phone</label><input class="form-control" name="phone" value="${s.phone||''}"></div>
        <div class="form-group"><label>Email</label><input class="form-control" name="email" type="email" value="${s.email||''}"></div>
        <div class="form-group"><label>Gender</label>
          <select class="form-control" name="gender">
            <option value="">Select</option>
            ${['Male','Female','Other'].map(g => `<option value="${g}" ${s.gender===g?'selected':''}>${g}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Join Date</label><input class="form-control" name="join_date" type="date" value="${s.join_date||''}"></div>
        <div class="form-group" style="grid-column:1/-1;"><label>Address</label><input class="form-control" name="address" value="${s.address||''}"></div>
        <div class="form-group" style="grid-column:1/-1;"><label>Salary</label><input class="form-control" name="salary" type="number" step="0.01" value="${s.salary||''}"></div>
        <div class="form-group" style="grid-column:1/-1;">
          <label>Photo</label>
          <input type="file" class="form-control" id="staffPhotoInput" accept="image/*" onchange="App.previewStaffPhoto(event)">
          <div id="staffPhotoPreview">${s.photo_path ? `<img src="${s.photo_path}" style="max-width:100px;max-height:110px;border-radius:6px;border:1px solid var(--border);object-fit:cover;">` : ''}</div>
        </div>
      </form>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="App.saveStaff(${id})"><i class="fas fa-save"></i> Update</button>
        <button class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
      </div>`);
  },

  async saveStaff(editId) {
    const form = document.getElementById('staffForm');
    if (!form) return;
    const fd = new FormData(form);
    const data = Object.fromEntries(fd);
    const photoPreview = document.getElementById('staffPhotoPreview');
    if (photoPreview && photoPreview.querySelector('img')) {
      data.photo_path = photoPreview.querySelector('img').src;
    }
    if (editId) {
      const res = await api.updateStaff(editId, data);
      if (!res.success) return this.notify('Update failed', 'error');
      this.notify('Staff updated');
    } else {
      const res = await api.addStaff(data);
      if (!res.success) return this.notify('Save failed', 'error');
      this.notify('Staff added');
    }
    this.closeModal();
    const sRes = await api.getStaffList({});
    this.state._staffList = sRes.success ? sRes.data : [];
    this.renderStaffTable();
  },

  async deleteStaff(id) {
    if (!confirm('Delete this staff member?')) return;
    const res = await api.deleteStaff(id);
    if (!res.success) return this.notify('Delete failed', 'error');
    this.notify('Staff deleted');
    const sRes = await api.getStaffList({});
    this.state._staffList = sRes.success ? sRes.data : [];
    this.renderStaffTable();
  },

  async deleteSelectedStaff() {
    const ids = [...document.querySelectorAll('.staff-select:checked')].map(cb => parseInt(cb.value));
    if (!ids.length) return this.notify('Select staff to delete', 'warning');
    if (!confirm(`Delete ${ids.length} staff member(s)?`)) return;
    const res = await api.deleteMultipleStaff(ids);
    if (!res.success) return this.notify('Delete failed', 'error');
    this.notify(`${ids.length} staff member(s) deleted`);
    document.getElementById('selectAllStaff').checked = false;
    const sRes = await api.getStaffList({});
    this.state._staffList = sRes.success ? sRes.data : [];
    this.renderStaffTable();
  },

  /* ======= Staff Attendance ======= */

  async renderStaffAttendance() {
    const [tRes, sRes] = await Promise.all([
      api.getTeachers({}),
      api.getStaffList({})
    ]);
    const teachers = (tRes.success ? tRes.data : []).map(t => ({ ...t, _type: 'teacher' }));
    const staffList = (sRes.success ? sRes.data : []).map(s => ({ ...s, _type: 'staff' }));
    this.state._attendancePeople = [...teachers, ...staffList];
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('pageContent').innerHTML = `
      <div class="filter-bar">
        <div class="form-group">
          <label>Date</label>
          <input type="date" class="form-control" id="attDate" value="${today}" onchange="App.loadAttendanceData()">
        </div>
        <div class="form-group">
          <label>Type</label>
          <select class="form-control" id="attTypeFilter" onchange="App.renderAttendanceTable()">
            <option value="">All</option><option value="teacher">Teachers</option><option value="staff">Staff</option>
          </select>
        </div>
        <div class="form-group">
          <label>Search</label>
          <input type="text" class="form-control" id="attSearch" placeholder="Name..." oninput="App.renderAttendanceTable()">
        </div>
        <button class="btn btn-success" onclick="App.markAllPresent()"><i class="fas fa-check"></i> All Present</button>
        <button class="btn btn-primary" onclick="App.saveAttendanceData()"><i class="fas fa-save"></i> Save</button>
      </div>
      <div class="table-container">
        <table>
          <thead><tr>
            <th>SN</th><th>Type</th><th>Name</th><th>Designation / Subject</th><th>Status</th><th>Remarks</th>
          </tr></thead>
          <tbody id="attendanceTableBody"></tbody>
        </table>
      </div>
      <div style="margin-top:10px;display:flex;gap:12px;font-size:13px;">
        <span><span style="display:inline-block;width:12px;height:12px;background:#28a745;border-radius:3px;vertical-align:middle;"></span> Present</span>
        <span><span style="display:inline-block;width:12px;height:12px;background:#dc3545;border-radius:3px;vertical-align:middle;"></span> Absent</span>
        <span><span style="display:inline-block;width:12px;height:12px;background:#ffc107;border-radius:3px;vertical-align:middle;"></span> Leave</span>
        <span><span style="display:inline-block;width:12px;height:12px;background:#17a2b8;border-radius:3px;vertical-align:middle;"></span> Half Day</span>
      </div>`;
    await this.loadAttendanceData();
  },

  async loadAttendanceData() {
    const date = document.getElementById('attDate').value;
    if (!date) return;
    const aRes = await api.getAttendance({ date });
    const attMap = {};
    if (aRes.success) {
      for (const row of aRes.data) {
        attMap[`${row.person_type}-${row.person_id}`] = row;
      }
    }
    this.state._attendanceMap = attMap;
    this.renderAttendanceTable();
  },

  renderAttendanceTable() {
    const type = document.getElementById('attTypeFilter')?.value || '';
    const search = document.getElementById('attSearch')?.value?.toLowerCase() || '';
    let people = this.state._attendancePeople || [];
    if (type) people = people.filter(p => p._type === type);
    if (search) people = people.filter(p => p.name.toLowerCase().includes(search));
    const attMap = this.state._attendanceMap || {};
    const tbody = document.getElementById('attendanceTableBody');
    if (tbody) {
      tbody.innerHTML = people.length ? people.map((p, i) => {
        const key = `${p._type}-${p.id}`;
        const att = attMap[key] || {};
        const status = att.status || 'Present';
        const remarks = att.remarks || '';
        return `<tr>
          <td>${i+1}</td>
          <td><span class="grade-badge grade-${p._type==='teacher'?'OK':'warning'}" style="font-size:10px;">${p._type}</span></td>
          <td>${p.name}</td>
          <td>${p.designation || p.subject || '-'}</td>
          <td>
            <select class="form-control" style="width:110px;display:inline-block;font-size:12px;padding:2px 6px;" data-person-type="${p._type}" data-person-id="${p.id}" onchange="App.updateAttStatus('${p._type}',${p.id},this.value)">
              ${['Present','Absent','Leave','Half Day'].map(s =>
                `<option value="${s}" ${status===s?'selected':''}>${s}</option>`
              ).join('')}
            </select>
          </td>
          <td><input type="text" class="form-control" style="width:130px;font-size:12px;padding:2px 6px;display:inline-block;" value="${remarks}" placeholder="Remarks" data-person-type="${p._type}" data-person-id="${p.id}" onchange="App.updateAttRemarks('${p._type}',${p.id},this.value)"></td>
        </tr>`;
      }).join('') : '<tr><td colspan="6" class="text-center text-muted">No records found</td></tr>';
    }
  },

  updateAttStatus(personType, personId, status) {
    const key = `${personType}-${personId}`;
    if (!this.state._attendanceMap) this.state._attendanceMap = {};
    if (!this.state._attendanceMap[key]) this.state._attendanceMap[key] = {};
    this.state._attendanceMap[key].status = status;
    this.state._attendanceMap[key].person_type = personType;
    this.state._attendanceMap[key].person_id = personId;
  },

  updateAttRemarks(personType, personId, remarks) {
    const key = `${personType}-${personId}`;
    if (!this.state._attendanceMap) this.state._attendanceMap = {};
    if (!this.state._attendanceMap[key]) this.state._attendanceMap[key] = {};
    this.state._attendanceMap[key].remarks = remarks;
    this.state._attendanceMap[key].person_type = personType;
    this.state._attendanceMap[key].person_id = personId;
  },

  markAllPresent() {
    if (!this.state._attendanceMap) this.state._attendanceMap = {};
    const people = this.state._attendancePeople || [];
    for (const p of people) {
      const key = `${p._type}-${p.id}`;
      if (!this.state._attendanceMap[key]) this.state._attendanceMap[key] = {};
      this.state._attendanceMap[key].status = 'Present';
      this.state._attendanceMap[key].person_type = p._type;
      this.state._attendanceMap[key].person_id = p.id;
    }
    this.renderAttendanceTable();
    this.notify('All marked as Present');
  },

  async saveAttendanceData() {
    const date = document.getElementById('attDate').value;
    if (!date) return this.notify('Select a date', 'warning');
    const attMap = this.state._attendanceMap || {};
    const dataList = Object.values(attMap).filter(r => r.person_type && r.person_id).map(r => ({
      person_type: r.person_type,
      person_id: r.person_id,
      date,
      status: r.status || 'Present',
      remarks: r.remarks || ''
    }));
    if (!dataList.length) return this.notify('No attendance data to save', 'warning');
    const res = await api.saveAttendance(dataList);
    if (!res.success) return this.notify('Save failed', 'error');
    this.notify(`Attendance saved for ${dataList.length} person(s)`);
  },

  /* ======= Class Manage ======= */

  async renderClassManage() {
    const [tRes, sRes, students] = await Promise.all([
      api.getTeachers({}),
      api.getSections({}),
      api.getStudents({ session: this.state.session })
    ]);
    const teachers = tRes.success ? tRes.data : [];
    const allSections = sRes.success ? sRes.data : [];
    const allStudents = students.success ? students.data : [];
    const classes = [...window._ALL_CLASSES];
    const classData = classes.map(cls => {
      const clsStudents = allStudents.filter(s => s.class === cls);
      const clsSections = allSections.filter(s => s.class === cls);
      return { class: cls, students: clsStudents.length, sections: clsSections, teachers: teachers.length };
    });
    document.getElementById('pageContent').innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
        ${classData.map(cd => `
          <div class="card" style="background:var(--card);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
              <h2 style="font-size:20px;margin:0;">Class ${cd.class}</h2>
              <span class="grade-badge grade-OK" style="font-size:13px;">${cd.students} Students</span>
            </div>
            <div style="margin-bottom:12px;">
              <div style="font-size:13px;color:var(--text-muted);margin-bottom:6px;">Sections (${cd.sections.length})</div>
              <div id="sectionList-${cd.class}" style="display:flex;flex-wrap:wrap;gap:6px;min-height:32px;">
                ${cd.sections.length ? cd.sections.map(sec => `
                  <span style="display:inline-flex;align-items:center;gap:4px;background:var(--primary-light);color:var(--primary);padding:3px 10px;border-radius:14px;font-size:12px;">
                    ${sec.name}
                    <span style="cursor:pointer;font-size:14px;line-height:1;" onclick="App.deleteSection(${sec.id},'${cd.class}')" title="Delete">&times;</span>
                  </span>
                `).join('') : '<span class="text-muted" style="font-size:12px;">No sections yet</span>'}
              </div>
            </div>
            <div style="display:flex;gap:8px;">
              <div class="form-group" style="margin:0;flex:1;">
                <div style="display:flex;gap:6px;">
                  <input type="text" class="form-control" id="newSection-${cd.class}" placeholder="e.g. A" style="padding:6px 10px;font-size:13px;flex:1;">
                  <button class="btn btn-sm btn-primary" onclick="App.addSection('${cd.class}')"><i class="fas fa-plus"></i> Add</button>
                </div>
              </div>
            </div>
            <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);">
              <label style="font-size:12px;">Class Teacher</label>
              <select class="form-control" id="ctSelect-${cd.class}" style="font-size:12px;margin-top:4px;" onchange="App.assignClassTeacher('${cd.class}', this.value)">
                <option value="">— None —</option>
                ${teachers.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
              </select>
            </div>
          </div>
        `).join('')}
      </div>
      <div id="classManageStatus" style="margin-top:16px;font-size:13px;color:var(--text-muted);text-align:center;"></div>`;
    this.state._classSections = allSections;
    this.state._teachers = teachers;
  },

  async addSection(cls) {
    const input = document.getElementById(`newSection-${cls}`);
    const name = input?.value?.trim().toUpperCase();
    if (!name) return this.notify('Enter section name', 'warning');
    const res = await api.addSection({ class: cls, name });
    if (!res.success) return this.notify('Section already exists or error', 'error');
    this.notify(`Section ${name} added`);
    input.value = '';
    const sRes = await api.getSections({});
    this.state._classSections = sRes.success ? sRes.data : [];
    // Re-render the inline section lists
    window._ALL_CLASSES.forEach(c => this.updateSectionDisplay(c));
  },

  async deleteSection(id, cls) {
    if (!confirm('Delete this section?')) return;
    const res = await api.deleteSection(id);
    if (!res.success) return this.notify('Delete failed', 'error');
    const sRes = await api.getSections({});
    this.state._classSections = sRes.success ? sRes.data : [];
    this.updateSectionDisplay(cls);
  },

  updateSectionDisplay(cls) {
    const container = document.getElementById(`sectionList-${cls}`);
    if (!container) return;
    const sections = (this.state._classSections || []).filter(s => s.class === cls);
    container.innerHTML = sections.length ? sections.map(sec => `
      <span style="display:inline-flex;align-items:center;gap:4px;background:var(--primary-light);color:var(--primary);padding:3px 10px;border-radius:14px;font-size:12px;">
        ${sec.name}
        <span style="cursor:pointer;font-size:14px;line-height:1;" onclick="App.deleteSection(${sec.id},'${cls}')" title="Delete">&times;</span>
      </span>
    `).join('') : '<span class="text-muted" style="font-size:12px;">No sections yet</span>';
  },

  assignClassTeacher(cls, teacherId) {
    this.notify(`Class teacher assigned for Class ${cls}`);
  },

  /* ======= Section Manage ======= */

  async renderSectionManage() {
    const [sRes, tRes] = await Promise.all([
      api.getSections({}),
      api.getTeachers({})
    ]);
    const allSections = sRes.success ? sRes.data : [];
    const teachers = tRes.success ? tRes.data : [];
    this.state._sections = allSections;
    this.state._teachers = teachers;
    document.getElementById('pageContent').innerHTML = `
      <div class="filter-bar">
        <div class="form-group">
          <label>Class</label>
          <select class="form-control" id="secClassFilter" onchange="App.renderSectionTable()">
            ${_classOptsAll()}
          </select>
        </div>
        <button class="btn btn-primary" onclick="App.showAddSectionModal()"><i class="fas fa-plus"></i> Add Section</button>
      </div>
      <div class="table-container">
        <table>
          <thead><tr><th>SN</th><th>Class</th><th>Section</th><th>Class Teacher</th><th>Action</th></tr></thead>
          <tbody id="sectionTableBody"></tbody>
        </table>
      </div>`;
    this.renderSectionTable();
  },

  renderSectionTable() {
    const cls = document.getElementById('secClassFilter')?.value || '';
    let sections = this.state._sections || [];
    if (cls) sections = sections.filter(s => s.class === cls);
    const teachers = this.state._teachers || [];
    const tbody = document.getElementById('sectionTableBody');
    if (tbody) {
      tbody.innerHTML = sections.length ? sections.map((sec, i) => {
        const ct = teachers.find(t => t.id == sec.class_teacher_id);
        return `<tr>
          <td>${i+1}</td>
          <td>${sec.class}</td>
          <td><strong>${sec.name}</strong></td>
          <td>${ct ? ct.name : '<span class="text-muted">—</span>'}</td>
          <td>
            <button class="btn btn-sm btn-outline" onclick="App.showEditSectionModal(${sec.id})"><i class="fas fa-edit"></i></button>
            <button class="btn btn-sm btn-danger" onclick="App.deleteSectionItem(${sec.id})"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`;
      }).join('') : '<tr><td colspan="5" class="text-center text-muted">No sections found</td></tr>';
    }
  },

  showAddSectionModal() {
    const teachers = this.state._teachers || [];
    this.showModal(`
      <h3>Add Section</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:8px 0;">
        <div class="form-group"><label>Class *</label>
          <select class="form-control" id="secAddClass">
            ${_classOpts()}
          </select>
        </div>
        <div class="form-group"><label>Section Name *</label><input class="form-control" id="secAddName" placeholder="e.g. A"></div>
        <div class="form-group" style="grid-column:1/-1;"><label>Class Teacher</label>
          <select class="form-control" id="secAddTeacher">
            <option value="">— None —</option>
            ${teachers.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="App.saveNewSection()"><i class="fas fa-save"></i> Save</button>
        <button class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
      </div>`);
  },

  async saveNewSection() {
    const cls = document.getElementById('secAddClass').value;
    const name = document.getElementById('secAddName').value.trim().toUpperCase();
    const teacherId = document.getElementById('secAddTeacher').value;
    if (!name) return this.notify('Enter section name', 'warning');
    const res = await api.addSection({ class: cls, name, class_teacher_id: teacherId || null });
    if (!res.success) return this.notify('Section already exists or error', 'error');
    this.notify('Section added');
    this.closeModal();
    const sRes = await api.getSections({});
    this.state._sections = sRes.success ? sRes.data : [];
    this.renderSectionTable();
  },

  showEditSectionModal(id) {
    const sec = (this.state._sections || []).find(s => s.id == id);
    if (!sec) return;
    const teachers = this.state._teachers || [];
    this.showModal(`
      <h3>Edit Section</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:8px 0;">
        <div class="form-group"><label>Class</label>
          <select class="form-control" id="secEditClass">
            ${_classOpts(sec.class)}
          </select>
        </div>
        <div class="form-group"><label>Section Name *</label><input class="form-control" id="secEditName" value="${sec.name}"></div>
        <div class="form-group" style="grid-column:1/-1;"><label>Class Teacher</label>
          <select class="form-control" id="secEditTeacher">
            <option value="">— None —</option>
            ${teachers.map(t => `<option value="${t.id}" ${sec.class_teacher_id==t.id?'selected':''}>${t.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="App.saveEditSection(${id})"><i class="fas fa-save"></i> Update</button>
        <button class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
      </div>`);
  },

  async saveEditSection(id) {
    const cls = document.getElementById('secEditClass').value;
    const name = document.getElementById('secEditName').value.trim().toUpperCase();
    const teacherId = document.getElementById('secEditTeacher').value;
    if (!name) return this.notify('Enter section name', 'warning');
    const res = await api.updateSection(id, { name, class: cls, class_teacher_id: teacherId || null });
    if (!res.success) return this.notify('Update failed', 'error');
    this.notify('Section updated');
    this.closeModal();
    const sRes = await api.getSections({});
    this.state._sections = sRes.success ? sRes.data : [];
    this.renderSectionTable();
  },

  async deleteSectionItem(id) {
    if (!confirm('Delete this section?')) return;
    const res = await api.deleteSection(id);
    if (!res.success) return this.notify('Delete failed', 'error');
    this.notify('Section deleted');
    const sRes = await api.getSections({});
    this.state._sections = sRes.success ? sRes.data : [];
    this.renderSectionTable();
  },

  /* ======= Class Routine ======= */

  async renderClassRoutine() {
    const [tRes, secRes] = await Promise.all([
      api.getTeachers({}),
      api.getSections({})
    ]);
    const teachers = tRes.success ? tRes.data : [];
    const sections = secRes.success ? secRes.data : [];
    this.state._routineTeachers = teachers;
    this.state._routineSections = sections;
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const periods = [1, 2, 3, 4, 5, 6, 7];
    document.getElementById('pageContent').innerHTML = `
      <div class="filter-bar">
        <div class="form-group">
          <label>Class</label>
          <select class="form-control" id="rtClassFilter" onchange="App.loadRoutineData()">
            ${_classOpts()}
          </select>
        </div>
        <div class="form-group">
          <label>Section</label>
          <select class="form-control" id="rtSectionFilter" onchange="App.loadRoutineData()">
            <option value="">— None —</option>
            ${sections.map(s => `<option value="${s.name}">${s.name}</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-primary" onclick="App.saveRoutineData()"><i class="fas fa-save"></i> Save Routine</button>
        <button class="btn btn-outline" onclick="App.printRoutine()"><i class="fas fa-print"></i> Print</button>
      </div>
      <div id="routineContainer" style="overflow-x:auto;">
        <div class="table-container">
          <table id="routineTable" style="font-size:12px;">
            <thead>
              <tr>
                <th style="min-width:50px;">Period</th>
                ${days.map(d => `<th style="min-width:100px;">${d}</th>`).join('')}
              </tr>
            </thead>
            <tbody id="routineBody"></tbody>
          </table>
        </div>
      </div>
      <p class="text-muted" style="font-size:11px;margin-top:8px;">Click on any cell to edit subject. Use Save Routine to persist changes.</p>`;
    await this.loadRoutineData();
  },

  async loadRoutineData() {
    const cls = document.getElementById('rtClassFilter').value;
    const section = document.getElementById('rtSectionFilter').value;
    if (!section) {
      document.getElementById('routineBody').innerHTML = '<tr><td colspan="7" class="text-center text-muted">Select a section to view routine</td></tr>';
      return;
    }
    const rRes = await api.getRoutines({ class: cls, section });
    const routines = rRes.success ? rRes.data : [];
    const rtMap = {};
    for (const r of routines) {
      rtMap[`${r.day}-${r.period}`] = r;
    }
    this.state._routineMap = rtMap;
    this.state._routineClass = cls;
    this.state._routineSection = section;
    this.renderRoutineGrid();
  },

  renderRoutineGrid() {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const periods = [1, 2, 3, 4, 5, 6, 7];
    const rtMap = this.state._routineMap || {};
    const teachers = this.state._routineTeachers || [];
    const tbody = document.getElementById('routineBody');
    if (!tbody) return;
    tbody.innerHTML = periods.map(p => `
      <tr>
        <td style="font-weight:600;text-align:center;">${p}</td>
        ${days.map(d => {
          const key = `${d}-${p}`;
          const entry = rtMap[key];
          const subject = entry ? entry.subject : '';
          const teacherId = entry ? entry.teacher_id : '';
          const tName = teacherId ? (teachers.find(t => t.id == teacherId)?.name || '') : '';
          return `<td style="cursor:pointer;padding:4px;min-width:100px;" onclick="App.editRoutineCell('${d}',${p})">
            ${subject ? `<div style="font-weight:600;font-size:12px;">${subject}</div>${tName ? `<div style="font-size:10px;color:var(--text-muted);">${tName}</div>` : ''}` : '<span class="text-muted" style="font-size:11px;">—</span>'}
          </td>`;
        }).join('')}
      </tr>
    `).join('');
  },

  editRoutineCell(day, period) {
    const key = `${day}-${period}`;
    const rtMap = this.state._routineMap || {};
    const entry = rtMap[key] || {};
    const teachers = this.state._routineTeachers || [];
    const subject = entry.subject || '';
    const teacherId = entry.teacher_id || '';
    this.showModal(`
      <h3>Edit Routine — ${day}, Period ${period}</h3>
      <div style="padding:8px 0;">
        <div class="form-group"><label>Subject</label><input class="form-control" id="rtSubject" value="${subject}" placeholder="Subject name"></div>
        <div class="form-group"><label>Teacher</label>
          <select class="form-control" id="rtTeacher">
            <option value="">— None —</option>
            ${teachers.map(t => `<option value="${t.id}" ${Number(teacherId)===t.id?'selected':''}>${t.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="App.saveRoutineCell('${day}',${period})"><i class="fas fa-check"></i> OK</button>
        <button class="btn btn-danger" onclick="App.clearRoutineCell('${day}',${period})"><i class="fas fa-times"></i> Clear</button>
        <button class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
      </div>`);
  },

  saveRoutineCell(day, period) {
    const key = `${day}-${period}`;
    const subject = document.getElementById('rtSubject')?.value?.trim() || '';
    const teacherId = document.getElementById('rtTeacher')?.value || '';
    if (!this.state._routineMap) this.state._routineMap = {};
    this.state._routineMap[key] = { day, period, subject, teacher_id: teacherId ? parseInt(teacherId) : null };
    this.closeModal();
    this.renderRoutineGrid();
  },

  clearRoutineCell(day, period) {
    const key = `${day}-${period}`;
    if (this.state._routineMap) delete this.state._routineMap[key];
    this.closeModal();
    this.renderRoutineGrid();
  },

  async saveRoutineData() {
    const cls = this.state._routineClass;
    const section = this.state._routineSection;
    if (!section) return this.notify('Select a section', 'warning');
    const rtMap = this.state._routineMap || {};
    const routines = Object.values(rtMap).filter(r => r.day && r.period && r.subject);
    const res = await api.saveRoutines({ class: cls, section, routines });
    if (!res.success) return this.notify('Save failed', 'error');
    this.notify(`Routine saved (${routines.length} entries)`);
  },

  printRoutine() {
    const cls = this.state._routineClass;
    const section = this.state._routineSection;
    if (!section) return this.notify('Select a section first', 'warning');
    const rtMap = this.state._routineMap || {};
    const teachers = this.state._routineTeachers || [];
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const periods = [1, 2, 3, 4, 5, 6, 7];
    const cellHtml = periods.map(p => {
      const cells = days.map(d => {
        const key = d + '-' + p;
        const entry = rtMap[key] || {};
        const tName = entry.teacher_id ? (teachers.find(t => t.id == entry.teacher_id)?.name || '') : '';
        return '<td>' + (entry.subject
          ? '<div class="subject">' + entry.subject + '</div>' + (tName ? '<div class="teacher">' + tName + '</div>' : '')
          : '—') + '</td>';
      }).join('');
      return '<tr><td style="font-weight:700;">' + p + '</td>' + cells + '</tr>';
    }).join('');
    const headHtml = days.map(d => '<th>' + d + '</th>').join('');
    const win = window.open('', '_blank');
    win.document.write(
      '<html><head><title>Class Routine - ' + cls + ' ' + section + '</title>' +
      '<style>' +
        '@page { size: A4 landscape; margin: 8mm; }' +
        'body { font-family: "Times New Roman", serif; margin:0; padding:16px; }' +
        'h2 { text-align:center; margin-bottom:4px; }' +
        '.sub { text-align:center; color:#555; margin-bottom:12px; }' +
        'table { width:100%; border-collapse:collapse; font-size:11px; }' +
        'th, td { border:1px solid #333; padding:6px 8px; text-align:center; }' +
        'th { background:#f0f0f0; font-weight:700; }' +
        '.subject { font-weight:600; }' +
        '.teacher { font-size:9px; color:#666; }' +
      '</style></head><body>' +
        '<h2>Class Routine</h2>' +
        '<div class="sub">Class ' + cls + ' - Section ' + section + '</div>' +
        '<table><thead><tr><th>Period</th>' + headHtml + '</tr></thead>' +
        '<tbody>' + cellHtml + '</tbody></table>' +
        '<script>window.onload=function(){window.print();window.close();}<\/script>' +
      '</body></html>');
    win.document.close();
  },

  /* ======= Student Attendance ======= */

  async renderStudentAttendance() {
    const sRes = await api.getStudents({ session: this.state.session });
    const allStudents = sRes.success ? sRes.data : [];
    this.state._attStudents = allStudents;
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('pageContent').innerHTML = `
      <div class="filter-bar">
        <div class="form-group"><label>Date</label><input type="date" class="form-control" id="saDate" value="${today}" onchange="App.loadStudentAttendance()"></div>
        <div class="form-group"><label>Class</label>
          <select class="form-control" id="saClassFilter" onchange="App.renderStudentAttendanceTable()">
            ${_classOptsAll()}
          </select>
        </div>
        <div class="form-group"><label>Faculty</label>
          <select class="form-control" id="saFacultyFilter" onchange="App.renderStudentAttendanceTable()">
            <option value="">All</option><option value="Common">Common</option><option value="General">General</option><option value="Technical">Technical</option>
          </select>
        </div>
        <div class="form-group"><label>Search</label><input type="text" class="form-control" id="saSearch" placeholder="Name or Roll..." oninput="App.renderStudentAttendanceTable()"></div>
        <button class="btn btn-success" onclick="App.markAllStudentsPresent()"><i class="fas fa-check"></i> All Present</button>
        <button class="btn btn-primary" onclick="App.saveStudentAttendance()"><i class="fas fa-save"></i> Save</button>
      </div>
      <div class="table-container">
        <table>
          <thead><tr><th>SN</th><th>Roll</th><th>Name</th><th>Class</th><th>Faculty</th><th>Status</th><th>Remarks</th></tr></thead>
          <tbody id="saTableBody"></tbody>
        </table>
      </div>`;
    await this.loadStudentAttendance();
  },

  async loadStudentAttendance() {
    const date = document.getElementById('saDate').value;
    if (!date) return;
    const aRes = await api.getAttendance({ date, person_type: 'student' });
    const attMap = {};
    if (aRes.success) {
      for (const row of aRes.data) {
        attMap['student-' + row.person_id] = row;
      }
    }
    this.state._saAttMap = attMap;
    this.renderStudentAttendanceTable();
  },

  renderStudentAttendanceTable() {
    const cls = document.getElementById('saClassFilter')?.value || '';
    const faculty = document.getElementById('saFacultyFilter')?.value || '';
    const search = document.getElementById('saSearch')?.value?.toLowerCase() || '';
    let students = this.state._attStudents || [];
    if (cls) students = students.filter(s => s.class === cls);
    if (faculty) students = students.filter(s => s.faculty === faculty);
    if (search) students = students.filter(s => s.name.toLowerCase().includes(search) || s.roll_no.includes(search));
    const attMap = this.state._saAttMap || {};
    const tbody = document.getElementById('saTableBody');
    if (tbody) {
      tbody.innerHTML = students.length ? students.map((s, i) => {
        const key = 'student-' + s.id;
        const att = attMap[key] || {};
        const status = att.status || 'Present';
        const remarks = att.remarks || '';
        return `<tr>
          <td>${i+1}</td><td>${s.roll_no}</td><td>${s.name}</td>
          <td>${s.class}</td><td>${s.faculty}</td>
          <td><select class="form-control" style="width:110px;display:inline-block;font-size:12px;padding:2px 6px;" data-sid="${s.id}" onchange="App.updateSAStatus(${s.id},this.value)">
            ${['Present','Absent','Leave','Half Day'].map(st => `<option value="${st}" ${status===st?'selected':''}>${st}</option>`).join('')}
          </select></td>
          <td><input type="text" class="form-control" style="width:120px;font-size:12px;padding:2px 6px;display:inline-block;" value="${remarks}" data-sid="${s.id}" onchange="App.updateSARemarks(${s.id},this.value)"></td>
        </tr>`;
      }).join('') : '<tr><td colspan="7" class="text-center text-muted">No students found</td></tr>';
    }
  },

  updateSAStatus(id, status) {
    const key = 'student-' + id;
    if (!this.state._saAttMap) this.state._saAttMap = {};
    if (!this.state._saAttMap[key]) this.state._saAttMap[key] = {};
    this.state._saAttMap[key].status = status;
    this.state._saAttMap[key].person_type = 'student';
    this.state._saAttMap[key].person_id = id;
  },

  updateSARemarks(id, remarks) {
    const key = 'student-' + id;
    if (!this.state._saAttMap) this.state._saAttMap = {};
    if (!this.state._saAttMap[key]) this.state._saAttMap[key] = {};
    this.state._saAttMap[key].remarks = remarks;
    this.state._saAttMap[key].person_type = 'student';
    this.state._saAttMap[key].person_id = id;
  },

  markAllStudentsPresent() {
    if (!this.state._saAttMap) this.state._saAttMap = {};
    const students = this.state._attStudents || [];
    for (const s of students) {
      const key = 'student-' + s.id;
      if (!this.state._saAttMap[key]) this.state._saAttMap[key] = {};
      this.state._saAttMap[key].status = 'Present';
      this.state._saAttMap[key].person_type = 'student';
      this.state._saAttMap[key].person_id = s.id;
    }
    this.renderStudentAttendanceTable();
    this.notify('All marked Present');
  },

  async saveStudentAttendance() {
    const date = document.getElementById('saDate').value;
    if (!date) return this.notify('Select date', 'warning');
    const attMap = this.state._saAttMap || {};
    const dataList = Object.values(attMap).filter(r => r.person_type && r.person_id).map(r => ({
      person_type: 'student',
      person_id: r.person_id,
      date,
      status: r.status || 'Present',
      remarks: r.remarks || ''
    }));
    if (!dataList.length) return this.notify('No data to save', 'warning');
    const res = await api.saveAttendance(dataList);
    if (!res.success) return this.notify('Save failed', 'error');
    this.notify('Attendance saved for ' + dataList.length + ' student(s)');
  },

  /* ======= Teacher Attendance ======= */

  async renderTeacherAttendance() {
    const tRes = await api.getTeachers({});
    const teachers = tRes.success ? tRes.data : [];
    this.state._attTeachers = teachers;
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('pageContent').innerHTML = `
      <div class="filter-bar">
        <div class="form-group"><label>Date</label><input type="date" class="form-control" id="taDate" value="${today}" onchange="App.loadTeacherAttendance()"></div>
        <div class="form-group"><label>Search</label><input type="text" class="form-control" id="taSearch" placeholder="Name..." oninput="App.renderTeacherAttendanceTable()"></div>
        <button class="btn btn-success" onclick="App.markAllTeachersPresent()"><i class="fas fa-check"></i> All Present</button>
        <button class="btn btn-primary" onclick="App.saveTeacherAttendance()"><i class="fas fa-save"></i> Save</button>
      </div>
      <div class="table-container">
        <table>
          <thead><tr><th>SN</th><th>Name</th><th>Subject</th><th>Phone</th><th>Status</th><th>Remarks</th></tr></thead>
          <tbody id="taTableBody"></tbody>
        </table>
      </div>`;
    await this.loadTeacherAttendance();
  },

  async loadTeacherAttendance() {
    const date = document.getElementById('taDate').value;
    if (!date) return;
    const aRes = await api.getAttendance({ date, person_type: 'teacher' });
    const attMap = {};
    if (aRes.success) {
      for (const row of aRes.data) {
        attMap['teacher-' + row.person_id] = row;
      }
    }
    this.state._taAttMap = attMap;
    this.renderTeacherAttendanceTable();
  },

  renderTeacherAttendanceTable() {
    const search = document.getElementById('taSearch')?.value?.toLowerCase() || '';
    let teachers = this.state._attTeachers || [];
    if (search) teachers = teachers.filter(t => t.name.toLowerCase().includes(search));
    const attMap = this.state._taAttMap || {};
    const tbody = document.getElementById('taTableBody');
    if (tbody) {
      tbody.innerHTML = teachers.length ? teachers.map((t, i) => {
        const key = 'teacher-' + t.id;
        const att = attMap[key] || {};
        const status = att.status || 'Present';
        const remarks = att.remarks || '';
        return `<tr>
          <td>${i+1}</td><td>${t.name}</td><td>${t.subject||'-'}</td><td>${t.phone||'-'}</td>
          <td><select class="form-control" style="width:110px;display:inline-block;font-size:12px;padding:2px 6px;" data-tid="${t.id}" onchange="App.updateTAStatus(${t.id},this.value)">
            ${['Present','Absent','Leave','Half Day'].map(st => `<option value="${st}" ${status===st?'selected':''}>${st}</option>`).join('')}
          </select></td>
          <td><input type="text" class="form-control" style="width:120px;font-size:12px;padding:2px 6px;display:inline-block;" value="${remarks}" data-tid="${t.id}" onchange="App.updateTARemarks(${t.id},this.value)"></td>
        </tr>`;
      }).join('') : '<tr><td colspan="6" class="text-center text-muted">No teachers found</td></tr>';
    }
  },

  updateTAStatus(id, status) {
    const key = 'teacher-' + id;
    if (!this.state._taAttMap) this.state._taAttMap = {};
    if (!this.state._taAttMap[key]) this.state._taAttMap[key] = {};
    this.state._taAttMap[key].status = status;
    this.state._taAttMap[key].person_type = 'teacher';
    this.state._taAttMap[key].person_id = id;
  },

  updateTARemarks(id, remarks) {
    const key = 'teacher-' + id;
    if (!this.state._taAttMap) this.state._taAttMap = {};
    if (!this.state._taAttMap[key]) this.state._taAttMap[key] = {};
    this.state._taAttMap[key].remarks = remarks;
    this.state._taAttMap[key].person_type = 'teacher';
    this.state._taAttMap[key].person_id = id;
  },

  markAllTeachersPresent() {
    if (!this.state._taAttMap) this.state._taAttMap = {};
    const teachers = this.state._attTeachers || [];
    for (const t of teachers) {
      const key = 'teacher-' + t.id;
      if (!this.state._taAttMap[key]) this.state._taAttMap[key] = {};
      this.state._taAttMap[key].status = 'Present';
      this.state._taAttMap[key].person_type = 'teacher';
      this.state._taAttMap[key].person_id = t.id;
    }
    this.renderTeacherAttendanceTable();
    this.notify('All marked Present');
  },

  async saveTeacherAttendance() {
    const date = document.getElementById('taDate').value;
    if (!date) return this.notify('Select date', 'warning');
    const attMap = this.state._taAttMap || {};
    const dataList = Object.values(attMap).filter(r => r.person_type && r.person_id).map(r => ({
      person_type: 'teacher',
      person_id: r.person_id,
      date,
      status: r.status || 'Present',
      remarks: r.remarks || ''
    }));
    if (!dataList.length) return this.notify('No data to save', 'warning');
    const res = await api.saveAttendance(dataList);
    if (!res.success) return this.notify('Save failed', 'error');
    this.notify('Attendance saved for ' + dataList.length + ' teacher(s)');
  },

  /* ======= Attendance Report ======= */

  async renderAttendanceReport() {
    const [tRes, sRes] = await Promise.all([
      api.getTeachers({}),
      api.getStudents({ session: this.state.session })
    ]);
    const teachers = tRes.success ? tRes.data : [];
    const students = sRes.success ? sRes.data : [];
    this.state._reportTeachers = teachers;
    this.state._reportStudents = students;
    document.getElementById('pageContent').innerHTML = `
      <div class="filter-bar">
        <div class="form-group"><label>Type</label>
          <select class="form-control" id="arType" onchange="App.renderAttendanceReportTable()">
            <option value="student">Students</option><option value="teacher">Teachers</option><option value="staff">Staff</option>
          </select>
        </div>
        <div class="form-group"><label>From Date</label><input type="date" class="form-control" id="arDateFrom"></div>
        <div class="form-group"><label>To Date</label><input type="date" class="form-control" id="arDateTo"></div>
        <button class="btn btn-primary" onclick="App.loadAttendanceReport()"><i class="fas fa-search"></i> Load Report</button>
        <button class="btn btn-outline" onclick="App.printAttendanceReport()"><i class="fas fa-print"></i> Print</button>
      </div>
      <div id="arSummary" style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;"></div>
      <div class="table-container">
        <table>
          <thead><tr><th>SN</th><th>Name</th><th>Total</th><th>Present</th><th>Absent</th><th>Leave</th><th>Half Day</th><th>%</th></tr></thead>
          <tbody id="arTableBody"></tbody>
        </table>
      </div>`;
  },

  async loadAttendanceReport() {
    const type = document.getElementById('arType').value;
    const from = document.getElementById('arDateFrom').value;
    const to = document.getElementById('arDateTo').value;
    if (!from || !to) return this.notify('Select date range', 'warning');
    const aRes = await api.getAttendance({ person_type: type });
    if (!aRes.success) return;
    const allAtt = aRes.data.filter(a => a.date >= from && a.date <= to);
    const people = type === 'student' ? (this.state._reportStudents || [])
      : type === 'teacher' ? (this.state._reportTeachers || [])
      : (this.state._staffList || []);
    this.state._arAllAtt = allAtt;
    this.state._arPeople = people;
    this.renderAttendanceReportTable();
  },

  renderAttendanceReportTable() {
    const allAtt = this.state._arAllAtt || [];
    const people = this.state._arPeople || [];
    const statsMap = {};
    for (const a of allAtt) {
      const key = a.person_id;
      if (!statsMap[key]) statsMap[key] = { present: 0, absent: 0, leave: 0, half: 0, total: 0 };
      statsMap[key].total++;
      if (a.status === 'Present') statsMap[key].present++;
      else if (a.status === 'Absent') statsMap[key].absent++;
      else if (a.status === 'Leave') statsMap[key].leave++;
      else if (a.status === 'Half Day') statsMap[key].half++;
    }
    const tbody = document.getElementById('arTableBody');
    if (tbody) {
      tbody.innerHTML = people.length ? people.map((p, i) => {
        const st = statsMap[p.id] || { present: 0, absent: 0, leave: 0, half: 0, total: 0 };
        const pct = st.total ? ((st.present / st.total) * 100).toFixed(1) : '—';
        return `<tr>
          <td>${i+1}</td><td>${p.name}</td>
          <td>${st.total}</td><td>${st.present}</td><td>${st.absent}</td><td>${st.leave}</td><td>${st.half}</td>
          <td>${pct !== '—' ? pct + '%' : '—'}</td>
        </tr>`;
      }).join('') : '<tr><td colspan="8" class="text-center text-muted">Load report to view data</td></tr>';
    }
    const total = people.length;
    const totalAtt = allAtt.length;
    const totalP = allAtt.filter(a => a.status === 'Present').length;
    const totalA = allAtt.filter(a => a.status === 'Absent').length;
    const totalL = allAtt.filter(a => a.status === 'Leave').length;
    const totalH = allAtt.filter(a => a.status === 'Half Day').length;
    const summaryEl = document.getElementById('arSummary');
    if (summaryEl) {
      summaryEl.innerHTML = `
        <div class="card" style="background:var(--card);border-radius:var(--radius);padding:12px;box-shadow:var(--shadow);text-align:center;">
          <div style="font-size:22px;font-weight:700;">${total}</div>
          <div style="font-size:11px;color:var(--text-muted);">People</div>
        </div>
        <div class="card" style="background:var(--card);border-radius:var(--radius);padding:12px;box-shadow:var(--shadow);text-align:center;">
          <div style="font-size:22px;font-weight:700;color:var(--success);">${totalP}</div>
          <div style="font-size:11px;color:var(--text-muted);">Present</div>
        </div>
        <div class="card" style="background:var(--card);border-radius:var(--radius);padding:12px;box-shadow:var(--shadow);text-align:center;">
          <div style="font-size:22px;font-weight:700;color:var(--danger);">${totalA}</div>
          <div style="font-size:11px;color:var(--text-muted);">Absent</div>
        </div>
        <div class="card" style="background:var(--card);border-radius:var(--radius);padding:12px;box-shadow:var(--shadow);text-align:center;">
          <div style="font-size:22px;font-weight:700;color:var(--warning);">${totalL}</div>
          <div style="font-size:11px;color:var(--text-muted);">Leave/Half</div>
        </div>`;
    }
  },

  printAttendanceReport() {
    const type = document.getElementById('arType').value;
    const people = this.state._arPeople || [];
    const allAtt = this.state._arAllAtt || [];
    const from = document.getElementById('arDateFrom').value;
    const to = document.getElementById('arDateTo').value;
    if (!people.length) return this.notify('Load report first', 'warning');
    const statsMap = {};
    for (const a of allAtt) {
      const key = a.person_id;
      if (!statsMap[key]) statsMap[key] = { present: 0, absent: 0, leave: 0, half: 0, total: 0 };
      statsMap[key].total++;
      if (a.status === 'Present') statsMap[key].present++;
      else if (a.status === 'Absent') statsMap[key].absent++;
      else if (a.status === 'Leave') statsMap[key].leave++;
      else if (a.status === 'Half Day') statsMap[key].half++;
    }
    const rows = people.map((p, i) => {
      const st = statsMap[p.id] || { present: 0, absent: 0, leave: 0, half: 0, total: 0 };
      const pct = st.total ? (st.present / st.total * 100).toFixed(1) : '—';
      return '<tr><td>' + (i+1) + '</td><td>' + p.name + '</td><td>' + st.total + '</td><td>' + st.present + '</td><td>' + st.absent + '</td><td>' + st.leave + '</td><td>' + st.half + '</td><td>' + (pct !== '—' ? pct + '%' : '—') + '</td></tr>';
    }).join('');
    const win = window.open('', '_blank');
    win.document.write(
      '<html><head><title>Attendance Report</title><style>' +
        '@page { size: A4 landscape; margin: 8mm; }' +
        'body { font-family: "Times New Roman", serif; padding:16px; }' +
        'h2 { text-align:center; }' +
        '.sub { text-align:center; color:#555; margin-bottom:12px; }' +
        'table { width:100%; border-collapse:collapse; font-size:11px; }' +
        'th, td { border:1px solid #333; padding:4px 6px; text-align:center; }' +
        'th { background:#f0f0f0; }' +
      '</style></head><body>' +
        '<h2>Attendance Report</h2>' +
        '<div class="sub">' + type.charAt(0).toUpperCase() + type.slice(1) + ' | ' + from + ' to ' + to + '</div>' +
        '<table><thead><tr><th>SN</th><th>Name</th><th>Total</th><th>Present</th><th>Absent</th><th>Leave</th><th>Half Day</th><th>%</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table>' +
        '<script>window.onload=function(){window.print();window.close();}<\/script>' +
      '</body></html>');
    win.document.close();
  },

  /* ======= Student Report ======= */

  async renderStudentReport() {
    const sRes = await api.getStudents({ session: this.state.session });
    const students = sRes.success ? sRes.data : [];
    this.state._srStudents = students;
    document.getElementById('pageContent').innerHTML = `
      <div class="filter-bar">
        <div class="form-group"><label>Class</label>
          <select class="form-control" id="srClass" onchange="App.renderSRTable()">
            ${_classOptsAll()}
          </select>
        </div>
        <div class="form-group"><label>Faculty</label>
          <select class="form-control" id="srFaculty" onchange="App.renderSRTable()">
            <option value="">All</option><option value="Common">Common</option><option value="General">General</option><option value="Technical">Technical</option>
          </select>
        </div>
        <div class="form-group"><label>Search</label><input class="form-control" id="srSearch" placeholder="Name / Roll..." oninput="App.renderSRTable()"></div>
        <div class="form-group" style="justify-content:end;">
          <button class="btn btn-primary" onclick="App.printSR()"><i class="fas fa-print"></i> Print</button>
        </div>
      </div>
      <div id="srSummary" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px;"></div>
      <div class="table-container"><table class="table"><thead><tr>
        <th>SN</th><th>Roll</th><th>Name</th><th>Gender</th><th>DOB</th><th>Father</th><th>Mother</th><th>Phone</th><th>Class</th><th>Faculty</th>
      </tr></thead><tbody id="srTableBody"></tbody></table></div>`;
    this.renderSRTable();
  },

  renderSRTable() {
    const cls = document.getElementById('srClass')?.value || '';
    const faculty = document.getElementById('srFaculty')?.value || '';
    const search = (document.getElementById('srSearch')?.value || '').toLowerCase();
    let students = this.state._srStudents || [];
    if (cls) students = students.filter(s => s.class === cls);
    if (faculty) students = students.filter(s => s.faculty === faculty);
    if (search) students = students.filter(s => s.name.toLowerCase().includes(search) || s.roll_no?.toString().includes(search));
    const tbody = document.getElementById('srTableBody');
    if (tbody) {
      tbody.innerHTML = students.length ? students.map((s, i) =>
        `<tr>
          <td>${i+1}</td><td>${s.roll_no||'-'}</td><td>${s.name}</td><td>${s.gender||'-'}</td>
          <td>${s.dob||'-'}</td><td>${s.father_name||'-'}</td><td>${s.mother_name||'-'}</td>
          <td>${s.phone||'-'}</td><td>${s.class||'-'}</td><td>${s.faculty||'-'}</td>
        </tr>`
      ).join('') : '<tr><td colspan="10" class="text-center text-muted">No students</td></tr>';
    }
    const summaryEl = document.getElementById('srSummary');
    if (summaryEl) {
      const total = students.length;
      const male = students.filter(s => s.gender === 'Male').length;
      const female = students.filter(s => s.gender === 'Female').length;
      const other = students.filter(s => s.gender && s.gender !== 'Male' && s.gender !== 'Female').length;
      summaryEl.innerHTML = `
        <div class="card" style="padding:12px 16px;border-radius:var(--radius);box-shadow:var(--shadow);text-align:center;">
          <div style="font-size:22px;font-weight:700;">${total}</div><div style="font-size:11px;color:var(--text-muted);">Total</div>
        </div>
        <div class="card" style="padding:12px 16px;border-radius:var(--radius);box-shadow:var(--shadow);text-align:center;">
          <div style="font-size:22px;font-weight:700;color:#2563eb;">${male}</div><div style="font-size:11px;color:var(--text-muted);">Male</div>
        </div>
        <div class="card" style="padding:12px 16px;border-radius:var(--radius);box-shadow:var(--shadow);text-align:center;">
          <div style="font-size:22px;font-weight:700;color:#ec4899;">${female}</div><div style="font-size:11px;color:var(--text-muted);">Female</div>
        </div>
        <div class="card" style="padding:12px 16px;border-radius:var(--radius);box-shadow:var(--shadow);text-align:center;">
          <div style="font-size:22px;font-weight:700;color:#8b5cf6;">${other}</div><div style="font-size:11px;color:var(--text-muted);">Other</div>
        </div>`;
    }
  },

  printSR() {
    const html = document.querySelector('#srTableBody')?.innerHTML;
    if (!html || html.includes('No students')) return this.notify('No data to print', 'warning');
    const cls = document.getElementById('srClass')?.value || 'All';
    const faculty = document.getElementById('srFaculty')?.value || 'All';
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Student Report</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:11px;padding:16px;}
        @page{size:A4 landscape;margin:10mm;}
        table{width:100%;border-collapse:collapse;}
        th,td{border:1px solid #333;padding:4px 6px;text-align:left;}
        th{background:#f0f0f0;}
        h2{text-align:center;margin-bottom:4px;}
        .sub{text-align:center;color:#555;margin-bottom:10px;font-size:12px;}
      </style></head><body>
        <h2>Student Report - ${this.state.session}</h2>
        <div class="sub">Class: ${cls} | Faculty: ${faculty}</div>
        <table><thead><tr><th>SN</th><th>Roll</th><th>Name</th><th>Gender</th><th>DOB</th><th>Father</th><th>Mother</th><th>Phone</th><th>Class</th><th>Faculty</th></tr></thead>
        <tbody>${html}</tbody></table>
        <p style="margin-top:8px;font-size:10px;color:#999;">Generated: ${new Date().toLocaleString()}</p>
      </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  },

  /* ======= Exam Report ======= */

  async renderExamReport() {
    document.getElementById('pageContent').innerHTML = `
      <div class="filter-bar">
        <div class="form-group"><label>Class</label>
          <select class="form-control" id="erClass" onchange="App.loadERData()">
            ${_classOpts()}
          </select>
        </div>
        <div class="form-group"><label>Faculty</label>
          <select class="form-control" id="erFaculty" onchange="App.loadERData()">
            <option value="">All</option><option value="Common">Common</option><option value="General">General</option><option value="Technical">Technical</option>
          </select>
        </div>
        <div class="form-group"><label>Exam Type</label>
          <select class="form-control" id="erExam" onchange="App.loadERData()">
            <option value="Terminal">Terminal</option><option value="Final">Final</option>
          </select>
        </div>
        <button class="btn btn-primary" onclick="App.loadERData()"><i class="fas fa-search"></i> Load</button>
        <button class="btn btn-outline-primary" onclick="App.printER()"><i class="fas fa-print"></i> Print</button>
      </div>
      <div id="erSummary" style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:14px;"></div>
      <div id="erGradeDist"></div>
      <div class="table-container" style="margin-top:12px;">
        <table class="table"><thead><tr>
          <th>SN</th><th>Roll</th><th>Name</th><th>GPA</th><th>Grade</th><th>Status</th>
        </tr></thead><tbody id="erTableBody"></tbody></table>
      </div>`;
    await this.loadERData();
  },

  async loadERData() {
    const cls = document.getElementById('erClass')?.value;
    const faculty = document.getElementById('erFaculty')?.value || '';
    const examType = document.getElementById('erExam')?.value || 'Terminal';
    const q = { session: this.state.session, class: cls, exam_type: examType };
    if (faculty) q.faculty = faculty;
    const rRes = await api.getResults(q);
    const results = rRes.success ? rRes.data : [];
    this.state._erResults = results;
    const tbody = document.getElementById('erTableBody');
    if (tbody) {
      tbody.innerHTML = results.length ? results.map((r, i) =>
        `<tr>
          <td>${i+1}</td><td>${r.roll_no||'-'}</td><td>${r.student_name||'-'}</td>
          <td>${r.gpa ? parseFloat(r.gpa).toFixed(2) : '-'}</td>
          <td><span class="grade-badge grade-${r.grade||'NG'}">${r.grade||'NG'}</span></td>
          <td>${r.status||'-'}</td>
        </tr>`
      ).join('') : '<tr><td colspan="6" class="text-center text-muted">No results found</td></tr>';
    }
    // Summary
    const total = results.length;
    const passed = results.filter(r => r.status === 'Passed').length;
    const failed = results.filter(r => r.status === 'Failed').length;
    const appeared = results.filter(r => r.status).length;
    const passPct = appeared ? ((passed / appeared) * 100).toFixed(1) : 0;
    const gpaSum = results.reduce((s, r) => s + (parseFloat(r.gpa) || 0), 0);
    const avgGpa = results.length ? (gpaSum / results.length).toFixed(2) : '—';
    const summaryEl = document.getElementById('erSummary');
    if (summaryEl) {
      summaryEl.innerHTML = `
        <div class="card" style="padding:12px;border-radius:var(--radius);box-shadow:var(--shadow);text-align:center;">
          <div style="font-size:20px;font-weight:700;">${total}</div><div style="font-size:10px;color:var(--text-muted);">Total</div>
        </div>
        <div class="card" style="padding:12px;border-radius:var(--radius);box-shadow:var(--shadow);text-align:center;">
          <div style="font-size:20px;font-weight:700;">${appeared}</div><div style="font-size:10px;color:var(--text-muted);">Appeared</div>
        </div>
        <div class="card" style="padding:12px;border-radius:var(--radius);box-shadow:var(--shadow);text-align:center;">
          <div style="font-size:20px;font-weight:700;color:var(--success);">${passed}</div><div style="font-size:10px;color:var(--text-muted);">Passed</div>
        </div>
        <div class="card" style="padding:12px;border-radius:var(--radius);box-shadow:var(--shadow);text-align:center;">
          <div style="font-size:20px;font-weight:700;color:var(--danger);">${failed}</div><div style="font-size:10px;color:var(--text-muted);">Failed</div>
        </div>
        <div class="card" style="padding:12px;border-radius:var(--radius);box-shadow:var(--shadow);text-align:center;">
          <div style="font-size:20px;font-weight:700;color:var(--primary);">${passPct}%</div><div style="font-size:10px;color:var(--text-muted);">Pass %</div>
        </div>`;
    }
    // Grade distribution
    const grades = ['A+','A','B+','B','C+','C','D','E','NG'];
    const gradeCount = {};
    grades.forEach(g => gradeCount[g] = 0);
    results.forEach(r => { const g = r.grade || 'NG'; if (gradeCount[g] !== undefined) gradeCount[g]++; });
    const maxGrade = Math.max(...Object.values(gradeCount), 1);
    const distEl = document.getElementById('erGradeDist');
    if (distEl) {
      distEl.innerHTML = `
        <div class="card" style="padding:14px 18px;border-radius:var(--radius);box-shadow:var(--shadow);">
          <h4 style="font-size:13px;margin:0 0 8px;">Grade Distribution</h4>
          <div style="display:flex;gap:4px;align-items:end;height:60px;">
            ${grades.filter(g => gradeCount[g] > 0).map(g => `
              <div style="flex:1;display:flex;flex-direction:column;align-items:center;">
                <span style="font-size:10px;font-weight:600;">${gradeCount[g]}</span>
                <div style="width:100%;height:${(gradeCount[g]/maxGrade)*50}px;background:${g==='A+'?'#059669':g==='A'?'#10b981':g==='B+'?'#34d399':g==='B'?'#facc15':g==='C+'?'#f59e0b':g==='C'?'#f97316':g==='D'?'#ef4444':g==='E'?'#dc2626':'#6b7280'};border-radius:4px 4px 0 0;min-height:4px;width:80%;"></div>
                <span style="font-size:9px;color:var(--text-muted);margin-top:2px;">${g}</span>
              </div>
            `).join('')}
          </div>
        </div>`;
    }
  },

  printER() {
    const html = document.querySelector('#erTableBody')?.innerHTML;
    if (!html || html.includes('No results')) return this.notify('No data to print', 'warning');
    const cls = document.getElementById('erClass')?.value || '';
    const exam = document.getElementById('erExam')?.value || '';
    const faculty = document.getElementById('erFaculty')?.value || 'All';
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Exam Report</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:11px;padding:16px;}
        @page{size:A4 landscape;margin:10mm;}
        table{width:100%;border-collapse:collapse;}
        th,td{border:1px solid #333;padding:4px 6px;text-align:left;}
        th{background:#f0f0f0;}
        h2{text-align:center;margin-bottom:4px;}
        .sub{text-align:center;color:#555;margin-bottom:10px;font-size:12px;}
      </style></head><body>
        <h2>Exam Report - ${this.state.session}</h2>
        <div class="sub">Class: ${cls} | Faculty: ${faculty} | Exam: ${exam}</div>
        <table><thead><tr><th>SN</th><th>Roll</th><th>Name</th><th>GPA</th><th>Grade</th><th>Status</th></tr></thead>
        <tbody>${html}</tbody></table>
        <p style="margin-top:8px;font-size:10px;color:#999;">Generated: ${new Date().toLocaleString()}</p>
      </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  },

  /* ======= Fee Report ======= */

  async renderFeeReport() {
    const [sRes, fRes, cRes] = await Promise.all([
      api.getStudents({ session: this.state.session }),
      api.getFeeItems({ session: this.state.session }),
      api.getFeeCollections({ session: this.state.session })
    ]);
    const students = sRes.success ? sRes.data : [];
    const feeItems = fRes.success ? fRes.data : [];
    const collections = cRes.success ? cRes.data : [];
    this.state._frStudents = students;
    this.state._frFeeItems = feeItems;
    this.state._frCollections = collections;
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('pageContent').innerHTML = `
      <div class="filter-bar">
        <div class="form-group"><label>From</label><input class="form-control" id="frFrom" type="date"></div>
        <div class="form-group"><label>To</label><input class="form-control" id="frTo" type="date" value="${today}"></div>
        <div class="form-group"><label>Class</label>
          <select class="form-control" id="frClass" onchange="App.renderFRTable()">
            ${_classOptsAll()}
          </select>
        </div>
        <div class="form-group"><label>Faculty</label>
          <select class="form-control" id="frFaculty" onchange="App.renderFRTable()">
            <option value="">All</option><option value="Common">Common</option><option value="General">General</option><option value="Technical">Technical</option>
          </select>
        </div>
        <button class="btn btn-primary" onclick="App.renderFRTable()"><i class="fas fa-search"></i> Load</button>
        <button class="btn btn-outline-primary" onclick="App.printFR()"><i class="fas fa-print"></i> Print</button>
      </div>
      <div id="frSummary" style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:14px;"></div>
      <div class="table-container"><table class="table"><thead><tr>
        <th>SN</th><th>Roll</th><th>Name</th><th>Class</th><th>Faculty</th>
        <th style="text-align:right;">Payable</th><th style="text-align:right;">Paid</th><th style="text-align:right;">Discount</th><th style="text-align:right;">Due</th><th>%</th>
      </tr></thead><tbody id="frTableBody"></tbody></table></div>`;
    this.renderFRTable();
  },

  renderFRTable() {
    const cls = document.getElementById('frClass')?.value || '';
    const faculty = document.getElementById('frFaculty')?.value || '';
    const students = this.state._frStudents || [];
    const feeItems = this.state._frFeeItems || [];
    const collections = this.state._frCollections || [];
    const from = document.getElementById('frFrom')?.value || '';
    const to = document.getElementById('frTo')?.value || '';
    let filtered = students;
    if (cls) filtered = filtered.filter(s => s.class === cls);
    if (faculty) filtered = filtered.filter(s => s.faculty === faculty);
    const data = filtered.map(s => {
      const applicableItems = feeItems.filter(f => (!f.class || f.class === s.class) && (!f.faculty || f.faculty === s.faculty));
      const payable = applicableItems.reduce((sum, f) => sum + parseFloat(f.amount), 0);
      let colls = collections.filter(c => c.student_id == s.id);
      if (from && to) colls = colls.filter(c => c.date >= from && c.date <= to);
      const paid = colls.reduce((sum, c) => sum + parseFloat(c.paid_amount || 0), 0);
      const discount = colls.reduce((sum, c) => sum + parseFloat(c.discount || 0), 0);
      const due = Math.max(0, payable - paid - discount);
      return { ...s, payable, paid, discount, due };
    });
    this.state._frData = data;
    const tbody = document.getElementById('frTableBody');
    if (tbody) {
      tbody.innerHTML = data.length ? data.map((d, i) => {
        const pct = d.payable > 0 ? Math.round((d.paid / d.payable) * 100) : 0;
        return `<tr style="${d.due > 0 ? 'background:#fff3f3;' : ''}">
          <td>${i+1}</td><td>${d.roll_no||'-'}</td><td>${d.name}</td><td>${d.class||'-'}</td><td>${d.faculty||'-'}</td>
          <td style="text-align:right;">Rs. ${d.payable.toLocaleString()}</td>
          <td style="text-align:right;color:var(--success);">Rs. ${d.paid.toLocaleString()}</td>
          <td style="text-align:right;">${d.discount > 0 ? 'Rs. '+d.discount.toLocaleString() : '-'}</td>
          <td style="text-align:right;color:var(--danger);font-weight:700;">${d.due > 0 ? 'Rs. '+d.due.toLocaleString() : '-'}</td>
          <td><div style="display:flex;align-items:center;gap:4px;"><div style="flex:1;height:5px;background:#eee;border-radius:3px;"><div style="height:5px;border-radius:3px;width:${pct}%;background:${d.due > 0 ? 'var(--warning)' : 'var(--success)'};"></div></div><span style="font-size:10px;">${pct}%</span></div></td>
        </tr>`;
      }).join('') : '<tr><td colspan="10" class="text-center text-muted">No students</td></tr>';
    }
    const summaryEl = document.getElementById('frSummary');
    if (summaryEl) {
      const total = data.length;
      const totalPayable = data.reduce((s, d) => s + d.payable, 0);
      const totalPaid = data.reduce((s, d) => s + d.paid, 0);
      const totalDue = data.reduce((s, d) => s + d.due, 0);
      const rate = totalPayable > 0 ? ((totalPaid / totalPayable) * 100).toFixed(1) : 0;
      summaryEl.innerHTML = `
        <div class="card" style="padding:12px;border-radius:var(--radius);box-shadow:var(--shadow);text-align:center;">
          <div style="font-size:20px;font-weight:700;">${total}</div><div style="font-size:10px;color:var(--text-muted);">Students</div>
        </div>
        <div class="card" style="padding:12px;border-radius:var(--radius);box-shadow:var(--shadow);text-align:center;">
          <div style="font-size:20px;font-weight:700;">Rs. ${totalPayable.toLocaleString()}</div><div style="font-size:10px;color:var(--text-muted);">Payable</div>
        </div>
        <div class="card" style="padding:12px;border-radius:var(--radius);box-shadow:var(--shadow);text-align:center;">
          <div style="font-size:20px;font-weight:700;color:var(--success);">Rs. ${totalPaid.toLocaleString()}</div><div style="font-size:10px;color:var(--text-muted);">Collected</div>
        </div>
        <div class="card" style="padding:12px;border-radius:var(--radius);box-shadow:var(--shadow);text-align:center;">
          <div style="font-size:20px;font-weight:700;color:var(--danger);">Rs. ${totalDue.toLocaleString()}</div><div style="font-size:10px;color:var(--text-muted);">Due</div>
        </div>
        <div class="card" style="padding:12px;border-radius:var(--radius);box-shadow:var(--shadow);text-align:center;">
          <div style="font-size:20px;font-weight:700;color:var(--primary);">${rate}%</div><div style="font-size:10px;color:var(--text-muted);">Collection Rate</div>
        </div>`;
    }
  },

  printFR() {
    const html = document.querySelector('#frTableBody')?.innerHTML;
    if (!html || html.includes('No students')) return this.notify('No data to print', 'warning');
    const cls = document.getElementById('frClass')?.value || 'All';
    const faculty = document.getElementById('frFaculty')?.value || 'All';
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Fee Report</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:10px;padding:16px;}
        @page{size:A4 landscape;margin:10mm;}
        table{width:100%;border-collapse:collapse;}
        th,td{border:1px solid #333;padding:3px 5px;text-align:left;}
        th{background:#f0f0f0;}
        h2{text-align:center;margin-bottom:4px;}
        .sub{text-align:center;color:#555;margin-bottom:10px;font-size:11px;}
        .text-right{text-align:right;}
      </style></head><body>
        <h2>Fee Report - ${this.state.session}</h2>
        <div class="sub">Class: ${cls} | Faculty: ${faculty}</div>
        <table><thead><tr><th>SN</th><th>Roll</th><th>Name</th><th>Class</th><th>Faculty</th><th style="text-align:right;">Payable</th><th style="text-align:right;">Paid</th><th style="text-align:right;">Discount</th><th style="text-align:right;">Due</th><th>%</th></tr></thead>
        <tbody>${html.replace(/style="[^"]*"/g, '')}</tbody></table>
        <p style="margin-top:8px;font-size:10px;color:#999;">Generated: ${new Date().toLocaleString()}</p>
      </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  },

  /* ======= Fee Setup ======= */

  async renderFeeSetup() {
    document.getElementById('pageContent').innerHTML = `
      <div class="filter-bar">
        <div class="form-group"><label>Class</label>
          <select class="form-control" id="fsClassFilter" onchange="App.renderFeeTable()">
            ${_classOptsAll()}
          </select>
        </div>
        <div class="form-group"><label>Faculty</label>
          <select class="form-control" id="fsFacultyFilter" onchange="App.renderFeeTable()">
            <option value="">All</option><option value="Common">Common</option><option value="General">General</option><option value="Technical">Technical</option>
          </select>
        </div>
        <button class="btn btn-primary" onclick="App.showAddFeeModal()"><i class="fas fa-plus"></i> Add Fee Item</button>
      </div>
      <div class="table-container">
        <table>
          <thead><tr><th>SN</th><th>Fee Name</th><th>Amount (Rs.)</th><th>Class</th><th>Faculty</th><th>Session</th><th>Action</th></tr></thead>
          <tbody id="fsTableBody"></tbody>
        </table>
      </div>`;
    await this.loadFeeData();
  },

  async loadFeeData() {
    const fRes = await api.getFeeItems({ session: this.state.session });
    this.state._feeItems = fRes.success ? fRes.data : [];
    this.renderFeeTable();
  },

  renderFeeTable() {
    const cls = document.getElementById('fsClassFilter')?.value || '';
    const faculty = document.getElementById('fsFacultyFilter')?.value || '';
    let items = this.state._feeItems || [];
    if (cls) items = items.filter(i => !i.class || i.class === cls);
    if (faculty) items = items.filter(i => !i.faculty || i.faculty === faculty);
    const tbody = document.getElementById('fsTableBody');
    if (tbody) {
      tbody.innerHTML = items.length ? items.map((f, i) => `
        <tr>
          <td>${i+1}</td>
          <td>${f.name}</td>
          <td>${parseFloat(f.amount).toLocaleString()}</td>
          <td>${f.class || 'All'}</td>
          <td>${f.faculty || 'All'}</td>
          <td>${f.session}</td>
          <td>
            <button class="btn btn-sm btn-outline" onclick="App.showEditFeeModal(${f.id})"><i class="fas fa-edit"></i></button>
            <button class="btn btn-sm btn-danger" onclick="App.deleteFeeItem(${f.id})"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`).join('') : '<tr><td colspan="7" class="text-center text-muted">No fee items set up. Click Add Fee Item to create one.</td></tr>';
    }
  },

  showAddFeeModal() {
    this.showModal(`
      <h3>Add Fee Item</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:8px 0;">
        <div class="form-group" style="grid-column:1/-1;"><label>Fee Name *</label><input class="form-control" id="fsName" placeholder="e.g. Tuition Fee"></div>
        <div class="form-group"><label>Amount (Rs.) *</label><input class="form-control" id="fsAmount" type="number" step="0.01" min="0"></div>
        <div class="form-group"><label>Class</label>
          <select class="form-control" id="fsClass">${_classOptsAll()}</select>
        </div>
        <div class="form-group"><label>Faculty</label>
          <select class="form-control" id="fsFaculty"><option value="">All</option><option value="Common">Common</option><option value="General">General</option><option value="Technical">Technical</option></select>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="App.saveFeeItem()"><i class="fas fa-save"></i> Save</button>
        <button class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
      </div>`);
  },

  showEditFeeModal(id) {
    const f = (this.state._feeItems || []).find(x => x.id == id);
    if (!f) return;
    this._editFeeId = id;
    this.showModal(`
      <h3>Edit Fee Item</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:8px 0;">
        <div class="form-group" style="grid-column:1/-1;"><label>Fee Name *</label><input class="form-control" id="fsName" value="${f.name}"></div>
        <div class="form-group"><label>Amount (Rs.) *</label><input class="form-control" id="fsAmount" type="number" step="0.01" min="0" value="${f.amount}"></div>
        <div class="form-group"><label>Class</label>
          <select class="form-control" id="fsClass">${_classOptsAll(f.class)}</select>
        </div>
        <div class="form-group"><label>Faculty</label>
          <select class="form-control" id="fsFaculty"><option value="">All</option><option value="Common" ${f.faculty==='Common'?'selected':''}>Common</option><option value="General" ${f.faculty==='General'?'selected':''}>General</option><option value="Technical" ${f.faculty==='Technical'?'selected':''}>Technical</option></select>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="App.saveFeeItem(${id})"><i class="fas fa-save"></i> Update</button>
        <button class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
      </div>`);
  },

  async saveFeeItem(editId) {
    const name = document.getElementById('fsName')?.value?.trim();
    const amount = parseFloat(document.getElementById('fsAmount')?.value);
    const cls = document.getElementById('fsClass')?.value || '';
    const faculty = document.getElementById('fsFaculty')?.value || '';
    if (!name) return this.notify('Enter fee name', 'warning');
    if (!amount || amount <= 0) return this.notify('Enter valid amount', 'warning');
    if (editId) {
      const res = await api.updateFeeItem(editId, { name, amount, class: cls, faculty });
      if (!res.success) return this.notify('Update failed', 'error');
      this.notify('Fee item updated');
    } else {
      const res = await api.addFeeItem({ name, amount, class: cls, faculty, session: this.state.session });
      if (!res.success) return this.notify('Save failed', 'error');
      this.notify('Fee item added');
    }
    this.closeModal();
    await this.loadFeeData();
  },

  async deleteFeeItem(id) {
    if (!confirm('Delete this fee item?')) return;
    const res = await api.deleteFeeItem(id);
    if (!res.success) return this.notify('Delete failed', 'error');
    this.notify('Fee item deleted');
    await this.loadFeeData();
  },

  /* ======= Fee Collection ======= */

  async renderFeeCollection() {
    const [sRes, fRes] = await Promise.all([
      api.getStudents({ session: this.state.session }),
      api.getFeeItems({ session: this.state.session })
    ]);
    const students = sRes.success ? sRes.data : [];
    const feeItems = fRes.success ? fRes.data : [];
    this.state._fcStudents = students;
    this.state._fcFeeItems = feeItems;
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('pageContent').innerHTML = `
      <div class="filter-bar">
        <div class="form-group"><label>Class</label>
          <select class="form-control" id="fcClassFilter" onchange="App.renderFCStudentSelect()">
            ${_classOptsAll()}
          </select>
        </div>
        <div class="form-group"><label>Faculty</label>
          <select class="form-control" id="fcFacultyFilter" onchange="App.renderFCStudentSelect()">
            <option value="">All</option><option value="Common">Common</option><option value="General">General</option><option value="Technical">Technical</option>
          </select>
        </div>
        <div class="form-group"><label>Student</label>
          <select class="form-control" id="fcStudentSelect" onchange="App.loadFCDetails()">
            <option value="">— Select —</option>
          </select>
        </div>
      </div>
      <div id="fcContent" style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
        <div>
          <div class="card" style="background:var(--card);border-radius:var(--radius);padding:16px 20px;box-shadow:var(--shadow);">
            <h3 style="font-size:14px;margin-bottom:10px;">Fee Collection</h3>
            <div id="fcFormArea">
              <p class="text-muted" style="font-size:13px;">Select a student to collect fees</p>
            </div>
          </div>
        </div>
        <div>
          <div class="card" style="background:var(--card);border-radius:var(--radius);padding:16px 20px;box-shadow:var(--shadow);">
            <h3 style="font-size:14px;margin-bottom:10px;">Collection History</h3>
            <div id="fcHistoryArea">
              <p class="text-muted" style="font-size:13px;">Select a student to view history</p>
            </div>
          </div>
        </div>
      </div>`;
    this.renderFCStudentSelect();
  },

  renderFCStudentSelect() {
    const cls = document.getElementById('fcClassFilter')?.value || '';
    const faculty = document.getElementById('fcFacultyFilter')?.value || '';
    let students = this.state._fcStudents || [];
    if (cls) students = students.filter(s => s.class === cls);
    if (faculty) students = students.filter(s => s.faculty === faculty);
    const sel = document.getElementById('fcStudentSelect');
    if (sel) {
      const val = sel.value;
      sel.innerHTML = '<option value="">— Select —</option>' + students.map(s =>
        `<option value="${s.id}" ${s.id==val?'selected':''}>${s.roll_no} - ${s.name} (${s.class})</option>`
      ).join('');
    }
  },

  async loadFCDetails() {
    const studentId = document.getElementById('fcStudentSelect').value;
    if (!studentId) {
      document.getElementById('fcFormArea').innerHTML = '<p class="text-muted" style="font-size:13px;">Select a student to collect fees</p>';
      document.getElementById('fcHistoryArea').innerHTML = '<p class="text-muted" style="font-size:13px;">Select a student to view history</p>';
      return;
    }
    const student = (this.state._fcStudents || []).find(s => s.id == studentId);
    if (!student) return;
    // Fee items applicable to this student
    const feeItems = (this.state._fcFeeItems || []).filter(f =>
      (!f.class || f.class === student.class) && (!f.faculty || f.faculty === student.faculty)
    );
    // Collection history
    const cRes = await api.getFeeCollections({ student_id: studentId, session: this.state.session });
    const collections = cRes.success ? cRes.data : [];
    const today = new Date().toISOString().split('T')[0];
    // Form
    const formHtml = `
      <div style="font-size:13px;">
        <p><strong>${student.name}</strong> | Roll: ${student.roll_no} | ${student.class} | ${student.faculty}</p>
        ${feeItems.length ? feeItems.map((f, i) => `
          <label style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--border);">
            <input type="checkbox" class="fc-item-cb" data-id="${f.id}" data-name="${f.name}" data-amount="${f.amount}" checked onchange="App.updateFCTotal()">
            <span style="flex:1;">${f.name}</span>
            <span>Rs. ${parseFloat(f.amount).toLocaleString()}</span>
          </label>
        `).join('') : '<p class="text-muted">No fee items configured for this student</p>'}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;">
          <div class="form-group"><label>Total</label><input class="form-control" id="fcTotal" readonly style="font-weight:700;"></div>
          <div class="form-group"><label>Paid Amount *</label><input class="form-control" id="fcPaid" type="number" step="0.01" min="0" oninput="App.updateFCDue()"></div>
          <div class="form-group"><label>Discount</label><input class="form-control" id="fcDiscount" type="number" step="0.01" min="0" value="0" oninput="App.updateFCDue()"></div>
          <div class="form-group"><label>Due</label><input class="form-control" id="fcDue" readonly></div>
          <div class="form-group"><label>Payment Method</label>
            <select class="form-control" id="fcMethod"><option>Cash</option><option>Bank</option><option>Mobile Banking</option><option>Card</option></select>
          </div>
          <div class="form-group"><label>Date</label><input class="form-control" id="fcDate" type="date" value="${today}"></div>
          <div class="form-group" style="grid-column:1/-1;"><label>Remarks</label><textarea class="form-control" id="fcRemarks" rows="2"></textarea></div>
        </div>
        <button class="btn btn-primary" onclick="App.saveFeeCollection(${studentId})" style="margin-top:10px;"><i class="fas fa-save"></i> Collect Fee</button>
      </div>`;
    document.getElementById('fcFormArea').innerHTML = formHtml;
    this.updateFCTotal();
    // History
    const histHtml = collections.length ? collections.map(c => `
      <div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:12px;">
        <div style="display:flex;justify-content:space-between;">
          <span><strong>${c.date}</strong></span>
          <span style="color:var(--success);font-weight:700;">Rs. ${parseFloat(c.paid_amount).toLocaleString()}</span>
        </div>
        <div style="color:var(--text-muted);font-size:11px;">Method: ${c.payment_method}${c.remarks ? ' | ' + c.remarks : ''}</div>
      </div>
    `).join('') : '<p class="text-muted" style="font-size:12px;">No collections yet</p>';
    document.getElementById('fcHistoryArea').innerHTML = '<h4 style="font-size:12px;margin-bottom:8px;">Total Paid: Rs. ' + collections.reduce((s, c) => s + parseFloat(c.paid_amount), 0).toLocaleString() + '</h4>' + histHtml;
  },

  updateFCTotal() {
    let total = 0;
    document.querySelectorAll('.fc-item-cb:checked').forEach(cb => {
      total += parseFloat(cb.dataset.amount);
    });
    const totalEl = document.getElementById('fcTotal');
    if (totalEl) totalEl.value = total.toFixed(2);
    const paidEl = document.getElementById('fcPaid');
    if (paidEl && !paidEl.value) paidEl.value = total.toFixed(2);
    this.updateFCDue();
  },

  updateFCDue() {
    const total = parseFloat(document.getElementById('fcTotal')?.value || 0);
    const paid = parseFloat(document.getElementById('fcPaid')?.value || 0);
    const discount = parseFloat(document.getElementById('fcDiscount')?.value || 0);
    const dueEl = document.getElementById('fcDue');
    if (dueEl) dueEl.value = Math.max(0, total - paid - discount).toFixed(2);
  },

  async saveFeeCollection(studentId) {
    const items = [...document.querySelectorAll('.fc-item-cb:checked')].map(cb => ({
      fee_item_id: parseInt(cb.dataset.id),
      fee_name: cb.dataset.name,
      amount: parseFloat(cb.dataset.amount)
    }));
    if (!items.length) return this.notify('No fee items selected', 'warning');
    const totalAmount = items.reduce((s, i) => s + i.amount, 0);
    const paidAmount = parseFloat(document.getElementById('fcPaid')?.value || 0);
    const discount = parseFloat(document.getElementById('fcDiscount')?.value || 0);
    const paymentMethod = document.getElementById('fcMethod')?.value || 'Cash';
    const date = document.getElementById('fcDate')?.value || new Date().toISOString().split('T')[0];
    const remarks = document.getElementById('fcRemarks')?.value || '';
    if (paidAmount <= 0) return this.notify('Enter paid amount', 'warning');
    const res = await api.saveFeeCollection({
      student_id: parseInt(studentId),
      session: this.state.session,
      total_amount: totalAmount,
      paid_amount: paidAmount,
      discount,
      payment_method: paymentMethod,
      remarks,
      date,
      items
    });
    if (!res.success) return this.notify('Save failed', 'error');
    this.notify('Fee collected successfully');
    this.loadFCDetails();
  },

  /* ======= Due List ======= */

  async renderDueList() {
    const [sRes, fRes, cRes] = await Promise.all([
      api.getStudents({ session: this.state.session }),
      api.getFeeItems({ session: this.state.session }),
      api.getFeeCollections({ session: this.state.session })
    ]);
    const students = sRes.success ? sRes.data : [];
    const feeItems = fRes.success ? fRes.data : [];
    const collections = cRes.success ? cRes.data : [];
    this.state._dlStudents = students;
    this.state._dlFeeItems = feeItems;
    this.state._dlCollections = collections;
    document.getElementById('pageContent').innerHTML = `
      <div class="filter-bar">
        <div class="form-group"><label>Class</label>
          <select class="form-control" id="dlClassFilter" onchange="App.renderDueListTable()">
            ${_classOptsAll()}
          </select>
        </div>
        <div class="form-group"><label>Faculty</label>
          <select class="form-control" id="dlFacultyFilter" onchange="App.renderDueListTable()">
            <option value="">All</option><option value="Common">Common</option><option value="General">General</option><option value="Technical">Technical</option>
          </select>
        </div>
        <div class="form-group"><label>Search</label>
          <input class="form-control" id="dlSearch" placeholder="Name or Roll..." oninput="App.renderDueListTable()">
        </div>
        <div class="form-group"><label>Show</label>
          <select class="form-control" id="dlFilter" onchange="App.renderDueListTable()">
            <option value="due">With Due Only</option>
            <option value="all">All Students</option>
            <option value="paid">Fully Paid</option>
          </select>
        </div>
        <div class="form-group" style="justify-content:end;">
          <button class="btn btn-primary" onclick="App.printDueList()"><i class="fas fa-print"></i> Print</button>
        </div>
      </div>
      <div class="table-container" id="dlTableContainer"></div>`;
    this.renderDueListTable();
  },

  renderDueListTable() {
    const cls = document.getElementById('dlClassFilter')?.value || '';
    const faculty = document.getElementById('dlFacultyFilter')?.value || '';
    const search = (document.getElementById('dlSearch')?.value || '').toLowerCase();
    const filter = document.getElementById('dlFilter')?.value || 'due';
    let students = this.state._dlStudents || [];
    const feeItems = this.state._dlFeeItems || [];
    const collections = this.state._dlCollections || [];
    if (cls) students = students.filter(s => s.class === cls);
    if (faculty) students = students.filter(s => s.faculty === faculty);
    if (search) students = students.filter(s => s.name.toLowerCase().includes(search) || s.roll_no?.toString().includes(search));
    // Compute due per student
    const dueData = students.map(s => {
      const applicableItems = feeItems.filter(f => (!f.class || f.class === s.class) && (!f.faculty || f.faculty === s.faculty));
      const totalPayable = applicableItems.reduce((sum, f) => sum + parseFloat(f.amount), 0);
      const colls = collections.filter(c => c.student_id == s.id);
      const totalPaid = colls.reduce((sum, c) => sum + parseFloat(c.paid_amount || 0), 0);
      const due = Math.max(0, totalPayable - totalPaid);
      return { ...s, totalPayable, totalPaid, due, appliedItems: applicableItems.length };
    });
    // Filter
    let filtered = dueData;
    if (filter === 'due') filtered = dueData.filter(d => d.due > 0);
    else if (filter === 'paid') filtered = dueData.filter(d => d.due === 0 && d.totalPayable > 0);
    // Sort by due desc
    filtered.sort((a, b) => b.due - a.due);
    const totalPayableAll = filtered.reduce((s, d) => s + d.totalPayable, 0);
    const totalPaidAll = filtered.reduce((s, d) => s + d.totalPaid, 0);
    const totalDueAll = filtered.reduce((s, d) => s + d.due, 0);
    document.getElementById('dlTableContainer').innerHTML = `
      <div style="display:flex;gap:20px;margin-bottom:12px;flex-wrap:wrap;">
        <div class="stat-card" style="background:var(--card);border-radius:var(--radius);padding:10px 18px;box-shadow:var(--shadow);flex:1;min-width:120px;">
          <div style="font-size:11px;color:var(--text-muted);">Students</div>
          <div style="font-size:20px;font-weight:700;">${filtered.length}</div>
        </div>
        <div class="stat-card" style="background:var(--card);border-radius:var(--radius);padding:10px 18px;box-shadow:var(--shadow);flex:1;min-width:120px;">
          <div style="font-size:11px;color:var(--text-muted);">Total Payable</div>
          <div style="font-size:20px;font-weight:700;">Rs. ${totalPayableAll.toLocaleString()}</div>
        </div>
        <div class="stat-card" style="background:var(--card);border-radius:var(--radius);padding:10px 18px;box-shadow:var(--shadow);flex:1;min-width:120px;">
          <div style="font-size:11px;color:var(--text-muted);">Total Collected</div>
          <div style="font-size:20px;font-weight:700;color:var(--success);">Rs. ${totalPaidAll.toLocaleString()}</div>
        </div>
        <div class="stat-card" style="background:var(--card);border-radius:var(--radius);padding:10px 18px;box-shadow:var(--shadow);flex:1;min-width:120px;">
          <div style="font-size:11px;color:var(--text-muted);">Total Due</div>
          <div style="font-size:20px;font-weight:700;color:var(--danger);">Rs. ${totalDueAll.toLocaleString()}</div>
        </div>
      </div>
      <table class="table">
        <thead><tr>
          <th>#</th><th>Roll</th><th>Student Name</th><th>Class</th><th>Faculty</th>
          <th style="text-align:right;">Payable</th><th style="text-align:right;">Paid</th><th style="text-align:right;">Due</th><th>%</th><th>Action</th>
        </tr></thead>
        <tbody>${filtered.length ? filtered.map((d, i) => {
          const pct = d.totalPayable > 0 ? Math.round((d.totalPaid / d.totalPayable) * 100) : 0;
          return `<tr style="${d.due > 0 ? 'background:#fff3f3;' : ''}">
            <td>${i+1}</td>
            <td>${d.roll_no || '-'}</td>
            <td>${d.name}</td>
            <td>${d.class || '-'}</td>
            <td>${d.faculty || '-'}</td>
            <td style="text-align:right;">Rs. ${d.totalPayable.toLocaleString()}</td>
            <td style="text-align:right;color:var(--success);">Rs. ${d.totalPaid.toLocaleString()}</td>
            <td style="text-align:right;color:var(--danger);font-weight:700;">${d.due > 0 ? 'Rs. '+d.due.toLocaleString() : '-'}</td>
            <td><div style="display:flex;align-items:center;gap:6px;"><div style="flex:1;height:6px;background:#eee;border-radius:3px;"><div style="height:6px;border-radius:3px;width:${pct}%;background:${d.due > 0 ? 'var(--warning)' : 'var(--success)'};"></div></div><span style="font-size:11px;">${pct}%</span></div></td>
            <td><button class="btn btn-sm btn-outline-primary" onclick="App.navigate('fee-collection', ${d.id})"><i class="fas fa-hand-holding-usd"></i> Collect</button></td>
          </tr>`;
        }).join('') : '<tr><td colspan="10" class="text-center text-muted">No records found</td></tr>'}</tbody>
      </table>`;
  },

  async printDueList() {
    const html = document.getElementById('dlTableContainer')?.querySelector('table')?.outerHTML;
    if (!html) return this.notify('No data to print', 'warning');
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Due List</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:12px;padding:20px;}
        table{width:100%;border-collapse:collapse;}
        th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;}
        th{background:#f5f5f5;}
        .text-right{text-align:right;}
        h2{text-align:center;margin-bottom:10px;}
      </style></head><body>
      <h2>Due List - ${this.state.session}</h2>
      ${html.replace(/style="[^"]*"/g, '').replace(/<button[^>]*>.*?<\/button>/g, '').replace(/<i[^>]*>.*?<\/i>/g, '')}
      <p style="text-align:right;margin-top:10px;">Generated: ${new Date().toLocaleDateString()}</p>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  },

  /* ======= Receipt Print ======= */

  async renderReceiptPrint() {
    const [sRes, settingsRes] = await Promise.all([
      api.getStudents({ session: this.state.session }),
      api.getAllSettings()
    ]);
    const students = sRes.success ? sRes.data : [];
    const settings = settingsRes.success ? settingsRes.data : {};
    this.state._rpStudents = students;
    this.state._rpSettings = settings;
    document.getElementById('pageContent').innerHTML = `
      <div class="filter-bar">
        <div class="form-group"><label>Class</label>
          <select class="form-control" id="rpClass" onchange="App.renderRPStudentSelect()">
            ${_classOptsAll()}
          </select>
        </div>
        <div class="form-group"><label>Faculty</label>
          <select class="form-control" id="rpFaculty" onchange="App.renderRPStudentSelect()">
            <option value="">All</option><option value="Common">Common</option><option value="General">General</option><option value="Technical">Technical</option>
          </select>
        </div>
        <div class="form-group"><label>Student</label>
          <select class="form-control" id="rpStudent" onchange="App.loadRPCollections()">
            <option value="">— Select —</option>
          </select>
        </div>
        <div class="form-group"><label>Collection</label>
          <select class="form-control" id="rpCollection" onchange="App.renderRPReceipt()">
            <option value="">— Select —</option>
          </select>
        </div>
        <div class="form-group" style="justify-content:end;">
          <button class="btn btn-primary" onclick="App.printRPReceipt()"><i class="fas fa-print"></i> Print</button>
        </div>
      </div>
      <div id="rpReceiptArea" style="max-width:800px;margin:0 auto;"></div>`;
    this.renderRPStudentSelect();
  },

  renderRPStudentSelect() {
    const cls = document.getElementById('rpClass')?.value || '';
    const faculty = document.getElementById('rpFaculty')?.value || '';
    let students = this.state._rpStudents || [];
    if (cls) students = students.filter(s => s.class === cls);
    if (faculty) students = students.filter(s => s.faculty === faculty);
    const sel = document.getElementById('rpStudent');
    if (sel) {
      const val = sel.value;
      sel.innerHTML = '<option value="">— Select —</option>' + students.map(s =>
        `<option value="${s.id}" ${s.id==val?'selected':''}>${s.roll_no} - ${s.name}</option>`
      ).join('');
      sel.onchange();
    }
  },

  async loadRPCollections() {
    const studentId = document.getElementById('rpStudent')?.value;
    const sel = document.getElementById('rpCollection');
    if (!studentId || !sel) {
      document.getElementById('rpReceiptArea').innerHTML = '';
      return;
    }
    const cRes = await api.getFeeCollections({ student_id: studentId, session: this.state.session });
    const collections = cRes.success ? cRes.data : [];
    sel.innerHTML = '<option value="">— Select —</option>' + collections.map(c =>
      `<option value="${c.id}">${c.date} - Rs. ${parseFloat(c.paid_amount).toLocaleString()}</option>`
    ).join('');
    sel.onchange();
  },

  async renderRPReceipt() {
    const collId = document.getElementById('rpCollection')?.value;
    const area = document.getElementById('rpReceiptArea');
    if (!collId || !area) { area.innerHTML = '<p class="text-muted text-center" style="margin-top:40px;">Select a collection to view receipt</p>'; return; }
    const [cRes, iRes] = await Promise.all([
      api.getFeeCollections({ id: collId }),
      api.getFeeCollectionItems(collId)
    ]);
    const coll = cRes.success && cRes.data.length ? cRes.data[0] : null;
    const items = iRes.success ? iRes.data : [];
    if (!coll) { area.innerHTML = '<p class="text-muted text-center">Collection not found</p>'; return; }
    const sRes = await api.getStudent(coll.student_id);
    const student = sRes.success ? sRes.data : {};
    const settings = this.state._rpSettings || {};
    const schoolName = settings.school_name || 'School Name';
    const address = settings.address || '';
    const phone = settings.phone || '';
    const areaHtml = `
      <div id="rpReceiptInner" style="background:#fff;border-radius:var(--radius);padding:30px 35px;box-shadow:var(--shadow);font-size:13px;">
        <div style="text-align:center;border-bottom:2px solid #333;padding-bottom:15px;margin-bottom:20px;">
          <h2 style="margin:0;font-size:22px;">${schoolName}</h2>
          <div style="font-size:12px;color:#666;">${address}${phone ? ' | Phone: '+phone : ''}</div>
          <h3 style="margin:8px 0 0;font-size:16px;">Fee Payment Receipt</h3>
        </div>
        <table style="width:100%;border-collapse:collapse;margin-bottom:15px;">
          <tr><td style="padding:4px 8px;width:50%;"><strong>Receipt No:</strong> ${coll.id}</td>
              <td style="padding:4px 8px;"><strong>Date:</strong> ${coll.date}</td></tr>
          <tr><td style="padding:4px 8px;"><strong>Student Name:</strong> ${student.name || coll.student_name || '-'}</td>
              <td style="padding:4px 8px;"><strong>Roll No:</strong> ${student.roll_no || '-'}</td></tr>
          <tr><td style="padding:4px 8px;"><strong>Class:</strong> ${student.class || '-'}</td>
              <td style="padding:4px 8px;"><strong>Faculty:</strong> ${student.faculty || '-'}</td></tr>
          <tr><td style="padding:4px 8px;"><strong>Session:</strong> ${coll.session}</td>
              <td style="padding:4px 8px;"><strong>Payment Method:</strong> ${coll.payment_method || 'Cash'}</td></tr>
        </table>
        <table style="width:100%;border-collapse:collapse;margin-bottom:15px;">
          <thead><tr style="background:#f0f0f0;">
            <th style="border:1px solid #ccc;padding:6px 8px;text-align:left;">#</th>
            <th style="border:1px solid #ccc;padding:6px 8px;text-align:left;">Fee Item</th>
            <th style="border:1px solid #ccc;padding:6px 8px;text-align:right;">Amount</th>
          </tr></thead>
          <tbody>${items.length ? items.map((item, i) => `
            <tr>
              <td style="border:1px solid #ccc;padding:6px 8px;">${i+1}</td>
              <td style="border:1px solid #ccc;padding:6px 8px;">${item.fee_name}</td>
              <td style="border:1px solid #ccc;padding:6px 8px;text-align:right;">Rs. ${parseFloat(item.amount).toLocaleString()}</td>
            </tr>
          `).join('') : '<tr><td colspan="3" style="border:1px solid #ccc;padding:6px 8px;text-align:center;">No items</td></tr>'}
          </tbody>
          <tfoot>
            <tr style="font-weight:700;"><td colspan="2" style="border:1px solid #ccc;padding:6px 8px;text-align:right;">Total</td>
              <td style="border:1px solid #ccc;padding:6px 8px;text-align:right;">Rs. ${parseFloat(coll.total_amount || 0).toLocaleString()}</td></tr>
            ${parseFloat(coll.discount || 0) > 0 ? `<tr><td colspan="2" style="border:1px solid #ccc;padding:6px 8px;text-align:right;color:var(--danger);">Discount</td>
              <td style="border:1px solid #ccc;padding:6px 8px;text-align:right;color:var(--danger);">- Rs. ${parseFloat(coll.discount).toLocaleString()}</td></tr>` : ''}
            <tr style="font-weight:700;font-size:14px;color:var(--success);"><td colspan="2" style="border:1px solid #ccc;padding:6px 8px;text-align:right;">Paid Amount</td>
              <td style="border:1px solid #ccc;padding:6px 8px;text-align:right;">Rs. ${parseFloat(coll.paid_amount || 0).toLocaleString()}</td></tr>
          </tfoot>
        </table>
        ${coll.remarks ? `<p><strong>Remarks:</strong> ${coll.remarks}</p>` : ''}
        <div style="display:flex;justify-content:space-between;margin-top:30px;padding-top:10px;">
          <div style="font-size:12px;">_________________________<br>Received By</div>
          <div style="font-size:12px;">_________________________<br>Accountant / Authorized Signatory</div>
        </div>
        <p style="text-align:center;font-size:11px;color:#999;margin-top:20px;">This is a computer-generated receipt</p>
      </div>`;
    area.innerHTML = areaHtml;
  },

  printRPReceipt() {
    const inner = document.getElementById('rpReceiptInner');
    if (!inner) return this.notify('No receipt to print', 'warning');
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Fee Receipt</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:12px;padding:0;margin:0;background:#fff;}
        @page{size:A4;margin:15mm;}
        table{width:100%;border-collapse:collapse;}
        th,td{padding:6px 8px;}
        h2,h3{text-align:center;}
      </style></head><body>${inner.outerHTML}</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  },

  /* ======= Income Report ======= */

  async renderIncomeReport() {
    const today = new Date().toISOString().split('T')[0];
    const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    document.getElementById('pageContent').innerHTML = `
      <div class="filter-bar">
        <div class="form-group"><label>From</label><input class="form-control" id="irFrom" type="date" value="${firstDay}"></div>
        <div class="form-group"><label>To</label><input class="form-control" id="irTo" type="date" value="${today}"></div>
        <div class="form-group"><label>Payment Method</label>
          <select class="form-control" id="irMethod" onchange="App.loadIncomeReport()">
            <option value="">All</option><option>Cash</option><option>Bank</option><option>Mobile Banking</option><option>Card</option>
          </select>
        </div>
        <div class="form-group"><label>Class</label>
          <select class="form-control" id="irClass" onchange="App.loadIncomeReport()">
            ${_classOptsAll()}
          </select>
        </div>
        <div class="form-group" style="justify-content:end;">
          <button class="btn btn-primary" onclick="App.loadIncomeReport()"><i class="fas fa-search"></i> Load</button>
          <button class="btn btn-outline-primary" onclick="App.printIncomeReport()"><i class="fas fa-print"></i> Print</button>
        </div>
      </div>
      <div id="irContent"></div>`;
    this.loadIncomeReport();
  },

  async loadIncomeReport() {
    const from = document.getElementById('irFrom')?.value || '';
    const to = document.getElementById('irTo')?.value || '';
    const method = document.getElementById('irMethod')?.value || '';
    const cls = document.getElementById('irClass')?.value || '';
    const area = document.getElementById('irContent');
    if (!from || !to) { area.innerHTML = '<p class="text-muted">Select date range</p>'; return; }
    const cRes = await api.getFeeCollections({ session: this.state.session });
    const collections = cRes.success ? cRes.data : [];
    // Filter
    let filtered = collections.filter(c => c.date >= from && c.date <= to);
    if (method) filtered = filtered.filter(c => c.payment_method === method);
    if (cls) filtered = filtered.filter(c => c.class === cls);
    // Summaries
    const totalStudents = new Set(filtered.map(c => c.student_id)).size;
    const totalCollections = filtered.reduce((s, c) => s + parseFloat(c.paid_amount || 0), 0);
    const totalDiscount = filtered.reduce((s, c) => s + parseFloat(c.discount || 0), 0);
    const totalTransactions = filtered.length;
    // By payment method
    const byMethod = {};
    filtered.forEach(c => {
      const m = c.payment_method || 'Cash';
      byMethod[m] = (byMethod[m] || 0) + parseFloat(c.paid_amount || 0);
    });
    // By date
    const byDate = {};
    filtered.forEach(c => {
      byDate[c.date] = (byDate[c.date] || 0) + parseFloat(c.paid_amount || 0);
    });
    const sortedDates = Object.keys(byDate).sort();
    area.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px;">
        <div class="card" style="padding:14px 18px;border-radius:var(--radius);box-shadow:var(--shadow);">
          <div style="font-size:11px;color:var(--text-muted);">Transactions</div>
          <div style="font-size:22px;font-weight:700;">${totalTransactions}</div>
        </div>
        <div class="card" style="padding:14px 18px;border-radius:var(--radius);box-shadow:var(--shadow);">
          <div style="font-size:11px;color:var(--text-muted);">Students</div>
          <div style="font-size:22px;font-weight:700;">${totalStudents}</div>
        </div>
        <div class="card" style="padding:14px 18px;border-radius:var(--radius);box-shadow:var(--shadow);">
          <div style="font-size:11px;color:var(--text-muted);">Total Collection</div>
          <div style="font-size:22px;font-weight:700;color:var(--success);">Rs. ${totalCollections.toLocaleString()}</div>
        </div>
        <div class="card" style="padding:14px 18px;border-radius:var(--radius);box-shadow:var(--shadow);">
          <div style="font-size:11px;color:var(--text-muted);">Total Discount</div>
          <div style="font-size:22px;font-weight:700;color:var(--danger);">Rs. ${totalDiscount.toLocaleString()}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
        <div class="card" style="padding:14px 18px;border-radius:var(--radius);box-shadow:var(--shadow);">
          <h4 style="font-size:13px;margin:0 0 8px;">By Payment Method</h4>
          ${Object.entries(byMethod).length ? Object.entries(byMethod).map(([m, amt]) =>
            `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);font-size:12px;">
              <span>${m}</span><span style="font-weight:700;">Rs. ${amt.toLocaleString()}</span></div>`
          ).join('') : '<p class="text-muted" style="font-size:12px;">No data</p>'}
        </div>
        <div class="card" style="padding:14px 18px;border-radius:var(--radius);box-shadow:var(--shadow);">
          <h4 style="font-size:13px;margin:0 0 8px;">Daily Collection</h4>
          ${sortedDates.length ? sortedDates.map(d =>
            `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);font-size:12px;">
              <span>${d}</span><span style="font-weight:700;">Rs. ${byDate[d].toLocaleString()}</span></div>`
          ).join('') : '<p class="text-muted" style="font-size:12px;">No data</p>'}
        </div>
      </div>
      <div class="card" style="padding:14px 18px;border-radius:var(--radius);box-shadow:var(--shadow);">
        <h4 style="font-size:13px;margin:0 0 8px;">Collection Details</h4>
        <div class="table-container">
          <table class="table">
            <thead><tr>
              <th>#</th><th>Date</th><th>Student</th><th>Roll</th><th>Class</th><th>Method</th>
              <th style="text-align:right;">Amount</th><th style="text-align:right;">Discount</th>
            </tr></thead>
            <tbody>${filtered.length ? filtered.sort((a,b)=>b.date.localeCompare(a.date)).map((c, i) =>
              `<tr>
                <td>${i+1}</td>
                <td>${c.date}</td>
                <td>${c.student_name || '-'}</td>
                <td>${c.roll_no || '-'}</td>
                <td>${c.class || '-'}</td>
                <td>${c.payment_method || 'Cash'}</td>
                <td style="text-align:right;">Rs. ${parseFloat(c.paid_amount).toLocaleString()}</td>
                <td style="text-align:right;">${parseFloat(c.discount||0) > 0 ? 'Rs. '+parseFloat(c.discount).toLocaleString() : '-'}</td>
              </tr>`
            ).join('') : '<tr><td colspan="8" class="text-center text-muted">No collections found</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;
  },

  printIncomeReport() {
    const content = document.getElementById('irContent');
    if (!content) return this.notify('No data to print', 'warning');
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Income Report</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:12px;padding:20px;}
        @page{size:A4;margin:12mm;}
        table{width:100%;border-collapse:collapse;margin-bottom:15px;}
        th,td{border:1px solid #ccc;padding:5px 7px;text-align:left;}
        th{background:#f0f0f0;}
        h2{text-align:center;margin-bottom:5px;}
        .text-right{text-align:right;}
        .card{padding:10px;margin-bottom:12px;border:1px solid #ddd;border-radius:4px;}
        .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
      </style></head><body>
      <h2>Income Report - ${this.state.session}</h2>
      <p style="text-align:center;color:#666;margin-bottom:15px;">${document.getElementById('irFrom')?.value || ''} to ${document.getElementById('irTo')?.value || ''}</p>
      ${content.innerHTML.replace(/<button[^>]*>.*?<\/button>/g, '')}
      <p style="margin-top:15px;font-size:10px;color:#999;">Generated: ${new Date().toLocaleString()}</p>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  },

  /* ======= Book Entry ======= */

  async renderBookEntry() {
    await this.loadBookListData();
  },

  async loadBookListData(editId) {
    const bRes = await api.getBooks({});
    const books = bRes.success ? bRes.data : [];
    this.state._books = books;
    const categories = [...new Set(books.map(b => b.category).filter(c => c))];
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('pageContent').innerHTML = `
      <div class="filter-bar">
        <div class="form-group"><label>Search</label><input class="form-control" id="beSearch" placeholder="Title / Author / ISBN..." oninput="App.renderBETable()"></div>
        <div class="form-group"><label>Category</label>
          <select class="form-control" id="beCategory" onchange="App.renderBETable()">
            <option value="">All</option>${categories.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="justify-content:end;">
          <button class="btn btn-primary" onclick="App.showBEForm()"><i class="fas fa-plus"></i> Add Book</button>
        </div>
      </div>
      <div class="table-container" id="beTableContainer"></div>`;
    this.renderBETable();
    if (editId) this.showBEForm(editId);
  },

  renderBETable() {
    const search = (document.getElementById('beSearch')?.value || '').toLowerCase();
    const cat = document.getElementById('beCategory')?.value || '';
    let books = this.state._books || [];
    if (search) books = books.filter(b => b.title.toLowerCase().includes(search) || b.author?.toLowerCase().includes(search) || b.isbn?.includes(search));
    if (cat) books = books.filter(b => b.category === cat);
    document.getElementById('beTableContainer').innerHTML = `
      <table class="table">
        <thead><tr>
          <th>#</th><th>Title</th><th>Author</th><th>ISBN</th><th>Category</th><th>Rack</th>
          <th style="text-align:center;">Total</th><th style="text-align:center;">Available</th><th>Action</th>
        </tr></thead>
        <tbody>${books.length ? books.map((b, i) =>
          `<tr>
            <td>${i+1}</td>
            <td><strong>${b.title}</strong></td>
            <td>${b.author || '-'}</td>
            <td>${b.isbn || '-'}</td>
            <td>${b.category || '-'}</td>
            <td>${b.rack_no || '-'}</td>
            <td style="text-align:center;">${b.quantity}</td>
            <td style="text-align:center;"><span style="display:inline-block;padding:1px 10px;border-radius:10px;font-size:12px;background:${b.available_quantity > 0 ? '#e8f5e9' : '#ffebee'};color:${b.available_quantity > 0 ? '#2e7d32' : '#c62828'};">${b.available_quantity}</span></td>
            <td>
              <button class="btn btn-sm btn-outline-primary" onclick="App.showBEForm(${b.id})"><i class="fas fa-edit"></i></button>
              <button class="btn btn-sm btn-outline-danger" onclick="App.deleteBEBook(${b.id})"><i class="fas fa-trash"></i></button>
            </td>
          </tr>`
        ).join('') : '<tr><td colspan="9" class="text-center text-muted">No books found</td></tr>'}
        </tbody>
      </table>`;
  },

  showBEForm(id) {
    const book = id ? (this.state._books || []).find(b => b.id == id) : null;
    this.showModal(`
      <h3 style="font-size:15px;margin-bottom:12px;">${book ? 'Edit Book' : 'Add New Book'}</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div class="form-group"><label>Title *</label><input class="form-control" id="beTitle" value="${book ? book.title : ''}"></div>
        <div class="form-group"><label>Author</label><input class="form-control" id="beAuthor" value="${book ? (book.author||'') : ''}"></div>
        <div class="form-group"><label>Publisher</label><input class="form-control" id="bePublisher" value="${book ? (book.publisher||'') : ''}"></div>
        <div class="form-group"><label>ISBN</label><input class="form-control" id="beIsbn" value="${book ? (book.isbn||'') : ''}"></div>
        <div class="form-group"><label>Category</label>
          <select class="form-control" id="beCategoryModal">
            <option value="">— Select —</option>
            ${['Academic','Reference','Story','Magazine','Competitive','Other'].map(c =>
              `<option value="${c}" ${book && book.category===c ? 'selected' : ''}>${c}</option>`
            ).join('')}
            <option value="__other__" ${book && !['Academic','Reference','Story','Magazine','Competitive','Other'].includes(book.category||'') ? 'selected' : ''}>Other</option>
          </select>
        </div>
        <div class="form-group" id="beCustomCatGroup" style="display:${book && !['Academic','Reference','Story','Magazine','Competitive','Other'].includes(book.category||'') ? 'block' : 'none'};">
          <label>Custom Category</label><input class="form-control" id="beCustomCat" value="${book && !['Academic','Reference','Story','Magazine','Competitive','Other'].includes(book.category||'') ? book.category : ''}">
        </div>
        <div class="form-group"><label>Rack No</label><input class="form-control" id="beRack" value="${book ? (book.rack_no||'') : ''}"></div>
        <div class="form-group"><label>Quantity *</label><input class="form-control" id="beQty" type="number" min="1" value="${book ? book.quantity : 1}"></div>
      </div>
      <div class="form-group" style="margin-top:8px;"><label>Description</label><textarea class="form-control" id="beDesc" rows="2">${book ? (book.description||'') : ''}</textarea></div>
      <div style="margin-top:12px;display:flex;gap:8px;">
        <button class="btn btn-primary" onclick="App.saveBEBook(${book ? book.id : ''})"><i class="fas fa-save"></i> ${book ? 'Update' : 'Save'}</button>
        <button class="btn btn-outline-secondary" onclick="App.closeModal()">Cancel</button>
      </div>`);
    document.getElementById('beCategoryModal').addEventListener('change', function() {
      document.getElementById('beCustomCatGroup').style.display = this.value === '__other__' ? 'block' : 'none';
    });
  },

  async saveBEBook(id) {
    const title = document.getElementById('beTitle')?.value?.trim();
    if (!title) return this.notify('Title is required', 'warning');
    let category = document.getElementById('beCategoryModal')?.value || '';
    if (category === '__other__') category = document.getElementById('beCustomCat')?.value?.trim() || '';
    const data = {
      id: id || null,
      title,
      author: document.getElementById('beAuthor')?.value?.trim() || '',
      publisher: document.getElementById('bePublisher')?.value?.trim() || '',
      isbn: document.getElementById('beIsbn')?.value?.trim() || '',
      category,
      quantity: parseInt(document.getElementById('beQty')?.value) || 1,
      rack_no: document.getElementById('beRack')?.value?.trim() || '',
      description: document.getElementById('beDesc')?.value?.trim() || ''
    };
    const res = await api.saveBook(data);
    if (!res.success) return this.notify('Save failed', 'error');
    this.notify(id ? 'Book updated' : 'Book added');
    this.closeModal();
    this.loadBookListData();
  },

  async deleteBEBook(id) {
    if (!confirm('Delete this book?')) return;
    const res = await api.deleteBook(id);
    if (!res.success) return this.notify('Delete failed', 'error');
    this.notify('Book deleted');
    this.loadBookListData();
  },

  /* ======= Book Issue ======= */

  async renderBookIssue() {
    const [bRes, sRes] = await Promise.all([
      api.getBooks({}),
      api.getStudents({ session: this.state.session })
    ]);
    const books = bRes.success ? bRes.data : [];
    const students = sRes.success ? sRes.data : [];
    this.state._biBooks = books;
    this.state._biStudents = students;
    const today = new Date().toISOString().split('T')[0];
    const defaultDue = new Date(Date.now() + 14*86400000).toISOString().split('T')[0];
    document.getElementById('pageContent').innerHTML = `
      <div class="filter-bar">
        <div class="form-group"><label>Book</label>
          <select class="form-control" id="biBook">
            <option value="">— Select —</option>
            ${books.filter(b => b.available_quantity > 0).map(b =>
              `<option value="${b.id}">${b.title} (Avail: ${b.available_quantity})</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group"><label>Student</label>
          <select class="form-control" id="biStudent">
            <option value="">— Select —</option>
            ${students.map(s =>
              `<option value="${s.id}">${s.roll_no} - ${s.name} (${s.class})</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group"><label>Issue Date</label><input class="form-control" id="biIssueDate" type="date" value="${today}"></div>
        <div class="form-group"><label>Due Date</label><input class="form-control" id="biDueDate" type="date" value="${defaultDue}"></div>
        <div class="form-group" style="justify-content:end;">
          <button class="btn btn-primary" onclick="App.issueBBook()"><i class="fas fa-book"></i> Issue Book</button>
        </div>
      </div>
      <div class="table-container" id="biTableContainer"></div>`;
    this.loadBITable();
  },

  async loadBITable() {
    const iRes = await api.getBookIssues({ status: 'issued' });
    const issues = iRes.success ? iRes.data : [];
    document.getElementById('biTableContainer').innerHTML = `
      <table class="table">
        <thead><tr>
          <th>#</th><th>Book</th><th>Student</th><th>Roll</th><th>Class</th><th>Issue Date</th><th>Due Date</th><th>Remarks</th>
        </tr></thead>
        <tbody>${issues.length ? issues.map((i, idx) =>
          `<tr>
            <td>${idx+1}</td>
            <td>${i.book_title || '-'}</td>
            <td>${i.student_name || '-'}</td>
            <td>${i.roll_no || '-'}</td>
            <td>${i.class || '-'}</td>
            <td>${i.issue_date}</td>
            <td style="color:${new Date(i.due_date) < new Date() ? 'var(--danger)' : 'inherit'};font-weight:${new Date(i.due_date) < new Date() ? '700' : 'normal'};">${i.due_date}${new Date(i.due_date) < new Date() ? ' (Overdue)' : ''}</td>
            <td>${i.remarks || '-'}</td>
          </tr>`
        ).join('') : '<tr><td colspan="8" class="text-center text-muted">No books currently issued</td></tr>'}
        </tbody>
      </table>`;
  },

  async issueBBook() {
    const bookId = document.getElementById('biBook')?.value;
    const studentId = document.getElementById('biStudent')?.value;
    const issueDate = document.getElementById('biIssueDate')?.value;
    const dueDate = document.getElementById('biDueDate')?.value;
    if (!bookId || !studentId || !issueDate || !dueDate) return this.notify('Fill all required fields', 'warning');
    const res = await api.issueBook({
      book_id: parseInt(bookId), student_id: parseInt(studentId), issue_date: issueDate, due_date: dueDate, remarks: ''
    });
    if (!res.success) return this.notify(res.error || 'Issue failed', 'error');
    this.notify('Book issued successfully');
    document.getElementById('biBook').value = '';
    document.getElementById('biStudent').value = '';
    this.renderBookIssue();
  },

  /* ======= Book Return ======= */

  async renderBookReturn() {
    const iRes = await api.getBookIssues({ status: 'issued' });
    const issues = iRes.success ? iRes.data : [];
    this.state._brIssues = issues;
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('pageContent').innerHTML = `
      <div class="filter-bar">
        <div class="form-group"><label>Search</label><input class="form-control" id="brSearch" placeholder="Book / Student..." oninput="App.renderBRTable()"></div>
        <div class="form-group" style="justify-content:end;">
          <button class="btn btn-primary" onclick="App.renderBookReturn()"><i class="fas fa-sync"></i> Refresh</button>
        </div>
      </div>
      <div class="table-container" id="brTableContainer"></div>`;
    this.renderBRTable();
  },

  renderBRTable() {
    const search = (document.getElementById('brSearch')?.value || '').toLowerCase();
    let issues = this.state._brIssues || [];
    if (search) issues = issues.filter(i => i.book_title?.toLowerCase().includes(search) || i.student_name?.toLowerCase().includes(search) || i.roll_no?.includes(search));
    document.getElementById('brTableContainer').innerHTML = `
      <table class="table">
        <thead><tr>
          <th>#</th><th>Book</th><th>Student</th><th>Roll</th><th>Class</th><th>Issue Date</th><th>Due Date</th><th>Status</th><th>Return Date</th><th>Action</th>
        </tr></thead>
        <tbody>${issues.length ? issues.map((i, idx) =>
          `<tr>
            <td>${idx+1}</td>
            <td>${i.book_title || '-'}</td>
            <td>${i.student_name || '-'}</td>
            <td>${i.roll_no || '-'}</td>
            <td>${i.class || '-'}</td>
            <td>${i.issue_date}</td>
            <td style="color:${new Date(i.due_date) < new Date() ? 'var(--danger)' : 'inherit'};font-weight:${new Date(i.due_date) < new Date() ? '700' : 'normal'};">${i.due_date}</td>
            <td><span style="display:inline-block;padding:1px 10px;border-radius:10px;font-size:11px;background:#fff3e0;color:#e65100;">Issued</span></td>
            <td><input class="form-control" id="brReturnDate_${i.id}" type="date" value="${new Date().toISOString().split('T')[0]}"></td>
            <td><button class="btn btn-sm btn-success" onclick="App.returnBBook(${i.id})"><i class="fas fa-undo"></i> Return</button></td>
          </tr>`
        ).join('') : '<tr><td colspan="10" class="text-center text-muted">No issued books</td></tr>'}
        </tbody>
      </table>`;
  },

  async returnBBook(issueId) {
    const returnDate = document.getElementById('brReturnDate_' + issueId)?.value;
    if (!returnDate) return this.notify('Select return date', 'warning');
    if (!confirm('Return this book?')) return;
    const res = await api.returnBook(issueId, returnDate);
    if (!res.success) return this.notify(res.error || 'Return failed', 'error');
    this.notify('Book returned successfully');
    this.renderBookReturn();
  },

  /* ======= Book List ======= */

  async renderBookList() {
    const bRes = await api.getBooks({});
    const books = bRes.success ? bRes.data : [];
    this.state._blBooks = books;
    const categories = [...new Set(books.map(b => b.category).filter(c => c))];
    document.getElementById('pageContent').innerHTML = `
      <div class="filter-bar">
        <div class="form-group"><label>Search</label><input class="form-control" id="blSearch" placeholder="Title, Author, ISBN..." oninput="App.renderBLTable()"></div>
        <div class="form-group"><label>Category</label>
          <select class="form-control" id="blCategory" onchange="App.renderBLTable()">
            <option value="">All</option>${categories.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Availability</label>
          <select class="form-control" id="blAvail" onchange="App.renderBLTable()">
            <option value="all">All</option><option value="available">Available</option><option value="unavailable">Unavailable</option>
          </select>
        </div>
        <div class="form-group" style="justify-content:end;">
          <button class="btn btn-primary" onclick="App.printBL()"><i class="fas fa-print"></i> Print</button>
        </div>
      </div>
      <div class="table-container" id="blTableContainer"></div>`;
    this.renderBLTable();
  },

  renderBLTable() {
    const search = (document.getElementById('blSearch')?.value || '').toLowerCase();
    const cat = document.getElementById('blCategory')?.value || '';
    const avail = document.getElementById('blAvail')?.value || 'all';
    let books = this.state._blBooks || [];
    if (search) books = books.filter(b => b.title.toLowerCase().includes(search) || b.author?.toLowerCase().includes(search) || b.isbn?.includes(search));
    if (cat) books = books.filter(b => b.category === cat);
    if (avail === 'available') books = books.filter(b => b.available_quantity > 0);
    else if (avail === 'unavailable') books = books.filter(b => b.available_quantity <= 0);
    document.getElementById('blTableContainer').innerHTML = `
      <table class="table">
        <thead><tr>
          <th>#</th><th>Title</th><th>Author</th><th>Publisher</th><th>ISBN</th><th>Category</th><th>Rack</th>
          <th style="text-align:center;">Total</th><th style="text-align:center;">Available</th>
        </tr></thead>
        <tbody>${books.length ? books.map((b, i) =>
          `<tr>
            <td>${i+1}</td>
            <td><strong>${b.title}</strong></td>
            <td>${b.author || '-'}</td>
            <td>${b.publisher || '-'}</td>
            <td>${b.isbn || '-'}</td>
            <td>${b.category || '-'}</td>
            <td>${b.rack_no || '-'}</td>
            <td style="text-align:center;">${b.quantity}</td>
            <td style="text-align:center;"><span style="display:inline-block;padding:1px 10px;border-radius:10px;font-size:12px;background:${b.available_quantity > 0 ? '#e8f5e9' : '#ffebee'};color:${b.available_quantity > 0 ? '#2e7d32' : '#c62828'};">${b.available_quantity}</span></td>
          </tr>`
        ).join('') : '<tr><td colspan="9" class="text-center text-muted">No books found</td></tr>'}
        </tbody>
      </table>`;
  },

  printBL() {
    const html = document.querySelector('#blTableContainer table')?.outerHTML;
    if (!html) return this.notify('No data to print', 'warning');
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Book List</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:11px;padding:20px;}
        table{width:100%;border-collapse:collapse;}
        th,td{border:1px solid #ccc;padding:5px 7px;text-align:left;}
        th{background:#f0f0f0;}
        h2{text-align:center;margin-bottom:5px;}
      </style></head><body>
      <h2>Book List - ${this.state.session}</h2>
      ${html}
      <p style="margin-top:10px;font-size:10px;color:#999;">Total Books: ${this.state._blBooks?.length || 0} | Generated: ${new Date().toLocaleDateString()}</p>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  },

  /* ======= Character Certificate ======= */

  async renderCharacterCertificate() {
    const sRes = await api.getStudents({ session: this.state.session });
    const students = sRes.success ? sRes.data : [];
    this.state._ccStudents = students;
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('pageContent').innerHTML = `
      <div class="filter-bar">
        <div class="form-group"><label>Class</label>
          <select class="form-control" id="ccClass" onchange="App.renderCCTable()">
            ${_classOptsAll()}
          </select>
        </div>
        <div class="form-group"><label>Faculty</label>
          <select class="form-control" id="ccFaculty" onchange="App.renderCCTable()">
            <option value="">All</option><option value="Common">Common</option><option value="General">General</option><option value="Technical">Technical</option>
          </select>
        </div>
        <div class="form-group"><label>Search</label>
          <input class="form-control" id="ccSearch" placeholder="Name or Roll..." oninput="App.renderCCTable()">
        </div>
      </div>
      <div class="table-container" id="ccTableContainer"></div>
      <div id="ccContent" style="max-width:850px;margin:0 auto;margin-top:16px;"></div>`;
    this.renderCCTable();
  },

  renderCCTable() {
    const cls = document.getElementById('ccClass')?.value || '';
    const faculty = document.getElementById('ccFaculty')?.value || '';
    const search = (document.getElementById('ccSearch')?.value || '').toLowerCase();
    let students = this.state._ccStudents || [];
    if (cls) students = students.filter(s => s.class === cls);
    if (faculty) students = students.filter(s => s.faculty === faculty);
    if (search) students = students.filter(s => s.name.toLowerCase().includes(search) || s.roll_no?.toString().includes(search));
    document.getElementById('ccTableContainer').innerHTML = `
      <table class="table">
        <thead><tr><th>SN</th><th>Roll</th><th>Name</th><th>Class</th><th>Faculty</th><th>Action</th></tr></thead>
        <tbody>${students.length ? students.map((s, i) =>
          `<tr>
            <td>${i+1}</td>
            <td>${s.roll_no || '-'}</td>
            <td>${s.name}</td>
            <td>${s.class || '-'}</td>
            <td>${s.faculty || '-'}</td>
            <td>
              <button class="btn btn-sm btn-outline-primary" onclick="App.loadCCDetails('${s.id}', 'view')"><i class="fas fa-eye"></i> View</button>
              <button class="btn btn-sm btn-outline-secondary" onclick="App.loadCCDetails('${s.id}', 'edit')"><i class="fas fa-edit"></i> Edit</button>
            </td>
          </tr>`
        ).join('') : '<tr><td colspan="6" class="text-center text-muted">No students found</td></tr>'}
        </tbody>
      </table>`;
    document.getElementById('ccContent').innerHTML = '';
  },

  async loadCCDetails(studentId, mode) {
    const sRes = await api.getStudent(studentId);
    const s = sRes.success ? sRes.data : null;
    if (!s) return this.notify('Student not found', 'error');
    const today = new Date().toISOString().split('T')[0];
    const isView = mode === 'view';
    this.showModal(`
      <div style="min-width:650px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <h4 style="margin:0;font-size:14px;">${s.name} (Roll: ${s.roll_no})</h4>
          <button class="btn btn-sm btn-primary" onclick="App.printCCModal()"><i class="fas fa-print"></i> Print</button>
        </div>
        ${isView ? '' : `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
          <div class="form-group"><label>Issue Date</label><input class="form-control" id="ccDate" type="date" value="${today}"></div>
          <div class="form-group"><label>Conduct</label>
            <select class="form-control" id="ccConduct">
              <option value="Excellent">Excellent</option><option value="Very Good" selected>Very Good</option>
              <option value="Good">Good</option><option value="Satisfactory">Satisfactory</option>
            </select>
          </div>
          <div class="form-group" style="grid-column:1/-1;"><label>Remarks</label>
            <textarea class="form-control" id="ccRemarks" rows="2"></textarea>
          </div>
        </div>
        <button class="btn btn-outline-primary btn-sm" onclick="App.previewCCModal('${s.id}')"><i class="fas fa-eye"></i> Preview</button>
        `}
        <div id="ccPreviewModal" style="margin-top:12px;">${isView ? '<p class="text-muted">Loading preview...</p>' : '<p class="text-muted">Set options and click Preview</p>'}</div>
      </div>`);
    if (isView) await this.previewCCModal(s.id);
  },

  async previewCCModal(studentId) {
    const sRes = await api.getStudent(studentId);
    const s = sRes.success ? sRes.data : null;
    if (!s) return this.notify('Student not found', 'error');
    const date = document.getElementById('ccDate')?.value || new Date().toISOString().split('T')[0];
    const conduct = document.getElementById('ccConduct')?.value || 'Very Good';
    const remarks = document.getElementById('ccRemarks')?.value || '';
    const school = this.state.school || {};
    const schoolName = school.school_name || 'School Name';
    const schoolAddress = [school.municipality, school.district].filter(Boolean).join(', ');
    const schoolPhone = school.phone || '';
    const logo = school.school_logo || '';
    const { year, month, day } = this.parseDate(date);
    const formattedDate = `${year}-${month}-${day}`;
    const gender = s.gender === 'Female' ? 'she' : s.gender === 'Other' ? 'they' : 'he';
    const gender2 = s.gender === 'Female' ? 'her' : s.gender === 'Other' ? 'their' : 'him';
    const el = document.getElementById('ccPreviewModal');
    if (!el) return;
    el.innerHTML = `
      <div id="ccCertInner" style="background:#fff;border:2px solid #333;border-radius:var(--radius);padding:25px 30px;font-size:12px;line-height:1.6;text-align:left;">
        <div style="text-align:center;border-bottom:2px double #333;padding-bottom:10px;margin-bottom:15px;">
          ${logo ? `<img src="${logo}" style="height:45px;margin-bottom:4px;">` : ''}
          <h2 style="margin:0;font-size:18px;text-transform:uppercase;">${schoolName}</h2>
          <div style="font-size:11px;color:#555;">${schoolAddress}${schoolPhone ? ' | Phone: '+schoolPhone : ''}</div>
          <h3 style="margin:8px 0 0;font-size:14px;text-decoration:underline;">Character Certificate</h3>
        </div>
        <p style="text-align:right;font-size:11px;">Date: ${formattedDate}</p>
        <p style="text-align:justify;">This is to certify that <strong>${s.name}</strong>, ${s.gender === 'Female' ? 'daughter' : 'son'} of <strong>${s.father_name || 'Mr. ...'}</strong>, was a student of this institution during the academic session <strong>${this.state.session}</strong>. ${gender2.charAt(0).toUpperCase() + gender2.slice(1)} was enrolled in <strong>Class ${s.class || '...'}${s.faculty ? ' ('+s.faculty+')' : ''}</strong> with Roll Number <strong>${s.roll_no || '...'}</strong>.</p>
        <p style="text-align:justify;">During ${gender} period of study, ${gender} bore a <strong>${conduct}</strong> moral character. ${gender2.charAt(0).toUpperCase() + gender2.slice(1)} was found to be hardworking, disciplined, and sincere in ${gender} studies. ${remarks ? 'Remarks: ' + remarks : ''}</p>
        <p style="text-align:justify;">We wish ${gender2} all the best for ${gender} future endeavors.</p>
        <div style="display:flex;justify-content:space-between;margin-top:30px;font-size:11px;">
          <div style="text-align:center;">_________________________<br><strong>Class Teacher</strong></div>
          <div style="text-align:center;">_________________________<br><strong>Principal</strong></div>
        </div>
        <div style="text-align:center;margin-top:8px;font-size:11px;">_________________________<br><strong>School Stamp</strong></div>
      </div>`;
  },

  printCCModal() { this.printModalWrapper('ccCertInner', 'Character Certificate'); },

  printModalWrapper(innerId, title) {
    const inner = document.getElementById(innerId);
    if (!inner) return this.notify('Preview first', 'warning');
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>${title}</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:13px;padding:0;margin:0;}
        @page{size:A4;margin:20mm;}
        #${innerId}{max-width:100%;border:none !important;box-shadow:none !important;padding:0 !important;}
        h2{text-align:center;text-transform:uppercase;}
        h3{text-align:center;}
      </style></head><body>${inner.outerHTML}</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  },

  parseDate(dateStr) {
    if (!dateStr) return { year: '....', month: '....', day: '....' };
    const parts = dateStr.split('-');
    return { year: parts[0], month: parts[1], day: parts[2] };
  },

  /* ======= Bonafide Certificate ======= */

  async renderBonafideCertificate() {
    const sRes = await api.getStudents({ session: this.state.session });
    const students = sRes.success ? sRes.data : [];
    this.state._bcStudents = students;
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('pageContent').innerHTML = `
      <div class="filter-bar">
        <div class="form-group"><label>Class</label>
          <select class="form-control" id="bcClass" onchange="App.renderBCTable()">
            ${_classOptsAll()}
          </select>
        </div>
        <div class="form-group"><label>Faculty</label>
          <select class="form-control" id="bcFaculty" onchange="App.renderBCTable()">
            <option value="">All</option><option value="Common">Common</option><option value="General">General</option><option value="Technical">Technical</option>
          </select>
        </div>
        <div class="form-group"><label>Search</label>
          <input class="form-control" id="bcSearch" placeholder="Name or Roll..." oninput="App.renderBCTable()">
        </div>
      </div>
      <div class="table-container" id="bcTableContainer"></div>
      <div id="bcContent" style="max-width:850px;margin:0 auto;margin-top:16px;"></div>`;
    this.renderBCTable();
  },

  renderBCTable() {
    const cls = document.getElementById('bcClass')?.value || '';
    const faculty = document.getElementById('bcFaculty')?.value || '';
    const search = (document.getElementById('bcSearch')?.value || '').toLowerCase();
    let students = this.state._bcStudents || [];
    if (cls) students = students.filter(s => s.class === cls);
    if (faculty) students = students.filter(s => s.faculty === faculty);
    if (search) students = students.filter(s => s.name.toLowerCase().includes(search) || s.roll_no?.toString().includes(search));
    document.getElementById('bcTableContainer').innerHTML = `
      <table class="table">
        <thead><tr><th>SN</th><th>Roll</th><th>Name</th><th>Class</th><th>Faculty</th><th>Action</th></tr></thead>
        <tbody>${students.length ? students.map((s, i) =>
          `<tr>
            <td>${i+1}</td>
            <td>${s.roll_no || '-'}</td>
            <td>${s.name}</td>
            <td>${s.class || '-'}</td>
            <td>${s.faculty || '-'}</td>
            <td>
              <button class="btn btn-sm btn-outline-primary" onclick="App.loadBCDetails('${s.id}', 'view')"><i class="fas fa-eye"></i> View</button>
              <button class="btn btn-sm btn-outline-secondary" onclick="App.loadBCDetails('${s.id}', 'edit')"><i class="fas fa-edit"></i> Edit</button>
            </td>
          </tr>`
        ).join('') : '<tr><td colspan="6" class="text-center text-muted">No students found</td></tr>'}
        </tbody>
      </table>`;
    document.getElementById('bcContent').innerHTML = '';
  },

  async loadBCDetails(studentId, mode) {
    const sRes = await api.getStudent(studentId);
    const s = sRes.success ? sRes.data : null;
    if (!s) return this.notify('Student not found', 'error');
    const today = new Date().toISOString().split('T')[0];
    const isView = mode === 'view';
    this.showModal(`
      <div style="min-width:650px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <h4 style="margin:0;font-size:14px;">${s.name} (Roll: ${s.roll_no})</h4>
          <button class="btn btn-sm btn-primary" onclick="App.printBCModal()"><i class="fas fa-print"></i> Print</button>
        </div>
        ${isView ? '' : `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px;">
          <div class="form-group"><label>Issue Date</label><input class="form-control" id="bcDate" type="date" value="${today}"></div>
          <div class="form-group"><label>Purpose</label>
            <select class="form-control" id="bcPurpose">
              <option value="for pursuing higher studies">Pursuing Higher Studies</option>
              <option value="for scholarship application">Scholarship Application</option>
              <option value="for admission purpose">Admission Purpose</option>
              <option value="for employment purpose">Employment Purpose</option>
              <option value="for visa application">Visa Application</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div class="form-group"><label>Study Year</label>
            <select class="form-control" id="bcYear">
              <option value="First Year">First Year</option>
              <option value="Second Year">Second Year</option>
            </select>
          </div>
          <div class="form-group" style="grid-column:1/-1;"><label>Extra Info</label>
            <textarea class="form-control" id="bcExtra" rows="2"></textarea>
          </div>
        </div>
        <button class="btn btn-outline-primary btn-sm" onclick="App.previewBCModal('${s.id}')"><i class="fas fa-eye"></i> Preview</button>
        `}
        <div id="bcPreviewModal" style="margin-top:12px;">${isView ? '<p class="text-muted">Loading preview...</p>' : '<p class="text-muted">Set options and click Preview</p>'}</div>
      </div>`);
    if (isView) await this.previewBCModal(s.id);
  },

  async previewBCModal(studentId) {
    const sRes = await api.getStudent(studentId);
    const s = sRes.success ? sRes.data : null;
    if (!s) return this.notify('Student not found', 'error');
    const date = document.getElementById('bcDate')?.value || new Date().toISOString().split('T')[0];
    const purpose = document.getElementById('bcPurpose')?.value || 'for pursuing higher studies';
    const studyYear = document.getElementById('bcYear')?.value || 'First Year';
    const extra = document.getElementById('bcExtra')?.value || '';
    const school = this.state.school || {};
    const schoolName = school.school_name || 'School Name';
    const schoolAddress = [school.municipality, school.district].filter(Boolean).join(', ');
    const schoolPhone = school.phone || '';
    const logo = school.school_logo || '';
    const { year, month, day } = this.parseDate(date);
    const formattedDate = `${year}-${month}-${day}`;
    const gender = s.gender === 'Female' ? 'she' : s.gender === 'Other' ? 'they' : 'he';
    const gender2 = s.gender === 'Female' ? 'her' : s.gender === 'Other' ? 'their' : 'him';
    const el = document.getElementById('bcPreviewModal');
    if (!el) return;
    el.innerHTML = `
      <div id="bcCertInner" style="background:#fff;border:2px solid #333;border-radius:var(--radius);padding:25px 30px;font-size:12px;line-height:1.6;text-align:left;">
        <div style="text-align:center;border-bottom:2px double #333;padding-bottom:10px;margin-bottom:15px;">
          ${logo ? `<img src="${logo}" style="height:45px;margin-bottom:4px;">` : ''}
          <h2 style="margin:0;font-size:18px;text-transform:uppercase;">${schoolName}</h2>
          <div style="font-size:11px;color:#555;">${schoolAddress}${schoolPhone ? ' | Phone: '+schoolPhone : ''}</div>
          <h3 style="margin:8px 0 0;font-size:14px;text-decoration:underline;">Bonafide Certificate</h3>
        </div>
        <p style="text-align:right;font-size:11px;">Date: ${formattedDate}</p>
        <p style="text-align:justify;">This is to certify that <strong>${s.name}</strong>, ${s.gender === 'Female' ? 'daughter' : 'son'} of <strong>${s.father_name || 'Mr. ...'}</strong>, is a bonafide student of this institution for the academic session <strong>${this.state.session}</strong>. ${gender2.charAt(0).toUpperCase() + gender2.slice(1)} is studying in <strong>${studyYear}</strong> of <strong>Class ${s.class || '...'}${s.faculty ? ' ('+s.faculty+')' : ''}</strong> bearing Roll Number <strong>${s.roll_no || '...'}</strong>.</p>
        <p style="text-align:justify;">This certificate is issued ${purpose}${extra ? ' ('+extra+')' : ''}.</p>
        <p style="text-align:justify;">${gender2.charAt(0).toUpperCase() + gender2.slice(1)} bears a good moral character and to the best of my knowledge, ${gender} is not involved in any unlawful or anti-social activities.</p>
        <div style="display:flex;justify-content:space-between;margin-top:30px;font-size:11px;">
          <div style="text-align:center;">_________________________<br><strong>Class Teacher</strong></div>
          <div style="text-align:center;">_________________________<br><strong>Principal</strong></div>
        </div>
        <div style="text-align:center;margin-top:8px;font-size:11px;">_________________________<br><strong>School Stamp</strong></div>
      </div>`;
  },

  printBCModal() { this.printModalWrapper('bcCertInner', 'Bonafide Certificate'); },

  async viewStudentProfile(id) {
    const sRes = await api.getStudent(id);
    if (!sRes.success) return this.notify('Student not found', 'error');
    const s = sRes.data;
    this.showModal(`
      <h3>Student Profile</h3>
      <div style="display:flex;gap:20px;padding:16px 0;">
        <div style="flex-shrink:0;">
          ${s.photo_path ? `<img src="${s.photo_path}" style="width:120px;height:140px;border-radius:8px;object-fit:cover;border:2px solid var(--border);">` : `<div style="width:120px;height:140px;border:2px dashed var(--border);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:12px;">No Photo</div>`}
        </div>
        <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">
          <div><strong>Name:</strong> ${s.name}</div>
          <div><strong>Roll No:</strong> ${s.roll_no}</div>
          <div><strong>Class:</strong> ${s.class}</div>
          <div><strong>Faculty:</strong> ${s.faculty}</div>
          <div><strong>SYM:</strong> ${s.sym || '-'}</div>
          <div><strong>REG:</strong> ${s.reg || '-'}</div>
          <div><strong>Gender:</strong> ${s.gender || '-'}</div>
          <div><strong>DOB BS:</strong> ${s.dob_bs || '-'}</div>
          <div><strong>DOB AD:</strong> ${s.dob ? s.dob.split('T')[0] : '-'}</div>
          <div><strong>Father:</strong> ${s.father_name || '-'}</div>
          <div><strong>Mother:</strong> ${s.mother_name || '-'}</div>
          <div><strong>Guardian:</strong> ${s.guardian_name || '-'}</div>
          <div><strong>Phone:</strong> ${s.phone || '-'}</div>
          <div><strong>Address:</strong> ${s.address || '-'}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-primary" onclick="App.closeModal();App.showEditStudentModal(${s.id})"><i class="fas fa-edit"></i> Edit</button>
        <button class="btn btn-outline" onclick="App.closeModal()">Close</button>
      </div>
    `);
  },

  filterStudents() {
    const cls = document.getElementById('filterStudentClass').value;
    const faculty = document.getElementById('filterStudentFaculty').value;
    const filtered = this.state.students.filter(s =>
      (!cls || s.class === cls) && (!faculty || s.faculty === faculty)
    );
    this.state.students = filtered;
    this.state.studentPage = 1;
    this.renderStudentTable(filtered, 1, this.state.rowsPerPage);
  },

  showAddStudentModal() {
    this.showModal(`
      <h3>Add New Student</h3>
      <form id="studentForm" onsubmit="return App.saveStudent(event)">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group"><label>Name *</label><input class="form-control" name="name" required></div>
          <div class="form-group"><label>SYM *</label><input class="form-control" name="sym" required></div>
          <div class="form-group"><label>REG *</label><input class="form-control" name="reg" required></div>
          <div class="form-group"><label>Roll No *</label><input class="form-control" name="roll_no" required></div>
          <div class="form-group"><label>Class *</label>
            <select class="form-control" name="class" required>
              ${_classOpts()}
            </select>
          </div>
          <div class="form-group"><label>Faculty *</label>
            <select class="form-control" name="faculty" required>
              <option value="Common">Common</option><option value="General">General</option><option value="Technical">Technical</option>
            </select>
          </div>
          <div class="form-group"><label>Gender</label>
            <select class="form-control" name="gender">
              <option value="">Select</option><option>Male</option><option>Female</option><option>Other</option>
            </select>
          </div>
          <div class="form-group"><label>DOB BS</label><input class="form-control" name="dob_bs" placeholder="yyyy-mm-dd" oninput="App.convertDobBs(this)"></div>
          <div class="form-group"><label>DOB AD</label><input class="form-control" name="dob" type="date"></div>
          <div class="form-group"><label>Father's Name</label><input class="form-control" name="father_name"></div>
          <div class="form-group"><label>Mother's Name</label><input class="form-control" name="mother_name"></div>
          <div class="form-group"><label>Guardian Name</label><input class="form-control" name="guardian_name"></div>
          <div class="form-group"><label>Phone</label><input class="form-control" name="phone" type="tel"></div>
          <div class="form-group" style="grid-column:1/-1;"><label>Address</label><input class="form-control" name="address"></div>
        </div>
        <div class="form-group" style="margin-top:8px;">
          <label>Photo</label>
          <input class="form-control" type="file" accept="image/*" id="studentPhotoInput" onchange="App.previewStudentPhoto(event)">
          <input type="hidden" name="photo_path" id="studentPhotoPath">
          <div id="studentPhotoPreview" style="margin-top:4px;"></div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" onclick="App.closeModal()"><i class="fas fa-times"></i> Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save Student</button>
        </div>
      </form>`);
  },

  showEditStudentModal(id) {
    const student = this.state.students.find(s => s.id == id);
    if (!student) return;
    this.showModal(`
      <h3>Edit Student</h3>
      <form id="studentForm" onsubmit="return App.updateStudent(event, ${id})">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group"><label>Name *</label><input class="form-control" name="name" value="${student.name}" required></div>
          <div class="form-group"><label>SYM *</label><input class="form-control" name="sym" value="${student.sym||''}" required></div>
          <div class="form-group"><label>REG *</label><input class="form-control" name="reg" value="${student.reg||''}" required></div>
          <div class="form-group"><label>Roll No *</label><input class="form-control" name="roll_no" value="${student.roll_no}" required></div>
          <div class="form-group"><label>Class *</label>
            <select class="form-control" name="class" required>
              ${_classOpts(student.class)}
            </select>
          </div>
          <div class="form-group"><label>Faculty *</label>
            <select class="form-control" name="faculty" required>
              <option value="Common" ${student.faculty==='Common'?'selected':''}>Common</option>
              <option value="General" ${student.faculty==='General'?'selected':''}>General</option>
              <option value="Technical" ${student.faculty==='Technical'?'selected':''}>Technical</option>
            </select>
          </div>
          <div class="form-group"><label>Gender</label>
            <select class="form-control" name="gender">
              <option value="">Select</option>
              <option ${student.gender==='Male'?'selected':''}>Male</option>
              <option ${student.gender==='Female'?'selected':''}>Female</option>
              <option ${student.gender==='Other'?'selected':''}>Other</option>
            </select>
          </div>
          <div class="form-group"><label>DOB BS</label><input class="form-control" name="dob_bs" value="${student.dob_bs||''}" placeholder="yyyy-mm-dd" oninput="App.convertDobBs(this)"></div>
          <div class="form-group"><label>DOB AD</label><input class="form-control" name="dob" type="date" value="${student.dob||''}"></div>
          <div class="form-group"><label>Father's Name</label><input class="form-control" name="father_name" value="${student.father_name||''}"></div>
          <div class="form-group"><label>Mother's Name</label><input class="form-control" name="mother_name" value="${student.mother_name||''}"></div>
          <div class="form-group"><label>Guardian Name</label><input class="form-control" name="guardian_name" value="${student.guardian_name||''}"></div>
          <div class="form-group"><label>Phone</label><input class="form-control" name="phone" type="tel" value="${student.phone||''}"></div>
          <div class="form-group" style="grid-column:1/-1;"><label>Address</label><input class="form-control" name="address" value="${student.address||''}"></div>
        </div>
        <div class="form-group" style="margin-top:8px;">
          <label>Photo</label>
          <input class="form-control" type="file" accept="image/*" id="studentPhotoInput" onchange="App.previewStudentPhoto(event)">
          <input type="hidden" name="photo_path" id="studentPhotoPath" value="${student.photo_path||''}">
          <div id="studentPhotoPreview" style="margin-top:4px;">${student.photo_path ? `<img src="${student.photo_path}" style="max-height:80px;border:1px solid var(--border);border-radius:4px;">` : ''}</div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" onclick="App.closeModal()"><i class="fas fa-times"></i> Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Update Student</button>
        </div>
      </form>`);
  },

  async saveStudent(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    data.session = this.state.session;
    const res = await api.addStudent(data);
    if (res.success) {
      this.closeModal();
      this.notify('Student added successfully');
      await this.renderStudents();
    } else {
      this.notify('Error: ' + res.error, 'error');
    }
    return false;
  },

  async updateStudent(e, id) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    data.session = this.state.session;
    const res = await api.updateStudent(id, data);
    if (res.success) {
      this.closeModal();
      this.notify('Student updated successfully');
      await this.renderStudents();
    } else {
      this.notify('Error: ' + res.error, 'error');
    }
    return false;
  },

  async deleteStudent(id) {
    if (!confirm('Delete this student and all their marks/results?')) return;
    const res = await api.deleteStudent(id);
    if (res.success) {
      this.notify('Student deleted');
      await this.renderStudents();
    } else {
      this.notify('Error: ' + res.error, 'error');
    }
  },

  previewStudentPhoto(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 500 * 1024) { this.notify('Photo must be under 500KB', 'warning'); event.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = function(e) {
      document.getElementById('studentPhotoPath').value = e.target.result;
      document.getElementById('studentPhotoPreview').innerHTML = `<img src="${e.target.result}" style="max-height:80px;border:1px solid var(--border);border-radius:4px;">`;
    };
    reader.readAsDataURL(file);
  },

  // ---- SUBJECTS ----
  renderSubjectTable(data, page, rowsPerPage) {
    const total = data.length;
    const totalPages = Math.ceil(total / rowsPerPage) || 1;
    const start = (page - 1) * rowsPerPage;
    const slice = data.slice(start, start + rowsPerPage);
    const tbody = document.getElementById('subjectTableBody');
    const pagination = document.getElementById('subjectPagination');
    if (tbody) tbody.innerHTML = this.renderSubjectRows(slice, start);
    if (pagination) {
      pagination.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:8px 0;font-size:12px;">
          <span>Showing ${total ? start+1 : 0}–${Math.min(start+rowsPerPage, total)} of ${total}</span>
          <div style="display:flex;align-items:center;gap:4px;">
            <button class="btn btn-sm btn-outline" onclick="App.goToSubjectPage(${page-1})" ${page<=1?'disabled':''}>« Prev</button>
            ${Array.from({length: totalPages}, (_, i) => i+1).map(p =>
              `<button class="btn btn-sm ${p===page?'btn-primary':'btn-outline'}" onclick="App.goToSubjectPage(${p})" style="min-width:28px;">${p}</button>`
            ).join('')}
            <button class="btn btn-sm btn-outline" onclick="App.goToSubjectPage(${page+1})" ${page>=totalPages?'disabled':''}>Next »</button>
          </div>
          <label><select onchange="App.changeSubjectRowsPerPage(this.value)" style="padding:3px 6px;border-radius:4px;border:1px solid var(--border);font-size:12px;">
            ${[10,25,50,100].map(n => `<option value="${n}" ${n==rowsPerPage?'selected':''}>${n} / page</option>`).join('')}
          </select></label>
        </div>`;
    }
  },

  goToSubjectPage(page) {
    const totalPages = Math.ceil(this.state.subjects.length / this.state.subjectRowsPerPage) || 1;
    if (page < 1 || page > totalPages) return;
    this.state.subjectPage = page;
    this.renderSubjectTable(this.state.subjects, page, this.state.subjectRowsPerPage);
  },

  changeSubjectRowsPerPage(n) {
    this.state.subjectRowsPerPage = parseInt(n);
    this.state.subjectPage = 1;
    this.renderSubjectTable(this.state.subjects, 1, this.state.subjectRowsPerPage);
  },

  async renderSubjects() {
    const res = await api.getSubjects({});
    const subjects = res.success ? res.data : [];
    this.state.subjects = subjects;
    this.state.subjectPage = 1;
    document.getElementById('pageContent').innerHTML = `
      <div class="filter-bar">
        <div class="form-group">
          <label>Class</label>
          <select class="form-control" id="filterSubjClass" onchange="App.filterSubjects()">
            ${_classOptsAll()}
          </select>
        </div>
        <div class="form-group">
          <label>Faculty</label>
          <select class="form-control" id="filterSubjFaculty" onchange="App.filterSubjects()">
            <option value="">All</option>
            <option value="Common">Common</option><option value="General">General</option><option value="Technical">Technical</option>
          </select>
        </div>
        <button class="btn btn-primary" onclick="App.showAddSubjectModal()"><i class="fas fa-plus"></i> Add Subject</button>
        <button class="btn btn-outline" onclick="App.addPresetSubjects()"><i class="fas fa-list"></i> Add Preset Subjects</button>
        <button class="btn btn-outline" onclick="App.downloadSubjectTemplate()"><i class="fas fa-file-download"></i> Template</button>
        <button class="btn btn-outline" onclick="App.exportSubjects()"><i class="fas fa-download"></i> Export</button>
        <button class="btn btn-outline" onclick="App.importSubjects()"><i class="fas fa-upload"></i> Import</button>
        <button class="btn btn-danger" id="btnDeleteSelectedSubjects" style="display:none;" onclick="App.deleteSelectedSubjects()"><i class="fas fa-trash"></i> Delete <span id="selectedSubjectCount">0</span></button>
      </div>
      <div class="table-container">
        <table>
          <thead><tr>
            <th><input type="checkbox" id="selectAllSubjects" onchange="App.toggleSelectAllSubjects(this.checked)"></th>
            <th>SN</th><th>Code</th><th>Subject Name</th><th>Class</th><th>Faculty</th>
            <th>Final Exam<br><small>TH(FM/PM)</small></th><th><small>PR(FM/PM)</small></th><th><small>Credits</small></th>
            <th>1st Term<br><small>FM/PM/CH</small></th><th>2nd Term<br><small>FM/PM/CH</small></th>
            <th>Display Seq.</th><th>Total Mark</th><th>Comp.</th><th>Actions</th>
          </tr></thead>
          <tbody id="subjectTableBody"></tbody>
        </table>
        <div id="subjectPagination"></div>
      </div>`;
    this.renderSubjectTable(subjects, 1, this.state.subjectRowsPerPage);
  },

  renderSubjectRows(subjects, start = 0) {
    return subjects.length ? subjects.map((s, i) => {
      const totalMark = (parseFloat(s.full_marks_theory)||0) + (parseFloat(s.full_marks_practical)||0);
      const totalCredit = (parseFloat(s.credit_th)||0) + (parseFloat(s.credit_in)||0);
      return `<tr data-class="${s.class}" data-faculty="${s.faculty}">
        <td><input type="checkbox" class="subject-select" value="${s.id}" onchange="App.updateDeleteSelectedBtn('subject')"></td>
        <td>${start + i + 1}</td><td>${s.code}</td><td>${s.name}</td>
        <td>${s.class}</td><td>${s.faculty}</td>
        <td>${s.full_marks_theory}/${s.pass_marks_theory}</td>
        <td>${s.full_marks_practical}/${s.pass_marks_practical}</td>
        <td>${s.credit_th}/${s.credit_in}</td>
        <td>${s.term1_full_marks||0}/${s.term1_pass_marks||0}/${s.term1_credit_hours||0}</td>
        <td>${s.term2_full_marks||0}/${s.term2_pass_marks||0}/${s.term2_credit_hours||0}</td>
        <td>${s.display_seq != null ? s.display_seq : '-'}</td>
        <td>${totalMark}</td>
        <td>${s.is_compulsory ? 'Yes' : 'No'}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="App.showEditSubjectModal(${s.id})"><i class="fas fa-edit"></i></button>
          <button class="btn btn-sm btn-danger" onclick="App.deleteSubject(${s.id})"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('') : '<tr><td colspan="15" class="text-center text-muted">No subjects added yet</td></tr>';
  },

  filterSubjects() {
    const cls = document.getElementById('filterSubjClass').value;
    const faculty = document.getElementById('filterSubjFaculty').value;
    const filtered = this.state.subjects.filter(s =>
      (!cls || s.class == cls) && (!faculty || s.faculty === faculty)
    );
    this.state.subjects = filtered;
    this.state.subjectPage = 1;
    this.renderSubjectTable(filtered, 1, this.state.subjectRowsPerPage);
  },

  toggleSelectAllStudents(checked) {
    document.querySelectorAll('.student-select').forEach(cb => cb.checked = checked);
    this.updateDeleteSelectedBtn('student');
  },
  toggleSelectAllSubjects(checked) {
    document.querySelectorAll('.subject-select').forEach(cb => cb.checked = checked);
    this.updateDeleteSelectedBtn('subject');
  },
  updateDeleteSelectedBtn(type) {
    const selector = type === 'student' ? '.student-select' : '.subject-select';
    const btnId = type === 'student' ? 'btnDeleteSelectedStudents' : 'btnDeleteSelectedSubjects';
    const countId = type === 'student' ? 'selectedStudentCount' : 'selectedSubjectCount';
    const checked = document.querySelectorAll(`${selector}:checked`).length;
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.style.display = checked > 0 ? 'inline-flex' : 'none';
      document.getElementById(countId).textContent = checked;
    }
  },
  async deleteSelectedStudents() {
    const ids = [...document.querySelectorAll('.student-select:checked')].map(cb => parseInt(cb.value));
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} selected student(s) and all their marks/results?`)) return;
    const res = await api.deleteMultipleStudents(ids);
    if (res.success) {
      this.notify(`${ids.length} student(s) deleted`);
      await this.renderStudents();
    } else {
      this.notify('Error: ' + res.error, 'error');
    }
  },
  async deleteSelectedSubjects() {
    const ids = [...document.querySelectorAll('.subject-select:checked')].map(cb => parseInt(cb.value));
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} selected subject(s)? Marks using them will also be deleted.`)) return;
    const res = await api.deleteMultipleSubjects(ids);
    if (res.success) {
      this.notify(`${ids.length} subject(s) deleted`);
      await this.renderSubjects();
    } else {
      this.notify('Error: ' + res.error, 'error');
    }
  },

  showAddSubjectModal() {
    this.showModal(`
      <h3>Add New Subject</h3>
      <form id="subjectForm" onsubmit="return App.saveSubject(event)">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
          <div class="form-group" style="grid-column:1/-1;"><label><i class="fas fa-book"></i> Subject Name *</label><input class="form-control" name="name" required></div>
          <div class="form-group"><label><i class="fas fa-barcode"></i> Code *</label><input class="form-control" name="code" required></div>
          <div class="form-group"><label><i class="fas fa-layer-group"></i> Class *</label>
            <select class="form-control" name="class" required>
              ${_classOpts()}
            </select>
          </div>
          <div class="form-group"><label><i class="fas fa-university"></i> Faculty *</label>
            <select class="form-control" name="faculty" required>
              <option value="Common">Common</option><option value="General">General</option><option value="Technical">Technical</option>
            </select>
          </div>
        </div>
        <h4 style="margin:12px 0 6px;border-bottom:1px solid var(--border);padding-bottom:4px;font-size:14px;">Final Exam</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
          <div class="form-group"><label>Full Marks (Theory)</label><input class="form-control" name="full_marks_theory" type="number" step="any" value="75"></div>
          <div class="form-group"><label>Pass Marks (Theory)</label><input class="form-control" name="pass_marks_theory" type="number" step="any" value="27"></div>
          <div class="form-group"><label>Credit (Theory)</label><input class="form-control" name="credit_th" type="number" value="3" step="any"></div>
          <div class="form-group"><label>Full Marks (Practical)</label><input class="form-control" name="full_marks_practical" type="number" step="any" value="25"></div>
          <div class="form-group"><label>Pass Marks (Practical)</label><input class="form-control" name="pass_marks_practical" type="number" step="any" value="9"></div>
          <div class="form-group"><label>Credit (Practical)</label><input class="form-control" name="credit_in" type="number" value="2" step="any"></div>
        </div>
        <h4 style="margin:12px 0 6px;border-bottom:1px solid var(--border);padding-bottom:4px;font-size:14px;">1st Term</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
          <div class="form-group"><label>Full Marks</label><input class="form-control" name="term1_full_marks" type="number" step="any" value="0"></div>
          <div class="form-group"><label>Pass Marks</label><input class="form-control" name="term1_pass_marks" type="number" step="any" value="0"></div>
          <div class="form-group"><label>Credit Hours</label><input class="form-control" name="term1_credit_hours" type="number" step="any" value="0"></div>
        </div>
        <h4 style="margin:12px 0 6px;border-bottom:1px solid var(--border);padding-bottom:4px;font-size:14px;">2nd Term</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
          <div class="form-group"><label>Full Marks</label><input class="form-control" name="term2_full_marks" type="number" step="any" value="0"></div>
          <div class="form-group"><label>Pass Marks</label><input class="form-control" name="term2_pass_marks" type="number" step="any" value="0"></div>
          <div class="form-group"><label>Credit Hours</label><input class="form-control" name="term2_credit_hours" type="number" step="any" value="0"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">
          <div class="form-group"><label><i class="fas fa-check-circle"></i> Compulsory</label>
            <select class="form-control" name="is_compulsory">
              <option value="1">Yes</option><option value="0">No</option>
            </select>
          </div>
          <div class="form-group"><label><i class="fas fa-sort-numeric-up"></i> Display Seq.</label><input class="form-control" name="display_seq" type="number" value="0" step="1"></div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" onclick="App.closeModal()"><i class="fas fa-times"></i> Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save Subject</button>
        </div>
      </form>`);
  },

  showEditSubjectModal(id) {
    const subj = this.state.subjects.find(s => s.id == id);
    if (!subj) return;
    this.showModal(`
      <h3>Edit Subject</h3>
      <form id="subjectForm" onsubmit="return App.updateSubject(event, ${id})">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
          <div class="form-group" style="grid-column:1/-1;"><label><i class="fas fa-book"></i> Subject Name *</label><input class="form-control" name="name" value="${subj.name}" required></div>
          <div class="form-group"><label><i class="fas fa-barcode"></i> Code *</label><input class="form-control" name="code" value="${subj.code}" required></div>
          <div class="form-group"><label><i class="fas fa-layer-group"></i> Class *</label>
            <select class="form-control" name="class" required>
              ${_classOpts(subj.class)}
            </select>
          </div>
          <div class="form-group"><label><i class="fas fa-university"></i> Faculty *</label>
            <select class="form-control" name="faculty" required>
              <option value="Common" ${subj.faculty=='Common'?'selected':''}>Common</option>
              <option value="General" ${subj.faculty=='General'?'selected':''}>General</option>
              <option value="Technical" ${subj.faculty=='Technical'?'selected':''}>Technical</option>
            </select>
          </div>
        </div>
        <h4 style="margin:12px 0 6px;border-bottom:1px solid var(--border);padding-bottom:4px;font-size:14px;">Final Exam</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
          <div class="form-group"><label>Full Marks (Theory)</label><input class="form-control" name="full_marks_theory" type="number" step="any" value="${subj.full_marks_theory}"></div>
          <div class="form-group"><label>Pass Marks (Theory)</label><input class="form-control" name="pass_marks_theory" type="number" step="any" value="${subj.pass_marks_theory}"></div>
          <div class="form-group"><label>Credit (Theory)</label><input class="form-control" name="credit_th" type="number" value="${subj.credit_th}" step="any"></div>
          <div class="form-group"><label>Full Marks (Practical)</label><input class="form-control" name="full_marks_practical" type="number" step="any" value="${subj.full_marks_practical}"></div>
          <div class="form-group"><label>Pass Marks (Practical)</label><input class="form-control" name="pass_marks_practical" type="number" step="any" value="${subj.pass_marks_practical}"></div>
          <div class="form-group"><label>Credit (Practical)</label><input class="form-control" name="credit_in" type="number" value="${subj.credit_in}" step="any"></div>
        </div>
        <h4 style="margin:12px 0 6px;border-bottom:1px solid var(--border);padding-bottom:4px;font-size:14px;">1st Term</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
          <div class="form-group"><label>Full Marks</label><input class="form-control" name="term1_full_marks" type="number" step="any" value="${subj.term1_full_marks||0}"></div>
          <div class="form-group"><label>Pass Marks</label><input class="form-control" name="term1_pass_marks" type="number" step="any" value="${subj.term1_pass_marks||0}"></div>
          <div class="form-group"><label>Credit Hours</label><input class="form-control" name="term1_credit_hours" type="number" step="any" value="${subj.term1_credit_hours||0}"></div>
        </div>
        <h4 style="margin:12px 0 6px;border-bottom:1px solid var(--border);padding-bottom:4px;font-size:14px;">2nd Term</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
          <div class="form-group"><label>Full Marks</label><input class="form-control" name="term2_full_marks" type="number" step="any" value="${subj.term2_full_marks||0}"></div>
          <div class="form-group"><label>Pass Marks</label><input class="form-control" name="term2_pass_marks" type="number" step="any" value="${subj.term2_pass_marks||0}"></div>
          <div class="form-group"><label>Credit Hours</label><input class="form-control" name="term2_credit_hours" type="number" step="any" value="${subj.term2_credit_hours||0}"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">
          <div class="form-group"><label><i class="fas fa-check-circle"></i> Compulsory</label>
            <select class="form-control" name="is_compulsory">
              <option value="1" ${subj.is_compulsory==1?'selected':''}>Yes</option>
              <option value="0" ${subj.is_compulsory==0?'selected':''}>No</option>
            </select>
          </div>
          <div class="form-group"><label><i class="fas fa-sort-numeric-up"></i> Display Seq.</label><input class="form-control" name="display_seq" type="number" value="${subj.display_seq||0}" step="1"></div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" onclick="App.closeModal()"><i class="fas fa-times"></i> Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Update Subject</button>
        </div>
      </form>`);
  },

  async saveSubject(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    data.full_marks_theory = parseFloat(data.full_marks_theory) || 75;
    data.full_marks_practical = parseFloat(data.full_marks_practical) || 25;
    data.pass_marks_theory = parseFloat(data.pass_marks_theory) || 27;
    data.pass_marks_practical = parseFloat(data.pass_marks_practical) || 9;
    data.credit_th = parseFloat(data.credit_th) || 3;
    data.credit_in = parseFloat(data.credit_in) || 2;
    data.credit_hours = data.credit_th + data.credit_in;
    data.is_compulsory = parseInt(data.is_compulsory);
    data.display_seq = parseFloat(data.display_seq) || 0;
    data.term1_full_marks = parseFloat(data.term1_full_marks) || 0;
    data.term1_pass_marks = parseFloat(data.term1_pass_marks) || 0;
    data.term1_credit_hours = parseFloat(data.term1_credit_hours) || 0;
    data.term2_full_marks = parseFloat(data.term2_full_marks) || 0;
    data.term2_pass_marks = parseFloat(data.term2_pass_marks) || 0;
    data.term2_credit_hours = parseFloat(data.term2_credit_hours) || 0;
    const res = await api.addSubject(data);
    if (res.success) {
      this.closeModal();
      this.notify('Subject added');
      await this.renderSubjects();
    } else {
      this.notify('Error: ' + res.error, 'error');
    }
    return false;
  },

  async updateSubject(e, id) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    data.full_marks_theory = parseFloat(data.full_marks_theory) || 75;
    data.full_marks_practical = parseFloat(data.full_marks_practical) || 25;
    data.pass_marks_theory = parseFloat(data.pass_marks_theory) || 27;
    data.pass_marks_practical = parseFloat(data.pass_marks_practical) || 9;
    data.credit_th = parseFloat(data.credit_th) || 3;
    data.credit_in = parseFloat(data.credit_in) || 2;
    data.credit_hours = data.credit_th + data.credit_in;
    data.is_compulsory = parseInt(data.is_compulsory);
    data.display_seq = parseFloat(data.display_seq) || 0;
    data.term1_full_marks = parseFloat(data.term1_full_marks) || 0;
    data.term1_pass_marks = parseFloat(data.term1_pass_marks) || 0;
    data.term1_credit_hours = parseFloat(data.term1_credit_hours) || 0;
    data.term2_full_marks = parseFloat(data.term2_full_marks) || 0;
    data.term2_pass_marks = parseFloat(data.term2_pass_marks) || 0;
    data.term2_credit_hours = parseFloat(data.term2_credit_hours) || 0;
    const res = await api.updateSubject(id, data);
    if (res.success) {
      this.closeModal();
      this.notify('Subject updated');
      await this.renderSubjects();
    } else {
      this.notify('Error: ' + res.error, 'error');
    }
    return false;
  },

  async deleteSubject(id) {
    if (!confirm('Delete this subject? Marks using it will also be deleted.')) return;
    const res = await api.deleteSubject(id);
    if (res.success) {
      this.notify('Subject deleted');
      await this.renderSubjects();
    } else {
      this.notify('Error: ' + res.error, 'error');
    }
  },

  downloadSubjectTemplate() {
    const X = XLSX;
    const headers = ['Code', 'Subject Name', 'Class', 'Faculty', 'Full Marks (Theory)', 'Pass Marks (Theory)', 'Full Marks (Practical)', 'Pass Marks (Practical)', 'Credit (Theory)', 'Credit (Practical)', '1st Term FM', '1st Term PM', '1st Term CH', '2nd Term FM', '2nd Term PM', '2nd Term CH', 'Compulsory', 'Display Seq.'];
    const sample = ['NEP101', 'Nepali', '11', 'Common', '75', '27', '25', '9', '3', '2', '50', '20', '3', '50', '20', '3', 'Yes', '0'];
    const ws = X.utils.aoa_to_sheet([headers, sample]);
    ws['!cols'] = headers.map(() => ({ wch: 16 }));
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, ws, 'Subject Template');
    const wbout = X.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'subject-import-template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
    this.notify('Template downloaded');
  },

  async exportSubjects() {
    const res = await api.exportJSON('subjects');
    if (!res.success) return this.notify('Export failed', 'error');
    const X = XLSX;
    const arr = this.rowsToObjects(res.data);
    const ws = X.utils.json_to_sheet(arr);
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, ws, 'Subjects');
    const wbout = X.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `subjects-${this.state.session || 'data'}-${new Date().toISOString().slice(0,10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    this.notify('Subjects exported');
  },

  async importSubjects() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const X = XLSX;
        const data = await file.arrayBuffer();
        const wb = X.read(data, { type: 'array' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const json = X.utils.sheet_to_json(ws);
        if (!json.length) return this.notify('Excel file is empty', 'warning');
        const subjects = json.map(row => ({
          name: String(row['Subject Name'] || '').trim(),
          code: String(row['Code'] || '').trim(),
          class: String(row['Class'] || '').trim(),
          faculty: String(row['Faculty'] || 'General').trim(),
          full_marks_theory: parseFloat(row['Full Marks (Theory)']) || 75,
          pass_marks_theory: parseFloat(row['Pass Marks (Theory)']) || 27,
          full_marks_practical: parseFloat(row['Full Marks (Practical)']) || 25,
          pass_marks_practical: parseFloat(row['Pass Marks (Practical)']) || 9,
          credit_th: parseFloat(row['Credit (Theory)']) || 3,
          credit_in: parseFloat(row['Credit (Practical)']) || 2,
          credit_hours: (parseFloat(row['Credit (Theory)']) || 3) + (parseFloat(row['Credit (Practical)']) || 2),
          term1_full_marks: parseFloat(row['1st Term FM']) || 0,
          term1_pass_marks: parseFloat(row['1st Term PM']) || 0,
          term1_credit_hours: parseFloat(row['1st Term CH']) || 0,
          term2_full_marks: parseFloat(row['2nd Term FM']) || 0,
          term2_pass_marks: parseFloat(row['2nd Term PM']) || 0,
          term2_credit_hours: parseFloat(row['2nd Term CH']) || 0,
          is_compulsory: String(row['Compulsory'] || 'Yes').trim().toLowerCase() === 'yes' ? 1 : 0,
          display_seq: parseFloat(row['Display Seq.']) || 0
        }));
        let imported = 0, errors = 0;
        for (const subj of subjects) {
          if (!subj.name || !subj.code || !subj.class) { errors++; continue; }
          const res = await api.addSubject(subj);
          if (res.success) imported++; else errors++;
        }
        this.notify(`Imported: ${imported} subjects${errors ? ', Errors: '+errors : ''}`);
        await this.renderSubjects();
      } catch (err) {
        this.notify('Error reading Excel file: ' + err.message, 'error');
      }
    };
    input.click();
  },

  async addPresetSubjects() {
    const presets = {
      Common: [
        { name: 'Nepali', code: 'NEP101', theory: 75, practical: 25, tpass: 27, ppass: 9, credit: 5, cth: 3, cin: 2 },
        { name: 'English', code: 'ENG101', theory: 75, practical: 25, tpass: 27, ppass: 9, credit: 5, cth: 3, cin: 2 },
        { name: 'Social Studies', code: 'SOC101', theory: 75, practical: 25, tpass: 27, ppass: 9, credit: 5, cth: 3, cin: 2 },
      ],
      General: [
        { name: 'Mathematics', code: 'MTH101', theory: 75, practical: 25, tpass: 27, ppass: 9, credit: 5, cth: 3, cin: 2 },
        { name: 'Science', code: 'SCI101', theory: 75, practical: 25, tpass: 27, ppass: 9, credit: 5, cth: 3, cin: 2 },
        { name: 'Health & Physical Education', code: 'HPE101', theory: 50, practical: 50, tpass: 18, ppass: 18, credit: 5, cth: 2, cin: 3 },
      ],
      Technical: [
        { name: 'Computer Science', code: 'COM101', theory: 50, practical: 50, tpass: 18, ppass: 18, credit: 5, cth: 2, cin: 3 },
        { name: 'Engineering Drawing', code: 'EGD101', theory: 25, practical: 75, tpass: 9, ppass: 27, credit: 5, cth: 1, cin: 4 },
        { name: 'Applied Mathematics', code: 'AMT101', theory: 75, practical: 25, tpass: 27, ppass: 9, credit: 5, cth: 3, cin: 2 },
      ],
    };
    let count = 0;
    for (const [faculty, subjects] of Object.entries(presets)) {
      for (const subj of subjects) {
        for (const cls of window._ALL_CLASSES) {
          const existing = await api.getSubjects({ class: cls, faculty });
          const exists = existing.success && existing.data.some(s => s.code === subj.code);
          if (!exists) {
            await api.addSubject({
              name: subj.name, code: subj.code, class: cls, faculty,
              full_marks_theory: subj.theory, full_marks_practical: subj.practical,
              pass_marks_theory: subj.tpass, pass_marks_practical: subj.ppass,
              credit_hours: subj.credit, credit_th: subj.cth, credit_in: subj.cin,
              term1_full_marks: 0, term1_pass_marks: 0, term1_credit_hours: 0,
              term2_full_marks: 0, term2_pass_marks: 0, term2_credit_hours: 0,
              is_compulsory: 1
            });
            count++;
          }
        }
      }
    }
    this.notify(`${count} preset subjects added`);
    await this.renderSubjects();
  },

  // ---- SUBJECT REGISTRATION ----
  async renderSubjectRegistration() {
    const sRes = await api.getStudents({ session: this.state.session });
    const students = sRes.success ? sRes.data : [];
    const subRes = await api.getSubjects({});
    const allSubjects = subRes.success ? subRes.data : [];
    const regRes = await api.getSubjectRegistrations('all', this.state.session);
    const allRegs = regRes.success ? regRes.data : [];
    this.state.subjects = allSubjects;
    this.state._regStudents = students;
    // Build student→subjects map
    const regMap = {};
    for (const r of allRegs) {
      if (!regMap[r.student_id]) regMap[r.student_id] = [];
      regMap[r.student_id].push(r.subject_id);
    }
    this.state._regMap = regMap;
    const subjMap = {};
    for (const s of allSubjects) subjMap[s.id] = s;
    this.state._regSubjMap = subjMap;
    this.state.regPage = 1;
    document.getElementById('pageContent').innerHTML = `
      <div class="filter-bar">
        <div class="form-group">
          <label>Class</label>
          <select class="form-control" id="regClassFilter" onchange="App.filterRegStudents()">
            ${_classOptsAll()}
          </select>
        </div>
        <div class="form-group">
          <label>Faculty</label>
          <select class="form-control" id="regFacultyFilter" onchange="App.filterRegStudents()">
            <option value="">All</option>
            <option value="Common">Common</option><option value="General">General</option><option value="Technical">Technical</option>
          </select>
        </div>
        <div class="form-group" style="flex:1;min-width:200px;">
          <label>Select Student</label>
          <select class="form-control" id="regStudentSelect" onchange="App.onRegStudentChange()">
            <option value="">-- Select Student --</option>
            ${students.map(s => `<option value="${s.id}" data-class="${s.class}" data-faculty="${s.faculty}">${s.name} (Roll: ${s.roll_no} | ${s.class} ${s.faculty})</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="align-self:flex-end;">
          <button class="btn btn-primary" onclick="App.openBulkRegModal()" title="Bulk Subject Registration"><i class="fas fa-users"></i> Bulk</button>
        </div>
      </div>
      <div id="regSubjectsPanel" style="display:none;">
        <div class="card" style="background:var(--card);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow);margin-bottom:16px;">
          <div class="flex-between mb-2">
            <h3 id="regStudentLabel">Subjects for:</h3>
            <button class="btn btn-success" onclick="App.saveRegistrations()"><i class="fas fa-save"></i> Save Registrations</button>
          </div>
          <div id="regSubjectsList"></div>
        </div>
      </div>
      <div class="card" style="background:var(--card);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow);">
        <h3 class="mb-2">Student Registration List</h3>
        <div class="table-container">
          <table>
            <thead><tr><th>SN</th><th>Roll</th><th>Name</th><th>Class</th><th>Faculty</th><th>Registered Subjects</th><th>Count</th><th>Action</th></tr></thead>
            <tbody id="regStudentListBody"></tbody>
          </table>
          <div id="regPagination"></div>
        </div>
      </div>`;
    this.renderRegTable(students, 1, this.state.regRowsPerPage);
  },

  renderRegTable(data, page, rowsPerPage) {
    const total = data.length;
    const totalPages = Math.ceil(total / rowsPerPage) || 1;
    const start = (page - 1) * rowsPerPage;
    const slice = data.slice(start, start + rowsPerPage);
    const regMap = this.state._regMap || {};
    const subjMap = this.state._regSubjMap || {};
    const tbody = document.getElementById('regStudentListBody');
    const pagination = document.getElementById('regPagination');
    if (tbody) {
      tbody.innerHTML = slice.length ? slice.map((s, i) => {
        const subjIds = regMap[s.id] || [];
        return `<tr data-class="${s.class}" data-faculty="${s.faculty}">
          <td>${start + i + 1}</td>
          <td>${s.roll_no}</td>
          <td>${s.name}</td>
          <td>${s.class}</td>
          <td>${s.faculty}</td>
          <td style="font-size:12px;">${subjIds.length ? subjIds.map(id => subjMap[id] ? subjMap[id].code : '?').join(', ') : '<span class="text-muted">Not registered</span>'}</td>
          <td><a href="#" onclick="App.showRegSubjectsPopup(${s.id});return false;" title="View registered subjects" style="font-weight:600;">${subjIds.length}</a></td>
          <td><button class="btn btn-sm btn-primary" onclick="App.regStudentAction(${s.id})" title="Register/Edit Subjects"><i class="fas fa-pen"></i></button></td>
        </tr>`;
      }).join('') : '<tr><td colspan="8" class="text-center text-muted">No students found</td></tr>';
    }
    if (pagination) pagination.innerHTML = this.renderPagination(total, page, rowsPerPage, 'App.goToRegPage', 'App.changeRegRowsPerPage');
  },

  goToRegPage(page) {
    const total = this.state._regStudents ? this.state._regStudents.length : 0;
    const totalPages = Math.ceil(total / this.state.regRowsPerPage) || 1;
    if (page < 1 || page > totalPages) return;
    this.state.regPage = page;
    this.renderRegTable(this.state._regStudents, page, this.state.regRowsPerPage);
  },

  changeRegRowsPerPage(n) {
    this.state.regRowsPerPage = parseInt(n);
    this.state.regPage = 1;
    this.renderRegTable(this.state._regStudents, 1, this.state.regRowsPerPage);
  },

  filterRegStudents() {
    const cls = document.getElementById('regClassFilter').value;
    const faculty = document.getElementById('regFacultyFilter').value;
    const allStudents = this.state._regStudents || [];
    // Filter dropdown
    document.querySelectorAll('#regStudentSelect option').forEach(opt => {
      if (!opt.value) return;
      const show = (!cls || opt.dataset.class === cls) && (!faculty || opt.dataset.faculty === faculty);
      opt.style.display = show ? '' : 'none';
    });
    // Filter table
    const filtered = allStudents.filter(s =>
      (!cls || s.class == cls) && (!faculty || s.faculty === faculty)
    );
    this.state._regStudents = filtered;
    this.state.regPage = 1;
    this.renderRegTable(filtered, 1, this.state.regRowsPerPage);
    document.getElementById('regStudentSelect').value = '';
    document.getElementById('regSubjectsPanel').style.display = 'none';
  },

  async onRegStudentChange() {
    const sel = document.getElementById('regStudentSelect');
    const studentId = sel.value;
    const panel = document.getElementById('regSubjectsPanel');
    if (!studentId) { panel.style.display = 'none'; return; }
    const student = (await api.getStudent(studentId)).data;
    if (!student) { panel.style.display = 'none'; return; }
    document.getElementById('regStudentLabel').textContent = `Subjects for: ${student.name} (Roll: ${student.roll_no} | ${student.class} ${student.faculty})`;
    // Get subjects relevant to this student
    const subjRes = await api.getSubjects({ class: student.class, faculty: student.faculty !== 'Common' ? student.faculty : '' });
    const commonRes = await api.getSubjects({ class: student.class, faculty: 'Common' });
    const allSubs = [
      ...(subjRes.success ? subjRes.data : []),
      ...(commonRes.success ? commonRes.data : [])
    ];
    // Deduplicate by id and sort by display_seq
    const seen = new Set();
    const subjects = allSubs.filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; })
      .sort((a, b) => (a.display_seq||0) - (b.display_seq||0) || a.name.localeCompare(b.name));
    // Get existing registrations
    const regRes = await api.getSubjectRegistrations(studentId, this.state.session);
    const registeredIds = regRes.success ? regRes.data : [];
    this.state._regStudentId = parseInt(studentId);
    this.state._regSubjectIds = registeredIds;
    const compulsory = subjects.filter(s => s.is_compulsory == 1);
    const optional = subjects.filter(s => s.is_compulsory == 0);
    document.getElementById('regSubjectsList').innerHTML = `
      ${compulsory.length ? `
        <h4 class="mb-1" style="color:var(--primary);">Compulsory Subjects</h4>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;margin-bottom:16px;">
          ${compulsory.map(s => `
            <label class="reg-subj-item" style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;background:#f9fafb;cursor:pointer;opacity:0.7;">
              <input type="checkbox" checked disabled style="accent-color:var(--primary);">
              <span>${s.name} (${s.code})</span>
            </label>`).join('')}
        </div>` : ''}
      ${optional.length ? `
        <h4 class="mb-1" style="color:var(--success);">Optional Subjects</h4>
        <p class="text-muted mb-1" style="font-size:12px;">Check the subjects the student wants to register for:</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;">
          ${optional.map(s => {
            const checked = registeredIds.includes(s.id);
            return `<label class="reg-subj-item" style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;background:${checked?'#e8f0fe':'#fff'};cursor:pointer;">
              <input type="checkbox" class="reg-subj-cb" value="${s.id}" ${checked?'checked':''} onchange="App.onRegSubjectToggle(${s.id}, this.checked)" style="accent-color:var(--primary);">
              <span>${s.name} (${s.code})</span>
              <span class="text-muted" style="font-size:11px;margin-left:auto;">${s.credit_th + s.credit_in} cr</span>
            </label>`;
          }).join('')}
        </div>` : ''}
      ${!compulsory.length && !optional.length ? '<p class="text-muted">No subjects available for this student\'s class and faculty.</p>' : ''}
      <div class="mt-2">
        <button class="btn btn-success" onclick="App.saveRegistrations()"><i class="fas fa-save"></i> Save Registrations</button>
      </div>`;
    panel.style.display = 'block';
  },

  onRegSubjectToggle(subjectId, checked) {
    if (!this.state._regSubjectIds) this.state._regSubjectIds = [];
    if (checked) {
      if (!this.state._regSubjectIds.includes(subjectId)) this.state._regSubjectIds.push(subjectId);
    } else {
      this.state._regSubjectIds = this.state._regSubjectIds.filter(id => id !== subjectId);
    }
  },

  async openBulkRegModal() {
    const allSubjects = this.state.subjects || [];
    this.showModal(`
      <h3>Bulk Subject Registration</h3>
      <p class="text-muted mb-2">Select class, faculty, and subjects to register for all students at once.</p>
      <div style="display:flex;gap:12px;margin-bottom:16px;">
        <div class="form-group" style="flex:1;">
          <label>Class</label>
          <select class="form-control" id="bulkRegClass" onchange="App.refreshBulkRegSubjects()">
            ${_classOptsAll()}
          </select>
        </div>
        <div class="form-group" style="flex:1;">
          <label>Faculty</label>
          <select class="form-control" id="bulkRegFaculty" onchange="App.refreshBulkRegSubjects()">
            <option value="">All</option>
            <option value="Common">Common</option><option value="General">General</option><option value="Technical">Technical</option>
          </select>
        </div>
      </div>
      <div id="bulkRegSubjectsList" style="max-height:350px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:12px;">
        <p class="text-muted">Select class and faculty to load subjects.</p>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" onclick="App.closeModal()"><i class="fas fa-times"></i> Cancel</button>
        <button type="button" class="btn btn-success" onclick="App.executeBulkReg()"><i class="fas fa-users"></i> Register All</button>
      </div>`);
  },

  async refreshBulkRegSubjects() {
    const classVal = document.getElementById('bulkRegClass').value;
    const facultyVal = document.getElementById('bulkRegFaculty').value;
    const container = document.getElementById('bulkRegSubjectsList');
    if (!classVal) { container.innerHTML = '<p class="text-muted">Select a class first.</p>'; return; }
    const subjRes = await api.getSubjects({ class: classVal, faculty: facultyVal });
    const commonRes = await api.getSubjects({ class: classVal, faculty: 'Common' });
    const allSubs = [
      ...(subjRes.success ? subjRes.data : []),
      ...(commonRes.success ? commonRes.data : [])
    ];
    const seen = new Set();
    const subjects = allSubs.filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; })
      .sort((a, b) => (a.display_seq||0) - (b.display_seq||0) || a.name.localeCompare(b.name));
    if (!subjects.length) {
      container.innerHTML = '<p class="text-muted">No subjects found for this class and faculty.</p>';
      return;
    }
    container.innerHTML = `
      <div style="margin-bottom:8px;">
        <label style="cursor:pointer;font-weight:600;">
          <input type="checkbox" onchange="document.querySelectorAll('#bulkRegSubjectsList .subj-cb').forEach(cb => cb.checked = this.checked)">
          Select All / Deselect All
        </label>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;">
        ${subjects.map(s => `
          <label style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;background:${s.is_compulsory?'#f9fafb':'#fff'};cursor:pointer;${s.is_compulsory?'opacity:0.7;':''}">
            <input type="checkbox" class="subj-cb" value="${s.id}" ${s.is_compulsory?'checked disabled':''} style="accent-color:var(--primary);">
            <span>${s.name} (${s.code})</span>
            <span style="margin-left:auto;font-size:11px;color:#888;">${(s.credit_th||0)+(s.credit_in||0)} cr</span>
          </label>`).join('')}
      </div>`;
  },

  async executeBulkReg() {
    const classVal = document.getElementById('bulkRegClass').value;
    const facultyVal = document.getElementById('bulkRegFaculty').value;
    if (!classVal) return this.notify('Please select a class', 'warning');
    const cbs = document.querySelectorAll('#bulkRegSubjectsList .subj-cb:checked');
    const subjectIds = Array.from(cbs).map(cb => parseInt(cb.value));
    if (!subjectIds.length) return this.notify('Please select at least one subject', 'warning');
    const confirmMsg = `Register ${subjectIds.length} subject(s) for ALL students in ${facultyVal ? classVal + ' ' + facultyVal : classVal}?\nThis will overwrite existing registrations.`;
    if (!confirm(confirmMsg)) return;
    const res = await api.bulkSubjectRegistration({
      class_name: classVal,
      faculty: facultyVal,
      subject_ids: subjectIds,
      session: this.state.session
    });
    if (res.success) {
      this.closeModal();
      this.notify(`Bulk registration complete! ${res.count} student(s) updated.`);
      // Refresh the page
      await this.renderSubjectRegistration();
      this.filterRegStudents();
    } else {
      this.notify('Error: ' + res.error, 'error');
    }
  },

  async saveRegistrations() {
    const studentId = this.state._regStudentId;
    if (!studentId) return this.notify('No student selected', 'warning');
    const stRes = await api.getStudent(studentId);
    if (!stRes.success) return this.notify('Student not found', 'error');
    const student = stRes.data;
    // Include compulsory subjects for this student's class/faculty
    const compIds = this.state.subjects.filter(s =>
      s.is_compulsory == 1 && s.class == student.class &&
      (s.faculty === student.faculty || s.faculty === 'Common')
    ).map(s => s.id);
    const optionalIds = this.state._regSubjectIds || [];
    const allIds = [...new Set([...compIds, ...optionalIds])];
    const res = await api.saveSubjectRegistrations({
      student_id: studentId,
      subject_ids: allIds,
      session: this.state.session
    });
    if (res.success) {
      this.notify('Subject registrations saved');
    } else {
      this.notify('Error: ' + res.error, 'error');
    }
  },

  async saveRegistrationsFromPopup(studentId) {
    const stRes = await api.getStudent(studentId);
    if (!stRes.success) return this.notify('Student not found', 'error');
    const student = stRes.data;
    const optRes = await api.getSubjects({ class: student.class, faculty: student.faculty !== 'Common' ? student.faculty : '' });
    const commonRes = await api.getSubjects({ class: student.class, faculty: 'Common' });
    const allSubs = [
      ...(optRes.success ? optRes.data : []),
      ...(commonRes.success ? commonRes.data : [])
    ];
    const compIds = [...new Set(allSubs.filter(s => s.is_compulsory == 1).map(s => s.id))];
    const optionalIds = this.state._regSubjectIds || [];
    const allIds = [...new Set([...compIds, ...optionalIds])];
    const res = await api.saveSubjectRegistrations({
      student_id: parseInt(studentId),
      subject_ids: allIds,
      session: this.state.session
    });
    if (res.success) {
      this.closeModal();
      this.notify('Subject registrations saved');
      this.renderRegTable();
    } else {
      this.notify('Error: ' + res.error, 'error');
    }
  },

  showRegSubjectsPopup(studentId) {
    const student = this.state._regStudents.find(s => s.id == studentId);
    if (!student) return;
    const regMap = this.state._regMap || {};
    const subjMap = this.state._regSubjMap || {};
    const subjIds = regMap[studentId] || [];
    const subjects = subjIds.map(id => subjMap[id]).filter(Boolean);
    const compulsory = subjects.filter(s => s.is_compulsory == 1);
    const optional = subjects.filter(s => s.is_compulsory == 0);
    this.showModal(`
      <h3>Registered Subjects</h3>
      <p style="margin-bottom:12px;"><strong>${student.name}</strong> (Roll: ${student.roll_no} | ${student.class} ${student.faculty})</p>
      ${compulsory.length ? `
        <h4 style="color:var(--primary);margin:8px 0 4px;">Compulsory (${compulsory.length})</h4>
        <table style="width:100%;border-collapse:collapse;margin-bottom:12px;font-size:13px;">
          <thead><tr style="background:#f3f4f6;"><th style="padding:6px 10px;border:1px solid var(--border);text-align:left;">SN</th><th style="padding:6px 10px;border:1px solid var(--border);text-align:left;">Code</th><th style="padding:6px 10px;border:1px solid var(--border);text-align:left;">Subject</th><th style="padding:6px 10px;border:1px solid var(--border);text-align:center;">Credit</th></tr></thead>
          <tbody>${compulsory.map((s, i) => `<tr><td style="padding:6px 10px;border:1px solid var(--border);">${i+1}</td><td style="padding:6px 10px;border:1px solid var(--border);">${s.code}</td><td style="padding:6px 10px;border:1px solid var(--border);">${s.name}</td><td style="padding:6px 10px;border:1px solid var(--border);text-align:center;">${(s.credit_th||0)+(s.credit_in||0)}</td></tr>`).join('')}</tbody>
        </table>` : ''}
      ${optional.length ? `
        <h4 style="color:var(--success);margin:8px 0 4px;">Optional (${optional.length})</h4>
        <table style="width:100%;border-collapse:collapse;margin-bottom:12px;font-size:13px;">
          <thead><tr style="background:#f3f4f6;"><th style="padding:6px 10px;border:1px solid var(--border);text-align:left;">SN</th><th style="padding:6px 10px;border:1px solid var(--border);text-align:left;">Code</th><th style="padding:6px 10px;border:1px solid var(--border);text-align:left;">Subject</th><th style="padding:6px 10px;border:1px solid var(--border);text-align:center;">Credit</th></tr></thead>
          <tbody>${optional.map((s, i) => `<tr><td style="padding:6px 10px;border:1px solid var(--border);">${i+1}</td><td style="padding:6px 10px;border:1px solid var(--border);">${s.code}</td><td style="padding:6px 10px;border:1px solid var(--border);">${s.name}</td><td style="padding:6px 10px;border:1px solid var(--border);text-align:center;">${(s.credit_th||0)+(s.credit_in||0)}</td></tr>`).join('')}</tbody>
        </table>` : ''}
      ${!subjects.length ? '<p class="text-muted">No subjects registered yet.</p>' : ''}
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" onclick="App.closeModal()"><i class="fas fa-times"></i> Close</button>
      </div>`);
  },

  async regStudentAction(studentId) {
    // Open registration subjects in a popup (modal)
    const sel = document.getElementById('regStudentSelect');
    if (sel) sel.value = studentId;
    const student = (await api.getStudent(studentId)).data;
    if (!student) return this.notify('Student not found', 'error');
    // Fetch subjects for this student's class & faculty
    const subjRes = await api.getSubjects({ class: student.class, faculty: student.faculty !== 'Common' ? student.faculty : '' });
    const commonRes = await api.getSubjects({ class: student.class, faculty: 'Common' });
    const allSubs = [
      ...(subjRes.success ? subjRes.data : []),
      ...(commonRes.success ? commonRes.data : [])
    ];
    const seen = new Set();
    const subjects = allSubs.filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; })
      .sort((a, b) => (a.display_seq||0) - (b.display_seq||0) || a.name.localeCompare(b.name));
    // Get existing registrations
    const regRes = await api.getSubjectRegistrations(studentId, this.state.session);
    const registeredIds = regRes.success ? regRes.data : [];
    this.state._regStudentId = parseInt(studentId);
    this.state._regSubjectIds = registeredIds;
    const compulsory = subjects.filter(s => s.is_compulsory == 1);
    const optional = subjects.filter(s => s.is_compulsory == 0);
    this.showModal(`
      <h3>Subjects for: ${student.name}</h3>
      <p style="margin-bottom:12px;"><strong>Roll: ${student.roll_no} | ${student.class} ${student.faculty}</strong></p>
      <form id="regPopupForm" onsubmit="return false;">
        ${compulsory.length ? `
          <h4 style="color:var(--primary);margin:8px 0 4px;">Compulsory Subjects</h4>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;margin-bottom:16px;">
            ${compulsory.map(s => `
              <label style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;background:#f9fafb;opacity:0.7;">
                <input type="checkbox" checked disabled style="accent-color:var(--primary);">
                <span>${s.name} (${s.code})</span>
              </label>`).join('')}
          </div>` : ''}
        ${optional.length ? `
          <h4 style="color:var(--success);margin:8px 0 4px;">Optional Subjects</h4>
          <p class="text-muted mb-1" style="font-size:12px;">Check the subjects the student wants to register for:</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;max-height:300px;overflow-y:auto;">
            ${optional.map(s => {
              const checked = registeredIds.includes(s.id);
              return `<label style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;background:${checked?'#e8f0fe':'#fff'};cursor:pointer;">
                <input type="checkbox" class="reg-popup-cb" value="${s.id}" ${checked?'checked':''} style="accent-color:var(--primary);">
                <span>${s.name} (${s.code})</span>
                <span class="text-muted" style="font-size:11px;margin-left:auto;">${(s.credit_th||0)+(s.credit_in||0)} cr</span>
              </label>`;
            }).join('')}
          </div>` : ''}
        ${!compulsory.length && !optional.length ? '<p class="text-muted">No subjects available for this student\'s class and faculty.</p>' : ''}
        <div class="modal-actions" style="margin-top:16px;">
          <button type="button" class="btn btn-outline" onclick="App.closeModal()"><i class="fas fa-times"></i> Cancel</button>
          <button type="button" class="btn btn-success" onclick="App.saveRegistrationsFromPopup(${studentId})"><i class="fas fa-save"></i> Save Registrations</button>
        </div>
      </form>`);
    // Attach toggle handler for popup checkboxes
    document.querySelectorAll('.reg-popup-cb').forEach(cb => {
      cb.addEventListener('change', function() {
        const id = parseInt(this.value);
        if (!App.state._regSubjectIds) App.state._regSubjectIds = [];
        if (this.checked) {
          if (!App.state._regSubjectIds.includes(id)) App.state._regSubjectIds.push(id);
        } else {
          App.state._regSubjectIds = App.state._regSubjectIds.filter(x => x !== id);
        }
      });
    });
  },

  // ---- ADMIT CARD ----
  _acTermLabel() {
    const el = document.getElementById('acTermFilter');
    const term = el ? el.value : 'Annual';
    return `${term} Examination`;
  },

  async renderAdmitCard() {
    const [sRes, subjRes, regRes] = await Promise.all([
      api.getStudents({ session: this.state.session }),
      api.getSubjects({}),
      api.getSubjectRegistrations('all', this.state.session)
    ]);
    const students = sRes.success ? sRes.data : [];
    const allSubjects = subjRes.success ? subjRes.data : [];
    const allRegs = regRes.success ? regRes.data : [];
    const subjMap = {};
    for (const sb of allSubjects) subjMap[sb.id] = sb;
    const regMap = {};
    for (const r of allRegs) {
      if (!regMap[r.student_id]) regMap[r.student_id] = [];
      regMap[r.student_id].push(r.subject_id);
    }
    document.getElementById('pageContent').innerHTML = `
      <div class="filter-bar">
        <div class="form-group">
          <label>Class</label>
          <select class="form-control" id="acClassFilter" onchange="App.renderAdmitCardTable()">
            ${_classOptsAll()}
          </select>
        </div>
        <div class="form-group">
          <label>Faculty</label>
          <select class="form-control" id="acFacultyFilter" onchange="App.renderAdmitCardTable()">
            <option value="">All</option>
            <option value="Common">Common</option><option value="General">General</option><option value="Technical">Technical</option>
          </select>
        </div>
        <div class="form-group">
          <label>Term</label>
          <select class="form-control" id="acTermFilter" onchange="App.renderAdmitCardTable()">
            <option value="Annual">Annual</option>
            <option value="First Term">First Term</option>
            <option value="Second Term">Second Term</option>
          </select>
        </div>
        <div class="form-group" style="flex:1;min-width:200px;">
          <label>Search</label>
          <input class="form-control" id="acSearch" placeholder="Name or Roll..." oninput="App.renderAdmitCardTable()">
        </div>
        <button class="btn btn-primary" onclick="App.generateAdmitCards()"><i class="fas fa-print"></i> Print All</button>
      </div>
      <div class="table-container" id="acTableContainer"></div>`;
    this.state._admitData = { students, allSubjects, subjMap, regMap };
    this.renderAdmitCardTable();
  },

  renderAdmitCardTable() {
    const cls = document.getElementById('acClassFilter').value;
    const faculty = document.getElementById('acFacultyFilter').value;
    const search = document.getElementById('acSearch').value.toLowerCase();
    const { students, subjMap, regMap } = this.state._admitData || {};
    if (!students) return;
    const filtered = students.filter(s =>
      (!cls || s.class === cls) && (!faculty || s.faculty === faculty) &&
      (!search || s.name.toLowerCase().includes(search) || s.roll_no.includes(search))
    );
    this.state._acFiltered = filtered;
    this.state.acPage = 1;
    this.renderAcTable(filtered, 1, this.state.acRowsPerPage);
  },

  renderAcTable(data, page, rowsPerPage) {
    const total = data.length;
    const totalPages = Math.ceil(total / rowsPerPage) || 1;
    const start = (page - 1) * rowsPerPage;
    const slice = data.slice(start, start + rowsPerPage);
    const { subjMap, regMap } = this.state._admitData || {};
    const container = document.getElementById('acTableContainer');
    if (!container) return;
    container.innerHTML = `
      <table>
        <thead><tr>
          <th>SN</th><th>Photo</th><th>Roll</th><th>Name</th><th>DOB (BS)</th><th>Subject Code</th><th>Class</th><th>Faculty</th><th>Action</th>
        </tr></thead>
        <tbody>${slice.length ? slice.map((s, i) => {
          const subjIds = regMap[s.id] || [];
          const codes = subjIds.map(id => subjMap ? subjMap[id] ? subjMap[id].code : '?' : '?').join(', ');
          return `<tr>
            <td>${start + i + 1}</td>
            <td><span class="text-muted" style="font-size:11px;">-</span></td>
            <td>${s.roll_no}</td>
            <td>${s.name}</td>
            <td>${s.dob_bs || '-'}</td>
            <td style="font-size:11px;">${codes || '<span class="text-muted">-</span>'}</td>
            <td>${s.class}</td>
            <td>${s.faculty}</td>
            <td style="white-space:nowrap;">
              <button class="btn btn-sm btn-primary" onclick="App.viewAdmitCard(${s.id})"><i class="fas fa-eye"></i></button>
              <button class="btn btn-sm btn-outline" onclick="App.printSingleAdmitCard(${s.id})"><i class="fas fa-print"></i></button>
            </td>
          </tr>`;
        }).join('') : '<tr><td colspan="9" class="text-center text-muted">No students found</td></tr>'}</tbody>
      </table>
      <div id="acPagination">${this.renderPagination(total, page, rowsPerPage, 'App.goToAcPage', 'App.changeAcRowsPerPage')}</div>`;
  },

  goToAcPage(page) {
    const filtered = this.state._acFiltered || [];
    const totalPages = Math.ceil(filtered.length / this.state.acRowsPerPage) || 1;
    if (page < 1 || page > totalPages) return;
    this.state.acPage = page;
    this.renderAcTable(filtered, page, this.state.acRowsPerPage);
  },

  changeAcRowsPerPage(n) {
    const filtered = this.state._acFiltered || [];
    this.state.acRowsPerPage = parseInt(n);
    this.state.acPage = 1;
    this.renderAcTable(filtered, 1, this.state.acRowsPerPage);
  },

  async generateAdmitCards() {
    const cls = document.getElementById('acClassFilter').value;
    const faculty = document.getElementById('acFacultyFilter').value;
    const search = document.getElementById('acSearch').value.toLowerCase();
    const [sRes, subjRes, regRes] = await Promise.all([
      api.getStudents({ session: this.state.session }),
      api.getSubjects({}),
      api.getSubjectRegistrations('all', this.state.session)
    ]);
    const students = (sRes.success ? sRes.data : []).filter(s =>
      (!cls || s.class === cls) && (!faculty || s.faculty === faculty) &&
      (!search || s.name.toLowerCase().includes(search) || s.roll_no.includes(search))
    );
    if (!students.length) { this.notify('No students match filters', 'warning'); return; }
    const allSubjects = subjRes.success ? subjRes.data : [];
    const allRegs = regRes.success ? regRes.data : [];
    const subjMap = {};
    for (const sb of allSubjects) subjMap[sb.id] = sb;
    const regMap = {};
    for (const r of allRegs) {
      if (!regMap[r.student_id]) regMap[r.student_id] = [];
      regMap[r.student_id].push(r.subject_id);
    }
    const school = this.state.school;
    const logo = school.school_logo ? school.school_logo : '';
    // Group cards in pairs for 2-up layout
    let cardHtml = '';
    for (let i = 0; i < students.length; i += 2) {
      cardHtml += `<div class="page">`;
      for (let j = i; j < i + 2 && j < students.length; j++) {
        const s = students[j];
        const subjIds = regMap[s.id] || [];
        const subjects = subjIds.map(id => subjMap[id]).filter(Boolean);
        cardHtml += `<div class="card">
          <div class="header">
            ${logo ? `<img src="${logo}" class="logo">` : ''}
            <div class="header-text">
              <h2>${school.school_name || 'School Name'}</h2>
              <h3>${school.municipality || ''} | ${school.province || ''} | Estd: ${school.estd || ''}</h3>
            </div>
          </div>
          <div class="exam-title">Admit Card — ${App._acTermLabel()} ${this.state.session}</div>
          <div class="body">
            <div class="details">
              <div class="row"><span class="lbl">Student's Name</span><span class="val">${s.name}</span></div>
              <div class="row"><span class="lbl">Roll No.</span><span class="val">${s.roll_no}</span></div>
              <div class="row"><span class="lbl">Symbol No.</span><span class="val">${s.sym || '-'}</span></div>
              <div class="row"><span class="lbl">Reg. No.</span><span class="val">${s.reg || '-'}</span></div>
              <div class="row"><span class="lbl">Class</span><span class="val">${s.class}</span></div>
              <div class="row"><span class="lbl">Faculty</span><span class="val">${s.faculty}</span></div>
              <div class="row"><span class="lbl">Session</span><span class="val">${this.state.session}</span></div>
              <div class="row"><span class="lbl">DOB (BS)</span><span class="val">${s.dob_bs || '-'}</span></div>
            </div>
            <div class="photo-box">${s.photo_path ? `<img src="${s.photo_path}" style="width:100%;height:100%;object-fit:cover;">` : 'Photo'}</div>
          </div>
          <div class="subjects">
            <table>
              <thead><tr><th>Code</th><th>Subject</th><th>Type</th><th>Cr.</th></tr></thead>
              <tbody>${subjects.map(sb => `
                <tr><td style="font-size:8px;">${sb.code}</td><td style="text-align:left;font-size:8px;">${sb.name}</td><td style="font-size:8px;">${sb.is_compulsory == 1 ? 'C' : 'O'}</td><td style="font-size:8px;">${(sb.credit_th||0)+(sb.credit_in||0)}</td></tr>
              `).join('')}</tbody>
            </table>
          </div>
          <div class="signatures">
            <div class="sign"><div class="line">Student's Signature</div></div>
            <div class="sign"><div class="line">Head Teacher</div></div>
            <div class="sign"><div class="line">Approved By</div></div>
          </div>
          <div class="instructions">
            <strong>Instructions:</strong><br>
            Candidates are required to appear for the examination at the specified time.<br>
            Admit cards must be carried at all times and presented upon request.<br>
            Mobile phones, digital watches, and any other unauthorized items are strictly prohibited within the exam premises.<br>
            It is mandatory to use a pen with either black or blue ink for the examination.
          </div>
          <div class="footer-text">This is a computer-generated admit card.</div>
        </div>`;
      }
      cardHtml += `</div>`;
    }
    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>Admit Cards - ${this.state.session}</title>
      <style>
        @page { size: A4; margin: 3mm; }
        body { font-family: 'Times New Roman', serif; margin:0; padding:0; }
        .page { display:flex; flex-direction:column; gap:3mm; page-break-after:always; padding:3mm; height:100vh; box-sizing:border-box; }
        .card { flex:1; border:2.5px double #000; padding:14px 18px; position:relative; display:flex; flex-direction:column; }
        .card .header { border-bottom:2px solid #000; padding-bottom:6px; margin-bottom:4px; display:flex; align-items:center; gap:12px; }
        .card .header .logo { height:42px; flex-shrink:0; }
        .card .header .header-text h2 { margin:2px 0; font-size:14px; text-transform:uppercase; letter-spacing:0.5px; }
        .card .header .header-text h3 { margin:1px 0; font-size:10px; font-weight:400; }
        .card .exam-title { text-align:center; font-size:11px; font-weight:700; margin:4px 0; text-transform:uppercase; }
        .card .body { display:flex; gap:10px; flex:1; }
        .card .body .details { flex:1; display:flex; flex-direction:column; justify-content:center; }
        .card .body .photo-box { width:70px; height:80px; border:2px solid #000; text-align:center; font-size:7px; color:#666; display:flex; align-items:center; justify-content:center; flex-shrink:0; overflow:hidden; }
        .card .row { display:flex; padding:3px 0; font-size:10px; border-bottom:1px dotted #ccc; }
        .card .row .lbl { font-weight:700; width:68px; }
        .card .row .val { flex:1; }
        .card .subjects { margin-top:5px; font-size:9px; }
        .card .subjects table { width:100%; border-collapse:collapse; }
        .card .subjects th, .card .subjects td { border:1px solid #888; padding:2px 4px; text-align:center; font-size:8.5px; }
        .card .subjects th { background:#e5e7eb; }
        .card .signatures { display:flex; justify-content:space-between; margin-top:6px; padding-top:5px; border-top:1px solid #000; }
        .card .signatures .sign { text-align:center; font-size:8px; }
        .card .signatures .sign .line { width:70px; border-top:1px solid #000; margin-top:18px; padding-top:2px; }
        .card .footer-text { text-align:center; font-size:6.5px; color:#555; margin-top:3px; }
        .card .instructions { font-size:7px; margin-top:4px; padding:4px 6px; border:1px solid #aaa; background:#f9f9f9; line-height:1.4; }
      </style></head><body>
        ${cardHtml}
        <script>window.onload = function() { window.print(); }</script>
      </body></html>`);
    win.document.close();
  },

  viewAdmitCard(studentId) {
    const s = this.state.school;
    const { students, subjMap, regMap } = this.state._admitData || {};
    const student = students ? students.find(st => st.id == studentId) : null;
    if (!student) return this.notify('Student not found', 'error');
    const subjIds = regMap[student.id] || [];
    const subjects = subjIds.map(id => subjMap[id]).filter(Boolean);
    const compulsory = subjects.filter(sb => sb.is_compulsory == 1);
    const optional = subjects.filter(sb => sb.is_compulsory == 0);
    const logo = s.school_logo ? s.school_logo : '';
    this.showModal(`
      <div style="max-width:400px;margin:0 auto;font-family:'Times New Roman',serif;">
        <div style="border:3px double #000;padding:16px;">
          <div style="display:flex;align-items:center;gap:12px;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:8px;">
            ${logo ? `<img src="${logo}" style="height:40px;flex-shrink:0;">` : ''}
            <div>
              <h2 style="margin:2px 0;font-size:14px;text-transform:uppercase;">${s.school_name || 'School Name'}</h2>
              <div style="font-size:11px;">${s.municipality || ''} | ${s.province || ''}</div>
            </div>
          </div>
          <div style="text-align:center;font-size:12px;font-weight:700;margin:4px 0;text-transform:uppercase;">Admit Card — ${this._acTermLabel()} ${this.state.session}</div>
          <div style="display:flex;gap:10px;">
            <div style="flex:1;">
              ${['Name','Roll No','Symbol No','Reg. No','Class','Faculty','DOB BS','Session'].map(f => `
                <div style="display:flex;padding:2px 0;font-size:11px;border-bottom:1px dotted #ccc;">
                  <span style="font-weight:700;width:90px;">${f}</span>
                  <span style="flex:1;">${
                    f==='Name'?student.name : f==='Roll No'?student.roll_no : f==='Symbol No'?student.sym||'-' :
                    f==='Reg. No'?student.reg||'-' : f==='Class'?student.class : f==='Faculty'?student.faculty :
                    f==='DOB BS'?student.dob_bs||'-' : this.state.session
                  }</span>
                </div>`).join('')}
            </div>
            <div style="width:80px;height:95px;border:2px solid #000;display:flex;align-items:center;justify-content:center;font-size:9px;color:#666;flex-shrink:0;overflow:hidden;">${student.photo_path ? `<img src="${student.photo_path}" style="width:100%;height:100%;object-fit:cover;">` : 'Photo'}</div>
          </div>
          <div style="margin-top:6px;font-size:10px;">
            <table style="width:100%;border-collapse:collapse;">
              <thead><tr><th style="border:1px solid #888;padding:2px 4px;font-size:10px;background:#e5e7eb;">SN</th><th style="border:1px solid #888;padding:2px 4px;font-size:10px;background:#e5e7eb;">Code</th><th style="border:1px solid #888;padding:2px 4px;font-size:10px;background:#e5e7eb;">Subject</th><th style="border:1px solid #888;padding:2px 4px;font-size:10px;background:#e5e7eb;">Credit</th></tr></thead>
              <tbody>${subjects.map((sb, i) => `<tr><td style="border:1px solid #888;padding:2px 4px;text-align:center;font-size:10px;">${i+1}</td><td style="border:1px solid #888;padding:2px 4px;text-align:center;font-size:10px;">${sb.code}</td><td style="border:1px solid #888;padding:2px 4px;text-align:left;font-size:10px;">${sb.name}</td><td style="border:1px solid #888;padding:2px 4px;text-align:center;font-size:10px;">${(sb.credit_th||0)+(sb.credit_in||0)}</td></tr>`).join('')}</tbody>
            </table>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:10px;padding-top:6px;border-top:1px solid #000;">
            <div style="text-align:center;font-size:9px;"><div style="width:80px;border-top:1px solid #000;margin-top:25px;padding-top:3px;">Student's Signature</div></div>
            <div style="text-align:center;font-size:9px;"><div style="width:80px;border-top:1px solid #000;margin-top:25px;padding-top:3px;">Head Teacher</div></div>
            <div style="text-align:center;font-size:9px;"><div style="width:80px;border-top:1px solid #000;margin-top:25px;padding-top:3px;">Approved By</div></div>
          </div>
          <div style="font-size:8px;margin-top:4px;padding:3px 5px;border:1px solid #aaa;background:#f9f9f9;line-height:1.4;">
            <strong>Instructions:</strong><br>
            Candidates are required to appear for the examination at the specified time.<br>
            Admit cards must be carried at all times and presented upon request.<br>
            Mobile phones, digital watches, and any other unauthorized items are strictly prohibited within the exam premises.<br>
            It is mandatory to use a pen with either black or blue ink for the examination.
          </div>
          <div style="text-align:center;font-size:8px;color:#555;margin-top:4px;">This is a computer-generated admit card.</div>
        </div>
        <div class="modal-actions" style="margin-top:10px;">
          <button class="btn btn-primary" onclick="App.printSingleAdmitCard(${student.id})"><i class="fas fa-print"></i> Print</button>
          <button class="btn btn-outline" onclick="App.closeModal()"><i class="fas fa-times"></i> Close</button>
        </div>
      </div>`);
  },

  async printStudentProfile(studentId) {
    const sRes = await api.getStudent(studentId);
    if (!sRes.success) { this.notify('Student not found', 'error'); return; }
    const s = sRes.data;
    const school = this.state.school;
    const [regRes, mFinal, mTerm1, mTerm2, rFinal, rTerm1, rTerm2, attStats] = await Promise.all([
      api.getSubjectRegistrations('all', this.state.session),
      api.getMarks({ student_id: studentId, session: this.state.session, exam_type: 'final' }),
      api.getMarks({ student_id: studentId, session: this.state.session, exam_type: 'term1' }),
      api.getMarks({ student_id: studentId, session: this.state.session, exam_type: 'term2' }),
      api.getResults({ student_id: studentId, session: this.state.session, exam_type: 'final' }),
      api.getResults({ student_id: studentId, session: this.state.session, exam_type: 'term1' }),
      api.getResults({ student_id: studentId, session: this.state.session, exam_type: 'term2' }),
      api.getAttendanceStats(studentId, this.state.session)
    ]);
    const allRegs = regRes.success ? regRes.data : [];
    const marksByExam = {
      annual: mFinal.success ? mFinal.data : [],
      term1: mTerm1.success ? mTerm1.data : [],
      term2: mTerm2.success ? mTerm2.data : []
    };
    const resultByExam = {
      annual: rFinal.success ? rFinal.data[0] : null,
      term1: rTerm1.success ? rTerm1.data[0] : null,
      term2: rTerm2.success ? rTerm2.data[0] : null
    };
    const att = attStats.success ? attStats.data : { schoolOpenDays: 0, presentDays: 0, percentage: 0 };
    const subRes = await api.getSubjects({});
    const allSubjects = subRes.success ? subRes.data : [];
    const subjMap = {};
    for (const sb of allSubjects) subjMap[sb.id] = sb;
    const regSubjIds = allRegs.filter(r => r.student_id == studentId).map(r => r.subject_id);
    const regSubjects = regSubjIds.map(sid => subjMap[sid]).filter(Boolean);

    function renderTermTable(termLabel, term, mks, res) {
      const isTerm = term !== 'annual';
      mks.sort((a, b) => (a.subject_code||'').localeCompare(b.subject_code||'', undefined, { numeric: true }));
      let totalCH = 0, wGP = 0, hF = false, hNG = false;
      for (const mm of mks) {
        const ch = isTerm ? parseFloat(mm[`${term}_credit_hours`]) : parseFloat(mm.credit_hours);
        totalCH += ch || 1;
        const gp = isTerm ? (parseFloat(mm.theory_grade_point) || 0) : (parseFloat(mm.grade_point) || 0);
        wGP += gp * (ch || 1);
        const g = isTerm ? mm.theory_grade : mm.grade;
        if (g === 'NG' || g === 'E') hF = true;
        if (g === 'NG') hNG = true;
      }
      const gpa = totalCH > 0 ? Math.round((wGP / totalCH) * 100) / 100 : 0;
      let grade = 'NG', status = 'Pass';
      if (hNG) { grade = 'NG'; status = 'Fail'; }
      else if (hF) { grade = 'E'; status = 'Supplementary'; }
      else if (gpa >= 3.6) { grade = 'A+'; }
      else if (gpa >= 3.2) { grade = 'A'; }
      else if (gpa >= 2.8) { grade = 'B+'; }
      else if (gpa >= 2.4) { grade = 'B'; }
      else if (gpa >= 2.0) { grade = 'C+'; }
      else if (gpa >= 1.6) { grade = 'C'; }
      else if (gpa >= 1.0) { grade = 'D'; }
      else { grade = 'E'; status = 'Fail'; }
      const rank = res && res.rank ? res.rank : '-';
      const fmKey = isTerm ? `${term}_full_marks` : 'full_marks_theory';
      const pmKey = isTerm ? `${term}_pass_marks` : 'pass_marks_theory';
      return `
        <div class="section">
          <h4>${termLabel} — GPA: ${gpa} | Grade: ${grade} | ${status} | Rank: ${rank}</h4>
          ${mks.length ? `
          <table class="data">
            <thead><tr><th>Code</th><th>Subject</th>
              ${isTerm ? '<th>FM</th><th>PM</th><th>Obtained</th><th>Gr.</th>' : '<th>Th</th><th>In</th><th>Total</th><th>Gr.</th>'}
            </tr></thead>
            <tbody>${mks.map(mm => {
              const theory = parseFloat(mm.theory_marks) || 0;
              const practical = parseFloat(mm.practical_marks) || 0;
              const total = theory + practical;
              const fm = parseFloat(mm[fmKey]) || 0;
              const pm = parseFloat(mm[pmKey]) || 0;
              return isTerm ? `
              <tr>
                <td>${mm.subject_code||'-'}</td>
                <td style="text-align:left;">${mm.subject_name||'-'}</td>
                <td>${fm}</td><td>${pm}</td><td>${theory}</td>
                <td>${mm.theory_grade||'-'}</td>
              </tr>` : `
              <tr>
                <td>${mm.subject_code||'-'}</td>
                <td style="text-align:left;">${mm.subject_name||'-'}</td>
                <td>${theory}</td><td>${practical}</td><td>${total}</td>
                <td>${mm.grade||'-'}</td>
              </tr>`;
            }).join('')}
            </tbody>
          </table>` : '<p>No marks entered</p>'}
        </div>`;
    }

    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>Profile - ${s.name}</title>
      <style>
        @page { size: A4; margin: 6mm; }
        body { font-family: 'Times New Roman', serif; margin:0; padding:12px; font-size:12px; }
        .header { text-align:center; border-bottom:2px solid #000; padding-bottom:5px; margin-bottom:8px; }
        .header .logo { max-height:45px; }
        .header h2 { margin:3px 0; font-size:15px; text-transform:uppercase; }
        .header h3 { margin:2px 0; font-size:11px; font-weight:400; }
        .section { margin-bottom:6px; }
        .section h4 { font-size:12px; border-bottom:1px solid #999; padding-bottom:2px; margin-bottom:4px; text-transform:uppercase; }
        .info-table { width:100%; border-collapse:collapse; font-size:11px; }
        .info-table td { padding:2px 5px; vertical-align:top; }
        .info-table .lbl { font-weight:700; width:95px; }
        .info-table .lbl2 { font-weight:700; width:70px; }
        .photo-box { float:right; width:85px; height:100px; border:1.5px solid #000; text-align:center; font-size:9px; color:#666; display:flex; align-items:center; justify-content:center; overflow:hidden; margin-left:8px; }
        table.data { width:100%; border-collapse:collapse; font-size:10px; margin-top:3px; }
        table.data th, table.data td { border:1px solid #888; padding:2px 4px; text-align:center; }
        table.data th { background:#e5e7eb; font-size:9.5px; }
        .subjects { display:flex; flex-wrap:wrap; gap:3px; }
        .subjects span { border:1px solid #aaa; padding:1px 6px; border-radius:2px; font-size:10px; }
        .footer { text-align:center; font-size:8px; color:#666; margin-top:8px; border-top:1px solid #ccc; padding-top:5px; }
        .info-row { display:flex; }
        .info-col { flex:1; }
      </style></head><body>
        <div class="header">
          ${school.school_logo ? `<img src="${school.school_logo}" class="logo">` : ''}
          <h2>${school.school_name || 'School Name'}</h2>
          <h3>${school.municipality || ''} | ${school.province || ''} | Estd: ${school.estd || ''}</h3>
        </div>
        <div class="info-row">
          <div class="info-col">
            <table class="info-table">
              <tr><td class="lbl">Student's Name</td><td>${s.name}</td></tr>
              <tr><td class="lbl">Roll No.</td><td>${s.roll_no}</td></tr>
              <tr><td class="lbl">Symbol No.</td><td>${s.sym || '-'}</td></tr>
              <tr><td class="lbl">Reg. No.</td><td>${s.reg || '-'}</td></tr>
              <tr><td class="lbl">Class</td><td>${s.class}</td></tr>
              <tr><td class="lbl">Faculty</td><td>${s.faculty}</td></tr>
              <tr><td class="lbl">Gender</td><td>${s.gender || '-'}</td></tr>
              <tr><td class="lbl">DOB (BS)</td><td>${s.dob_bs || '-'}</td></tr>
              <tr><td class="lbl">DOB (AD)</td><td>${s.dob ? s.dob.split('T')[0] : '-'}</td></tr>
            </table>
          </div>
          <div class="info-col">
            <table class="info-table">
              <tr><td class="lbl2">Father</td><td>${s.father_name || '-'}</td></tr>
              <tr><td class="lbl2">Mother</td><td>${s.mother_name || '-'}</td></tr>
              <tr><td class="lbl2">Guardian</td><td>${s.guardian_name || '-'}</td></tr>
              <tr><td class="lbl2">Phone</td><td>${s.phone || '-'}</td></tr>
              <tr><td class="lbl2">Address</td><td>${s.address || '-'}</td></tr>
              <tr><td class="lbl2">Session</td><td>${this.state.session}</td></tr>
              <tr><td class="lbl2">Open Days</td><td>${att.schoolOpenDays}</td></tr>
              <tr><td class="lbl2">Attendance</td><td>${att.presentDays} (${att.percentage}%)</td></tr>
            </table>
          </div>
          <div class="photo-box">${s.photo_path ? `<img src="${s.photo_path}" style="width:100%;height:100%;object-fit:cover;">` : 'Photo'}</div>
        </div>
        <div class="section">
          <h4>Registered Subjects (${regSubjects.length})</h4>
          <div class="subjects">${regSubjects.length ? regSubjects.map(sb => `<span>${sb.code} - ${sb.name}</span>`).join('') : '<span>No subjects registered</span>'}</div>
        </div>
        ${renderTermTable('Annual', 'annual', marksByExam.annual, resultByExam.annual)}
        ${renderTermTable('First Term', 'term1', marksByExam.term1, resultByExam.term1)}
        ${renderTermTable('Second Term', 'term2', marksByExam.term2, resultByExam.term2)}
        <div class="section notes" style="margin-top:8px;">
          <h4>Notes</h4>
          <p style="font-size:11px;line-height:1.6;margin:4px 0;">This is to certify that the above-mentioned student has successfully completed the academic session ${this.state.session}. The student has shown satisfactory performance in both academic and co-curricular activities. Attendance records reflect the student's regularity and punctuality throughout the session. All the information provided in this profile is verified and accurate as per school records.</p>
        </div>
        <div class="signatures" style="display:flex;justify-content:space-between;margin-top:12px;padding-top:8px;border-top:1px solid #000;">
          <div style="text-align:center;font-size:11px;">
            <div style="width:120px;border-top:1px solid #000;margin-top:35px;padding-top:4px;">Taken By</div>
          </div>
          <div style="text-align:center;font-size:11px;">
            <div style="width:120px;border-top:1px solid #000;margin-top:35px;padding-top:4px;">Class Teacher</div>
          </div>
          <div style="text-align:center;font-size:11px;">
            <div style="width:120px;border-top:1px solid #000;margin-top:35px;padding-top:4px;">Principal</div>
          </div>
        </div>
        <div class="footer">This is a computer-generated profile. Generated on ${new Date().toLocaleDateString()}</div>
      </body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 300);
  },

  async printSingleAdmitCard(studentId) {
    const student = (this.state._admitData?.students || this.state._tcStudents || []).find(st => st.id == studentId);
    let subjects = [];
    if (this.state._admitData?.subjMap && this.state._admitData?.regMap) {
      const subjIds = this.state._admitData.regMap[studentId] || [];
      subjects = subjIds.map(id => this.state._admitData.subjMap[id]).filter(Boolean);
    } else {
      const regRes = await api.get({ table: 'subject_registrations', where: `student_id=${studentId}` });
      if (regRes.success && regRes.data) {
        const subjIds = regRes.data.map(r => r.subject_id);
        const subRes = await api.getSubjects({});
        if (subRes.success) {
          subjects = subRes.data.filter(s => subjIds.includes(s.id));
        }
      }
    }
    if (!student) {
      const sRes = await api.getStudent(studentId);
      if (!sRes.success) { this.notify('Student not found', 'error'); return; }
      var studentData = sRes.data;
    } else {
      var studentData = student;
    }
    const s = studentData;
    const school = this.state.school;
    const logo = school.school_logo ? school.school_logo : '';
    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>Admit Card - ${s.name}</title>
      <style>
        @page { size: A4; margin: 6mm; }
        body { font-family: 'Times New Roman', serif; margin:0; padding:0; display:flex; justify-content:center; align-items:center; min-height:100vh; }
        .card { width:90%; border:2.5px double #000; padding:10px 18px; position:relative; font-size:11px; }
        .card .header { border-bottom:2px solid #000; padding-bottom:5px; margin-bottom:5px; }
        .card .header .logo { height:45px; flex-shrink:0; }
        .card .header .header-text h2 { margin:2px 0; font-size:14px; text-transform:uppercase; letter-spacing:0.5px; }
        .card .header .header-text h3 { margin:1px 0; font-size:10px; font-weight:400; }
        .card .exam-title { text-align:center; font-size:11px; font-weight:700; margin:4px 0; text-transform:uppercase; }
        .card .body { display:flex; gap:10px; }
        .card .body .details { flex:1; }
        .card .body .photo-box { width:70px; height:80px; border:2px solid #000; text-align:center; font-size:8px; color:#666; display:flex; align-items:center; justify-content:center; flex-shrink:0; overflow:hidden; }
        .card .row { display:flex; padding:2.5px 0; font-size:10px; border-bottom:1px dotted #ccc; }
        .card .row .lbl { font-weight:700; width:75px; }
        .card .row .val { flex:1; }
        .card .subjects { margin-top:5px; font-size:9px; }
        .card .subjects table { width:100%; border-collapse:collapse; }
        .card .subjects th, .card .subjects td { border:1px solid #888; padding:2px 4px; text-align:center; font-size:9px; }
        .card .subjects th { background:#e5e7eb; }
        .card .signatures { display:flex; justify-content:space-between; margin-top:8px; padding-top:5px; border-top:1px solid #000; }
        .card .signatures .sign { text-align:center; font-size:9px; }
        .card .signatures .sign .line { width:80px; border-top:1px solid #000; margin-top:25px; padding-top:2px; }
        .card .footer-text { text-align:center; font-size:7px; color:#555; margin-top:4px; }
        .card .instructions { font-size:7.5px; margin-top:5px; padding:3px 6px; border:1px solid #aaa; background:#f9f9f9; line-height:1.4; }
      </style></head><body>
        <div class="card">
          <div class="header" style="display:flex;align-items:center;gap:12px;">
            ${logo ? `<img src="${logo}" class="logo">` : ''}
            <div class="header-text">
              <h2>${school.school_name || 'School Name'}</h2>
              <h3>${school.municipality || ''} | ${school.province || ''} | Estd: ${school.estd || ''}</h3>
            </div>
          </div>
          <div class="exam-title">Admit Card — ${this._acTermLabel()} ${this.state.session}</div>
          <div class="body">
            <div class="details">
              <div class="row"><span class="lbl">Student's Name</span><span class="val">${s.name}</span></div>
              <div class="row"><span class="lbl">Roll No.</span><span class="val">${s.roll_no}</span></div>
              <div class="row"><span class="lbl">Symbol No.</span><span class="val">${s.sym || '-'}</span></div>
              <div class="row"><span class="lbl">Reg. No.</span><span class="val">${s.reg || '-'}</span></div>
              <div class="row"><span class="lbl">Class</span><span class="val">${s.class}</span></div>
              <div class="row"><span class="lbl">Faculty</span><span class="val">${s.faculty}</span></div>
              <div class="row"><span class="lbl">DOB (BS)</span><span class="val">${s.dob_bs || '-'}</span></div>
              <div class="row"><span class="lbl">Session</span><span class="val">${this.state.session}</span></div>
            </div>
            <div class="photo-box">${s.photo_path ? `<img src="${s.photo_path}" style="width:100%;height:100%;object-fit:cover;">` : 'Photo'}</div>
          </div>
          <div class="subjects">
            <table>
              <thead><tr><th>Code</th><th>Subject</th><th>Cr.</th></tr></thead>
              <tbody>${subjects.map(sb => `<tr><td style="font-size:8px;">${sb.code}</td><td style="text-align:left;font-size:8px;">${sb.name}</td><td style="font-size:8px;">${(sb.credit_th||0)+(sb.credit_in||0)}</td></tr>`).join('')}</tbody>
            </table>
          </div>
          <div class="signatures">
            <div class="sign"><div class="line">Student's Signature</div></div>
            <div class="sign"><div class="line">Head Teacher</div></div>
            <div class="sign"><div class="line">Approved By</div></div>
          </div>
          <div class="instructions">
            <strong>Instructions:</strong><br>
            Candidates are required to appear for the examination at the specified time.<br>
            Admit cards must be carried at all times and presented upon request.<br>
            Mobile phones, digital watches, and any other unauthorized items are strictly prohibited within the exam premises.<br>
            It is mandatory to use a pen with either black or blue ink for the examination.
          </div>
          <div class="footer-text">This is a computer-generated admit card.</div>
        </div>
      </body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 300);
  },

  // ---- MARKS ----
  async renderMarksPage() {
    document.getElementById('pageContent').innerHTML = `
      <div class="filter-bar">
        <div class="form-group">
          <label>Class</label>
          <select class="form-control" id="marksClassFilter" onchange="App.renderMarksTable()">
            ${_classOptsAll()}
          </select>
        </div>
        <div class="form-group">
          <label>Faculty</label>
          <select class="form-control" id="marksFacultyFilter" onchange="App.renderMarksTable()">
            <option value="">All</option>
            <option value="Common">Common</option><option value="General">General</option><option value="Technical">Technical</option>
          </select>
        </div>
        <div class="form-group">
          <label>Term</label>
          <select class="form-control" id="marksTermFilter" onchange="App.renderMarksTable()">
            <option value="annual">Annual</option>
            <option value="term1">First Term</option>
            <option value="term2">Second Term</option>
          </select>
        </div>
      </div>
      <div class="table-container" id="marksTableContainer">
        <p class="text-muted" style="padding:20px;text-align:center;">Select a class and faculty to view marks entry</p>
      </div>`;
    await this.renderMarksTable();
  },

  async renderMarksTable() {
    const cls = document.getElementById('marksClassFilter').value;
    const faculty = document.getElementById('marksFacultyFilter').value;
    const term = document.getElementById('marksTermFilter').value;
    const container = document.getElementById('marksTableContainer');
    const [studRes, allSubjRes, regRes, marksRes] = await Promise.all([
      api.getStudents(cls ? { class: cls, faculty, session: this.state.session } : { session: this.state.session }),
      api.getSubjects({}),
      api.getSubjectRegistrations('all', this.state.session),
      api.getMarks({ session: this.state.session })
    ]);
    const students = studRes.success ? studRes.data : [];
    this.state.subjects = allSubjRes.success ? allSubjRes.data : [];
    let facultySubjects = cls ? this.state.subjects.filter(s => s.class === cls && s.faculty === faculty) : [];
    let commonSubjects = cls ? this.state.subjects.filter(s => s.class === cls && s.faculty === 'Common') : [];
    const seen = new Set();
    let allSubjects = [...facultySubjects, ...commonSubjects].filter(s => {
      if (seen.has(s.id)) return false; seen.add(s.id); return true;
    });
    allSubjects.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    // Filter subjects by term
    if (term === 'term1') allSubjects = allSubjects.filter(s => parseFloat(s.term1_full_marks) > 0);
    else if (term === 'term2') allSubjects = allSubjects.filter(s => parseFloat(s.term2_full_marks) > 0);
    const allRegs = regRes.success ? regRes.data : [];
    const allMarks = marksRes.success ? marksRes.data : [];
    const regMap = {};
    for (const r of allRegs) {
      if (!regMap[r.student_id]) regMap[r.student_id] = new Set();
      regMap[r.student_id].add(r.subject_id);
    }
    const marksMap = {};
    for (const m of allMarks) {
      // For annual view, include 'final' and null exam_type (backward compat)
      if (term === 'annual') {
        const et = m.exam_type || 'final';
        if (et !== 'final') continue;
      } else if (m.exam_type !== term) {
        continue;
      }
      if (!marksMap[m.student_id]) marksMap[m.student_id] = {};
      marksMap[m.student_id][m.subject_id] = m;
    }
    // Store for pagination
    this.state._marksData = { students, regMap, marksMap, allSubjects, cls, faculty, term };
    this.state.marksPage = 1;
    if (!cls || !faculty) {
      const filtered = students.filter(s => (!cls || s.class === cls) && (!faculty || s.faculty === faculty));
      this.state._marksStudents = filtered;
      container.innerHTML = `<div class="card" style="background:var(--card);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow);margin-top:16px;">
        <h3 class="mb-2">Student List</h3>
        <div class="table-container">
          <table>
            <thead><tr><th>SN</th><th>Roll</th><th>Name</th><th>Class</th><th>Faculty</th><th>Registered Subjects</th><th>Marks Entered</th></tr></thead>
            <tbody id="marksListBody"></tbody>
          </table>
          <div id="marksListPagination"></div>
        </div>
      </div>`;
      this.renderMarksListTable(filtered, 1, this.state.marksRowsPerPage);
      return;
    }
    if (!allSubjects.length) {
      this.state._marksStudents = students;
      container.innerHTML = `<div class="card" style="background:var(--card);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow);margin-top:16px;">
        <h3 class="mb-2">Student List</h3>
        <div class="table-container">
          <table>
            <thead><tr><th>SN</th><th>Roll</th><th>Name</th><th>Class</th><th>Faculty</th><th>Registered Subjects</th><th>Marks Entered</th></tr></thead>
            <tbody id="marksListBody"></tbody>
          </table>
          <div id="marksListPagination"></div>
        </div>
      </div>`;
      this.renderMarksListTable(students, 1, this.state.marksRowsPerPage);
      return;
    }
    this.state._marksStudents = students;
    container.innerHTML = `
      <div style="overflow-x:auto;">
      <table class="marks-matrix-table">
        <thead>
          <tr class="header-row1">
            <th rowspan="2">SN</th>
            <th rowspan="2">Roll</th>
            <th rowspan="2">Name</th>
            <th rowspan="2">Class</th>
            <th rowspan="2">Faculty</th>
            ${allSubjects.map((subj, i) => `<th class="subj-col" data-subj-id="${subj.id}">sub${i+1}</th>`).join('')}
            <th rowspan="2">Action</th>
          </tr>
          <tr class="header-row2">
            ${allSubjects.map(subj => `<th class="subj-code">${subj.code}</th>`).join('')}
          </tr>
        </thead>
        <tbody id="marksMatrixBody"></tbody>
        <tfoot><tr><td colspan="${5+allSubjects.length+1}" id="marksMatrixPagination"></td></tr></tfoot>
      </table>
      </div>`;
    this.renderMarksMatrix(students, 1, this.state.marksRowsPerPage, allSubjects, regMap, marksMap);
  },

  renderMarksListTable(data, page, rowsPerPage) {
    const total = data.length;
    const start = (page - 1) * rowsPerPage;
    const slice = data.slice(start, start + rowsPerPage);
    const { regMap, marksMap } = this.state._marksData || {};
    const allSubjects = this.state.subjects || [];
    const subjMap = {};
    for (const s of allSubjects) subjMap[s.id] = s;
    const tbody = document.getElementById('marksListBody');
    const pagination = document.getElementById('marksListPagination');
    if (tbody) {
      tbody.innerHTML = slice.length ? slice.map((s, i) => {
        const regs = regMap[s.id] ? [...regMap[s.id]] : [];
        const stMarks = marksMap[s.id] || {};
        const entered = regs.filter(id => stMarks[id] && (parseFloat(stMarks[id].theory_marks) > 0 || parseFloat(stMarks[id].practical_marks) > 0)).length;
        return `<tr data-class="${s.class}" data-faculty="${s.faculty}">
          <td>${start + i + 1}</td><td>${s.roll_no}</td><td>${s.name}</td><td>${s.class}</td><td>${s.faculty}</td>
          <td style="font-size:12px;">${regs.length ? regs.map(id => subjMap[id] ? subjMap[id].code : '?').join(', ') : '<span class="text-muted">None</span>'}</td>
          <td>${entered}/${regs.length}</td>
        </tr>`;
      }).join('') : '<tr><td colspan="7" class="text-center text-muted">No students found</td></tr>';
    }
    if (pagination) pagination.innerHTML = this.renderPagination(total, page, rowsPerPage, 'App.goToMarksListPage', 'App.changeMarksListRowsPerPage');
  },

  renderMarksMatrix(data, page, rowsPerPage, allSubjects, regMap, marksMap) {
    const total = data.length;
    const start = (page - 1) * rowsPerPage;
    const slice = data.slice(start, start + rowsPerPage);
    const term = this.state._marksData?.term || 'annual';
    const isTerm = term !== 'annual';
    const tbody = document.getElementById('marksMatrixBody');
    const pagination = document.getElementById('marksMatrixPagination');
    if (tbody) {
      tbody.innerHTML = slice.length ? slice.map((s, si) => {
        const regs = regMap[s.id] || new Set();
        return `<tr>
          <td>${start + si + 1}</td>
          <td>${s.roll_no}</td>
          <td style="white-space:nowrap;">${s.name}</td>
          <td>${s.class}</td>
          <td>${s.faculty}</td>
          ${allSubjects.map(subj => {
            if (!regs.has(subj.id)) return `<td class="text-muted" style="text-align:center;font-size:11px;">-</td>`;
            const m = (marksMap[s.id] || {})[subj.id];
            if (isTerm) {
              const t = m ? parseFloat(m.theory_marks) : 0;
              const tg = m ? m.theory_grade : null;
              const tMax = term === 'term1' ? parseFloat(subj.term1_full_marks) : parseFloat(subj.term2_full_marks);
              const tPass = term === 'term1' ? parseFloat(subj.term1_pass_marks) : parseFloat(subj.term2_pass_marks);
              return `<td class="marks-cell">
                <div style="display:flex;align-items:center;gap:2px;">
                  <input type="number" class="marks-input-t" step="any" data-sid="${s.id}" data-subj="${subj.id}" data-term="${term}" data-tmax="${tMax}" data-tpass="${tPass}" value="${t||''}" placeholder="Th" onchange="App.onMarksCellChange(this)" style="width:46px;">
                  <span class="grade-badge grade-${tg||'NG'}" style="font-size:9px;padding:1px 4px;min-width:22px;text-align:center;">${tg||'-'}</span>
                </div>
              </td>`;
            }
            const t = m ? parseFloat(m.theory_marks) : 0;
            const p = m ? parseFloat(m.practical_marks) : 0;
            const tg = m ? m.theory_grade : null;
            const pg = m ? m.practical_grade : null;
            return `<td class="marks-cell">
              <div style="display:flex;align-items:center;gap:2px;">
                <input type="number" class="marks-input-t" step="any" data-sid="${s.id}" data-subj="${subj.id}" data-term="annual" data-tmax="${subj.full_marks_theory}" data-pmax="${subj.full_marks_practical}" data-tpass="${subj.pass_marks_theory}" data-ppass="${subj.pass_marks_practical}" value="${t||''}" placeholder="Th" onchange="App.onMarksCellChange(this)" style="width:46px;">
                <span class="grade-badge grade-${tg||'NG'}" style="font-size:9px;padding:1px 4px;min-width:22px;text-align:center;">${tg||'-'}</span>
              </div>
              <div style="display:flex;align-items:center;gap:2px;margin-top:1px;">
                <input type="number" class="marks-input-p" step="any" data-sid="${s.id}" data-subj="${subj.id}" data-term="annual" data-tmax="${subj.full_marks_theory}" data-pmax="${subj.full_marks_practical}" data-tpass="${subj.pass_marks_theory}" data-ppass="${subj.pass_marks_practical}" value="${p||''}" placeholder="In" onchange="App.onMarksCellChange(this)" style="width:46px;">
                <span class="grade-badge grade-${pg||'NG'}" style="font-size:9px;padding:1px 4px;min-width:22px;text-align:center;">${pg||'-'}</span>
              </div>
            </td>`;
          }).join('')}
          <td style="white-space:nowrap;">
            <button class="btn btn-sm btn-success" onclick="App.processSingleResult(${s.id})" title="Generate Result"><i class="fas fa-calculator"></i></button>
          </td>
        </tr>`;
      }).join('') : '<tr><td colspan="'+(5+allSubjects.length+1)+'" class="text-center text-muted">No students found</td></tr>';
    }
    if (pagination) pagination.innerHTML = this.renderPagination(total, page, rowsPerPage, 'App.goToMarksMatrixPage', 'App.changeMarksMatrixRowsPerPage');
  },

  goToMarksListPage(page) {
    const data = this.state._marksStudents || [];
    const totalPages = Math.ceil(data.length / this.state.marksRowsPerPage) || 1;
    if (page < 1 || page > totalPages) return;
    this.state.marksPage = page;
    this.renderMarksListTable(data, page, this.state.marksRowsPerPage);
  },

  goToMarksMatrixPage(page) {
    const data = this.state._marksStudents || [];
    const totalPages = Math.ceil(data.length / this.state.marksRowsPerPage) || 1;
    if (page < 1 || page > totalPages) return;
    const { allSubjects, regMap, marksMap } = this.state._marksData || {};
    this.state.marksPage = page;
    this.renderMarksMatrix(data, page, this.state.marksRowsPerPage, allSubjects, regMap, marksMap);
  },

  changeMarksListRowsPerPage(n) {
    const data = this.state._marksStudents || [];
    this.state.marksRowsPerPage = parseInt(n);
    this.state.marksPage = 1;
    this.renderMarksListTable(data, 1, this.state.marksRowsPerPage);
  },

  changeMarksMatrixRowsPerPage(n) {
    const data = this.state._marksStudents || [];
    const { allSubjects, regMap, marksMap } = this.state._marksData || {};
    this.state.marksRowsPerPage = parseInt(n);
    this.state.marksPage = 1;
    this.renderMarksMatrix(data, 1, this.state.marksRowsPerPage, allSubjects, regMap, marksMap);
  },

  async changeSession(year) {
    if (!year) return;
    this.state.session = year;
    await api.setSetting('current_session', year);
    const acRes = await api.getSetting('academic_years');
    const years = acRes.success && acRes.value ? this.normalizeAcademicYears(JSON.parse(acRes.value)) : [];
    const yearObj = years.find(y => y.year === year);
    if (yearObj) {
      if (yearObj.exam_bs) await api.setSetting('exam_year_bs', yearObj.exam_bs);
      if (yearObj.exam_ad) await api.setSetting('exam_year_ad', yearObj.exam_ad);
      this.state.school.exam_year_bs = yearObj.exam_bs || '';
      this.state.school.exam_year_ad = yearObj.exam_ad || '';
    }
    this.loadSidebarYears();
    const status = document.getElementById('sessionStatus');
    if (status) { status.style.display='inline'; setTimeout(()=>{ status.style.display='none'; }, 2000); }
    this.navigate(this.currentPage);
  },

  async onMarksCellChange(input) {
    const sid = parseInt(input.dataset.sid);
    const subjId = parseInt(input.dataset.subj);
    const term = input.dataset.term || 'annual';
    const examType = term === 'annual' ? 'final' : term;
    const tMax = parseFloat(input.dataset.tmax);
    const tPass = parseFloat(input.dataset.tpass);
    const cell = input.closest('.marks-cell');
    const tInput = cell.querySelector('.marks-input-t');
    const pInput = cell.querySelector('.marks-input-p');
    const theory = parseFloat(tInput.value) || 0;
    const practical = pInput ? (parseFloat(pInput.value) || 0) : 0;
    if (theory > tMax) { this.notify(`Theory max ${tMax}`, 'warning'); tInput.value = tMax; return; }
    if (pInput && practical > parseFloat(input.dataset.pmax || 0)) {
      const pMax = parseFloat(input.dataset.pmax);
      this.notify(`Internal max ${pMax}`, 'warning'); pInput.value = pMax; return;
    }
    const res = await api.saveMarks({ student_id: sid, subject_id: subjId, exam_type: examType, session: this.state.session, theory_marks: theory, practical_marks: practical });
    if (!res.success) { this.notify('Error: ' + res.error, 'error'); return; }
    const badges = cell.querySelectorAll('.grade-badge');
    if (badges.length >= 1) {
      badges[0].textContent = res.theory_grade || 'NG';
      badges[0].className = `grade-badge grade-${res.theory_grade || 'NG'}`;
    }
    if (badges.length >= 2) {
      badges[1].textContent = res.practical_grade || 'NG';
      badges[1].className = `grade-badge grade-${res.practical_grade || 'NG'}`;
    }
  },

  async processSingleResult(studentId) {
    const term = this.state._marksData?.term || 'annual';
    const examType = term === 'annual' ? 'final' : term;
    const res = await api.processResult({ student_id: studentId, session: this.state.session, exam_type: examType });
    if (res.success) {
      this.notify(`Result generated: GPA ${res.gpa} (${res.grade}) - ${res.status}`);
    } else {
      this.notify('Error: ' + res.error, 'error');
    }
  },

  async viewResultCard(studentId) {
    const term = this.state.resultTerm || 'annual';
    const examType = term === 'annual' ? 'final' : term;
    const isTerm = term !== 'annual';
    const sRes = await api.getStudent(studentId);
    if (!sRes.success) return this.notify('Student not found', 'error');
    const student = sRes.data;
    const marksRes = await api.getMarks({ student_id: studentId, session: this.state.session, exam_type: examType });
    const marks = marksRes.success ? marksRes.data : [];
    const rRes = await api.getResults({ student_id: studentId });
    const results = rRes.success ? rRes.data : [];
    const result = results.find(r => r.student_id == studentId && r.session === this.state.session && r.exam_type === examType);
    if (!marks.length) return this.notify('No marks found for this student', 'warning');
    marks.sort((a, b) => (a.subject_code||'').localeCompare(b.subject_code||'', undefined, { numeric: true }));
    const s = this.state.school;
    const logoHtml = s.school_logo
      ? `<img src="${s.school_logo}" style="width:90px;height:90px;border-radius:50%;border:2px solid #1a3a5c;object-fit:cover;position:absolute;left:20px;top:15px;">`
      : `<div style="width:90px;height:90px;border-radius:50%;border:2px solid #1a3a5c;position:absolute;left:20px;top:15px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#999;">Logo</div>`;
    const headTeacherName = s.head_teacher || 'Head Teacher';
    const issueDate = s.final_date_issue || new Date().toISOString().split('T')[0];
    const examYearBs = s.exam_year_bs || this.state.session;
    const examYearAd = s.exam_year_ad || '';
    const gpaVal = (() => {
      let totalCH = 0, weightedGP = 0;
      for (const m of marks) {
        const ch = isTerm ? parseFloat(term === 'term1' ? (m.term1_credit_hours || m.credit_th) : (m.term2_credit_hours || m.credit_th)) || 1 : parseFloat(m.credit_hours) || 1;
        const gp = parseFloat(isTerm ? m.theory_grade_point : m.grade_point) || 0;
        totalCH += ch;
        weightedGP += gp * ch;
      }
      return totalCH > 0 ? Math.round((weightedGP / totalCH) * 100) / 100 : null;
    })();
    const gpa = gpaVal != null ? gpaVal.toFixed(2) : (result ? parseFloat(result.gpa).toFixed(2) : '0.00');
    const grade = result ? result.grade : 'NG';
    const status = result ? result.status : '-';
    const termLabel = term === 'annual' ? '' : term === 'term1' ? ' (First Term)' : ' (Second Term)';
    const wmText = s.watermark_text || s.school_name || 'School Name';
    const wmSize = s.watermark_font_size || '10';
    const wmColor = s.watermark_color || '#1a3a5c';
    const wmRepeat = parseInt(s.watermark_repeat) || 200;
    const wmLH = s.watermark_line_height || '2.4';
    const wm = () => `<div style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;z-index:0;opacity:0.12;"><div style="padding:12px;font-size:${wmSize}px;font-weight:400;color:${wmColor};text-align:justify;line-height:${wmLH};letter-spacing:1px;">${
      Array(wmRepeat).fill(wmText).join(' ')
    }</div></div>`;
    const noCode = student.class === 'ECD' || parseInt(student.class) <= 8;
    const marksRows = isTerm ? marks.map((m, i) => {
      const ch = parseFloat(term === 'term1' ? (m.term1_credit_hours || m.credit_th) : (m.term2_credit_hours || m.credit_th)) || 0;
      const gp = m.theory_grade_point != null ? parseFloat(m.theory_grade_point).toFixed(1) : '-';
      const gr = m.theory_grade || '-';
      const fm = parseFloat(term === 'term1' ? (m.term1_full_marks || 0) : (m.term2_full_marks || 0)) || 0;
      const pm = parseFloat(term === 'term1' ? (m.term1_pass_marks || 0) : (m.term2_pass_marks || 0)) || 0;
      return `<tr>
        <td>${i+1}</td>
        ${noCode ? '' : `<td>${m.subject_code || ''}</td>`}
        <td style="text-align:left;padding-left:6px;">${m.subject_name}</td>
        <td>${fm}</td>
        <td>${pm}</td>
        <td>${m.theory_marks ?? '-'}</td>
        <td>${ch}</td>
        <td>${gp}</td>
        <td>${gr}</td>
        <td>-</td>
      </tr>`;
    }).join('') : marks.map((m, i) => {
      const tGp = m.theory_grade_point != null ? parseFloat(m.theory_grade_point).toFixed(1) : '-';
      const pGp = m.practical_grade_point != null ? parseFloat(m.practical_grade_point).toFixed(1) : '-';
      const tGr = m.theory_grade || '-';
      const pGr = m.practical_grade || '-';
      const tCred = m.credit_th != null ? parseFloat(m.credit_th) : 0;
      const iCred = m.credit_in != null ? parseFloat(m.credit_in) : 0;
      const finalGrade = m.grade || '-';
      const code = m.subject_code || '';
      const numCode = parseInt(code);
      const isNumeric = !isNaN(numCode);
      const thCode = isNumeric ? code : (code+'(TH)');
      const inCode = isNumeric ? (numCode+1).toString().padStart(code.length, '0') : (code+'(IN)');
      return `<tr>
        <td>${i*2+1}</td>${noCode ? '' : `<td>${thCode}</td>`}
        <td style="text-align:left;padding-left:6px;">${m.subject_name} (TH)</td>
        <td>${tCred}</td>
        <td>${tGp}</td>
        <td>${tGr}</td>
        <td>${finalGrade}</td>
        <td>-</td>
      </tr>
      <tr>
        <td>${i*2+2}</td>${noCode ? '' : `<td>${inCode}</td>`}
        <td style="text-align:left;padding-left:6px;">${m.subject_name} (IN)</td>
        <td>${iCred}</td>
        <td>${pGp}</td>
        <td>${pGr}</td>
        <td></td>
        <td></td>
      </tr>`;
    }).join('');
    const thColspan = isTerm ? 8 : 7;
    this.showModal(`
      ${isTerm ? '<style>.gs-marks-table th,.gs-marks-table td{font-size:13px!important}</style>' : ''}
      <div class="gs-container">
        <div class="gs-page">
          ${wm()}
          ${logoHtml}
          <div class="gs-header">
            <div class="gs-school-name">${s.school_name || 'School Name'}</div>
            <div class="gs-school-addr">${s.municipality || ''}</div>
            <div class="gs-province">${s.province || ''}</div>
            <div class="gs-iemis">${s.iemis_id ? 'School IEMIS Code: '+s.iemis_id : ''}</div>
            <div class="gs-estd">${s.estd ? 'Estd: '+s.estd : ''}</div>
            <div class="gs-title">GRADE SHEET${termLabel}</div>
          </div>
          <div class="gs-info">
            <table class="gs-info-table">
              <tr>
                <td class="gs-info-label">Student Name</td>
                <td class="gs-info-value">${student.name}</td>
                <td class="gs-info-label">Grade/Class</td>
                <td class="gs-info-value">${student.class}</td>
              </tr>
              <tr>
                <td class="gs-info-label">Date of Birth</td>
                <td class="gs-info-value">${student.dob_bs || '-'} BS / ${student.dob ? student.dob.split('T')[0] : '-'} AD</td>
                <td class="gs-info-label">Faculty</td>
                <td class="gs-info-value">${student.faculty}</td>
              </tr>
              <tr>
                <td class="gs-info-label">Symbol No.</td>
                <td class="gs-info-value">${student.sym || '-'}</td>
                <td class="gs-info-label">Registration No.</td>
                <td class="gs-info-value">${student.reg || '-'}</td>
              </tr>
              <tr>
                <td class="gs-info-label">Examination Year</td>
                <td class="gs-info-value" colspan="3">${examYearBs} BS / ${examYearAd} AD</td>
              </tr>
            </table>
          </div>
          <table class="gs-marks-table">
            <thead>
              <tr>${isTerm ? `
                <th>SN</th>${noCode ? '' : '<th>Subject Code</th>'}
                <th>Subjects</th><th>Full Marks</th><th>Pass Marks</th><th>Obtained Marks</th><th>Credit Hour</th><th>Grade Point</th><th>Grade</th><th>Remarks</th>` : `
                <th>SN</th>${noCode ? '' : '<th>Subject Code</th>'}
                <th>Subjects</th><th>Credit Hour</th><th>Grade Point</th><th>Grade</th><th>Final Grade</th><th>Remarks</th>`}
              </tr>
            </thead>
            <tbody>
              ${marksRows}
            </tbody>
          </table>
          <div class="gs-gpa-row">
            <span class="gs-gpa-label">Grade Point Average (GPA)</span>
            <span class="gs-gpa-value">= ${gpa}</span>
          </div>
          <div class="gs-signatures">
            <div class="gs-sign">
              <div class="gs-sign-line"></div>
              <div class="gs-sign-label">Prepared By${s.prepared_by ? ': '+s.prepared_by : ''}</div>
            </div>
            <div class="gs-sign">
              <div class="gs-sign-line"></div>
              <div class="gs-sign-label">Checked By${s.checked_by ? ': '+s.checked_by : ''}</div>
            </div>
            <div class="gs-sign">
              <div class="gs-sign-line"></div>
              <div class="gs-sign-label gs-sign-head">${headTeacherName}</div>
              <div class="gs-sign-sub">Head Teacher</div>
            </div>
          </div>
          <div class="gs-grade-title">Letter Grading System</div>
          <table class="gs-grade-table">
            <thead>
              <tr><th>SN</th><th>Interval Percentage</th><th>Letter Grade</th><th>Grade Point (GP)</th><th>Achievement Description</th></tr>
            </thead>
            <tbody>
              <tr><td>1</td><td>90% and above</td><td>A+</td><td>4.0</td><td>Outstanding</td></tr>
              <tr><td>2</td><td>80% to less than 90%</td><td>A</td><td>3.6</td><td>Excellent</td></tr>
              <tr><td>3</td><td>70% to less than 80%</td><td>B+</td><td>3.2</td><td>Very Good</td></tr>
              <tr><td>4</td><td>60% to less than 70%</td><td>B</td><td>2.8</td><td>Good</td></tr>
              <tr><td>5</td><td>50% to less than 60%</td><td>C+</td><td>2.4</td><td>Satisfactory</td></tr>
              <tr><td>6</td><td>40% to less than 50%</td><td>C</td><td>2.0</td><td>Acceptable</td></tr>
              <tr><td>7</td><td>35% to less than 40%</td><td>D</td><td>1.6</td><td>Basic</td></tr>
              <tr><td>8</td><td>Below 35%</td><td>NG</td><td>0.0</td><td>Non-Graded</td></tr>
            </tbody>
          </table>
          <div class="gs-footer">
            <div class="gs-footer-left">
              <p><strong>Notes:</strong></p>${isTerm ? `
              <p>• Grade Point Average (GPA) is calculated from theory marks only.</p>` : `
              <p>• One credit hour equals 32 clock hours.</p>
              <p>• Internal (IN) covers participation, practical/project works, community works, internship, presentations, and terminal examinations.</p>
              <p>• Theory (TH) covers written external examination.</p>`}
              <p><strong>Abbreviations:</strong> ABS = Absent, W = Withheld</p>
            </div>
            <div class="gs-footer-right">
              <p><strong>Date of Issue:</strong> ${issueDate}</p>
            </div>
          </div>
          <div class="modal-actions" style="margin-top:15px;">
            <button class="btn btn-primary" onclick="App.printResultCard(${studentId})"><i class="fas fa-print"></i> Print</button>
            <button class="btn btn-outline" onclick="App.closeModal()"><i class="fas fa-times"></i> Close</button>
          </div>
        </div>
      </div>`);
  },

  // ---- RESULTS ----
  async renderResultsPage() {
    this.state.resultTerm = document.getElementById('resultTermFilter')?.value || this.state.resultTerm || 'annual';
    const examType = this.state.resultTerm === 'annual' ? 'final' : this.state.resultTerm;
    const isTerm = this.state.resultTerm !== 'annual';
    const [res, marksRes] = await Promise.all([
      api.getResults({ session: this.state.session, exam_type: examType }),
      api.getMarks({ session: this.state.session, exam_type: examType })
    ]);
    const results = res.success ? res.data : [];
    const allMarks = marksRes.success ? marksRes.data : [];
    const marksByStudent = {};
    for (const m of allMarks) {
      if (!marksByStudent[m.student_id]) marksByStudent[m.student_id] = [];
      marksByStudent[m.student_id].push(m);
    }
    this.state.results = results;
    this.state._marksByStudent = marksByStudent;
    this.state.resultPage = 1;
    document.getElementById('pageContent').innerHTML = `
      <div class="filter-bar">
        <div class="form-group">
          <label>Class</label>
          <select class="form-control" id="resultClassFilter" onchange="App.filterResults()">
            ${_classOptsAll()}
          </select>
        </div>
        <div class="form-group">
          <label>Faculty</label>
          <select class="form-control" id="resultFacultyFilter" onchange="App.filterResults()">
            <option value="">All</option>
            <option value="Common">Common</option><option value="General">General</option><option value="Technical">Technical</option>
          </select>
        </div>
        <div class="form-group">
          <label>Term</label>
          <select class="form-control" id="resultTermFilter" onchange="App.renderResultsPage()">
            <option value="annual" ${this.state.resultTerm === 'annual' ? 'selected' : ''}>Annual</option>
            <option value="term1" ${this.state.resultTerm === 'term1' ? 'selected' : ''}>First Term</option>
            <option value="term2" ${this.state.resultTerm === 'term2' ? 'selected' : ''}>Second Term</option>
          </select>
        </div>
        <button class="btn btn-success" onclick="App.processAllResults()"><i class="fas fa-play"></i> Generate All Results</button>
        <button class="btn btn-primary" onclick="App.printAllResults()"><i class="fas fa-print"></i> Print All Results</button>
        <button class="btn btn-outline" onclick="App.exportData('results')"><i class="fas fa-download"></i> Export Results</button>
      </div>
      <div class="table-container">
        <table>
          <thead><tr>
            <th>Rank</th><th>Roll</th><th>Name</th><th>Class</th><th>Faculty</th><th>Total</th><th>GPA</th><th>Grade</th><th>Status</th><th>Action</th>
          </tr></thead>
          <tbody id="resultTableBody"></tbody>
        </table>
        <div id="resultPagination"></div>
      </div>`;
  },

  renderResultTable(data, page, rowsPerPage) {
    const total = data.length;
    const start = (page - 1) * rowsPerPage;
    const slice = data.slice(start, start + rowsPerPage);
    const tbody = document.getElementById('resultTableBody');
    const pagination = document.getElementById('resultPagination');
    const term = this.state.resultTerm || 'annual';
    const isTerm = term !== 'annual';
    if (tbody) {
      tbody.innerHTML = slice.length ? slice.map(r => {
        const marks = this.state._marksByStudent?.[r.student_id] || [];
        let liveGpa = null, liveGrade = 'NG', liveStatus = 'Pass';
        if (marks.length) {
          let totalCH = 0, weightedGP = 0, hasNG = false, hasFail = false;
          for (const m of marks) {
            const ch = isTerm ? parseFloat(term === 'term1' ? (m.term1_credit_hours || m.credit_th) : (m.term2_credit_hours || m.credit_th)) || 1 : parseFloat(m.credit_hours) || 1;
            const gp = parseFloat(isTerm ? (m.theory_grade_point) : (m.grade_point)) || 0;
            const g = isTerm ? m.theory_grade : m.grade;
            totalCH += ch;
            weightedGP += gp * ch;
            if (g === 'NG' || g === 'E') hasFail = true;
            if (g === 'NG') hasNG = true;
          }
          if (totalCH > 0) {
            const gpa = Math.round((weightedGP / totalCH) * 100) / 100;
            if (hasNG) { liveGrade = 'NG'; liveStatus = 'Fail'; }
            else if (hasFail) { liveGrade = 'E'; liveStatus = 'Supplementary'; }
            else if (gpa >= 3.6) { liveGrade = 'A+'; liveStatus = 'Pass'; }
            else if (gpa >= 3.2) { liveGrade = 'A'; liveStatus = 'Pass'; }
            else if (gpa >= 2.8) { liveGrade = 'B+'; liveStatus = 'Pass'; }
            else if (gpa >= 2.4) { liveGrade = 'B'; liveStatus = 'Pass'; }
            else if (gpa >= 2.0) { liveGrade = 'C+'; liveStatus = 'Pass'; }
            else if (gpa >= 1.6) { liveGrade = 'C'; liveStatus = 'Pass'; }
            else if (gpa >= 1.0) { liveGrade = 'D'; liveStatus = 'Pass'; }
            else { liveGrade = 'E'; liveStatus = 'Fail'; }
            liveGpa = gpa.toFixed(2);
          }
        }
        const dispGpa = liveGpa || (r.gpa != null ? (typeof r.gpa === 'number' ? r.gpa.toFixed(2) : r.gpa) : '-');
        const dispGrade = liveGpa != null ? liveGrade : r.grade;
        const dispStatus = liveGpa != null ? liveStatus : r.status;
        return `<tr data-class="${r.class}" data-faculty="${r.faculty}">
          <td>${r.rank||'-'}</td><td>${r.roll_no}</td><td>${r.student_name}</td>
          <td>${r.class}</td><td>${r.faculty}</td><td>${r.grand_total}</td>
          <td><strong>${dispGpa}</strong></td>
          <td><span class="grade-badge grade-${dispGrade}">${dispGrade}</span></td>
          <td><span class="result-status status-${dispStatus}">${dispStatus}</span></td>
          <td>
            <button class="btn btn-sm btn-primary" onclick="App.viewResultCard(${r.student_id})"><i class="fas fa-eye"></i> View</button>
            <button class="btn btn-sm btn-outline" onclick="App.printResultCard(${r.student_id})"><i class="fas fa-print"></i> Print</button>
          </td>
        </tr>`;
      }).join('') : '<tr><td colspan="10" class="text-center text-muted">No results generated yet</td></tr>';
    }
    if (pagination) pagination.innerHTML = this.renderPagination(total, page, rowsPerPage, 'App.goToResultPage', 'App.changeResultRowsPerPage');
  },

  goToResultPage(page) {
    const data = this.state.results || [];
    const totalPages = Math.ceil(data.length / this.state.resultRowsPerPage) || 1;
    if (page < 1 || page > totalPages) return;
    this.state.resultPage = page;
    this.renderResultTable(data, page, this.state.resultRowsPerPage);
  },

  changeResultRowsPerPage(n) {
    this.state.resultRowsPerPage = parseInt(n);
    this.state.resultPage = 1;
    this.renderResultTable(this.state.results, 1, this.state.resultRowsPerPage);
  },

  filterResults() {
    const cls = document.getElementById('resultClassFilter').value;
    const faculty = document.getElementById('resultFacultyFilter').value;
    const filtered = this.state.results.filter(r =>
      (!cls || r.class == cls) && (!faculty || r.faculty === faculty)
    );
    this.state.results = filtered;
    this.state.resultPage = 1;
    this.renderResultTable(filtered, 1, this.state.resultRowsPerPage);
  },

  async processAllResults() {
    const term = document.getElementById('resultTermFilter')?.value || 'annual';
    const examType = term === 'annual' ? 'final' : term;
    if (!confirm(`Generate ${term} results for all students with marks? This may take a moment.`)) return;
    const studentsRes = await api.getStudents({ session: this.state.session });
    const students = studentsRes.success ? studentsRes.data : [];
    let count = 0;
    for (const student of students) {
      const marksRes = await api.getMarks({ student_id: student.id, session: this.state.session, exam_type: examType });
      if (marksRes.success && marksRes.data.length > 0) {
        await api.processResult({ student_id: student.id, session: this.state.session, exam_type: examType });
        count++;
      }
    }
    this.notify(`Results generated for ${count} students (${term})`);
    await this.renderResultsPage();
  },

  async printAllResults() {
    const term = this.state.resultTerm || 'annual';
    const examType = term === 'annual' ? 'final' : term;
    const isTerm = term !== 'annual';
    const cls = document.getElementById('resultClassFilter').value;
    const faculty = document.getElementById('resultFacultyFilter').value;
    let results = this.state.results;
    if (cls) results = results.filter(r => r.class == cls);
    if (faculty) results = results.filter(r => r.faculty === faculty);
    if (!results.length) return this.notify('No results to print', 'warning');
    const s = this.state.school;
    const logoHtml = s.school_logo
      ? `<img src="${s.school_logo}" style="width:80px;height:80px;border-radius:50%;border:2px solid #1a3a5c;object-fit:cover;position:absolute;left:30px;top:16px;">`
      : '';
    const headTeacherName = s.head_teacher || 'Head Teacher';
    const issueDate = s.final_date_issue || new Date().toISOString().split('T')[0];
    const examYearBs = s.exam_year_bs || this.state.session;
    const examYearAd = s.exam_year_ad || '';
    const termLabel = term === 'annual' ? '' : term === 'term1' ? ' (First Term)' : ' (Second Term)';
    const wmText = s.watermark_text || s.school_name || 'School Name';
    const wmSize = s.watermark_font_size || '10';
    const wmColor = s.watermark_color || '#1a3a5c';
    const wmRepeat = parseInt(s.watermark_repeat) || 200;
    const wmLH = s.watermark_line_height || '2.4';
    let allHtml = '';
    for (const r of results) {
      const sRes = await api.getStudent(r.student_id);
      if (!sRes.success) continue;
      const student = sRes.data;
      const marksRes = await api.getMarks({ student_id: r.student_id, session: this.state.session, exam_type: examType });
      const marks = marksRes.success ? marksRes.data : [];
      if (!marks.length) continue;
      marks.sort((a, b) => (a.subject_code||'').localeCompare(b.subject_code||'', undefined, { numeric: true }));
      const gpaVal = (() => {
        let totalCH = 0, weightedGP = 0;
        for (const m of marks) {
          const ch = isTerm ? parseFloat(term === 'term1' ? (m.term1_credit_hours || m.credit_th) : (m.term2_credit_hours || m.credit_th)) || 1 : parseFloat(m.credit_hours) || 1;
          const gp = parseFloat(isTerm ? m.theory_grade_point : m.grade_point) || 0;
          totalCH += ch;
          weightedGP += gp * ch;
        }
        return totalCH > 0 ? Math.round((weightedGP / totalCH) * 100) / 100 : null;
      })();
      const gpa = gpaVal != null ? gpaVal.toFixed(2) : (r.gpa ? parseFloat(r.gpa).toFixed(2) : '0.00');
      const noCode = student.class === 'ECD' || parseInt(student.class) <= 8;
    const marksRows = isTerm ? marks.map((m, i) => {
      const ch = parseFloat(term === 'term1' ? (m.term1_credit_hours || m.credit_th) : (m.term2_credit_hours || m.credit_th)) || 0;
      const gp = m.theory_grade_point != null ? parseFloat(m.theory_grade_point).toFixed(1) : '-';
      const gr = m.theory_grade || '-';
      const fm = parseFloat(term === 'term1' ? (m.term1_full_marks || 0) : (m.term2_full_marks || 0)) || 0;
      const pm = parseFloat(term === 'term1' ? (m.term1_pass_marks || 0) : (m.term2_pass_marks || 0)) || 0;
      return `<tr>
        <td>${i+1}</td>
        ${noCode ? '' : `<td>${m.subject_code || ''}</td>`}
        <td style="text-align:left;padding-left:6px;">${m.subject_name}</td>
        <td>${fm}</td>
        <td>${pm}</td>
        <td>${m.theory_marks ?? '-'}</td>
        <td>${ch}</td>
        <td>${gp}</td>
        <td>${gr}</td>
        <td>-</td>
      </tr>`;
      }).join('') : marks.map((m, i) => {
        const tGp = m.theory_grade_point != null ? parseFloat(m.theory_grade_point).toFixed(1) : '-';
        const pGp = m.practical_grade_point != null ? parseFloat(m.practical_grade_point).toFixed(1) : '-';
        const tGr = m.theory_grade || '-';
        const pGr = m.practical_grade || '-';
        const tCred = m.credit_th != null ? parseFloat(m.credit_th) : 0;
        const iCred = m.credit_in != null ? parseFloat(m.credit_in) : 0;
        const code = m.subject_code || '';
        const numCode = parseInt(code);
        const isNumeric = !isNaN(numCode);
        const thCode = isNumeric ? code : (code+'(TH)');
        const inCode = isNumeric ? (numCode+1).toString().padStart(code.length, '0') : (code+'(IN)');
        return `<tr>
          <td>${i*2+1}</td>${noCode ? '' : `<td>${thCode}</td>`}
          <td style="text-align:left;padding-left:6px;">${m.subject_name} (TH)</td>
          <td>${tCred}</td><td>${tGp}</td><td>${tGr}</td><td>${m.grade || '-'}</td><td>-</td>
        </tr>
        <tr>
          <td>${i*2+2}</td>${noCode ? '' : `<td>${inCode}</td>`}
          <td style="text-align:left;padding-left:6px;">${m.subject_name} (IN)</td>
          <td>${iCred}</td><td>${pGp}</td><td>${pGr}</td><td></td><td></td>
        </tr>`;
      }).join('');
      allHtml += `
        <div class="gs-page" style="page-break-after:always;">
          <div style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;z-index:0;opacity:0.12;"><div style="padding:12px;font-size:${wmSize}px;font-weight:400;color:${wmColor};text-align:justify;line-height:${wmLH};letter-spacing:1px;">${Array(wmRepeat).fill(wmText).join(' ')}</div></div>
          ${logoHtml}
          <div class="gs-header">
            <div class="gs-school-name">${s.school_name || 'School Name'}</div>
            <div class="gs-school-addr">${s.municipality || ''}</div>
            <div class="gs-province">${s.province || ''}</div>
            <div class="gs-iemis">${s.iemis_id ? 'School IEMIS Code: '+s.iemis_id : ''}</div>
            <div class="gs-estd">${s.estd ? 'Estd: '+s.estd : ''}</div>
            <div class="gs-title">GRADE SHEET${termLabel}</div>
          </div>
          <div class="gs-info">
            <table class="gs-info-table">
              <tr>
                <td class="gs-info-label">Student Name</td>
                <td class="gs-info-value">${student.name}</td>
                <td class="gs-info-label">Grade/Class</td>
                <td class="gs-info-value">${student.class}</td>
              </tr>
              <tr>
                <td class="gs-info-label">Date of Birth</td>
                <td class="gs-info-value">${student.dob_bs || '-'} BS / ${student.dob ? student.dob.split('T')[0] : '-'} AD</td>
                <td class="gs-info-label">Faculty</td>
                <td class="gs-info-value">${student.faculty}</td>
              </tr>
              <tr>
                <td class="gs-info-label">Symbol No.</td>
                <td class="gs-info-value">${student.sym || '-'}</td>
                <td class="gs-info-label">Registration No.</td>
                <td class="gs-info-value">${student.reg || '-'}</td>
              </tr>
              <tr>
                <td class="gs-info-label">Examination Year</td>
                <td class="gs-info-value" colspan="3">${examYearBs} BS / ${examYearAd} AD</td>
              </tr>
            </table>
          </div>
          <table class="gs-marks-table">
            <thead>
              <tr>${isTerm ? `
                <th>SN</th>${noCode ? '' : '<th>Subject Code</th>'}
                <th>Subjects</th><th>Full Marks</th><th>Pass Marks</th><th>Obtained Marks</th><th>Credit Hour</th><th>Grade Point</th><th>Grade</th><th>Remarks</th>` : `
                <th>SN</th>${noCode ? '' : '<th>Subject Code</th>'}
                <th>Subjects</th><th>Credit Hour</th><th>Grade Point</th><th>Grade</th><th>Final Grade</th><th>Remarks</th>`}
              </tr>
            </thead>
            <tbody>
              ${marksRows}
            </tbody>
          </table>
          <div class="gs-gpa-row">
            <span class="gs-gpa-label">Grade Point Average (GPA)</span>
            <span class="gs-gpa-value">= ${gpa}</span>
          </div>
          <div class="gs-signatures">
            <div class="gs-sign"><div class="gs-sign-line"></div><div class="gs-sign-label">Prepared By${s.prepared_by ? ': '+s.prepared_by : ''}</div></div>
            <div class="gs-sign"><div class="gs-sign-line"></div><div class="gs-sign-label">Checked By${s.checked_by ? ': '+s.checked_by : ''}</div></div>
            <div class="gs-sign"><div class="gs-sign-line"></div><div class="gs-sign-label gs-sign-head">${headTeacherName}</div><div class="gs-sign-sub">Head Teacher</div></div>
          </div>
          <div class="gs-grade-title">Letter Grading System</div>
          <table class="gs-grade-table">
            <thead><tr><th>SN</th><th>Interval Percentage</th><th>Letter Grade</th><th>Grade Point (GP)</th><th>Achievement Description</th></tr></thead>
            <tbody>
              <tr><td>1</td><td>90% and above</td><td>A+</td><td>4.0</td><td>Outstanding</td></tr>
              <tr><td>2</td><td>80% to less than 90%</td><td>A</td><td>3.6</td><td>Excellent</td></tr>
              <tr><td>3</td><td>70% to less than 80%</td><td>B+</td><td>3.2</td><td>Very Good</td></tr>
              <tr><td>4</td><td>60% to less than 70%</td><td>B</td><td>2.8</td><td>Good</td></tr>
              <tr><td>5</td><td>50% to less than 60%</td><td>C+</td><td>2.4</td><td>Satisfactory</td></tr>
              <tr><td>6</td><td>40% to less than 50%</td><td>C</td><td>2.0</td><td>Acceptable</td></tr>
              <tr><td>7</td><td>35% to less than 40%</td><td>D</td><td>1.6</td><td>Basic</td></tr>
              <tr><td>8</td><td>Below 35%</td><td>NG</td><td>0.0</td><td>Non-Graded</td></tr>
            </tbody>
          </table>
          <div class="gs-footer">
            <div class="gs-footer-left">
              <p><strong>Notes:</strong></p>${isTerm ? `
              <p>• Grade Point Average (GPA) is calculated from theory marks only.</p>` : `
              <p>• One credit hour equals 32 clock hours.</p>
              <p>• Internal (IN) covers participation, practical/project works, community works, internship, presentations, and terminal examinations.</p>
              <p>• Theory (TH) covers written external examination.</p>`}
              <p><strong>Abbreviations:</strong> ABS = Absent, W = Withheld</p>
            </div>
            <div class="gs-footer-right"><p><strong>Date of Issue:</strong> ${issueDate}</p></div>
          </div>
        </div>`;
    }
    if (!allHtml) return this.notify('No grade sheets to print', 'warning');
    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>All Grade Sheets - ${this.state.session}</title>
      <style>
        @page { size: A4; margin: 8mm; }
        body { margin:0; padding:0; font-family:'Times New Roman',serif; background:#fff; }
        .gs-page { width:100%; min-height:277mm; padding:18px 22px; position:relative; background:#fff; border:3px double #1a3a5c; box-sizing:border-box; margin:0 0 8mm 0; page-break-after:always; }
        .gs-header { text-align:center; margin-bottom:4px; }
        .gs-school-name { font-size:21px; font-weight:700; color:#1a3a5c; text-transform:uppercase; letter-spacing:1.5px; }
        .gs-school-addr { font-size:12px; color:#555; margin-top:2px; }
        .gs-province { font-size:12px; color:#555; }
        .gs-estd { font-size:11px; color:#555; margin-top:1px; }
        .gs-iemis { font-size:11px; color:#555; margin-top:1px; }
        .gs-title { text-align:center; font-size:19px; font-weight:700; margin:10px 0 8px; letter-spacing:3px; color:#1a3a5c; border-bottom:2px solid #1a3a5c; padding-bottom:5px; }
        .gs-info { margin-bottom:10px; }
        .gs-info-table { width:100%; border-collapse:collapse; }
        .gs-info-table td { padding:4px 8px; font-size:12px; border:none; }
        .gs-info-label { color:#1a3a5c; font-weight:600; width:130px; border-bottom:1px solid #1a3a5c; }
        .gs-info-value { color:#000; border-bottom:1px solid #ccc; }
        .gs-marks-table { width:100%; border-collapse:collapse; margin-bottom:8px; }
        .gs-marks-table th, .gs-marks-table td { border:1.5px solid #1a3a5c; padding:5px 6px; text-align:center; font-size:${isTerm ? '13px' : '11px'}; }
        .gs-marks-table th { background:#e8edf3; color:#1a3a5c; font-weight:700; }
        .gs-marks-table td { color:#1a3a5c; }
        .gs-gpa-row { text-align:right; padding:6px 10px; border-top:2px solid #1a3a5c; margin-bottom:10px; }
        .gs-gpa-label { font-weight:600; font-size:13px; color:#1a3a5c; }
        .gs-gpa-value { font-weight:700; font-size:14px; color:#1a3a5c; }
        .gs-signatures { display:flex; justify-content:space-between; margin:10px 0; }
        .gs-sign { text-align:center; width:30%; }
        .gs-sign-line { border-top:1px solid #333; width:100%; margin-top:32px; }
        .gs-sign-label { font-size:11px; margin-top:4px; color:#555; }
        .gs-sign-head { font-weight:700; text-transform:uppercase; color:#1a3a5c; font-size:12px; }
        .gs-sign-sub { font-size:10px; color:#555; }
        .gs-grade-title { text-align:center; font-size:12px; font-weight:700; color:#1a3a5c; margin:6px 0 3px; }
        .gs-grade-table { width:100%; border-collapse:collapse; margin:8px 0; }
        .gs-grade-table th, .gs-grade-table td { border:1px solid #1a3a5c; padding:3px 5px; text-align:center; font-size:10px; }
        .gs-grade-table th { background:#e8edf3; color:#1a3a5c; font-weight:600; }
        .gs-grade-table td { color:#333; }
        .gs-footer { display:flex; justify-content:space-between; border-top:1px solid #1a3a5c; padding-top:5px; margin-top:5px; }
        .gs-footer-left { font-size:11px; color:#555; flex:2; line-height:1.5; }
        .gs-footer-right { font-size:11px; color:#555; text-align:right; flex:1; }
        .gs-footer-left p { margin:1px 0; }
        .gs-footer-right p { margin:1px 0; }
      </style></head><body>
        ${allHtml}
        <script>window.onload = function() { window.print(); }</script>
      </body></html>`);
    win.document.close();
  },

  async printResultCard(studentId) {
    const term = this.state.resultTerm || 'annual';
    const examType = term === 'annual' ? 'final' : term;
    const isTerm = term !== 'annual';
    const sRes = await api.getStudent(studentId);
    if (!sRes.success) return this.notify('Student not found', 'error');
    const student = sRes.data;
    const marksRes = await api.getMarks({ student_id: studentId, session: this.state.session, exam_type: examType });
    const marks = marksRes.success ? marksRes.data : [];
    const rRes = await api.getResults({ student_id: studentId });
    const results = rRes.success ? rRes.data : [];
    const result = results.find(r => r.student_id == studentId && r.session === this.state.session && r.exam_type === examType);
    if (!marks.length) return this.notify('No marks found for this student', 'warning');
    marks.sort((a, b) => (a.subject_code||'').localeCompare(b.subject_code||'', undefined, { numeric: true }));
    const s = this.state.school;
    const logoHtml = s.school_logo
      ? `<img src="${s.school_logo}" style="width:80px;height:80px;border-radius:50%;border:2px solid #1a3a5c;object-fit:cover;position:absolute;left:30px;top:16px;">`
      : '';
    const headTeacherName = s.head_teacher || 'Head Teacher';
    const issueDate = s.final_date_issue || new Date().toISOString().split('T')[0];
    const examYearBs = s.exam_year_bs || this.state.session;
    const examYearAd = s.exam_year_ad || '';
    const gpaVal = (() => {
      let totalCH = 0, weightedGP = 0;
      for (const m of marks) {
        const ch = isTerm ? parseFloat(term === 'term1' ? (m.term1_credit_hours || m.credit_th) : (m.term2_credit_hours || m.credit_th)) || 1 : parseFloat(m.credit_hours) || 1;
        const gp = parseFloat(isTerm ? m.theory_grade_point : m.grade_point) || 0;
        totalCH += ch;
        weightedGP += gp * ch;
      }
      return totalCH > 0 ? Math.round((weightedGP / totalCH) * 100) / 100 : null;
    })();
    const gpa = gpaVal != null ? gpaVal.toFixed(2) : (result ? parseFloat(result.gpa).toFixed(2) : '0.00');
    const termLabel = term === 'annual' ? '' : term === 'term1' ? ' (First Term)' : ' (Second Term)';
    const wmText = s.watermark_text || s.school_name || 'School Name';
    const wmSize = s.watermark_font_size || '10';
    const wmColor = s.watermark_color || '#1a3a5c';
    const wmRepeat = parseInt(s.watermark_repeat) || 200;
    const wmLH = s.watermark_line_height || '2.4';
    const wm = () => `<div style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;z-index:0;opacity:0.12;"><div style="padding:12px;font-size:${wmSize}px;font-weight:400;color:${wmColor};text-align:justify;line-height:${wmLH};letter-spacing:1px;">${
      Array(wmRepeat).fill(wmText).join(' ')
    }</div></div>`;
    const noCode = student.class === 'ECD' || parseInt(student.class) <= 8;
    const marksRows = isTerm ? marks.map((m, i) => {
      const ch = parseFloat(term === 'term1' ? (m.term1_credit_hours || m.credit_th) : (m.term2_credit_hours || m.credit_th)) || 0;
      const gp = m.theory_grade_point != null ? parseFloat(m.theory_grade_point).toFixed(1) : '-';
      const gr = m.theory_grade || '-';
      const fm = parseFloat(term === 'term1' ? (m.term1_full_marks || 0) : (m.term2_full_marks || 0)) || 0;
      const pm = parseFloat(term === 'term1' ? (m.term1_pass_marks || 0) : (m.term2_pass_marks || 0)) || 0;
      return `<tr>
        <td>${i+1}</td>
        ${noCode ? '' : `<td>${m.subject_code || ''}</td>`}
        <td style="text-align:left;padding-left:6px;">${m.subject_name}</td>
        <td>${fm}</td>
        <td>${pm}</td>
        <td>${m.theory_marks ?? '-'}</td>
        <td>${ch}</td>
        <td>${gp}</td>
        <td>${gr}</td>
        <td>-</td>
      </tr>`;
    }).join('') : marks.map((m, i) => {
      const tGp = m.theory_grade_point != null ? parseFloat(m.theory_grade_point).toFixed(1) : '-';
      const pGp = m.practical_grade_point != null ? parseFloat(m.practical_grade_point).toFixed(1) : '-';
      const tGr = m.theory_grade || '-';
      const pGr = m.practical_grade || '-';
      const tCred = m.credit_th != null ? parseFloat(m.credit_th) : 0;
      const iCred = m.credit_in != null ? parseFloat(m.credit_in) : 0;
      const code = m.subject_code || '';
      const numCode = parseInt(code);
      const isNumeric = !isNaN(numCode);
      const thCode = isNumeric ? code : (code+'(TH)');
      const inCode = isNumeric ? (numCode+1).toString().padStart(code.length, '0') : (code+'(IN)');
      return `<tr>
        <td>${i*2+1}</td>${noCode ? '' : `<td>${thCode}</td>`}
        <td style="text-align:left;padding-left:6px;">${m.subject_name} (TH)</td>
        <td>${tCred}</td>
        <td>${tGp}</td>
        <td>${tGr}</td>
        <td>${m.grade || '-'}</td>
        <td>-</td>
      </tr>
      <tr>
        <td>${i*2+2}</td>${noCode ? '' : `<td>${inCode}</td>`}
        <td style="text-align:left;padding-left:6px;">${m.subject_name} (IN)</td>
        <td>${iCred}</td>
        <td>${pGp}</td>
        <td>${pGr}</td>
        <td></td>
        <td></td>
      </tr>`;
    }).join('');
    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>Grade-Sheet - ${student.name}</title>
      <style>
        @page { size: A4; margin: 0; }
        body { margin:0; padding:20px; font-family:'Times New Roman',serif; background:#fff; display:flex; justify-content:center; }
        .gs-page { width:210mm; min-height:270mm; padding:20px 25px; position:relative; background:#fff; border:4px double #1a3a5c; }
        .gs-header { text-align:center; margin-bottom:4px; }
        .gs-school-name { font-size:20px; font-weight:700; color:#1a3a5c; text-transform:uppercase; letter-spacing:1.5px; }
        .gs-school-addr { font-size:12px; color:#555; margin-top:2px; }
        .gs-province { font-size:12px; color:#555; }
        .gs-estd { font-size:11px; color:#555; margin-top:1px; }
        .gs-iemis { font-size:11px; color:#555; margin-top:1px; }
        .gs-title { text-align:center; font-size:18px; font-weight:700; margin:10px 0 8px; letter-spacing:3px; color:#1a3a5c; border-bottom:2px solid #1a3a5c; padding-bottom:6px; }
        .gs-info { margin-bottom:10px; }
        .gs-info-table { width:100%; border-collapse:collapse; }
        .gs-info-table td { padding:5px 8px; font-size:12px; border:none; }
        .gs-info-label { color:#1a3a5c; font-weight:600; width:140px; border-bottom:1px solid #1a3a5c; }
        .gs-info-value { color:#000; border-bottom:1px solid #ccc; }
        .gs-marks-table { width:100%; border-collapse:collapse; margin-bottom:8px; }
        .gs-marks-table th, .gs-marks-table td { border:1.5px solid #1a3a5c; padding:6px 6px; text-align:center; font-size:${isTerm ? '13px' : '11px'}; }
        .gs-marks-table th { background:#e8edf3; color:#1a3a5c; font-weight:700; }
        .gs-marks-table td { color:#1a3a5c; }
        .gs-gpa-row { text-align:right; padding:6px 10px; border-top:2px solid #1a3a5c; margin-bottom:10px; }
        .gs-gpa-label { font-weight:600; font-size:13px; color:#1a3a5c; }
        .gs-gpa-value { font-weight:700; font-size:14px; color:#1a3a5c; margin-left:4px; }
        .gs-signatures { display:flex; justify-content:space-between; margin:12px 0; }
        .gs-sign { text-align:center; width:30%; }
        .gs-sign-line { border-top:1px solid #333; width:100%; margin-top:36px; }
        .gs-sign-label { font-size:11px; margin-top:4px; color:#555; }
        .gs-sign-head { font-weight:700; text-transform:uppercase; color:#1a3a5c; font-size:12px; }
        .gs-sign-sub { font-size:10px; color:#555; }
        .gs-grade-title { text-align:center; font-size:12px; font-weight:700; color:#1a3a5c; margin:6px 0 2px; }
        .gs-grade-table { width:100%; border-collapse:collapse; margin:8px 0; }
        .gs-grade-table th, .gs-grade-table td { border:1px solid #1a3a5c; padding:3px 5px; text-align:center; font-size:10px; }
        .gs-grade-table th { background:#e8edf3; color:#1a3a5c; font-weight:600; }
        .gs-grade-table td { color:#333; }
        .gs-footer { display:flex; justify-content:space-between; border-top:1px solid #1a3a5c; padding-top:6px; margin-top:4px; }
        .gs-footer-left { font-size:11px; color:#555; flex:2; line-height:1.5; }
        .gs-footer-right { font-size:11px; color:#555; text-align:right; flex:1; }
        .gs-footer-left p { margin:1px 0; }
        .gs-footer-right p { margin:1px 0; }
      </style></head><body>
        <div class="gs-page">
          ${wm()}
          ${logoHtml}
          <div class="gs-header">
            <div class="gs-school-name">${s.school_name || 'School Name'}</div>
            <div class="gs-school-addr">${s.municipality || ''}</div>
            <div class="gs-province">${s.province || ''}</div>
            <div class="gs-iemis">${s.iemis_id ? 'School IEMIS Code: '+s.iemis_id : ''}</div>
            <div class="gs-estd">${s.estd ? 'Estd: '+s.estd : ''}</div>
            <div class="gs-title">GRADE SHEET${termLabel}</div>
          </div>
          <div class="gs-info">
            <table class="gs-info-table">
              <tr>
                <td class="gs-info-label">Student Name</td>
                <td class="gs-info-value">${student.name}</td>
                <td class="gs-info-label">Grade/Class</td>
                <td class="gs-info-value">${student.class}</td>
              </tr>
              <tr>
                <td class="gs-info-label">Date of Birth</td>
                <td class="gs-info-value">${student.dob_bs || '-'} BS / ${student.dob ? student.dob.split('T')[0] : '-'} AD</td>
                <td class="gs-info-label">Faculty</td>
                <td class="gs-info-value">${student.faculty}</td>
              </tr>
              <tr>
                <td class="gs-info-label">Symbol No.</td>
                <td class="gs-info-value">${student.sym || '-'}</td>
                <td class="gs-info-label">Registration No.</td>
                <td class="gs-info-value">${student.reg || '-'}</td>
              </tr>
              <tr>
                <td class="gs-info-label">Examination Year</td>
                <td class="gs-info-value" colspan="3">${examYearBs} BS / ${examYearAd} AD</td>
              </tr>
            </table>
          </div>
          <table class="gs-marks-table">
            <thead>
              <tr>${isTerm ? `
                <th>SN</th>${noCode ? '' : '<th>Subject Code</th>'}
                <th>Subjects</th><th>Full Marks</th><th>Pass Marks</th><th>Obtained Marks</th><th>Credit Hour</th><th>Grade Point</th><th>Grade</th><th>Remarks</th>` : `
                <th>SN</th>${noCode ? '' : '<th>Subject Code</th>'}
                <th>Subjects</th><th>Credit Hour</th><th>Grade Point</th><th>Grade</th><th>Final Grade</th><th>Remarks</th>`}
              </tr>
            </thead>
            <tbody>
              ${marksRows}
            </tbody>
          </table>
          <div class="gs-gpa-row">
            <span class="gs-gpa-label">Grade Point Average (GPA)</span>
            <span class="gs-gpa-value">= ${gpa}</span>
          </div>
          <div class="gs-signatures">
            <div class="gs-sign">
              <div class="gs-sign-line"></div>
              <div class="gs-sign-label">Prepared By${s.prepared_by ? ': '+s.prepared_by : ''}</div>
            </div>
            <div class="gs-sign">
              <div class="gs-sign-line"></div>
              <div class="gs-sign-label">Checked By${s.checked_by ? ': '+s.checked_by : ''}</div>
            </div>
            <div class="gs-sign">
              <div class="gs-sign-line"></div>
              <div class="gs-sign-label gs-sign-head">${headTeacherName}</div>
              <div class="gs-sign-sub">Head Teacher</div>
            </div>
          </div>
          <div class="gs-grade-title">Letter Grading System</div>
          <table class="gs-grade-table">
            <thead>
              <tr><th>SN</th><th>Interval Percentage</th><th>Letter Grade</th><th>Grade Point (GP)</th><th>Achievement Description</th></tr>
            </thead>
            <tbody>
              <tr><td>1</td><td>90% and above</td><td>A+</td><td>4.0</td><td>Outstanding</td></tr>
              <tr><td>2</td><td>80% to less than 90%</td><td>A</td><td>3.6</td><td>Excellent</td></tr>
              <tr><td>3</td><td>70% to less than 80%</td><td>B+</td><td>3.2</td><td>Very Good</td></tr>
              <tr><td>4</td><td>60% to less than 70%</td><td>B</td><td>2.8</td><td>Good</td></tr>
              <tr><td>5</td><td>50% to less than 60%</td><td>C+</td><td>2.4</td><td>Satisfactory</td></tr>
              <tr><td>6</td><td>40% to less than 50%</td><td>C</td><td>2.0</td><td>Acceptable</td></tr>
              <tr><td>7</td><td>35% to less than 40%</td><td>D</td><td>1.6</td><td>Basic</td></tr>
              <tr><td>8</td><td>Below 35%</td><td>NG</td><td>0.0</td><td>Non-Graded</td></tr>
            </tbody>
          </table>
          <div class="gs-footer">
            <div class="gs-footer-left">
              <p><strong>Notes:</strong></p>${isTerm ? `
              <p>• Grade Point Average (GPA) is calculated from theory marks only.</p>` : `
              <p>• One credit hour equals 32 clock hours.</p>
              <p>• Internal (IN) covers participation, practical/project works, community works, internship, presentations, and terminal examinations.</p>
              <p>• Theory (TH) covers written external examination.</p>`}
              <p><strong>Abbreviations:</strong> ABS = Absent, W = Withheld</p>
            </div>
            <div class="gs-footer-right">
              <p><strong>Date of Issue:</strong> ${issueDate}</p>
            </div>
          </div>
        </div>
        <script>window.onload = function() { window.print(); }</script>
      </body></html>`);
    win.document.close();
  },

  // ---- LEDGERS ----
  async renderLedger(mode) {
    const label = mode === 'marks' ? 'Mark Ledger' : mode === 'grades' ? 'Grade Ledger' : 'Grade Point Ledger';
    document.getElementById('pageContent').innerHTML = `
      <div class="filter-bar">
        <div class="form-group">
          <label>Class</label>
          <select class="form-control" id="ledgerClass" onchange="App.renderLedgerTable('${mode}')">
            ${_classOptsAll()}
          </select>
        </div>
        <div class="form-group">
          <label>Faculty</label>
          <select class="form-control" id="ledgerFaculty" onchange="App.renderLedgerTable('${mode}')">
            <option value="">All</option>
            <option value="Common">Common</option><option value="General">General</option><option value="Technical">Technical</option>
          </select>
        </div>
        <div class="form-group">
          <label>Term</label>
          <select class="form-control" id="ledgerTerm" onchange="App.renderLedgerTable('${mode}')">
            <option value="annual">Annual</option>
            <option value="term1">First Term</option>
            <option value="term2">Second Term</option>
          </select>
        </div>
        <button class="btn btn-outline" onclick="App.printLedger('${mode}')"><i class="fas fa-print"></i> Print</button>
      </div>
      <div id="ledgerTableContainer"><p class="text-muted" style="padding:20px;text-align:center;">${label} — Select class and faculty</p></div>`;
    await this.renderLedgerTable(mode);
  },

  async renderLedgerTable(mode) {
    const cls = document.getElementById('ledgerClass').value;
    const faculty = document.getElementById('ledgerFaculty').value;
    const term = document.getElementById('ledgerTerm').value;
    const container = document.getElementById('ledgerTableContainer');
    const [studentsRes, subjectsRes, marksRes, resultsRes, regRes] = await Promise.all([
      api.getStudents({ session: this.state.session }),
      api.getSubjects({}),
      api.getMarks({ session: this.state.session }),
      api.getResults({ session: this.state.session }),
      api.getSubjectRegistrations('all', this.state.session)
    ]);
    const allStudents = studentsRes.success ? studentsRes.data : [];
    const allSubjects = subjectsRes.success ? subjectsRes.data : [];
    const allMarks = marksRes.success ? marksRes.data : [];
    const allResults = resultsRes.success ? resultsRes.data : [];
    const allRegs = regRes.success ? regRes.data : [];
    const marksMap = {};
    for (const m of allMarks) {
      const et = (m.exam_type === 'annual' || !m.exam_type) ? 'final' : m.exam_type;
      if (!marksMap[m.student_id]) marksMap[m.student_id] = {};
      if (!marksMap[m.student_id][et]) marksMap[m.student_id][et] = {};
      marksMap[m.student_id][et][m.subject_id] = m;
    }
    const regMap = {};
    for (const r of allRegs) {
      if (!regMap[r.student_id]) regMap[r.student_id] = new Set();
      regMap[r.student_id].add(r.subject_id);
    }
    const resultsMap = {};
    for (const r of allResults) {
      const et = (r.exam_type === 'annual' || !r.exam_type) ? 'final' : r.exam_type;
      if (!resultsMap[r.student_id]) resultsMap[r.student_id] = {};
      resultsMap[r.student_id][et] = r;
    }
    const subjMap = {};
    for (const s of allSubjects) subjMap[s.id] = s;
    const students = allStudents.filter(s => (!cls || s.class === cls) && (!faculty || s.faculty === faculty));
    const subjects = allSubjects.filter(s => (!cls || s.class === cls) && (!faculty || s.faculty === faculty || s.faculty === 'Common'));
    subjects.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    if (!cls || !faculty || !subjects.length) {
      const label = mode === 'marks' ? 'Mark Ledger' : mode === 'grades' ? 'Grade Ledger' : 'Grade Point Ledger';
      container.innerHTML = `<p class="text-muted" style="padding:20px;text-align:center;">${label} — Select class and faculty</p>`;
      return;
    }
    const isTerm = term !== 'annual';
    const showGpa = mode !== 'marks'; // GPA column only for grades and GP ledgers
    const showGrade = false;
    const colspan = 3 + subjects.length + (showGpa ? 1 : 0) + (showGrade ? 1 : 0);
    let html = '<div style="overflow-x:auto;"><table class="marks-matrix-table"><thead>';
    // Header row 1
    html += `<tr><th rowspan="2">SN</th><th rowspan="2">Roll</th><th rowspan="2">Name</th>`;
    subjects.forEach((subj, i) => { html += `<th class="subj-col">sub${i+1}</th>`; });
    if (showGpa) html += `<th rowspan="2">GPA</th>`;
    html += '</tr>';
    // Header row 2
    html += '<tr>';
    subjects.forEach(subj => { html += `<th class="subj-code">${subj.code}</th>`; });
    html += '</tr></thead><tbody>';
    const headerLabel = mode === 'marks' ? 'Th/In' : mode === 'grades' ? 'Grade' : 'GP';
    // Get marks/results for the selected term (fallback: annual→try 'final' too)
    const getTermMarks = (sid) => {
      const sMap = marksMap[sid];
      if (!sMap) return {};
      const key = term === 'annual' ? 'final' : term;
      return sMap[key] || {};
    };
    const getTermResult = (sid) => {
      const sMap = resultsMap[sid];
      if (!sMap) return null;
      const key = term === 'annual' ? 'final' : term;
      return sMap[key] || null;
    };
    const calcLiveGpa = (sid) => {
      let totalCH = 0, weightedGP = 0;
      const tMarks = getTermMarks(sid);
      for (const subj of subjects) {
        const m = tMarks[subj.id];
        if (!m) continue;
        const ch = term === 'term1' ? parseFloat(subj.term1_credit_hours) : term === 'term2' ? parseFloat(subj.term2_credit_hours) : parseFloat(subj.credit_hours);
        const gp = parseFloat(isTerm ? m.theory_grade_point : m.grade_point) || 0;
        totalCH += ch || 1;
        weightedGP += gp * (ch || 1);
      }
      return totalCH > 0 ? Math.round((weightedGP / totalCH) * 100) / 100 : null;
    };
    students.forEach((s, si) => {
      const result = getTermResult(s.id);
      html += `<tr><td>${si+1}</td><td>${s.roll_no}</td><td style="white-space:nowrap;">${s.name}</td>`;
      subjects.forEach(subj => {
        const m = getTermMarks(s.id)[subj.id];
        if (!m) { html += '<td class="text-muted" style="text-align:center;font-size:10px;">-</td>'; return; }
        if (mode === 'marks') {
          if (isTerm) {
            html += `<td style="text-align:center;font-size:11px;">${m.theory_marks||0}</td>`;
          } else {
            html += `<td style="text-align:center;font-size:11px;">${m.theory_marks||0}<span class="text-muted">/</span>${m.practical_marks||0}</td>`;
          }
        } else if (mode === 'grades') {
          if (isTerm) {
            const tg = m.theory_grade || 'NG';
            html += `<td style="text-align:center;font-size:10px;"><span class="grade-badge grade-${tg}" style="font-size:9px;padding:2px 6px;">${tg}</span></td>`;
          } else {
            const tg = m.theory_grade || 'NG';
            const pg = m.practical_grade || 'NG';
            const fg = m.grade || 'NG';
            html += `<td style="text-align:center;font-size:10px;line-height:1.6;">
              <span class="grade-badge grade-${tg}" style="font-size:8px;padding:1px 3px;">${tg}</span>
              <span style="margin:0 1px;color:var(--text-muted);font-size:8px;">/</span>
              <span class="grade-badge grade-${pg}" style="font-size:8px;padding:1px 3px;">${pg}</span>
              <span style="margin:0 1px;color:var(--text-muted);font-size:8px;">/</span>
              <span class="grade-badge grade-${fg}" style="font-size:8px;padding:1px 3px;font-weight:700;">${fg}</span>
            </td>`;
          }
        } else {
          if (isTerm) {
            html += `<td style="text-align:center;font-size:11px;">${m.theory_grade_point || '0'}</td>`;
          } else {
            html += `<td style="text-align:center;font-size:11px;line-height:1.6;">
              <span style="font-weight:600;">${m.theory_grade_point || '0'}</span>
              <span style="margin:0 2px;color:var(--text-muted);font-size:10px;">/</span>
              <span style="font-weight:600;">${m.practical_grade_point || '0'}</span>
            </td>`;
          }
        }
      });
      if (showGpa) {
        const liveGpa = calcLiveGpa(s.id);
        const gpaVal = liveGpa != null ? liveGpa : (result != null ? result.gpa : null);
        html += `<td style="text-align:center;font-weight:600;">${gpaVal != null ? gpaVal : '-'}</td>`;
      }
      html += '</tr>';
    });
    if (!students.length) html += `<tr><td colspan="${colspan}" class="text-center text-muted">No students</td></tr>`;
    html += '</tbody></table></div>';
    container.innerHTML = html;
  },

  printLedger(mode) {
    const s = this.state.school;
    const logoHtml = s.school_logo ? `<img src="${s.school_logo}" style="height:50px;margin-bottom:4px;">` : '';
    const tableHtml = document.querySelector('#ledgerTableContainer .marks-matrix-table');
    if (!tableHtml) { this.notify('No data to print', 'warning'); return; }
    const label = mode === 'marks' ? 'Mark Ledger' : mode === 'grades' ? 'Grade Ledger' : 'Grade Point Ledger';
    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>${label} - ${this.state.session}</title>
      <style>
        body { font-family: 'Times New Roman', serif; padding: 30px; }
        .school-header { text-align:center; margin-bottom:20px; border-bottom:2px solid #000; padding-bottom:10px; }
        .school-header h1 { margin:4px 0; font-size:18px; text-transform:uppercase; }
        .school-header h2 { margin:2px 0; font-size:13px; font-weight:400; }
        .title { text-align:center; font-size:15px; font-weight:700; margin-bottom:15px; text-transform:uppercase; }
        table { width:100%; border-collapse:collapse; font-size:12px; }
        th, td { border:1px solid #333; padding:5px 7px; text-align:center; }
        th { background:#e5e7eb; }
        .footer { margin-top:25px; display:flex; justify-content:space-between; }
        .sign { text-align:center; font-size:11px; }
        .sign .line { border-top:1px solid #333; width:150px; margin-top:40px; padding-top:4px; }
        .student-list { display:none; }
      </style></head><body>
        <div class="school-header">
          ${logoHtml}
          <h1>${s.school_name || 'School Name'}</h1>
          <h2>${s.municipality || ''} | ${s.province || ''}</h2>
        </div>
        <div class="title">${label} — Session ${this.state.session}</div>
        ${tableHtml.outerHTML}
        <div class="footer">
          <div class="sign"><div class="line">Prepared By</div></div>
          <div class="sign"><div class="line">Checked By</div></div>
          <div class="sign"><div class="line">${s.head_teacher || 'Head Teacher'}</div></div>
        </div>
      </body></html>`);
    win.document.close();
    setTimeout(() => { win.print(); }, 500);
  },

  // ---- SETTINGS ----
  async renderSettings() {
    const isSuperAdmin = this.user && this.user.role === 'super_admin';
    const sesRes = await api.getSetting('current_session');
    const currentSession = sesRes.success ? sesRes.value : '';
    const s = this.state.school;
    const logoPreview = s.school_logo ? `<img src="${s.school_logo}" style="max-height:80px;max-width:160px;margin-top:8px;border:1px solid var(--border);border-radius:4px;padding:4px;">` : '<p class="text-muted" style="font-size:12px;">No logo uploaded</p>';
    document.getElementById('pageContent').innerHTML = `
      <div style="max-width:750px;">
        <div class="settings-tabs" style="display:flex;gap:2px;margin-bottom:14px;border-bottom:2px solid var(--border);flex-wrap:wrap;">
          <button class="settings-tab active" data-tab="school" onclick="App.switchSettingsTab('school')"><i class="fas fa-school"></i> School</button>
          <button class="settings-tab" data-tab="acyear" onclick="App.switchSettingsTab('acyear')"><i class="fas fa-calendar"></i> Academic Year</button>
          <button class="settings-tab" data-tab="watermark" onclick="App.switchSettingsTab('watermark')"><i class="fas fa-tint"></i> Watermark</button>
          <button class="settings-tab" data-tab="data" onclick="App.switchSettingsTab('data')"><i class="fas fa-database"></i> Data</button>
          <button class="settings-tab" data-tab="backup" onclick="App.switchSettingsTab('backup')"><i class="fas fa-cloud-upload-alt"></i> Backup</button>
          <button class="settings-tab" data-tab="roles" onclick="App.switchSettingsTab('roles')"><i class="fas fa-user-shield"></i> Roles</button>
          <button class="settings-tab" data-tab="about" onclick="App.switchSettingsTab('about')"><i class="fas fa-info-circle"></i> About</button>
        </div>

        <div id="settingsTabSchool" class="settings-panel active">
          <div class="card" style="background:var(--card);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow);">
            <h3 class="mb-2">School Profile</h3>
            <form id="schoolProfileForm" onsubmit="return App.saveSchoolProfile(event)">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="form-group"><label>School Name *</label>
                  <input class="form-control" name="school_name" value="${s.school_name||''}" required></div>
                <div class="form-group"><label>Municipality</label>
                  <input class="form-control" name="municipality" value="${s.municipality||''}"></div>
                <div class="form-group"><label>Province</label>
                  <input class="form-control" name="province" value="${s.province||''}"></div>
                <div class="form-group"><label>Established (BS)</label>
                  <input class="form-control" name="estd" value="${s.estd||''}"></div>
                <div class="form-group"><label>IEMIS ID</label>
                  <input class="form-control" name="iemis_id" value="${s.iemis_id||''}"></div>
                <div class="form-group"><label>Head Teacher</label>
                  <input class="form-control" name="head_teacher" value="${s.head_teacher||''}"></div>
                <div class="form-group"><label>Prepared By</label>
                  <input class="form-control" name="prepared_by" value="${s.prepared_by||''}"></div>
                <div class="form-group"><label>Checked By</label>
                  <input class="form-control" name="checked_by" value="${s.checked_by||''}"></div>
                <div class="form-group"><label>Final Date of Issue (BS)</label>
                  <input class="form-control" name="final_date_issue" value="${s.final_date_issue||''}"></div>
                <div class="form-group" style="grid-column:1/-1;">
                  <label>School Logo</label>
                  <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                    <input type="file" accept="image/png,image/jpeg,image/gif" id="logoInput" onchange="App.uploadLogo(event)" style="font-size:13px;">
                    ${s.school_logo ? `<button type="button" class="btn btn-sm btn-danger" onclick="App.deleteLogo()"><i class="fas fa-times"></i> Remove Logo</button>` : ''}
                  </div>
                  <div id="logoPreview">${logoPreview}</div>
                </div>
              </div>
              <div class="modal-actions" style="border:none;padding:0;margin-top:15px;">
                <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save School Profile</button>
                <button type="button" class="btn btn-outline" onclick="App.resetSchoolProfile()"><i class="fas fa-undo"></i> Reset to Defaults</button>
              </div>
            </form>
          </div>
        </div>

        <div id="settingsTabAcyear" class="settings-panel">
          <div class="card" style="background:var(--card);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow);margin-bottom:12px;">
            <h3 class="mb-2">Academic Years</h3>
            <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
              <input class="form-control" id="newAcYearExamBs" placeholder="Exam BS (e.g., 2081)" style="max-width:140px;">
              <input class="form-control" id="newAcYearExamAd" placeholder="Exam AD (e.g., 2025)" style="max-width:120px;">
              <button class="btn btn-primary" onclick="App.addAcademicYear()"><i class="fas fa-plus"></i> Add</button>
            </div>
            <div id="acYearList"></div>
          </div>
          <div class="card" style="background:var(--card);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow);">
            <h3 class="mb-2">Active Session</h3>
            <div class="form-group">
              <label>Select Active Session</label>
              <select class="form-control" id="sessionSelect"></select>
            </div>
            <button class="btn btn-primary" onclick="App.setActiveSession()"><i class="fas fa-check"></i> Set Active</button>
          </div>
        </div>

        <div id="settingsTabWatermark" class="settings-panel">
          <div class="card" style="background:var(--card);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow);">
            <h3 class="mb-2">Watermark Settings</h3>
            <p class="text-muted" style="font-size:12px;margin-bottom:10px;">Configure watermark displayed on grade sheet.</p>
            <div class="form-group">
              <label>Watermark Text</label>
              <input class="form-control" id="watermarkText" value="${s.watermark_text || s.school_name || ''}" placeholder="School name for watermark">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-top:10px;">
              <div class="form-group">
                <label>Font Size (px)</label>
                <input class="form-control" id="watermarkFontSize" type="number" min="6" max="30" value="${s.watermark_font_size || 10}" placeholder="10">
              </div>
              <div class="form-group">
                <label>Color</label>
                <input class="form-control" id="watermarkColor" type="color" value="${s.watermark_color || '#1a3a5c'}" style="height:38px;padding:3px;">
              </div>
              <div class="form-group">
                <label>Repeat Count</label>
                <input class="form-control" id="watermarkRepeat" type="number" min="10" max="999" value="${s.watermark_repeat || 200}" placeholder="200">
              </div>
              <div class="form-group">
                <label>Line Height</label>
                <input class="form-control" id="watermarkLineHeight" type="number" step="0.1" min="1" max="5" value="${s.watermark_line_height || 2.4}" placeholder="2.4">
              </div>
            </div>
            <div class="btn-group" style="margin-top:12px;">
              <button class="btn btn-primary" onclick="App.saveWatermarkSettings()"><i class="fas fa-save"></i> Save</button>
              <button class="btn btn-outline" onclick="App.resetWatermarkSettings()"><i class="fas fa-undo"></i> Reset</button>
              <button class="btn btn-danger" onclick="App.deleteWatermarkSettings()"><i class="fas fa-trash"></i> Delete</button>
            </div>
          </div>
        </div>

        <div id="settingsTabData" class="settings-panel">
          <div class="card" style="background:var(--card);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow);">
            <h3 class="mb-2">Data Management</h3>
            <div class="btn-group">
              <button class="btn btn-outline" onclick="App.exportData('full')"><i class="fas fa-download"></i> Export All Data (Excel)</button>
              <button class="btn btn-outline" onclick="App.importData()"><i class="fas fa-upload"></i> Import Students (Excel)</button>
              <button class="btn btn-warning" onclick="App.backupDatabase()"><i class="fas fa-database"></i> Backup Database</button>
            </div>
          </div>
        </div>

        <div id="settingsTabBackup" class="settings-panel">
          <div id="driveBackupContent">
            <p class="text-muted" style="font-size:13px;"><i class="fas fa-spinner fa-spin"></i> Loading backup settings...</p>
          </div>
        </div>

        <div id="settingsTabRoles" class="settings-panel">
          <div class="card" style="background:var(--card);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow);">
            <h3 class="mb-2"><i class="fas fa-user-shield"></i> Roles & Permissions</h3>
            <p class="text-muted" style="font-size:13px;margin-bottom:12px;">यस प्रणालीमा ६ वटा भूमिकाहरू (Roles) छन्। तल प्रत्येक भूमिकाको अधिकार सूचीबद्ध गरिएको छ।</p>

            ${isSuperAdmin ? `
            <div style="background:#e8f5e9;border:1px solid #a5d6a7;border-radius:6px;padding:12px;margin-bottom:16px;font-size:13px;">
              <strong style="color:#2e7d32;">👑 Super Admin</strong> — तपाईं सुपर एडमिन हुनुहुन्छ। तपाईंलाई सबै सुविधाहरूमा पूर्ण पहुँच छ।
            </div>
            ` : `
            <div style="background:#fff3e0;border:1px solid #ffcc80;border-radius:6px;padding:12px;margin-bottom:16px;font-size:13px;">
              <strong style="color:#e65100;">ℹ️ तपाईंको भूमिका: ${this.user.role}</strong> — तल तपाईंको भूमिका अनुसारको पहुँच हेर्नुहोस्।
            </div>
            `}

            ${[
              { role: 'super_admin', label: 'Super Admin', color: '#1a3a5c', permissions: [
                'सबै विद्यालयहरूको व्यवस्थापन (थप्ने, सम्पादन, मेटाउने)',
                'सबै प्रयोगकर्ताहरूको व्यवस्थापन (थप्ने, सम्पादन, मेटाउने, पासवर्ड रिसेट)',
                'सबै विद्यालयको ड्यासबोर्ड, तथ्याङ्क र रिपोर्ट हेर्ने',
                'एक विद्यालयबाट अर्कोमा स्विच गरेर काम गर्ने',
                'विद्यार्थी, शिक्षक, कर्मचारी, विषय, अङ्क, नतिजा, उपस्थिति, शुल्क, पुस्तकालय — सबै सुविधा',
                'स्याटिङ्ग, डाटा एक्सपोर्ट/इम्पोर्ट, ब्याकअप',
                'ग्रेडसिट, एडमिट कार्ड, आईडी कार्ड, ट्रान्सफर सर्टिफिकेट प्रिन्ट',
              ]},
              { role: 'school_admin', label: 'School Admin', color: '#1565c0', permissions: [
                'आफ्नो विद्यालयको प्रोफाइल व्यवस्थापन',
                'विद्यार्थी भर्ना, सम्पादन, अभिलेख, बल्क इम्पोर्ट, प्रमोशन',
                'विद्यार्थी प्रोफाइल हेर्ने (थ्री-टर्म GPA, उपस्थिति, अभिभावक जानकारी)',
                'शिक्षक र कर्मचारी दर्ता तथा व्यवस्थापन',
                'विषयहरू (Subject) थप्ने, सम्पादन, प्रिसेट लोड, टेम्प्लेट/एक्सपोर्ट/इम्पोर्ट',
                'कक्षा र सेक्सन व्यवस्थापन, कक्षा रुटिन',
                'विद्यार्थीलाई विषय दर्ता (Subject Registration)',
                'एडमिट कार्ड हेर्ने र प्रिन्ट गर्ने',
                'परीक्षा अङ्क प्रविष्ट (Term 1, Term 2, Final)',
                'नतिजा प्रशोधन (GPA, Grade, Status)',
                'मार्क लेजर, ग्रेड लेजर, GPA लेजर',
                'ग्रेडसिट, आईडी कार्ड, ट्रान्सफर सर्टिफिकेट हेर्ने/प्रिन्ट',
                'विद्यार्थी, शिक्षक उपस्थिति र रिपोर्ट',
                'शुल्क सेटअप, शुल्क संकलन, बाँकी सूची, रसिद प्रिन्ट, आय रिपोर्ट',
                'पुस्तक प्रविष्टि, पुस्तक जारी, फिर्ता, सूची',
                'प्रमाणपत्र (चरित्र, बोनाफाइड, टिसी)',
                'रिपोर्ट (विद्यार्थी, उपस्थिति, परीक्षा, शुल्क)',
                'एक्सेल डाउनलोड, डाटा एक्सपोर्ट/इम्पोर्ट',
                'स्याटिङ्ग (स्कुल प्रोफाइल, शैक्षिक सत्र, वाटरमार्क)',
              ]},
              { role: 'teacher', label: 'Teacher', color: '#2e7d32', permissions: [
                'ड्यासबोर्ड हेर्ने',
                'परीक्षा अङ्क प्रविष्ट (Marks Entry)',
                'नतिजा हेर्ने',
                'विद्यार्थी उपस्थिति हाल्ने',
              ]},
              { role: 'accountant', label: 'Accountant', color: '#e65100', permissions: [
                'ड्यासबोर्ड हेर्ने',
                'शुल्क सेटअप र शुल्क संकलन',
                'बाँकी सूची, रसिद प्रिन्ट, आय रिपोर्ट',
              ]},
              { role: 'librarian', label: 'Librarian', color: '#6a1b9a', permissions: [
                'ड्यासबोर्ड हेर्ने',
                'पुस्तक प्रविष्टि, जारी, फिर्ता, सूची',
              ]},
              { role: 'staff', label: 'Staff', color: '#c62828', permissions: [
                'ड्यासबोर्ड हेर्ने',
                'विद्यार्थी उपस्थिति हाल्ने',
                'उपस्थिति रिपोर्ट हेर्ने',
              ]},
            ].map(r => `
              <div style="margin-bottom:14px;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;">
                <div style="background:${r.color};color:#fff;padding:10px 14px;font-size:14px;font-weight:600;">${r.label}</div>
                <div style="padding:10px 14px;font-size:13px;line-height:1.7;">
                  <ul style="margin:0;padding-left:18px;">
                    ${r.permissions.map(p => `<li>${p}</li>`).join('')}
                  </ul>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div id="settingsTabAbout" class="settings-panel">
          <div class="card" style="background:var(--card);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow);">
            <h3 class="mb-2">About</h3>
            <p class="text-muted">NEB Result Management System v1.0</p>
            <p class="text-muted">Class 11 &amp; 12 - Common, General &amp; Technical</p>
            <p class="text-muted">Built with Electron + SQLite</p>
            <hr style="margin:16px 0;border-color:var(--border);">
            <div style="font-size:13px;line-height:1.8;color:var(--text);">
              <p style="font-weight:600;margin-bottom:8px;">यो सफ्टवेरले निम्न कार्यहरू गर्न सक्दछ:</p>
              <ul style="padding-left:20px;margin:0;">
                <li>विद्यालयको प्रोफाइल (नाम, ठेगाना, लोगो, IEMIS कोड, प्रमुख शिक्षक आदि) व्यवस्थापन गर्ने</li>
                <li>शैक्षिक सत्र (Academic Year) थप्ने, मेटाउने, र सक्रिय सत्र सेट गर्ने</li>
                <li>विद्यार्थीहरूको भर्ना, फोटो सहित अभिलेख राख्ने, सम्पादन र मेटाउने</li>
                <li>विषयहरू (Subject) थप्ने, प्रिसेट विषयहरू एकैपटक थप्ने, र व्यवस्थापन गर्ने</li>
                <li>विद्यार्थीहरूलाई विषयहरूमा दर्ता (Subject Registration) गर्ने</li>
                <li>परीक्षाको अङ्क (Theory &amp; Practical Marks) प्रविष्ट गर्ने र स्वतः ग्रेड गणना गर्ने</li>
                <li>विद्यार्थीको नतिजा (GPA, Grade, Status) स्वतः प्रशोधन गर्ने</li>
                <li>Mark Ledger, Grade Ledger (TH/IN/FI), GPA Ledger हेर्ने — विषय कोड अनुसार क्रमबद्ध</li>
                <li>ग्रेडसिट (Grade Sheet) छाप्ने — एकल वा सबै नतिजा एकैपटक प्रिन्ट</li>
                <li>एडमिट कार्ड (Admit Card) हेर्ने, एकल प्रिन्ट र बल्क प्रिन्ट (२ कार्ड प्रति A4 पेज)</li>
                <li>ग्रेडसिटमा विद्यालयको नाम वाटरमार्कको रूपमा देखाउने (टेक्स्ट, साइज, रङ, दोहोर्याइ अनुकूलन)</li>
                <li>ड्यासबोर्डमा तथ्याङ्क (कुल विद्यार्थी, विषय, नतिजा) र रिपोर्ट (टप ३, ग्रेड वितरण, कक्षा प्रदर्शन) हेर्ने</li>
                <li>Excel (.xlsx) मा विद्यार्थी टेम्प्लेट डाउनलोड, डाटा एक्सपोर्ट र इम्पोर्ट गर्ने</li>
                <li>सबै पेजमा पेजिनेसन (पृष्ठ क्रम) को सुविधा — १०, २५, ५०, १०० प्रति पृष्ठ</li>
                <li>साइडबारबाट शैक्षिक सत्र परिवर्तन गरेर सम्पूर्ण ड्यासबोर्ड फिल्टर गर्ने</li>
              </ul>
            </div>
            <hr style="margin:16px 0;border-color:var(--border);">
            <div style="font-size:13px;line-height:1.8;color:var(--text);">
              <p style="font-weight:600;margin-bottom:8px;">ग्रेड गणना (Marks → Grade → Grade Point → GPA):</p>
              <p style="margin:0 0 8px 0;">विद्यार्थीले प्राप्त गरेको Theory र Practical अङ्कको आधारमा NEB को पूर्णाङ्क र पासाङ्क अनुसार तलको तालिका अनुसार ग्रेड र ग्रेड प्वाइन्ट निर्धारण गरिन्छ:</p>
              <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:12px;">
                <thead><tr style="background:#1a3a5c;color:#fff;">
                  <th style="padding:4px 8px;border:1px solid var(--border);">क्र.स.</th>
                  <th style="padding:4px 8px;border:1px solid var(--border);">प्रतिशत (अन्तराल)</th>
                  <th style="padding:4px 8px;border:1px solid var(--border);">ग्रेड</th>
                  <th style="padding:4px 8px;border:1px solid var(--border);">ग्रेड प्वाइन्ट (GP)</th>
                  <th style="padding:4px 8px;border:1px solid var(--border);">विवरण</th>
                </tr></thead>
                <tbody>
                  <tr><td style="padding:4px 8px;border:1px solid var(--border);">१</td><td style="padding:4px 8px;border:1px solid var(--border);">९०% र माथि</td><td style="padding:4px 8px;border:1px solid var(--border);">A+</td><td style="padding:4px 8px;border:1px solid var(--border);">४.०</td><td style="padding:4px 8px;border:1px solid var(--border);">अति उत्कृष्ट</td></tr>
                  <tr><td style="padding:4px 8px;border:1px solid var(--border);">२</td><td style="padding:4px 8px;border:1px solid var(--border);">८०% देखि ९०% भन्दा कम</td><td style="padding:4px 8px;border:1px solid var(--border);">A</td><td style="padding:4px 8px;border:1px solid var(--border);">३.६</td><td style="padding:4px 8px;border:1px solid var(--border);">उत्कृष्ट</td></tr>
                  <tr><td style="padding:4px 8px;border:1px solid var(--border);">३</td><td style="padding:4px 8px;border:1px solid var(--border);">७०% देखि ८०% भन्दा कम</td><td style="padding:4px 8px;border:1px solid var(--border);">B+</td><td style="padding:4px 8px;border:1px solid var(--border);">३.२</td><td style="padding:4px 8px;border:1px solid var(--border);">धेरै राम्रो</td></tr>
                  <tr><td style="padding:4px 8px;border:1px solid var(--border);">४</td><td style="padding:4px 8px;border:1px solid var(--border);">६०% देखि ७०% भन्दा कम</td><td style="padding:4px 8px;border:1px solid var(--border);">B</td><td style="padding:4px 8px;border:1px solid var(--border);">२.८</td><td style="padding:4px 8px;border:1px solid var(--border);">राम्रो</td></tr>
                  <tr><td style="padding:4px 8px;border:1px solid var(--border);">५</td><td style="padding:4px 8px;border:1px solid var(--border);">५०% देखि ६०% भन्दा कम</td><td style="padding:4px 8px;border:1px solid var(--border);">C+</td><td style="padding:4px 8px;border:1px solid var(--border);">२.४</td><td style="padding:4px 8px;border:1px solid var(--border);">सन्तोषजनक</td></tr>
                  <tr><td style="padding:4px 8px;border:1px solid var(--border);">६</td><td style="padding:4px 8px;border:1px solid var(--border);">४०% देखि ५०% भन्दा कम</td><td style="padding:4px 8px;border:1px solid var(--border);">C</td><td style="padding:4px 8px;border:1px solid var(--border);">२.०</td><td style="padding:4px 8px;border:1px solid var(--border);">स्वीकार्य</td></tr>
                  <tr><td style="padding:4px 8px;border:1px solid var(--border);">७</td><td style="padding:4px 8px;border:1px solid var(--border);">३५% देखि ४०% भन्दा कम</td><td style="padding:4px 8px;border:1px solid var(--border);">D</td><td style="padding:4px 8px;border:1px solid var(--border);">१.६</td><td style="padding:4px 8px;border:1px solid var(--border);">आधारभूत</td></tr>
                  <tr><td style="padding:4px 8px;border:1px solid var(--border);">८</td><td style="padding:4px 8px;border:1px solid var(--border);">३५% भन्दा कम</td><td style="padding:4px 8px;border:1px solid var(--border);">NG</td><td style="padding:4px 8px;border:1px solid var(--border);">०.०</td><td style="padding:4px 8px;border:1px solid var(--border);">ग्रेड नभएको (Non-Graded)</td></tr>
                </tbody>
              </table>
              <p style="margin:0 0 6px 0;"><strong>हिसाब गर्ने तरिका:</strong></p>
              <ol style="padding-left:20px;margin:0 0 8px 0;">
                <li><strong>प्रतिशत निकाल्ने:</strong> <code>प्रतिशत = (प्राप्ताङ्क ÷ पूर्णाङ्क) × १००</code><br>
                  उदाहरण: Theory मा ६०/७५ → (६०÷७५)×१०० = <strong>८०%</strong> → ग्रेड <strong>A</strong> (३.६ GP)</li>
                <li><strong>Grade Point (GP) थाहा पाउने:</strong> माथिको तालिका अनुसार प्रतिशतले परेको दायरा हेरी GP लिइन्छ।<br>
                  Theory GP = ३.६, Practical GP = ४.० (यदि २२/२५ → ८८% → A+)</li>
                <li><strong>प्रत्येक विषयको Final GP निकाल्ने:</strong> Theory GP र Practical GP लाई तिनीहरूको Credit (credit_th र credit_in) को आधारमा <strong>भारित औसत (Weighted Average)</strong> निकालिन्छ।<br>
                  <code>विषयको Final GP = (Theory GP × credit_th + Practical GP × credit_in) ÷ (credit_th + credit_in)</code><br>
                  उदाहरण: Theory GP = ३.६ (credit_th=३), Practical GP = ४.० (credit_in=२)<br>
                  Final GP = (३.६×३ + ४.०×२) ÷ (३+२) = (१०.८ + ८.०) ÷ ५ = १८.८ ÷ ५ = <strong>३.७६</strong><br>
                  यो Final GP नै Grade Ledger मा <strong>FI (Final)</strong> भन्ने स्तम्भमा देखाइन्छ।</li>
                <li><strong>विषेश नोट:</strong> विद्यार्थीको Theory वा Practical कुनै एकमा पनि Pass Mark भन्दा कम भए (Fail), त्यस विषयको Final Grade <strong>NG</strong> हुन्छ र GPA मा ० GP गणना गरिन्छ।</li>
                <li><strong>Weighted Grade Point:</strong> प्रत्येक विषयको Theory GP लाई <code>credit_th</code> ले, Practical GP लाई <code>credit_in</code> ले गुणन गरी <strong>Weighted GP</strong> निकालिन्छ।<br>
                  जस्तै: Theory GP ३.६ × ३ (credit) = १०.८, Practical GP ४.० × २ (credit) = ८.०<br>
                  जम्मा Weighted GP = १०.८ + ८.० = <strong>१८.८</strong></li>
                <li><strong>GPA निकाल्ने:</strong> <code>GPA = सबै विषयको Weighted GP को योग ÷ सबै विषयको Credit Hours को योग</code><br>
                  मानौं ५ वटा विषय छन्, Weighted GP को जम्मा = ९०.२, कुल Credit Hours = २५<br>
                  GPA = ९०.२ ÷ २५ = <strong>३.६१</strong></li>
              </ol>
              <p style="margin:0;"><strong>उदाहरण (पूरै हिसाब):</strong></p>
              <table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:6px;">
                <thead><tr style="background:#1a3a5c;color:#fff;">
                  <th style="padding:3px 6px;border:1px solid var(--border);">विषय</th>
                  <th style="padding:3px 6px;border:1px solid var(--border);">Th/In</th>
                  <th style="padding:3px 6px;border:1px solid var(--border);">प्राप्ताङ्क</th>
                  <th style="padding:3px 6px;border:1px solid var(--border);">पूर्णाङ्क</th>
                  <th style="padding:3px 6px;border:1px solid var(--border);">%</th>
                  <th style="padding:3px 6px;border:1px solid var(--border);">ग्रेड</th>
                  <th style="padding:3px 6px;border:1px solid var(--border);">GP</th>
                  <th style="padding:3px 6px;border:1px solid var(--border);">Credit</th>
                  <th style="padding:3px 6px;border:1px solid var(--border);">GP×Credit</th>
                </tr></thead>
                <tbody>
                  <tr><td rowspan="2" style="padding:3px 6px;border:1px solid var(--border);">English</td><td style="padding:3px 6px;border:1px solid var(--border);">TH</td><td style="padding:3px 6px;border:1px solid var(--border);">६०</td><td style="padding:3px 6px;border:1px solid var(--border);">७५</td><td style="padding:3px 6px;border:1px solid var(--border);">८०%</td><td style="padding:3px 6px;border:1px solid var(--border);">A</td><td style="padding:3px 6px;border:1px solid var(--border);">३.६</td><td style="padding:3px 6px;border:1px solid var(--border);">३</td><td style="padding:3px 6px;border:1px solid var(--border);">१०.८</td></tr>
                  <tr><td style="padding:3px 6px;border:1px solid var(--border);">IN</td><td style="padding:3px 6px;border:1px solid var(--border);">२२</td><td style="padding:3px 6px;border:1px solid var(--border);">२५</td><td style="padding:3px 6px;border:1px solid var(--border);">८८%</td><td style="padding:3px 6px;border:1px solid var(--border);">A+</td><td style="padding:3px 6px;border:1px solid var(--border);">४.०</td><td style="padding:3px 6px;border:1px solid var(--border);">२</td><td style="padding:3px 6px;border:1px solid var(--border);">८.०</td></tr>
                  <tr><td rowspan="2" style="padding:3px 6px;border:1px solid var(--border);">Mathematics</td><td style="padding:3px 6px;border:1px solid var(--border);">TH</td><td style="padding:3px 6px;border:1px solid var(--border);">५५</td><td style="padding:3px 6px;border:1px solid var(--border);">७५</td><td style="padding:3px 6px;border:1px solid var(--border);">७३%</td><td style="padding:3px 6px;border:1px solid var(--border);">B+</td><td style="padding:3px 6px;border:1px solid var(--border);">३.२</td><td style="padding:3px 6px;border:1px solid var(--border);">३</td><td style="padding:3px 6px;border:1px solid var(--border);">९.६</td></tr>
                  <tr><td style="padding:3px 6px;border:1px solid var(--border);">IN</td><td style="padding:3px 6px;border:1px solid var(--border);">१८</td><td style="padding:3px 6px;border:1px solid var(--border);">२५</td><td style="padding:3px 6px;border:1px solid var(--border);">७२%</td><td style="padding:3px 6px;border:1px solid var(--border);">B+</td><td style="padding:3px 6px;border:1px solid var(--border);">३.२</td><td style="padding:3px 6px;border:1px solid var(--border);">२</td><td style="padding:3px 6px;border:1px solid var(--border);">६.४</td></tr>
                  <tr><td rowspan="2" style="padding:3px 6px;border:1px solid var(--border);">Science</td><td style="padding:3px 6px;border:1px solid var(--border);">TH</td><td style="padding:3px 6px;border:1px solid var(--border);">४२</td><td style="padding:3px 6px;border:1px solid var(--border);">७५</td><td style="padding:3px 6px;border:1px solid var(--border);">५६%</td><td style="padding:3px 6px;border:1px solid var(--border);">C+</td><td style="padding:3px 6px;border:1px solid var(--border);">२.४</td><td style="padding:3px 6px;border:1px solid var(--border);">३</td><td style="padding:3px 6px;border:1px solid var(--border);">७.२</td></tr>
                  <tr><td style="padding:3px 6px;border:1px solid var(--border);">IN</td><td style="padding:3px 6px;border:1px solid var(--border);">२०</td><td style="padding:3px 6px;border:1px solid var(--border);">२५</td><td style="padding:3px 6px;border:1px solid var(--border);">८०%</td><td style="padding:3px 6px;border:1px solid var(--border);">A</td><td style="padding:3px 6px;border:1px solid var(--border);">३.६</td><td style="padding:3px 6px;border:1px solid var(--border);">२</td><td style="padding:3px 6px;border:1px solid var(--border);">७.२</td></tr>
                </tbody>
                <tfoot>
                  <tr style="background:#f0f4f8;font-weight:600;">
                    <td colspan="8" style="padding:3px 6px;border:1px solid var(--border);text-align:right;">जम्मा Weighted GP ÷ कुल Credit Hours</td>
                    <td style="padding:3px 6px;border:1px solid var(--border);">४९.२ ÷ १५ = <strong>३.२८</strong></td>
                  </tr>
                </tfoot>
              </table>
              <p style="margin:8px 0 0 0;">नतिजा: GPA = <strong>३.२८</strong> → Overall Grade = <strong>B+</strong> (GPA ३.२ को दायरा ३.६ भन्दा कम तर २.८ भन्दा माथि → B+)<br>
              यदि कुनै विषयमा Theory वा Practical पासाङ्क भन्दा कम छ भने, सम्बन्धित विषयको Final Grade NG हुन्छ र GPA मा ० GP गणना गरिन्छ।</p>
            </div>
          </div>
        </div>
      </div>`;
    this.loadAcademicYears();
  },

  renderPlaceholder(page, title) {
    const icons = {
      'student-list':'school', 'student-profile':'account_circle', 'student-promotion':'trending_up', 'transfer-cert':'description', 'id-card':'badge',
      'teacher-reg':'badge', 'staff-reg':'badge', 'teacher-list':'list', 'staff-attendance':'check_circle',
      'class-manage':'menu_book', 'section-manage':'account_tree', 'class-routine':'calendar_month',
      'exam-subjects':'edit_note',
      'student-attendance':'list_alt', 'teacher-attendance':'list_alt', 'attendance-report':'bar_chart',
      'fee-setup':'payments', 'fee-collection':'credit_card', 'due-list':'list_alt', 'receipt-print':'receipt', 'income-report':'bar_chart',
      'book-entry':'library_books', 'book-issue':'bookmark', 'book-return':'bookmark_add', 'book-list':'list',
      'character-cert':'description', 'bonafide-cert':'description',
      'student-report':'bar_chart', 'exam-report':'bar_chart', 'fee-report':'bar_chart'
    };
    const iconName = icons[page] || 'settings';
    const container = document.getElementById('pageContent');
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 20px;text-align:center;">
        <span class="material-symbols-outlined" style="font-size:64px;color:var(--primary);margin-bottom:16px;">${iconName}</span>
        <h2 style="margin-bottom:8px;">${title}</h2>
        <p class="text-muted" style="max-width:400px;">यो पेज निर्माणाधीन छ। चाँडै उपलब्ध हुनेछ।</p>
      </div>`;
  },

  switchSettingsTab(tab) {
    document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
    const tabEl = document.querySelector(`.settings-tab[data-tab="${tab}"]`);
    const panelEl = document.getElementById(`settingsTab${tab.charAt(0).toUpperCase()+tab.slice(1)}`);
    if (tabEl) tabEl.classList.add('active');
    if (panelEl) panelEl.classList.add('active');
    if (tab === 'acyear') this.loadAcademicYears();
    if (tab === 'backup') this.renderDriveBackup();
  },

  async uploadLogo(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 500 * 1024) return this.notify('Logo must be under 500KB', 'warning');
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target.result;
      const res = await api.saveLogo(base64);
      if (res.success) {
        this.state.school.school_logo = base64;
        document.getElementById('logoPreview').innerHTML = `<img src="${base64}" style="max-height:80px;max-width:160px;margin-top:8px;border:1px solid var(--border);border-radius:4px;padding:4px;">`;
        this.updateSidebarProfile(this.state.school);
        this.notify('Logo uploaded');
      } else {
        this.notify('Logo upload failed', 'error');
      }
    };
    reader.readAsDataURL(file);
  },

  async deleteLogo() {
    if (!confirm('Remove school logo?')) return;
    await api.setSetting('school_logo', '');
    this.state.school.school_logo = '';
    document.getElementById('logoPreview').innerHTML = '<p class="text-muted" style="font-size:12px;">No logo uploaded</p>';
    this.updateSidebarProfile(this.state.school);
    this.notify('Logo removed');
  },

  async saveSchoolProfile(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    for (const [key, value] of Object.entries(data)) {
      await api.setSetting(key, value);
    }
    this.state.school = { ...this.state.school, ...data };
    this.updateSidebarProfile(this.state.school);
    this.notify('School profile saved');
    return false;
  },

  async resetSchoolProfile() {
    if (!confirm('Reset school profile to default values?')) return;
    const defaults = {
      school_name: 'SARASWATI JANATA SECONDARY SCHOOL',
      municipality: 'BELDANDI RURAL MUNICIPALITY - 4, KANCHANPUR',
      province: 'Sudurpashima Province',
      estd: '2017 BS',
      head_teacher: 'MAN SINGH RANA',
      iemis_id: '',
      prepared_by: '',
      checked_by: '',
      final_date_issue: '2081-03-05'
    };
    for (const [key, value] of Object.entries(defaults)) {
      await api.setSetting(key, value);
    }
    this.state.school = { ...this.state.school, ...defaults };
    this.updateSidebarProfile(this.state.school);
    await this.renderSettings();
    this.notify('School profile reset to defaults');
  },

  normalizeAcademicYears(years) {
    if (!years.length) return years;
    if (typeof years[0] === 'string') {
      return years.map(y => ({ year: y.split('/')[0], exam_bs: y.split('/')[0], exam_ad: '' }));
    }
    return years;
  },

  async loadAcademicYears() {
    const res = await api.getSetting('academic_years');
    let years = res.success && res.value ? JSON.parse(res.value) : [];
    years = this.normalizeAcademicYears(years);
    const active = this.state.session || '';
    const listEl = document.getElementById('acYearList');
    const selEl = document.getElementById('sessionSelect');
    if (listEl) {
      if (!years.length) {
        listEl.innerHTML = '<p class="text-muted" style="font-size:12px;">No academic years added yet.</p>';
      } else {
        listEl.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr><th style="text-align:left;padding:4px 6px;border-bottom:1px solid var(--border);">Year</th><th style="text-align:left;padding:4px 6px;border-bottom:1px solid var(--border);">Exam AD</th><th style="padding:4px 6px;border-bottom:1px solid var(--border);"></th></tr></thead>
          <tbody>${years.map(y => `
            <tr style="${y.year===active?'background:var(--primary-light);':''}">
              <td style="padding:4px 6px;border-bottom:1px solid var(--border);font-weight:600;">${y.year} ${y.year===active?'<span class="grade-tag" style="background:var(--primary);color:#fff;font-size:10px;">Active</span>':''}</td>
              <td style="padding:4px 6px;border-bottom:1px solid var(--border);">${y.exam_ad||'—'}</td>
              <td style="padding:4px 6px;border-bottom:1px solid var(--border);text-align:right;"><button class="btn btn-sm btn-danger" onclick="App.deleteAcademicYear('${y.year}')"><i class="fas fa-trash"></i></button></td>
            </tr>`).join('')}</tbody>
        </table>`;
      }
    }
    if (selEl) {
      selEl.innerHTML = years.map(y => `<option value="${y.year}" ${y.year===active?'selected':''}>${y.year}</option>`).join('');
      if (!years.length) selEl.innerHTML = '<option value="">— No years —</option>';
    }
    this.loadSidebarYears();
  },

  async addAcademicYear() {
    const exam_bs = document.getElementById('newAcYearExamBs').value.trim();
    const exam_ad = document.getElementById('newAcYearExamAd').value.trim();
    if (!exam_bs) return this.notify('Please enter Exam BS', 'warning');
    const year = exam_bs;
    const res = await api.getSetting('academic_years');
    let years = res.success && res.value ? JSON.parse(res.value) : [];
    years = this.normalizeAcademicYears(years);
    if (years.find(y => y.year === year)) return this.notify('Year already exists', 'warning');
    years.push({ year, exam_bs, exam_ad });
    years.sort((a, b) => a.year.localeCompare(b.year));
    await api.setSetting('academic_years', JSON.stringify(years));
    if (!this.state.session) {
      this.state.session = year;
      await api.setSetting('current_session', year);
      if (exam_bs) await api.setSetting('exam_year_bs', exam_bs);
      if (exam_ad) await api.setSetting('exam_year_ad', exam_ad);
      this.state.school.exam_year_bs = exam_bs;
      this.state.school.exam_year_ad = exam_ad;
      document.getElementById('sessionDropdown').value = year;
    }
    document.getElementById('newAcYearExamBs').value = '';
    document.getElementById('newAcYearExamAd').value = '';
    this.loadAcademicYears();
    this.notify('Academic year added');
  },

  async deleteAcademicYear(year) {
    if (!confirm(`Delete academic year "${year}"?`)) return;
    const res = await api.getSetting('academic_years');
    let years = res.success && res.value ? JSON.parse(res.value) : [];
    years = this.normalizeAcademicYears(years);
    const updated = years.filter(y => y.year !== year);
    await api.setSetting('academic_years', JSON.stringify(updated));
    if (this.state.session === year) {
      const next = updated.length ? updated[updated.length - 1] : null;
      this.state.session = next ? next.year : '';
      await api.setSetting('current_session', this.state.session);
      if (next) {
        await api.setSetting('exam_year_bs', next.exam_bs || '');
        await api.setSetting('exam_year_ad', next.exam_ad || '');
        this.state.school.exam_year_bs = next.exam_bs || '';
        this.state.school.exam_year_ad = next.exam_ad || '';
      }
      document.getElementById('sessionDropdown').value = this.state.session || '';
    }
    this.loadAcademicYears();
    this.notify('Academic year deleted');
  },

  async setActiveSession() {
    const sel = document.getElementById('sessionSelect');
    const val = sel ? sel.value : '';
    if (!val) return this.notify('Please select a session', 'warning');
    const res = await api.getSetting('academic_years');
    let years = res.success && res.value ? JSON.parse(res.value) : [];
    years = this.normalizeAcademicYears(years);
    const yearObj = years.find(y => y.year === val);
    await api.setSetting('current_session', val);
    if (yearObj) {
      if (yearObj.exam_bs) await api.setSetting('exam_year_bs', yearObj.exam_bs);
      if (yearObj.exam_ad) await api.setSetting('exam_year_ad', yearObj.exam_ad);
      this.state.school.exam_year_bs = yearObj.exam_bs || '';
      this.state.school.exam_year_ad = yearObj.exam_ad || '';
    }
    this.state.session = val;
    this.loadAcademicYears();
    this.notify(`Active session set to ${val}`);
  },

  async backupDatabase() {
    const res = await api.backup();
    if (res.success) this.notify('Backup saved: ' + res.path, 'success');
    else this.notify('Backup failed', 'error');
  },

  // ---- GOOGLE DRIVE BACKUP ----
  async renderDriveBackup() {
    const container = document.getElementById('driveBackupContent');
    container.innerHTML = '<p class="text-muted" style="font-size:13px;"><i class="fas fa-spinner fa-spin"></i> Loading...</p>';
    const status = await api.driveGetStatus();
    if (!status.success) { container.innerHTML = `<p class="text-danger">Error: ${status.error}</p>`; return; }

    const connected = status.connected;
    const email = status.email;
    const lastBackup = status.lastBackup ? new Date(status.lastBackup).toLocaleString() : 'Never';
    const autoBackup = status.autoBackup;
    const keepCount = status.keepCount;
    const history = status.history || [];
    const isSuperAdmin = status.isSuperAdmin;
    const userSchoolId = status.userSchoolId;

    // Filter history for school users: only rows with their school
    const filteredHistory = isSuperAdmin ? history : history.filter(h =>
      h.perSchoolFiles && h.perSchoolFiles.some(sf => sf.schoolId === userSchoolId)
    );

    this._backupPage = this._backupPage || 1;
    this._backupPageSize = 5;
    this._backupData = filteredHistory;
    this._isSuperAdminBackup = isSuperAdmin;
    this._userSchoolIdBackup = userSchoolId;

    // Determine interval display
    const intervalLabels = { 3600000: 'Hourly', 21600000: 'Every 6 Hours', 43200000: 'Every 12 Hours', 86400000: 'Daily', 604800000: 'Weekly' };

    container.innerHTML = `
      <div class="card" style="background:var(--card);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow);margin-bottom:12px;">
        <h3 class="mb-2"><i class="fab fa-google-drive"></i> Google Drive Backup</h3>

        ${!status.connected && !status.clientConfigured ? `
        <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:14px;margin-bottom:14px;font-size:13px;">
          <strong>⚠️ Google API Credentials Required</strong>
          <p style="margin:6px 0 0 0;">Enter your Google OAuth credentials to enable Drive backup:</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">
            <div class="form-group"><label>Client ID</label>
              <input class="form-control" id="driveClientId" value="${status.clientId||''}" placeholder="Paste Client ID here"></div>
            <div class="form-group"><label>Client Secret</label>
              <input class="form-control" id="driveClientSecret" value="" placeholder="Paste Client Secret here"></div>
          </div>
          <button class="btn btn-primary mt-2" onclick="App.saveDriveCredentials()"><i class="fas fa-save"></i> Save Credentials</button>
          <button class="btn btn-outline mt-2" onclick="api.openExternal('https://console.cloud.google.com/apis/credentials')" style="margin-left:6px;"><i class="fas fa-external-link-alt"></i> Get Credentials</button>
        </div>
        ` : ''}

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:14px;">
            <p style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">Connection</p>
            <p style="font-size:16px;font-weight:600;">
              ${connected ? `<span style="color:#059669;">●</span> Connected` : `<span style="color:#9ca3af;">○</span> Disconnected`}
              ${email ? `<span style="font-size:13px;font-weight:400;color:var(--text-muted);"> (${email})</span>` : ''}
            </p>
            ${connected ? `<button class="btn btn-sm btn-danger mt-1" onclick="App.driveDisconnect()"><i class="fas fa-unlink"></i> Disconnect</button>` : ''}
            ${!connected ? `<button class="btn btn-sm btn-primary mt-1" onclick="App.driveConnect()" ${!status.clientConfigured?'disabled':''}><i class="fas fa-link"></i> Connect Google Drive</button>` : ''}
            ${!status.clientConfigured && !connected ? '<p style="font-size:11px;color:var(--text-muted);margin-top:4px;">Save credentials above first</p>' : ''}
          </div>
          <div style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:14px;">
            <p style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">Last Backup</p>
            <p style="font-size:16px;font-weight:600;">${lastBackup}</p>
            ${connected ? `<button class="btn btn-sm btn-primary mt-1" onclick="App.driveBackupNow()"><i class="fas fa-cloud-upload-alt"></i> Backup Now</button>` : ''}
          </div>
        </div>
      </div>

      <div class="card" style="background:var(--card);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow);margin-bottom:12px;">
        <h3 class="mb-2"><i class="fas fa-clock"></i> Auto-Backup Settings</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
          <div class="form-group">
            <label>Enable Auto-Backup</label>
            <label style="display:flex;align-items:center;gap:8px;margin-top:4px;">
              <input type="checkbox" id="driveAutoBackup" ${autoBackup?'checked':''} ${!connected?'disabled':''}>
              <span style="font-size:13px;">Auto-backup enabled</span>
            </label>
          </div>
          <div class="form-group">
            <label>Frequency</label>
            <select class="form-control" id="driveInterval" ${!connected?'disabled':''}>
              ${Object.entries(intervalLabels).map(([ms, label]) =>
                `<option value="${ms}" ${status.interval==parseInt(ms)?'selected':''}>${label}</option>`
              ).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Keep Last</label>
            <select class="form-control" id="driveKeepCount" ${!connected?'disabled':''}>
              ${[5,10,15,20,30,50,100].map(n =>
                `<option value="${n}" ${keepCount==n?'selected':''}>${n} backups</option>`
              ).join('')}
            </select>
          </div>
        </div>
        ${connected ? `<button class="btn btn-primary mt-2" onclick="App.saveDriveSettings()"><i class="fas fa-save"></i> Save Settings</button>` : ''}
      </div>

      <div id="backupHistoryCard" class="card" style="background:var(--card);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow);">
        <h3 class="mb-2"><i class="fas fa-history"></i> Backup History
          <span style="font-weight:400;font-size:13px;color:var(--text-muted);" id="backupTotalCount">(${this._backupData.length} total)</span>
          ${connected ? `<button class="btn btn-xs btn-outline" onclick="App.renderDriveBackup()" style="float:right;"><i class="fas fa-sync"></i> Refresh</button>` : ''}
        </h3>
      </div>
    `;
    setTimeout(() => this.renderBackupTable(), 0);
  },

  // ---- BACKUP HISTORY TABLE WITH PAGINATION ----
  renderBackupTable() {
    const isSuperAdmin = this._isSuperAdminBackup;
    const userSchoolId = this._userSchoolIdBackup;
    const data = this._backupData || [];
    const page = this._backupPage || 1;
    const pageSize = this._backupPageSize || 5;
    const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
    if (page > totalPages) this._backupPage = totalPages;
    const start = (this._backupPage - 1) * pageSize;
    const end = start + pageSize;
    const pageData = data.slice(start, end);
    const card = document.getElementById('backupHistoryCard');
    if (!card) return;

    // Update total count
    const countEl = document.getElementById('backupTotalCount');
    if (countEl) countEl.textContent = `(${data.length} total)`;

    let html = `<h3 class="mb-2"><i class="fas fa-history"></i> Backup History
      <span style="font-weight:400;font-size:13px;color:var(--text-muted);">(${data.length} total)</span>
      <button class="btn btn-xs btn-outline" onclick="App.renderDriveBackup()" style="float:right;"><i class="fas fa-sync"></i> Refresh</button>
    </h3>`;

    if (data.length === 0) {
      html += '<p class="text-muted" style="font-size:13px;">No backups yet.</p>';
    } else {
      // Filter bar
      html += `<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
        <input class="form-control" id="backupFilterSearch" placeholder="Search by filename..." style="max-width:220px;font-size:13px;" oninput="App.filterBackupHistory()">
        <input class="form-control" id="backupFilterFrom" type="date" style="max-width:150px;font-size:13px;" onchange="App.filterBackupHistory()">
        <span style="align-self:center;font-size:12px;color:var(--text-muted);">to</span>
        <input class="form-control" id="backupFilterTo" type="date" style="max-width:150px;font-size:13px;" onchange="App.filterBackupHistory()">
        <button class="btn btn-xs btn-outline" onclick="App.clearBackupFilter()"><i class="fas fa-times"></i> Clear</button>
      </div>`;

      // Table
      if (isSuperAdmin) {
        // Super admin view: one row per backup entry (grouped)
        html += `<div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead><tr style="background:var(--bg);">
              <th style="padding:8px;border:1px solid var(--border);text-align:center;width:35px;">#</th>
              <th style="padding:8px;border:1px solid var(--border);text-align:left;">Date/Time</th>
              <th style="padding:8px;border:1px solid var(--border);text-align:left;">Full Backup</th>
              <th style="padding:8px;border:1px solid var(--border);text-align:center;width:60px;">Size</th>
              <th style="padding:8px;border:1px solid var(--border);text-align:center;width:55px;">Schools</th>
              <th style="padding:8px;border:1px solid var(--border);text-align:center;width:220px;">Actions</th>
            </tr></thead>
            <tbody id="backupHistoryBody">
              ${pageData.map((h, i) => {
                const globalIdx = start + i;
                return `<tr class="backup-row">
                  <td style="padding:8px;border:1px solid var(--border);text-align:center;color:var(--text-muted);">${globalIdx+1}</td>
                  <td style="padding:8px;border:1px solid var(--border);white-space:nowrap;" data-date="${h.timestamp.slice(0,10)}">${new Date(h.timestamp).toLocaleString()}</td>
                  <td style="padding:8px;border:1px solid var(--border);font-size:12px;word-break:break-all;">${h.fullFile ? h.fullFile.name : 'N/A'}</td>
                  <td style="padding:8px;border:1px solid var(--border);text-align:center;font-size:12px;color:var(--text-muted);">${h.size ? App.formatFileSize(h.size) : '-'}</td>
                  <td style="padding:8px;border:1px solid var(--border);text-align:center;">${h.perSchoolFiles ? h.perSchoolFiles.length : 0}</td>
                  <td style="padding:8px;border:1px solid var(--border);text-align:center;white-space:nowrap;">
                    ${h.fullFile ? `
                      <button class="btn btn-xs btn-outline" onclick="App.driveRestoreFull('${h.fullFile.id}')" title="Restore full backup"><i class="fas fa-undo"></i></button>
                      <button class="btn btn-xs btn-outline" onclick="App.driveDownloadFile('${h.fullFile.id}', '${h.fullFile.name}')" title="Download locally"><i class="fas fa-download"></i></button>
                      <button class="btn btn-xs btn-danger" onclick="App.driveDeleteBackup('${h.fullFile.id}')" title="Delete from Drive"><i class="fas fa-trash"></i></button>
                    ` : ''}
                    ${h.perSchoolFiles ? h.perSchoolFiles.map(sf =>
                      `<button class="btn btn-xs btn-outline" onclick="App.driveRestoreSchool('${sf.fileId}', ${sf.schoolId})" title="Restore school ${sf.schoolId}"><i class="fas fa-school"></i></button>`
                    ).join(' ') : ''}
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
      } else {
        // School user view: flat list — one row per per-school file
        // Filter pageData to only this school's files
        const schoolFiles = [];
        pageData.forEach(h => {
          if (h.perSchoolFiles) {
            h.perSchoolFiles.filter(sf => sf.schoolId === userSchoolId).forEach(sf => {
              schoolFiles.push({ ...sf, backupTimestamp: h.timestamp });
            });
          }
        });
        html += `<div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead><tr style="background:var(--bg);">
              <th style="padding:8px;border:1px solid var(--border);text-align:center;width:35px;">#</th>
              <th style="padding:8px;border:1px solid var(--border);text-align:left;">Date/Time</th>
              <th style="padding:8px;border:1px solid var(--border);text-align:left;">File Name</th>
              <th style="padding:8px;border:1px solid var(--border);text-align:center;width:60px;">Size</th>
              <th style="padding:8px;border:1px solid var(--border);text-align:center;width:180px;">Actions</th>
            </tr></thead>
            <tbody id="backupHistoryBody">
              ${schoolFiles.length === 0 ? '<tr><td colspan="5" style="padding:16px;text-align:center;color:var(--text-muted);">No backups for your school on this page.</td></tr>' : `
                ${schoolFiles.map((sf, i) => {
                  const globalIdx = start + 1 + i;
                  return `<tr class="backup-row">
                    <td style="padding:8px;border:1px solid var(--border);text-align:center;color:var(--text-muted);">${globalIdx}</td>
                    <td style="padding:8px;border:1px solid var(--border);white-space:nowrap;">${new Date(sf.backupTimestamp).toLocaleString()}</td>
                    <td style="padding:8px;border:1px solid var(--border);font-size:12px;word-break:break-all;">${sf.fileName || 'school.json'}</td>
                    <td style="padding:8px;border:1px solid var(--border);text-align:center;font-size:12px;color:var(--text-muted);">${sf.size ? App.formatFileSize(sf.size) : '-'}</td>
                    <td style="padding:8px;border:1px solid var(--border);text-align:center;white-space:nowrap;">
                      <button class="btn btn-xs btn-outline" onclick="App.driveRestoreSchool('${sf.fileId}', ${sf.schoolId})" title="Restore this school"><i class="fas fa-undo"></i> Restore</button>
                      <button class="btn btn-xs btn-outline" onclick="App.driveDownloadFile('${sf.fileId}', '${sf.fileName || 'school.json'}')" title="Download locally"><i class="fas fa-download"></i></button>
                      <button class="btn btn-xs btn-danger" onclick="App.driveDeleteBackup('${sf.fileId}')" title="Delete from Drive"><i class="fas fa-trash"></i></button>
                    </td>
                  </tr>`;
                }).join('')}
              `}
            </tbody>
          </table>
        </div>`;
      }

      // Pagination controls
      html += `<div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-top:14px;flex-wrap:wrap;">
        <button class="btn btn-xs btn-outline" onclick="App.backupPagePrev()" ${this._backupPage <= 1 ? 'disabled' : ''}>◀ Prev</button>`;
      // Page numbers
      const maxVisible = 5;
      let pageStart = Math.max(1, this._backupPage - Math.floor(maxVisible/2));
      let pageEnd = Math.min(totalPages, pageStart + maxVisible - 1);
      if (pageEnd - pageStart + 1 < maxVisible) pageStart = Math.max(1, pageEnd - maxVisible + 1);
      for (let p = pageStart; p <= pageEnd; p++) {
        html += `<button class="btn btn-xs ${p === this._backupPage ? 'btn-primary' : 'btn-outline'}" onclick="App.backupGoToPage(${p})">${p}</button>`;
      }
      if (pageEnd < totalPages) html += `<span style="font-size:12px;color:var(--text-muted);">...</span>`;
      html += `<button class="btn btn-xs btn-outline" onclick="App.backupPageNext()" ${this._backupPage >= totalPages ? 'disabled' : ''}>Next ▶</button>
        <span style="font-size:12px;color:var(--text-muted);margin-left:4px;">Page ${this._backupPage} of ${totalPages}</span>
      </div>`;
    }

    card.innerHTML = html;
  },

  backupPagePrev() {
    if (this._backupPage > 1) { this._backupPage--; this.renderBackupTable(); }
  },
  backupPageNext() {
    const totalPages = Math.max(1, Math.ceil((this._backupData||[]).length / (this._backupPageSize||5)));
    if (this._backupPage < totalPages) { this._backupPage++; this.renderBackupTable(); }
  },
  backupGoToPage(n) {
    this._backupPage = n;
    this.renderBackupTable();
  },
  filterBackupHistory() {
    const query = (document.getElementById('backupFilterSearch').value || '').toLowerCase();
    const fromDate = document.getElementById('backupFilterFrom').value;
    const toDate = document.getElementById('backupFilterTo').value;
    document.querySelectorAll('#backupHistoryBody .backup-row').forEach(row => {
      const cells = row.querySelectorAll('td');
      const dateText = (cells[1]?.textContent || '').toLowerCase();
      const nameText = (cells[2]?.textContent || '').toLowerCase();
      const rowDate = row.querySelector('td[data-date]')?.getAttribute('data-date') || cells[1]?.textContent?.trim() || '';
      let show = true;
      if (query && !nameText.includes(query) && !dateText.includes(query)) show = false;
      if (fromDate && rowDate < fromDate) show = false;
      if (toDate && rowDate > toDate) show = false;
      row.style.display = show ? '' : 'none';
    });
  },
  clearBackupFilter() {
    ['backupFilterSearch','backupFilterFrom','backupFilterTo'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    this.filterBackupHistory();
  },

  async saveDriveCredentials() {
    const clientId = document.getElementById('driveClientId').value.trim();
    const clientSecret = document.getElementById('driveClientSecret').value.trim();
    if (!clientId || !clientSecret) return this.notify('Please enter both Client ID and Client Secret', 'warning');
    const res = await api.driveSetSettings({ clientId, clientSecret });
    if (res.success) {
      this.notify('Credentials saved. You can now connect to Google Drive.');
      this.renderDriveBackup();
    } else {
      this.notify('Failed to save credentials', 'error');
    }
  },

  async driveConnect() {
    const res = await api.driveConnect();
    if (res.success) {
      this.notify('Connected to Google Drive!');
      this.renderDriveBackup();
    } else {
      this.notify('Connection failed: ' + (res.error || 'Unknown error'), 'error');
    }
  },

  async driveDisconnect() {
    if (!confirm('Disconnect Google Drive? Auto-backup will stop.')) return;
    await api.driveDisconnect();
    this.notify('Disconnected from Google Drive');
    this.renderDriveBackup();
  },

  async driveBackupNow() {
    const btn = document.querySelector('#driveBackupContent button[onclick*="BackupNow"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Backing up...'; }
    const res = await api.driveBackupNow();
    if (res.success) {
      this.notify('Backup complete! Full DB + ' + res.schools + ' school(s) uploaded to Google Drive.', 'success');
    } else {
      this.notify('Backup failed: ' + (res.error || 'Unknown error'), 'error');
    }
    this.renderDriveBackup();
  },

  async saveDriveSettings() {
    const autoBackup = document.getElementById('driveAutoBackup').checked;
    const intervalMs = parseInt(document.getElementById('driveInterval').value, 10);
    const keepCount = parseInt(document.getElementById('driveKeepCount').value, 10);
    await api.driveSetSettings({ autoBackup, intervalMs, keepCount });
    this.notify('Backup settings saved');
    this.renderDriveBackup();
  },

  async driveRestoreFull(fileId) {
    if (!confirm('WARNING: This will replace ALL data with the backup. App must restart. Continue?')) return;
    const res = await api.driveRestoreFull(fileId);
    if (res.success) {
      if (res.requiresRestart) {
        if (confirm('Backup downloaded. Restart now to apply?')) {
          await api.driveApplyFullRestore();
          location.reload();
        }
      } else {
        this.notify('Restore complete');
      }
    } else {
      this.notify('Restore failed: ' + (res.error || 'Unknown error'), 'error');
    }
  },

  async driveRestoreSchool(fileId, schoolId) {
    if (!confirm(`Restore data for school #${schoolId}? Current data will be replaced.`)) return;
    const res = await api.driveRestoreSchool(fileId, schoolId);
    if (res.success) {
      this.notify(`School #${schoolId} restored: ${res.imported || 0} rows imported.`, 'success');
    } else {
      this.notify('Restore failed: ' + (res.error || 'Unknown error'), 'error');
    }
  },

  // ---- BACKUP HISTORY HELPERS ----
  filterBackupHistory() {
    const query = (document.getElementById('backupFilterSearch').value || '').toLowerCase();
    const fromDate = document.getElementById('backupFilterFrom').value;
    const toDate = document.getElementById('backupFilterTo').value;
    document.querySelectorAll('#backupHistoryBody .backup-row').forEach(row => {
      const cells = row.querySelectorAll('td');
      const dateText = (cells[1]?.textContent || '').toLowerCase();
      const nameText = (cells[2]?.textContent || '').toLowerCase();
      const rowDate = row.querySelector('td[data-date]')?.getAttribute('data-date') || '';
      let show = true;
      if (query && !nameText.includes(query) && !dateText.includes(query)) show = false;
      if (fromDate && rowDate < fromDate) show = false;
      if (toDate && rowDate > toDate) show = false;
      row.style.display = show ? '' : 'none';
    });
  },

  clearBackupFilter() {
    ['backupFilterSearch','backupFilterFrom','backupFilterTo'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    this.filterBackupHistory();
  },

  async driveDeleteBackup(fileId) {
    if (!confirm('Delete this backup from Google Drive? This cannot be undone.')) return;
    const res = await api.driveDeleteFile(fileId);
    if (res.success) {
      this.notify('Backup deleted from Google Drive', 'success');
      this.renderDriveBackup();
    } else {
      this.notify('Delete failed: ' + (res.error || 'Unknown error'), 'error');
    }
  },

  async driveDownloadFile(fileId, fileName) {
    const res = await api.saveFile({
      defaultPath: fileName || 'backup.zip',
      filters: [{ name: 'All Files', extensions: ['*'] }]
    });
    if (res.canceled || !res.filePath) return;
    const dl = await api.driveDownloadFile(fileId, res.filePath);
    if (dl.success) {
      this.notify(`Downloaded: ${dl.size} bytes to ${dl.path}`, 'success');
    } else {
      this.notify('Download failed: ' + (dl.error || 'Unknown error'), 'error');
    }
  },

  formatFileSize(bytes) {
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
    return size.toFixed(1) + ' ' + units[i];
  },

  // ---- WATERMARK SETTINGS ----
  async saveWatermarkSettings() {
    const text = document.getElementById('watermarkText').value.trim();
    const size = document.getElementById('watermarkFontSize').value || '10';
    const color = document.getElementById('watermarkColor').value || '#1a3a5c';
    const repeat = document.getElementById('watermarkRepeat').value || '200';
    const lineHeight = document.getElementById('watermarkLineHeight').value || '2.4';
    await api.setSetting('watermark_text', text);
    await api.setSetting('watermark_font_size', size);
    await api.setSetting('watermark_color', color);
    await api.setSetting('watermark_repeat', repeat);
    await api.setSetting('watermark_line_height', lineHeight);
    this.state.school.watermark_text = text;
    this.state.school.watermark_font_size = size;
    this.state.school.watermark_color = color;
    this.state.school.watermark_repeat = repeat;
    this.state.school.watermark_line_height = lineHeight;
    this.notify('Watermark settings saved');
  },

  async resetWatermarkSettings() {
    if (!confirm('Reset watermark settings to defaults?')) return;
    const schoolName = this.state.school.school_name || 'School Name';
    await api.setSetting('watermark_text', schoolName);
    await api.setSetting('watermark_font_size', '10');
    await api.setSetting('watermark_color', '#1a3a5c');
    await api.setSetting('watermark_repeat', '200');
    await api.setSetting('watermark_line_height', '2.4');
    this.state.school.watermark_text = schoolName;
    this.state.school.watermark_font_size = '10';
    this.state.school.watermark_color = '#1a3a5c';
    this.state.school.watermark_repeat = '200';
    this.state.school.watermark_line_height = '2.4';
    await this.renderSettings();
    this.notify('Watermark settings reset to defaults');
  },

  async deleteWatermarkSettings() {
    if (!confirm('Delete watermark settings?')) return;
    await api.setSetting('watermark_text', '');
    await api.setSetting('watermark_font_size', '');
    await api.setSetting('watermark_color', '');
    await api.setSetting('watermark_repeat', '');
    await api.setSetting('watermark_line_height', '');
    this.state.school.watermark_text = '';
    this.state.school.watermark_font_size = '';
    this.state.school.watermark_color = '';
    this.state.school.watermark_repeat = '';
    this.state.school.watermark_line_height = '';
    await this.renderSettings();
    this.notify('Watermark cleared');
  },

  // ---- EXPORT / IMPORT ----
  rowsToObjects(rows) {
    if (!rows) return [];
    const result = Array.isArray(rows) ? rows[0] : rows;
    if (!result || !result.columns) return [];
    const cols = result.columns;
    return result.values.map(row => {
      const obj = {};
      cols.forEach((c, i) => obj[c] = row[i]);
      return obj;
    });
  },

  async exportData(type) {
    const res = await api.exportJSON(type);
    if (!res.success) return this.notify('Export failed', 'error');
    const X = XLSX;
    const raw = res.data;
    if (type === 'full') {
      const wb = X.utils.book_new();
      const sheets = { students: 'Students', subjects: 'Subjects', marks: 'Marks', results: 'Results', settings: 'Settings' };
      for (const [key, name] of Object.entries(sheets)) {
        if (raw[key]) {
          const arr = this.rowsToObjects(raw[key]);
          const ws = X.utils.json_to_sheet(arr);
          X.utils.book_append_sheet(wb, ws, name);
        }
      }
      const wbout = X.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `full-export-${this.state.session || 'data'}-${new Date().toISOString().slice(0,10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      this.notify('All data exported as Excel');
    } else {
      const arr = this.rowsToObjects(raw);
      const ws = X.utils.json_to_sheet(arr);
      const wb = X.utils.book_new();
      X.utils.book_append_sheet(wb, ws, type.charAt(0).toUpperCase() + type.slice(1));
      const wbout = X.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}-${this.state.session || 'data'}-${new Date().toISOString().slice(0,10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      this.notify(`${type} data exported as Excel`);
    }
  },

  async importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const X = XLSX;
        const data = await file.arrayBuffer();
        const wb = X.read(data, { type: 'array' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const json = X.utils.sheet_to_json(ws);
        if (!json.length) return this.notify('Excel file is empty', 'warning');
        // Map Excel columns to DB fields
        const students = json.map(row => ({
          name: String(row['Name'] || '').trim(),
          roll_no: String(row['Roll No'] || '').trim(),
          sym: String(row['SYM'] || '').trim(),
          reg: String(row['REG'] || '').trim(),
          class: String(row['Class'] || '').trim(),
          faculty: String(row['Faculty'] || '').trim(),
          gender: String(row['Gender'] || '').trim(),
          dob_bs: String(row['DOB BS'] || '').trim(),
          dob: String(row['DOB AD'] || '').trim(),
          guardian_name: String(row['Guardian Name'] || '').trim(),
          father_name: String(row['Father Name'] || '').trim(),
          mother_name: String(row['Mother Name'] || '').trim(),
          phone: String(row['Phone'] || '').trim(),
          address: String(row['Address'] || '').trim(),
          session: this.state.session,
          photo_path: ''
        }));
        let imported = 0, errors = 0;
        for (const student of students) {
          if (!student.name || !student.roll_no) { errors++; continue; }
          const res = await api.addStudent(student);
          if (res.success) imported++; else errors++;
        }
        this.notify(`Imported: ${imported} students${errors ? ', Errors: '+errors : ''}`);
        await this.renderStudents();
      } catch (err) {
        this.notify('Error reading Excel file: ' + err.message, 'error');
      }
    };
    input.click();
  },

  downloadStudentTemplate() {
    const X = XLSX;
    const headers = ['Name', 'Roll No', 'SYM', 'REG', 'Class', 'Faculty', 'Gender', 'DOB BS', 'DOB AD', 'Father Name', 'Mother Name', 'Guardian Name', 'Phone', 'Address'];
    const sample = ['John Doe', '1', '12345', '67890', '1', 'General', 'Male', '2062-01-15', '2005-04-28', 'Ram Doe', 'Sita Doe', 'Jane Doe', '9851234567', 'Kanchanpur'];
    const ws = X.utils.aoa_to_sheet([headers, sample]);
    ws['!cols'] = headers.map(() => ({ wch: 16 }));
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, ws, 'Student Template');
    const wbout = X.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'student-import-template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
    this.notify('Template downloaded');
  },

  // ---- PAGINATION HELPERS ----
  renderPagination(total, page, rowsPerPage, goFn, changeFn) {
    const totalPages = Math.ceil(total / rowsPerPage) || 1;
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:8px 0;font-size:12px;">
        <span>Showing ${total ? (page-1)*rowsPerPage+1 : 0}–${Math.min(page*rowsPerPage, total)} of ${total}</span>
        <div style="display:flex;align-items:center;gap:4px;">
          <button class="btn btn-sm btn-outline" onclick="${goFn}(${page-1})" ${page<=1?'disabled':''}>« Prev</button>
          ${Array.from({length: totalPages}, (_, i) => i+1).map(p =>
            `<button class="btn btn-sm ${p===page?'btn-primary':'btn-outline'}" onclick="${goFn}(${p})" style="min-width:28px;">${p}</button>`
          ).join('')}
          <button class="btn btn-sm btn-outline" onclick="${goFn}(${page+1})" ${page>=totalPages?'disabled':''}>Next »</button>
        </div>
        <label><select onchange="${changeFn}(this.value)" style="padding:3px 6px;border-radius:4px;border:1px solid var(--border);font-size:12px;">
          ${[10,25,50,100].map(n => `<option value="${n}" ${n==rowsPerPage?'selected':''}>${n} / page</option>`).join('')}
        </select></label>
      </div>`;
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
