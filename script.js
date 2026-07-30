const OWNERS = ['TheAdminCreator', 'Amused', 'Armaan'];
const STORAGE_KEY = 'infinite_code_users_v2';
const THEME_KEY = 'infinite_code_theme';

// ===== SUPABASE (REST API via fetch, no CDN dependency) =====
const SUPABASE_URL = 'https://viuphflhwwjsaplqcore.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpdXBoZmxod3dqc2FwbHFjb3JlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxMzc1NDAsImV4cCI6MjEwMDcxMzU0MH0.tOrv0z8990wogEGOdI_-XqyliWaAkKFJNxyywTjGrp4';

function sb(table) {
  const url = SUPABASE_URL + '/rest/v1/' + table;
  const headers = { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
  return {
    upsert: (data, conflict) => fetch(url, { method:'POST', headers:{...headers,'Prefer':'resolution=merge-duplicates'}, body:JSON.stringify(Array.isArray(data)?data:[data]) }).then(r=>r.ok?{ok:true}:Promise.reject(r.status)).catch(e=>({ok:false,error:e})),
    insert: (data) => fetch(url, { method:'POST', headers:{...headers,'Prefer':'return=representation'}, body:JSON.stringify(Array.isArray(data)?data:[data]) }).then(r=>r.ok?{ok:true}:Promise.reject(r.status)).catch(e=>({ok:false,error:e})),
    select: (match) => {
      const q = new URLSearchParams();
      for (const k of Object.keys(match||{})) q.append(k, 'eq.'+match[k]);
      return fetch(url+'?'+q.toString(), { method:'GET', headers }).then(r=>r.json()).then(data=>({ok:true,data})).catch(e=>({ok:false,error:e,data:[]}));
    },
    delete: (match) => {
      const q = new URLSearchParams();
      for (const k of Object.keys(match)) q.append(k, 'eq.'+match[k]);
      return fetch(url+'?'+q.toString(), { method:'DELETE', headers }).then(()=>({ok:true})).catch(e=>({ok:false,error:e}));
    }
  };
}

async function migrateToSupabase() {
  if (localStorage.getItem('ic_supabase_migrated')) return;
  const users = localStorage.getItem(STORAGE_KEY);
  if (users) for (const [u,p] of Object.entries(JSON.parse(users))) await sb('users').upsert({username:u,password:p},'username');
  const db = localStorage.getItem('ic_database');
  if (db) for (const e of JSON.parse(db).entries||[]) await sb('db_entries').upsert({id:e.id,command:e.command,description:e.description,tags:e.tags||[],added_by:e.addedBy||'system'},'id');
  const lo = localStorage.getItem('ic_edit_layout');
  if (lo) await sb('edit_layouts').upsert({id:1,layout:JSON.parse(lo)},'id');
  localStorage.setItem('ic_supabase_migrated','1');
}

setTimeout(migrateToSupabase, 3000);

// ===== CHAT STATE =====
let chatPartner = null;
let chatPoll = null;

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function isHashed(v) { return /^[0-9a-f]{64}$/i.test(v); }

function getUsers() {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : {};
}

function saveUsers(users) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
  for (const [u,p] of Object.entries(users)) sb('users').upsert({username:u,password:p},'username');
}

async function seedGuest() {
  const users = getUsers();
  if (!users['guest']) {
    users['guest'] = await hashPassword('guestpass');
    saveUsers(users);
  }
}
seedGuest();

let currentUser = null;

// ===== THEME =====
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  document.querySelectorAll('.theme-card').forEach(c => {
    c.classList.toggle('active', c.dataset.theme === theme);
  });
  if (currentUser) sb('themes').upsert({username:currentUser,theme},'username');
}

const savedTheme = localStorage.getItem(THEME_KEY) || 'red';
applyTheme(savedTheme);

// ===== SETTINGS TAB =====
document.querySelectorAll('.theme-card').forEach(card => {
  card.addEventListener('click', function() {
    applyTheme(this.dataset.theme);
  });
});

// ===== AUTH TOGGLE =====
document.getElementById('showSignup').addEventListener('click', function(e) {
  e.preventDefault();
  document.getElementById('loginForm').classList.add('hidden');
  document.getElementById('signupForm').classList.remove('hidden');
  document.getElementById('loginError').textContent = '';
  document.getElementById('signupError').textContent = '';
});

document.getElementById('showLogin').addEventListener('click', function(e) {
  e.preventDefault();
  document.getElementById('signupForm').classList.add('hidden');
  document.getElementById('loginForm').classList.remove('hidden');
  document.getElementById('loginError').textContent = '';
  document.getElementById('signupError').textContent = '';
});

// ===== SIGN UP =====
document.getElementById('signupForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const username = document.getElementById('newUsername').value.trim();
  const password = document.getElementById('newPassword').value.trim();
  const confirm = document.getElementById('confirmPassword').value.trim();
  const errorEl = document.getElementById('signupError');

  if (!username || !password || !confirm) {
    errorEl.textContent = 'Please fill in all fields.';
    return;
  }

  if (password !== confirm) {
    errorEl.textContent = 'Passwords do not match.';
    return;
  }

  const users = getUsers();
  if (users[username]) { errorEl.textContent = 'Username already exists.'; return; }

  const r = await sb('users').select({username});
  if (r.ok && r.data && r.data.length) { errorEl.textContent = 'Username already exists.'; return; }

  users[username] = await hashPassword(password);
  saveUsers(users);

  errorEl.textContent = '';
  errorEl.className = 'success';
  errorEl.textContent = 'Account created! You can now sign in.';
  document.getElementById('newUsername').value = '';
  document.getElementById('newPassword').value = '';
  document.getElementById('confirmPassword').value = '';

  setTimeout(() => {
    document.getElementById('signupForm').classList.add('hidden');
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('username').value = username;
    errorEl.className = 'error';
    errorEl.textContent = '';
  }, 1500);
});

// ===== GUEST =====
document.getElementById('guestBtn').addEventListener('click', async function() {
  const users = getUsers();
  if (!users['guest']) {
    const r = await sb('users').select({username:'guest'});
    if (r.ok && r.data && r.data.length) {
      const pw = r.data[0].password;
      users['guest'] = isHashed(pw) ? pw : await hashPassword(pw);
    } else {
      users['guest'] = await hashPassword('guestpass');
    }
    saveUsers(users);
  }
  currentUser = 'guest';
  enterIDE('guest');
});

// ===== LOGIN =====
document.getElementById('loginForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  const errorEl = document.getElementById('loginError');

  if (!username || !password) {
    errorEl.textContent = 'Please enter both username and password.';
    return;
  }

  let users = getUsers();
  let match = false;
  const stored = users[username];
  if (stored) {
    if (isHashed(stored)) {
      match = await hashPassword(password) === stored;
    } else {
      match = password === stored;
      if (match) { users[username] = await hashPassword(password); saveUsers(users); }
    }
  }
  if (!match) {
    const r = await sb('users').select({username});
    if (r.ok && r.data && r.data.length) {
      const supabasePw = r.data[0].password;
      if (isHashed(supabasePw)) {
        match = await hashPassword(password) === supabasePw;
      } else {
        match = password === supabasePw;
      }
      if (match) {
        users[username] = await hashPassword(password);
        saveUsers(users);
      }
    }
  }
  if (!match) {
    errorEl.textContent = 'Invalid username or password.';
    return;
  }

  errorEl.textContent = '';
  currentUser = username;
  enterIDE(username);
});

// ===== ENTER IDE =====
function enterIDE(username) {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('ide').classList.remove('hidden');


  const isOwner = OWNERS.includes(username);

  document.querySelectorAll('.owner-only').forEach(el => {
    el.style.display = isOwner ? '' : 'none';
  });

  const badge = document.getElementById('ownerBadge');
  if (isOwner) {
    badge.classList.remove('hidden');
    badge.textContent = username + ' \u2022 Owner';
  } else {
    badge.classList.add('hidden');
  }

  renderProjectList();
  switchTab('code');
}

// ===== LOGOUT =====
document.getElementById('logoutBtn').addEventListener('click', function() {
  currentUser = null;
  document.getElementById('ide').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('loginForm').classList.remove('hidden');
  document.getElementById('signupForm').classList.add('hidden');
  document.getElementById('username').value = '';
  document.getElementById('password').value = '';
  document.getElementById('newUsername').value = '';
  document.getElementById('newPassword').value = '';
  document.getElementById('confirmPassword').value = '';
  document.getElementById('loginError').textContent = '';
  document.getElementById('signupError').textContent = '';
  document.getElementById('signupError').className = 'error';
});

// ===== PROJECTS =====
function getProjectsKey() {
  return 'ic_projects_' + currentUser;
}

function getProjects() {
  const data = localStorage.getItem(getProjectsKey());
  return data ? JSON.parse(data) : [];
}

function saveProjects(projects) {
  localStorage.setItem(getProjectsKey(), JSON.stringify(projects));
  if (!currentUser) return;
  sb('projects').delete({username:currentUser});
  projects.forEach(p => sb('projects').upsert({username:currentUser,name:p.name,code:p.code||''},'username,name'));
}

let currentProject = null;

function renderProjectList() {
  const list = document.getElementById('projectList');
  const projects = getProjects();
  list.innerHTML = '';
  projects.forEach(p => {
    const item = document.createElement('div');
    item.className = 'project-item' + (currentProject && currentProject.name === p.name ? ' active' : '');
    item.innerHTML = '<span class="project-icon">&#128196;</span><span>' + p.name + '</span><button class="delete-btn" data-name="' + p.name + '">&times;</button>';
    item.addEventListener('click', function(e) {
      if (e.target.classList.contains('delete-btn')) return;
      openProject(p.name);
    });
    item.querySelector('.delete-btn').addEventListener('click', function(e) {
      e.stopPropagation();
      deleteProject(this.dataset.name);
    });
    list.appendChild(item);
  });
}

