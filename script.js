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

function getUsers() {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : {};
}

function saveUsers(users) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
  for (const [u,p] of Object.entries(users)) sb('users').upsert({username:u,password:p},'username');
}

function seedGuest() {
  const users = getUsers();
  if (!users['guest']) {
    users['guest'] = 'guestpass';
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

  users[username] = password;
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
      users['guest'] = r.data[0].password;
    } else {
      users['guest'] = 'guestpass';
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
  if (!users[username] || users[username] !== password) {
    const r = await sb('users').select({username});
    if (r.ok && r.data && r.data.length && r.data[0].password === password) {
      users[username] = password;
      saveUsers(users);
    } else {
      errorEl.textContent = 'Invalid username or password.';
      return;
    }
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
  if (!code.startsWith('@inf\n')) code = '@inf\n' + code;
  document.getElementById('codeTextarea').value = code;
  document.getElementById('editorTabs').innerHTML = '<div class="editor-tab active">' + proj.name + '</div><button class="preview-toggle" id="previewToggle" title="Toggle Preview">&#9654; Preview</button><button class="console-toggle" id="consoleToggle" title="Toggle Console">&#8801; Console</button>';
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
];

function highlightCode(code) {
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
  { label: '@open [blob]', desc: 'open with a shareable blob link' },
  { label: '@project [open]', desc: 'open a project' },
  { label: '@project tic tac toe', desc: 'create a tic tac toe game' },
  { label: '@project tic tac toe /', desc: 'create a tic tac toe game with a number' },
  { label: '@project [close]', desc: 'close the current project' },
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
  if (!filter.startsWith('@')) {
    dropdown.classList.remove('active');
    dropdown.innerHTML = '';
    suggestionIndex = -1;
    return;
  }
  const filtered = suggestionList.filter(s =>
    s.label.toLowerCase().startsWith(filter.toLowerCase())
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
  const prefixLen = beforeCursor.length;
  const replacement = label;
  textarea.value = value.substring(0, cursorPos - prefixLen) + replacement + value.substring(cursorPos);
  textarea.selectionStart = textarea.selectionEnd = cursorPos - prefixLen + replacement.length;
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
  if (!dropdown.classList.contains('active')) return;
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
  const lines = code.split('\n');
  let bgColor = '';
  const bgRegex = /^@background\s+\[(#?[0-9a-fA-F]{3,8})\]$/;
  const tttGames = [];
  let projectOpen = false;
  const usedNums = [];
  for (const line of lines) {
    const m = line.match(bgRegex);
    if (m) { bgColor = m[1].startsWith('#') ? m[1] : '#' + m[1]; continue; }
    const trimmed = line.trim();
    if (trimmed === '@project [open]') {
      projectOpen = true;
    } else if (trimmed === '@project [close]') {
      projectOpen = false;
    } else if (projectOpen) {
      const tttM = trimmed.match(/^@project\s+tic\s+tac\s+toe(?:\s+\/(\d+))?$/);
      if (tttM) {
        let num = tttM[1] || String(usedNums.length + 1);
        if (!usedNums.includes(num)) {
          usedNums.push(num);
          tttGames.push(num);
        }
      }
    }
  }
  const bgStyle = bgColor ? 'background:' + bgColor + ';' : '';
  const tttHTML = tttGames.map(num => renderTTTString(num)).join('');
  const html = '<!DOCTYPE html><html><head><title>Infinite Code - Preview</title><meta charset="utf-8"><style>body{margin:0;min-height:100vh;' + bgStyle + 'display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#140a0a;color:#e8c8c8;}</style></head><body>' + tttHTML + '</body></html>';
  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
  const blob = new Blob([html], { type: 'text/html' });
  return URL.createObjectURL(blob);
}

function renderTTTString(num) {
  return '<div style="display:flex;flex-direction:column;align-items:center;margin:16px;padding:16px;background:#1f1111;border:1px solid #3a1a1a;border-radius:10px;">' +
    '<div style="font-size:15px;font-weight:600;color:#ff4444;margin-bottom:10px;">Tic Tac Toe #' + num + '</div>' +
    '<div class="ttt-grid" data-num="' + num + '" style="display:grid;grid-template-columns:repeat(3,72px);gap:4px;"></div>' +
    '<div class="ttt-status" style="margin-top:10px;font-size:13px;color:#a07070;">Player X\'s turn</div>' +
    '<button class="ttt-reset" style="margin-top:8px;padding:5px 14px;background:linear-gradient(135deg,#cc2222,#ff4444);border:none;border-radius:5px;color:#fff;cursor:pointer;font-family:inherit;font-size:12px;">Reset</button>' +
    '<script>' +
    '(function(){' +
    'var g=document.querySelector(\'.ttt-grid[data-num="' + num + '"]\');' +
    'var s=g.parentElement.querySelector(\'.ttt-status\');' +
    'var b=Array(9).fill(null);var p="X";var o=false;' +
    'for(var i=0;i<9;i++){' +
    'var c=document.createElement("div");' +
    'c.style.cssText="width:72px;height:72px;background:#261515;border:2px solid #3a1a1a;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:bold;cursor:pointer;color:#ff4444;";' +
    'c.onclick=function(i){return function(){' +
    'if(b[i]||o)return;b[i]=p;this.textContent=p;' +
    'this.style.color=p==="X"?"#ff4444":"#50e3c2";' +
    'var w=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];' +
    'for(var k=0;k<w.length;k++){' +
    'if(b[w[k][0]]&&b[w[k][0]]===b[w[k][1]]&&b[w[k][1]]===b[w[k][2]]){' +
    'o=true;s.textContent="Player "+b[w[k][0]]+" wins!";' +
    'w[k].forEach(function(j){g.children[j].style.background="rgba(255,68,68,0.3)";});return;}}' +
    'if(b.every(function(v){return v!==null})){o=true;s.textContent="Draw!";return;}' +
    'p=p==="X"?"O":"X";s.textContent="Player "+p+"\'s turn";' +
    '}}(i));g.appendChild(c);}' +
    'g.parentElement.querySelector(\'.ttt-reset\').onclick=function(){' +
    'b=Array(9).fill(null);p="X";o=false;' +
    'g.querySelectorAll("div").forEach(function(x){x.textContent="";x.style.background="";x.style.color="#ff4444";});' +
    's.textContent="Player X\'s turn";};' +
    '})();' +
    '<\/script>' +
    '</div>';
}

function executeCode(code, outputEl) {
  outputEl.innerHTML = '';
  const previewPanel = document.getElementById('previewPanel');
  previewPanel.style.background = '';
  if (!code.startsWith('@inf\n')) {
    outputEl.innerHTML = '<div class="output-line" style="color:#ff6b6b">&#10060; Error: Code must start with @inf</div>';
    return;
  }
  const lines = code.split('\n');
  let bgColor = null;
  const bgRegex = /^@background\s+\[(#?[0-9a-fA-F]{3,8})\]$/;
  const usedNums = [];
  let projectOpen = false;
  for (const line of lines) {
    const bgM = line.match(bgRegex);
    if (bgM) { bgColor = bgM[1]; continue; }
    const trimmed = line.trim();
    if (trimmed === '@open') {
      openCodeInTab();
    } else if (trimmed === '@open [blob]') {
      const url = openCodeInTab();
      outputEl.innerHTML += '<div class="output-line" style="color:#50e3c2">Blob link: <a href="' + url + '" target="_blank" style="color:#50e3c2;text-decoration:underline;">' + url + '</a></div>';
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
      }
    }
  }
  if (bgColor) {
    previewPanel.style.background = bgColor.startsWith('#') ? bgColor : '#' + bgColor;
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
    if (!name.endsWith('.inf')) name += '.inf';
    const projects = getProjects();
    if (projects.find(p => p.name === name)) {
      input.focus();
      input.select();
      return;
    }
    projects.push({ name: name, code: '@inf\n' });
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

  if (input === '@open' || input === '@open [blob]') {
    const url = openCodeInTab();
    const msg = document.createElement('div');
    msg.className = 'cmd-console-line';
    msg.style.color = '#50e3c2';
    const label = input === '@open [blob]' ? 'Blob link' : 'Preview opened';
    msg.innerHTML = label + ': <a href="' + url + '" target="_blank" style="color:#50e3c2;text-decoration:underline;">' + url + '</a>';
    output.appendChild(msg);
  } else if (input === '@run') {
    const code = document.getElementById('codeTextarea').value || '';
    const result = document.createElement('div');
    result.className = 'cmd-console-line';
    executeCode(code, result);
    output.appendChild(result);
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
  // Sync projects from Supabase if local is empty
  const key = 'ic_projects_' + username;
  if (!localStorage.getItem(key)) {
    sb('projects').select({username}).then(r => {
      if (r.ok && r.data && r.data.length) {
        localStorage.setItem(key, JSON.stringify(r.data.map(p => ({name:p.name,code:p.code||''}))));
        renderProjectList();
      }
    });
  }
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
  } else {
    const msg = document.createElement('div');
    msg.className = 'run-line error';
    msg.textContent = 'Unknown command: ' + input;
    output.appendChild(msg);
  }

  this.value = '';
  output.scrollTop = output.scrollHeight;
});

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

// ===== DATABASE =====
const DB_KEY = 'ic_database';
let dbFilterTag = null;
let dbSearchQuery = '';

function getDefaultDB() {
  return { entries: [
    { id: 1, command: '@inf', description: 'Must be the first line of all Infinite Code. Required for execution.', tags: ['required'], addedBy: 'system' },
    { id: 2, command: '@background [#hex]', description: 'Changes the preview background to the specified hex color. Example: @background [#ff0000]', tags: ['preview'], addedBy: 'system' },
    { id: 3, command: '@open', description: 'Opens the current code preview in a new browser tab.', tags: ['preview', 'console'], addedBy: 'system' },
    { id: 4, command: '@open [blob]', description: 'Opens the preview in a new tab and displays a shareable blob URL in the output.', tags: ['preview', 'console'], addedBy: 'system' },
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