function openProject(name) {
  const projects = getProjects();
  const proj = projects.find(p => p.name === name);
  if (!proj) return;
  currentProject = proj;
  renderProjectList();
  document.getElementById('noProjectPlaceholder').classList.add('hidden');
  document.getElementById('editorInput').classList.remove('hidden');
  document.getElementById('editorSplit').classList.remove('hidden');
  let code = proj.code || '';
  if (proj.name.endsWith('.inf') && !code.startsWith('@inf\n')) code = '@inf\n' + code;
  document.getElementById('codeTextarea').value = code;
  document.getElementById('editorTabs').innerHTML = '<div class="editor-tab active">' + proj.name + '</div><button class="preview-toggle" id="previewToggle" title="Toggle Preview">&#9654; Preview</button><button class="quick-code-btn" id="quickCodeBtn" title="Quick Code">+</button><button class="console-toggle" id="consoleToggle" title="Toggle Console">&#8801; Console</button>';
  updateLineNumbers();
  updateHighlight();
  document.getElementById('previewPanel').classList.add('hidden');
  document.getElementById('previewPanel').style.background = '';
  document.getElementById('previewOutput').innerHTML = '<div class="output-placeholder">Click Run to execute your code</div>';
  document.getElementById('cmdConsole').classList.add('hidden');
  // Re-bind preview toggle
  document.getElementById('previewToggle').addEventListener('click', function() {
    const panel = document.getElementById('previewPanel');
    const isHidden = panel.classList.toggle('hidden');
    this.classList.toggle('active');
    this.innerHTML = isHidden ? '&#9654; Preview' : '&#9664; Preview';
  });
  // Re-bind console toggle
  document.getElementById('consoleToggle').addEventListener('click', function() {
    const console = document.getElementById('cmdConsole');
    console.classList.toggle('hidden');
    if (!console.classList.contains('hidden')) {
      document.getElementById('cmdConsoleInput').focus();
    }
  });
  // Re-bind quick code (+ button)
  const QC_KEY = 'ic_quickcode_' + (currentProject ? currentProject.name : 'default');
  const QC_NAME_KEY = 'ic_qcname_' + (currentProject ? currentProject.name : 'default');
  function saveQC() {
    localStorage.setItem(QC_KEY, document.getElementById('quickCodeTextarea').value);
    localStorage.setItem(QC_NAME_KEY, document.getElementById('quickCodeTitle').value);
  }
  document.getElementById('quickCodeBtn').addEventListener('click', function() {
    document.getElementById('quickCodeOverlay').classList.remove('hidden');
    document.getElementById('quickCodeTextarea').value = localStorage.getItem(QC_KEY) || '';
    document.getElementById('quickCodeTitle').value = localStorage.getItem(QC_NAME_KEY) || 'Quick Code';
    document.getElementById('quickCodeTextarea').focus();
  });
  document.getElementById('quickCodeClose').addEventListener('click', function() {
    saveQC();
    document.getElementById('quickCodeOverlay').classList.add('hidden');
  });
  document.getElementById('quickCodeTextarea').addEventListener('input', saveQC);
  document.getElementById('quickCodeTitle').addEventListener('input', saveQC);
  document.getElementById('quickCodeTitle').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); this.blur(); }
  });
  document.getElementById('quickCodeTextarea').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.getElementById('quickCodeApprove').click();
    }
  });
  document.getElementById('quickCodeApprove').addEventListener('click', function() {
    const text = document.getElementById('quickCodeTextarea').value;
    localStorage.setItem(QC_KEY, text);
    if (!text.trim()) return;
    const ta = document.getElementById('codeTextarea');
    const start = ta.selectionStart;
    const val = ta.value;
    const before = val.substring(0, start);
    const after = val.substring(ta.selectionEnd);
    const lineStart = val.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = val.indexOf('\n', start);
    const end = lineEnd >= 0 ? lineEnd : val.length;
    const beforeLine = val.substring(lineStart, end);
    const indent = beforeLine.match(/^\s*/)[0];
    ta.value = before + (start > 0 && before[before.length-1] !== '\n' ? '\n' : '') + indent + text.trim() + '\n' + after;
    ta.selectionStart = ta.selectionEnd = lineStart + indent.length + text.trim().length + 1;
    ta.focus();
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // Quick code window drag
  (function() {
    const win = document.getElementById('quickCodeWindow');
    const handle = document.getElementById('quickCodeHeader');
    let dx = 0, dy = 0;
    handle.addEventListener('mousedown', function(e) {
      if (e.target.closest('.quick-code-close')) return;
      const rect = win.getBoundingClientRect();
      win.style.transform = 'none';
      win.style.left = rect.left + 'px';
      win.style.top = rect.top + 'px';
      dx = e.clientX - rect.left;
      dy = e.clientY - rect.top;
      const onMove = function(ev) {
        win.style.left = (ev.clientX - dx) + 'px';
        win.style.top = (ev.clientY - dy) + 'px';
        win.style.right = 'auto';
        win.style.bottom = 'auto';
      };
      const onUp = function() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  })();
}

function deleteProject(name) {
  let projects = getProjects();
  projects = projects.filter(p => p.name !== name);
  saveProjects(projects);
  if (currentProject && currentProject.name === name) {
    currentProject = null;
    document.getElementById('noProjectPlaceholder').classList.remove('hidden');
    document.getElementById('editorInput').classList.add('hidden');
    document.getElementById('editorSplit').classList.add('hidden');
    document.getElementById('editorTabs').innerHTML = '';
    document.getElementById('cmdConsole').classList.add('hidden');
  }
  renderProjectList();
}

function updateLineNumbers() {
  const textarea = document.getElementById('codeTextarea');
  const lines = textarea.value.split('\n');
  const nums = document.getElementById('lineNumbers');
  nums.innerHTML = lines.map((_, i) => '<div>' + (i + 1) + '</div>').join('');
}

// ===== SYNTAX HIGHLIGHTING =====
const COMMANDS = [
  { match: '@inf', className: 'token-keyword', desc: 'required first line' },
  { match: '@background', className: 'token-command', desc: 'set preview background' },
  { match: '@text', className: 'token-command', desc: 'add colored text to preview' },
  { match: '@maths', className: 'token-maths', desc: 'maths learning commands' },
  { match: '@theology', className: 'token-theology', desc: 'theology learning commands' },
  { match: '@ecology', className: 'token-ecology', desc: 'ecology learning commands' },
  { match: '@genetics', className: 'token-genetics', desc: 'genetics learning commands' },
  { match: '@assyriology', className: 'token-assyriology', desc: 'assyriology learning commands' },
  { match: '@sinology', className: 'token-sinology', desc: 'sinology learning commands' },
  { match: '@celtology', className: 'token-celtology', desc: 'celtology learning commands' },
  { match: '@philology', className: 'token-philology', desc: 'philology learning commands' },
  { match: '@bryology', className: 'token-bryology', desc: 'bryology learning commands' },
  { match: '@dendrology', className: 'token-dendrology', desc: 'dendrology learning commands' },
  { match: '@pomology', className: 'token-pomology', desc: 'pomology learning commands' },
  { match: '@meteorology', className: 'token-meteorology', desc: 'meteorology learning commands' },
  { match: '@oceanology', className: 'token-oceanology', desc: 'oceanology learning commands' },
  { match: '@technology', className: 'token-technology', desc: 'technology learning commands' },
  { match: '@marinebiology', className: 'token-marinebiology', desc: 'marinebiology learning commands' },
  { match: '@cardiology', className: 'token-cardiology', desc: 'cardiology learning commands' },
  { match: '@neurology', className: 'token-neurology', desc: 'neurology learning commands' },
  { match: '@dermatology', className: 'token-dermatology', desc: 'dermatology learning commands' },
  { match: '@pathology', className: 'token-pathology', desc: 'pathology learning commands' },
  { match: '@generate', className: 'token-generate', desc: 'generate QR codes' },
  { match: '@switch', className: 'token-command', desc: 'switch tabs' },
];

function highlightCode(code) {
  const isHTML = currentProject && currentProject.name.endsWith('.html');
  if (isHTML) {
    return code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/(&lt;\/?[\w-]+(?:\s[^&]*?)?\/?&gt;)/g, '<span class="token-maths">$1</span>')
      .replace(/("(?:[^"&]|&amp;|&lt;|&gt;)*")/g, '<span class="token-value">$1</span>');
  }
  let html = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  html = html.replace(
    /(@project\s+(?:\[open\]|tic\s+tac\s+toe(?:\s+\/\d+)?|\[close\]))|(@\w+)|(\[#?[0-9a-fA-F]{3,8}\])/g,
    function(match, proj, cmd, val) {
      if (proj) {
        return '<span class="token-keyword">' + proj + '</span>';
      }
      if (cmd) {
        if (cmd === '@inf') {
          return '<span class="token-keyword">' + cmd + '</span>';
        }
        if (cmd === '@maths') {
          return '<span class="token-maths">' + cmd + '</span>';
        }
        if (cmd === '@theology') {
          return '<span class="token-theology">' + cmd + '</span>';
        }
        if (cmd === '@ecology') {
          return '<span class="token-ecology">' + cmd + '</span>';
        }
        if (cmd === '@genetics') {
          return '<span class="token-genetics">' + cmd + '</span>';
        }
        if (cmd === '@assyriology') {
          return '<span class="token-assyriology">' + cmd + '</span>';
        }
        if (cmd === '@sinology') {
          return '<span class="token-sinology">' + cmd + '</span>';
        }
        if (cmd === '@celtology') {
          return '<span class="token-celtology">' + cmd + '</span>';
        }
        if (cmd === '@philology') {
          return '<span class="token-philology">' + cmd + '</span>';
        }
        if (cmd === '@bryology') {
          return '<span class="token-bryology">' + cmd + '</span>';
        }
        if (cmd === '@dendrology') {
          return '<span class="token-dendrology">' + cmd + '</span>';
        }
        if (cmd === '@pomology') {
          return '<span class="token-pomology">' + cmd + '</span>';
        }
        if (cmd === '@meteorology') {
          return '<span class="token-meteorology">' + cmd + '</span>';
        }
        if (cmd === '@oceanology') {
          return '<span class="token-oceanology">' + cmd + '</span>';
        }
        if (cmd === '@technology') {
          return '<span class="token-technology">' + cmd + '</span>';
        }
        if (cmd === '@marinebiology') {
          return '<span class="token-marinebiology">' + cmd + '</span>';
        }
        if (cmd === '@cardiology') {
          return '<span class="token-cardiology">' + cmd + '</span>';
        }
        if (cmd === '@neurology') {
          return '<span class="token-neurology">' + cmd + '</span>';
        }
        if (cmd === '@dermatology') {
          return '<span class="token-dermatology">' + cmd + '</span>';
        }
        if (cmd === '@pathology') {
          return '<span class="token-pathology">' + cmd + '</span>';
        }
        if (cmd === '@generate') {
          return '<span class="token-generate">' + cmd + '</span>';
        }
        if (cmd === '@switch') {
          return '<span class="token-command">' + cmd + '</span>';
        }
        if (cmd === '@canvas') {
          return '<span class="token-maths">' + cmd + '</span>';
        }
        return '<span class="token-command">' + cmd + '</span>';
      }
      if (val) {
        return '<span class="token-value">' + val + '</span>';
      }
      return match;
    }
  );
  return html;
}

function updateHighlight() {
  const textarea = document.getElementById('codeTextarea');
  const highlight = document.getElementById('highlightCode');
  highlight.innerHTML = highlightCode(textarea.value);
}

// ===== AUTOCOMPLETE SUGGESTIONS =====
const suggestionList = [
  { label: '@inf', desc: 'required first line' },
  { label: '@background [#hex]', desc: 'set preview background' },
  { label: '@open', desc: 'open code in a new tab' },
  { label: '@open [web]', desc: 'open with a shareable blob link' },
  { label: '@open [site] (url)', desc: 'open any website in a new tab' },
  { label: '@Target shot /N "score"', desc: 'create a darts game with target score' },
  { label: '@open [crosh] (window)', desc: 'open a crosh terminal window' },
  { label: '@project [open]', desc: 'open a project' },
  { label: '@project tic tac toe', desc: 'create a tic tac toe game' },
  { label: '@project tic tac toe /', desc: 'create a tic tac toe game with a number' },
  { label: '@project [close]', desc: 'close the current project' },
  { label: '@text [color] message [set-true]', desc: 'add colored text to preview ([set-true] required)' },
  { label: '@maths [learn] (Factorization)', desc: 'show factorization rules and types' },
  { label: '@maths [learn] (Linear function)', desc: 'show linear function rules and examples' },
  { label: '@theology [learn] (subject)', desc: 'learn about theology subjects' },
  { label: '@ecology [learn] (subject)', desc: 'learn about ecology subjects' },
  { label: '@genetics [learn] (subject)', desc: 'learn about genetics subjects' },
  { label: '@assyriology [learn] (subject)', desc: 'learn about assyriology subjects' },
  { label: '@sinology [learn] (subject)', desc: 'learn about sinology subjects' },
  { label: '@celtology [learn] (subject)', desc: 'learn about celtology subjects' },
  { label: '@philology [learn] (subject)', desc: 'learn about philology subjects' },
  { label: '@bryology [learn] (subject)', desc: 'learn about bryology subjects' },
  { label: '@dendrology [learn] (subject)', desc: 'learn about dendrology subjects' },
  { label: '@pomology [learn] (subject)', desc: 'learn about pomology subjects' },
  { label: '@meteorology [learn] (subject)', desc: 'learn about meteorology subjects' },
  { label: '@oceanology [learn] (subject)', desc: 'learn about oceanology subjects' },
  { label: '@technology [learn] (subject)', desc: 'learn about technology subjects' },
  { label: '@marinebiology [learn] (subject)', desc: 'learn about marine biology subjects' },
  { label: '@cardiology [learn] (subject)', desc: 'learn about cardiology subjects' },
  { label: '@neurology [learn] (subject)', desc: 'learn about neurology subjects' },
  { label: '@dermatology [learn] (subject)', desc: 'learn about dermatology subjects' },
  { label: '@pathology [learn] (subject)', desc: 'learn about pathology subjects' },
  { label: '@generate [QR] (link:...)', desc: 'generate a QR code from a link' },
  { label: '@canvas [draw]', desc: 'open an interactive drawing canvas' },
  { label: '@switch tab [name]', desc: 'switch to a tab (code, database, run, edit, settings)' },
];

let suggestionIndex = -1;

function getCursorPixelPos() {
  const textarea = document.getElementById('codeTextarea');
  const pos = textarea.selectionStart;
  const value = textarea.value;
  const before = value.substring(0, pos);

  const mirror = document.createElement('div');
  const s = getComputedStyle(textarea);
  mirror.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;white-space:pre-wrap;word-wrap:break-word;font-size:' + s.fontSize + ';line-height:' + s.lineHeight + ';font-family:' + s.fontFamily + ';padding:8px 12px;tab-size:2;width:' + textarea.clientWidth + 'px';
  mirror.appendChild(document.createTextNode(before));
  const marker = document.createElement('span');
  marker.textContent = '|';
  mirror.appendChild(marker);
  mirror.appendChild(document.createTextNode(value.substring(pos)));
  document.body.appendChild(mirror);

  const markerRect = marker.getBoundingClientRect();
  const taRect = textarea.getBoundingClientRect();

  let x = taRect.left + markerRect.left;
  let y = taRect.top + (markerRect.top - textarea.scrollTop);

  document.body.removeChild(mirror);
  return { x: x, y: Math.max(taRect.top, y) };
}

function showSuggestions(filter) {
  const dropdown = document.getElementById('suggestionsDropdown');
  const trimmed = filter.trim();
  if (!trimmed.startsWith('@')) {
    dropdown.classList.remove('active');
    dropdown.innerHTML = '';
    suggestionIndex = -1;
    return;
  }
  const customCmds = getCC().map(function(c) {
    return { label: c.cmdLine, desc: c.description + ' (custom)' };
  });
  const filtered = suggestionList.concat(customCmds).filter(s =>
    s.label.toLowerCase().startsWith(trimmed.toLowerCase())
  );
  if (filtered.length === 0) {
    dropdown.classList.remove('active');
    dropdown.innerHTML = '';
    suggestionIndex = -1;
    return;
  }
  dropdown.innerHTML = filtered.map((s, i) =>
    '<div class="suggestion-item" data-index="' + i + '"><span class="suggestion-label">' + s.label + '</span><span class="suggestion-desc">' + s.desc + '</span></div>'
  ).join('');
  dropdown.classList.add('active');
  suggestionIndex = 0;
  dropdown.querySelectorAll('.suggestion-item')[0]?.classList.add('active');

  const pos = getCursorPixelPos();
  dropdown.style.left = pos.x + 'px';
  dropdown.style.top = (pos.y + 4) + 'px';
  return filtered;
}

function acceptSuggestion() {
  const dropdown = document.getElementById('suggestionsDropdown');
  const items = dropdown.querySelectorAll('.suggestion-item');
  if (items.length === 0) return false;
  const active = items[suggestionIndex];
  if (!active) return false;
  const label = active.querySelector('.suggestion-label')?.textContent || '';
  if (!label) return false;
  const textarea = document.getElementById('codeTextarea');
  const cursorPos = textarea.selectionStart;
  const value = textarea.value;
  const lineStart = value.lastIndexOf('\n', cursorPos - 1) + 1;
  const beforeCursor = value.substring(lineStart, cursorPos);
  const atPos = beforeCursor.lastIndexOf('@');
  const replaceStart = atPos >= 0 ? lineStart + atPos : lineStart;
  const prefixLen = cursorPos - replaceStart;
  const replacement = label;
  textarea.value = value.substring(0, replaceStart) + replacement + value.substring(cursorPos);
  textarea.selectionStart = textarea.selectionEnd = replaceStart + replacement.length;
  textarea.dispatchEvent(new Event('input'));
  dropdown.classList.remove('active');
  dropdown.innerHTML = '';
  suggestionIndex = -1;
  return true;
}

// Auto-save project code on input
document.getElementById('codeTextarea').addEventListener('input', function() {
  if (!currentProject) return;
  const projects = getProjects();
  const proj = projects.find(p => p.name === currentProject.name);
  if (proj) {
    proj.code = this.value;
    saveProjects(projects);
    currentProject.code = this.value;
  }
  updateLineNumbers();
  updateHighlight();
  showSuggestions(getCurrentWord());
});

function getCurrentWord() {
  const textarea = document.getElementById('codeTextarea');
  const cursorPos = textarea.selectionStart;
  const value = textarea.value;
  const lineStart = value.lastIndexOf('\n', cursorPos - 1) + 1;
  return value.substring(lineStart, cursorPos);
}

document.getElementById('codeTextarea').addEventListener('keydown', function(e) {
  const dropdown = document.getElementById('suggestionsDropdown');
  if (dropdown.classList.contains('active')) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const items = dropdown.querySelectorAll('.suggestion-item');
      items[suggestionIndex]?.classList.remove('active');
      suggestionIndex = Math.min(suggestionIndex + 1, items.length - 1);
      items[suggestionIndex]?.classList.add('active');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const items = dropdown.querySelectorAll('.suggestion-item');
      items[suggestionIndex]?.classList.remove('active');
      suggestionIndex = Math.max(suggestionIndex - 1, 0);
      items[suggestionIndex]?.classList.add('active');
    } else if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      acceptSuggestion();
    } else if (e.key === 'Escape') {
      dropdown.classList.remove('active');
      dropdown.innerHTML = '';
      suggestionIndex = -1;
    }
    return;
  }
  // Auto-indent on Enter
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const start = this.selectionStart;
    const value = this.value;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const currentLine = value.substring(lineStart, start);
    const indent = currentLine.match(/^\s*/)[0];
    let newIndent = indent + '  ';
    if (newIndent.length > 4) newIndent = newIndent.substring(0, 4);
    this.setRangeText('\n' + newIndent, start, this.selectionEnd, 'end');
    if (currentProject) {
      currentProject.code = this.value;
      saveProjects(getProjects().map(p => p.name === currentProject.name ? currentProject : p));
    }
    updateLineNumbers();
    updateHighlight();
    showSuggestions(getCurrentWord());
  }
  // Smart Backspace on empty indented lines
  if (e.key === 'Backspace') {
    const start = this.selectionStart;
    if (start === 0 || start !== this.selectionEnd) return;
    const value = this.value;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const before = value.substring(lineStart, start);
    const lineEnd = value.indexOf('\n', start);
    const after = value.substring(start, lineEnd >= 0 ? lineEnd : value.length);
    const fullLine = before + after;
    // Only act if the entire line is just whitespace
    if (fullLine.length > 0 && /^\s*$/.test(fullLine)) {
      const spaces = before.length;
      if (spaces >= 2) {
        e.preventDefault();
        this.setRangeText('', lineStart + spaces - 2, lineStart + spaces, 'end');
        this.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (spaces === 0) {
        e.preventDefault();
        const prevLineStart = value.lastIndexOf('\n', lineStart - 2) + 1;
        const delStart = prevLineStart || 0;
        const delEnd = lineEnd >= 0 ? lineEnd + 1 : value.length;
        this.setRangeText('', delStart, delEnd, 'end');
        this.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }
});

document.getElementById('codeTextarea').addEventListener('blur', function() {
  setTimeout(() => {
    const dropdown = document.getElementById('suggestionsDropdown');
    dropdown.classList.remove('active');
    dropdown.innerHTML = '';
    suggestionIndex = -1;
  }, 150);
});

// Click suggestion
document.getElementById('suggestionsDropdown').addEventListener('mousedown', function(e) {
  const item = e.target.closest('.suggestion-item');
  if (!item) return;
  e.preventDefault();
  const idx = parseInt(item.dataset.index, 10);
  suggestionIndex = idx;
  acceptSuggestion();
});

// Scroll sync
document.getElementById('codeTextarea').addEventListener('scroll', function() {
  const highlight = document.getElementById('editorHighlight');
  highlight.scrollTop = this.scrollTop;
  highlight.scrollLeft = this.scrollLeft;
});

// Preview toggle
document.getElementById('previewToggle').addEventListener('click', function() {
  const panel = document.getElementById('previewPanel');
  const isHidden = panel.classList.toggle('hidden');
  this.classList.toggle('active');
  this.innerHTML = isHidden ? '&#9654; Preview' : '&#9664; Preview';
});

// ===== EXECUTE CODE (shared by Run button and console) =====
function openCodeInTab() {
  const code = document.getElementById('codeTextarea').value || '';
  const output = document.getElementById('previewOutput');
  const content = output.innerHTML.replace(/<div class="output-placeholder">.*?<\/div>/, '').trim();
  let bgColor = '';
  const bgRegex = /^@background\s+\[(#?[0-9a-fA-F]{3,8})\]\s*$/;
  for (const line of code.split('\n')) {
    const m = line.trim().match(bgRegex);
    if (m) { bgColor = m[1].startsWith('#') ? m[1] : '#' + m[1]; }
  }
  const bgStyle = bgColor ? 'background:' + bgColor + ';' : '';
  const tttScript = `(function(){document.querySelectorAll('.ttt-wrap').forEach(function(g){var c=g.querySelectorAll('.ttt-cell');var s=g.querySelector('.ttt-status');var r=g.querySelector('.ttt-reset');var b=Array(9).fill(null);var p='X';var o=false;c.forEach(function(el,i){el.onclick=function(){if(b[i]||o)return;b[i]=p;el.textContent=p;el.style.color=p==='X'?'#ff4444':'#50e3c2';var w=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];for(var k=0;k<w.length;k++){if(b[w[k][0]]&&b[w[k][0]]===b[w[k][1]]&&b[w[k][1]]===b[w[k][2]]){o=true;s.textContent='Player '+b[w[k][0]]+' wins!';w[k].forEach(function(j){c[j].style.background='rgba(255,68,68,0.3)';});return;}}if(b.every(function(v){return v!==null})){o=true;s.textContent='Draw!';return;}p=p==='X'?'O':'X';s.textContent='Player '+p+\"'s turn\";};});r.onclick=function(){b=Array(9).fill(null);p='X';o=false;c.forEach(function(x){x.textContent='';x.style.background='';x.style.color='';});s.textContent=\"Player X's turn\";};});})();`;
  const dartsScript = `(function(){document.querySelectorAll('.darts-board').forEach(function(b){var w=b.closest('.darts-wrap');var id=w.dataset.target;var t=parseInt(w.dataset.score);var s=w.querySelector('.darts-status');var th=w.querySelector('.darts-throws');var sc=0,tr=0,ov=false;b.onclick=function(e){if(ov)return;var r=b.getBoundingClientRect();var x=e.clientX-r.left-r.width/2;var y=e.clientY-r.top-r.height/2;var d=Math.sqrt(x*x+y*y)/(r.width/2);var p;p=d<0.15?60:d<0.35?40:d<0.6?20:Math.floor(Math.random()*20)+1;sc+=p;tr++;var dot=document.createElement('div');dot.style.cssText='width:8px;height:8px;border-radius:50%;background:#ffd700;margin:0 1px;';th.appendChild(dot);if(sc>=t){ov=true;s.innerHTML='Bullseye! You reached '+t+' in '+tr+' throws!';}else{s.textContent='Score: '+sc+' / '+t+' (throw #'+tr+')';}};var rs=w.querySelector('.darts-reset');if(rs){rs.onclick=function(){sc=0;tr=0;ov=false;th.innerHTML='';s.textContent='Score: 0 / '+t;};}});})();`;
  const html = '<!DOCTYPE html><html><head><title>Infinite Code - Preview</title><meta charset="utf-8"><style>body{margin:0;min-height:100vh;' + bgStyle + 'display:flex;flex-direction:column;align-items:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#140a0a;color:#e8c8c8;}.output-line{padding:4px 16px;font-size:16px;}.ttt-wrap{display:flex;flex-direction:column;align-items:center;margin:12px 0;padding:16px;border-radius:10px;}.ttt-cell{cursor:pointer;}.darts-board{cursor:crosshair;}</style></head><body>' + content + '<script>' + tttScript + dartsScript + '<\/script></body></html>';
  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
  const blob = new Blob([html], { type: 'text/html' });
  return URL.createObjectURL(blob);
}

function executeCode(code, outputEl) {
  console.log('executeCode called, first 30 chars:', JSON.stringify(code.substring(0, 30)));
  outputEl.innerHTML = '';
  const previewPanel = document.getElementById('previewPanel');
  previewPanel.style.background = '';
  const isHTML = currentProject && currentProject.name.endsWith('.html');
  if (isHTML) {
    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '400px';
    iframe.style.border = 'none';
    iframe.style.borderRadius = '8px';
    iframe.style.background = '#fff';
    outputEl.appendChild(iframe);
    iframe.contentWindow.document.open();
    iframe.contentWindow.document.write(code);
    iframe.contentWindow.document.close();
    return;
  }
  if (!/^@inf\b/.test(code)) {
    outputEl.innerHTML += '<div class="output-line" style="color:#ff6b6b">&#10060; Error: Code must start with @inf (starts with: ' + JSON.stringify(code.substring(0, 20)) + ')</div>';
    return;
  }
  const lines = code.split('\n');
  const bgRegex = /^@background\s+\[(#?[0-9a-fA-F]{3,8})\]\s*$/;
  const usedNums = [];
  const usedTargets = [];
  let projectOpen = false;
  let matched = false;
  for (const line of lines) {
    const bgM = line.match(bgRegex);
    if (bgM) { 
      let c = bgM[1];
      previewPanel.style.background = c.startsWith('#') ? c : '#' + c;
      continue; 
    }
    const trimmed = line.trim();
    if (trimmed === '@open') {
      openCodeInTab();
    } else if (trimmed === '@open [web]') {
      const url = openCodeInTab();
      outputEl.innerHTML += '<div class="output-line" style="color:#50e3c2">Blob link: <a href="' + url + '" target="_blank" style="color:#50e3c2;text-decoration:underline;">' + url + '</a></div>';
      matched = true;
    } else if (/^@open\s+\[site\]\s*\((.+)\)$/i.test(trimmed)) {
      const url = trimmed.match(/^@open\s+\[site\]\s*\((.+)\)$/i)[1].trim();
      window.open(url, '_blank');
      outputEl.innerHTML += '<div class="output-line" style="color:#50e3c2">&#128279; Opened ' + url + '</div>';
      matched = true;
    } else if (trimmed === '@project [open]') {
      projectOpen = true;
    } else if (trimmed === '@project [close]') {
      projectOpen = false;
    } else if (projectOpen) {
      const tttM = trimmed.match(/^@project\s+tic\s+tac\s+toe(?:\s+\/(\d+))?$/);
      if (tttM) {
        let num = tttM[1] || String(usedNums.length + 1);
        if (usedNums.includes(num)) {
          outputEl.innerHTML += '<div class="output-line" style="color:#ff6b6b">&#10060; Error: Tic Tac Toe #' + num + ' already exists</div>';
        } else {
          usedNums.push(num);
          outputEl.innerHTML += renderTicTacToeHTML(num);
        }
        matched = true;
      }
    }
    if (trimmed.toLowerCase().startsWith('@maths [learn] (factorization)')) {
      outputEl.innerHTML += renderFactorizationHTML();
      matched = true;
    }
    if (trimmed.toLowerCase().startsWith('@maths [learn] (linear function)')) {
      outputEl.innerHTML += renderLinearFunctionHTML();
      matched = true;
    }
    if (trimmed.toLowerCase().startsWith('@theology [learn]')) {
      outputEl.innerHTML += renderTheologyHTML();
      matched = true;
    }
    if (trimmed.toLowerCase().startsWith('@ecology [learn]')) {
      outputEl.innerHTML += renderEcologyHTML();
      matched = true;
    }
    if (trimmed.toLowerCase().startsWith('@genetics [learn]')) {
      outputEl.innerHTML += renderGeneticsHTML();
      matched = true;
    }
    if (trimmed.toLowerCase().startsWith('@assyriology [learn]')) {
      outputEl.innerHTML += renderAssyriologyHTML();
      matched = true;
    }
    if (trimmed.toLowerCase().startsWith('@sinology [learn]')) {
      outputEl.innerHTML += renderSinologyHTML();
      matched = true;
    }
    if (trimmed.toLowerCase().startsWith('@celtology [learn]')) {
      outputEl.innerHTML += renderCeltologyHTML();
      matched = true;
    }
    if (trimmed.toLowerCase().startsWith('@philology [learn]')) {
      outputEl.innerHTML += renderPhilologyHTML();
      matched = true;
    }
    if (trimmed.toLowerCase().startsWith('@bryology [learn]')) {
      outputEl.innerHTML += renderBryologyHTML();
      matched = true;
    }
    if (trimmed.toLowerCase().startsWith('@dendrology [learn]')) {
      outputEl.innerHTML += renderDendrologyHTML();
      matched = true;
    }
    if (trimmed.toLowerCase().startsWith('@pomology [learn]')) {
      outputEl.innerHTML += renderPomologyHTML();
      matched = true;
    }
    if (trimmed.toLowerCase().startsWith('@meteorology [learn]')) {
      outputEl.innerHTML += renderMeteorologyHTML();
      matched = true;
    }
    if (trimmed.toLowerCase().startsWith('@oceanology [learn]')) {
      outputEl.innerHTML += renderOceanologyHTML();
      matched = true;
    }
    if (trimmed.toLowerCase().startsWith('@technology [learn]')) {
      outputEl.innerHTML += renderTechnologyHTML();
      matched = true;
    }
    if (trimmed.toLowerCase().startsWith('@marinebiology [learn]')) {
      outputEl.innerHTML += renderMarineBiologyHTML();
      matched = true;
    }
    if (trimmed.toLowerCase().startsWith('@cardiology [learn]')) {
      outputEl.innerHTML += renderCardiologyHTML();
      matched = true;
    }
    if (trimmed.toLowerCase().startsWith('@neurology [learn]')) {
      outputEl.innerHTML += renderNeurologyHTML();
      matched = true;
    }
    if (trimmed.toLowerCase().startsWith('@dermatology [learn]')) {
      outputEl.innerHTML += renderDermatologyHTML();
      matched = true;
    }
    if (trimmed.toLowerCase().startsWith('@pathology [learn]')) {
      outputEl.innerHTML += renderPathologyHTML();
      matched = true;
    }
    if (trimmed.toLowerCase().startsWith('@generate [qr]')) {
      const linkMatch = trimmed.match(/\(link:\s*([^)]+)\)/i);
      const link = linkMatch ? linkMatch[1].trim() : '';
      if (link) {
        outputEl.innerHTML += renderQRHTML(link);
        matched = true;
      }
    }
    const targetLow = trimmed.toLowerCase();
    if (targetLow.startsWith('@target shot') || targetLow.startsWith('@targetshot')) {
      const parts = trimmed.split(/\s+/);
      let score = null;
      for (const p of parts) {
        const sm = p.match(/^"(.+)"$/);
        if (sm) { score = sm[1]; break; }
      }
      if (score) {
        const id = String(usedTargets.length + 1);
        usedTargets.push(id);
        outputEl.innerHTML += renderDartsHTML(id, score);
        matched = true;
        console.log('Target shot rendered: id=' + id + ' score=' + score);
      } else {
        console.log('Target shot line parsed but no score found:', trimmed);
      }
    }
    if (trimmed.startsWith('@text') && trimmed.toLowerCase().includes('[set-true]')) {
      let rest = trimmed.replace(/^@text\s*/i, '').replace(/\s*\[set-true\]\s*/i, '').trim();
      const cMatch = rest.match(/^\[(#?[^\]]+)\]\s*(.*)$/);
      let color = '', msg = rest;
      if (cMatch) { color = cMatch[1]; msg = cMatch[2].trim(); }
      if (msg) {
        if (color) {
          const hex = color.replace(/^#/, '');
          color = /^[0-9a-f]{3,8}$/i.test(hex) ? '#' + hex : color;
        }
        const style = color ? 'color:' + color + ';' : '';
        outputEl.innerHTML += '<div class="output-line" style="' + style + '">' + msg + '</div>';
        matched = true;
      }
    }
    if (trimmed.toLowerCase() === '@canvas [draw]') {
      const canvasId = 'canvas-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      outputEl.innerHTML += renderCanvasHTML(canvasId);
      matched = true;
      setTimeout(function() { initCanvas(canvasId); }, 10);
    }
    // Handle @switch tab
    const switchM = trimmed.match(/^@switch\s+tab\s+(\w+)$/i);
    if (switchM) {
      const tabId = switchM[1].toLowerCase();
      if (document.querySelector('.topbar-tab[data-tab="' + tabId + '"]')) {
        switchTab(tabId);
        outputEl.innerHTML += '<div class="output-line" style="color:#50e3c2">&#9654; Switched to ' + tabId + ' tab</div>';
      } else {
        outputEl.innerHTML += '<div class="output-line" style="color:#ff6b6b">&#10060; Tab "' + tabId + '" not found</div>';
      }
      matched = true;
    }
    // Check custom commands
    if (checkCustomCommands(trimmed, outputEl)) matched = true;
  }
  if (!matched) {
    outputEl.innerHTML += '<div class="output-line" style="color:#888">No commands matched. Lines processed: ' + lines.length + '</div>';
  }
}

function renderTicTacToeHTML(num) {
  const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#ff4444';
  const bgCard = getComputedStyle(document.body).getPropertyValue('--bg-card').trim() || '#1f1111';
  const border = getComputedStyle(document.body).getPropertyValue('--border').trim() || '#3a1a1a';
  const bgInput = getComputedStyle(document.body).getPropertyValue('--bg-input').trim() || '#261515';
  const textSec = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim() || '#a07070';
  const grad1 = getComputedStyle(document.body).getPropertyValue('--accent-grad-1').trim() || '#cc2222';
  const grad2 = getComputedStyle(document.body).getPropertyValue('--accent-grad-2').trim() || '#ff4444';
  const glow = getComputedStyle(document.body).getPropertyValue('--accent-glow').trim() || 'rgba(255,68,68,0.3)';
  const gridId = 'ttt-grid-' + num;

  return '<div class="ttt-wrap" style="display:flex;flex-direction:column;align-items:center;margin:12px 0;padding:16px;background:' + bgCard + ';border:1px solid ' + border + ';border-radius:10px;">' +
    '<div style="font-size:15px;font-weight:600;color:' + accent + ';margin-bottom:10px;">Tic Tac Toe #' + num + '</div>' +
    '<div id="' + gridId + '" style="display:grid;grid-template-columns:repeat(3,72px);gap:4px;">' +
      Array(9).fill(0).map((_, i) =>
        '<div class="ttt-cell" data-idx="' + i + '" data-game="' + num + '" style="width:72px;height:72px;background:' + bgInput + ';border:2px solid ' + border + ';border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:bold;cursor:pointer;color:' + accent + ';"></div>'
      ).join('') +
    '</div>' +
    '<div class="ttt-status" data-game="' + num + '" style="margin-top:10px;font-size:13px;color:' + textSec + ';">Player X\'s turn</div>' +
    '<button class="ttt-reset" data-game="' + num + '" style="margin-top:8px;padding:5px 14px;background:linear-gradient(135deg,' + grad1 + ',' + grad2 + ');border:none;border-radius:5px;color:#fff;cursor:pointer;font-family:inherit;font-size:12px;">Reset</button>' +
  '</div>';
}

const RED = '#ff4444';
function renderFactorizationHTML() {
  const bgCard = getComputedStyle(document.body).getPropertyValue('--bg-card').trim() || '#1f1111';
  const border = getComputedStyle(document.body).getPropertyValue('--border').trim() || '#3a1a1a';
  const textSec = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim() || '#a07070';
  return '<div class="maths-card" style="margin:12px 0;padding:20px;background:' + bgCard + ';border:1px solid ' + border + ';border-radius:10px;max-width:600px;font-size:14px;line-height:1.7;color:#e8c8c8;">' +
    '<div style="font-size:18px;font-weight:700;color:' + RED + ';margin-bottom:14px;">Factorization Rules &amp; Types</div>' +
    '<div style="margin-bottom:12px;"><strong style="color:' + RED + ';">General Rule:</strong> Break a polynomial into factors that multiply to give the original expression.</div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + RED + ';">Four Types:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(255,68,68,0.08);border-left:3px solid ' + RED + ';border-radius:4px;">' +
      '<strong>1. Common Factor (GCF)</strong><br>' +
      '<span style="color:' + textSec + ';">Factor out the greatest common factor from all terms.<br>Example: 6x² + 9x = 3x(2x + 3)</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(255,68,68,0.08);border-left:3px solid ' + RED + ';border-radius:4px;">' +
      '<strong>2. Difference of Squares</strong><br>' +
      '<span style="color:' + textSec + ';">a² − b² = (a − b)(a + b)<br>Example: x² − 16 = (x − 4)(x + 4)</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(255,68,68,0.08);border-left:3px solid ' + RED + ';border-radius:4px;">' +
      '<strong>3. Trinomial (ax² + bx + c)</strong><br>' +
      '<span style="color:' + textSec + ';">Find two numbers that multiply to ac and add to b.<br>Example: x² + 5x + 6 = (x + 2)(x + 3)</span></div>' +
    '<div style="padding:8px 12px;background:rgba(255,68,68,0.08);border-left:3px solid ' + RED + ';border-radius:4px;">' +
      '<strong>4. Grouping</strong><br>' +
      '<span style="color:' + textSec + ';">Group terms, factor each group, then factor out the common binomial.<br>Example: x³ + 2x² + 3x + 6 = (x² + 3)(x + 2)</span></div>' +
  '</div>';
}
function renderLinearFunctionHTML() {
  const bgCard = getComputedStyle(document.body).getPropertyValue('--bg-card').trim() || '#1f1111';
  const border = getComputedStyle(document.body).getPropertyValue('--border').trim() || '#3a1a1a';
  const textSec = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim() || '#a07070';
  return '<div class="maths-card" style="margin:12px 0;padding:20px;background:' + bgCard + ';border:1px solid ' + border + ';border-radius:10px;max-width:600px;font-size:14px;line-height:1.7;color:#e8c8c8;">' +
    '<div style="font-size:18px;font-weight:700;color:' + RED + ';margin-bottom:14px;">Linear Function Rules &amp; Examples</div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + RED + ';">Standard Form:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(255,68,68,0.08);border-left:3px solid ' + RED + ';border-radius:4px;">' +
      '<strong>f(x) = mx + b</strong><br>' +
      '<span style="color:' + textSec + ';">m = slope, b = y-intercept<br>Example: f(x) = 2x + 3 → slope 2, intercept (0,3)</span></div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + RED + ';">Slope Formula:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(255,68,68,0.08);border-left:3px solid ' + RED + ';border-radius:4px;">' +
      '<strong>m = (y₂ − y₁) / (x₂ − x₁)</strong><br>' +
      '<span style="color:' + textSec + ';">Calculate slope between two points.<br>Example: (1,3) and (4,9) → m = (9−3)/(4−1) = 6/3 = 2</span></div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + RED + ';">Point-Slope Form:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(255,68,68,0.08);border-left:3px solid ' + RED + ';border-radius:4px;">' +
      '<strong>y − y₁ = m(x − x₁)</strong><br>' +
      '<span style="color:' + textSec + ';">Use when you know a point and the slope.<br>Example: slope 3 through (2,5) → y − 5 = 3(x − 2)</span></div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + RED + ';">Finding x-intercept:</div>' +
    '<div style="padding:8px 12px;background:rgba(255,68,68,0.08);border-left:3px solid ' + RED + ';border-radius:4px;">' +
      '<span style="color:' + textSec + ';">Set y = 0 and solve for x.<br>Example: 0 = 2x + 4 → x = −2 → intercept at (−2,0)</span></div>' +
  '</div>';
}

function renderTheologyHTML() {
  const bgCard = getComputedStyle(document.body).getPropertyValue('--bg-card').trim() || '#1f1111';
  const border = getComputedStyle(document.body).getPropertyValue('--border').trim() || '#3a1a1a';
  const textSec = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim() || '#a07070';
  const PURPLE = '#b388ff';
  return '<div class="maths-card" style="margin:12px 0;padding:20px;background:' + bgCard + ';border:1px solid ' + border + ';border-radius:10px;max-width:600px;font-size:14px;line-height:1.7;color:#e8c8c8;">' +
    '<div style="font-size:18px;font-weight:700;color:' + PURPLE + ';margin-bottom:14px;">Theology Overview</div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + PURPLE + ';">Definition:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(179,136,255,0.08);border-left:3px solid ' + PURPLE + ';border-radius:4px;">' +
      '<span style="color:' + textSec + ';">Theology is the systematic study of the divine, religious beliefs, and the nature of God or gods. It draws from sacred texts, tradition, reason, and experience to explore questions of faith, morality, and existence.</span></div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + PURPLE + ';">Major Branches:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(179,136,255,0.08);border-left:3px solid ' + PURPLE + ';border-radius:4px;">' +
      '<strong>1. Biblical Theology</strong><br>' +
      '<span style="color:' + textSec + ';">Study of the Bible as divine revelation, including exegesis, hermeneutics, and canon formation.</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(179,136,255,0.08);border-left:3px solid ' + PURPLE + ';border-radius:4px;">' +
      '<strong>2. Systematic Theology</strong><br>' +
      '<span style="color:' + textSec + ';">Organized presentation of Christian doctrines such as Christology, soteriology, and eschatology.</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(179,136,255,0.08);border-left:3px solid ' + PURPLE + ';border-radius:4px;">' +
      '<strong>3. Historical Theology</strong><br>' +
      '<span style="color:' + textSec + ';">Development of theological thought through church history, creeds, and councils.</span></div>' +
    '<div style="padding:8px 12px;background:rgba(179,136,255,0.08);border-left:3px solid ' + PURPLE + ';border-radius:4px;">' +
      '<strong>4. Comparative Religion</strong><br>' +
      '<span style="color:' + textSec + ';">Cross-cultural study of world religions including Islam, Judaism, Hinduism, Buddhism, and indigenous traditions.</span></div>' +
  '</div>';
}
function renderEcologyHTML() {
  const bgCard = getComputedStyle(document.body).getPropertyValue('--bg-card').trim() || '#1f1111';
  const border = getComputedStyle(document.body).getPropertyValue('--border').trim() || '#3a1a1a';
  const textSec = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim() || '#a07070';
  const GREEN = '#69f0ae';
  return '<div class="maths-card" style="margin:12px 0;padding:20px;background:' + bgCard + ';border:1px solid ' + border + ';border-radius:10px;max-width:600px;font-size:14px;line-height:1.7;color:#e8c8c8;">' +
    '<div style="font-size:18px;font-weight:700;color:' + GREEN + ';margin-bottom:14px;">Ecology Overview</div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + GREEN + ';">Definition:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(105,240,174,0.08);border-left:3px solid ' + GREEN + ';border-radius:4px;">' +
      '<span style="color:' + textSec + ';">Ecology is the study of interactions among living organisms and their physical environment. It examines how organisms adapt, compete, and coexist within ecosystems ranging from microhabitats to the entire biosphere.</span></div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + GREEN + ';">Key Concepts:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(105,240,174,0.08);border-left:3px solid ' + GREEN + ';border-radius:4px;">' +
      '<strong>1. Ecosystems</strong><br>' +
      '<span style="color:' + textSec + ';">Communities of organisms interacting with each other and their abiotic environment (water, soil, climate). Includes energy flow and nutrient cycling.</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(105,240,174,0.08);border-left:3px solid ' + GREEN + ';border-radius:4px;">' +
      '<strong>2. Food Webs &amp; Trophic Levels</strong><br>' +
      '<span style="color:' + textSec + ';">Energy transfer from producers (plants) to consumers (herbivores, carnivores) to decomposers. Only ~10% of energy passes between levels.</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(105,240,174,0.08);border-left:3px solid ' + GREEN + ';border-radius:4px;">' +
      '<strong>3. Biogeochemical Cycles</strong><br>' +
      '<span style="color:' + textSec + ';">Movement of elements like carbon, nitrogen, and phosphorus through living and non-living reservoirs — critical for sustaining life.</span></div>' +
    '<div style="padding:8px 12px;background:rgba(105,240,174,0.08);border-left:3px solid ' + GREEN + ';border-radius:4px;">' +
      '<strong>4. Biodiversity &amp; Conservation</strong><br>' +
      '<span style="color:' + textSec + ';">The variety of life at genetic, species, and ecosystem levels. Conservation biology works to protect endangered species and restore degraded habitats.</span></div>' +
  '</div>';
}
function renderGeneticsHTML() {
  const bgCard = getComputedStyle(document.body).getPropertyValue('--bg-card').trim() || '#1f1111';
  const border = getComputedStyle(document.body).getPropertyValue('--border').trim() || '#3a1a1a';
  const textSec = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim() || '#a07070';
  const TEAL = '#40c4ff';
  return '<div class="maths-card" style="margin:12px 0;padding:20px;background:' + bgCard + ';border:1px solid ' + border + ';border-radius:10px;max-width:600px;font-size:14px;line-height:1.7;color:#e8c8c8;">' +
    '<div style="font-size:18px;font-weight:700;color:' + TEAL + ';margin-bottom:14px;">Genetics Overview</div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + TEAL + ';">Definition:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(64,196,255,0.08);border-left:3px solid ' + TEAL + ';border-radius:4px;">' +
      '<span style="color:' + textSec + ';">Genetics is the study of genes, genetic variation, and heredity in living organisms. It explains how traits are passed from parents to offspring and how DNA encodes the instructions for life.</span></div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + TEAL + ';">Core Topics:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(64,196,255,0.08);border-left:3px solid ' + TEAL + ';border-radius:4px;">' +
      '<strong>1. DNA Structure &amp; Replication</strong><br>' +
      '<span style="color:' + textSec + ';">Double helix (Watson &amp; Crick) composed of nucleotides (A, T, G, C). Replication is semi-conservative, ensuring faithful copy of genetic material.</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(64,196,255,0.08);border-left:3px solid ' + TEAL + ';border-radius:4px;">' +
      '<strong>2. Mendelian Inheritance</strong><br>' +
      '<span style="color:' + textSec + ';">Gregor Mendel\'s laws of segregation and independent assortment. Dominant/recessive traits, Punnett squares, and pedigree analysis.</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(64,196,255,0.08);border-left:3px solid ' + TEAL + ';border-radius:4px;">' +
      '<strong>3. Gene Expression</strong><br>' +
      '<span style="color:' + textSec + ';">Central dogma: DNA → RNA → Protein. Transcription, translation, and regulation by promoters, enhancers, and epigenetic modifications.</span></div>' +
    '<div style="padding:8px 12px;background:rgba(64,196,255,0.08);border-left:3px solid ' + TEAL + ';border-radius:4px;">' +
      '<strong>4. Mutations &amp; Biotechnology</strong><br>' +
      '<span style="color:' + textSec + ';">Point mutations, frameshifts, and chromosomal rearrangements. CRISPR, PCR, and genetic engineering applications in medicine and agriculture.</span></div>' +
  '</div>';
}
function renderAssyriologyHTML() {
  const bgCard = getComputedStyle(document.body).getPropertyValue('--bg-card').trim() || '#1f1111';
  const border = getComputedStyle(document.body).getPropertyValue('--border').trim() || '#3a1a1a';
  const textSec = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim() || '#a07070';
  const GOLD = '#ffd740';
  return '<div class="maths-card" style="margin:12px 0;padding:20px;background:' + bgCard + ';border:1px solid ' + border + ';border-radius:10px;max-width:600px;font-size:14px;line-height:1.7;color:#e8c8c8;">' +
    '<div style="font-size:18px;font-weight:700;color:' + GOLD + ';margin-bottom:14px;">Assyriology Overview</div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + GOLD + ';">Definition:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(255,215,64,0.08);border-left:3px solid ' + GOLD + ';border-radius:4px;">' +
      '<span style="color:' + textSec + ';">Assyriology is the archaeological, historical, and linguistic study of ancient Mesopotamia (Sumer, Akkad, Assyria, Babylonia) and its cultures, covering cuneiform writing, law, literature, and art.</span></div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + GOLD + ';">Key Areas:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(255,215,64,0.08);border-left:3px solid ' + GOLD + ';border-radius:4px;">' +
      '<strong>1. Cuneiform Script</strong><br>' +
      '<span style="color:' + textSec + ';">One of the earliest writing systems, inscribed on clay tablets. Deciphered in the 19th century, it records Sumerian, Akkadian, and other languages.</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(255,215,64,0.08);border-left:3px solid ' + GOLD + ';border-radius:4px;">' +
      '<strong>2. Mesopotamian Literature</strong><br>' +
      '<span style="color:' + textSec + ';">Includes the Epic of Gilgamesh, Enuma Elish (creation myth), and legal codes such as the Code of Hammurabi.</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(255,215,64,0.08);border-left:3px solid ' + GOLD + ';border-radius:4px;">' +
      '<strong>3. History &amp; Archaeology</strong><br>' +
      '<span style="color:' + textSec + ';">Excavations of city-states like Ur, Nineveh, and Babylon reveal ziggurats, palaces, and the earliest known urban societies.</span></div>' +
    '<div style="padding:8px 12px;background:rgba(255,215,64,0.08);border-left:3px solid ' + GOLD + ';border-radius:4px;">' +
      '<strong>4. Religion &amp; Society</strong><br>' +
      '<span style="color:' + textSec + ';">Polytheistic pantheons (Anu, Enlil, Ishtar), temple economies, and the development of kingship and bureaucracy.</span></div>' +
  '</div>';
}
function renderSinologyHTML() {
  const bgCard = getComputedStyle(document.body).getPropertyValue('--bg-card').trim() || '#1f1111';
  const border = getComputedStyle(document.body).getPropertyValue('--border').trim() || '#3a1a1a';
  const textSec = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim() || '#a07070';
  const CRIMSON = '#ff5252';
  return '<div class="maths-card" style="margin:12px 0;padding:20px;background:' + bgCard + ';border:1px solid ' + border + ';border-radius:10px;max-width:600px;font-size:14px;line-height:1.7;color:#e8c8c8;">' +
    '<div style="font-size:18px;font-weight:700;color:' + CRIMSON + ';margin-bottom:14px;">Sinology Overview</div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + CRIMSON + ';">Definition:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(255,82,82,0.08);border-left:3px solid ' + CRIMSON + ';border-radius:4px;">' +
      '<span style="color:' + textSec + ';">Sinology is the academic study of China, its history, language, literature, philosophy, and culture, encompassing ancient dynasties to modern society.</span></div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + CRIMSON + ';">Key Areas:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(255,82,82,0.08);border-left:3px solid ' + CRIMSON + ';border-radius:4px;">' +
      '<strong>1. Classical Chinese Language</strong><br>' +
      '<span style="color:' + textSec + ';">Study of classical Chinese (wenyan) and its logographic writing system, including oracle bone script and modern Mandarin.</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(255,82,82,0.08);border-left:3px solid ' + CRIMSON + ';border-radius:4px;">' +
      '<strong>2. Philosophy &amp; Religion</strong><br>' +
      '<span style="color:' + textSec + ';">Confucianism, Taoism, and Buddhism in China — their texts, schools, and influence on governance and daily life.</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(255,82,82,0.08);border-left:3px solid ' + CRIMSON + ';border-radius:4px;">' +
      '<strong>3. Dynastic History</strong><br>' +
      '<span style="color:' + textSec + ';">From the Shang and Zhou to the Qing, including imperial governance, the Silk Road, and major innovations (paper, gunpowder, printing).</span></div>' +
    '<div style="padding:8px 12px;background:rgba(255,82,82,0.08);border-left:3px solid ' + CRIMSON + ';border-radius:4px;">' +
      '<strong>4. Literature &amp; Arts</strong><br>' +
      '<span style="color:' + textSec + ';">Classics like the Analects, Dao De Jing, Dream of the Red Chamber, along with calligraphy, painting, and opera traditions.</span></div>' +
  '</div>';
}
function renderCeltologyHTML() {
  const bgCard = getComputedStyle(document.body).getPropertyValue('--bg-card').trim() || '#1f1111';
  const border = getComputedStyle(document.body).getPropertyValue('--border').trim() || '#3a1a1a';
  const textSec = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim() || '#a07070';
  const EMERALD = '#00e676';
  return '<div class="maths-card" style="margin:12px 0;padding:20px;background:' + bgCard + ';border:1px solid ' + border + ';border-radius:10px;max-width:600px;font-size:14px;line-height:1.7;color:#e8c8c8;">' +
    '<div style="font-size:18px;font-weight:700;color:' + EMERALD + ';margin-bottom:14px;">Celtology Overview</div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + EMERALD + ';">Definition:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(0,230,118,0.08);border-left:3px solid ' + EMERALD + ';border-radius:4px;">' +
      '<span style="color:' + textSec + ';">Celtology is the study of the Celtic peoples, their languages, literature, art, archaeology, and history, spanning from ancient Gaul and Britain to modern Celtic nations.</span></div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + EMERALD + ';">Key Areas:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(0,230,118,0.08);border-left:3px solid ' + EMERALD + ';border-radius:4px;">' +
      '<strong>1. Celtic Languages</strong><br>' +
      '<span style="color:' + textSec + ';">Two branches: Goidelic (Irish, Scottish Gaelic, Manx) and Brythonic (Welsh, Cornish, Breton). Ogham script and early manuscript tradition.</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(0,230,118,0.08);border-left:3px solid ' + EMERALD + ';border-radius:4px;">' +
      '<strong>2. Mythology &amp; Folklore</strong><br>' +
      '<span style="color:' + textSec + ';">The Mabinogion, Ulster Cycle, Tuatha Dé Danann, and figures like Cú Chulainn and King Arthur (Celtic origins).</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(0,230,118,0.08);border-left:3px solid ' + EMERALD + ';border-radius:4px;">' +
      '<strong>3. La Tène &amp; Hallstatt Cultures</strong><br>' +
      '<span style="color:' + textSec + ';">Iron Age archaeological cultures known for intricate metalwork, chariot burials, and hillforts across Europe.</span></div>' +
    '<div style="padding:8px 12px;background:rgba(0,230,118,0.08);border-left:3px solid ' + EMERALD + ';border-radius:4px;">' +
      '<strong>4. Modern Celtic Revival</strong><br>' +
      '<span style="color:' + textSec + ';">19th–20th century revival of Celtic identity, language preservation efforts, and cultural festivals (eisteddfod, feis).</span></div>' +
  '</div>';
}
function renderPhilologyHTML() {
  const bgCard = getComputedStyle(document.body).getPropertyValue('--bg-card').trim() || '#1f1111';
  const border = getComputedStyle(document.body).getPropertyValue('--border').trim() || '#3a1a1a';
  const textSec = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim() || '#a07070';
  const CORAL = '#ff6e40';
  return '<div class="maths-card" style="margin:12px 0;padding:20px;background:' + bgCard + ';border:1px solid ' + border + ';border-radius:10px;max-width:600px;font-size:14px;line-height:1.7;color:#e8c8c8;">' +
    '<div style="font-size:18px;font-weight:700;color:' + CORAL + ';margin-bottom:14px;">Philology Overview</div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + CORAL + ';">Definition:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(255,110,64,0.08);border-left:3px solid ' + CORAL + ';border-radius:4px;">' +
      '<span style="color:' + textSec + ';">Philology is the study of language in written historical sources, combining literary criticism, history, and linguistics to establish text authenticity and meaning.</span></div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + CORAL + ';">Key Areas:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(255,110,64,0.08);border-left:3px solid ' + CORAL + ';border-radius:4px;">' +
      '<strong>1. Textual Criticism</strong><br>' +
      '<span style="color:' + textSec + ';">Reconstructing original texts from variant manuscripts using stemmatics, eclecticism, and editorial principles.</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(255,110,64,0.08);border-left:3px solid ' + CORAL + ';border-radius:4px;">' +
      '<strong>2. Historical Linguistics</strong><br>' +
      '<span style="color:' + textSec + ';">Tracing language change over time, sound laws (Grimm\'s Law), reconstruction of proto-languages (PIE), and etymology.</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(255,110,64,0.08);border-left:3px solid ' + CORAL + ';border-radius:4px;">' +
      '<strong>3. Paleography &amp; Codicology</strong><br>' +
      '<span style="color:' + textSec + ';">Study of ancient handwriting, manuscript production, scripts (uncial, minuscule), and dating of documents.</span></div>' +
    '<div style="padding:8px 12px;background:rgba(255,110,64,0.08);border-left:3px solid ' + CORAL + ';border-radius:4px;">' +
      '<strong>4. Comparative Philology</strong><br>' +
      '<span style="color:' + textSec + ';">Comparing related languages to understand their development, e.g., Indo-European, Semitic, and Uralic language families.</span></div>' +
  '</div>';
}
function renderBryologyHTML() {
  const bgCard = getComputedStyle(document.body).getPropertyValue('--bg-card').trim() || '#1f1111';
  const border = getComputedStyle(document.body).getPropertyValue('--border').trim() || '#3a1a1a';
  const textSec = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim() || '#a07070';
  const MOSS = '#8bc34a';
  return '<div class="maths-card" style="margin:12px 0;padding:20px;background:' + bgCard + ';border:1px solid ' + border + ';border-radius:10px;max-width:600px;font-size:14px;line-height:1.7;color:#e8c8c8;">' +
    '<div style="font-size:18px;font-weight:700;color:' + MOSS + ';margin-bottom:14px;">Bryology Overview</div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + MOSS + ';">Definition:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(139,195,74,0.08);border-left:3px solid ' + MOSS + ';border-radius:4px;">' +
      '<span style="color:' + textSec + ';">Bryology is the branch of botany concerned with the study of bryophytes — mosses, liverworts, and hornworts — non-vascular plants that play crucial roles in ecosystems.</span></div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + MOSS + ';">Key Areas:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(139,195,74,0.08);border-left:3px solid ' + MOSS + ';border-radius:4px;">' +
      '<strong>1. Mosses (Bryophyta)</strong><br>' +
      '<span style="color:' + textSec + ';">Over 12,000 species. They lack true vascular tissue, reproduce via spores, and have a gametophyte-dominant life cycle.</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(139,195,74,0.08);border-left:3px solid ' + MOSS + ';border-radius:4px;">' +
      '<strong>2. Liverworts (Marchantiophyta)</strong><br>' +
      '<span style="color:' + textSec + ';">About 9,000 species. Thalloid or leafy forms, often with oil bodies and unique asexual reproduction via gemmae.</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(139,195,74,0.08);border-left:3px solid ' + MOSS + ';border-radius:4px;">' +
      '<strong>3. Hornworts (Anthocerotophyta)</strong><br>' +
      '<span style="color:' + textSec + ';">Small group (~200 species) with horn-like sporophytes. Notable for having a single large chloroplast per cell.</span></div>' +
    '<div style="padding:8px 12px;background:rgba(139,195,74,0.08);border-left:3px solid ' + MOSS + ';border-radius:4px;">' +
      '<strong>4. Ecological Roles</strong><br>' +
      '<span style="color:' + textSec + ';">Pioneer species in succession, water retention in peatlands (Sphagnum), nitrogen fixation, and bioindicators of air quality.</span></div>' +
  '</div>';
}
function renderDendrologyHTML() {
  const bgCard = getComputedStyle(document.body).getPropertyValue('--bg-card').trim() || '#1f1111';
  const border = getComputedStyle(document.body).getPropertyValue('--border').trim() || '#3a1a1a';
  const textSec = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim() || '#a07070';
  const FOREST = '#2e7d32';
  return '<div class="maths-card" style="margin:12px 0;padding:20px;background:' + bgCard + ';border:1px solid ' + border + ';border-radius:10px;max-width:600px;font-size:14px;line-height:1.7;color:#e8c8c8;">' +
    '<div style="font-size:18px;font-weight:700;color:' + FOREST + ';margin-bottom:14px;">Dendrology Overview</div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + FOREST + ';">Definition:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(46,125,50,0.08);border-left:3px solid ' + FOREST + ';border-radius:4px;">' +
      '<span style="color:' + textSec + ';">Dendrology is the study of woody plants — trees, shrubs, and lianas — focusing on their identification, taxonomy, distribution, and ecological significance.</span></div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + FOREST + ';">Key Areas:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(46,125,50,0.08);border-left:3px solid ' + FOREST + ';border-radius:4px;">' +
      '<strong>1. Tree Identification</strong><br>' +
      '<span style="color:' + textSec + ';">Based on leaf shape (needles, broadleaf), bark texture, branching pattern, flowers, fruit, and growth form (conifer vs deciduous).</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(46,125,50,0.08);border-left:3px solid ' + FOREST + ';border-radius:4px;">' +
      '<strong>2. Taxonomy &amp; Families</strong><br>' +
      '<span style="color:' + textSec + ';">Major families: Pinaceae (pines), Fagaceae (oaks, beeches), Rosaceae (apples, cherries), Fabaceae (acacias), and many more.</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(46,125,50,0.08);border-left:3px solid ' + FOREST + ';border-radius:4px;">' +
      '<strong>3. Dendrochronology</strong><br>' +
      '<span style="color:' + textSec + ';">Tree-ring dating used to determine age, climate history, and environmental changes through annual growth ring analysis.</span></div>' +
    '<div style="padding:8px 12px;background:rgba(46,125,50,0.08);border-left:3px solid ' + FOREST + ';border-radius:4px;">' +
      '<strong>4. Forestry &amp; Conservation</strong><br>' +
      '<span style="color:' + textSec + ';">Sustainable forest management, timber production, reforestation, and protection of old-growth and endangered tree species.</span></div>' +
  '</div>';
}
function renderPomologyHTML() {
  const bgCard = getComputedStyle(document.body).getPropertyValue('--bg-card').trim() || '#1f1111';
  const border = getComputedStyle(document.body).getPropertyValue('--border').trim() || '#3a1a1a';
  const textSec = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim() || '#a07070';
  const ORANGE = '#ff9100';
  return '<div class="maths-card" style="margin:12px 0;padding:20px;background:' + bgCard + ';border:1px solid ' + border + ';border-radius:10px;max-width:600px;font-size:14px;line-height:1.7;color:#e8c8c8;">' +
    '<div style="font-size:18px;font-weight:700;color:' + ORANGE + ';margin-bottom:14px;">Pomology Overview</div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + ORANGE + ';">Definition:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(255,145,0,0.08);border-left:3px solid ' + ORANGE + ';border-radius:4px;">' +
      '<span style="color:' + textSec + ';">Pomology is the branch of horticulture that focuses on the cultivation, breeding, physiology, and harvesting of fruit and nut crops.</span></div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + ORANGE + ';">Key Areas:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(255,145,0,0.08);border-left:3px solid ' + ORANGE + ';border-radius:4px;">' +
      '<strong>1. Fruit Classification</strong><br>' +
      '<span style="color:' + textSec + ';">Pome (apple, pear), drupe (peach, cherry), berry (grape, tomato), citrus (orange, lemon), and aggregate (strawberry, raspberry).</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(255,145,0,0.08);border-left:3px solid ' + ORANGE + ';border-radius:4px;">' +
      '<strong>2. Cultivation &amp; Pruning</strong><br>' +
      '<span style="color:' + textSec + ';">Orchard management, grafting techniques, rootstock selection, pruning for shape and yield, and pollination requirements.</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(255,145,0,0.08);border-left:3px solid ' + ORANGE + ';border-radius:4px;">' +
      '<strong>3. Breeding &amp; Cultivars</strong><br>' +
      '<span style="color:' + textSec + ';">Development of new varieties through hybridization, selection for disease resistance, taste, shelf life, and climate adaptation.</span></div>' +
    '<div style="padding:8px 12px;background:rgba(255,145,0,0.08);border-left:3px solid ' + ORANGE + ';border-radius:4px;">' +
      '<strong>4. Post-Harvest Physiology</strong><br>' +
      '<span style="color:' + textSec + ';">Ripening processes (ethylene control), cold storage, transportation, and prevention of spoilage and physiological disorders.</span></div>' +
  '</div>';
}
function renderMeteorologyHTML() {
  const bgCard = getComputedStyle(document.body).getPropertyValue('--bg-card').trim() || '#1f1111';
  const border = getComputedStyle(document.body).getPropertyValue('--border').trim() || '#3a1a1a';
  const textSec = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim() || '#a07070';
  const SKY = '#4fc3f7';
  return '<div class="maths-card" style="margin:12px 0;padding:20px;background:' + bgCard + ';border:1px solid ' + border + ';border-radius:10px;max-width:600px;font-size:14px;line-height:1.7;color:#e8c8c8;">' +
    '<div style="font-size:18px;font-weight:700;color:' + SKY + ';margin-bottom:14px;">Meteorology Overview</div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + SKY + ';">Definition:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(79,195,247,0.08);border-left:3px solid ' + SKY + ';border-radius:4px;">' +
      '<span style="color:' + textSec + ';">Meteorology is the scientific study of the atmosphere, weather, and climate. It applies physics and chemistry to understand atmospheric phenomena and predict weather patterns.</span></div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + SKY + ';">Key Areas:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(79,195,247,0.08);border-left:3px solid ' + SKY + ';border-radius:4px;">' +
      '<strong>1. Atmospheric Dynamics</strong><br>' +
      '<span style="color:' + textSec + ';">Study of air motion, pressure systems, jet streams, cyclones, and the general circulation of the atmosphere.</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(79,195,247,0.08);border-left:3px solid ' + SKY + ';border-radius:4px;">' +
      '<strong>2. Weather Forecasting</strong><br>' +
      '<span style="color:' + textSec + ';">Numerical weather prediction using satellite data, radar, radiosondes, and computer models (GFS, ECMWF).</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(79,195,247,0.08);border-left:3px solid ' + SKY + ';border-radius:4px;">' +
      '<strong>3. Cloud Physics &amp; Precipitation</strong><br>' +
      '<span style="color:' + textSec + ';">Cloud formation (cumulus, stratus, cirrus), microphysics, rain/snow/hail formation, and severe storms (thunderstorms, tornadoes).</span></div>' +
    '<div style="padding:8px 12px;background:rgba(79,195,247,0.08);border-left:3px solid ' + SKY + ';border-radius:4px;">' +
      '<strong>4. Climatology</strong><br>' +
      '<span style="color:' + textSec + ';">Long-term climate patterns, climate change (greenhouse effect, ENSO), paleoclimatology, and climate modeling.</span></div>' +
  '</div>';
}
function renderOceanologyHTML() {
  const bgCard = getComputedStyle(document.body).getPropertyValue('--bg-card').trim() || '#1f1111';
  const border = getComputedStyle(document.body).getPropertyValue('--border').trim() || '#3a1a1a';
  const textSec = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim() || '#a07070';
  const DEEP = '#0288d1';
  return '<div class="maths-card" style="margin:12px 0;padding:20px;background:' + bgCard + ';border:1px solid ' + border + ';border-radius:10px;max-width:600px;font-size:14px;line-height:1.7;color:#e8c8c8;">' +
    '<div style="font-size:18px;font-weight:700;color:' + DEEP + ';margin-bottom:14px;">Oceanology Overview</div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + DEEP + ';">Definition:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(2,136,209,0.08);border-left:3px solid ' + DEEP + ';border-radius:4px;">' +
      '<span style="color:' + textSec + ';">Oceanology (or oceanography) is the scientific study of the ocean, its physical and chemical properties, currents, marine life, and interactions with the atmosphere and seafloor.</span></div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + DEEP + ';">Key Areas:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(2,136,209,0.08);border-left:3px solid ' + DEEP + ';border-radius:4px;">' +
      '<strong>1. Physical Oceanography</strong><br>' +
      '<span style="color:' + textSec + ';">Ocean currents (Gulf Stream, thermohaline circulation), waves, tides, and the interaction between ocean and atmosphere (ENSO).</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(2,136,209,0.08);border-left:3px solid ' + DEEP + ';border-radius:4px;">' +
      '<strong>2. Chemical Oceanography</strong><br>' +
      '<span style="color:' + textSec + ';">Salinity, nutrient cycles, ocean acidification, dissolved gases, and biogeochemical processes in seawater.</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(2,136,209,0.08);border-left:3px solid ' + DEEP + ';border-radius:4px;">' +
      '<strong>3. Marine Geology</strong><br>' +
      '<span style="color:' + textSec + ';">Seafloor spreading, mid-ocean ridges, trenches, hydrothermal vents, sedimentology, and plate tectonics.</span></div>' +
    '<div style="padding:8px 12px;background:rgba(2,136,209,0.08);border-left:3px solid ' + DEEP + ';border-radius:4px;">' +
      '<strong>4. Biological Oceanography</strong><br>' +
      '<span style="color:' + textSec + ';">Marine food webs, phytoplankton primary production, deep-sea ecosystems, and the role of oceans in the global carbon cycle.</span></div>' +
  '</div>';
}
function renderTechnologyHTML() {
  const bgCard = getComputedStyle(document.body).getPropertyValue('--bg-card').trim() || '#1f1111';
  const border = getComputedStyle(document.body).getPropertyValue('--border').trim() || '#3a1a1a';
  const textSec = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim() || '#a07070';
  const ELEC = '#448aff';
  return '<div class="maths-card" style="margin:12px 0;padding:20px;background:' + bgCard + ';border:1px solid ' + border + ';border-radius:10px;max-width:600px;font-size:14px;line-height:1.7;color:#e8c8c8;">' +
    '<div style="font-size:18px;font-weight:700;color:' + ELEC + ';margin-bottom:14px;">Technology Overview</div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + ELEC + ';">Definition:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(68,138,255,0.08);border-left:3px solid ' + ELEC + ';border-radius:4px;">' +
      '<span style="color:' + textSec + ';">Technology is the application of scientific knowledge, tools, and techniques to solve problems and extend human capabilities, encompassing fields from computing to engineering to biotechnology.</span></div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + ELEC + ';">Key Areas:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(68,138,255,0.08);border-left:3px solid ' + ELEC + ';border-radius:4px;">' +
      '<strong>1. Information Technology</strong><br>' +
      '<span style="color:' + textSec + ';">Computing, software development, networking, databases, AI, and cybersecurity that power the digital world.</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(68,138,255,0.08);border-left:3px solid ' + ELEC + ';border-radius:4px;">' +
      '<strong>2. Engineering Disciplines</strong><br>' +
      '<span style="color:' + textSec + ';">Mechanical, electrical, civil, aerospace, chemical, and biomedical engineering — designing systems from microchips to skyscrapers.</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(68,138,255,0.08);border-left:3px solid ' + ELEC + ';border-radius:4px;">' +
      '<strong>3. Biotechnology &amp; Medicine</strong><br>' +
      '<span style="color:' + textSec + ';">Genetic engineering, pharmaceuticals, medical imaging, prosthetics, and diagnostic technologies transforming healthcare.</span></div>' +
    '<div style="padding:8px 12px;background:rgba(68,138,255,0.08);border-left:3px solid ' + ELEC + ';border-radius:4px;">' +
      '<strong>4. Energy &amp; Environment</strong><br>' +
      '<span style="color:' + textSec + ';">Renewable energy (solar, wind, nuclear), smart grids, battery storage, and green technologies for sustainable development.</span></div>' +
  '</div>';
}
function renderMarineBiologyHTML() {
  const bgCard = getComputedStyle(document.body).getPropertyValue('--bg-card').trim() || '#1f1111';
  const border = getComputedStyle(document.body).getPropertyValue('--border').trim() || '#3a1a1a';
  const textSec = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim() || '#a07070';
  const SEA = '#1de9b6';
  return '<div class="maths-card" style="margin:12px 0;padding:20px;background:' + bgCard + ';border:1px solid ' + border + ';border-radius:10px;max-width:600px;font-size:14px;line-height:1.7;color:#e8c8c8;">' +
    '<div style="font-size:18px;font-weight:700;color:' + SEA + ';margin-bottom:14px;">Marine Biology Overview</div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + SEA + ';">Definition:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(29,233,182,0.08);border-left:3px solid ' + SEA + ';border-radius:4px;">' +
      '<span style="color:' + textSec + ';">Marine biology is the scientific study of organisms in the ocean and saltwater environments, from microscopic plankton to great whales, and their interactions with marine ecosystems.</span></div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + SEA + ';">Key Areas:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(29,233,182,0.08);border-left:3px solid ' + SEA + ';border-radius:4px;">' +
      '<strong>1. Marine Ecosystems</strong><br>' +
      '<span style="color:' + textSec + ';">Coral reefs, kelp forests, open ocean, deep sea, intertidal zones, and estuaries — each with unique biodiversity and adaptations.</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(29,233,182,0.08);border-left:3px solid ' + SEA + ';border-radius:4px;">' +
      '<strong>2. Marine Organisms</strong><br>' +
      '<span style="color:' + textSec + ';">Fish, marine mammals (whales, dolphins), sea turtles, cephalopods, crustaceans, and the incredible diversity of invertebrates.</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(29,233,182,0.08);border-left:3px solid ' + SEA + ';border-radius:4px;">' +
      '<strong>3. Plankton &amp; Primary Production</strong><br>' +
      '<span style="color:' + textSec + ';">Phytoplankton and zooplankton form the base of marine food webs. Phytoplankton produce ~50% of Earth\'s oxygen through photosynthesis.</span></div>' +
    '<div style="padding:8px 12px;background:rgba(29,233,182,0.08);border-left:3px solid ' + SEA + ';border-radius:4px;">' +
      '<strong>4. Conservation &amp; Threats</strong><br>' +
      '<span style="color:' + textSec + ';">Overfishing, plastic pollution, ocean acidification, coral bleaching, and marine protected areas (MPAs) as conservation tools.</span></div>' +
  '</div>';
}
function renderCardiologyHTML() {
  const bgCard = getComputedStyle(document.body).getPropertyValue('--bg-card').trim() || '#1f1111';
  const border = getComputedStyle(document.body).getPropertyValue('--border').trim() || '#3a1a1a';
  const textSec = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim() || '#a07070';
  const HEART = '#ff1744';
  return '<div class="maths-card" style="margin:12px 0;padding:20px;background:' + bgCard + ';border:1px solid ' + border + ';border-radius:10px;max-width:600px;font-size:14px;line-height:1.7;color:#e8c8c8;">' +
    '<div style="font-size:18px;font-weight:700;color:' + HEART + ';margin-bottom:14px;">Cardiology Overview</div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + HEART + ';">Definition:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(255,23,68,0.08);border-left:3px solid ' + HEART + ';border-radius:4px;">' +
      '<span style="color:' + textSec + ';">Cardiology is the branch of medicine focused on the diagnosis and treatment of disorders of the heart and circulatory system, including coronary artery disease, arrhythmias, and heart failure.</span></div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + HEART + ';">Key Areas:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(255,23,68,0.08);border-left:3px solid ' + HEART + ';border-radius:4px;">' +
      '<strong>1. Cardiac Anatomy &amp; Physiology</strong><br>' +
      '<span style="color:' + textSec + ';">Structure of the heart (chambers, valves, conduction system), cardiac cycle, blood pressure regulation, and coronary circulation.</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(255,23,68,0.08);border-left:3px solid ' + HEART + ';border-radius:4px;">' +
      '<strong>2. Diagnostic Techniques</strong><br>' +
      '<span style="color:' + textSec + ';">ECG (electrocardiogram), echocardiography, stress testing, cardiac catheterization, and biomarkers (troponin).</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(255,23,68,0.08);border-left:3px solid ' + HEART + ';border-radius:4px;">' +
      '<strong>3. Common Diseases</strong><br>' +
      '<span style="color:' + textSec + ';">Atherosclerosis, myocardial infarction (heart attack), hypertension, atrial fibrillation, valvular disease, and cardiomyopathy.</span></div>' +
    '<div style="padding:8px 12px;background:rgba(255,23,68,0.08);border-left:3px solid ' + HEART + ';border-radius:4px;">' +
      '<strong>4. Treatments &amp; Interventions</strong><br>' +
      '<span style="color:' + textSec + ';">Angioplasty and stenting, bypass surgery, pacemakers, defibrillators, and pharmaceutical management (statins, beta-blockers).</span></div>' +
  '</div>';
}
function renderNeurologyHTML() {
  const bgCard = getComputedStyle(document.body).getPropertyValue('--bg-card').trim() || '#1f1111';
  const border = getComputedStyle(document.body).getPropertyValue('--border').trim() || '#3a1a1a';
  const textSec = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim() || '#a07070';
  const NERVE = '#d500f9';
  return '<div class="maths-card" style="margin:12px 0;padding:20px;background:' + bgCard + ';border:1px solid ' + border + ';border-radius:10px;max-width:600px;font-size:14px;line-height:1.7;color:#e8c8c8;">' +
    '<div style="font-size:18px;font-weight:700;color:' + NERVE + ';margin-bottom:14px;">Neurology Overview</div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + NERVE + ';">Definition:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(213,0,249,0.08);border-left:3px solid ' + NERVE + ';border-radius:4px;">' +
      '<span style="color:' + textSec + ';">Neurology is the branch of medicine dealing with disorders of the nervous system — the brain, spinal cord, peripheral nerves, and muscles, including stroke, epilepsy, and neurodegenerative diseases.</span></div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + NERVE + ';">Key Areas:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(213,0,249,0.08);border-left:3px solid ' + NERVE + ';border-radius:4px;">' +
      '<strong>1. Neuroanatomy &amp; Neurophysiology</strong><br>' +
      '<span style="color:' + textSec + ';">Structure of the brain (cortex, cerebellum, brainstem), neuron signaling, synaptic transmission, and neurotransmitter systems.</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(213,0,249,0.08);border-left:3px solid ' + NERVE + ';border-radius:4px;">' +
      '<strong>2. Neurological Disorders</strong><br>' +
      '<span style="color:' + textSec + ';">Alzheimer\'s disease, Parkinson\'s disease, multiple sclerosis, stroke, epilepsy, migraine, and peripheral neuropathy.</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(213,0,249,0.08);border-left:3px solid ' + NERVE + ';border-radius:4px;">' +
      '<strong>3. Diagnostic Tools</strong><br>' +
      '<span style="color:' + textSec + ';">MRI, CT, EEG (electroencephalography), EMG (electromyography), lumbar puncture, and neurological examination.</span></div>' +
    '<div style="padding:8px 12px;background:rgba(213,0,249,0.08);border-left:3px solid ' + NERVE + ';border-radius:4px;">' +
      '<strong>4. Therapeutics</strong><br>' +
      '<span style="color:' + textSec + ';">Pharmacological treatments (antiepileptics, dopaminergic drugs), neurosurgery, rehabilitation, and emerging therapies (deep brain stimulation).</span></div>' +
  '</div>';
}
function renderDermatologyHTML() {
  const bgCard = getComputedStyle(document.body).getPropertyValue('--bg-card').trim() || '#1f1111';
  const border = getComputedStyle(document.body).getPropertyValue('--border').trim() || '#3a1a1a';
  const textSec = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim() || '#a07070';
  const PINK = '#f48fb1';
  return '<div class="maths-card" style="margin:12px 0;padding:20px;background:' + bgCard + ';border:1px solid ' + border + ';border-radius:10px;max-width:600px;font-size:14px;line-height:1.7;color:#e8c8c8;">' +
    '<div style="font-size:18px;font-weight:700;color:' + PINK + ';margin-bottom:14px;">Dermatology Overview</div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + PINK + ';">Definition:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(244,143,177,0.08);border-left:3px solid ' + PINK + ';border-radius:4px;">' +
      '<span style="color:' + textSec + ';">Dermatology is the branch of medicine concerned with the skin, hair, nails, and mucous membranes — the largest organ system — encompassing diagnosis and treatment of over 3,000 skin conditions.</span></div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + PINK + ';">Key Areas:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(244,143,177,0.08);border-left:3px solid ' + PINK + ';border-radius:4px;">' +
      '<strong>1. Skin Structure &amp; Function</strong><br>' +
      '<span style="color:' + textSec + ';">Epidermis, dermis, and hypodermis layers; keratinocytes, melanocytes, sebaceous glands, and the skin barrier role.</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(244,143,177,0.08);border-left:3px solid ' + PINK + ';border-radius:4px;">' +
      '<strong>2. Common Conditions</strong><br>' +
      '<span style="color:' + textSec + ';">Acne, eczema (atopic dermatitis), psoriasis, rosacea, fungal infections, warts, and contact dermatitis.</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(244,143,177,0.08);border-left:3px solid ' + PINK + ';border-radius:4px;">' +
      '<strong>3. Skin Cancer</strong><br>' +
      '<span style="color:' + textSec + ';">Basal cell carcinoma, squamous cell carcinoma, and melanoma — risk factors (UV exposure), ABCDE rule, and treatment (excision, immunotherapy).</span></div>' +
    '<div style="padding:8px 12px;background:rgba(244,143,177,0.08);border-left:3px solid ' + PINK + ';border-radius:4px;">' +
      '<strong>4. Cosmetic Dermatology</strong><br>' +
      '<span style="color:' + textSec + ';">Laser therapy, Botox, fillers, chemical peels, microneedling, and treatments for aging, scarring, and pigmentation disorders.</span></div>' +
  '</div>';
}
function renderPathologyHTML() {
  const bgCard = getComputedStyle(document.body).getPropertyValue('--bg-card').trim() || '#1f1111';
  const border = getComputedStyle(document.body).getPropertyValue('--border').trim() || '#3a1a1a';
  const textSec = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim() || '#a07070';
  const DARK = '#c62828';
  return '<div class="maths-card" style="margin:12px 0;padding:20px;background:' + bgCard + ';border:1px solid ' + border + ';border-radius:10px;max-width:600px;font-size:14px;line-height:1.7;color:#e8c8c8;">' +
    '<div style="font-size:18px;font-weight:700;color:' + DARK + ';margin-bottom:14px;">Pathology Overview</div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + DARK + ';">Definition:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(198,40,40,0.08);border-left:3px solid ' + DARK + ';border-radius:4px;">' +
      '<span style="color:' + textSec + ';">Pathology is the study of the causes and effects of disease, examining structural and functional changes in cells, tissues, and organs through laboratory analysis and microscopic examination.</span></div>' +
    '<div style="margin-bottom:10px;font-weight:600;color:' + DARK + ';">Key Areas:</div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(198,40,40,0.08);border-left:3px solid ' + DARK + ';border-radius:4px;">' +
      '<strong>1. Anatomical Pathology</strong><br>' +
      '<span style="color:' + textSec + ';">Examination of surgical specimens, biopsies, and autopsies — gross and microscopic analysis to diagnose diseases including cancer.</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(198,40,40,0.08);border-left:3px solid ' + DARK + ';border-radius:4px;">' +
      '<strong>2. Clinical Pathology</strong><br>' +
      '<span style="color:' + textSec + ';">Laboratory analysis of blood, urine, and other body fluids — hematology, microbiology, immunology, and clinical chemistry.</span></div>' +
    '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(198,40,40,0.08);border-left:3px solid ' + DARK + ';border-radius:4px;">' +
      '<strong>3. Molecular Pathology</strong><br>' +
      '<span style="color:' + textSec + ';">DNA/RNA analysis, genetic testing, biomarker identification, and precision medicine approaches to disease classification and treatment.</span></div>' +
    '<div style="padding:8px 12px;background:rgba(198,40,40,0.08);border-left:3px solid ' + DARK + ';border-radius:4px;">' +
      '<strong>4. Forensic Pathology</strong><br>' +
      '<span style="color:' + textSec + ';">Determining cause of death through autopsy, toxicology, and histological examination in medicolegal investigations.</span></div>' +
  '</div>';
}
function renderQRHTML(link) {
  const bgCard = getComputedStyle(document.body).getPropertyValue('--bg-card').trim() || '#1f1111';
  const border = getComputedStyle(document.body).getPropertyValue('--border').trim() || '#3a1a1a';
  const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#ff4444';
  const textSec = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim() || '#a07070';
  const encoded = encodeURIComponent(link);
  const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encoded;
  return '<div class="maths-card" style="margin:12px 0;padding:20px;background:' + bgCard + ';border:1px solid ' + border + ';border-radius:10px;max-width:600px;font-size:14px;line-height:1.7;color:#e8c8c8;text-align:center;">' +
    '<div style="font-size:18px;font-weight:700;color:' + accent + ';margin-bottom:14px;">QR Code</div>' +
    '<div style="margin-bottom:12px;"><img src="' + qrUrl + '" alt="QR Code" style="border-radius:8px;max-width:200px;"></div>' +
    '<div style="color:' + textSec + ';font-size:12px;word-break:break-all;">' + link + '</div>' +
  '</div>';
}
function renderDartsHTML(id, targetScore) {
  const bgCard = getComputedStyle(document.body).getPropertyValue('--bg-card').trim() || '#1f1111';
  const border = getComputedStyle(document.body).getPropertyValue('--border').trim() || '#3a1a1a';
  const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#ff4444';
  const textSec = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim() || '#a07070';
  const bgInput = getComputedStyle(document.body).getPropertyValue('--bg-input').trim() || '#261515';
  return '<div class="darts-wrap" data-target="' + id + '" data-score="' + targetScore + '" style="display:flex;flex-direction:column;align-items:center;margin:12px 0;padding:16px;background:' + bgCard + ';border:1px solid ' + border + ';border-radius:10px;">' +
    '<div style="font-size:15px;font-weight:600;color:' + accent + ';margin-bottom:6px;">Darts #' + id + ' — Target: ' + targetScore + '</div>' +
    '<div class="darts-board" style="position:relative;width:200px;height:200px;border-radius:50%;background:' + bgInput + ';border:3px solid ' + accent + ';margin:8px 0;overflow:hidden;">' +
      '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:40px;height:40px;border-radius:50%;background:' + accent + ';opacity:0.5;"></div>' +
      '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:100px;height:100px;border-radius:50%;border:2px solid ' + accent + ';opacity:0.3;"></div>' +
      '<div style="position:absolute;top:50%;left:0;right:0;height:2px;background:' + accent + ';opacity:0.2;transform:translateY(-50%);"></div>' +
      '<div style="position:absolute;left:50%;top:0;bottom:0;width:2px;background:' + accent + ';opacity:0.2;transform:translateX(-50%);"></div>' +
      '<div class="darts-score" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:24px;font-weight:700;color:#fff;text-shadow:0 0 10px rgba(0,0,0,0.8);">' + targetScore + '</div>' +
    '</div>' +
    '<div class="darts-status" style="margin:4px 0;font-size:13px;color:' + textSec + ';">Click the board to throw! Score: 0 / ' + targetScore + '</div>' +
    '<div class="darts-throws" style="display:flex;gap:4px;margin:4px 0;"></div>' +
    '<button class="darts-reset" data-target="' + id + '" style="margin-top:6px;padding:4px 12px;background:' + accent + ';border:none;border-radius:5px;color:#fff;cursor:pointer;font-size:12px;">New Game</button>' +
  '</div>';
}

// Init tic-tac-toe game logic via event delegation
document.addEventListener('click', function(e) {
  const cell = e.target.closest('.ttt-cell');
  if (cell) {
    const game = cell.dataset.game;
    const idx = parseInt(cell.dataset.idx);
    const wrap = cell.closest('.ttt-wrap');
    const status = wrap.querySelector('.ttt-status');
    const grid = wrap.querySelector('[id^="ttt-grid-"]');
    const cells = grid.querySelectorAll('.ttt-cell');
    if (!window.__ttt) window.__ttt = {};
    if (!window.__ttt[game]) window.__ttt[game] = { board: Array(9).fill(null), player: 'X', over: false };
    const state = window.__ttt[game];
    if (state.board[idx] || state.over) return;
    state.board[idx] = state.player;
    cell.textContent = state.player;
    cell.style.color = state.player === 'X' ? accentColor() : '#50e3c2';
    const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (const p of wins) {
      if (state.board[p[0]] && state.board[p[0]] === state.board[p[1]] && state.board[p[1]] === state.board[p[2]]) {
        state.over = true;
        status.textContent = 'Player ' + state.board[p[0]] + ' wins!';
        p.forEach(j => cells[j].style.background = glowColor());
        return;
      }
    }
    if (state.board.every(Boolean)) { state.over = true; status.textContent = 'Draw!'; return; }
    state.player = state.player === 'X' ? 'O' : 'X';
    status.textContent = "Player " + state.player + "'s turn";
  }
  const reset = e.target.closest('.ttt-reset');
  if (reset) {
    const game = reset.dataset.game;
    const wrap = reset.closest('.ttt-wrap');
    const status = wrap.querySelector('.ttt-status');
    const grid = wrap.querySelector('[id^="ttt-grid-"]');
    const cells = grid.querySelectorAll('.ttt-cell');
    if (!window.__ttt) window.__ttt = {};
    window.__ttt[game] = { board: Array(9).fill(null), player: 'X', over: false };
    cells.forEach(c => { c.textContent = ''; c.style.background = ''; c.style.color = ''; });
    status.textContent = "Player X's turn";
  }
  // Darts
  const board = e.target.closest('.darts-board');
  if (board) {
    const wrap = board.closest('.darts-wrap');
    const id = wrap.dataset.target;
    const target = parseInt(wrap.dataset.score);
    const status = wrap.querySelector('.darts-status');
    const throwsEl = wrap.querySelector('.darts-throws');
    if (!window.__darts) window.__darts = {};
    if (!window.__darts[id]) window.__darts[id] = { score: 0, throws: 0, over: false };
    const state = window.__darts[id];
    if (state.over) return;
    const rect = board.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    const dist = Math.sqrt(x * x + y * y) / (rect.width / 2);
    let pts;
    if (dist < 0.15) pts = 60;
    else if (dist < 0.35) pts = 40;
    else if (dist < 0.6) pts = 20;
    else pts = Math.floor(Math.random() * 20) + 1;
    state.score += pts;
    state.throws++;
    const dot = document.createElement('div');
    dot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:#ffd700;margin:0 1px;';
    throwsEl.appendChild(dot);
    if (state.score >= target) {
      state.over = true;
      status.innerHTML = '&#127881; Bullseye! You reached ' + target + ' in ' + state.throws + ' throws!';
    } else {
      status.textContent = 'Score: ' + state.score + ' / ' + target + ' (throw #' + state.throws + ')';
    }
  }
  const resetDarts = e.target.closest('.darts-reset');
  if (resetDarts) {
    const id = resetDarts.dataset.target;
    const wrap = resetDarts.closest('.darts-wrap');
    const status = wrap.querySelector('.darts-status');
    const throwsEl = wrap.querySelector('.darts-throws');
    const target = parseInt(wrap.dataset.score);
    if (!window.__darts) window.__darts = {};
    window.__darts[id] = { score: 0, throws: 0, over: false };
    throwsEl.innerHTML = '';
    status.textContent = 'Score: 0 / ' + target;
  }
});

let _accentC, _glowC;
function accentColor() {
  return _accentC || (_accentC = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#ff4444');
}
function glowColor() {
  return _glowC || (_glowC = getComputedStyle(document.body).getPropertyValue('--accent-glow').trim() || 'rgba(255,68,68,0.3)');
}

// Run button
document.getElementById('runCodeBtn').addEventListener('click', function() {
  const code = document.getElementById('codeTextarea').value || '';
  executeCode(code, document.getElementById('previewOutput'));
});

// Open Crosh terminal window
function openCroshWindow() {
  const overlay = document.createElement('div');
  overlay.className = 'crosh-overlay';
  overlay.innerHTML = '<div class="crosh-window"><div class="crosh-header"><span>crosh</span><button class="crosh-close">&#10006;</button></div><div class="crosh-body"><div class="crosh-output"><div style="color:#50e3c2;">Welcome to crosh (Chrome OS Developer Shell)</div><div style="color:#888;">Enter a command or type <span style="color:#ffd700;">help</span> for available commands.</div></div><div class="crosh-input-line"><span class="crosh-prompt">crosh&gt; </span><input class="crosh-input" id="croshInput" type="text" autofocus></div></div></div>';
  document.body.appendChild(overlay);

  const input = overlay.querySelector('#croshInput');
  const output = overlay.querySelector('.crosh-output');
  const closeBtn = overlay.querySelector('.crosh-close');

  closeBtn.addEventListener('click', function() { document.body.removeChild(overlay); });

  function croshEcho(text) {
    const d = document.createElement('div');
    d.textContent = text;
    d.style.color = '#e8c8c8';
    output.appendChild(d);
    output.scrollTop = output.scrollHeight;
  }

  input.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter' || !this.value.trim()) return;
    const cmd = this.value.trim();
    const line = document.createElement('div');
    line.innerHTML = '<span style="color:#50e3c2;">crosh&gt; </span>' + cmd;
    output.appendChild(line);
    this.value = '';
    if (cmd === 'help') {
      croshEcho('Available commands: help, ping, telnet, ssh, shell, exit');
    } else if (cmd === 'exit') {
      document.body.removeChild(overlay);
    } else if (cmd === 'ping') {
      croshEcho('Pinging 8.8.8.8...');
      setTimeout(function() { croshEcho('64 bytes from 8.8.8.8: icmp_seq=1 ttl=117 time=14.2 ms'); }, 300);
      setTimeout(function() { croshEcho('64 bytes from 8.8.8.8: icmp_seq=2 ttl=117 time=13.8 ms'); }, 600);
      setTimeout(function() { croshEcho('64 bytes from 8.8.8.8: icmp_seq=3 ttl=117 time=15.1 ms'); }, 900);
      setTimeout(function() { croshEcho('--- 8.8.8.8 ping statistics ---'); }, 1200);
      setTimeout(function() { croshEcho('3 packets transmitted, 3 received, 0% packet loss'); }, 1500);
    } else if (cmd === 'telnet') {
      croshEcho('Connecting to towel.blinkenlights.nl...');
      setTimeout(function() { croshEcho('Connected. Type "quit" to exit.'); }, 500);
      setTimeout(function() { croshEcho('Star Wars ASCII animation would play here...'); }, 1000);
      setTimeout(function() { croshEcho('(but we skipped it to save bandwidth)'); }, 1500);
    } else if (cmd === 'ssh') {
      croshEcho('SSH: trying to establish connection...');
      setTimeout(function() { croshEcho('The authenticity of host \'server.local\' can\'t be established.'); }, 400);
      setTimeout(function() { croshEcho('ECDSA key fingerprint is SHA256:AbCdEf1234567890.'); }, 800);
      setTimeout(function() { croshEcho('Are you sure you want to continue connecting (yes/no/[fingerprint])?'); }, 1200);
      setTimeout(function() { croshEcho('yes'); }, 1400);
      setTimeout(function() { croshEcho('Warning: Permanently added \'server.local\' (ECDSA) to the list of known hosts.'); }, 1800);
      setTimeout(function() { croshEcho('Permission denied (publickey).'); }, 2200);
    } else if (cmd === 'shell') {
      croshEcho('Spawning shell...');
      setTimeout(function() { croshEcho('Error: SHELL is not properly configured. Contact your IT admin.'); }, 600);
      setTimeout(function() { croshEcho('Just kidding. There is no shell. This is a joke.'); }, 1000);
    } else {
      croshEcho('Unknown command: ' + cmd + '. Type help for available commands.');
    }
    output.scrollTop = output.scrollHeight;
  });

  input.focus();
}

// Fullscreen preview
document.getElementById('fullscreenBtn').addEventListener('click', function() {
  const panel = document.getElementById('previewPanel');
  const goingFull = !panel.classList.contains('fullscreen');
  panel.classList.toggle('fullscreen');
  if (goingFull) panel.classList.remove('hidden');
  this.classList.toggle('active');
  this.innerHTML = goingFull ? '&#10006;' : '&#9974;';
});

// New project overlay
document.getElementById('newProjectBtn').addEventListener('click', function() {
  const overlay = document.createElement('div');
  overlay.className = 'create-project-overlay';
  overlay.innerHTML = '<div class="create-project-box"><h3>New Project</h3><div class="input-group"><label for="projectNameInput">Project Name</label><input type="text" id="projectNameInput" placeholder="Enter project name"></div><div class="create-project-actions"><button class="btn-cancel">Cancel</button><button class="btn-create">Create</button></div></div>';
  document.body.appendChild(overlay);

  const input = overlay.querySelector('#projectNameInput');
  const cancelBtn = overlay.querySelector('.btn-cancel');
  const createBtn = overlay.querySelector('.btn-create');

  function close() { document.body.removeChild(overlay); }

  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });

  createBtn.addEventListener('click', function() {
    let name = input.value.trim();
    if (!name) return;
    if (!name.includes('.')) name += '.inf';
    const projects = getProjects();
    if (projects.find(p => p.name === name)) {
      input.focus();
      input.select();
      return;
    }
    const defaultCode = name.endsWith('.html') ? '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n<title></title>\n</head>\n<body>\n\n</body>\n</html>' : '@inf\n';
    projects.push({ name: name, code: defaultCode });
    saveProjects(projects);
    close();
    renderProjectList();
    openProject(name);
  });

  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') createBtn.click();
    if (e.key === 'Escape') close();
  });

  setTimeout(() => input.focus(), 50);
});

// ===== COMMAND CONSOLE =====
document.getElementById('cmdConsoleClose').addEventListener('click', function() {
  document.getElementById('cmdConsole').classList.add('hidden');
});

document.getElementById('cmdConsoleInput').addEventListener('keydown', function(e) {
  if (e.key !== 'Enter') return;
  const input = this.value.trim();
  const output = document.getElementById('cmdConsoleOutput');
  if (!input) return;

  const line = document.createElement('div');
  line.className = 'cmd-console-line';
  line.innerHTML = '<span class="cmd-console-prompt">&gt;</span> ' + input;
  output.appendChild(line);

  if (input === '@open' || input === '@open [web]') {
    const url = openCodeInTab();
    const msg = document.createElement('div');
    msg.className = 'cmd-console-line';
    msg.style.color = '#50e3c2';
    const label = input === '@open [web]' ? 'Blob link' : 'Preview opened';
    msg.innerHTML = label + ': <a href="' + url + '" target="_blank" style="color:#50e3c2;text-decoration:underline;">' + url + '</a>';
    output.appendChild(msg);
  } else if (input === '@run') {
    const code = document.getElementById('codeTextarea').value || '';
    const result = document.createElement('div');
    result.className = 'cmd-console-line';
    executeCode(code, result);
    output.appendChild(result);
  } else if (input.toLowerCase() === '@open [crosh] (window)') {
    openCroshWindow();
    const msg = document.createElement('div');
    msg.className = 'cmd-console-line';
    msg.style.color = '#50e3c2';
    msg.textContent = 'Crosh window opened.';
    output.appendChild(msg);
  } else {
    const result = document.createElement('div');
    result.className = 'cmd-console-line';
    result.innerHTML = 'Unknown command. Try @run or @open';
    output.appendChild(result);
  }

  this.value = '';
  output.scrollTop = output.scrollHeight;
});

// ===== EDIT MODE =====
const EDIT_LAYOUT_KEY = 'ic_edit_layout';
let editDragData = null;
let editToolbar = null;
let editSelectedEl = null;

const toolIcons = {
  del: '\u{1F5D1}', clone: '\u{1F4CB}',
  fntUp: 'A+', fntDn: 'A-',
  zUp: '\u{2B06}', zDn: '\u{2B07}',
  wUp: '\u{2194}+', wDn: '\u{2194}-',
  hUp: '\u{2195}+', hDn: '\u{2195}-',
  padUp: '\u{25A6}+', padDn: '\u{25A6}-',
  radUp: '\u{25E2}+', radDn: '\u{25E2}-',
  opUp: '\u{25D1}+', opDn: '\u{25D1}-',
  reset: '\u{21A9}',
};

function createEditToolbar() {
  const bar = document.createElement('div');
  bar.className = 'edit-toolbar';
  bar.innerHTML =
    '<div class="edit-toolbar-row">' +
      '<button class="edit-tool-btn" data-tool="del" title="Delete">' + toolIcons.del + '</button>' +
      '<button class="edit-tool-btn" data-tool="clone" title="Clone">' + toolIcons.clone + '</button>' +
      '<div class="edit-tool-sep"></div>' +
      '<input type="color" class="edit-color-input" data-tool="bgColor" title="Background color">' +
      '<input type="color" class="edit-color-input" data-tool="txtColor" title="Text color" style="--clr:#fff">' +
      '<div class="edit-tool-sep"></div>' +
      '<button class="edit-tool-btn" data-tool="fntUp" title="Font +">' + toolIcons.fntUp + '</button>' +
      '<button class="edit-tool-btn" data-tool="fntDn" title="Font -">' + toolIcons.fntDn + '</button>' +
      '<div class="edit-tool-sep"></div>' +
      '<button class="edit-tool-btn" data-tool="zUp" title="Bring forward">' + toolIcons.zUp + '</button>' +
      '<button class="edit-tool-btn" data-tool="zDn" title="Send backward">' + toolIcons.zDn + '</button>' +
      '<div class="edit-tool-sep"></div>' +
      '<button class="edit-tool-btn" data-tool="reset" title="Reset">' + toolIcons.reset + '</button>' +
    '</div>' +
    '<div class="edit-toolbar-row">' +
      '<button class="edit-tool-btn" data-tool="wUp" title="Width +">' + toolIcons.wUp + '</button>' +
      '<button class="edit-tool-btn" data-tool="wDn" title="Width -">' + toolIcons.wDn + '</button>' +
      '<button class="edit-tool-btn" data-tool="hUp" title="Height +">' + toolIcons.hUp + '</button>' +
      '<button class="edit-tool-btn" data-tool="hDn" title="Height -">' + toolIcons.hDn + '</button>' +
      '<div class="edit-tool-sep"></div>' +
      '<button class="edit-tool-btn" data-tool="padUp" title="Padding +">' + toolIcons.padUp + '</button>' +
      '<button class="edit-tool-btn" data-tool="padDn" title="Padding -">' + toolIcons.padDn + '</button>' +
      '<div class="edit-tool-sep"></div>' +
      '<button class="edit-tool-btn" data-tool="radUp" title="Radius +">' + toolIcons.radUp + '</button>' +
      '<button class="edit-tool-btn" data-tool="radDn" title="Radius -">' + toolIcons.radDn + '</button>' +
      '<div class="edit-tool-sep"></div>' +
      '<button class="edit-tool-btn" data-tool="opUp" title="Opacity +">' + toolIcons.opUp + '</button>' +
      '<button class="edit-tool-btn" data-tool="opDn" title="Opacity -">' + toolIcons.opDn + '</button>' +
    '</div>';
  bar.addEventListener('click', function(e) {
    const btn = e.target.closest('[data-tool]');
    if (!btn) return;
    if (btn.dataset.tool === 'bgColor' || btn.dataset.tool === 'txtColor') return;
    handleEditTool(btn.dataset.tool);
  });
  bar.addEventListener('input', function(e) {
    if (e.target.dataset.tool === 'bgColor' || e.target.dataset.tool === 'txtColor') handleEditTool(e.target.dataset.tool);
  });
  return bar;
}

function positionToolbar(el) {
  if (!editToolbar) return;
  const rect = el.getBoundingClientRect();
  editToolbar.style.left = rect.left + 'px';
  editToolbar.style.top = (rect.bottom + 4) + 'px';
}

function updateToolbar(el) {
  if (!editToolbar) editToolbar = createEditToolbar();
  if (!editToolbar.parentNode) document.body.appendChild(editToolbar);
  positionToolbar(el);
  const colorInput = editToolbar.querySelector('.edit-color-input');
  if (colorInput) {
    const bg = getComputedStyle(el).backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
      try {
        const rgb = bg.match(/\d+/g);
        if (rgb) {
          const hex = '#' + rgb.slice(0,3).map(v => parseInt(v).toString(16).padStart(2,'0')).join('');
          colorInput.value = hex;
        }
      } catch(e) {}
    }
  }
}

function selectElement(el) {
  deselectElement();
  el.classList.add('edit-selected');
  editSelectedEl = el;
  const handle = document.createElement('div');
  handle.className = 'edit-handle';
  handle.innerHTML = '\u2699';
  el.appendChild(handle);
  handle.addEventListener('mousedown', function(ev) {
    ev.preventDefault();
    startEditDrag(ev, el);
  });
  updateToolbar(el);
}

function deselectElement() {
  document.querySelectorAll('.edit-handle').forEach(h => h.remove());
  document.querySelectorAll('.edit-selected').forEach(el => el.classList.remove('edit-selected'));
  if (editToolbar && editToolbar.parentNode) editToolbar.parentNode.removeChild(editToolbar);
  editSelectedEl = null;
}

function handleEditTool(tool) {
  const el = editSelectedEl;
  if (!el) return;
  const cs = getComputedStyle(el);
  switch (tool) {
    case 'del':
      el.parentNode.removeChild(el);
      deselectElement();
      break;
    case 'clone':
      const clone = el.cloneNode(true);
      el.parentNode.insertBefore(clone, el.nextSibling);
      selectElement(clone);
      break;
    case 'bgColor': {
      const inp = editToolbar.querySelector('[data-tool="bgColor"]');
      if (inp) { el.style.background = inp.value; el.style.color = '#fff'; }
      break;
    }
    case 'txtColor': {
      const inp = editToolbar.querySelector('[data-tool="txtColor"]');
      if (inp) el.style.color = inp.value;
      break;
    }
    case 'fntUp':
      el.style.fontSize = (parseFloat(cs.fontSize) || 14) + 2 + 'px';
      break;
    case 'fntDn':
      el.style.fontSize = Math.max(8, (parseFloat(cs.fontSize) || 14) - 2) + 'px';
      break;
    case 'wUp':
      el.style.width = ((parseFloat(cs.width) || 0) + 10) + 'px';
      break;
    case 'wDn':
      el.style.width = Math.max(20, (parseFloat(cs.width) || 0) - 10) + 'px';
      break;
    case 'hUp':
      el.style.height = ((parseFloat(cs.height) || 0) + 10) + 'px';
      break;
    case 'hDn':
      el.style.height = Math.max(10, (parseFloat(cs.height) || 0) - 10) + 'px';
      break;
    case 'padUp':
      el.style.padding = ((parseFloat(cs.padding) || 4) + 2) + 'px';
      break;
    case 'padDn':
      el.style.padding = Math.max(0, (parseFloat(cs.padding) || 4) - 2) + 'px';
      break;
    case 'radUp':
      el.style.borderRadius = ((parseFloat(cs.borderRadius) || 0) + 2) + 'px';
      break;
    case 'radDn':
      el.style.borderRadius = Math.max(0, (parseFloat(cs.borderRadius) || 0) - 2) + 'px';
      break;
    case 'opUp':
      const oUp = parseFloat(cs.opacity) || 1;
      el.style.opacity = Math.min(1, oUp + 0.1);
      break;
    case 'opDn':
      const oDn = parseFloat(cs.opacity) || 1;
      el.style.opacity = Math.max(0.1, oDn - 0.1);
      break;
    case 'zUp':
      el.style.zIndex = (parseInt(cs.zIndex) || 0) + 1;
      break;
    case 'zDn':
      el.style.zIndex = Math.max(0, (parseInt(cs.zIndex) || 0) - 1);
      break;
    case 'reset':
      el.style.position = '';
      el.style.left = '';
      el.style.top = '';
      el.style.right = '';
      el.style.bottom = '';
      el.style.zIndex = '';
      el.style.fontSize = '';
      el.style.background = '';
      el.style.color = '';
      el.style.margin = '';
      el.style.width = '';
      el.style.height = '';
      el.style.padding = '';
      el.style.borderRadius = '';
      el.style.opacity = '';
      deselectElement();
      break;
  }
  saveEditLayout();
}

function toggleEditMode() {
  const isActive = document.body.classList.toggle('edit-mode');
  deselectElement();
  if (isActive) {
    setTimeout(function() { document.addEventListener('click', editClickHandler); }, 0);
  } else {
    document.removeEventListener('click', editClickHandler);
  }
  saveEditLayout();
}

function editClickHandler(e) {
  if (e.target.closest('.edit-handle')) return;
  if (e.target.closest('.edit-toolbar')) return;
  if (e.target.closest('.run-input')) return;
  if (e.target.closest('.edit-color-input')) return;
  const target = e.target.closest('button, .topbar-tab, .preview-toggle, .console-toggle, .run-btn');
  if (!target) {
    deselectElement();
    return;
  }
  selectElement(target);
}

function startEditDrag(e, el) {
  const rect = el.getBoundingClientRect();
  editDragData = { el, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
  el.style.position = 'fixed';
  el.style.zIndex = 999;
  el.style.margin = '0';
  document.body.classList.add('dragging');
}

document.addEventListener('mousemove', function(e) {
  if (!editDragData) return;
  const d = editDragData;
  d.el.style.left = (e.clientX - d.offsetX) + 'px';
  d.el.style.top = (e.clientY - d.offsetY) + 'px';
  d.el.style.right = 'auto';
  d.el.style.bottom = 'auto';
  if (editToolbar) positionToolbar(d.el);
});

document.addEventListener('mouseup', function() {
  if (!editDragData) return;
  editDragData = null;
  document.body.classList.remove('dragging');
  saveEditLayout();
});

function getElKey(el) {
  let text = (el.textContent || '').trim().slice(0, 20);
  return el.tagName + '|' + text;
}

function getElStyles(el) {
  const s = {};
  if (el.style.left) s.left = el.style.left;
  if (el.style.top) s.top = el.style.top;
  if (el.style.fontSize) s.fontSize = el.style.fontSize;
  if (el.style.background) s.background = el.style.background;
  if (el.style.color) s.color = el.style.color;
  if (el.style.zIndex && el.style.zIndex !== '999') s.zIndex = el.style.zIndex;
  if (el.style.width) s.width = el.style.width;
  if (el.style.height) s.height = el.style.height;
  if (el.style.padding) s.padding = el.style.padding;
  if (el.style.borderRadius) s.borderRadius = el.style.borderRadius;
  if (el.style.opacity && el.style.opacity !== '1') s.opacity = el.style.opacity;
  return s;
}

function applyElStyles(el, styles) {
  if (styles.left) { el.style.position = 'fixed'; el.style.left = styles.left; el.style.top = styles.top || 'auto'; el.style.right = 'auto'; el.style.bottom = 'auto'; el.style.margin = '0'; }
  if (styles.fontSize) el.style.fontSize = styles.fontSize;
  if (styles.background) el.style.background = styles.background;
  if (styles.color) el.style.color = styles.color;
  if (styles.zIndex) el.style.zIndex = styles.zIndex;
  if (styles.width) el.style.width = styles.width;
  if (styles.height) el.style.height = styles.height;
  if (styles.padding) el.style.padding = styles.padding;
  if (styles.borderRadius) el.style.borderRadius = styles.borderRadius;
  if (styles.opacity) el.style.opacity = styles.opacity;
}

function saveEditLayout() {
  const layout = {};
  document.querySelectorAll('[style]').forEach(el => {
    if (!el.style.left && !el.style.top) return;
    const styles = getElStyles(el);
    if (Object.keys(styles).length) layout[getElKey(el)] = styles;
  });
  localStorage.setItem(EDIT_LAYOUT_KEY, JSON.stringify(layout));
  sb('edit_layouts').upsert({id:1,layout},'id');
}

const SKIP_EDIT_IDS = ['lineNumbers', 'runOutput', 'cmdConsoleOutput', 'highlightCode', 'codeTextarea', 'previewOutput', 'projectList', 'runInput', 'cmdConsoleInput'];

function loadEditLayout() {
  const data = localStorage.getItem(EDIT_LAYOUT_KEY);
  if (!data) return;
  try {
    const layout = JSON.parse(data);
    let changed = false;
    Object.keys(layout).forEach(key => {
      const sep = key.indexOf('|');
      if (sep === -1) return;
      const tag = key.substring(0, sep);
      const text = key.substring(sep + 1);
      if (!text) { changed = true; delete layout[key]; return; }
      document.querySelectorAll(tag).forEach(el => {
        if (SKIP_EDIT_IDS.includes(el.id)) return;
        if ((el.textContent || '').trim().slice(0, 20) === text) {
          applyElStyles(el, layout[key]);
        }
      });
    });
    if (changed) localStorage.setItem(EDIT_LAYOUT_KEY, JSON.stringify(layout));
  } catch(e) {}
}

// Load saved layout on enter IDE
const origEnterIDE = enterIDE;
enterIDE = function(username) {
  origEnterIDE(username);
  loadEditLayout();
  setTimeout(checkFriendRequests, 1000);
  sb('themes').select({username}).then(r => {
    if (r.ok && r.data && r.data.length && r.data[0].theme) {
      applyTheme(r.data[0].theme);
    }
  });
  // Sync projects from Supabase (always, for cross-device support)
  const key = 'ic_projects_' + username;
  sb('projects').select({username}).then(r => {
    if (r.ok && r.data && r.data.length) {
      const serverProjects = r.data.map(p => ({name:p.name,code:p.code||''}));
      localStorage.setItem(key, JSON.stringify(serverProjects));
      renderProjectList();
    }
  });
};

function showSiteCode(output) {
  const html = document.documentElement.outerHTML;
  const lines = html.split('\n');
  const total = lines.length;
  const preview = lines.slice(0, 100).join('\n') + (total > 100 ? '\n\n... (' + (total - 100) + ' more lines) ...' : '');
  const msg = document.createElement('div');
  msg.className = 'run-line success';
  msg.style.whiteSpace = 'pre-wrap';
  msg.style.fontSize = '11px';
  msg.style.lineHeight = '1.4';
  msg.style.maxHeight = '400px';
  msg.style.overflowY = 'auto';
  msg.style.background = '#0a0a0a';
  msg.style.padding = '8px';
  msg.style.borderRadius = '4px';
  msg.style.marginTop = '4px';
  msg.style.fontFamily = 'Consolas, monospace';
  msg.style.color = getComputedStyle(document.body).getPropertyValue('--text-primary').trim();
  msg.textContent = preview;
  const title = document.createElement('div');
  title.className = 'run-line success';
  title.textContent = 'Site source (' + total + ' lines) — showing first 100:';
  output.appendChild(title);
  output.appendChild(msg);
}

// ===== RUN TERMINAL =====
document.getElementById('runInput').addEventListener('keydown', function(e) {
  if (e.key !== 'Enter') return;
  const input = this.value.trim();
  const output = document.getElementById('runOutput');

  if (!input) return;

  const line = document.createElement('div');
  line.className = 'run-line';
  line.innerHTML = '<span style="color:var(--accent)">&gt;</span> ' + input;
  output.appendChild(line);

  if (input === '@link [open] CI') {
    window.open('https://command-input.base44.app/', '_blank');
    const msg = document.createElement('div');
    msg.className = 'run-line success';
    msg.textContent = 'Opened Command Input';
    output.appendChild(msg);
  } else if (input === '@edit [.inf]' || input === '@edit /edit') {
    toggleEditMode();
    const msg = document.createElement('div');
    msg.className = 'run-line success';
    const state = document.body.classList.contains('edit-mode') ? 'enabled' : 'disabled';
    msg.textContent = 'Edit mode ' + state;
    output.appendChild(msg);
  } else if (input === '@edit /reset') {
    localStorage.removeItem(EDIT_LAYOUT_KEY);
    location.reload();
  } else if (input === '@stop') {
    if (document.body.classList.contains('edit-mode')) {
      document.body.classList.remove('edit-mode');
      document.removeEventListener('click', editClickHandler);
      deselectElement();
    }
    const msg = document.createElement('div');
    msg.className = 'run-line success';
    msg.textContent = 'Edit mode stopped';
    output.appendChild(msg);
  } else if (input === '@code') {
    showSiteCode(output);
  } else if (input === '@link [open] GP' || input === '@link [open] (Grandmaster path)') {
    window.open('https://quaint-master-path-chess.base44.app/search', '_blank');
    const msg = document.createElement('div');
    msg.className = 'run-line success';
    msg.textContent = 'Opened Grandmaster Path search';
    output.appendChild(msg);
  } else if (input.startsWith('@add friend ')) {
    const friend = input.slice(12).trim();
    if (!friend) { output.appendChild(err('Specify a username')); }
    else if (friend === currentUser) { output.appendChild(err("Can't add yourself")); }
    else {
      output.appendChild(ok('currentUser = "' + currentUser + '", friend = "' + friend + '"'));
      const url = SUPABASE_URL + '/rest/v1/friend_requests';
      const headers = {'apikey':SUPABASE_ANON_KEY,'Authorization':'Bearer '+SUPABASE_ANON_KEY,'Content-Type':'application/json'};
      const qurl = url+'?from_user=eq.'+encodeURIComponent(currentUser)+'&to_user=eq.'+encodeURIComponent(friend)+'&status=eq.pending';
      output.appendChild(ok('Check URL: ' + qurl));
      fetch(qurl, { method:'GET', headers }).then(raw => {
        return raw.text().then(text => {
          output.appendChild(ok('Check status: ' + raw.status + ' body: ' + (text||'(empty)')));
          try { return JSON.parse(text); } catch(e) { return []; }
        }).then(existing => {
          if (existing.length) { output.appendChild(err('Request already pending')); output.scrollTop = output.scrollHeight; return; }
          fetch(url, { method:'POST', headers:{...headers,'Prefer':'return=representation'}, body:JSON.stringify({from_user:currentUser,to_user:friend,status:'pending'}) }).then(r2 => {
            return r2.text().then(t2 => {
              output.appendChild(ok('Insert status: ' + r2.status + ' body: ' + (t2||'(empty)')));
              if (r2.ok) { output.appendChild(ok('Friend request sent to ' + friend + '!')); }
              else { output.appendChild(err('Insert failed')); }
              output.scrollTop = output.scrollHeight;
            });
          }).catch(e => {
            output.appendChild(err('Insert fetch error: ' + e.message));
            output.scrollTop = output.scrollHeight;
          });
        });
      }).catch(e => {
        output.appendChild(err('Fetch error: ' + e.message));
        output.scrollTop = output.scrollHeight;
      });
    }
  } else if (input.startsWith('@accept ')) {
    const friend = input.slice(8).trim();
    if (!friend) { output.appendChild(err('Specify a username')); }
    else {
      output.appendChild(ok('currentUser = "' + currentUser + '", friend = "' + friend + '"'));
      const q = 'from_user=eq.'+encodeURIComponent(friend)+'&to_user=eq.'+encodeURIComponent(currentUser)+'&status=eq.pending';
      const url = SUPABASE_URL + '/rest/v1/friend_requests?' + q;
      output.appendChild(ok('Query URL: ' + url));
      fetch(url, { method:'GET', headers: {'apikey':SUPABASE_ANON_KEY,'Authorization':'Bearer '+SUPABASE_ANON_KEY} }).then(raw => {
        output.appendChild(ok('Response status: ' + raw.status));
        return raw.text().then(text => {
          output.appendChild(ok('Response body: ' + (text || '(empty)')));
          try { return JSON.parse(text); } catch(e) { return null; }
        }).then(data => {
          if (!data || !Array.isArray(data) || !data.length) {
            output.appendChild(err('No pending request from ' + friend));
          } else {
            const row = data[0];
            const uurl = SUPABASE_URL + '/rest/v1/friend_requests?id=eq.'+row.id;
            fetch(uurl, { method:'PATCH', headers: {'apikey':SUPABASE_ANON_KEY,'Authorization':'Bearer '+SUPABASE_ANON_KEY,'Content-Type':'application/json','Prefer':'return=representation'}, body:JSON.stringify({status:'accepted'}) }).then(ur => {
              ur.text().then(ut => {
                output.appendChild(ok('Accept status: ' + ur.status + ' body: ' + (ut||'(empty)')));
                if (ur.ok) { output.appendChild(ok('Friend request from ' + friend + ' accepted!')); checkFriendRequests(); }
                else { output.appendChild(err('Accept failed')); }
              });
            }).catch(e => {
              output.appendChild(err('Accept fetch error: ' + e.message));
            });
          }
          output.scrollTop = output.scrollHeight;
        });
      }).catch(e => {
        output.appendChild(err('Fetch error: ' + e.message));
        output.scrollTop = output.scrollHeight;
      });
    }
  } else if (input.startsWith('@chat ')) {
    const rest = input.slice(6).trim();
    const space = rest.indexOf(' ');
    if (space === -1) {
      openChat(rest);
      output.appendChild(ok('Chat opened with ' + rest));
    } else {
      const user = rest.substring(0, space);
      const msg = rest.substring(space + 1).trim();
      openChat(user);
      sendMessage(user, msg);
      output.appendChild(ok('Message sent to ' + user));
    }
    output.scrollTop = output.scrollHeight;
  } else if (input === '@chat') {
    sb('friend_requests').select({status:'accepted'}).then(r => {
      const all = [];
      if (r.ok && r.data) r.data.forEach(f => {
        if (f.from_user === currentUser) all.push(f.to_user);
        if (f.to_user === currentUser) all.push(f.from_user);
      });
      const unique = [...new Set(all)];
      output.appendChild(ok('Friends: ' + (unique.length ? unique.join(', ') : 'None yet')));
      // Also show pending
      sb('friend_requests').select({to_user:currentUser,status:'pending'}).then(r2 => {
        if (r2.ok && r2.data && r2.data.length) {
          output.appendChild(ok('Pending requests: ' + r2.data.map(f => f.from_user).join(', ') + ' (use @accept [name])'));
        }
        output.scrollTop = output.scrollHeight;
      });
    });
  } else if (input.startsWith('@send ')) {
    const msg = input.slice(6).trim();
    if (!chatPartner) { output.appendChild(err('Open a chat first: @chat [username]')); }
    else if (!msg) { output.appendChild(err('Message is empty')); }
    else {
      sendMessage(chatPartner, msg).then(() => {
        output.appendChild(ok('Message sent'));
        output.scrollTop = output.scrollHeight;
      });
    }
    output.scrollTop = output.scrollHeight;
  } else if (input === '@dev [tools]') {
    if (!OWNERS.includes(currentUser)) {
      output.appendChild(err('Owners only'));
    } else {
      openDevTools();
      output.appendChild(ok('Dev Tools opened'));
    }
  } else {
    const msg = document.createElement('div');
    msg.className = 'run-line error';
    msg.textContent = 'Unknown command: ' + input;
    output.appendChild(msg);
  }

  this.value = '';
  output.scrollTop = output.scrollHeight;
});

function openDevTools() {
  const existing = document.getElementById('devToolsOverlay');
  if (existing) { existing.remove(); return; }
  const overlay = document.createElement('div');
  overlay.id = 'devToolsOverlay';
  overlay.innerHTML =
    '<div class="devtools-window" id="devToolsWindow">' +
      '<div class="devtools-header" id="devToolsHeader">' +
        '<span class="devtools-title">&#9881; Dev Tools</span>' +
        '<button class="devtools-close">&times;</button>' +
      '</div>' +
      '<div class="devtools-tabs">' +
        '<button class="devtools-tab active" data-tab="console">Console</button>' +
        '<button class="devtools-tab" data-tab="elements">Elements</button>' +
        '<button class="devtools-tab" data-tab="network">Network</button>' +
        '<button class="devtools-tab" data-tab="info">Info</button>' +
      '</div>' +
      '<div class="devtools-body">' +
        '<div class="devtools-panel active" id="dt-console"><div class="dt-placeholder">Console output will appear here</div></div>' +
        '<div class="devtools-panel" id="dt-elements"><div class="dt-placeholder">Click an element below to inspect</div><div class="dt-dom-tree"></div></div>' +
        '<div class="devtools-panel" id="dt-network"><div class="dt-placeholder">Network requests will be logged here</div></div>' +
        '<div class="devtools-panel" id="dt-info"><div class="dt-placeholder">Loading info...</div></div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  const closeBtn = overlay.querySelector('.devtools-close');
  closeBtn.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

  // Drag support
  const win = document.getElementById('devToolsWindow');
  const handle = document.getElementById('devToolsHeader');
  let dx = 0, dy = 0;
  handle.addEventListener('mousedown', function(e) {
    if (e.target.closest('.devtools-close')) return;
    const rect = win.getBoundingClientRect();
    dx = e.clientX - rect.left;
    dy = e.clientY - rect.top;
    const onMove = function(ev) {
      win.style.left = (ev.clientX - dx) + 'px';
      win.style.top = (ev.clientY - dy) + 'px';
      win.style.right = 'auto';
      win.style.bottom = 'auto';
    };
    const onUp = function() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // Tab switching
  overlay.querySelectorAll('.devtools-tab').forEach(tab => {
    tab.addEventListener('click', function() {
      overlay.querySelectorAll('.devtools-tab').forEach(t => t.classList.remove('active'));
      overlay.querySelectorAll('.devtools-panel').forEach(p => p.classList.remove('active'));
      this.classList.add('active');
      const panel = document.getElementById('dt-' + this.dataset.tab);
      if (panel) panel.classList.add('active');
    });
  });

  // Console tab: intercept console.log
  (function() {
    const panel = document.getElementById('dt-console');
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;
    console.log = function() {
      const args = Array.from(arguments).map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
      const line = document.createElement('div');
      line.className = 'dt-console-line';
      line.textContent = args;
      panel.appendChild(line);
      panel.scrollTop = panel.scrollHeight;
      origLog.apply(console, arguments);
    };
    console.warn = function() {
      const args = Array.from(arguments).map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
      const line = document.createElement('div');
      line.className = 'dt-console-line dt-console-warn';
      line.textContent = args;
      panel.appendChild(line);
      panel.scrollTop = panel.scrollHeight;
      origWarn.apply(console, arguments);
    };
    console.error = function() {
      const args = Array.from(arguments).map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
      const line = document.createElement('div');
      line.className = 'dt-console-line dt-console-error';
      line.textContent = args;
      panel.appendChild(line);
      panel.scrollTop = panel.scrollHeight;
      origError.apply(console, arguments);
    };
    overlay.addEventListener('remove', function() {
      console.log = origLog;
      console.warn = origWarn;
      console.error = origError;
    });
  })();

  // Elements tab: show body children
  (function() {
    const tree = document.getElementById('dt-elements').querySelector('.dt-dom-tree');
    function buildTree(el, depth) {
      if (depth > 5) return;
      const children = Array.from(el.children);
      children.forEach(child => {
        const item = document.createElement('div');
        item.className = 'dt-dom-item';
        item.style.paddingLeft = (depth * 16 + 8) + 'px';
        const tag = child.tagName.toLowerCase();
        const id = child.id ? '#' + child.id : '';
        const cls = child.className && typeof child.className === 'string' ? '.' + child.className.trim().split(/\s+/).join('.') : '';
        item.textContent = '<' + tag + id + cls + '>';
        item.dataset.selector = tag + (id || '') + (cls ? cls.replace(/\./g, '.') : '');
        item.style.cursor = 'pointer';
        item.addEventListener('click', function(e) {
          e.stopPropagation();
          overlay.querySelectorAll('.dt-dom-item').forEach(i => i.style.outline = '');
          this.style.outline = '2px solid var(--accent,#ff4444)';
          const sel = this.dataset.selector;
          try {
            const found = document.querySelector(sel);
            if (found) {
              found.style.outline = '2px solid #ff4444';
              setTimeout(() => found.style.outline = '', 2000);
            }
          } catch(e) {}
        });
        tree.appendChild(item);
        buildTree(child, depth + 1);
      });
    }
    buildTree(document.body, 0);
  })();

  // Network tab: intercept fetch
  (function() {
    const panel = document.getElementById('dt-network');
    const origFetch = window.fetch;
    window.fetch = function() {
      const url = arguments[0];
      const start = Date.now();
      const line = document.createElement('div');
      line.className = 'dt-network-line';
      line.textContent = 'REQ ' + (typeof url === 'string' ? url : url.url || '(url)');
      panel.appendChild(line);
      panel.scrollTop = panel.scrollHeight;
      return origFetch.apply(this, arguments).then(r => {
        const ms = Date.now() - start;
        line.textContent = (r.ok ? 'OK ' : 'ERR ') + r.status + ' ' + (typeof url === 'string' ? url : url.url || '(url)') + ' (' + ms + 'ms)';
        line.className = 'dt-network-line' + (r.ok ? '' : ' dt-network-err');
        panel.scrollTop = panel.scrollHeight;
        return r;
      }).catch(e => {
        line.textContent = 'FAIL ' + (typeof url === 'string' ? url : url.url || '(url)') + ' - ' + e.message;
        line.className = 'dt-network-line dt-network-err';
        panel.scrollTop = panel.scrollHeight;
        throw e;
      });
    };
    overlay.addEventListener('remove', function() { window.fetch = origFetch; });
  })();

  // Info tab
  (function() {
    const panel = document.getElementById('dt-info');
    panel.innerHTML = '';
    const info = [
      'User Agent: ' + navigator.userAgent,
      'Platform: ' + navigator.platform,
      'Screen: ' + screen.width + 'x' + screen.height,
      'Viewport: ' + window.innerWidth + 'x' + window.innerHeight,
      'Current User: ' + (currentUser || '(not logged in)'),
      'Is Owner: ' + OWNERS.includes(currentUser),
      'Theme: ' + (localStorage.getItem(THEME_KEY) || '(default)'),
      'Projects: ' + (getProjects().length || 0),
    ];
    info.forEach(text => {
      const line = document.createElement('div');
      line.className = 'dt-info-line';
      line.textContent = text;
      panel.appendChild(line);
    });
  })();
}

// ===== CHAT FUNCTIONS =====
function ok(t) { const d=document.createElement('div');d.className='run-line success';d.textContent=t;return d; }
function err(t) { const d=document.createElement('div');d.className='run-line error';d.textContent=t;return d; }

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
}

async function sendMessage(to, msg) {
  const url = SUPABASE_URL + '/rest/v1/chat_messages';
  const headers = {'apikey':SUPABASE_ANON_KEY,'Authorization':'Bearer '+SUPABASE_ANON_KEY,'Content-Type':'application/json'};
  try {
    const r = await fetch(url, { method:'POST', headers:{...headers,'Prefer':'return=representation'}, body:JSON.stringify({from_user:currentUser,to_user:to,message:msg}) });
    if (!r.ok) console.error('sendMessage failed:', r.status, await r.text());
  } catch(e) { console.error('sendMessage error:', e); }
  loadChatMessages();
}

function openChat(user) {
  chatPartner = user;
  document.getElementById('chatPanel').classList.remove('hidden');
  document.getElementById('chatWith').textContent = 'Chat with ' + user;
  document.getElementById('chatMessages').innerHTML = '';
  loadChatMessages();
  if (chatPoll) clearInterval(chatPoll);
  chatPoll = setInterval(loadChatMessages, 3000);
}

function closeChat() {
  chatPartner = null;
  document.getElementById('chatPanel').classList.add('hidden');
  if (chatPoll) { clearInterval(chatPoll); chatPoll = null; }
}

async function loadChatMessages() {
  if (!chatPartner) return;
  const url = SUPABASE_URL + '/rest/v1/chat_messages';
  const headers = {'apikey':SUPABASE_ANON_KEY,'Authorization':'Bearer '+SUPABASE_ANON_KEY};
  try {
    const r = await fetch(url, { method:'GET', headers });
    if (!r.ok) { console.error('loadChatMessages status:', r.status); return; }
    const all = await r.json();
    if (!Array.isArray(all)) return;
    const msgs = all.filter(m =>
      (m.from_user === currentUser && m.to_user === chatPartner) ||
      (m.from_user === chatPartner && m.to_user === currentUser)
    ).sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
    const container = document.getElementById('chatMessages');
    container.innerHTML = msgs.map(m =>
      '<div class="chat-msg ' + (m.from_user === currentUser ? 'self' : 'other') + '">' +
        m.message +
        '<span class="msg-time">' + formatTime(m.created_at) + '</span>' +
      '</div>'
    ).join('');
    container.scrollTop = container.scrollHeight;
  } catch(e) { console.error('loadChatMessages error:', e); }
}

async function checkFriendRequests() {
  if (!currentUser) return;
  const r = await sb('friend_requests').select({to_user:currentUser,status:'pending'});
  const notif = document.getElementById('friendNotif');
  if (r.ok && r.data && r.data.length) {
    notif.classList.remove('hidden');
    notif.title = r.data.length + ' pending friend request' + (r.data.length>1?'s':'');
  } else {
    notif.classList.add('hidden');
  }
}

// Chat panel events
document.getElementById('chatClose').addEventListener('click', closeChat);
document.getElementById('chatInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && this.value.trim() && chatPartner) {
    sendMessage(chatPartner, this.value.trim());
    this.value = '';
  }
});

// ===== TAB SWITCHING =====
function switchTab(tabId) {
  document.querySelectorAll('.topbar-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-content').forEach(c => {
    c.classList.toggle('active', c.id === 'tab-' + tabId);
  });
  if (tabId === 'code') {
    renderProjectList();
  }
}

document.querySelectorAll('.topbar-tab').forEach(tab => {
  tab.addEventListener('click', function() {
    const tabId = this.dataset.tab;
    if (this.classList.contains('owner-only') && !OWNERS.includes(currentUser)) return;
    switchTab(tabId);
    if (tabId === 'database') renderDB();
  });
});

// ===== EDIT TAB =====
document.getElementById('editModeToggle').addEventListener('click', function() {
  toggleEditMode();
  const isActive = document.body.classList.contains('edit-mode');
  this.textContent = isActive ? 'Disable Edit Mode' : 'Enable Edit Mode';
  document.getElementById('editModeStatus').textContent = isActive ? 'Enabled' : 'Disabled';
  document.getElementById('editModeStatus').style.color = isActive ? 'var(--accent)' : 'var(--text-muted)';
});
document.getElementById('editResetBtn').addEventListener('click', function() {
  if (confirm('Reset all layout changes? This cannot be undone.')) {
    localStorage.removeItem(EDIT_LAYOUT_KEY);
    location.reload();
  }
});
document.querySelectorAll('.edit-tab-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    const tool = this.dataset.tool;
    handleEditTool(tool);
  });
});

// ===== SITE SOURCE VIEWER =====
const GH_RAW = 'https://raw.githubusercontent.com/dude00614-hub/infinite-code-/main/';
let srcCurrentFile = 'index.html';
async function fetchAndDisplay(filename) {
  const status = document.getElementById('sourceStatus');
  const viewer = document.getElementById('sourceViewer');
  status.textContent = 'Loading ' + filename + '...';
  status.style.color = 'var(--text-muted)';
  try {
    const res = await fetch(GH_RAW + filename);
    if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
    const text = await res.text();
    viewer.textContent = text;
    status.textContent = filename + ' (' + text.split('\n').length + ' lines)';
    status.style.color = '#50e3c2';
  } catch (e) {
    viewer.textContent = 'Error loading ' + filename + ': ' + e.message;
    status.textContent = 'Failed to load';
    status.style.color = '#ff6b6b';
  }
}
document.querySelectorAll('.source-file-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.source-file-btn').forEach(b => {
      b.style.background = 'var(--bg-input)';
      b.style.color = 'var(--text-secondary)';
      b.style.border = '1px solid var(--border)';
    });
    this.style.background = 'var(--accent)';
    this.style.color = '#fff';
    this.style.border = 'none';
    srcCurrentFile = this.dataset.file;
    fetchAndDisplay(srcCurrentFile);
  });
});
document.getElementById('sourceRefreshBtn').addEventListener('click', function() {
  fetchAndDisplay(srcCurrentFile);
});
// Load initial file
fetchAndDisplay('index.html');




// ===== CUSTOM COMMAND SYSTEM (AI-managed) =====
const CC_KEY = 'ic_custom_commands';
function getCC() { try { return JSON.parse(localStorage.getItem(CC_KEY)) || []; } catch(e) { return []; } }
function saveCC(list) { localStorage.setItem(CC_KEY, JSON.stringify(list)); }
let editingCmdName = null;

function deleteCC(cmdName) {
  const list = getCC();
  const filtered = list.filter(c => c.cmdLine.toLowerCase().replace(/^@/,'') !== cmdName.toLowerCase().replace(/^@/,''));
  if (filtered.length === list.length) return false;
  saveCC(filtered);
  renderCustomCmdList();
  return true;
}

function editCC(cmdName) {
  const list = getCC();
  const c = list.find(x => x.cmdLine.toLowerCase().replace(/^@/,'') === cmdName.toLowerCase().replace(/^@/,''));
  if (!c) return;
  editingCmdName = c.cmdLine;
  showCmdBuilder(c.name.replace(/^@/,''), c.action, c.actionValue, c.description);
}
function renderCustomCmdList() {
  const el = document.getElementById('customCmdList');
  if (!el) return;
  const list = getCC();
  if (list.length === 0) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:8px 0;">No custom commands yet.</div>';
    return;
  }
  el.innerHTML = list.map(c => {
    const name = c.cmdLine;
    const desc = c.description || '';
    const actionLabel = c.action === 'showMessage' ? 'Msg' : c.action === 'openURL' ? 'URL' : c.action === 'switchTab' ? 'Tab' : c.action === 'setBackground' ? 'BG' : c.action === 'injectHTML' ? 'HTML' : c.action === 'eval' ? 'JS' : '?';
    return '<div style="display:flex;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;">' +
      '<span style="background:var(--bg-input);border:1px solid var(--border);border-radius:4px;padding:1px 6px;font-size:10px;color:var(--text-muted);min-width:28px;text-align:center;">' + actionLabel + '</span>' +
      '<span style="color:var(--accent);font-weight:500;min-width:90px;">' + name + '</span>' +
      '<span style="color:var(--text-secondary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;">' + desc + '</span>' +
      '<button class="edit-cc-btn" data-cmd="' + name + '" style="padding:4px 8px;font-size:11px;background:transparent;border:1px solid #50e3c2;border-radius:4px;color:#50e3c2;cursor:pointer;font-family:inherit;">Edit</button>' +
      '<button class="del-cc-btn" data-cmd="' + name + '" style="padding:4px 8px;font-size:11px;background:transparent;border:1px solid #ff4444;border-radius:4px;color:#ff4444;cursor:pointer;font-family:inherit;">Del</button>' +
      '</div>';
  }).join('');
  el.querySelectorAll('.edit-cc-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      editCC(this.getAttribute('data-cmd'));
    });
  });
  el.querySelectorAll('.del-cc-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      deleteCC(this.getAttribute('data-cmd'));
    });
  });
}

function checkCustomCommands(trimmed, outputEl) {
  const list = getCC();
  for (const c of list) {
    const cmdLower = c.cmdLine.toLowerCase();
    let param = '';
    let matched = trimmed.toLowerCase() === cmdLower;
    if (!matched && trimmed.toLowerCase().startsWith(cmdLower + ' ')) {
      param = trimmed.substring(cmdLower.length + 1).trim();
      if (param) matched = true;
    }
    if (!matched) continue;
    var val = c.actionValue.replace(/\{\?\}/g, param || '');
    if (c.action === 'switchTab') {
      const tabId = val;
      if (document.querySelector('.topbar-tab[data-tab="' + tabId + '"]')) {
        switchTab(tabId);
        outputEl.innerHTML += '<div class="output-line" style="color:#50e3c2">&#9654; Switched to ' + tabId + ' tab</div>';
      } else {
        outputEl.innerHTML += '<div class="output-line" style="color:#ff6b6b">&#10060; Tab "' + tabId + '" not found</div>';
      }
    } else if (c.action === 'showMessage') {
      outputEl.innerHTML += '<div class="output-line">' + val + '</div>';
    } else if (c.action === 'openURL') {
      window.open(val, '_blank');
      outputEl.innerHTML += '<div class="output-line" style="color:#50e3c2">&#128279; Opened ' + val + '</div>';
    } else if (c.action === 'setBackground') {
      let color = val;
      if (/^[0-9a-f]{3,8}$/i.test(color.replace('#', ''))) color = color.startsWith('#') ? color : '#' + color;
      document.getElementById('previewPanel').style.background = color;
      outputEl.innerHTML += '<div class="output-line" style="color:#50e3c2">&#9632; Background set</div>';
    } else if (c.action === 'injectHTML') {
      outputEl.innerHTML += val;
    } else if (c.action === 'eval') {
      try {
        var evalResult = Function('"use strict"; return (' + val + ')')();
        outputEl.innerHTML += '<div class="output-line" style="color:#50e3c2">= ' + evalResult + '</div>';
      } catch (e) {
        try {
          var evalResult2 = Function('"use strict"; ' + val)();
          outputEl.innerHTML += '<div class="output-line" style="color:#50e3c2">= ' + evalResult2 + '</div>';
        } catch (e2) {
          outputEl.innerHTML += '<div class="output-line" style="color:#ff6b6b">&#10060; Error: ' + e2.message + '</div>';
        }
      }
    }
    return true;
  }
  return false;
}

// ===== AI COMMAND GENERATOR =====
const AI_TEMPLATES = [
  { keywords: ['text', 'message', 'say', 'show', 'display', 'hello'], generate: function(input) {
    const colorMatch = input.match(/(red|blue|green|yellow|white|black|purple|orange|pink|teal|#?[0-9a-f]{3,8})\b/i);
    const colors = { red:'#ff4444', blue:'#448aff', green:'#50e3c2', yellow:'#ffd700', white:'#ffffff', black:'#000000', purple:'#8860ff', orange:'#ff9100', pink:'#f48fb1', teal:'#00c8b4' };
    const color = colorMatch ? (colors[colorMatch[1].toLowerCase()] || (colorMatch[1].startsWith('#')?colorMatch[1]:'#'+colorMatch[1])) : '#ff4444';
    let msg = input.replace(/show\s+a(n)?\s+\w+\s+message\s+(saying\s+)?/i, '').replace(/display?\s+/i, '').replace(/text\s+/i, '').replace(/say\s+/i, '').replace(/hello\s*/i, 'Hello ');
    msg = msg.replace(/\b(red|blue|green|yellow|white|black|purple|orange|pink|teal)\b/gi, '').trim() || 'Hello World';
    return { code: '@text [' + color + '] ' + msg + ' [set-true]', desc: 'Shows colored text in preview' };
  }},
  { keywords: ['background', 'bg', 'backdrop'], generate: function(input) {
    const colorMatch = input.match(/(#?[0-9a-f]{3,8})\b/i);
    const namedColors = { red:'#ff4444', blue:'#448aff', green:'#50e3c2', dark:'#000000', black:'#000000', white:'#ffffff' };
    let color = colorMatch ? (colorMatch[1].startsWith('#')?colorMatch[1]:'#'+colorMatch[1]) : '#ff4444';
    for (const [name, hex] of Object.entries(namedColors)) {
      if (input.toLowerCase().includes(name)) { color = hex; break; }
    }
    return { code: '@background [' + color + ']', desc: 'Sets preview background color' };
  }},
  { keywords: ['dart', 'darts', 'target', 'throw'], generate: function(input) {
    const scoreMatch = input.match(/(\d+)/);
    const score = scoreMatch ? scoreMatch[1] : '20';
    return { code: '@Target shot /1 "' + score + '"', desc: 'Creates a darts game with target score ' + score };
  }},
  { keywords: ['qr', 'qrcode', 'qr code', 'generate'], generate: function(input) {
    const linkMatch = input.match(/(https?:\/\/[^\s]+)|(link\s*[:=]\s*(https?:\/\/[^\s]+))/i) || input.match(/([a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    const link = linkMatch ? linkMatch[1] || linkMatch[2] || linkMatch[0] : 'https://example.com';
    return { code: '@generate [QR] (link: ' + link + ')', desc: 'Generates a QR code from a link' };
  }},
  { keywords: ['tic tac toe', 'tictactoe', 'ttt', 'game'], generate: function(input) {
    return { code: '@project tic tac toe /1', desc: 'Creates a playable Tic Tac Toe game' };
  }},
  { keywords: ['draw', 'canvas', 'paint', 'sketch'], generate: function(input) {
    return { code: '@canvas [draw]', desc: 'Opens an interactive drawing canvas' };
  }},
  { keywords: ['math', 'factorization', 'factor'], generate: function(input) {
    if (input.toLowerCase().includes('linear') || input.toLowerCase().includes('function')) {
      return { code: '@maths [learn] (Linear function)', desc: 'Shows linear function rules' };
    }
    return { code: '@maths [learn] (Factorization)', desc: 'Shows factorization rules' };
  }},
  { keywords: ['theology', 'god', 'religion'], generate: function() {
    return { code: '@theology [learn] (Overview)', desc: 'Shows theology overview' };
  }},
  { keywords: ['ecology', 'environment', 'nature'], generate: function() {
    return { code: '@ecology [learn] (Overview)', desc: 'Shows ecology overview' };
  }},
  { keywords: ['genetics', 'dna', 'gene'], generate: function() {
    return { code: '@genetics [learn] (Overview)', desc: 'Shows genetics overview' };
  }},
  { keywords: ['open', 'tab', 'new tab'], generate: function(input) {
    const urlMatch = input.match(/(https?:\/\/[^\s]+)|([a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (urlMatch) {
      let url = urlMatch[1] || urlMatch[2];
      if (!url.startsWith('http')) url = 'https://' + url;
      return { code: '@open [site] (' + url + ')', desc: 'Opens ' + url + ' in a new tab' };
    }
    if (input.includes('web') || input.includes('link') || input.includes('share')) {
      return { code: '@open [web]', desc: 'Opens preview with shareable blob link' };
    }
    return { code: '@open', desc: 'Opens code preview in a new tab' };
  }},
  { keywords: ['project', 'new project'], generate: function(input) {
    if (input.includes('close')) return { code: '@project [close]', desc: 'Closes the current project' };
    return { code: '@project [open]', desc: 'Opens a project block' };
  }},
  { keywords: ['switch tab', 'tab', 'settings tab', 'code tab', 'database tab', 'run tab'], generate: function(input) {
    const tabNames = {settings:'settings', code:'code', database:'database', run:'run', edit:'edit'};
    let tab = 'settings';
    for (const [key, val] of Object.entries(tabNames)) {
      if (input.toLowerCase().includes(key)) { tab = val; break; }
    }
    return { code: '@switch tab ' + tab, desc: 'Switches to the ' + tab + ' tab' };
  }},
];

function createCustomCmd(name, action, actionValue, desc) {
  const cmdLine = '@' + name.toLowerCase();
  const list = getCC();
  if (list.find(c => c.cmdLine === cmdLine)) return null;
  list.push({ cmdLine, name: cmdLine, params: '', description: desc || 'Custom command', action, actionValue });
  saveCC(list);
  return cmdLine;
}

function aiGenerateCommand(input) {
  const lower = input.toLowerCase().trim();
  if (!lower) return null;

  const SITE_NAMES = { google:'google.com', youtube:'youtube.com', github:'github.com', facebook:'facebook.com', twitter:'twitter.com', x:'x.com', instagram:'instagram.com', reddit:'reddit.com', wikipedia:'wikipedia.org', amazon:'amazon.com', netflix:'netflix.com', stackoverflow:'stackoverflow.com', npm:'npmjs.com', discord:'discord.com', twitch:'twitch.tv', spotify:'spotify.com', linkedin:'linkedin.com' };

  // Check for "create/make/new command" with explicit name ("called X", "named X", or @X)
  const explicitMatch = lower.match(/(?:create|make|new)\s+(?:a\s+)?command\s+(?:(?:called|named)\s+@?(\w+)|@(\w+))\s+(?:that\s+)?(?:to\s+)?(.*)/i);
  // Check for "create/make/new command" without explicit name (auto-generate name from intent)
  const implicitMatch = !explicitMatch && lower.match(/(?:create|make|new)\s+(?:a\s+)?command\s+(?:that\s+)?(?:to\s+)?(.+)/i);

  if (explicitMatch || implicitMatch) {
    let cmdName, intent;
    if (explicitMatch) {
      cmdName = (explicitMatch[1] || explicitMatch[2]).toLowerCase();
      intent = (explicitMatch[3] || '').trim();
    } else {
      intent = (implicitMatch[1] || '').trim();
      const stopWords = ['i','you','we','they','want','to','create','creates','make','makes','new','command','show','shows','display','displays','do','does','have','has','get','gets','draw','draws','paint','paints','render','renders','write','writes','run','runs','play','plays','set','sets','open','opens','close','closes','switch','switches','go','goes','start','starts','stop','stops','change','changes','toggle','toggles','use','uses','find','finds','search','searches','look','looks','add','adds','remove','removes','delete','deletes','insert','inserts','put','puts','tell','tells','ask','asks','call','calls','save','saves','load','loads','edit','edits','build','builds','generate','generates','test','tests','check','checks','try','tries','a','an','the','this','that','these','those','which','what','who','how','would','should','could','will','can','shall','may','might','must','for','of','in','on','at','by','with','from','into','like','just','then','there','here','some','any','each','every','both','all','no','not','it','its','my','your','our','their'];
      let nameStr = intent;
      for (let i = 0; i < 15; i++) { const p = nameStr; nameStr = nameStr.replace(new RegExp('^(' + stopWords.join('|') + ')\\s+', 'gi'), ''); if (nameStr === p) break; }
      const cleanParts = nameStr.trim().split(/\s+/);
      cmdName = (cleanParts.length > 0 ? cleanParts[0].toLowerCase().replace(/[^a-z0-9]/g, '') : false) || 'mycommand';
    }

    let action = 'showMessage';
    let actionValue = intent;
    let desc = 'Custom command: ' + intent;

    if (/opens?\s+(\S+)/i.test(intent)) {
      const urlMatch = intent.match(/opens?\s+(\S+)/i);
      if (urlMatch) {
        let url = urlMatch[1].trim().replace(/[^a-zA-Z0-9.:\/\-_~]+.*$/, '');
        const siteKey = url.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (SITE_NAMES[siteKey]) {
          url = 'https://' + SITE_NAMES[siteKey];
        } else if (!url.startsWith('http') && url.includes('.')) {
          url = 'https://' + url;
        } else if (!url.startsWith('http')) {
          url = 'https://' + url + '.com';
        }
        action = 'openURL';
        actionValue = url;
        desc = 'Opens ' + url;
      }
    } else if (/switch\s+tab|go\s+to\s+(\w+)\s+tab/i.test(intent)) {
      const tabMatch = intent.match(/(?:switch\s+tab|go\s+to)\s+(\w+)/i);
      action = 'switchTab';
      actionValue = tabMatch ? tabMatch[1].toLowerCase() : 'settings';
      desc = 'Switches to ' + actionValue + ' tab';
    } else if (/background|bg\s+/i.test(intent)) {
      action = 'setBackground';
      const colorMatch = intent.match(/(#?[0-9a-f]{3,8})\b/i);
      actionValue = colorMatch ? (colorMatch[1].startsWith('#')?colorMatch[1]:'#'+colorMatch[1]) : '#ff4444';
      desc = 'Sets background color';
    } else if (/circle|square|triangle|rectangle|shape|draw|paint/i.test(intent)) {
      action = 'injectHTML';
      let shapeType = 'circle';
      if (/square/i.test(intent)) shapeType = 'square';
      else if (/triangle/i.test(intent)) shapeType = 'triangle';
      else if (/rectangle/i.test(intent)) shapeType = 'rectangle';
      const namedColors = {red:'#ff4444',blue:'#448aff',green:'#50e3c2',yellow:'#ffd700',white:'#ffffff',black:'#000000',purple:'#8860ff',orange:'#ff9100',pink:'#f48fb1',teal:'#00c8b4',cyan:'#00e5ff',brown:'#a1887f',gray:'#9e9e9e',grey:'#9e9e9e'};
      let strokeColor = '#50e3c2';
      for (const [name, hex] of Object.entries(namedColors)) {
        if (intent.toLowerCase().includes(name)) { strokeColor = hex; break; }
      }
      const hexMatch = intent.match(/(#?[0-9a-f]{6})\b/i);
      if (hexMatch) strokeColor = hexMatch[1].startsWith('#') ? hexMatch[1] : '#' + hexMatch[1];
      const svgW = shapeType === 'rectangle' ? 300 : 200;
      const svgMap = {
        circle: '<svg width="200" height="200" style="display:block;margin:16px auto"><circle cx="100" cy="100" r="80" fill="none" stroke="' + strokeColor + '" stroke-width="4"/></svg>',
        square: '<svg width="200" height="200" style="display:block;margin:16px auto"><rect x="20" y="20" width="160" height="160" fill="none" stroke="' + strokeColor + '" stroke-width="4"/></svg>',
        triangle: '<svg width="200" height="200" style="display:block;margin:16px auto"><polygon points="100,20 180,180 20,180" fill="none" stroke="' + strokeColor + '" stroke-width="4"/></svg>',
        rectangle: '<svg width="300" height="200" style="display:block;margin:16px auto"><rect x="20" y="20" width="260" height="160" fill="none" stroke="' + strokeColor + '" stroke-width="4"/></svg>',
      };
      actionValue = svgMap[shapeType] || svgMap.circle;
      desc = 'Draws a ' + shapeType + ' in the preview';
    } else if (/calculat|calc|math|add|subtract|multiply|divide|\+|\-|\*|\//i.test(intent)) {
      action = 'eval';
      var ec2 = intent.match(/(\d+\s*[\+\-\*\/]\s*\d+)/);
      if (!ec2) ec2 = intent.match(/\(([^)]+)\)\s*([\+\-\*\/])\s*\(([^)]+)\)/);
      if (!ec2) ec2 = intent.match(/([\w]+)\s*([\+\-\*\/])\s*([\w]+)/);
      if (ec2) {
        var op2 = ec2[2] || '+';
        if (/add|plus|\+/i.test(intent)) op2 = '+';
        else if (/subtract|minus|\-/i.test(intent)) op2 = '-';
        else if (/multiply|times|\*/i.test(intent)) op2 = '*';
        else if (/divide|\//i.test(intent)) op2 = '/';
        var v1 = (ec2[1] || 'a').trim();
        var v2 = (ec2[3] || 'b').trim();
        actionValue = (isNaN(v1) || isNaN(v2)) ? '(a,b)=>a' + op2 + 'b' : v1 + op2 + v2;
      } else {
        if (/add|plus|\+/i.test(intent)) actionValue = '(a,b)=>a+b';
        else if (/subtract|minus|\-/i.test(intent)) actionValue = '(a,b)=>a-b';
        else if (/multiply|times|\*/i.test(intent)) actionValue = '(a,b)=>a*b';
        else if (/divide|\//i.test(intent)) actionValue = '(a,b)=>a/b';
        else actionValue = '(a,b)=>a+b';
      }
      desc = 'Calculates expression';
    }

    if (action === 'showMessage') {
      showCmdBuilder(cmdName, 'showMessage', intent, desc);
      return null;
    }
    const cmdLine = createCustomCmd(cmdName, action, actionValue, desc);
    if (cmdLine) {
      return { code: cmdLine, desc: desc + ' (new custom command)', isCustom: true };
    }
    return { code: '@' + cmdName, desc: desc };
  }

  // General "create/make/new X" (no "command" required) — always makes a custom command
  const generalCreate = lower.match(/(?:create|make|new)\s+(?:a|an|the|some|this|that)\s+(.+)/i) || lower.match(/(?:create|make|new)\s+(.+)/i);
  if (generalCreate) {
    const intent = generalCreate[1].trim();
    const stopWords = ['i','you','we','they','want','to','create','creates','make','makes','new','show','shows','display','displays','do','does','have','has','get','gets','draw','draws','paint','paints','render','renders','write','writes','run','runs','play','plays','set','sets','open','opens','close','closes','switch','switches','go','goes','start','starts','stop','stops','change','changes','toggle','toggles','use','uses','find','finds','search','searches','look','looks','add','adds','remove','removes','delete','deletes','insert','inserts','put','puts','tell','tells','ask','asks','call','calls','save','saves','load','loads','edit','edits','build','builds','generate','generates','test','tests','check','checks','try','tries','a','an','the','this','that','these','those','which','what','who','how','would','should','could','will','can','shall','may','might','must','for','of','in','on','at','by','with','from','into','like','just','then','there','here','some','any','each','every','both','all','no','not','it','its','my','your','our','their'];
    let nameStr = intent;
    for (let i = 0; i < 15; i++) { const p = nameStr; nameStr = nameStr.replace(new RegExp('^(' + stopWords.join('|') + ')\\s+', 'gi'), ''); if (nameStr === p) break; }
    const cleanParts = nameStr.trim().split(/\s+/);
    const cmdName = (cleanParts.length > 0 ? cleanParts[0].toLowerCase().replace(/[^a-z0-9]/g, '') : false) || 'mycommand';
    let action = 'showMessage';
    let actionValue = intent;
    let desc = 'Custom command: ' + intent;
    if (/opens?\s+(\S+)/i.test(intent)) {
      const urlMatch = intent.match(/opens?\s+(\S+)/i);
      if (urlMatch) {
        let url = urlMatch[1].trim().replace(/[^a-zA-Z0-9.:\/\-_~]+.*$/, '');
        const siteKey = url.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (SITE_NAMES[siteKey]) url = 'https://' + SITE_NAMES[siteKey];
        else if (!url.startsWith('http') && url.includes('.')) url = 'https://' + url;
        else if (!url.startsWith('http')) url = 'https://' + url + '.com';
        action = 'openURL'; actionValue = url; desc = 'Opens ' + url;
      }
    } else if (/switch\s+tab|go\s+to\s+(\w+)\s+tab/i.test(intent)) {
      const tabMatch = intent.match(/(?:switch\s+tab|go\s+to)\s+(\w+)/i);
      action = 'switchTab'; actionValue = tabMatch ? tabMatch[1].toLowerCase() : 'settings';
      desc = 'Switches to ' + actionValue + ' tab';
    } else if (/background|bg\s+/i.test(intent)) {
      const colorMatch = intent.match(/(#?[0-9a-f]{3,8})\b/i);
      actionValue = colorMatch ? (colorMatch[1].startsWith('#')?colorMatch[1]:'#'+colorMatch[1]) : '#ff4444';
      action = 'setBackground'; desc = 'Sets background color';
    } else if (/circle|square|triangle|rectangle|shape|draw|paint/i.test(intent)) {
      action = 'injectHTML';
      let shapeType = 'circle';
      if (/square/i.test(intent)) shapeType = 'square';
      else if (/triangle/i.test(intent)) shapeType = 'triangle';
      else if (/rectangle/i.test(intent)) shapeType = 'rectangle';
      const namedColors = {red:'#ff4444',blue:'#448aff',green:'#50e3c2',yellow:'#ffd700',white:'#ffffff',black:'#000000',purple:'#8860ff',orange:'#ff9100',pink:'#f48fb1',teal:'#00c8b4',cyan:'#00e5ff',brown:'#a1887f',gray:'#9e9e9e',grey:'#9e9e9e'};
      let strokeColor = '#50e3c2';
      for (const [name, hex] of Object.entries(namedColors)) {
        if (intent.toLowerCase().includes(name)) { strokeColor = hex; break; }
      }
      const hexMatch = intent.match(/(#?[0-9a-f]{6})\b/i);
      if (hexMatch) strokeColor = hexMatch[1].startsWith('#') ? hexMatch[1] : '#' + hexMatch[1];
      const svgMap = {
        circle: '<svg width="200" height="200" style="display:block;margin:16px auto"><circle cx="100" cy="100" r="80" fill="none" stroke="' + strokeColor + '" stroke-width="4"/></svg>',
        square: '<svg width="200" height="200" style="display:block;margin:16px auto"><rect x="20" y="20" width="160" height="160" fill="none" stroke="' + strokeColor + '" stroke-width="4"/></svg>',
        triangle: '<svg width="200" height="200" style="display:block;margin:16px auto"><polygon points="100,20 180,180 20,180" fill="none" stroke="' + strokeColor + '" stroke-width="4"/></svg>',
        rectangle: '<svg width="300" height="200" style="display:block;margin:16px auto"><rect x="20" y="20" width="260" height="160" fill="none" stroke="' + strokeColor + '" stroke-width="4"/></svg>',
      };
      actionValue = svgMap[shapeType] || svgMap.circle;
      desc = 'Draws a ' + shapeType + ' in the preview';
    } else if (/calculat|calc|math|add|subtract|multiply|divide|\+|\-|\*|\//i.test(intent)) {
      action = 'eval';
      var ec = intent.match(/(\d+\s*[\+\-\*\/]\s*\d+)/);
      if (!ec) ec = intent.match(/\(([^)]+)\)\s*([\+\-\*\/])\s*\(([^)]+)\)/);
      if (!ec) ec = intent.match(/([\w]+)\s*([\+\-\*\/])\s*([\w]+)/);
      if (ec) {
        var op = ec[2] || '+';
        if (/add|plus|\+/i.test(intent)) op = '+';
        else if (/subtract|minus|\-/i.test(intent)) op = '-';
        else if (/multiply|times|\*/i.test(intent)) op = '*';
        else if (/divide|\//i.test(intent)) op = '/';
        var v1 = (ec[1] || 'a').trim();
        var v2 = (ec[3] || 'b').trim();
        actionValue = (isNaN(v1) || isNaN(v2)) ? '(a,b)=>a' + op + 'b' : v1 + op + v2;
      } else {
        if (/add|plus|\+/i.test(intent)) actionValue = '(a,b)=>a+b';
        else if (/subtract|minus|\-/i.test(intent)) actionValue = '(a,b)=>a-b';
        else if (/multiply|times|\*/i.test(intent)) actionValue = '(a,b)=>a*b';
        else if (/divide|\//i.test(intent)) actionValue = '(a,b)=>a/b';
        else actionValue = '(a,b)=>a+b';
      }
      desc = 'Calculates expression';
    }
    if (action === 'showMessage') {
      showCmdBuilder(cmdName, 'showMessage', intent, desc);
      return null;
    }
    const cmdLine = createCustomCmd(cmdName, action, actionValue, desc);
    if (cmdLine) return { code: cmdLine, desc: desc + ' (new custom command)', isCustom: true };
    return { code: '@' + cmdName, desc: desc };
  }

  for (const tpl of AI_TEMPLATES) {
    if (tpl.keywords.some(k => lower.includes(k))) {
      const result = tpl.generate(input);
      if (result) return result;
    }
  }

  // Fallback: show builder modal
  showCmdBuilder('mycommand', 'showMessage', input, input);
  return null;
}

function showCmdBuilder(name, action, value, desc) {
  document.getElementById('builderName').value = name;
  document.getElementById('builderAction').value = action;
  document.getElementById('builderAction').dispatchEvent(new Event('change'));
  document.getElementById('builderValue').value = value;
  document.getElementById('builderDesc').value = desc;
  document.getElementById('builderStatus').style.display = 'none';
  document.getElementById('cmdBuilderOverlay').style.display = 'flex';
  document.getElementById('builderName').focus();
}

document.getElementById('builderAction').addEventListener('change', function() {
  const label = document.getElementById('builderValueLabel');
  const val = document.getElementById('builderValue');
  const map = {
    showMessage: 'Message text to display (use {?} for user input)',
    openURL: 'URL to open (e.g. https://google.com)',
    switchTab: 'Tab name (settings, code, preview, database)',
    setBackground: 'Hex color (e.g. #ff4444)',
    injectHTML: 'HTML to inject (use {?} for user input)',
    eval: 'JavaScript code to execute (e.g. 5+3 or (a,b)=>a+b)'
  };
  label.textContent = map[this.value] || 'Action value';
  val.placeholder = '';
});

function createFromBuilder() {
  const name = document.getElementById('builderName').value.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-\[\]\(\)\#\.]/g, '') || 'mycommand';
  const action = document.getElementById('builderAction').value;
  const value = document.getElementById('builderValue').value.trim();
  const desc = document.getElementById('builderDesc').value.trim() || 'Custom command';
  const status = document.getElementById('builderStatus');
  if (!value) {
    status.textContent = 'Action value is required.';
    status.style.color = '#ff6b6b';
    status.style.display = 'block';
    return;
  }
  if (action === 'eval' && !/[+\-*/(){}[\]=>]/.test(value) && value.split(/\s+/).length > 2) {
    status.textContent = 'That looks like plain text, not JavaScript code. Choose a different action or enter valid code.';
    status.style.color = '#ff6b6b';
    status.style.display = 'block';
    return;
  }
  const newCmdLine = '@' + name.toLowerCase();
  if (editingCmdName) {
    const list = getCC();
    const idx = list.findIndex(c => c.cmdLine === editingCmdName);
    if (idx >= 0) {
      list[idx].cmdLine = newCmdLine;
      list[idx].name = newCmdLine;
      list[idx].action = action;
      list[idx].actionValue = value;
      list[idx].description = desc;
      saveCC(list);
    }
    editingCmdName = null;
  } else {
    const cmdLine = createCustomCmd(name, action, value, desc);
    if (!cmdLine) {
      status.textContent = 'Command @' + name + ' already exists. Pick a different name.';
      status.style.color = '#ff6b6b';
      status.style.display = 'block';
      return;
    }
  }
  document.getElementById('cmdBuilderOverlay').style.display = 'none';
  const inputField = document.getElementById('aiGenInput');
  const statusSpan = document.getElementById('aiGenStatus');
  statusSpan.textContent = 'Command @' + name + ' saved! Type @' + name + ' in your code & Run.';
  statusSpan.style.color = '#50e3c2';
  inputField.value = '';
  renderCustomCmdList();
}

document.getElementById('builderCreateBtn').addEventListener('click', createFromBuilder);
document.getElementById('builderCancelBtn').addEventListener('click', function() {
  editingCmdName = null;
  document.getElementById('cmdBuilderOverlay').style.display = 'none';
});
document.getElementById('cmdBuilderOverlay').addEventListener('click', function(e) {
  if (e.target === this) this.style.display = 'none';
});
document.getElementById('builderValue').addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); createFromBuilder(); }
});

function aiInsertIntoEditor(code) {
  if (!code) return false;
  if (!currentProject) {
    return false;
  }
  const ta = document.getElementById('codeTextarea');
  const val = ta.value;
  const firstNewline = val.indexOf('\n');
  let insertPos;
  if (val.trim().startsWith('@inf') && firstNewline >= 0) {
    insertPos = firstNewline + 1;
  } else if (!val.trim()) {
    insertPos = 0;
    code = '@inf\n' + code;
  } else {
    insertPos = val.length;
  }
  ta.value = val.substring(0, insertPos) + code + '\n' + val.substring(insertPos);
  ta.selectionStart = ta.selectionEnd = insertPos + code.length + 1;
  ta.focus();
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

document.getElementById('aiGenBtn').addEventListener('click', function() {
  const input = document.getElementById('aiGenInput').value.trim();
  const status = document.getElementById('aiGenStatus');
  if (!input) {
    status.textContent = 'Describe what you want';
    status.style.color = '#ff6b6b';
    return;
  }
  const gen = aiGenerateCommand(input);
  if (gen === null) {
    if (document.getElementById('cmdBuilderOverlay').style.display === 'flex') {
      return;
    }
    status.textContent = 'Could not generate. Try different wording.';
    status.style.color = '#ff6b6b';
    return;
  }
  if (!currentProject) {
    status.textContent = 'Create or open a project first!';
    status.style.color = '#ff6b6b';
    switchTab('code');
    document.getElementById('newProjectBtn').click();
    return;
  }
  aiInsertIntoEditor(gen.code);
  switchTab('code');
  status.textContent = gen.isCustom ? 'New command @' + gen.code.replace('@','') + ' created! Type it in editor & Run.' : 'Done! Click Run to execute.';
  status.style.color = '#50e3c2';
  renderCustomCmdList();
});

// Allow Enter to trigger generation in AI input
document.getElementById('aiGenInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    document.getElementById('aiGenBtn').click();
  }
});

// ===== DATABASE =====
const DB_KEY = 'ic_database';
let dbFilterTag = null;
let dbSearchQuery = '';

function getDefaultDB() {
  return { entries: [
    { id: 1, command: '@inf', description: 'Must be the first line of all Infinite Code. Required for execution.', tags: ['required'], addedBy: 'system' },
    { id: 2, command: '@background [#hex]', description: 'Changes the preview background to the specified hex color. Example: @background [#ff0000]', tags: ['preview'], addedBy: 'system' },
    { id: 3, command: '@open', description: 'Opens the current code preview in a new browser tab.', tags: ['preview', 'console'], addedBy: 'system' },
    { id: 4, command: '@open [web]', description: 'Opens the preview in a new tab and displays a shareable blob URL in the output.', tags: ['preview', 'console'], addedBy: 'system' },
    { id: 5, command: '@run', description: 'Executes the current editor code from the command console.', tags: ['console'], addedBy: 'system' },
    { id: 6, command: '@edit [.inf] / @edit /edit', description: 'Toggles visual edit mode for owners. Allows clicking and dragging UI elements.', tags: ['edit-mode', 'owner'], addedBy: 'system' },
    { id: 7, command: '@edit /reset', description: 'Clears all saved edit layout changes and reloads the page.', tags: ['edit-mode', 'owner'], addedBy: 'system' },
    { id: 8, command: '@stop', description: 'Exits edit mode.', tags: ['edit-mode', 'owner'], addedBy: 'system' },
    { id: 9, command: '@code', description: 'Outputs the first 100 lines of the site source HTML in the /run terminal.', tags: ['run-command', 'owner'], addedBy: 'system' },
    { id: 10, command: '@link [open] CI', description: 'Opens the Command Input website in a new browser tab.', tags: ['link'], addedBy: 'system' },
    { id: 11, command: '@link [open] GP', description: 'Opens the Grandmaster Path search tool in a new tab.', tags: ['link'], addedBy: 'system' },
    { id: 12, command: '@link [open] (Grandmaster path)', description: 'Opens the Grandmaster Path search tool in a new tab (alias).', tags: ['link'], addedBy: 'system' },
    { id: 13, command: '@project [open]', description: 'Opens a project block.', tags: ['project'], addedBy: 'system' },
    { id: 14, command: '@project tic tac toe /N', description: 'Creates a playable Tic Tac Toe game with a unique number N.', tags: ['project', 'preview'], addedBy: 'system' },
    { id: 15, command: '@project [close]', description: 'Closes the current project.', tags: ['project'], addedBy: 'system' },
    { id: 16, command: '@text [color] message [set-true]', description: 'Adds colored text to the preview. Requires [set-true] to show. Example: @text [#ff0000] Hello [set-true]', tags: ['preview'], addedBy: 'system' },
    { id: 17, command: '@Target shot /N "score"', description: 'Creates a playable darts game with a target score. N is a unique ID, /N auto-assigns.', tags: ['preview', 'game'], addedBy: 'system' },
    { id: 18, command: '@maths [learn] (Factorization)', description: 'Shows a factorization rules card in the preview.', tags: ['maths', 'preview'], addedBy: 'system' },
    { id: 19, command: '@maths [learn] (Linear function)', description: 'Shows a linear function rules card in the preview.', tags: ['maths', 'preview'], addedBy: 'system' },
    { id: 20, command: '@dev [tools]', description: 'Opens the built-in Dev Tools panel for owners.', tags: ['run-command', 'owner'], addedBy: 'system' },
    { id: 21, command: '@theology [learn] (subject)', description: 'Shows a theology overview card in the preview.', tags: ['theology', 'preview'], addedBy: 'system' },
    { id: 22, command: '@ecology [learn] (subject)', description: 'Shows an ecology overview card in the preview.', tags: ['ecology', 'preview'], addedBy: 'system' },
    { id: 23, command: '@genetics [learn] (subject)', description: 'Shows a genetics overview card in the preview.', tags: ['genetics', 'preview'], addedBy: 'system' },
    { id: 24, command: '@assyriology [learn] (subject)', description: 'Shows an assyriology overview card in the preview.', tags: ['assyriology', 'preview'], addedBy: 'system' },
    { id: 25, command: '@sinology [learn] (subject)', description: 'Shows a sinology overview card in the preview.', tags: ['sinology', 'preview'], addedBy: 'system' },
    { id: 26, command: '@celtology [learn] (subject)', description: 'Shows a celtology overview card in the preview.', tags: ['celtology', 'preview'], addedBy: 'system' },
    { id: 27, command: '@philology [learn] (subject)', description: 'Shows a philology overview card in the preview.', tags: ['philology', 'preview'], addedBy: 'system' },
    { id: 28, command: '@bryology [learn] (subject)', description: 'Shows a bryology overview card in the preview.', tags: ['bryology', 'preview'], addedBy: 'system' },
    { id: 29, command: '@dendrology [learn] (subject)', description: 'Shows a dendrology overview card in the preview.', tags: ['dendrology', 'preview'], addedBy: 'system' },
    { id: 30, command: '@pomology [learn] (subject)', description: 'Shows a pomology overview card in the preview.', tags: ['pomology', 'preview'], addedBy: 'system' },
    { id: 31, command: '@meteorology [learn] (subject)', description: 'Shows a meteorology overview card in the preview.', tags: ['meteorology', 'preview'], addedBy: 'system' },
    { id: 32, command: '@oceanology [learn] (subject)', description: 'Shows an oceanology overview card in the preview.', tags: ['oceanology', 'preview'], addedBy: 'system' },
    { id: 33, command: '@technology [learn] (subject)', description: 'Shows a technology overview card in the preview.', tags: ['technology', 'preview'], addedBy: 'system' },
    { id: 34, command: '@marinebiology [learn] (subject)', description: 'Shows a marine biology overview card in the preview.', tags: ['marinebiology', 'preview'], addedBy: 'system' },
    { id: 35, command: '@cardiology [learn] (subject)', description: 'Shows a cardiology overview card in the preview.', tags: ['cardiology', 'preview'], addedBy: 'system' },
    { id: 36, command: '@neurology [learn] (subject)', description: 'Shows a neurology overview card in the preview.', tags: ['neurology', 'preview'], addedBy: 'system' },
    { id: 37, command: '@dermatology [learn] (subject)', description: 'Shows a dermatology overview card in the preview.', tags: ['dermatology', 'preview'], addedBy: 'system' },
    { id: 38, command: '@pathology [learn] (subject)', description: 'Shows a pathology overview card in the preview.', tags: ['pathology', 'preview'], addedBy: 'system' },
    { id: 39, command: '@generate [QR] (link:...)', description: 'Generates a QR code from a link in the preview.', tags: ['generate', 'preview'], addedBy: 'system' },
    { id: 40, command: '@canvas [draw]', description: 'Opens an interactive drawing canvas in the preview. Draw with mouse or touch.', tags: ['canvas', 'preview'], addedBy: 'system' },
  ]};
}

function getDB() {
  const data = localStorage.getItem(DB_KEY);
  if (!data) {
    const def = getDefaultDB();
    saveDB(def);
    return def;
  }
  try { return JSON.parse(data); } catch(e) { const def = getDefaultDB(); saveDB(def); return def; }
}

function saveDB(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
  db.entries.forEach(e => sb('db_entries').upsert({id:e.id,command:e.command,description:e.description,tags:e.tags||[],added_by:e.addedBy||'system'},'id'));
}

function getAllTags(db) {
  const tags = new Set(['upcoming codes']);
  db.entries.forEach(e => e.tags.forEach(t => tags.add(t)));
  return ['all', ...Array.from(tags).sort()];
}

function renderDB() {
  const db = getDB();
  const isOwner = OWNERS.includes(currentUser);
  document.getElementById('dbAddBtn').style.display = isOwner ? '' : 'none';

  // Render tags
  const tags = getAllTags(db);
  const tagsContainer = document.getElementById('dbTags');
  tagsContainer.innerHTML = tags.map(t =>
    '<button class="db-tag' + (t === dbFilterTag ? ' active' : '') + '" data-tag="' + t + '">' + t + '</button>'
  ).join('');
  tagsContainer.querySelectorAll('.db-tag').forEach(btn => {
    btn.addEventListener('click', function() {
      const tag = this.dataset.tag;
      dbFilterTag = tag === 'all' ? null : tag;
      renderDB();
    });
  });

  // Filter
  let entries = db.entries;
  if (dbFilterTag) entries = entries.filter(e => e.tags.includes(dbFilterTag));
  const q = dbSearchQuery.toLowerCase();
  if (q) entries = entries.filter(e => e.command.toLowerCase().includes(q) || e.description.toLowerCase().includes(q));

  const list = document.getElementById('dbList');
  if (entries.length === 0) {
    list.innerHTML = '<div class="db-empty">No entries found</div>';
    return;
  }
  list.innerHTML = entries.map(e =>
    '<div class="db-entry">' +
      '<div class="db-entry-command">' + e.command + '</div>' +
      '<div class="db-entry-desc">' + e.description + '</div>' +
      '<div class="db-entry-tags">' + e.tags.map(t => '<span class="db-entry-tag">' + t + '</span>').join('') + '</div>' +
    '</div>'
  ).join('');
}

// Search input
document.getElementById('dbSearch').addEventListener('input', function() {
  dbSearchQuery = this.value;
  renderDB();
});

// Add entry form
document.getElementById('dbAddBtn').addEventListener('click', function() {
  document.getElementById('dbFormCommand').value = '';
  document.getElementById('dbFormDesc').value = '';
  document.getElementById('dbFormTags').value = '';
  document.getElementById('dbFormOverlay').classList.remove('hidden');
  setTimeout(() => document.getElementById('dbFormCommand').focus(), 50);
});

document.getElementById('dbFormCancel').addEventListener('click', function() {
  document.getElementById('dbFormOverlay').classList.add('hidden');
});

document.getElementById('dbFormSave').addEventListener('click', function() {
  const command = document.getElementById('dbFormCommand').value.trim();
  const desc = document.getElementById('dbFormDesc').value.trim();
  const tagsStr = document.getElementById('dbFormTags').value.trim();
  if (!command || !desc) return;
  const tags = tagsStr ? tagsStr.split(',').map(t => t.trim().toLowerCase()).filter(Boolean) : [];
  const db = getDB();
  const maxId = db.entries.reduce((m, e) => Math.max(m, e.id), 0);
  db.entries.push({ id: maxId + 1, command, description: desc, tags, addedBy: currentUser });
  saveDB(db);
  document.getElementById('dbFormOverlay').classList.add('hidden');
  dbFilterTag = null;
  dbSearchQuery = '';
  document.getElementById('dbSearch').value = '';
  renderDB();
});

// ===== CANVAS DRAW =====
function renderCanvasHTML(canvasId) {
  const bgCard = getComputedStyle(document.body).getPropertyValue('--bg-card').trim() || '#1f1111';
  const border = getComputedStyle(document.body).getPropertyValue('--border').trim() || '#3a1a1a';
  const bgInput = getComputedStyle(document.body).getPropertyValue('--bg-input').trim() || '#261515';
  const textSec = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim() || '#a07070';
  return '<div class="canvas-wrap" style="margin:12px 0;padding:16px;background:' + bgCard + ';border:1px solid ' + border + ';border-radius:10px;">' +
    '<div class="canvas-toolbar" style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;">' +
      '<label style="font-size:12px;color:' + textSec + ';">Color: <input type="color" id="' + canvasId + '-color" value="#ffffff" style="width:32px;height:32px;border:none;border-radius:4px;cursor:pointer;background:transparent;vertical-align:middle;"></label>' +
      '<label style="font-size:12px;color:' + textSec + ';">Size: <input type="range" id="' + canvasId + '-size" min="1" max="20" value="3" style="width:80px;vertical-align:middle;"></label>' +
      '<span id="' + canvasId + '-size-val" style="font-size:12px;color:' + textSec + ';min-width:20px;">3</span>' +
      '<button id="' + canvasId + '-eraser" style="padding:4px 10px;font-size:12px;background:' + bgInput + ';border:1px solid ' + border + ';border-radius:5px;color:' + textSec + ';cursor:pointer;font-family:inherit;">Eraser</button>' +
      '<button id="' + canvasId + '-clear" style="padding:4px 10px;font-size:12px;background:linear-gradient(135deg,#cc2222,#ff4444);border:none;border-radius:5px;color:#fff;cursor:pointer;font-family:inherit;">Clear</button>' +
    '</div>' +
    '<canvas id="' + canvasId + '-canvas" style="width:100%;height:400px;background:#000;border:1px solid ' + border + ';border-radius:6px;cursor:crosshair;display:block;"></canvas>' +
  '</div>';
}

function initCanvas(canvasId) {
  const canvas = document.getElementById(canvasId + '-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const colorInput = document.getElementById(canvasId + '-color');
  const sizeInput = document.getElementById(canvasId + '-size');
  const sizeVal = document.getElementById(canvasId + '-size-val');
  const eraserBtn = document.getElementById(canvasId + '-eraser');
  const clearBtn = document.getElementById(canvasId + '-clear');
  let drawing = false;
  let eraser = false;
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
    return { x, y };
  }
  function startDraw(e) {
    e.preventDefault();
    drawing = true;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }
  function draw(e) {
    e.preventDefault();
    if (!drawing) return;
    const pos = getPos(e);
    ctx.strokeStyle = eraser ? '#000' : colorInput.value;
    ctx.lineWidth = parseInt(sizeInput.value, 10);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }
  function stopDraw(e) {
    e.preventDefault();
    drawing = false;
    ctx.beginPath();
  }
  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDraw);
  canvas.addEventListener('mouseleave', stopDraw);
  canvas.addEventListener('touchstart', startDraw, { passive: false });
  canvas.addEventListener('touchmove', draw, { passive: false });
  canvas.addEventListener('touchend', stopDraw);
  if (sizeInput) {
    sizeInput.addEventListener('input', function() {
      if (sizeVal) sizeVal.textContent = this.value;
    });
  }
  if (eraserBtn) {
    eraserBtn.addEventListener('click', function() {
      eraser = !eraser;
      this.style.background = eraser ? '#ff4444' : getComputedStyle(document.body).getPropertyValue('--bg-input').trim() || '#261515';
      this.style.color = eraser ? '#fff' : getComputedStyle(document.body).getPropertyValue('--text-secondary').trim() || '#a07070';
      this.textContent = eraser ? 'Draw' : 'Eraser';
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      resizeCanvas();
    });
  }
}

// ===== EXPORT / IMPORT DATA =====
document.getElementById('exportBtn').addEventListener('click', function() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    data[key] = localStorage.getItem(key);
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'infinite-code-backup.json';
  a.click();
  URL.revokeObjectURL(a.href);
  const status = document.getElementById('dataStatus');
  status.textContent = 'Exported ' + Object.keys(data).length + ' keys to infinite-code-backup.json';
  status.className = 'data-status success';
});

document.getElementById('importBtn').addEventListener('click', function() {
  document.getElementById('importFileInput').click();
});

document.getElementById('importFileInput').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      const data = JSON.parse(ev.target.result);
      let count = 0;
      for (const key of Object.keys(data)) {
        localStorage.setItem(key, data[key]);
        count++;
      }
      const status = document.getElementById('dataStatus');
      status.textContent = 'Imported ' + count + ' keys. Reloading...';
      status.className = 'data-status success';
      setTimeout(function() { location.reload(); }, 800);
    } catch(err) {
      const status = document.getElementById('dataStatus');
      status.textContent = 'Error: Invalid JSON file';
      status.className = 'data-status error';
    }
  };
  reader.readAsText(file);
  this.value = '';
});

// Hide loading overlay when video ends or after 6s
const loadingVideo = document.getElementById('loadingVideo');
const loadingOverlay = document.getElementById('loadingOverlay');
function hideLoading() {
  loadingOverlay.style.transition = 'opacity 0.6s';
  loadingOverlay.style.opacity = '0';
  setTimeout(() => { loadingOverlay.style.display = 'none'; }, 700);
}
if (loadingVideo) {
  loadingVideo.addEventListener('ended', hideLoading);
  loadingVideo.addEventListener('error', hideLoading);
  loadingVideo.load();
  loadingVideo.play();
}
setTimeout(hideLoading, 6000);

// Initialize custom commands list on load
renderCustomCmdList();
