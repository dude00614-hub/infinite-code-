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

// ===== ACCOUNT ADMIN (owner/admin-only) =====
const ADMINS_KEY = 'ic_admins';
const BANNED_KEY = 'ic_banned';
const AUDIT_KEY = 'ic_audit_log';

function getAdmins() {
  try {
    const extra = JSON.parse(localStorage.getItem(ADMINS_KEY) || '[]');
    return [...new Set([...OWNERS, ...(Array.isArray(extra) ? extra : [])])];
  } catch(e) { return [...OWNERS]; }
}
function isOwnerOrAdmin(u) { return !!u && getAdmins().includes(u); }

function getBanned() {
  try {
    const b = JSON.parse(localStorage.getItem(BANNED_KEY) || '[]');
    return Array.isArray(b) ? b : [];
  } catch(e) { return []; }
}
function isBanned(u) { return getBanned().includes(u); }
function saveBanned(list) {
  const prev = getBanned();
  localStorage.setItem(BANNED_KEY, JSON.stringify(list));
  list.forEach(u => sb('banned').upsert({username: u}, 'username'));
  prev.forEach(u => { if (!list.includes(u)) sb('banned').delete({username: u}); });
}
function saveAdmins(list) {
  const prev = getAdmins().filter(u => !OWNERS.includes(u));
  const clean = [...new Set(list)];
  localStorage.setItem(ADMINS_KEY, JSON.stringify(clean));
  clean.forEach(u => sb('admins').upsert({username: u}, 'username'));
  prev.forEach(u => { if (!clean.includes(u)) sb('admins').delete({username: u}); });
}
function getAuditLog() {
  try {
    const l = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
    return Array.isArray(l) ? l : [];
  } catch(e) { return []; }
}
function logAdminAction(actor, action, target, details) {
  const entry = { at: new Date().toISOString(), actor: actor || '(unknown)', action, target: target || '', details: details || '' };
  const log = getAuditLog();
  log.unshift(entry);
  localStorage.setItem(AUDIT_KEY, JSON.stringify(log.slice(0, 200)));
  sb('audit_log').insert({ actor: entry.actor, action: entry.action, target: entry.target, details: entry.details, created_at: entry.at });
  return entry;
}
async function refreshAccountState() {
  try {
    const r = await sb('admins').select({});
    if (r.ok && Array.isArray(r.data)) {
      const names = r.data.map(d => d.username).filter(Boolean);
      if (names.length) localStorage.setItem(ADMINS_KEY, JSON.stringify(names));
    }
  } catch(e) {}
  try {
    const r = await sb('banned').select({});
    if (r.ok && Array.isArray(r.data)) {
      const names = r.data.map(d => d.username).filter(Boolean);
      if (names.length) localStorage.setItem(BANNED_KEY, JSON.stringify(names));
    }
  } catch(e) {}
}
async function userExists(username) {
  if (getUsers()[username]) return true;
  const r = await sb('users').select({username});
  return !!(r.ok && r.data && r.data.length);
}
async function isBannedRemote(username) {
  const r = await sb('banned').select({username});
  return !!(r.ok && r.data && r.data.length);
}
async function getAllAccounts() {
  const names = new Set(Object.keys(getUsers()));
  try {
    const r = await sb('users').select({});
    if (r.ok && Array.isArray(r.data)) r.data.forEach(d => { if (d.username) names.add(d.username); });
  } catch(e) {}
  const admins = getAdmins();
  const banned = getBanned();
  return Array.from(names).sort().map(u => ({ username: u, admin: admins.includes(u), banned: banned.includes(u) }));
}

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

// ===== KEYBINDINGS & EDITOR PREFERENCES =====
const KB_ACTIONS = {
  run:              { label: 'Run', group: 'Code', keys: 'Ctrl+Enter' },
  save:             { label: 'Save Project', group: 'Code', keys: 'Ctrl+S' },
  'new-project':    { label: 'New Project', group: 'Code', keys: 'Ctrl+N' },
  'toggle-preview': { label: 'Toggle Preview', group: 'Code', keys: 'Ctrl+Shift+P' },
  'quick-code':     { label: 'Open Quick Code', group: 'Code', keys: 'Ctrl+Shift+K' },
  'focus-search':   { label: 'Focus Tab Search', group: 'Global', keys: 'Ctrl+K' },
  'tab-code':       { label: 'Go to Code', group: 'Navigation', keys: 'Ctrl+1' },
  'tab-database':   { label: 'Go to Database', group: 'Navigation', keys: 'Ctrl+2' },
  'tab-courses':    { label: 'Go to Courses', group: 'Navigation', keys: 'Ctrl+3' },
  'tab-settings':   { label: 'Go to Settings', group: 'Navigation', keys: 'Ctrl+4' },
  'tab-ire':        { label: 'Go to IRE', group: 'Navigation', keys: 'Ctrl+5' },
  'next-tab':       { label: 'Next Tab', group: 'Navigation', keys: 'Ctrl+Tab' },
  'prev-tab':       { label: 'Previous Tab', group: 'Navigation', keys: 'Ctrl+Shift+Tab' },
  'ire-fullscreen': { label: 'Toggle IRE Fullscreen', group: 'IRE', keys: 'Ctrl+Shift+F' },
  'ire-export':     { label: 'Export IRE Video', group: 'IRE', keys: 'Ctrl+Shift+E' },
  'exit-fullscreen':{ label: 'Exit Fullscreen', group: 'IRE', keys: 'Escape', always: true }
};

function kbUserSuffix() { return currentUser || 'guest'; }
function getKeybindingsKey() { return 'ic_keybindings_' + kbUserSuffix(); }
function getEditorPrefsKey() { return 'ic_editor_prefs_' + kbUserSuffix(); }

function getKeybindings() {
  var map = {};
  try { map = JSON.parse(localStorage.getItem(getKeybindingsKey()) || '{}'); } catch(e) { map = {}; }
  for (var id in KB_ACTIONS) {
    if (typeof map[id] !== 'string') map[id] = KB_ACTIONS[id].keys;
  }
  return map;
}

function saveKeybindings(map) {
  localStorage.setItem(getKeybindingsKey(), JSON.stringify(map));
  kbSyncServer();
}

const EDITOR_PREF_DEFAULTS = { fontSize: 14, tabWidth: 2, lineNumbers: true, autoCloseBrackets: true, wordWrap: true };

function getEditorPrefs() {
  var p = Object.assign({}, EDITOR_PREF_DEFAULTS);
  try {
    var raw = localStorage.getItem(getEditorPrefsKey());
    if (raw) Object.assign(p, JSON.parse(raw));
  } catch(e) {}
  return p;
}

function saveEditorPrefs(p) {
  localStorage.setItem(getEditorPrefsKey(), JSON.stringify(p));
}

function kbSyncServer() {
  if (!currentUser) return;
  sb('settings').upsert({ username: currentUser, keybindings: getKeybindings(), editor_prefs: getEditorPrefs() }, 'username');
}

var kbComboMap = {};
function kbRebuildMap() {
  kbComboMap = {};
  var map = getKeybindings();
  for (var id in KB_ACTIONS) {
    kbComboMap[map[id]] = id;
  }
}

function kbNormalizeKey(e) {
  var k = e.key;
  if (k === ' ') return 'Space';
  if (/^[a-z]$/i.test(k)) return k.toUpperCase();
  var shifted = { '!':'1','@':'2','#':'3','$':'4','%':'5','^':'6','&':'7','*':'8','(':'9',')':'0','_':'-','+':'=' };
  if (shifted[k]) return shifted[k];
  return k;
}

function kbComboString(e) {
  var parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  var k = kbNormalizeKey(e);
  if (k === 'Control' || k === 'Meta' || k === 'Alt' || k === 'Shift') return '';
  parts.push(k);
  return parts.join('+');
}

function kbHasModifier(combo) {
  return combo.indexOf('Ctrl') === 0 || combo.indexOf('Alt') === 0;
}

function kbIsTextKey(combo) {
  var k = combo.split('+').pop();
  return k.length === 1 || k === 'Space';
}

let kbRecording = null;

function kbGlobalKeydown(e) {
  if (kbRecording) {
    kbCaptureKey(e);
    return;
  }
  var ide = document.getElementById('ide');
  if (ide && ide.classList.contains('hidden')) return;
  var combo = kbComboString(e);
  if (!combo) return;
  var actionId = kbComboMap[combo];
  if (!actionId) return;
  var action = KB_ACTIONS[actionId];
  if (!action) return;
  var hasMod = kbHasModifier(combo);
  var editable = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.target.isContentEditable);
  if (!hasMod && kbIsTextKey(combo) && editable) return;
  if (hasMod) {
    e.preventDefault();
    e.stopPropagation();
  } else if (!kbIsTextKey(combo)) {
    e.preventDefault();
  }
  kbDispatch(actionId);
}

function kbDispatch(actionId) {
  switch (actionId) {
    case 'run': {
      var active = document.querySelector('.topbar-tab.active');
      var tabId = active ? active.dataset.tab : 'code';
      if (tabId === 'ire') {
        runIRE();
      } else {
        var runBtn = document.getElementById('runCodeBtn');
        if (runBtn) runBtn.click();
      }
      break;
    }
    case 'save': {
      var ta = document.getElementById('codeTextarea');
      if (currentProject && ta) {
        currentProject.code = ta.value;
        saveProjects(getProjects().map(function(p) { return p.name === currentProject.name ? currentProject : p; }));
        kbToast('Saved "' + currentProject.name + '"');
      } else if (ta) {
        kbToast('No project open');
      }
      break;
    }
    case 'new-project': { var b = document.getElementById('newProjectBtn'); if (b) b.click(); break; }
    case 'toggle-preview': { var b = document.getElementById('previewToggle'); if (b) b.click(); break; }
    case 'quick-code': { var b = document.getElementById('quickCodeBtn'); if (b) b.click(); break; }
    case 'focus-search': { var inp = document.getElementById('navSearchInput'); if (inp) { inp.focus(); inp.select(); } break; }
    case 'tab-code': switchTab('code'); break;
    case 'tab-database': switchTab('database'); break;
    case 'tab-courses': switchTab('courses'); break;
    case 'tab-settings': switchTab('settings'); break;
    case 'tab-ire': switchTab('ire'); break;
    case 'next-tab': kbCycleTab(1); break;
    case 'prev-tab': kbCycleTab(-1); break;
    case 'ire-fullscreen': toggleIREFullscreen(); break;
    case 'ire-export': exportIREVideo(); break;
    case 'exit-fullscreen': {
      var panel = document.getElementById('irePreviewPanel');
      if (panel && panel.classList.contains('ire-fullscreen')) toggleIREFullscreen();
      break;
    }
  }
}

function kbCycleTab(dir) {
  var btns = Array.prototype.slice.call(document.querySelectorAll('.topbar-tab'));
  var visible = btns.filter(function(b) { return b.style.display !== 'none'; });
  if (!visible.length) return;
  var idx = visible.findIndex(function(b) { return b.classList.contains('active'); });
  if (idx < 0) idx = 0;
  var next = visible[(idx + dir + visible.length) % visible.length];
  if (next) switchTab(next.dataset.tab);
}

function kbToast(msg) {
  var t = document.getElementById('kbToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'kbToast';
    t.className = 'kb-toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(function() { t.classList.remove('show'); }, 1800);
}

function kbStartRecording(actionId) {
  kbRecording = actionId;
  document.querySelectorAll('.kb-key').forEach(function(b) {
    b.classList.toggle('recording', b.dataset.action === actionId);
    if (b.dataset.action === actionId) b.innerHTML = 'Press keys...';
  });
  setKbStatus('Press a new key combination for "' + KB_ACTIONS[actionId].label + '". Escape cancels.');
}

function kbStopRecording() {
  kbRecording = null;
  renderKeybindings();
  setKbStatus('');
}

function kbCaptureKey(e) {
  e.preventDefault();
  e.stopPropagation();
  var actionId = kbRecording;
  if (!actionId) return;
  if (e.key === 'Escape') { kbStopRecording(); return; }
  var combo = kbComboString(e);
  if (!combo) return;
  if (!kbHasModifier(combo) && !/^F\d{1,2}$/.test(combo.split('+').pop())) {
    setKbStatus('Use a modifier key (Ctrl/Alt) plus a key, or a function key. Escape cancels.', true);
    return;
  }
  var conflict = kbConflict(combo, actionId);
  if (conflict) {
    setKbStatus('Conflict: ' + combo + ' is already assigned to "' + KB_ACTIONS[conflict].label + '". Choose another combination.', true);
    return;
  }
  var map = getKeybindings();
  map[actionId] = combo;
  saveKeybindings(map);
  kbRebuildMap();
  kbRecording = null;
  renderKeybindings();
  setKbStatus('"' + KB_ACTIONS[actionId].label + '" is now bound to ' + combo + '.');
}

function kbConflict(combo, exceptId) {
  var map = getKeybindings();
  for (var id in KB_ACTIONS) {
    if (id !== exceptId && map[id] === combo) return id;
  }
  return null;
}

function kbFormatKeys(keys) {
  return String(keys).split('+').map(function(k) { return '<kbd>' + k + '</kbd>'; }).join('<span class="kb-plus">+</span>');
}

function renderKeybindings() {
  var listEl = document.getElementById('keybindingsList');
  if (!listEl) return;
  var map = getKeybindings();
  var groups = ['Code', 'Global', 'Navigation', 'IRE'];
  var html = '';
  groups.forEach(function(g) {
    var items = Object.keys(KB_ACTIONS).filter(function(id) { return KB_ACTIONS[id].group === g; });
    if (!items.length) return;
    html += '<div class="kb-group">' + g + '</div>';
    items.forEach(function(id) {
      html += '<div class="keybinding-row"><span class="kb-action-label">' + KB_ACTIONS[id].label + '</span>' +
              '<button class="kb-key" data-action="' + id + '" title="Click to change shortcut">' + kbFormatKeys(map[id]) + '</button></div>';
    });
  });
  listEl.innerHTML = html;
  listEl.querySelectorAll('.kb-key').forEach(function(btn) {
    btn.addEventListener('click', function() { kbStartRecording(this.dataset.action); });
  });
}

function setKbStatus(msg, isError) {
  var el = document.getElementById('keybindingsStatus');
  if (!el) return;
  el.textContent = msg;
  el.className = 'data-status' + (msg ? (isError ? ' error' : ' success') : '');
}

function applyEditorPrefs() {
  var p = getEditorPrefs();
  var fs = p.fontSize + 'px';
  ['editorHighlight', 'highlightCode', 'codeTextarea', 'lineNumbers', 'ireHighlight', 'ireHighlightCode', 'ireEditor'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.fontSize = fs;
  });
  ['editorHighlight', 'codeTextarea', 'ireHighlight', 'ireEditor'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.tabSize = p.tabWidth;
  });
  var ln = document.getElementById('lineNumbers');
  if (ln) ln.style.display = p.lineNumbers ? '' : 'none';
  var wrapWs = p.wordWrap ? 'pre-wrap' : 'pre';
  var wrapOx = p.wordWrap ? 'hidden' : 'auto';
  var ct = document.getElementById('codeTextarea');
  var ch = document.getElementById('editorHighlight');
  var ie = document.getElementById('ireEditor');
  var ih = document.getElementById('ireHighlight');
  if (ct) { ct.style.whiteSpace = wrapWs; ct.style.overflowX = wrapOx; }
  if (ch) ch.style.whiteSpace = wrapWs;
  if (ie) { ie.style.whiteSpace = wrapWs; ie.style.overflowX = wrapOx; }
  if (ih) ih.style.whiteSpace = wrapWs;
}

function handleAutoCloseBrackets(e, ta) {
  if (!getEditorPrefs().autoCloseBrackets) return false;
  var openClose = { '(': ')', '[': ']', '{': '}' };
  var closeOpen = { ')': '(', ']': '[', '}': '{' };
  var start = ta.selectionStart;
  var end = ta.selectionEnd;
  if (e.key in openClose) {
    e.preventDefault();
    var open = e.key;
    var close = openClose[open];
    if (start !== end) {
      var sel = ta.value.substring(start, end);
      ta.setRangeText(open + sel + close, start, end, 'end');
    } else {
      ta.setRangeText(open + close, start, end, 'end');
      ta.selectionStart = ta.selectionEnd = start + 1;
    }
    ta.dispatchEvent(new Event('input'));
    return true;
  }
  if (e.key in closeOpen) {
    if (start === end && ta.value.charAt(start) === e.key) {
      e.preventDefault();
      ta.selectionStart = ta.selectionEnd = start + 1;
      return true;
    }
  }
  return false;
}

function refreshSettingsControls() {
  var p = getEditorPrefs();
  var fsInput = document.getElementById('prefFontSize');
  var fsVal = document.getElementById('prefFontSizeVal');
  var tw = document.getElementById('prefTabWidth');
  var lnChk = document.getElementById('prefLineNumbers');
  var acChk = document.getElementById('prefAutoClose');
  var wwChk = document.getElementById('prefWordWrap');
  if (fsInput) fsInput.value = p.fontSize;
  if (fsVal) fsVal.textContent = p.fontSize + 'px';
  if (tw) tw.value = String(p.tabWidth);
  if (lnChk) lnChk.checked = !!p.lineNumbers;
  if (acChk) acChk.checked = !!p.autoCloseBrackets;
  if (wwChk) wwChk.checked = !!p.wordWrap;
  renderKeybindings();
}

function wireSettingsControls() {
  var fsInput = document.getElementById('prefFontSize');
  var fsVal = document.getElementById('prefFontSizeVal');
  var tw = document.getElementById('prefTabWidth');
  var lnChk = document.getElementById('prefLineNumbers');
  var acChk = document.getElementById('prefAutoClose');
  var wwChk = document.getElementById('prefWordWrap');

  function setPrefStatus(msg) {
    var el = document.getElementById('editorPrefsStatus');
    if (el) { el.textContent = msg; el.className = 'data-status' + (msg ? ' success' : ''); }
  }

  fsInput.addEventListener('input', function() {
    var p2 = getEditorPrefs();
    p2.fontSize = parseInt(this.value, 10) || 14;
    saveEditorPrefs(p2);
    applyEditorPrefs();
    fsVal.textContent = this.value + 'px';
    setPrefStatus('Font size: ' + this.value + 'px');
  });
  fsInput.addEventListener('change', kbSyncServer);
  tw.addEventListener('change', function() {
    var p2 = getEditorPrefs();
    p2.tabWidth = parseInt(this.value, 10) || 2;
    saveEditorPrefs(p2);
    applyEditorPrefs();
    kbSyncServer();
    setPrefStatus('Tab width: ' + p2.tabWidth + ' spaces');
  });
  lnChk.addEventListener('change', function() {
    var p2 = getEditorPrefs();
    p2.lineNumbers = this.checked;
    saveEditorPrefs(p2);
    applyEditorPrefs();
    kbSyncServer();
    setPrefStatus('Line numbers ' + (p2.lineNumbers ? 'shown' : 'hidden'));
  });
  acChk.addEventListener('change', function() {
    var p2 = getEditorPrefs();
    p2.autoCloseBrackets = this.checked;
    saveEditorPrefs(p2);
    applyEditorPrefs();
    kbSyncServer();
    setPrefStatus('Auto-close brackets ' + (p2.autoCloseBrackets ? 'on' : 'off'));
  });
  wwChk.addEventListener('change', function() {
    var p2 = getEditorPrefs();
    p2.wordWrap = this.checked;
    saveEditorPrefs(p2);
    applyEditorPrefs();
    kbSyncServer();
    setPrefStatus('Word wrap ' + (p2.wordWrap ? 'on' : 'off'));
  });
  document.getElementById('keybindingsResetBtn').addEventListener('click', function() {
    var map = {};
    for (var id in KB_ACTIONS) map[id] = KB_ACTIONS[id].keys;
    saveKeybindings(map);
    kbRebuildMap();
    renderKeybindings();
    setKbStatus('All keybindings restored to defaults.');
  });
  document.addEventListener('click', function(e) {
    if (kbRecording && !e.target.closest('.kb-key')) kbStopRecording();
  });
  refreshSettingsControls();
}

function kbLoad() {
  kbRebuildMap();
  refreshSettingsControls();
  applyEditorPrefs();
}

kbLoad();
wireSettingsControls();
document.addEventListener('keydown', kbGlobalKeydown, true);

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

  if (isBanned(username) || await isBannedRemote(username)) {
    errorEl.textContent = 'This account has been banned and cannot log in.';
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

  refreshAccountState();


  const isOwner = isOwnerOrAdmin(username);

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
    /(@project\s+(?:\[open\]|tic\s+tac\s+toe(?:\s+\/\d+)?|\[close\]|\[name\(\s*"[^"]*"\s*\)\]))|(@\w+)|(\[#?[0-9a-fA-F]{3,8}\])/g,
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
  { label: '@switch tab [name]', desc: 'switch to a tab (code, database, run, edit, courses, settings)' },
  { label: '@project [name("projectName")]', desc: 'set the current project name' },
  { label: '@provider [description("text")]', desc: 'set a project description shown in listings' },
  { label: '@player [id=("name")]', desc: 'declare a controllable player entity' },
  { label: '@opponent [op="type"] [id=("name")]', desc: 'declare an NPC/opponent entity (grunt, boss, ...)' },
  { label: '@enemy [shoot] [Pid=("player")] [Eid=("enemy")]', desc: 'make enemy Eid shoot at player Pid' },
  { label: '@position [set] [id=("entity")] (x, y, z)', desc: 'set an entity position' },
  { label: '@position [set] [spawnpoint] [id=("entity")] (x, y, z)', desc: 'set a spawn point for an entity' },
  { label: '@transition [animation] [id=("entity")] [position(x, y, z)]', desc: 'smoothly animate an entity to a position' },
  { label: '@frame [type("floor")] [position(x, y, z)] [width(n)] [height(n)] [color("name")] [set-true]', desc: 'declare a structural frame/platform' },
  { label: '@add [structure] [id=("name")]', desc: 'add a structure entity to configure via @frame' },
  { label: '@transportation [type("walk")] (WASD)', desc: 'bind movement keys for the player (WASD or arrow keys)' },
  { label: '@recharge [set] <weapon> (mouse right click)', desc: 'bind a weapon reload to right mouse button' },
  { label: '@shoot [set] <weapon> (mouse left click)', desc: 'bind a weapon shoot to left mouse button' },
  { label: '@view [set] (bird\'s eye view)', desc: 'set the camera to a top-down bird\'s eye view' },
  { label: '@view [set] (first person view)', desc: 'set a first-person camera following the player' },
  { label: '@color [fill] (id=("entity")) (Head) [color("red")]', desc: 'set a body part color (Head/Body/Legs/Boots/Arms/Full)' },
  { label: '@emote [set] (id=("entity")) ("wave") [duration(2)]', desc: 'play a named emote animation for a duration' },
  { label: '@open [web] [settrue]', desc: 'allow the project to open external web content' },
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
  if (handleAutoCloseBrackets(e, this)) return;
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
  gameDisposeWorld();
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
  const gameParsed = parseGameProject(code);
  if (gameParsed.hasGame) {
    if (gameParsed.errors.length) {
      gameParsed.errors.forEach(function(e) {
        outputEl.innerHTML += '<div class="output-line" style="color:#ff6b6b">&#10060; ' + e + '</div>';
      });
      outputEl.innerHTML += '<div class="output-line" style="color:#888">Game project rejected — fix the errors above.</div>';
      return;
    }
    runGameWorld(gameParsed, outputEl, previewPanel);
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
  // Sync courses from Supabase so all members see the same courses
  sb('courses').select({}).then(r => {
    if (r.ok && r.data && r.data.length) {
      var localCourses = getCourses();
      var merged = r.data.map(function(c) { return {id:c.id,title:c.title,content:c.content,author:c.author||'',createdAt:new Date(c.created_at).toLocaleDateString()}; });
      for (var i = 0; i < localCourses.length; i++) {
        var exists = merged.some(function(m) { return m.id === localCourses[i].id; });
        if (!exists) merged.push(localCourses[i]);
      }
      localStorage.setItem(COURSES_KEY, JSON.stringify(merged));
    }
  });
  // Sync custom commands from Supabase so all members see the same commands
  sb('commands').select({}).then(r => {
    if (r.ok && r.data && r.data.length) {
      var serverCC = r.data.map(function(c) { return {cmdLine:c.cmd_line, name:c.name||c.cmd_line, params:'', description:c.description||'Custom command', action:c.action, actionValue:c.action_value}; });
      var localCC = getCC();
      var merged = serverCC.concat(localCC.filter(function(l) { return !serverCC.some(function(s) { return s.cmdLine === l.cmdLine; }); }));
      localStorage.setItem(CC_KEY, JSON.stringify(merged));
      renderCustomCmdList();
    }
  });
  mpSyncCustom();
  // Load per-user keybindings + editor preferences (local first, then Supabase)
  kbLoad();
  sb('settings').select({username}).then(r => {
    if (r.ok && r.data && r.data.length && r.data[0]) {
      const s = r.data[0];
      if (s.keybindings) localStorage.setItem('ic_keybindings_' + username, JSON.stringify(s.keybindings));
      if (s.editor_prefs) localStorage.setItem('ic_editor_prefs_' + username, JSON.stringify(s.editor_prefs));
      kbLoad();
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
    if (!isOwnerOrAdmin(currentUser)) {
      output.appendChild(err('Owners only'));
    } else {
      openDevTools();
      output.appendChild(ok('Dev Tools opened'));
    }
  } else if (input === '@help') {
    handleHelpCommand(output);
  } else if (input.startsWith('@account')) {
    handleAccountCommand(input, output);
  } else {
    const msg = document.createElement('div');
    msg.className = 'run-line error';
    msg.textContent = 'Unknown command: ' + input;
    output.appendChild(msg);
  }

  this.value = '';
  output.scrollTop = output.scrollHeight;
});

// ===== HELP =====
function handleHelpCommand(output) {
  const seen = {};
  const emit = function(cmd, desc, tags) {
    const key = cmd.toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    const line = document.createElement('div');
    line.className = 'run-line';
    line.innerHTML = '<span style="color:var(--accent)">@ ' + cmd + '</span> — ' + desc +
      (tags && tags.length ? ' <span style="color:var(--text-muted)">[' + tags.join(', ') + ']</span>' : '');
    output.appendChild(line);
  };
  output.appendChild(ok('Available commands:'));
  const db = getDB();
  db.entries.forEach(e => emit(e.command, e.description, e.tags || []));
  emit('@account [ban] (user "username")', 'Bans a user account. They can no longer log in. Add [force] after [ban] to ban an admin/owner with confirmation.', ['run-command', 'owner']);
  emit('@account [unban] (user "username")', 'Unbans a user account, restoring login access.', ['run-command', 'owner']);
  emit('@account [set] <admin> (user "username")', 'Promotes a user to admin/owner status.', ['run-command', 'owner']);
  emit('@account [set] <password> (user "username") ("newPassword")', 'Resets a user\'s password to the given new value (stored hashed).', ['run-command', 'owner']);
  emit('@account [list]', 'Lists all accounts with admin and ban status.', ['run-command', 'owner']);
  emit('@help', 'Lists all available commands.', ['run-command']);
  output.scrollTop = output.scrollHeight;
}

// ===== ACCOUNT ADMIN COMMANDS =====
async function handleAccountCommand(input, output) {
  if (!isOwnerOrAdmin(currentUser)) {
    output.appendChild(err('Permission denied: owner/admin only.'));
    return;
  }
  await refreshAccountState();

  const mList = /^@account\s+\[list\]/i.exec(input);
  if (mList) {
    const accounts = await getAllAccounts();
    if (!accounts.length) {
      output.appendChild(ok('No accounts found.'));
      return;
    }
    output.appendChild(ok('Accounts (' + accounts.length + '):'));
    accounts.forEach(a => {
      const line = document.createElement('div');
      line.className = 'run-line';
      line.textContent = '  ' + a.username + ' — ' + (a.admin ? 'admin' : 'member') + ' — ' + (a.banned ? 'banned' : 'active');
      output.appendChild(line);
    });
    const log = getAuditLog().slice(0, 5);
    if (log.length) {
      output.appendChild(ok('Recent account actions:'));
      log.forEach(l => {
        const line = document.createElement('div');
        line.className = 'run-line';
        line.textContent = '  ' + new Date(l.at).toLocaleString() + ' — ' + l.actor + ' — ' + l.action + (l.target ? ' ' + l.target : '');
        output.appendChild(line);
      });
    }
    return;
  }

  const mBan = /^@account\s+\[ban\](\s+\[force\])?\s+\(user\s+"([^"]+)"\)/i.exec(input);
  if (mBan) {
    const target = mBan[2];
    const force = !!mBan[1];
    if (!(await userExists(target))) {
      output.appendChild(err('Error: user "' + target + '" does not exist.'));
      return;
    }
    if (isBanned(target)) {
      output.appendChild(ok('User "' + target + '" is already banned.'));
      return;
    }
    if (getAdmins().includes(target) && !force) {
      output.appendChild(err('Cannot ban admin/owner "' + target + '" without confirmation. Re-run with [force] to confirm.'));
      return;
    }
    saveBanned([...getBanned(), target]);
    logAdminAction(currentUser, 'ban', target, force ? 'confirmed with [force] (admin target)' : '');
    output.appendChild(ok('Banned "' + target + '". They can no longer log in.'));
    return;
  }

  const mUnban = /^@account\s+\[unban\]\s+\(user\s+"([^"]+)"\)/i.exec(input);
  if (mUnban) {
    const target = mUnban[1];
    if (!(await userExists(target))) {
      output.appendChild(err('Error: user "' + target + '" does not exist.'));
      return;
    }
    if (!isBanned(target)) {
      output.appendChild(ok('User "' + target + '" is not banned.'));
      return;
    }
    saveBanned(getBanned().filter(u => u !== target));
    logAdminAction(currentUser, 'unban', target, '');
    output.appendChild(ok('Unbanned "' + target + '". Access restored.'));
    return;
  }

  const mSet = /^@account\s+\[set\]\s+<(password|admin|owner)>\s+\(user\s+"([^"]+)"\)(?:\s+\("([^"]*)"\))?/i.exec(input);
  if (mSet) {
    const action = mSet[1].toLowerCase();
    const target = mSet[2];
    const newPw = mSet[3];
    if (!(await userExists(target))) {
      output.appendChild(err('Error: user "' + target + '" does not exist.'));
      return;
    }
    if (action === 'password') {
      if (newPw === undefined || !newPw) {
        output.appendChild(err('Usage: @account [set] <password> (user "username") ("newPassword")'));
        return;
      }
      const users = getUsers();
      users[target] = await hashPassword(newPw);
      saveUsers(users);
      logAdminAction(currentUser, 'password-reset', target, '');
      output.appendChild(ok('Password for "' + target + '" has been reset. (Stored hashed; never logged in plaintext.)'));
      return;
    }
    if (getAdmins().includes(target)) {
      output.appendChild(ok('User "' + target + '" is already an admin.'));
      return;
    }
    saveAdmins([...getAdmins(), target]);
    logAdminAction(currentUser, 'promote-admin', target, 'promoted to ' + action);
    output.appendChild(ok('Promoted "' + target + '" to ' + action + '. They can now use owner/admin commands.'));
    return;
  }

  output.appendChild(err('Unknown @account command. Try: @account [list] / @account [ban] (user "name") / @account [unban] (user "name") / @account [set] <admin|password> (user "name") ("value")'));
}

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
      'Is Owner: ' + isOwnerOrAdmin(currentUser),
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
  const tabBtn = document.querySelector('.topbar-tab[data-tab="' + tabId + '"]');
  if (tabBtn && tabBtn.classList.contains('owner-only') && !isOwnerOrAdmin(currentUser)) return;
  document.querySelectorAll('.topbar-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-content').forEach(c => {
    c.classList.toggle('active', c.id === 'tab-' + tabId);
  });
  if (tabId === 'code') {
    renderProjectList();
  }
  if (tabId === 'canvas') {
    renderCanvas();
  }
  if (tabId === 'math') {
    renderMath();
  }
  if (tabId === 'math-practice') {
    renderMathPractice();
  }
  if (tabId === 'notes') {
    renderNotesTab();
  }
}

// ===== SEARCH NAVIGATION BAR =====
var SEARCH_NAV_ITEMS = [
  { tab: 'code', label: 'Code', icon: '&lt;/&gt;' },
  { tab: 'database', label: 'Database', icon: '&#128451;', ownerOnly: true },
  { tab: 'courses', label: 'Courses', icon: '&#128218;' },
  { tab: 'canvas', label: 'Canvas', icon: '&#127912;' },
  { tab: 'math', label: 'Math', icon: '&#128220;' },
  { tab: 'math-practice', label: 'Math Practice', icon: '&#127891;' },
  { tab: 'notes', label: 'Notes', icon: '&#128221;' },
  { tab: 'settings', label: 'Settings', icon: '&#9881;' },
  { tab: 'run', label: '/run', icon: '&#9654;', ownerOnly: true },
  { tab: 'edit', label: 'Edit', icon: '&#9998;', ownerOnly: true },
  { tab: 'ire', label: 'IRE', icon: '&#127917;', ownerOnly: true }
];

function openSearchNav(query) {
  var list = SEARCH_NAV_ITEMS.filter(function(item) {
    if (item.ownerOnly && !isOwnerOrAdmin(currentUser)) return false;
    if (!query) return true;
    return item.label.toLowerCase().indexOf(query) >= 0 || item.tab.indexOf(query) >= 0;
  });
  var box = document.getElementById('navSearchResults');
  if (!list.length) {
    box.innerHTML = '<div class="nav-search-item nav-search-empty">No matching tabs</div>';
  } else {
    box.innerHTML = list.map(function(item) {
      return '<div class="nav-search-item" data-tab="' + item.tab + '"><span class="nav-search-icon">' + item.icon + '</span>' + item.label + '</div>';
    }).join('');
  }
  box.classList.remove('hidden');
}

function hideSearchNav() {
  document.getElementById('navSearchResults').classList.add('hidden');
}

document.getElementById('navSearchInput').addEventListener('input', function() {
  openSearchNav(this.value.trim().toLowerCase());
});
document.getElementById('navSearchInput').addEventListener('focus', function() {
  openSearchNav(this.value.trim().toLowerCase());
});
document.getElementById('navSearchResults').addEventListener('click', function(e) {
  var item = e.target.closest('.nav-search-item');
  if (!item || !item.dataset.tab) return;
  switchTab(item.dataset.tab);
  document.getElementById('navSearchInput').value = '';
  hideSearchNav();
});
document.addEventListener('click', function(e) {
  if (!e.target.closest('#navSearchWrap')) hideSearchNav();
});
document.getElementById('navSearchInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    var first = document.querySelector('#navSearchResults .nav-search-item[data-tab]');
    if (first) { switchTab(first.dataset.tab); this.value = ''; hideSearchNav(); }
  }
  if (e.key === 'Escape') { this.value = ''; hideSearchNav(); }
});

document.querySelectorAll('.topbar-tab').forEach(tab => {
  tab.addEventListener('click', function() {
    const tabId = this.dataset.tab;
    if (this.classList.contains('owner-only') && !isOwnerOrAdmin(currentUser)) return;
    switchTab(tabId);
    if (tabId === 'database') renderDB();
    if (tabId === 'courses') renderCourses();
    if (tabId === 'canvas') renderCanvas();
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
function saveCC(list) {
  const prev = getCC();
  localStorage.setItem(CC_KEY, JSON.stringify(list));
  if (!currentUser) return;
  sb('commands').upsert(list.map(function(c) {
    const old = prev.find(function(p) { return p.cmdLine === c.cmdLine; });
    return {cmd_line:c.cmdLine, name:c.name, action:c.action, action_value:c.actionValue, description:c.description||'', author:(old && old.author) || currentUser};
  }), 'cmd_line');
}
let editingCmdName = null;

function deleteCC(cmdName) {
  const list = getCC();
  const filtered = list.filter(c => c.cmdLine.toLowerCase().replace(/^@/,'') !== cmdName.toLowerCase().replace(/^@/,''));
  if (filtered.length === list.length) return false;
  saveCC(filtered);
  const target = list.find(c => c.cmdLine.toLowerCase().replace(/^@/,'') === cmdName.toLowerCase().replace(/^@/,''));
  if (target && currentUser) sb('commands').delete({cmd_line: target.cmdLine});
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
  var exportHtml = '<div style="margin-bottom:8px;"><button id="exportCCBtn" style="padding:6px 14px;font-size:11px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text-secondary);cursor:pointer;font-family:inherit;">&#128229; Export All (' + list.length + ')</button></div>';
  el.innerHTML = exportHtml + list.map(c => {
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
  document.getElementById('exportCCBtn').addEventListener('click', function() {
    var blob = new Blob([JSON.stringify(getCC(), null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'custom-commands.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
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
  const list = getCC().sort(function(a,b) { return b.cmdLine.length - a.cmdLine.length; });
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
      var oldFrame = document.getElementById('inject-iframe');
      if (oldFrame) oldFrame.remove();
      var frame = document.createElement('iframe');
      frame.id = 'inject-iframe';
      frame.style.cssText = 'width:100%;height:100%;min-height:400px;border:none;display:block;background:transparent;';
      frame.setAttribute('sandbox', 'allow-scripts');
      outputEl.appendChild(frame);
      if (val.includes('<html') || val.includes('<!DOCTYPE')) {
        frame.srcdoc = val;
      } else {
        frame.srcdoc = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:sans-serif;padding:16px;margin:0;background:#0d0d1a;color:#eee}</style></head><body>' + val + '</body></html>';
      }
    } else if (c.action === 'eval') {
      if (/document\.body|createElement|appendChild|innerHTML|querySelector|getElementById|addEventListener/i.test(val)) {
        var evalFrame = document.getElementById('inject-iframe');
        if (evalFrame) evalFrame.remove();
        evalFrame = document.createElement('iframe');
        evalFrame.id = 'inject-iframe';
        evalFrame.style.cssText = 'width:100%;height:100%;min-height:400px;border:none;display:block;background:transparent;';
        evalFrame.setAttribute('sandbox', 'allow-scripts');
        outputEl.appendChild(evalFrame);
        evalFrame.srcdoc = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;background:#0d0d1a;overflow:hidden}</style></head><body><script>' + val + '<\/script></body></html>';
      } else {
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
  const name = document.getElementById('builderName').value.trim().toLowerCase().replace(/[^a-z0-9\s\[\]\(\)#.\-]/g, '') || 'mycommand';
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
  if (action === 'eval' && /document\.body|createElement|appendChild|innerHTML|querySelector|getElementById|addEventListener/i.test(value)) {
    status.textContent = 'This code modifies the page DOM — use Inject HTML instead of Run JavaScript code.';
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

// ===== COURSES =====
const COURSES_KEY = 'ic_courses';

function getCourses() {
  try { return JSON.parse(localStorage.getItem(COURSES_KEY)) || []; } catch(e) { return []; }
}

function saveCourses(list) {
  localStorage.setItem(COURSES_KEY, JSON.stringify(list));
  if (!currentUser) return;
  list.forEach(function(c) { sb('courses').upsert({id:c.id,title:c.title,content:c.content,author:c.author},'id'); });
}

function deleteCourse(id) {
  var list = getCourses();
  var filtered = list.filter(function(c) { return c.id !== id; });
  if (filtered.length === list.length) return false;
  saveCourses(filtered);
  if (currentUser) sb('courses').delete({id:id});
  renderCourses();
  return true;
}

function renderCourses() {
  var list = getCourses();
  var isOwner = isOwnerOrAdmin(currentUser);
  var sidebar = document.getElementById('coursesList');
  var content = document.getElementById('coursesContent');
  if (!sidebar) return;

  if (list.length === 0) {
    var hint = isOwner ? 'No courses yet. Click + to create one.' : 'No courses yet.';
    sidebar.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:12px;">' + hint + '</div>';
    content.innerHTML = '<div class="courses-placeholder">' + hint + '</div>';
    return;
  }

  sidebar.innerHTML = list.map(function(c) {
    var active = selectedCourseId === c.id ? 'courses-item-active' : '';
    return '<div class="courses-item ' + active + '" data-id="' + c.id + '">' +
      '<div class="courses-item-title">' + c.title + '</div>' +
      '<div class="courses-item-author">by ' + c.author + '</div>' +
      '</div>';
  }).join('');

  sidebar.querySelectorAll('.courses-item').forEach(function(el) {
    el.addEventListener('click', function() {
      selectedCourseId = parseInt(this.dataset.id);
      renderCourses();
    });
  });

  if (selectedCourseId) {
    var course = list.find(function(c) { return c.id === selectedCourseId; });
    if (course) {
      content.innerHTML = '<div class="courses-detail">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">' +
        '<h2 style="margin:0;font-size:20px;color:var(--text-primary);">' + course.title + '</h2>' +
        '<div style="display:flex;gap:6px;">' +
        (isOwner ? '<button class="courses-btn edit-course-btn" data-id="' + course.id + '" style="padding:4px 10px;font-size:11px;background:transparent;border:1px solid #50e3c2;border-radius:4px;color:#50e3c2;cursor:pointer;font-family:inherit;">Edit</button>' : '') +
        (isOwner ? '<button class="courses-btn del-course-btn" data-id="' + course.id + '" style="padding:4px 10px;font-size:11px;background:transparent;border:1px solid #ff4444;border-radius:4px;color:#ff4444;cursor:pointer;font-family:inherit;">Del</button>' : '') +
        '</div></div>' +
        '<div style="font-size:12px;color:var(--text-muted);margin-bottom:16px;">by ' + course.author + ' &middot; ' + (course.createdAt || 'recently') + '</div>' +
        '<div class="courses-body">' + course.content + '</div>' +
        '</div>';
      content.querySelectorAll('.del-course-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) { e.stopPropagation(); if (confirm('Delete this course?')) deleteCourse(parseInt(this.dataset.id)); });
      });
      content.querySelectorAll('.edit-course-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) { e.stopPropagation(); showCourseForm(parseInt(this.dataset.id)); });
      });
    } else {
      selectedCourseId = null;
      content.innerHTML = '<div class="courses-placeholder">Course not found.</div>';
    }
  } else {
    content.innerHTML = '<div class="courses-placeholder">Select a course from the sidebar.</div>';
  }
}

var selectedCourseId = null;

function showCourseForm(editId) {
  if (!isOwnerOrAdmin(currentUser)) return;
  var list = getCourses();
  var course = editId ? list.find(function(c) { return c.id === editId; }) : null;
  var html = '<div style="margin-bottom:12px;"><label style="display:block;font-size:12px;color:var(--text-secondary);margin-bottom:4px;">Course Title</label>' +
    '<input id="courseTitleInput" type="text" value="' + (course ? course.title.replace(/"/g,'&quot;') : '') + '" style="width:100%;padding:8px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);font-size:13px;font-family:inherit;outline:none;box-sizing:border-box;" placeholder="e.g. Getting Started with @inf"></div>' +
    '<div style="margin-bottom:12px;"><label style="display:block;font-size:12px;color:var(--text-secondary);margin-bottom:4px;">Content (HTML or markdown)</label>' +
    '<textarea id="courseContentInput" rows="12" style="width:100%;padding:8px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);font-size:13px;font-family:inherit;outline:none;resize:vertical;box-sizing:border-box;white-space:pre-wrap;" placeholder="Write your course content here...">' + (course ? course.content.replace(/</g,'&lt;') : '') + '</textarea></div>' +
    '<div id="courseFormStatus" style="font-size:12px;color:var(--text-muted);margin-bottom:8px;display:none;"></div>' +
    '<div style="display:flex;gap:8px;">' +
    '<button id="courseSaveBtn" style="padding:8px 20px;font-size:12px;background:linear-gradient(135deg,#6b3fa0,#8860ff);border:none;border-radius:6px;color:#fff;cursor:pointer;font-family:inherit;font-weight:500;">' + (editId ? 'Update' : 'Publish') + ' Course</button>' +
    '<button id="courseCancelBtn" style="padding:8px 20px;font-size:12px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text-secondary);cursor:pointer;font-family:inherit;">Cancel</button></div>';
  document.getElementById('coursesContent').innerHTML = html;
  document.getElementById('courseSaveBtn').addEventListener('click', function() {
    var title = document.getElementById('courseTitleInput').value.trim();
    var content = document.getElementById('courseContentInput').value.trim();
    var status = document.getElementById('courseFormStatus');
    if (!title || !content) {
      status.textContent = 'Title and content are required.'; status.style.color = '#ff6b6b'; status.style.display = 'block';
      return;
    }
    var list = getCourses();
    if (editId) {
      var idx = list.findIndex(function(c) { return c.id === editId; });
      if (idx >= 0) { list[idx].title = title; list[idx].content = content; }
    } else {
      list.push({ id: Date.now(), title: title, content: content, author: currentUser || 'guest', createdAt: new Date().toLocaleDateString() });
    }
    saveCourses(list);
    selectedCourseId = editId || Date.now();
    renderCourses();
  });
  document.getElementById('courseCancelBtn').addEventListener('click', function() { renderCourses(); });
  document.getElementById('courseTitleInput').focus();
}

document.addEventListener('DOMContentLoaded', function() {
  var newBtn = document.getElementById('newCourseBtn');
  if (newBtn) {
    newBtn.addEventListener('click', function() {
      if (!isOwnerOrAdmin(currentUser)) return;
      showCourseForm(null);
    });
  }
});

// ===== MATH =====
const MATH_KEY = 'ic_math';
let selectedMathId = null;

function getMathProgressKey() {
  return 'ic_math_progress_' + (currentUser || 'guest');
}

function getMathProgress() {
  try { return JSON.parse(localStorage.getItem(getMathProgressKey())) || {}; } catch(e) { return {}; }
}

function saveMathProgress(progress) {
  localStorage.setItem(getMathProgressKey(), JSON.stringify(progress));
}

function getMathProblems() {
  try { return JSON.parse(localStorage.getItem(MATH_KEY)) || []; } catch(e) { return []; }
}

function saveMathProblems(list) {
  localStorage.setItem(MATH_KEY, JSON.stringify(list));
  if (!currentUser) return;
  list.forEach(function(p) {
    sb('math_problems').upsert({id:p.id, question:p.question, subject:p.subject, answers:p.answers, author:p.author}, 'id');
  });
}

function deleteMathProblem(id) {
  var list = getMathProblems();
  var filtered = list.filter(function(p) { return p.id !== id; });
  if (filtered.length === list.length) return false;
  saveMathProblems(filtered);
  if (currentUser) sb('math_problems').delete({id:id});
  if (selectedMathId === id) selectedMathId = null;
  renderMath();
  return true;
}

function getMathSubjectFilterKey() {
  return 'ic_math_subject_' + (currentUser || 'guest');
}

function getMathSubjectFilter() {
  try { return localStorage.getItem(getMathSubjectFilterKey()) || 'All'; } catch(e) { return 'All'; }
}

function saveMathSubjectFilter(subject) {
  try { localStorage.setItem(getMathSubjectFilterKey(), subject); } catch(e) {}
}

function getMathSubject(p) {
  return (p.subject && String(p.subject).trim()) ? String(p.subject).trim() : 'General';
}

function renderMath() {
  var allList = getMathProblems();
  var isOwner = isOwnerOrAdmin(currentUser);
  var sidebar = document.getElementById('mathList');
  var content = document.getElementById('mathContent');
  if (!sidebar) return;

  var subjects = [];
  allList.forEach(function(p) {
    var s = getMathSubject(p);
    if (subjects.indexOf(s) < 0) subjects.push(s);
  });
  subjects.sort();

  var filter = getMathSubjectFilter();
  if (subjects.indexOf(filter) < 0) filter = 'All';

  var filterEl = document.getElementById('mathFilter');
  if (filterEl) {
    var chips = ['<button type="button" class="math-filter-chip' + (filter === 'All' ? ' active' : '') + '" data-subject="All">All</button>'];
    subjects.forEach(function(s) {
      chips.push('<button type="button" class="math-filter-chip' + (filter === s ? ' active' : '') + '" data-subject="' + s.replace(/"/g,'&quot;') + '">' + s.replace(/</g,'&lt;') + '</button>');
    });
    filterEl.innerHTML = chips.join('');
    filterEl.querySelectorAll('.math-filter-chip').forEach(function(el) {
      el.addEventListener('click', function() {
        saveMathSubjectFilter(this.dataset.subject);
        selectedMathId = null;
        renderMath();
      });
    });
  }

  if (allList.length === 0) {
    var hint = isOwner ? 'No math problems yet. Click + to create one.' : 'No math problems yet.';
    sidebar.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:12px;">' + hint + '</div>';
    content.innerHTML = '<div class="math-placeholder">' + hint + '</div>';
    return;
  }

  var list = filter === 'All' ? allList : allList.filter(function(p) { return getMathSubject(p) === filter; });

  if (list.length === 0) {
    sidebar.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:12px;">No problems in &ldquo;' + filter.replace(/</g,'&lt;') + '&rdquo; yet.</div>';
    content.innerHTML = '<div class="math-placeholder">No problems in this subject yet. Pick another subject to train.</div>';
    return;
  }

  var progress = getMathProgress();
  sidebar.innerHTML = list.map(function(p) {
    var active = selectedMathId === p.id ? 'math-item-active' : '';
    var answerCount = (p.answers || []).length;
    var solved = !!progress[p.id];
    return '<div class="math-item ' + active + '" data-id="' + p.id + '">' +
      '<div class="math-item-title">' + (solved ? '<span class="math-item-tick" title="Solved">&#10003;</span> ' : '') + p.question.replace(/</g,'&lt;') + '</div>' +
      '<div class="math-item-author">by ' + p.author + ' &middot; ' + getMathSubject(p).replace(/</g,'&lt;') + ' &middot; ' + answerCount + ' accepted answer' + (answerCount !== 1 ? 's' : '') + '</div>' +
      '</div>';
  }).join('');

  sidebar.querySelectorAll('.math-item').forEach(function(el) {
    el.addEventListener('click', function() {
      selectedMathId = parseInt(this.dataset.id);
      renderMath();
    });
  });

  if (selectedMathId) {
    var problem = list.find(function(p) { return p.id === selectedMathId; });
    if (problem) {
      renderMathProblem(problem, isOwner);
    } else {
      selectedMathId = null;
      content.innerHTML = '<div class="math-placeholder">Problem not found.</div>';
    }
  } else {
    content.innerHTML = '<div class="math-placeholder">Select a problem from the sidebar to train.</div>';
  }
}

function renderMathProblem(problem, isOwner) {
  var content = document.getElementById('mathContent');
  var saved = getMathProgress()[problem.id] || '';

  content.innerHTML = '<div class="math-detail">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">' +
    '<h2 style="margin:0;font-size:20px;color:var(--text-primary);">' + problem.question.replace(/</g,'&lt;') + '</h2>' +
    (isOwner ? '<div style="display:flex;gap:6px;">' +
      '<button class="math-btn edit-math-btn" data-id="' + problem.id + '" style="padding:4px 10px;font-size:11px;background:transparent;border:1px solid #50e3c2;border-radius:4px;color:#50e3c2;cursor:pointer;font-family:inherit;">Edit</button>' +
      '<button class="math-btn del-math-btn" data-id="' + problem.id + '" style="padding:4px 10px;font-size:11px;background:transparent;border:1px solid #ff4444;border-radius:4px;color:#ff4444;cursor:pointer;font-family:inherit;">Del</button>' +
      '</div>' : '') +
    '</div>' +
    '<div style="font-size:12px;color:var(--text-muted);margin-bottom:16px;">by ' + problem.author + ' &middot; ' + getMathSubject(problem).replace(/</g,'&lt;') + ' &middot; Type your answer below</div>' +
    '<div style="display:flex;align-items:center;gap:10px;">' +
    '<input id="mathAnswerInput" type="text" value="' + saved.replace(/"/g,'&quot;') + '" placeholder="Your answer..." style="flex:1;padding:10px 12px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-size:14px;font-family:inherit;outline:none;box-sizing:border-box;"' + (saved ? ' disabled' : '') + '>' +
    '<button id="mathCheckBtn" class="math-btn" style="padding:8px 20px;font-size:12px;background:linear-gradient(135deg,#6b3fa0,#8860ff);border:none;border-radius:6px;color:#fff;cursor:pointer;font-family:inherit;font-weight:500;white-space:nowrap;">Check Answer</button>' +
    '</div>' +
    '<div style="margin-top:10px;"><span id="mathResult" style="font-size:13px;font-weight:600;"></span></div>' +
    '</div>';

  content.querySelectorAll('.del-math-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) { e.stopPropagation(); if (confirm('Delete this problem?')) deleteMathProblem(parseInt(this.dataset.id)); });
  });
  content.querySelectorAll('.edit-math-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) { e.stopPropagation(); showMathForm(parseInt(this.dataset.id)); });
  });

  var input = document.getElementById('mathAnswerInput');
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') document.getElementById('mathCheckBtn').click();
  });

  document.getElementById('mathCheckBtn').addEventListener('click', function() {
    var typed = input.value.trim();
    if (!typed) return;
    var accepted = (problem.answers || []).map(function(a) { return String(a).trim().toLowerCase(); });
    var correct = accepted.indexOf(typed.toLowerCase()) >= 0;

    var res = document.getElementById('mathResult');
    if (correct) {
      var progress = getMathProgress();
      progress[problem.id] = typed;
      saveMathProgress(progress);
      res.textContent = 'Correct! Nice work.';
      res.style.color = '#50e3c2';
      input.disabled = true;
      var tick = document.querySelector('.math-item[data-id="' + problem.id + '"] .math-item-title');
      if (tick && tick.innerHTML.indexOf('math-item-tick') < 0) {
        tick.innerHTML = '<span class="math-item-tick" title="Solved">&#10003;</span> ' + tick.innerHTML;
      }
    } else {
      res.textContent = 'Incorrect. Try again.';
      res.style.color = '#ff6b6b';
      input.focus();
      input.select();
    }
  });
}

function showMathForm(editId) {
  if (!isOwnerOrAdmin(currentUser)) return;
  var list = getMathProblems();
  var problem = editId ? list.find(function(p) { return p.id === editId; }) : null;
  var answers = (problem && problem.answers) ? problem.answers : [''];
  var answersHtml = answers.map(function(a, i) {
    return '<div class="math-answer-row" data-idx="' + i + '">' +
      '<input type="text" class="math-answer-text" value="' + String(a).replace(/"/g,'&quot;') + '" placeholder="Accepted answer ' + (i + 1) + '" style="flex:1;padding:8px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);font-size:13px;font-family:inherit;outline:none;box-sizing:border-box;">' +
      '<button type="button" class="math-answer-remove" style="padding:4px 10px;font-size:11px;background:transparent;border:1px solid #ff4444;border-radius:4px;color:#ff4444;cursor:pointer;font-family:inherit;">Remove</button>' +
      '</div>';
  }).join('');

  var html = '<div style="margin-bottom:12px;"><label style="display:block;font-size:12px;color:var(--text-secondary);margin-bottom:4px;">Question</label>' +
    '<input id="mathQuestionInput" type="text" value="' + (problem ? problem.question.replace(/"/g,'&quot;') : '') + '" style="width:100%;padding:8px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);font-size:13px;font-family:inherit;outline:none;box-sizing:border-box;" placeholder="e.g. What is 2 + 2?"></div>' +
    '<div style="margin-bottom:12px;"><label style="display:block;font-size:12px;color:var(--text-secondary);margin-bottom:4px;">Subject (used to train a specific subject)</label>' +
    '<input id="mathSubjectInput" type="text" value="' + (problem && problem.subject ? String(problem.subject).replace(/"/g,'&quot;') : '') + '" style="width:100%;padding:8px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);font-size:13px;font-family:inherit;outline:none;box-sizing:border-box;" placeholder="e.g. Algebra, Geometry, Calculus (optional)"></div>' +
    '<div style="margin-bottom:12px;"><label style="display:block;font-size:12px;color:var(--text-secondary);margin-bottom:4px;">Accepted Answers (add every correct spelling/variant)</label>' +
    '<div id="mathAnswersList">' + answersHtml + '</div>' +
    '<button id="mathAddAnswerBtn" type="button" style="margin-top:6px;padding:6px 12px;font-size:11px;background:transparent;border:1px dashed var(--border);border-radius:6px;color:var(--text-secondary);cursor:pointer;font-family:inherit;">+ Add Answer</button></div>' +
    '<div id="mathFormStatus" style="font-size:12px;color:var(--text-muted);margin-bottom:8px;display:none;"></div>' +
    '<div style="display:flex;gap:8px;">' +
    '<button id="mathSaveBtn" style="padding:8px 20px;font-size:12px;background:linear-gradient(135deg,#6b3fa0,#8860ff);border:none;border-radius:6px;color:#fff;cursor:pointer;font-family:inherit;font-weight:500;">' + (editId ? 'Update' : 'Publish') + ' Problem</button>' +
    '<button id="mathCancelBtn" style="padding:8px 20px;font-size:12px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text-secondary);cursor:pointer;font-family:inherit;">Cancel</button></div>';
  document.getElementById('mathContent').innerHTML = html;

  function addAnswerRow() {
    var listEl = document.getElementById('mathAnswersList');
    var idx = listEl.children.length;
    var row = document.createElement('div');
    row.className = 'math-answer-row';
    row.dataset.idx = idx;
    row.innerHTML = '<input type="text" class="math-answer-text" placeholder="Accepted answer ' + (idx + 1) + '" style="flex:1;padding:8px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);font-size:13px;font-family:inherit;outline:none;box-sizing:border-box;">' +
      '<button type="button" class="math-answer-remove" style="padding:4px 10px;font-size:11px;background:transparent;border:1px solid #ff4444;border-radius:4px;color:#ff4444;cursor:pointer;font-family:inherit;">Remove</button>';
    listEl.appendChild(row);
  }

  document.getElementById('mathAddAnswerBtn').addEventListener('click', addAnswerRow);
  document.getElementById('mathAnswersList').addEventListener('click', function(e) {
    if (e.target.classList.contains('math-answer-remove')) {
      e.target.closest('.math-answer-row').remove();
    }
  });

  document.getElementById('mathSaveBtn').addEventListener('click', function() {
    var question = document.getElementById('mathQuestionInput').value.trim();
    var answerRows = Array.prototype.slice.call(document.querySelectorAll('#mathAnswersList .math-answer-row'));
    var answers = answerRows.map(function(row) {
      return row.querySelector('.math-answer-text').value.trim();
    }).filter(function(a) { return a; });
    var status = document.getElementById('mathFormStatus');
    if (!question) {
      status.textContent = 'Question is required.'; status.style.color = '#ff6b6b'; status.style.display = 'block';
      return;
    }
    if (answers.length < 1) {
      status.textContent = 'Add at least 1 accepted answer.'; status.style.color = '#ff6b6b'; status.style.display = 'block';
      return;
    }
    var subject = document.getElementById('mathSubjectInput').value.trim();
    var list = getMathProblems();
    if (editId) {
      var idx = list.findIndex(function(p) { return p.id === editId; });
      if (idx >= 0) {
        list[idx].question = question;
        list[idx].subject = subject;
        list[idx].answers = answers;
        list[idx].updatedAt = new Date().toLocaleDateString();
      }
    } else {
      list.push({ id: Date.now(), question: question, subject: subject, answers: answers, author: currentUser || 'guest', createdAt: new Date().toLocaleDateString() });
    }
    saveMathProblems(list);
    selectedMathId = editId || list[list.length - 1].id;
    renderMath();
  });
  document.getElementById('mathCancelBtn').addEventListener('click', function() { renderMath(); });
  document.getElementById('mathQuestionInput').focus();
}

document.addEventListener('DOMContentLoaded', function() {
  var newBtn = document.getElementById('newMathBtn');
  if (newBtn) {
    newBtn.addEventListener('click', function() {
      if (!isOwnerOrAdmin(currentUser)) return;
      showMathForm(null);
    });
  }
});

// ===== IRE (Infinite Render Engine) =====
const IRE_START_LABEL = '@start("IRE")';
const IRE_SUGGESTIONS = [
  { label: '@start("IRE")', desc: 'required entry point' },
  { label: '@text("message") [pos(x,y,z)] [color("colorname")] [size(number)] [animation] [id=("name")]', desc: 'text element template' },
  { label: '@circle [pos(x,y,z)] [radius(number)] [color("colorname")] [fill-yes] [fill-no] [fill-color("colorname")] [animation] [id=("name")]', desc: 'circle element template' },
  { label: '@rectangle [pos(x,y,z)] [width(number)] [height(number)] [color("colorname")] [fill-yes] [fill-no] [fill-color("colorname")] [animation] [id=("name")]', desc: 'rectangle element template' },
  { label: '@sphere [pos(x,y,z)] [radius(number)] [color("colorname")] [fill-color("colorname")] [animation] [id=("name")]', desc: '3D sphere element template' },
  { label: '@cube [pos(x,y,z)] [width(number)] [height(number)] [depth(number)] [rotation(x,y,z)] [color("colorname")] [fill-color("colorname")] [animation] [id=("name")]', desc: '3D cube element template' },
  { label: '@spin [id=("name")] [spin-axis(x,y,z)] [spin-speed(number)]', desc: 'continuously rotate a sphere or cube by id' },
  { label: '@morph("idOne", "idTwo") [duration(seconds)]', desc: 'morph shapes into another — 2D Circle/ Rectangle or 3D Sphere/ Cube (same dimension only)' }
];
let ireSelIndex = 0;

function escapeIRE(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlightIRE(code) {
  var html = escapeIRE(code);
  html = html.replace(/(@start\s*\(\s*["']IRE["']\s*\))/g, '<span class="token-ire">$1</span>');
  html = html.replace(/(@text\s*\(\s*["'][^"']*["']\s*\))/g, '<span class="token-ire-text">$1</span>');
  html = html.replace(/(@circle\b)/g, '<span class="token-ire-circle">$1</span>');
  html = html.replace(/(@rectangle\b)/g, '<span class="token-ire-rectangle">$1</span>');
  html = html.replace(/(@sphere\b)/g, '<span class="token-ire-sphere">$1</span>');
  html = html.replace(/(@cube\b)/g, '<span class="token-ire-cube">$1</span>');
  html = html.replace(/(@spin\b)/g, '<span class="token-ire-spin">$1</span>');
  html = html.replace(/(@morph\s*\(\s*["'][^"']*["']\s*,\s*["'][^"']*["']\s*\))/g, '<span class="token-ire-morph">$1</span>');
  return html;
}

function updateIREHighlight() {
  const codeEl = document.getElementById('ireHighlightCode');
  if (!codeEl) return;
  codeEl.innerHTML = highlightIRE(document.getElementById('ireEditor').value);
}

function logIRE(msg, type) {
  const output = document.getElementById('ireOutput');
  if (!output) return;
  const line = document.createElement('div');
  line.className = 'ire-output-line ' + (type || 'info');
  line.textContent = msg;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

const IRE_COLOR_NAMES = {
  white: '#ffffff', black: '#000000', red: '#ff5555', green: '#4caf50',
  blue: '#55aaff', yellow: '#ffd700', orange: '#ffa500', purple: '#b066ff',
  pink: '#ff66cc', cyan: '#55ffff', magenta: '#ff55ff', gray: '#aaaaaa',
  grey: '#aaaaaa', brown: '#a0522d', lime: '#aaff00', navy: '#000080',
  teal: '#008080', maroon: '#800000', gold: '#ffd700', silver: '#c0c0c0',
  indigo: '#4b0082', violet: '#ee82ee', crimson: '#dc143c', skyblue: '#87ceeb'
};

function resolveIREColor(name) {
  const v = String(name || '').trim().toLowerCase();
  if (/^#[0-9a-f]{3,6}$/i.test(v)) return v;
  if (IRE_COLOR_NAMES[v]) return IRE_COLOR_NAMES[v];
  return null;
}

function parseIREModifiers(el, rest, idx, errors) {
  const mods = rest.match(/\[[^\]]*\]/g) || [];
  mods.forEach(function(modStr) {
    const mod = modStr.slice(1, -1).trim();
    if (!mod) return;
    const posM = mod.match(/^pos\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)(?:\s*,\s*(-?\d+(?:\.\d+)?))?\s*\)$/i);
    if (posM) {
      el.pos = { x: parseFloat(posM[1]), y: parseFloat(posM[2]), z: posM[3] !== undefined ? parseFloat(posM[3]) : 0 };
      return;
    }
    const colM = mod.match(/^color\s*\(\s*["']?([^"')]+)["']?\s*\)$/i);
    if (colM) {
      const c = resolveIREColor(colM[1]);
      if (c) { el.color = c; }
      else { errors.push('Line ' + (idx + 1) + ': Unknown color "' + colM[1] + '"'); }
      return;
    }
    const idM = mod.match(/^id\s*=\s*\(\s*["']?([^"')]+)["']?\s*\)$/i);
    if (idM) { el.id = idM[1].trim(); return; }
    const isSphere = el.type === 'sphere';
    const isCube = el.type === 'cube';
    const shape = el.type === 'circle' || el.type === 'rectangle';
    const radM = mod.match(/^radius\s*\(\s*(\d+(?:\.\d+)?)\s*\)$/i);
    if (radM) {
      if (el.type !== 'circle' && el.type !== 'sphere') { errors.push('Line ' + (idx + 1) + ': Unknown modifier [' + mod + ']'); }
      else { el.radius = parseFloat(radM[1]); }
      return;
    }
    const wM = mod.match(/^width\s*\(\s*(\d+(?:\.\d+)?)\s*\)$/i);
    if (wM) {
      if (el.type !== 'rectangle' && el.type !== 'cube') { errors.push('Line ' + (idx + 1) + ': Unknown modifier [' + mod + ']'); }
      else { el.width = parseFloat(wM[1]); }
      return;
    }
    const hM = mod.match(/^height\s*\(\s*(\d+(?:\.\d+)?)\s*\)$/i);
    if (hM) {
      if (el.type !== 'rectangle' && el.type !== 'cube') { errors.push('Line ' + (idx + 1) + ': Unknown modifier [' + mod + ']'); }
      else { el.height = parseFloat(hM[1]); }
      return;
    }
    const dM = mod.match(/^depth\s*\(\s*(\d+(?:\.\d+)?)\s*\)$/i);
    if (dM) {
      if (el.type !== 'cube') { errors.push('Line ' + (idx + 1) + ': Unknown modifier [' + mod + ']'); }
      else { el.depth = parseFloat(dM[1]); }
      return;
    }
    const rotM = mod.match(/^rotation\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)$/i);
    if (rotM) {
      if (el.type !== 'cube') { errors.push('Line ' + (idx + 1) + ': Unknown modifier [' + mod + ']'); }
      else { el.rotation = { x: parseFloat(rotM[1]), y: parseFloat(rotM[2]), z: parseFloat(rotM[3]) }; }
      return;
    }
    if (/^fill-yes$/i.test(mod)) {
      if (!shape) { errors.push('Line ' + (idx + 1) + ': Unknown modifier [' + mod + ']'); }
      else { el.fillYes = true; }
      return;
    }
    if (/^fill-no$/i.test(mod)) {
      if (!shape) { errors.push('Line ' + (idx + 1) + ': Unknown modifier [' + mod + ']'); }
      else { el.fillNo = true; }
      return;
    }
    const fillColM = mod.match(/^fill-color\s*\(\s*["']?([^"')]+)["']?\s*\)$/i);
    if (fillColM) {
      if (!shape && !isSphere && !isCube) { errors.push('Line ' + (idx + 1) + ': Unknown modifier [' + mod + ']'); }
      else {
        const c = resolveIREColor(fillColM[1]);
        if (c) { el.fillColor = c; }
        else { errors.push('Line ' + (idx + 1) + ': Unknown color "' + fillColM[1] + '"'); }
      }
      return;
    }
    const sizeM = mod.match(/^size\s*\(\s*(\d+(?:\.\d+)?)\s*\)$/i);
    if (sizeM) {
      if (el.type !== 'text') { errors.push('Line ' + (idx + 1) + ': Unknown modifier [' + mod + ']'); }
      else { el.size = parseFloat(sizeM[1]); }
      return;
    }
    const anim = mod.toLowerCase();
    const validAnim =
      (el.type === 'text' && (anim === 'writeline' || anim === 'scalein' || anim === 'fadein')) ||
      ((el.type === 'circle' || el.type === 'rectangle' || el.type === 'sphere' || el.type === 'cube') && anim === 'scalein');
    if (validAnim) {
      if (el.animation) {
        errors.push('Line ' + (idx + 1) + ': Only one animation allowed (got [' + mod + '])');
      } else {
        el.animation = anim;
      }
      return;
    }
    errors.push('Line ' + (idx + 1) + ': Unknown modifier [' + mod + ']');
  });
}

function ireShapeDim(type) {
  if (type === 'circle' || type === 'rectangle') return 2;
  if (type === 'sphere' || type === 'cube') return 3;
  return 0;
}

function parseIRE(script) {
  const elements = [];
  const morphs = [];
  const spins = [];
  const errors = [];
  script.split('\n').forEach(function(line, idx) {
    const t = line.trim();
    if (!t) return;
    if (t.indexOf('--') === 0) return;
    const m = t.match(/@text\s*\(\s*["']([^"']*)["']\s*\)/);
    if (m) {
      const el = { type: 'text', message: m[1], pos: { x: 0, y: 0, z: 0 }, color: '#ffffff', size: 32, animation: null, id: null, line: idx + 1 };
      parseIREModifiers(el, t.slice(m[0].length), idx, errors);
      elements.push(el);
      return;
    }
    const cm = t.match(/^@circle\b\s*/i);
    if (cm) {
      const rest = t.slice(cm[0].length);
      if (/^\s*\(/.test(rest)) {
        errors.push('Line ' + (idx + 1) + ': @circle takes no arguments');
        return;
      }
      const el = { type: 'circle', pos: { x: 0, y: 0, z: 0 }, radius: 50, color: '#ffffff', fillColor: '#ffffff', fillYes: false, fillNo: false, animation: null, id: null, line: idx + 1 };
      parseIREModifiers(el, rest, idx, errors);
      el.fill = !el.fillNo;
      elements.push(el);
      return;
    }
    const rm = t.match(/^@rectangle\b\s*/i);
    if (rm) {
      const rest = t.slice(rm[0].length);
      if (/^\s*\(/.test(rest)) {
        errors.push('Line ' + (idx + 1) + ': @rectangle takes no arguments');
        return;
      }
      const el = { type: 'rectangle', pos: { x: 0, y: 0, z: 0 }, width: 100, height: 50, color: '#ffffff', fillColor: '#ffffff', fillYes: false, fillNo: false, animation: null, id: null, line: idx + 1 };
      parseIREModifiers(el, rest, idx, errors);
      el.fill = !el.fillNo;
      elements.push(el);
      return;
    }
    const sm = t.match(/^@sphere\b\s*/i);
    if (sm) {
      const rest = t.slice(sm[0].length);
      if (/^\s*\(/.test(rest)) {
        errors.push('Line ' + (idx + 1) + ': @sphere takes no arguments');
        return;
      }
      const el = { type: 'sphere', pos: { x: 0, y: 0, z: 0 }, radius: 50, color: '#ffffff', fillColor: '#ffffff', animation: null, id: null, line: idx + 1 };
      parseIREModifiers(el, rest, idx, errors);
      elements.push(el);
      return;
    }
    const cbm = t.match(/^@cube\b\s*/i);
    if (cbm) {
      const rest = t.slice(cbm[0].length);
      if (/^\s*\(/.test(rest)) {
        errors.push('Line ' + (idx + 1) + ': @cube takes no arguments');
        return;
      }
      const el = { type: 'cube', pos: { x: 0, y: 0, z: 0 }, width: 50, height: 50, depth: 50, rotation: { x: 0, y: 0, z: 0 }, color: '#ffffff', fillColor: '#ffffff', animation: null, id: null, line: idx + 1 };
      parseIREModifiers(el, rest, idx, errors);
      elements.push(el);
      return;
    }
    const morphM = t.match(/^@morph\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*\)/i);
    if (morphM) {
      const m = { idFrom: morphM[1], idTo: morphM[2], duration: 1, line: idx + 1 };
      const morphRest = t.slice(morphM[0].length);
      (morphRest.match(/\[[^\]]*\]/g) || []).forEach(function(modStr) {
        const mod = modStr.slice(1, -1).trim();
        const durM = mod.match(/^duration\s*\(\s*(\d+(?:\.\d+)?)\s*\)$/i);
        if (durM) {
          const d = parseFloat(durM[1]);
          if (d > 0) m.duration = d;
          else errors.push('Line ' + (idx + 1) + ': @morph duration must be greater than 0 (got ' + d + ')');
        } else {
          errors.push('Line ' + (idx + 1) + ': Unknown modifier [' + mod + ']');
        }
      });
      morphs.push(m);
      return;
    }
    const spinM = t.match(/^@spin\b\s*/i);
    if (spinM) {
      const rest = t.slice(spinM[0].length);
      if (/^\s*\(/.test(rest)) {
        errors.push('Line ' + (idx + 1) + ': @spin takes no arguments');
        return;
      }
      const s = { id: null, axis: { x: 0, y: 1, z: 0 }, speed: 0.5, line: idx + 1 };
      (rest.match(/\[[^\]]*\]/g) || []).forEach(function(modStr) {
        const mod = modStr.slice(1, -1).trim();
        if (!mod) return;
        const idM2 = mod.match(/^id\s*=\s*\(\s*["']?([^"')]+)["']?\s*\)$/i);
        if (idM2) { s.id = idM2[1].trim(); return; }
        const axM = mod.match(/^spin-axis\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)$/i);
        if (axM) {
          s.axis = { x: parseFloat(axM[1]), y: parseFloat(axM[2]), z: parseFloat(axM[3]) };
          return;
        }
        const spM = mod.match(/^spin-speed\s*\(\s*(-?\d+(?:\.\d+)?)\s*\)$/i);
        if (spM) {
          const v = parseFloat(spM[1]);
          if (v >= 0) s.speed = v;
          else errors.push('Line ' + (idx + 1) + ': @spin speed must be 0 or greater (got ' + v + ')');
          return;
        }
        errors.push('Line ' + (idx + 1) + ': Unknown modifier [' + mod + ']');
      });
      if (!s.id) errors.push('Line ' + (idx + 1) + ': @spin requires an [id=("name")] modifier');
      spins.push(s);
      return;
    }
    if (/^@\w/.test(t)) {
      errors.push('Line ' + (idx + 1) + ': Unknown IRE element "' + t + '"');
      return;
    }
    if (t.charAt(0) === '[' && elements.length) {
      const last = elements[elements.length - 1];
      parseIREModifiers(last, t, idx, errors);
      if (last.type === 'circle' || last.type === 'rectangle') last.fill = !last.fillNo;
    }
  });
  const seenIds = {};
  elements.forEach(function(el) {
    if (el.id) {
      if (seenIds[el.id]) {
        errors.push('Line ' + el.line + ': Duplicate id "' + el.id + '" — ids must be unique');
      } else {
        seenIds[el.id] = true;
      }
    }
  });
  const idMap = {};
  elements.forEach(function(el) { if (el.id) idMap[el.id] = el; });
  morphs.forEach(function(m) {
    const from = idMap[m.idFrom];
    const to = idMap[m.idTo];
    if (!from) {
      errors.push('Line ' + m.line + ': @morph references unknown id "' + m.idFrom + '"');
    } else if (!ireShapeDim(from.type)) {
      errors.push('Line ' + m.line + ': @morph idOne "' + m.idFrom + '" must be a circle, rectangle, sphere, or cube');
    }
    if (!to) {
      errors.push('Line ' + m.line + ': @morph references unknown id "' + m.idTo + '"');
    } else if (!ireShapeDim(to.type)) {
      errors.push('Line ' + m.line + ': @morph idTwo "' + m.idTo + '" must be a circle, rectangle, sphere, or cube');
    }
    if (from && to && ireShapeDim(from.type) && ireShapeDim(to.type) && ireShapeDim(from.type) !== ireShapeDim(to.type)) {
      errors.push('Line ' + m.line + ': @morph cannot morph "' + m.idFrom + '" (' + from.type + ') into "' + m.idTo + '" (' + to.type + ') — morphing is only supported within the same dimension (2D shape to 2D shape, or 3D shape to 3D shape) for now');
    }
  });
  spins.forEach(function(s) {
    if (!s.id) return;
    const target = idMap[s.id];
    if (!target) {
      errors.push('Line ' + s.line + ': @spin references unknown id "' + s.id + '"');
    } else if (target.type !== 'sphere' && target.type !== 'cube') {
      errors.push('Line ' + s.line + ': @spin target "' + s.id + '" must be a sphere or cube');
    } else {
      target.spin = { axis: s.axis, speed: s.speed };
    }
  });
  return { elements: elements, morphs: morphs, spins: spins, errors: errors };
}

// ===== IRE RENDERER =====
const ireCanvas = document.getElementById('irePreviewCanvas');
const ireCtx = ireCanvas.getContext('2d');
let ireGridOn = true;
let ireRendered = false;
let ireStartTime = 0;
let ireElements = [];
let ireElementsById = {};
let ireMorphs = [];
let ireAnimFrame = null;
let ireMouse = null;
let ireMouseZ = 0;
let ireExporting = false;

// ===== IRE 3D LAYER (groundwork; three.js) =====
// Renders a three.js scene into a separate WebGL canvas that is composited
// beneath the 2D canvas. This layer is inert until a 3D shape type exists,
// so all existing 2D behavior (and MP4 export) is unchanged.
let ire3d = null;           // { renderer, scene, camera, canvas, hasObjects }
let ire3dHas = false;       // true when at least one 3D object is in the scene
const IRE3D_CAM_DIST = 1200;

function ire3dInit() {
  if (ire3d || typeof THREE === 'undefined') return;
  try {
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
    camera.position.set(0, 0, IRE3D_CAM_DIST);
    camera.lookAt(0, 0, 0);
    const lights = new THREE.Group();
    lights.name = '__ire_lights';
    lights.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(1, 2, 3);
    lights.add(dir);
    scene.add(lights);
    ire3d = { renderer: renderer, scene: scene, camera: camera, canvas: renderer.domElement, hasObjects: false };
    ire3dHas = false;
  } catch (e) {
    console.warn('IRE 3D init failed:', e);
    ire3d = null;
  }
}

function ire3dResize(w, h) {
  if (!ire3d || w < 1 || h < 1) return;
  const dpr = window.devicePixelRatio || 1;
  ire3d.renderer.setPixelRatio(dpr);
  ire3d.renderer.setSize(w, h, false);
  ire3d.camera.aspect = w / h;
  ire3d.camera.fov = 2 * Math.atan((h / 2) / IRE3D_CAM_DIST) * 180 / Math.PI;
  ire3d.camera.updateProjectionMatrix();
}

function ire3dComposite(w, h) {
  if (!ire3d || !ire3d.hasObjects) return;
  ire3d.renderer.render(ire3d.scene, ire3d.camera);
  ireCtx.drawImage(ire3d.canvas, 0, 0, w, h);
}

// Rebuild the 3D scene from the current element list. Creates a mesh for each
// @sphere and @cube element; other (2D) element types are handled by the 2D renderer.
function ire3dBuild() {
  if (!ire3d) return;
  while (ire3d.scene.children.length) {
    const child = ire3d.scene.children[ire3d.scene.children.length - 1];
    if (child === ire3d.scene.getObjectByName('__ire_lights') || child === ire3d.camera) break;
    ire3d.scene.remove(child);
  }
  ire3d.meshes = [];
  ire3d.hasObjects = false;
  ire3dHas = false;
  const morphConsumed = new Set();
  ireMorphs.forEach(function(m) {
    morphConsumed.add(m.from);
    morphConsumed.add(m.to);
  });
  ireMorphs.forEach(function(m) {
    if (ireShapeDim(m.from.type) !== 3) return;
    const entry = ireMorph3dCreateMesh(m);
    ire3d.scene.add(entry.mesh);
    ire3d.meshes.push(entry);
    ire3d.hasObjects = true;
    ire3dHas = true;
  });
  ireElements.forEach(function(el) {
    if (el.type !== 'sphere' && el.type !== 'cube') return;
    if (morphConsumed.has(el)) return;
    const geometry = el.type === 'sphere'
      ? new THREE.SphereGeometry(1, 32, 24)
      : new THREE.BoxGeometry(1, 1, 1);
    const surface = el.fillColor || el.color || '#ffffff';
    const material = new THREE.MeshStandardMaterial({ color: surface, roughness: 0.6, metalness: 0.1 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(el.pos.x, el.pos.y, el.pos.z);
    if (el.type === 'cube' && el.rotation) {
      mesh.rotation.set(
        el.rotation.x * Math.PI / 180,
        el.rotation.y * Math.PI / 180,
        el.rotation.z * Math.PI / 180
      );
    }
    const entry = { el: el, mesh: mesh, baseQuat: mesh.quaternion.clone() };
    if (el.spin) {
      const a = el.spin.axis;
      entry.spin = {
        axis: new THREE.Vector3(a.x, a.y, a.z).normalize(),
        speed: el.spin.speed
      };
    }
    if (el.type === 'sphere') {
      mesh.scale.setScalar(Math.max(0.001, el.radius));
      if (el.animation === 'scalein') mesh.scale.setScalar(0.001);
    } else {
      mesh.scale.set(
        Math.max(0.001, el.width),
        Math.max(0.001, el.height),
        Math.max(0.001, el.depth)
      );
      if (el.animation === 'scalein') mesh.scale.setScalar(0.001);
    }
    ire3d.scene.add(mesh);
    ire3d.meshes.push(entry);
    ire3d.hasObjects = true;
    ire3dHas = true;
  });
}

const IRE3D_MORPH_LAT = 24;
const IRE3D_MORPH_LON = 32;

// Build a morph mesh whose geometry interpolates, per vertex, between the
// surface of the source (idOne) and target (idTwo) 3D shape. Both sphere and
// cube surfaces are sampled with identical topology: a lat/lon UV grid, where
// the cube surface is the "box mapping" (radial projection of each unit-sphere
// direction onto the unit cube). Vertex i is then lerped from the sphere point
// (scaled by the element's radius) to the cube point (scaled by the element's
// width/height/depth) using the shared easing curve, and normals are rebuilt.
function ireMorph3dCreateMesh(m) {
  const from = m.from;
  const to = m.to;
  const lat = IRE3D_MORPH_LAT;
  const lon = IRE3D_MORPH_LON;
  const cols = lon + 1;
  const count = (lat + 1) * cols;
  const sphereUnit = new Float32Array(count * 3);
  const cubeUnit = new Float32Array(count * 3);
  const indices = [];
  let vi = 0;
  for (let iLat = 0; iLat <= lat; iLat++) {
    const theta = (iLat / lat) * Math.PI;
    const vy = Math.cos(theta);
    const sr = Math.sin(theta);
    for (let iLon = 0; iLon <= lon; iLon++) {
      const phi = (iLon / lon) * Math.PI * 2;
      const x = sr * Math.cos(phi);
      const z = sr * Math.sin(phi);
      sphereUnit[vi] = x;
      sphereUnit[vi + 1] = vy;
      sphereUnit[vi + 2] = z;
      const mMax = Math.max(Math.abs(x), Math.abs(vy), Math.abs(z));
      cubeUnit[vi] = x / mMax;
      cubeUnit[vi + 1] = vy / mMax;
      cubeUnit[vi + 2] = z / mMax;
      vi += 3;
    }
  }
  for (let iLat = 0; iLat < lat; iLat++) {
    for (let iLon = 0; iLon < lon; iLon++) {
      const a = iLat * cols + iLon;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const surfaceFrom = from.fillColor || from.color || '#ffffff';
  const surfaceTo = to.fillColor || to.color || '#ffffff';
  const material = new THREE.MeshStandardMaterial({ color: surfaceFrom, roughness: 0.6, metalness: 0.1 });
  const mesh = new THREE.Mesh(geometry, material);
  const entry = {
    morph: true,
    el: null,
    mesh: mesh,
    geometry: geometry,
    data: { sphereUnit: sphereUnit, cubeUnit: cubeUnit },
    from: from,
    to: to,
    duration: m.duration,
    material: material,
    colorFrom: new THREE.Color(surfaceFrom),
    colorTo: new THREE.Color(surfaceTo),
    scratchQuat: new THREE.Quaternion(),
    spin: null
  };
  mesh.position.set(from.pos.x, from.pos.y, from.pos.z);
  const r1 = from.rotation || { x: 0, y: 0, z: 0 };
  mesh.rotation.set(r1.x * Math.PI / 180, r1.y * Math.PI / 180, r1.z * Math.PI / 180);
  const spinEl = from.spin ? from : (to.spin ? to : null);
  if (spinEl) {
    const a = spinEl.spin.axis;
    entry.spin = {
      axis: new THREE.Vector3(a.x, a.y, a.z).normalize(),
      speed: spinEl.spin.speed
    };
  }
  ireMorph3dSetPositions(entry, 0);
  return entry;
}

// Sample vertex i of an element's own shape (sphere surface or cube surface)
// in the element's real local units.
function ireMorph3dSample(el, i, sphereUnit, cubeUnit) {
  const sx = sphereUnit[i], sy = sphereUnit[i + 1], sz = sphereUnit[i + 2];
  const cx = cubeUnit[i], cy = cubeUnit[i + 1], cz = cubeUnit[i + 2];
  if (el.type === 'sphere') {
    const r = Math.max(0.001, el.radius);
    return { x: sx * r, y: sy * r, z: sz * r };
  }
  const wx = Math.max(0.001, el.width) / 2;
  const wy = Math.max(0.001, el.height) / 2;
  const wz = Math.max(0.001, el.depth) / 2;
  return { x: cx * wx, y: cy * wy, z: cz * wz };
}

function ireMorph3dSetPositions(entry, eased) {
  const attr = entry.geometry.attributes.position;
  const arr = attr.array;
  const su = entry.data.sphereUnit;
  const cu = entry.data.cubeUnit;
  const from = entry.from;
  const to = entry.to;
  for (let i = 0; i < arr.length; i += 3) {
    const f = ireMorph3dSample(from, i, su, cu);
    const t = ireMorph3dSample(to, i, su, cu);
    arr[i] = f.x + (t.x - f.x) * eased;
    arr[i + 1] = f.y + (t.y - f.y) * eased;
    arr[i + 2] = f.z + (t.z - f.z) * eased;
  }
  attr.needsUpdate = true;
  entry.geometry.computeVertexNormals();
}

// Update per-frame 3D animation state. Returns { finite, spinning }:
// - finite: true while a time-limited animation (scalein) is still running
// - spinning: true if any mesh has a continuous spin (never ends)
function ire3dUpdate(elapsed) {
  if (!ire3d || !ire3d.meshes) return { finite: false, spinning: false };
  let finite = false;
  let spinning = false;
  ire3d.meshes.forEach(function(entry) {
    const mesh = entry.mesh;
    if (entry.morph) {
      const from = entry.from;
      const to = entry.to;
      const t = Math.max(0, Math.min(1, elapsed / (entry.duration * 1000)));
      const eased = ireMorphEase(t);
      ireMorph3dSetPositions(entry, eased);
      mesh.position.set(
        ireMorphLerp(from.pos.x, to.pos.x, eased),
        ireMorphLerp(from.pos.y, to.pos.y, eased),
        ireMorphLerp(from.pos.z, to.pos.z, eased)
      );
      const r1 = from.rotation || { x: 0, y: 0, z: 0 };
      const r2 = to.rotation || { x: 0, y: 0, z: 0 };
      mesh.rotation.set(
        ireMorphLerp(r1.x, r2.x, eased) * Math.PI / 180,
        ireMorphLerp(r1.y, r2.y, eased) * Math.PI / 180,
        ireMorphLerp(r1.z, r2.z, eased) * Math.PI / 180
      );
      mesh.scale.set(1, 1, 1);
      entry.material.color.copy(entry.colorFrom).lerp(entry.colorTo, eased);
      if (entry.spin) {
        const angle = entry.spin.speed * Math.PI * 2 * (elapsed / 1000);
        const spinQuat = new THREE.Quaternion().setFromAxisAngle(entry.spin.axis, angle);
        mesh.quaternion.copy(entry.scratchQuat.setFromEuler(mesh.rotation)).premultiply(spinQuat);
        spinning = true;
      }
      if (t < 1) finite = true;
      return;
    }
    const el = entry.el;
    mesh.position.set(el.pos.x, el.pos.y, el.pos.z);
    if (entry.spin) {
      const angle = entry.spin.speed * Math.PI * 2 * (elapsed / 1000);
      const spinQuat = new THREE.Quaternion().setFromAxisAngle(entry.spin.axis, angle);
      mesh.quaternion.copy(entry.baseQuat).premultiply(spinQuat);
      spinning = true;
    }
    let sx = Math.max(0.001, el.radius);
    let sy = sx;
    let sz = sx;
    if (el.type === 'cube') {
      sx = Math.max(0.001, el.width);
      sy = Math.max(0.001, el.height);
      sz = Math.max(0.001, el.depth);
    }
    if (el.animation === 'scalein') {
      const t = Math.min(1, elapsed / IRE_SCALEIN_DURATION);
      const eased = 1 - Math.pow(1 - t, 3);
      const f = Math.max(0.001, eased);
      sx *= f;
      sy *= f;
      sz *= f;
      if (t < 1) finite = true;
    }
    mesh.scale.set(sx, sy, sz);
  });
  return { finite: finite, spinning: spinning };
}

function resizeIRECanvas() {
  if (ireExporting) return;
  const box = document.getElementById('irePreview');
  if (!box) return;
  const w = Math.max(1, box.clientWidth);
  const h = Math.max(1, box.clientHeight);
  const dpr = window.devicePixelRatio || 1;
  ireCanvas.width = Math.floor(w * dpr);
  ireCanvas.height = Math.floor(h * dpr);
  ireCanvas.style.width = w + 'px';
  ireCanvas.style.height = h + 'px';
  ireCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ire3dResize(w, h);
  drawIREPreview();
}

function sizeIRECanvasForExport() {
  const box = document.getElementById('irePreview');
  const exportW = 1920;
  const exportH = 1080;
  const dpr = window.devicePixelRatio || 1;
  ireCanvas.width = exportW * dpr;
  ireCanvas.height = exportH * dpr;
  if (box) {
    const boxW = Math.max(1, box.clientWidth);
    const boxH = Math.max(1, box.clientHeight);
    const scale = Math.min(boxW / exportW, boxH / exportH);
    ireCanvas.style.width = Math.floor(exportW * scale) + 'px';
    ireCanvas.style.height = Math.floor(exportH * scale) + 'px';
  } else {
    ireCanvas.style.width = exportW + 'px';
    ireCanvas.style.height = exportH + 'px';
  }
  ireCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ire3dResize(exportW, exportH);
}

function drawIREGrid(cx, cy) {
  const spacing = 40;
  ireCtx.strokeStyle = 'rgba(255,255,255,0.07)';
  ireCtx.lineWidth = 1;
  ireCtx.beginPath();
  for (let x = ((cx % spacing) + spacing) % spacing; x < ireCanvas.width / (window.devicePixelRatio || 1); x += spacing) {
    ireCtx.moveTo(x, 0);
    ireCtx.lineTo(x, ireCanvas.height / (window.devicePixelRatio || 1));
  }
  for (let y = ((cy % spacing) + spacing) % spacing; y < ireCanvas.height / (window.devicePixelRatio || 1); y += spacing) {
    ireCtx.moveTo(0, y);
    ireCtx.lineTo(ireCanvas.width / (window.devicePixelRatio || 1), y);
  }
  ireCtx.stroke();
  ireCtx.strokeStyle = 'rgba(255,255,255,0.28)';
  ireCtx.beginPath();
  ireCtx.moveTo(cx, 0);
  ireCtx.lineTo(cx, ireCanvas.height / (window.devicePixelRatio || 1));
  ireCtx.moveTo(0, cy);
  ireCtx.lineTo(ireCanvas.width / (window.devicePixelRatio || 1), cy);
  ireCtx.stroke();
  ireCtx.fillStyle = 'rgba(255,255,255,0.65)';
  ireCtx.beginPath();
  ireCtx.arc(cx, cy, 3, 0, Math.PI * 2);
  ireCtx.fill();
}

const IRE_WRITELINE_CPS = 20;
const IRE_SCALEIN_DURATION = 500; // ms
const IRE_FADEIN_DURATION = 500; // ms
const IRE_MORPH_POINTS = 64;

function ireMorphEase(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function ireMorphLerp(a, b, t) {
  return a + (b - a) * t;
}

function ireHexToRGB(hex) {
  let v = String(hex).replace('#', '');
  if (v.length === 3) v = v[0] + v[0] + v[1] + v[1] + v[2] + v[2];
  return {
    r: parseInt(v.substring(0, 2), 16),
    g: parseInt(v.substring(2, 4), 16),
    b: parseInt(v.substring(4, 6), 16)
  };
}

function ireMorphLerpColor(c1, c2, t) {
  const a = ireHexToRGB(c1);
  const b = ireHexToRGB(c2);
  return 'rgb(' + Math.round(ireMorphLerp(a.r, b.r, t)) + ',' + Math.round(ireMorphLerp(a.g, b.g, t)) + ',' + Math.round(ireMorphLerp(a.b, b.b, t)) + ')';
}

function ireMorphCirclePoints(radius, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: radius * Math.cos(a), y: radius * Math.sin(a) });
  }
  return pts;
}

function ireMorphRectPoints(width, height, n) {
  const pts = [];
  const P = 2 * (width + height);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * P;
    let x, y;
    if (t < height / 2) {
      x = width / 2;
      y = t;
    } else if (t < height / 2 + width) {
      x = width / 2 - (t - height / 2);
      y = height / 2;
    } else if (t < height / 2 + width + height) {
      x = -width / 2;
      y = height / 2 - (t - height / 2 - width);
    } else if (t < height / 2 + width + height + width) {
      x = -width / 2 + (t - height / 2 - width - height);
      y = -height / 2;
    } else {
      x = width / 2;
      y = -height / 2 + (t - (height / 2 + width + height + width));
    }
    pts.push({ x: x, y: y });
  }
  return pts;
}

function drawIREMorph(m, elapsed, cx, cy) {
  const dur = m.duration * 1000;
  const t = Math.max(0, Math.min(1, elapsed / dur));
  const eased = ireMorphEase(t);
  const from = m.from;
  const to = m.to;
  const n = IRE_MORPH_POINTS;
  const fromPts = from.type === 'circle'
    ? ireMorphCirclePoints(from.radius, n)
    : ireMorphRectPoints(from.width, from.height, n);
  const toPts = to.type === 'circle'
    ? ireMorphCirclePoints(to.radius, n)
    : ireMorphRectPoints(to.width, to.height, n);
  const px = cx + ireMorphLerp(from.pos.x, to.pos.x, eased);
  const py = cy - ireMorphLerp(from.pos.y, to.pos.y, eased);
  ireCtx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = px + ireMorphLerp(fromPts[i].x, toPts[i].x, eased);
    const y = py + ireMorphLerp(fromPts[i].y, toPts[i].y, eased);
    if (i === 0) ireCtx.moveTo(x, y);
    else ireCtx.lineTo(x, y);
  }
  ireCtx.closePath();
  ireCtx.strokeStyle = ireMorphLerpColor(from.color, to.color, eased);
  ireCtx.lineWidth = 2;
  let fillAlpha = 0;
  if (from.fill && to.fill) fillAlpha = 1;
  else if (from.fill) fillAlpha = 1 - eased;
  else if (to.fill) fillAlpha = eased;
  if (fillAlpha > 0) {
    ireCtx.globalAlpha = fillAlpha;
    ireCtx.fillStyle = ireMorphLerpColor(from.fillColor, to.fillColor, eased);
    ireCtx.fill();
    ireCtx.globalAlpha = 1;
  }
  ireCtx.stroke();
  return t < 1;
}

function drawIREElements(elapsed) {
  let animating = false;
  const w = ireCanvas.width / (window.devicePixelRatio || 1);
  const h = ireCanvas.height / (window.devicePixelRatio || 1);
  const cx = w / 2;
  const cy = h / 2;
  const morphConsumed = new Set();
  ireMorphs.forEach(function(m) {
    morphConsumed.add(m.from);
    morphConsumed.add(m.to);
  });
  const drawOrder = ireElements
    .filter(function(el) { return !morphConsumed.has(el) && el.type !== 'sphere' && el.type !== 'cube'; })
    .sort(function(a, b) {
      return (a.pos.z || 0) - (b.pos.z || 0);
    });
  drawOrder.forEach(function(el) {
    const px = cx + el.pos.x;
    const py = cy - el.pos.y;
    if (el.type === 'circle') {
      let radius = el.radius;
      if (el.animation === 'scalein') {
        const t = Math.min(1, elapsed / IRE_SCALEIN_DURATION);
        const eased = 1 - Math.pow(1 - t, 3);
        radius = el.radius * eased;
        if (t < 1) animating = true;
      }
      ireCtx.beginPath();
      ireCtx.arc(px, py, radius, 0, Math.PI * 2);
      ireCtx.strokeStyle = el.color;
      ireCtx.lineWidth = 2;
      if (el.fill) {
        ireCtx.fillStyle = el.fillColor;
        ireCtx.fill();
      }
      ireCtx.stroke();
      return;
    }
    if (el.type === 'rectangle') {
      let rw = el.width;
      let rh = el.height;
      if (el.animation === 'scalein') {
        const t = Math.min(1, elapsed / IRE_SCALEIN_DURATION);
        const eased = 1 - Math.pow(1 - t, 3);
        rw = el.width * eased;
        rh = el.height * eased;
        if (t < 1) animating = true;
      }
      ireCtx.beginPath();
      ireCtx.rect(px - rw / 2, py - rh / 2, rw, rh);
      ireCtx.strokeStyle = el.color;
      ireCtx.lineWidth = 2;
      if (el.fill) {
        ireCtx.fillStyle = el.fillColor;
        ireCtx.fill();
      }
      ireCtx.stroke();
      return;
    }
    let text = el.message;
    let fontSize = el.size;
    let alpha = 1;
    if (el.animation === 'writeline') {
      const revealed = Math.max(0, Math.min(text.length, Math.floor((elapsed / 1000) * IRE_WRITELINE_CPS)));
      text = text.substring(0, revealed);
      if (revealed < el.message.length) animating = true;
    } else if (el.animation === 'scalein') {
      const t = Math.min(1, elapsed / IRE_SCALEIN_DURATION);
      const eased = 1 - Math.pow(1 - t, 3);
      fontSize = el.size * eased;
      if (t < 1) animating = true;
    } else if (el.animation === 'fadein') {
      const t = Math.min(1, elapsed / IRE_FADEIN_DURATION);
      alpha = t;
      if (t < 1) animating = true;
    }
    if (fontSize > 0.5) {
      ireCtx.globalAlpha = alpha;
      ireCtx.font = fontSize + 'px "Segoe UI", Arial, sans-serif';
      ireCtx.fillStyle = el.color;
      ireCtx.textAlign = 'center';
      ireCtx.textBaseline = 'middle';
      ireCtx.fillText(text, px, py);
      ireCtx.globalAlpha = 1;
    }
  });
  ireMorphs.forEach(function(m) {
    if (ireShapeDim(m.from.type) === 3) return;
    if (drawIREMorph(m, elapsed, cx, cy)) animating = true;
  });
  return animating;
}

function drawIRECrosshair(w, h) {
  if (!ireGridOn || !ireMouse) return;
  ireCtx.strokeStyle = 'rgba(255,255,255,0.35)';
  ireCtx.lineWidth = 1;
  ireCtx.beginPath();
  ireCtx.moveTo(ireMouse.x, 0);
  ireCtx.lineTo(ireMouse.x, h);
  ireCtx.moveTo(0, ireMouse.y);
  ireCtx.lineTo(w, ireMouse.y);
  ireCtx.stroke();
  ireCtx.fillStyle = 'rgba(255,255,255,0.55)';
  ireCtx.beginPath();
  ireCtx.arc(ireMouse.x, ireMouse.y, 3, 0, Math.PI * 2);
  ireCtx.fill();
}

function drawIREPreview() {
  if (ireExporting) return;
  ireAnimFrame = null;
  const w = ireCanvas.width / (window.devicePixelRatio || 1);
  const h = ireCanvas.height / (window.devicePixelRatio || 1);
  ireCtx.clearRect(0, 0, w, h);
  const elapsed = ireRendered ? (performance.now() - ireStartTime) : 0;
  const anim3d = ire3dUpdate(elapsed);
  ire3dComposite(w, h);
  const cx = w / 2;
  const cy = h / 2;
  if (ireGridOn) drawIREGrid(cx, cy);
  const animating = drawIREElements(elapsed) || anim3d.finite || anim3d.spinning;
  drawIRECrosshair(w, h);
  if (animating && !ireAnimFrame) {
    ireAnimFrame = requestAnimationFrame(drawIREPreview);
  }
}

function updateIRECoord() {
  const output = document.getElementById('ireOutput');
  if (!output) return;
  let line = document.getElementById('ireCoordLine');
  if (!ireGridOn || !ireMouse) {
    if (line) line.textContent = 'Cursor: —';
    return;
  }
  const w = ireCanvas.width / (window.devicePixelRatio || 1);
  const h = ireCanvas.height / (window.devicePixelRatio || 1);
  const gx = Math.round(ireMouse.x - w / 2);
  const gy = Math.round(-(ireMouse.y - h / 2));
  if (!line) {
    line = document.createElement('div');
    line.id = 'ireCoordLine';
    line.className = 'ire-output-line coord';
    output.insertBefore(line, output.firstChild);
  }
  line.textContent = 'Cursor: (' + gx + ', ' + gy + ', ' + Math.round(ireMouseZ) + ')';
}

document.getElementById('irePreview').addEventListener('mousemove', function(e) {
  const rect = ireCanvas.getBoundingClientRect();
  ireMouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  updateIRECoord();
  drawIREPreview();
});

document.getElementById('irePreview').addEventListener('mouseleave', function() {
  ireMouse = null;
  updateIRECoord();
  drawIREPreview();
});

document.getElementById('irePreview').addEventListener('wheel', function(e) {
  e.preventDefault();
  const step = e.deltaY < 0 ? 10 : -10;
  ireMouseZ += step;
  updateIRECoord();
  drawIREPreview();
}, { passive: false });

function syncIREPlaceholder() {
  const ph = document.querySelector('.ire-preview-placeholder');
  if (ph) ph.style.display = (!ireRendered && !ireGridOn) ? '' : 'none';
}

function runIRE() {
  const output = document.getElementById('ireOutput');
  if (output) output.innerHTML = '';
  const editor = document.getElementById('ireEditor');
  const raw = editor.value;
  const status = document.getElementById('ireStatus');
  const match = raw.match(/^\s*@start\s*\(\s*["']IRE["']\s*\)/);
  if (!match) {
    logIRE('Error: Missing @start("IRE") directive. Add @start("IRE") at the top of your script.', 'error');
    if (status) { status.textContent = 'Missing @start("IRE")'; status.style.color = '#ff6b6b'; }
    return;
  }
  const body = raw.replace(/^\s*@start\s*\(\s*["']IRE["']\s*\)[^\n]*\n?/, '');
  const parsed = parseIRE(body);
  if (parsed.errors.length) {
    parsed.errors.forEach(function(e) { logIRE('Error: ' + e, 'error'); });
    if (status) { status.textContent = 'Script rejected'; status.style.color = '#ff6b6b'; }
    return;
  }
  ireElements = parsed.elements;
  ireElementsById = {};
  parsed.elements.forEach(function(el) { if (el.id) ireElementsById[el.id] = el; });
  if (Object.keys(ireElementsById).length) console.log('IRE elements by id:', ireElementsById);
  ireMorphs = parsed.morphs.map(function(m) {
    return { from: ireElementsById[m.idFrom], to: ireElementsById[m.idTo], duration: m.duration };
  });
  ireRendered = true;
  ireStartTime = performance.now();
  ire3dInit();
  ire3dBuild();
  syncIREPlaceholder();
  resizeIRECanvas();
  const lines = body.split('\n').filter(function(l) { return l.trim(); }).length;
  logIRE('@start("IRE") found and removed. Script body ready (' + lines + ' non-empty line' + (lines === 1 ? '' : 's') + ').', 'success');
  logIRE(parsed.elements.length + ' element' + (parsed.elements.length === 1 ? '' : 's') + ' and ' + parsed.morphs.length + ' morph' + (parsed.morphs.length === 1 ? '' : 's') + ' parsed. Rendering...', 'success');
  if (status) { status.textContent = 'Rendered ' + parsed.elements.length + ' element' + (parsed.elements.length === 1 ? '' : 's') + ' + ' + parsed.morphs.length + ' morph' + (parsed.morphs.length === 1 ? '' : 's'); status.style.color = '#50e3c2'; }
}

function irePickMimeType() {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return null;
  const candidates = [
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
  ];
  for (let i = 0; i < candidates.length; i++) {
    if (MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
  }
  return null;
}

function ireDownloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
}

function renderIREExportFrame(elapsed) {
  const w = ireCanvas.width / (window.devicePixelRatio || 1);
  const h = ireCanvas.height / (window.devicePixelRatio || 1);
  ireCtx.clearRect(0, 0, w, h);
  const anim3d = ire3dUpdate(elapsed);
  ire3dComposite(w, h);
  return drawIREElements(elapsed) || anim3d.finite;
}

function exportIREVideo() {
  const status = document.getElementById('ireStatus');
  const btn = document.getElementById('ireExportBtn');
  const editor = document.getElementById('ireEditor');
  const raw = editor.value;

  if (typeof MediaRecorder === 'undefined' || typeof ireCanvas.captureStream !== 'function') {
    logIRE('Error: Video export is not supported in this browser (needs MediaRecorder and canvas.captureStream).', 'error');
    if (status) { status.textContent = 'Export unsupported'; status.style.color = '#ff6b6b'; }
    return;
  }

  const match = raw.match(/^\s*@start\s*\(\s*["']IRE["']\s*\)/);
  if (!match) {
    logIRE('Error: Missing @start("IRE") directive. Add @start("IRE") at the top of your script.', 'error');
    if (status) { status.textContent = 'Missing @start("IRE")'; status.style.color = '#ff6b6b'; }
    return;
  }
  const body = raw.replace(/^\s*@start\s*\(\s*["']IRE["']\s*\)[^\n]*\n?/, '');
  const parsed = parseIRE(body);
  if (parsed.errors.length) {
    parsed.errors.forEach(function(e) { logIRE('Error: ' + e, 'error'); });
    if (status) { status.textContent = 'Script rejected'; status.style.color = '#ff6b6b'; }
    return;
  }

  ireElements = parsed.elements;
  ireElementsById = {};
  parsed.elements.forEach(function(el) { if (el.id) ireElementsById[el.id] = el; });
  ireMorphs = parsed.morphs.map(function(m) {
    return { from: ireElementsById[m.idFrom], to: ireElementsById[m.idTo], duration: m.duration };
  });
  ireRendered = true;
  ireStartTime = performance.now();
  ire3dInit();
  ire3dBuild();
  syncIREPlaceholder();
  if (btn) btn.disabled = true;
  ireExporting = true;
  if (ireAnimFrame) { cancelAnimationFrame(ireAnimFrame); ireAnimFrame = null; }
  sizeIRECanvasForExport();

  const mimeType = irePickMimeType();
  const isMp4 = mimeType && mimeType.indexOf('mp4') !== -1;
  const ext = isMp4 ? 'mp4' : 'webm';
  const filename = 'ire-export.' + ext;

  if (status) { status.textContent = 'Rendering export... do not close this tab'; status.style.color = '#ffd700'; }
  logIRE('Exporting ' + filename + ' (' + (mimeType || 'browser default') + ')...', 'info');

  let stream;
  try {
    stream = ireCanvas.captureStream(30);
  } catch (e) {
    logIRE('Error: Could not capture the preview canvas: ' + e.message, 'error');
    ireExporting = false;
    if (btn) btn.disabled = false;
    if (status) { status.textContent = 'Export failed'; status.style.color = '#ff6b6b'; }
    resizeIRECanvas();
    return;
  }

  let recorder;
  try {
    recorder = new MediaRecorder(stream, mimeType ? { mimeType: mimeType, videoBitsPerSecond: 8000000 } : { videoBitsPerSecond: 8000000 });
  } catch (e) {
    logIRE('Error: Could not start the recorder: ' + e.message, 'error');
    stream.getTracks().forEach(function(t) { t.stop(); });
    ireExporting = false;
    if (btn) btn.disabled = false;
    if (status) { status.textContent = 'Export failed'; status.style.color = '#ff6b6b'; }
    resizeIRECanvas();
    return;
  }

  const chunks = [];
  recorder.ondataavailable = function(e) {
    if (e.data && e.data.size) chunks.push(e.data);
  };
  recorder.onstop = function() {
    stream.getTracks().forEach(function(t) { t.stop(); });
    ireExporting = false;
    if (btn) btn.disabled = false;
    const type = mimeType || 'video/' + ext;
    const blob = new Blob(chunks, { type: type });
    ireDownloadBlob(blob, filename);
    if (status) { status.textContent = 'Export saved: ' + filename; status.style.color = '#50e3c2'; }
    logIRE('Export complete: ' + filename + ' (' + Math.round(blob.size / 1024) + ' KB).', 'success');
    ireStartTime = performance.now();
    resizeIRECanvas();
  };
  recorder.onerror = function(e) {
    logIRE('Error during recording: ' + (e.error ? e.error.message : 'unknown error'), 'error');
    if (status) { status.textContent = 'Export failed'; status.style.color = '#ff6b6b'; }
    try { recorder.stop(); } catch (e2) {}
  };

  recorder.start(250);

  const exportStart = performance.now();
  const MIN_EXPORT_MS = 1000;
  let stopped = false;

  function exportTick() {
    if (stopped) return;
    const elapsed = performance.now() - exportStart;
    const animating = renderIREExportFrame(elapsed);
    if (status) {
      status.textContent = 'Rendering export... ' + (elapsed / 1000).toFixed(1) + 's — do not close this tab';
    }
    if (!animating && elapsed >= MIN_EXPORT_MS) {
      stopped = true;
      try { recorder.stop(); } catch (e) {}
      return;
    }
    requestAnimationFrame(exportTick);
  }
  requestAnimationFrame(exportTick);
}

function getIREPixelPos() {
  const textarea = document.getElementById('ireEditor');
  const pos = textarea.selectionStart;
  const value = textarea.value;
  const before = value.substring(0, pos);
  const mirror = document.createElement('div');
  const s = getComputedStyle(textarea);
  mirror.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;white-space:pre;font-size:' + s.fontSize + ';line-height:' + s.lineHeight + ';font-family:' + s.fontFamily + ';padding:12px 14px;tab-size:2;width:' + textarea.clientWidth + 'px';
  mirror.appendChild(document.createTextNode(before));
  const marker = document.createElement('span');
  marker.textContent = '|';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const markerRect = marker.getBoundingClientRect();
  const taRect = textarea.getBoundingClientRect();
  const x = taRect.left + markerRect.left;
  const y = taRect.top + (markerRect.top - textarea.scrollTop);
  document.body.removeChild(mirror);
  return { x: x, y: Math.max(taRect.top, y) };
}

function getIREWord() {
  const textarea = document.getElementById('ireEditor');
  const cursorPos = textarea.selectionStart;
  const value = textarea.value;
  const lineStart = value.lastIndexOf('\n', cursorPos - 1) + 1;
  return value.substring(lineStart, cursorPos);
}

function showIREsuggestions() {
  const dropdown = document.getElementById('ireSuggestionsDropdown');
  const word = getIREWord();
  const trimmed = word.trimStart();
  if (!trimmed || trimmed[0] !== '@') {
    dropdown.classList.remove('active');
    dropdown.innerHTML = '';
    return;
  }
  const matches = IRE_SUGGESTIONS.filter(function(s) {
    return s.label.length > trimmed.length && s.label.toLowerCase().startsWith(trimmed.toLowerCase());
  });
  if (matches.length === 0) {
    dropdown.classList.remove('active');
    dropdown.innerHTML = '';
    return;
  }
  ireSelIndex = 0;
  dropdown._labels = matches.map(function(s) { return s.label; });
  dropdown.innerHTML = matches.map(function(s, i) {
    return '<div class="suggestion-item' + (i === 0 ? ' active' : '') + '" data-index="' + i + '"><span class="suggestion-label">' + s.label + '</span><span class="suggestion-desc">' + s.desc + '</span></div>';
  }).join('');
  dropdown.classList.add('active');
  const pos = getIREPixelPos();
  dropdown.style.left = pos.x + 'px';
  dropdown.style.top = (pos.y + 4) + 'px';
}

function selectIREsuggestion(index) {
  const dropdown = document.getElementById('ireSuggestionsDropdown');
  const items = dropdown.querySelectorAll('.suggestion-item');
  if (index < 0) index = items.length - 1;
  if (index >= items.length) index = 0;
  ireSelIndex = index;
  items.forEach(function(item, i) {
    item.classList.toggle('active', i === index);
  });
}

function acceptIREsuggestion() {
  const dropdown = document.getElementById('ireSuggestionsDropdown');
  const items = dropdown.querySelectorAll('.suggestion-item');
  if (items.length === 0) return;
  const labels = dropdown._labels || [];
  const label = labels[ireSelIndex] || labels[0];
  if (!label) return;
  const textarea = document.getElementById('ireEditor');
  const cursorPos = textarea.selectionStart;
  const value = textarea.value;
  const lineStart = value.lastIndexOf('\n', cursorPos - 1) + 1;
  const beforeCursor = value.substring(lineStart, cursorPos);
  const atPos = beforeCursor.lastIndexOf('@');
  const replaceStart = atPos >= 0 ? lineStart + atPos : lineStart;
  textarea.value = value.substring(0, replaceStart) + label + value.substring(cursorPos);
  let end = replaceStart + label.length;
  while (end < textarea.value.length && ')]}'.indexOf(textarea.value.charAt(end)) !== -1) {
    textarea.value = textarea.value.substring(0, end) + textarea.value.substring(end + 1);
  }
  textarea.selectionStart = textarea.selectionEnd = end;
  textarea.dispatchEvent(new Event('input'));
  dropdown.classList.remove('active');
  dropdown.innerHTML = '';
}

document.getElementById('ireEditor').addEventListener('input', function() {
  updateIREHighlight();
  showIREsuggestions();
});

document.getElementById('ireGridToggle').addEventListener('click', function() {
  ireGridOn = !ireGridOn;
  this.classList.toggle('active', ireGridOn);
  syncIREPlaceholder();
  resizeIRECanvas();
});

function toggleIREFullscreen() {
  const panel = document.getElementById('irePreviewPanel');
  const goingFull = !panel.classList.contains('ire-fullscreen');
  panel.classList.toggle('ire-fullscreen');
  const btn = document.getElementById('ireFullscreenBtn');
  btn.classList.toggle('active', goingFull);
  btn.innerHTML = goingFull ? '&#10006;' : '&#9974;';
  resizeIRECanvas();
}

document.getElementById('ireFullscreenBtn').addEventListener('click', toggleIREFullscreen);

if ('ResizeObserver' in window) {
  const previewBox = document.getElementById('irePreview');
  new ResizeObserver(resizeIRECanvas).observe(previewBox);
} else {
  window.addEventListener('resize', resizeIRECanvas);
}

updateIREHighlight();
syncIREPlaceholder();
ire3dInit();
resizeIRECanvas();

document.getElementById('ireEditor').addEventListener('scroll', function() {
  const highlight = document.getElementById('ireHighlight');
  if (highlight) {
    highlight.scrollTop = this.scrollTop;
    highlight.scrollLeft = this.scrollLeft;
  }
});

document.getElementById('ireEditor').addEventListener('keydown', function(e) {
  const dropdown = document.getElementById('ireSuggestionsDropdown');
  if (dropdown.classList.contains('active')) {
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      acceptIREsuggestion();
      return;
    } else if (e.key === 'Escape') {
      dropdown.classList.remove('active');
      dropdown.innerHTML = '';
      return;
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = dropdown.querySelectorAll('.suggestion-item');
      selectIREsuggestion(ireSelIndex + (e.key === 'ArrowDown' ? 1 : -1));
      return;
    }
  }
  if (handleAutoCloseBrackets(e, this)) return;
});

document.getElementById('ireEditor').addEventListener('blur', function() {
  setTimeout(function() {
    const dropdown = document.getElementById('ireSuggestionsDropdown');
    dropdown.classList.remove('active');
    dropdown.innerHTML = '';
  }, 150);
});

document.getElementById('ireSuggestionsDropdown').addEventListener('mousedown', function(e) {
  const item = e.target.closest('.suggestion-item');
  if (!item) return;
  e.preventDefault();
  ireSelIndex = parseInt(item.dataset.index, 10) || 0;
  acceptIREsuggestion();
});

document.getElementById('ireRunBtn').addEventListener('click', function() {
  console.log('IRE run triggered');
  runIRE();
});

document.getElementById('ireExportBtn').addEventListener('click', function() {
  console.log('IRE MP4 export requested');
  exportIREVideo();
});

// ===== GAME PROJECT SYNTAX (Code tab) =====
// Builds interactive 3D game worlds inside @project [open] ... @project [close]
// blocks. Follows the same modifier conventions as IRE ([mod(value)],
// [id=("name")] references, [set-true] flags, optional vs required arguments).

const GAME_BODY_PARTS = ['head', 'body', 'legs', 'boots', 'arms', 'full'];

function gameExtractModifiers(rest) {
  const out = [];
  const re = /\[[^\]]*\]/g;
  let m;
  while ((m = re.exec(rest))) out.push(m[0].slice(1, -1));
  return out;
}

function gameExtractGroups(rest) {
  const groups = [];
  let depth = 0, inQuote = false, inBracket = false, cur = '';
  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i];
    if (inBracket) { if (ch === ']') inBracket = false; continue; }
    if (inQuote) { cur += ch; if (ch === '"') inQuote = false; continue; }
    if (ch === '"') { inQuote = true; cur += ch; continue; }
    if (ch === '[') { inBracket = true; continue; }
    if (ch === '(') { if (depth === 0) { depth = 1; cur = ''; } else { depth++; cur += ch; } continue; }
    if (ch === ')') {
      if (depth === 1) { groups.push(cur.trim()); cur = ''; depth = 0; }
      else if (depth > 1) { depth--; cur += ch; }
      continue;
    }
    if (depth === 1) cur += ch;
  }
  return groups;
}

function gameParseModifier(mod) {
  const s = String(mod).trim();
  if (!s) return null;
  if (/^[a-zA-Z][a-zA-Z0-9-]*$/.test(s)) return { key: s, flag: true };
  const eq = s.indexOf('=');
  if (eq > 0) {
    const key = s.substring(0, eq).trim();
    let val = s.substring(eq + 1).trim();
    const pm = val.match(/^\((.*)\)$/s);
    if (pm) val = pm[1];
    val = val.replace(/^"|"$/g, '');
    return { key: key, value: val.trim() };
  }
  const fnM = s.match(/^([a-zA-Z][a-zA-Z0-9]*)\s*\(\s*([^()]*)\s*\)$/);
  if (fnM) {
    let val = fnM[2].trim();
    val = val.replace(/^"|"$/g, '');
    return { key: fnM[1], value: val };
  }
  return null;
}

function gameMod(mods, key) {
  const k = key.toLowerCase();
  for (let i = 0; i < mods.length; i++) {
    if (!mods[i].flag && mods[i].key.toLowerCase() === k) return mods[i];
  }
  return null;
}

function gameFlag(mods, key) {
  const k = key.toLowerCase();
  return mods.some(function(m) { return m.flag && m.key.toLowerCase() === k; });
}

function gameParseTuple(s) {
  const parts = String(s).split(',').map(function(p) { return p.trim(); });
  if (parts.length >= 3) {
    const x = parseFloat(parts[0]), y = parseFloat(parts[1]), z = parseFloat(parts[2]);
    if (!isNaN(x) && !isNaN(y) && !isNaN(z)) return { x: x, y: y, z: z };
  }
  return null;
}

function gameParseNum(s) {
  const v = parseFloat(s);
  return isNaN(v) ? null : v;
}

function gameModTuple(mods, key) {
  const m = gameMod(mods, key);
  return m ? gameParseTuple(m.value) : null;
}

function gameNormalizeView(raw) {
  const s = String(raw).toLowerCase().trim();
  if (s === 'bird' || s === "bird's eye" || s === "bird's eye view" || s === 'birds eye' || s === 'birds-eye' || s === 'birdseye' || s === 'top-down' || s === 'top down' || s === 'topdown' || s === 'top view') return 'birdsEye';
  if (s === 'first person' || s === 'first person view' || s === 'firstperson' || s === 'firstpersonview' || s === 'first' || s === 'fps') return 'firstPerson';
  return s.replace(/[^a-z0-9]/g, '');
}

function gameNormalizePart(p) {
  const s = String(p).toLowerCase();
  return GAME_BODY_PARTS.indexOf(s) !== -1 ? s : null;
}

// Parse a @project [open] ... @project [close] game block into structured data.
// Follows IRE conventions: bracket modifiers, [id=("name")] references, color
// names resolved through the shared color table. All commands must parse
// without error; unknown/unexpected input produces a clear error message.
function parseGameProject(script) {
  const result = {
    hasGame: false,
    name: null,
    provider: null,
    webOpen: false,
    players: [],
    opponents: [],
    structures: [],
    positions: [],
    transitions: [],
    controls: [],
    weaponBinds: [],
    colors: [],
    emotes: [],
    enemies: [],
    view: null,
    errors: [],
    logs: []
  };
  const lines = String(script).split('\n');
  let inProject = false;

  function structureById(id) {
    for (let i = 0; i < result.structures.length; i++) {
      if (result.structures[i].id === id) return result.structures[i];
    }
    return null;
  }

  lines.forEach(function(line, idx) {
    const t = line.trim();
    if (!t) return;
    if (t.indexOf('--') === 0) return;
    if (/^@project\s+\[open\]\s*$/i.test(t)) { inProject = true; return; }
    if (/^@project\s+\[close\]\s*$/i.test(t)) { inProject = false; return; }
    const cm = t.match(/^@([a-zA-Z][a-zA-Z0-9]*)\b/);
    if (!cm) return;
    const cmd = cm[1].toLowerCase();
    const rest = t.slice(cm[0].length);
    const gameCmds = ['project', 'provider', 'player', 'opponent', 'enemy', 'position', 'transition', 'frame', 'add', 'transportation', 'recharge', 'shoot', 'view', 'color', 'emote', 'open'];
    if (gameCmds.indexOf(cmd) === -1) return;
    if (cmd === 'project' && /tic\s+tac\s+toe/i.test(rest)) return;
    if (!inProject) {
      result.errors.push('Line ' + (idx + 1) + ': @' + cmd + ' must be inside a @project [open] ... @project [close] block');
      return;
    }
    result.hasGame = true;
    const LN = 'Line ' + (idx + 1);
    const mods = gameExtractModifiers(rest).map(gameParseModifier).filter(function(x) { return !!x; });
    const groups = gameExtractGroups(rest);

    switch (cmd) {
      case 'project': {
        const nameMod = gameMod(mods, 'name');
        if (nameMod) result.name = nameMod.value;
        break;
      }
      case 'provider': {
        const descMod = gameMod(mods, 'description');
        if (descMod) result.provider = descMod.value;
        else result.errors.push(LN + ': @provider requires a [description("text")] modifier');
        break;
      }
      case 'player': {
        const idMod = gameMod(mods, 'id');
        if (!idMod || !idMod.value) {
          result.errors.push(LN + ': @player requires an [id=("name")] modifier');
          break;
        }
        result.players.push({ id: idMod.value, line: idx + 1 });
        break;
      }
      case 'opponent': {
        const opMod = gameMod(mods, 'op');
        const idMod = gameMod(mods, 'id');
        if (!opMod) {
          result.errors.push(LN + ': @opponent requires an [op="opponent type"] modifier');
          break;
        }
        const id = idMod ? idMod.value : 'opponent' + (result.opponents.length + 1);
        result.opponents.push({ id: id, op: opMod.value, line: idx + 1 });
        break;
      }
      case 'enemy': {
        const pid = gameMod(mods, 'pid');
        const eid = gameMod(mods, 'eid');
        result.enemies.push({
          shoot: gameFlag(mods, 'shoot'),
          Pid: pid ? pid.value : null,
          Eid: eid ? eid.value : null,
          line: idx + 1
        });
        break;
      }
      case 'position': {
        const idMod = gameMod(mods, 'id');
        const groupTuple = groups.map(gameParseTuple).filter(function(x) { return !!x; })[0];
        const tuple = groupTuple || gameModTuple(mods, 'position');
        if (!idMod) {
          result.errors.push(LN + ': @position requires an [id=("entityId")] modifier');
          break;
        }
        if (!tuple) {
          result.errors.push(LN + ': @position requires a position tuple (x, y, z)');
          break;
        }
        result.positions.push({
          id: idMod.value,
          pos: tuple,
          spawnpoint: gameFlag(mods, 'spawnpoint'),
          line: idx + 1
        });
        break;
      }
      case 'transition': {
        const idMod = gameMod(mods, 'id');
        const tuple = gameModTuple(mods, 'position');
        if (!idMod) {
          result.errors.push(LN + ': @transition requires an [id=("entityId")] modifier');
          break;
        }
        if (!tuple) {
          result.errors.push(LN + ': @transition requires a [position(x, y, z)] modifier');
          break;
        }
        result.transitions.push({ id: idMod.value, pos: tuple, line: idx + 1 });
        break;
      }
      case 'frame': {
        const typeMod = gameMod(mods, 'type');
        const idMod = gameMod(mods, 'id');
        const tuple = gameModTuple(mods, 'position');
        const width = gameMod(mods, 'width');
        const height = gameMod(mods, 'height');
        const descMod = gameMod(mods, 'description');
        const colorMod = gameMod(mods, 'color');
        const solid = gameFlag(mods, 'set-true') || gameFlag(mods, 'settrue') || gameFlag(mods, 'set');
        const id = idMod ? idMod.value : null;
        if (id) {
          const existing = structureById(id);
          if (existing) {
            if (typeMod) existing.type = typeMod.value.toLowerCase();
            if (tuple) existing.pos = tuple;
            if (width) existing.width = gameParseNum(width.value);
            if (height) existing.height = gameParseNum(height.value);
            if (descMod) existing.description = descMod.value;
            if (colorMod) {
              const c = resolveIREColor(colorMod.value);
              if (c) existing.color = c;
              else result.errors.push(LN + ': Unknown color "' + colorMod.value + '"');
            }
            existing.solid = solid;
            existing.placeholder = false;
            break;
          }
        }
        const color = colorMod ? resolveIREColor(colorMod.value) : null;
        if (colorMod && !color) result.errors.push(LN + ': Unknown color "' + colorMod.value + '"');
        result.structures.push({
          id: id || ('frame' + (result.structures.length + 1)),
          type: typeMod ? typeMod.value.toLowerCase() : 'platform',
          pos: tuple || { x: 0, y: 0, z: 0 },
          width: width ? gameParseNum(width.value) : 200,
          height: height ? gameParseNum(height.value) : 10,
          description: descMod ? descMod.value : null,
          color: color,
          solid: solid,
          placeholder: false,
          line: idx + 1
        });
        break;
      }
      case 'add': {
        if (!gameFlag(mods, 'structure')) {
          result.errors.push(LN + ': @add requires a [structure] modifier');
          break;
        }
        const idMod = gameMod(mods, 'id');
        if (!idMod) {
          result.errors.push(LN + ': @add [structure] requires an [id=("name")] modifier');
          break;
        }
        if (structureById(idMod.value)) {
          result.errors.push(LN + ': Duplicate structure id "' + idMod.value + '" — ids must be unique');
          break;
        }
        result.structures.push({
          id: idMod.value,
          placeholder: true,
          type: 'platform',
          pos: { x: 0, y: 0, z: 0 },
          width: 200,
          height: 10,
          description: null,
          color: null,
          solid: false,
          line: idx + 1
        });
        break;
      }
      case 'transportation': {
        const typeMod = gameMod(mods, 'type');
        const idMod = gameMod(mods, 'id');
        const keysGroup = groups[0] || '';
        if (!typeMod) {
          result.errors.push(LN + ': @transportation requires a [type("walk"/"run"/"fly")] modifier');
          break;
        }
        if (!keysGroup) {
          result.errors.push(LN + ': @transportation requires a key list in parentheses, e.g. (WASD) or (arrow keys)');
          break;
        }
        result.controls.push({
          id: idMod ? idMod.value : null,
          type: typeMod.value.toLowerCase(),
          keys: keysGroup,
          line: idx + 1
        });
        break;
      }
      case 'recharge':
      case 'shoot': {
        const weaponMatch = rest.match(/<([^>]+)>/);
        const weapon = weaponMatch ? weaponMatch[1].trim() : null;
        const mouseGroup = groups[groups.length - 1] || '';
        if (!weapon) {
          result.errors.push(LN + ': @' + cmd + ' requires a weapon name in <angle brackets>');
          break;
        }
        result.weaponBinds.push({
          action: cmd === 'shoot' ? 'shoot' : 'recharge',
          weapon: weapon,
          mouse: mouseGroup || (cmd === 'shoot' ? 'mouse left click' : 'mouse right click'),
          line: idx + 1
        });
        break;
      }
      case 'view': {
        const mode = groups[0] || '';
        if (!mode) {
          result.errors.push(LN + ': @view requires a mode in parentheses, e.g. (bird\'s eye view)');
          break;
        }
        result.view = { raw: mode, mode: gameNormalizeView(mode), line: idx + 1 };
        break;
      }
      case 'color': {
        const colorMod = gameMod(mods, 'color');
        let id = null, part = null;
        groups.forEach(function(g) {
          const idM = g.match(/^id\s*=\s*\(\s*"([^"]*)"\s*\)\s*$/i);
          if (idM) { id = idM[1].trim(); return; }
          const p = gameNormalizePart(g.replace(/^"|"$/g, ''));
          if (p) part = g.replace(/^"|"$/g, '');
        });
        if (!id) {
          result.errors.push(LN + ': @color requires (id=("entityId"))');
          break;
        }
        if (!part) {
          result.errors.push(LN + ': @color requires a body part (Head, Body, Legs, Boots, Arms, or Full)');
          break;
        }
        const color = colorMod ? resolveIREColor(colorMod.value) : '#ffd700';
        if (colorMod && !color) result.errors.push(LN + ': Unknown color "' + colorMod.value + '"');
        result.colors.push({ id: id, part: part, color: color, line: idx + 1 });
        break;
      }
      case 'emote': {
        const durationMod = gameMod(mods, 'duration');
        let id = null, name = null;
        groups.forEach(function(g) {
          const idM = g.match(/^id\s*=\s*\(\s*"([^"]*)"\s*\)\s*$/i);
          if (idM) { id = idM[1].trim(); return; }
          const nm = g.match(/^"([^"]*)"$/);
          if (nm) { name = nm[1].trim(); return; }
          if (g && !name) name = g.replace(/^"|"$/g, '').trim();
        });
        if (!id) {
          result.errors.push(LN + ': @emote requires (id=("entityId"))');
          break;
        }
        if (!name) {
          result.errors.push(LN + ': @emote requires an emote name in quotes, e.g. ("wave")');
          break;
        }
        let duration = 2;
        if (durationMod) {
          const d = gameParseNum(durationMod.value);
          if (d === null || d <= 0) {
            result.errors.push(LN + ': @emote duration must be a positive number (got "' + durationMod.value + '")');
          } else {
            duration = d;
          }
        }
        result.emotes.push({ id: id, name: name, duration: duration, line: idx + 1 });
        break;
      }
      case 'open': {
        if (gameFlag(mods, 'web')) result.webOpen = true;
        break;
      }
    }
  });

  // ---- post-validation (id references must resolve) ----
  const ids = {};
  result.players.concat(result.opponents).forEach(function(e) {
    if (ids[e.id]) {
      result.errors.push('Line ' + ids[e.id] + ': Duplicate entity id "' + e.id + '" — ids must be unique');
    } else {
      ids[e.id] = e.line;
    }
  });
  function entityExists(id) { return ids[id] !== undefined; }

  result.enemies.forEach(function(en) {
    if (!en.Pid) {
      result.errors.push('Line ' + en.line + ': @enemy [shoot] requires a [Pid=("targetPlayerId")] modifier');
    } else if (!result.players.some(function(p) { return p.id === en.Pid; })) {
      result.errors.push('Line ' + en.line + ': @enemy references unknown player id "' + en.Pid + '"');
    }
    if (!en.Eid) {
      result.errors.push('Line ' + en.line + ': @enemy [shoot] requires an [Eid=("enemyId")] modifier');
    } else if (!result.opponents.some(function(o) { return o.id === en.Eid; })) {
      result.errors.push('Line ' + en.line + ': @enemy references unknown enemy id "' + en.Eid + '"');
    }
  });

  result.positions.forEach(function(p) {
    if (!entityExists(p.id)) result.errors.push('Line ' + p.line + ': @position references unknown entity id "' + p.id + '"');
  });
  result.transitions.forEach(function(tr) {
    if (!entityExists(tr.id)) result.errors.push('Line ' + tr.line + ': @transition references unknown entity id "' + tr.id + '"');
  });
  result.colors.forEach(function(c) {
    if (!entityExists(c.id)) result.errors.push('Line ' + c.line + ': @color references unknown entity id "' + c.id + '"');
  });
  result.emotes.forEach(function(em) {
    if (!entityExists(em.id)) result.errors.push('Line ' + em.line + ': @emote references unknown entity id "' + em.id + '"');
  });
  result.controls.forEach(function(c) {
    if (c.id && !entityExists(c.id)) result.errors.push('Line ' + c.line + ': @transportation references unknown entity id "' + c.id + '"');
  });

  const structIds = {};
  result.structures.forEach(function(s) {
    if (s.placeholder) return;
    if (structIds[s.id]) {
      result.errors.push('Line ' + s.line + ': Duplicate structure id "' + s.id + '" — ids must be unique');
    } else {
      structIds[s.id] = true;
    }
  });
  if (result.hasGame && !result.view) result.view = { raw: 'bird\'s eye view', mode: 'birdsEye', line: null };
  return result;
}

// ===== GAME WORLD RENDERER (Code tab preview) =====
let gameWorld = null;

function gameDisposeWorld() {
  if (gameWorld) {
    if (gameWorld.raf) cancelAnimationFrame(gameWorld.raf);
    if (gameWorld.ro) gameWorld.ro.disconnect();
    if (gameWorld.onResize) window.removeEventListener('resize', gameWorld.onResize);
    if (gameWorld.keydown) document.removeEventListener('keydown', gameWorld.keydown);
    if (gameWorld.keyup) document.removeEventListener('keyup', gameWorld.keyup);
    if (gameWorld.mousedown) gameWorld.canvas.removeEventListener('mousedown', gameWorld.mousedown);
    if (gameWorld.contextmenu) gameWorld.canvas.removeEventListener('contextmenu', gameWorld.contextmenu);
    if (gameWorld.canvas) { try { gameWorld.canvas.remove(); } catch (e) {} }
    if (gameWorld.wrap) { try { gameWorld.wrap.remove(); } catch (e) {} }
    try { gameWorld.renderer.dispose(); } catch (e) {}
    gameWorld = null;
  }
}

function gameBuildHumanoid(kind) {
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);
  const player = kind === 'player';
  const skin = player ? 0xffcc88 : 0xcc9966;
  const outfit = player ? 0x55aaff : 0xff5555;
  const mk = function(c) { return new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.1 }); };
  const mats = { Head: mk(skin), Body: mk(outfit), Arms: mk(outfit), Legs: mk(outfit), Boots: mk(0x333344) };

  const body = new THREE.Mesh(new THREE.BoxGeometry(30, 38, 20), mats.Body);
  rig.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 12), mats.Head);
  head.position.y = 34;
  rig.add(head);

  const armGeo = new THREE.BoxGeometry(9, 26, 10);
  const armL = new THREE.Mesh(armGeo, mats.Arms);
  armL.position.y = 2;
  const armR = new THREE.Mesh(armGeo, mats.Arms);
  armR.position.y = 2;
  const armGroupL = new THREE.Group();
  armGroupL.position.set(-20, 0, 0);
  armGroupL.add(armL);
  const armGroupR = new THREE.Group();
  armGroupR.position.set(20, 0, 0);
  armGroupR.add(armR);
  rig.add(armGroupL, armGroupR);

  const legGeo = new THREE.BoxGeometry(12, 24, 12);
  const legL = new THREE.Mesh(legGeo, mats.Legs);
  legL.position.set(-8, -31, 0);
  const legR = new THREE.Mesh(legGeo, mats.Legs);
  legR.position.set(8, -31, 0);
  const legsGroup = new THREE.Group();
  legsGroup.add(legL, legR);
  rig.add(legsGroup);

  const bootGeo = new THREE.BoxGeometry(13, 9, 20);
  const bootL = new THREE.Mesh(bootGeo, mats.Boots);
  bootL.position.set(-8, -47, 4);
  const bootR = new THREE.Mesh(bootGeo, mats.Boots);
  bootR.position.set(8, -47, 4);
  rig.add(bootL, bootR);

  group.userData = {
    rig: rig,
    parts: { Head: head, Body: body, Arms: [armL, armR], Legs: [legL, legR], Boots: [bootL, bootR], Mats: mats },
    rigArms: { L: armGroupL, R: armGroupR, legs: legsGroup }
  };
  return group;
}

function gameApplyPartColor(entity, part, colorHex) {
  const mats = entity.group.userData.parts.Mats;
  const c = new THREE.Color(colorHex);
  const p = String(part).toLowerCase();
  if (p === 'full') {
    Object.keys(mats).forEach(function(k) { mats[k].color.copy(c); });
  } else if (mats[p] === undefined) {
    const key = p.charAt(0).toUpperCase() + p.slice(1);
    if (mats[key]) mats[key].color.copy(c);
  } else {
    mats[p].color.copy(c);
  }
}

function gameBuildFrame(frame) {
  const type = frame.type || 'platform';
  const w = frame.width || 200;
  const h = frame.height || 10;
  let depth = 20;
  if (type === 'floor') depth = w;
  const color = frame.color || (type === 'floor' ? '#445566' : '#887744');
  const mat = new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.8,
    metalness: 0.1,
    transparent: !frame.solid,
    opacity: frame.solid ? 1 : 0.55
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), mat);
  mesh.position.set(frame.pos.x, frame.pos.y, frame.pos.z);
  if (type === 'floor' && frame.pos.y === 0) mesh.position.y = -h / 2;
  mesh.userData.description = frame.description;
  return mesh;
}

function gameMakeLabelSprite(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 60px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = 14;
  ctx.fillStyle = color || '#ffd700';
  ctx.fillText(text, 256, 64);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(240, 60, 1);
  return sprite;
}

function gameCtrlKeys(keysStr) {
  const s = String(keysStr).toLowerCase();
  const set = new Set();
  if (s.indexOf('w') !== -1) set.add('w');
  if (s.indexOf('a') !== -1) set.add('a');
  if (s.indexOf('s') !== -1) set.add('s');
  if (s.indexOf('d') !== -1) set.add('d');
  if (s.indexOf('arrow') !== -1) {
    set.add('arrowup');
    set.add('arrowdown');
    set.add('arrowleft');
    set.add('arrowright');
  }
  return set;
}

const GAME_EMOTE_ANIMS = {
  wave: function(g, p) { g.userData.rigArms.R.rotation.z = -Math.abs(Math.sin(p * Math.PI * 2)) * 1.1; },
  squat: function(g, p) {
    const s = 1 - 0.3 * Math.sin(p * Math.PI);
    g.userData.rig.scale.y = s;
    g.userData.rig.scale.x = 2 - s;
    g.userData.rig.scale.z = 2 - s;
  },
  breakdancing: function(g, p) { g.userData.rig.rotation.y = p * Math.PI * 2; },
  twerk: function(g, p) {
    g.userData.rig.rotation.z = Math.sin(p * Math.PI * 6) * 0.15;
    g.userData.rig.position.y = Math.abs(Math.sin(p * Math.PI * 6)) * 6;
    g.userData.rigArms.legs.rotation.x = Math.sin(p * Math.PI * 6) * 0.2;
  },
  'default': function(g, p) { g.userData.rig.position.y = Math.abs(Math.sin(p * Math.PI)) * 5; }
};

const GAME_CAMERA_MODES = {
  birdsEye: function(cam) {
    cam.position.set(700, 1500, 700);
    cam.up.set(0, 1, 0);
    cam.lookAt(0, 0, 0);
  },
  firstPerson: function(cam, player) {
    cam.up.set(0, 1, 0);
    if (player && player.group) {
      const g = player.group;
      g.visible = false;
      const eyeY = g.position.y + 80;
      cam.position.set(g.position.x, eyeY, g.position.z);
      const ry = g.rotation ? g.rotation.y : 0;
      cam.lookAt(g.position.x + Math.sin(ry) * 20, eyeY, g.position.z + Math.cos(ry) * 20);
    } else {
      cam.position.set(0, 80, 0);
      cam.lookAt(20, 80, 0);
    }
  }
};

function gameLogEvent(world, msg) {
  if (!world.console) return;
  const div = document.createElement('div');
  div.style.cssText = 'padding:2px 4px;font-size:11px;color:#8fd8ff;font-family:Consolas,monospace;white-space:pre-wrap;word-break:break-word;';
  div.innerHTML = msg;
  world.console.appendChild(div);
  world.console.scrollTop = world.console.scrollHeight;
  while (world.console.children.length > 4) world.console.removeChild(world.console.firstChild);
}

function gameSizeWorld(world) {
  const rect = world.wrap.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width));
  const h = Math.max(1, Math.floor(rect.height));
  world.renderer.setSize(w, h, false);
  world.camera.aspect = w / h;
  world.camera.updateProjectionMatrix();
}

function gameAnimate(world) {
  world.raf = requestAnimationFrame(function() { gameAnimate(world); });
  const now = performance.now();
  const dt = Math.min(0.05, (now - world.lastFrame) / 1000 || 0.016);
  world.lastFrame = now;

  world.entities.forEach(function(ent) {
    if (ent.transition) {
      const tr = ent.transition;
      const p = Math.min(1, (now - tr.start) / tr.duration);
      const e = ireMorphEase(p);
      ent.group.position.x = tr.from.x + (tr.to.x - tr.from.x) * e;
      ent.group.position.y = tr.from.y + (tr.to.y - tr.from.y) * e;
      ent.group.position.z = tr.from.z + (tr.to.z - tr.from.z) * e;
      if (p >= 1) ent.transition = null;
    }
  });

  world.entities.forEach(function(ent) {
    const em = ent.emote;
    if (!em) return;
    const p = Math.min(1, (now - em.start) / em.duration);
    const rig = ent.group.userData.rig;
    rig.rotation.set(0, 0, 0);
    rig.scale.set(1, 1, 1);
    rig.position.y = 0;
    ent.group.userData.rigArms.R.rotation.z = 0;
    ent.group.userData.rigArms.L.rotation.z = 0;
    ent.group.userData.rigArms.legs.rotation.x = 0;
    if (em.anim) em.anim(ent.group, p);
    if (em.sprite) {
      em.sprite.position.set(ent.group.position.x, ent.group.position.y + 115 + Math.sin(p * Math.PI * 3) * 8, ent.group.position.z);
      em.sprite.material.opacity = Math.max(0, Math.min(1, p < 0.1 ? p / 0.1 : p > 0.85 ? (1 - p) / 0.15 : 1));
    }
    if (p >= 1) {
      if (em.sprite) world.scene.remove(em.sprite);
      ent.emote = null;
    }
  });

  if (world.controls && world.player) {
    const keys = world.keys;
    const up = keys.has('w') || keys.has('arrowup');
    const down = keys.has('s') || keys.has('arrowdown');
    const left = keys.has('a') || keys.has('arrowleft');
    const right = keys.has('d') || keys.has('arrowright');
    let dx = 0, dz = 0;
    if (up) dz -= 1;
    if (down) dz += 1;
    if (left) dx -= 1;
    if (right) dx += 1;
    if (dx !== 0 || dz !== 0) {
      const len = Math.sqrt(dx * dx + dz * dz);
      const speed = (world.controls.speed || 160) * dt;
      world.player.group.position.x += (dx / len) * speed;
      world.player.group.position.z += (dz / len) * speed;
      world.player.group.rotation.y = Math.atan2(dx, dz);
    }
  }

  if (world.viewMode === 'firstPerson') {
    const ref = world.playerRef;
    if (ref && ref.group) {
      const g = ref.group;
      if (g.visible) g.visible = false;
      const eyeY = g.position.y + 80;
      world.camera.position.set(g.position.x, eyeY, g.position.z);
      const ry = g.rotation ? g.rotation.y : 0;
      world.camera.up.set(0, 1, 0);
      world.camera.lookAt(g.position.x + Math.sin(ry) * 20, eyeY, g.position.z + Math.cos(ry) * 20);
    }
  } else if (world.playerRef && world.playerRef.group && world.playerRef.group.visible === false && world.viewMode !== 'firstPerson') {
    world.playerRef.group.visible = true;
  }

  world.renderer.render(world.scene, world.camera);
}

function runGameWorld(parsed, outputEl, previewPanel) {
  gameDisposeWorld();
  if (typeof THREE === 'undefined') {
    outputEl.innerHTML += '<div class="output-line" style="color:#ff6b6b">&#10060; 3D engine unavailable — cannot render game world</div>';
    return;
  }

  function out(html) { outputEl.innerHTML += '<div class="output-line">' + html + '</div>'; }
  function ok(html) { outputEl.innerHTML += '<div class="output-line" style="color:#50e3c2">' + html + '</div>'; }

  ok('&#127918; Game project' + (parsed.name ? ' "' + parsed.name + '"' : '') + ' loaded.');
  if (parsed.provider) out('<span style="color:#8a8a8a">&#128172; ' + parsed.provider + '</span>');
  out('&#129482; ' + parsed.players.length + ' player(s), ' + parsed.opponents.length + ' opponent(s), ' + parsed.structures.length + ' structure(s).');
  if (parsed.view) out('&#128247; Camera: "' + parsed.view.raw + '"');
  if (parsed.webOpen) out('&#128279; Web content permission: enabled (flag stored).');

  parsed.controls.forEach(function(c) {
    ok('&#127909; Controls: [' + c.type + '] bound to (' + c.keys + ') for ' + (c.id || 'player') + '.');
  });
  parsed.weaponBinds.forEach(function(b) {
    ok('&#127919; Weapon bind (stub): "' + b.weapon + '" ' + b.action + ' on ' + b.mouse + ' — would fire/reload in a full implementation.');
  });
  parsed.enemies.forEach(function(en) {
    ok('&#128127; Enemy AI (stub): ' + (en.Eid || '?') + ' ' + (en.shoot ? 'shoots at ' + (en.Pid || '?') : 'patrols') + ' — behavior logged, no live AI yet.');
  });
  parsed.transitions.forEach(function(tr) {
    ok('&#127919; Transition: ' + tr.id + ' animating to (' + tr.pos.x + ', ' + tr.pos.y + ', ' + tr.pos.z + ').');
  });
  parsed.emotes.forEach(function(em) {
    ok('&#129303; Emote: "' + em.name + '" playing on ' + em.id + ' for ' + em.duration + 's.');
  });
  parsed.colors.forEach(function(c) {
    out('&#127912; ' + c.id + ' ' + c.part + ' colored ' + c.color + '.');
  });

  const wrap = document.createElement('div');
  wrap.style.cssText = 'width:100%;height:420px;position:relative;background:#0b1020;border-radius:8px;overflow:hidden;margin:8px 0;border:1px solid var(--border);display:flex;flex-direction:column;';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'flex:1;display:block;width:100%;';
  const consoleEl = document.createElement('div');
  consoleEl.style.cssText = 'height:60px;overflow-y:auto;background:rgba(0,0,0,0.45);border-top:1px solid rgba(255,255,255,0.08);padding:2px 4px;';
  wrap.appendChild(canvas);
  wrap.appendChild(consoleEl);
  outputEl.appendChild(wrap);

  const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x0b1020, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 1, 20000);
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(300, 800, 500);
  scene.add(dir);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334466, 0.5));

  const grid = new THREE.GridHelper(3000, 30, 0x2a3a5a, 0x1b2740);
  grid.position.y = 0.5;
  scene.add(grid);

  const world = {
    renderer: renderer, scene: scene, camera: camera, wrap: wrap, canvas: canvas,
    console: consoleEl, keys: new Set(), entities: [], frames: [], emotes: [],
    transitions: [], controls: null, player: null, weaponBinds: parsed.weaponBinds,
    raf: null, ro: null, onResize: null, keydown: null, keyup: null, mousedown: null,
    contextmenu: null, lastFrame: performance.now(), start: performance.now()
  };

  parsed.structures.forEach(function(f) {
    const mesh = gameBuildFrame(f);
    scene.add(mesh);
    world.frames.push({ frame: f, mesh: mesh });
  });

  const entityDefs = [];
  parsed.players.forEach(function(p) { entityDefs.push({ id: p.id, kind: 'player' }); });
  parsed.opponents.forEach(function(o) { entityDefs.push({ id: o.id, kind: 'opponent', op: o.op }); });

  const entities = {};
  entityDefs.forEach(function(def) {
    const group = gameBuildHumanoid(def.kind);
    scene.add(group);
    const ent = { def: def, group: group, emote: null, spawn: null, transition: null, hasSetPos: false };
    entities[def.id] = ent;
    world.entities.push(ent);
  });

  parsed.positions.forEach(function(p) {
    const ent = entities[p.id];
    if (!ent) return;
    if (p.spawnpoint) {
      ent.spawn = p.pos;
    } else {
      ent.group.position.set(p.pos.x, p.pos.y, p.pos.z);
      ent.hasSetPos = true;
    }
  });
  world.entities.forEach(function(ent) {
    if (!ent.hasSetPos && ent.spawn) ent.group.position.set(ent.spawn.x, ent.spawn.y, ent.spawn.z);
  });

  parsed.colors.forEach(function(c) {
    const ent = entities[c.id];
    if (!ent) return;
    gameApplyPartColor(ent, c.part, c.color);
  });

  parsed.transitions.forEach(function(tr) {
    const ent = entities[tr.id];
    if (!ent) return;
    ent.transition = {
      from: { x: ent.group.position.x, y: ent.group.position.y, z: ent.group.position.z },
      to: tr.pos,
      start: performance.now(),
      duration: 1000
    };
  });

  parsed.emotes.forEach(function(em) {
    const ent = entities[em.id];
    if (!ent) return;
    const dur = Math.max(0.2, em.duration || 2) * 1000;
    ent.emote = {
      name: em.name,
      start: performance.now(),
      duration: dur,
      sprite: gameMakeLabelSprite(em.name, '#ffd700'),
      anim: GAME_EMOTE_ANIMS[em.name.toLowerCase()] || GAME_EMOTE_ANIMS['default']
    };
    scene.add(ent.emote.sprite);
  });

  parsed.controls.forEach(function(ctrl) {
    const target = ctrl.id ? entities[ctrl.id] : (parsed.players.length ? entities[parsed.players[0].id] : null);
    if (target && target.def.kind === 'player' && !world.controls) {
      world.player = target;
      world.controls = {
        keys: gameCtrlKeys(ctrl.keys),
        speed: ctrl.type === 'run' ? 240 : ctrl.type === 'fly' ? 300 : 160
      };
    }
  });

  const viewMode = (parsed.view && GAME_CAMERA_MODES[parsed.view.mode]) ? parsed.view.mode : 'birdsEye';
  world.viewMode = viewMode;
  world.playerRef = world.player || (parsed.players.length ? entities[parsed.players[0].id] : null);
  (GAME_CAMERA_MODES[viewMode] || GAME_CAMERA_MODES.birdsEye)(camera, world.playerRef);

  world.keydown = function(e) {
    if (gameWorld !== world) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    world.keys.add(e.key.toLowerCase());
    if (e.key.indexOf('Arrow') === 0) e.preventDefault();
  };
  world.keyup = function(e) {
    if (gameWorld !== world) return;
    world.keys.delete(e.key.toLowerCase());
  };
  world.mousedown = function(e) {
    if (gameWorld !== world) return;
    const isLeft = e.button === 0;
    const isRight = e.button === 2;
    if (isRight) e.preventDefault();
    world.weaponBinds.forEach(function(b) {
      if (b.action === 'shoot' && isLeft) gameLogEvent(world, '&#127919; [' + b.weapon + '] shoot fired (stub)');
      if (b.action === 'recharge' && isRight) gameLogEvent(world, '&#8635; [' + b.weapon + '] recharge (stub)');
    });
  };
  world.contextmenu = function(e) { e.preventDefault(); };
  document.addEventListener('keydown', world.keydown);
  document.addEventListener('keyup', world.keyup);
  canvas.addEventListener('mousedown', world.mousedown);
  canvas.addEventListener('contextmenu', world.contextmenu);

  gameWorld = world;
  gameSizeWorld(world);
  if (typeof ResizeObserver !== 'undefined') {
    world.ro = new ResizeObserver(function() { gameSizeWorld(world); });
    world.ro.observe(world.wrap);
  }
  world.onResize = function() { gameSizeWorld(world); };
  window.addEventListener('resize', world.onResize);
  gameAnimate(world);
}

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
    { id: 41, command: '@project [name("projectName")]', description: 'Sets the name of the current project. Works inside a @project [open] block.', tags: ['project', 'game'], addedBy: 'system' },
    { id: 42, command: '@provider [description("text")]', description: 'Sets a description for the project, shown wherever project metadata is displayed.', tags: ['project', 'game'], addedBy: 'system' },
    { id: 43, command: '@player [id=("name")]', description: 'Declares a controllable player entity with the given id.', tags: ['project', 'game', 'entity'], addedBy: 'system' },
    { id: 44, command: '@opponent [op="type"] [id=("name")]', description: 'Declares an NPC/opponent entity (e.g. grunt, boss). Id optional; auto-assigned when omitted.', tags: ['project', 'game', 'entity'], addedBy: 'system' },
    { id: 45, command: '@enemy [shoot] [Pid=("player")] [Eid=("enemy")]', description: 'Makes the enemy with id Eid shoot at the player with id Pid. Both ids must already exist.', tags: ['project', 'game', 'enemy'], addedBy: 'system' },
    { id: 46, command: '@position [set] [id=("entity")] (x, y, z)', description: 'Sets the position of any entity by id. Add [spawnpoint] to set a respawn location instead.', tags: ['project', 'game', 'position'], addedBy: 'system' },
    { id: 47, command: '@transition [animation] [id=("entity")] [position(x, y, z)]', description: 'Smoothly animates an entity from its current position to the given position.', tags: ['project', 'game', 'position'], addedBy: 'system' },
    { id: 48, command: '@frame [type("floor")] [position(x, y, z)] [width(n)] [height(n)] [color("name")] [set-true]', description: 'Declares a structural frame/platform (floor, wall, platform). [set-true] marks it solid.', tags: ['project', 'game', 'structure'], addedBy: 'system' },
    { id: 49, command: '@add [structure] [id=("name")]', description: 'Adds a structure entity with the given id, to be configured later via @frame.', tags: ['project', 'game', 'structure'], addedBy: 'system' },
    { id: 50, command: '@transportation [type("walk")] (WASD)', description: 'Defines a movement control scheme for the player (WASD or arrow keys).', tags: ['project', 'game', 'controls'], addedBy: 'system' },
    { id: 51, command: '@recharge [set] <weapon> (mouse right click)', description: 'Binds a weapon reload action to the right mouse button.', tags: ['project', 'game', 'weapon'], addedBy: 'system' },
    { id: 52, command: '@shoot [set] <weapon> (mouse left click)', description: 'Binds a weapon shoot action to the left mouse button.', tags: ['project', 'game', 'weapon'], addedBy: 'system' },
    { id: 53, command: '@view [set] (bird\'s eye view) / @view [set] (first person view)', description: 'Sets the camera view mode: top-down bird\'s eye, or a first-person camera that follows the player.', tags: ['project', 'game', 'camera'], addedBy: 'system' },
    { id: 54, command: '@color [fill] (id=("entity")) (BodyPart) [color("name")]', description: 'Sets the color of a body part (Head, Body, Legs, Boots, Arms, or Full) on an entity.', tags: ['project', 'game', 'customize'], addedBy: 'system' },
    { id: 55, command: '@emote [set] (id=("entity")) ("wave") [duration(2)]', description: 'Plays a named emote animation (wave, breakdancing, twerk, squat) for a duration in seconds.', tags: ['project', 'game', 'customize'], addedBy: 'system' },
    { id: 56, command: '@open [web] [settrue]', description: 'Project-level permission flag allowing the project to open external web content.', tags: ['project', 'game', 'web'], addedBy: 'system' },
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
  const isOwner = isOwnerOrAdmin(currentUser);
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

// ===== CANVAS TAB =====
function getCanvasKey() {
  return 'ic_canvas_' + (currentUser || 'guest');
}
let drawings = [];
let canvasCurrentId = null;
let canvasTool = 'pen';
let canvasColor = '#000000';
let canvasWidth = 3;
let canvasDrawing = false;
let canvasCurrentStroke = null;
let canvasShowAxis = false;
const canvasBoard = document.getElementById('canvasBoard');
const canvasCtx = canvasBoard.getContext('2d');

function getDrawings() {
  try { return JSON.parse(localStorage.getItem(getCanvasKey())) || []; } catch(e) { return []; }
}
function saveDrawings(list) {
  localStorage.setItem(getCanvasKey(), JSON.stringify(list));
  drawings = list;
}
function currentDrawing() {
  return drawings.find(d => d.id === canvasCurrentId) || null;
}
function setCanvasStatus(msg) {
  const el = document.getElementById('canvasStatus');
  if (el) el.textContent = msg;
}

function renderCanvasList() {
  const list = document.getElementById('canvasList');
  if (!list) return;
  if (!drawings.length) {
    list.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:12px;">No drawings yet. Click + to create one.</div>';
    return;
  }
  list.innerHTML = drawings.map(function(d) {
    return '<div class="canvas-item ' + (d.id === canvasCurrentId ? 'canvas-item-active' : '') + '" data-id="' + d.id + '">' +
      '<div style="min-width:0;flex:1;">' +
      '<div class="canvas-item-name">' + escapeIRE(d.name || 'Untitled') + '</div>' +
      '<div class="canvas-item-date">' + new Date(d.updatedAt).toLocaleDateString() + '</div>' +
      '</div>' +
      '<button class="canvas-item-del-btn" data-del="' + d.id + '" title="Delete drawing">&#10005;</button>' +
      '</div>';
  }).join('');
  list.querySelectorAll('.canvas-item').forEach(function(el) {
    el.addEventListener('click', function(ev) {
      if (ev.target.closest('.canvas-item-del-btn')) return;
      openDrawing(this.dataset.id);
    });
  });
  list.querySelectorAll('.canvas-item-del-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { deleteDrawing(this.dataset.del); });
  });
}

function resizeCanvasBoard() {
  const dpr = window.devicePixelRatio || 1;
  canvasBoard.width = 820 * dpr;
  canvasBoard.height = 1060 * dpr;
  canvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  canvasCtx.lineCap = 'round';
  canvasCtx.lineJoin = 'round';
}

function drawAxis() {
  if (!canvasShowAxis) return;
  const w = 820, h = 1060;
  const cx = w / 2, cy = h / 2;
  canvasCtx.save();
  canvasCtx.globalCompositeOperation = 'source-over';
  canvasCtx.strokeStyle = '#888888';
  canvasCtx.fillStyle = '#888888';
  canvasCtx.lineWidth = 1;
  canvasCtx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  canvasCtx.textAlign = 'center';
  canvasCtx.textBaseline = 'middle';

  // Y axis (vertical through center)
  canvasCtx.beginPath();
  canvasCtx.moveTo(cx, 16);
  canvasCtx.lineTo(cx, h - 16);
  canvasCtx.stroke();
  // X axis (horizontal through center)
  canvasCtx.beginPath();
  canvasCtx.moveTo(16, cy);
  canvasCtx.lineTo(w - 16, cy);
  canvasCtx.stroke();

  // Arrowheads
  canvasCtx.beginPath();
  canvasCtx.moveTo(cx, 16);
  canvasCtx.lineTo(cx - 5, 28);
  canvasCtx.lineTo(cx + 5, 28);
  canvasCtx.closePath();
  canvasCtx.fill();
  canvasCtx.beginPath();
  canvasCtx.moveTo(w - 16, cy);
  canvasCtx.lineTo(w - 28, cy - 5);
  canvasCtx.lineTo(w - 28, cy + 5);
  canvasCtx.closePath();
  canvasCtx.fill();

  // Labels
  canvasCtx.fillText('Y', cx, 10);
  canvasCtx.fillText('X', w - 8, cy);

  // Tick marks every 100px
  for (let i = 100; i < w; i += 100) {
    if (Math.abs(i - cx) < 30) continue;
    canvasCtx.beginPath();
    canvasCtx.moveTo(i, cy - 5);
    canvasCtx.lineTo(i, cy + 5);
    canvasCtx.stroke();
    canvasCtx.fillText(String(i - cx), i, cy + 16);
  }
  for (let j = 100; j < h; j += 100) {
    if (Math.abs(j - cy) < 30) continue;
    canvasCtx.beginPath();
    canvasCtx.moveTo(cx - 5, j);
    canvasCtx.lineTo(cx + 5, j);
    canvasCtx.stroke();
    canvasCtx.fillText(String(cx - j), cx + 14, j);
  }
  canvasCtx.fillText('0', cx + 14, cy + 16);
  canvasCtx.restore();
}

function redrawCanvas() {
  resizeCanvasBoard();
  canvasCtx.fillStyle = '#ffffff';
  canvasCtx.fillRect(0, 0, 820, 1060);
  const drawing = currentDrawing();
  if (drawing) {
    const bgImg = canvasBgImage(drawing);
    if (bgImg && drawing.bg) {
      canvasCtx.drawImage(bgImg, drawing.bg.x, drawing.bg.y, drawing.bg.w, drawing.bg.h);
    }
    (drawing.elements || []).forEach(function(el) {
      if (el.type !== 'stroke') return;
      canvasCtx.globalCompositeOperation = el.eraser ? 'destination-out' : 'source-over';
      canvasCtx.strokeStyle = el.color;
      canvasCtx.lineWidth = el.width;
      canvasCtx.beginPath();
      el.points.forEach(function(p, i) {
        if (i === 0) canvasCtx.moveTo(p[0], p[1]);
        else canvasCtx.lineTo(p[0], p[1]);
      });
      canvasCtx.stroke();
    });
    canvasCtx.globalCompositeOperation = 'source-over';
  }
  drawAxis();
}

function canvasPos(e) {
  const rect = canvasBoard.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / (rect.width / 820),
    y: (e.clientY - rect.top) / (rect.height / 1060)
  };
}

canvasBoard.addEventListener('pointerdown', function(e) {
  if (!currentDrawing()) return;
  e.preventDefault();
  canvasBoard.setPointerCapture(e.pointerId);
  canvasDrawing = true;
  const p = canvasPos(e);
  canvasCurrentStroke = { type: 'stroke', eraser: canvasTool === 'eraser', color: canvasColor, width: canvasWidth, points: [[p.x, p.y]] };
  currentDrawing().elements.push(canvasCurrentStroke);
  canvasCtx.globalCompositeOperation = canvasCurrentStroke.eraser ? 'destination-out' : 'source-over';
  canvasCtx.strokeStyle = canvasCurrentStroke.color;
  canvasCtx.lineWidth = canvasCurrentStroke.width;
  canvasCtx.beginPath();
  canvasCtx.moveTo(p.x, p.y);
  canvasCtx.lineTo(p.x + 0.1, p.y + 0.1);
  canvasCtx.stroke();
});

canvasBoard.addEventListener('pointermove', function(e) {
  if (!canvasDrawing) return;
  const p = canvasPos(e);
  const pts = canvasCurrentStroke.points;
  const last = pts[pts.length - 1];
  if (Math.hypot(p.x - last[0], p.y - last[1]) < 1) return;
  pts.push([p.x, p.y]);
  canvasCtx.lineTo(p.x, p.y);
  canvasCtx.stroke();
});

function canvasEndStroke() {
  if (!canvasDrawing) return;
  canvasDrawing = false;
  canvasCtx.globalCompositeOperation = 'source-over';
  saveDrawings(drawings);
  setCanvasStatus('Saved');
}
canvasBoard.addEventListener('pointerup', canvasEndStroke);
canvasBoard.addEventListener('pointercancel', canvasEndStroke);

function openDrawing(id) {
  canvasCurrentId = id;
  const drawing = currentDrawing();
  document.getElementById('canvasTitle').value = drawing ? drawing.name : '';
  canvasShowAxis = drawing ? !!drawing.axis : false;
  updateCanvasAxisBtn();
  updateCanvasBgBtn();
  renderCanvasList();
  redrawCanvas();
  setCanvasStatus('');
}

function updateCanvasAxisBtn() {
  const btn = document.getElementById('canvasAxisBtn');
  if (btn) btn.classList.toggle('active', canvasShowAxis);
}

function toggleCanvasAxis() {
  canvasShowAxis = !canvasShowAxis;
  const drawing = currentDrawing();
  if (drawing) {
    drawing.axis = canvasShowAxis;
    drawing.updatedAt = Date.now();
    saveDrawings(drawings);
  }
  updateCanvasAxisBtn();
  redrawCanvas();
  setCanvasStatus(canvasShowAxis ? 'X/Y axis on' : 'X/Y axis off');
}

function newDrawing() {
  const drawing = { id: 'd' + Date.now() + Math.random().toString(36).slice(2, 6), name: 'Untitled Drawing', updatedAt: Date.now(), elements: [] };
  drawings.unshift(drawing);
  canvasCurrentId = drawing.id;
  saveDrawings(drawings);
  openDrawing(drawing.id);
  setCanvasStatus('New drawing created');
}

function deleteDrawing(id) {
  if (!confirm('Delete this drawing?')) return;
  drawings = drawings.filter(function(d) { return d.id !== id; });
  delete canvasImageCache[id];
  if (canvasCurrentId === id) canvasCurrentId = drawings.length ? drawings[0].id : null;
  saveDrawings(drawings);
  renderCanvasList();
  if (canvasCurrentId) openDrawing(canvasCurrentId);
  else {
    document.getElementById('canvasTitle').value = '';
    redrawCanvas();
    updateCanvasBgBtn();
  }
}

function canvasSave() {
  const drawing = currentDrawing();
  if (!drawing) return;
  const t = document.getElementById('canvasTitle');
  if (t.value.trim()) drawing.name = t.value.trim();
  drawing.updatedAt = Date.now();
  saveDrawings(drawings);
  renderCanvasList();
  setCanvasStatus('Saved ' + new Date().toLocaleTimeString());
}

function canvasClear() {
  const drawing = currentDrawing();
  if (!drawing) return;
  if (!confirm('Clear this canvas? This cannot be undone.')) return;
  drawing.elements = [];
  saveDrawings(drawings);
  redrawCanvas();
  setCanvasStatus('Canvas cleared');
}

function renderCanvas() {
  drawings = getDrawings();
  if (!drawings.length) {
    const drawing = { id: 'd' + Date.now() + Math.random().toString(36).slice(2, 6), name: 'Untitled Drawing', updatedAt: Date.now(), elements: [] };
    drawings.push(drawing);
    saveDrawings(drawings);
  }
  if (!canvasCurrentId || !currentDrawing()) canvasCurrentId = drawings[0].id;
  canvasBoard.style.cursor = 'crosshair';
  openDrawing(canvasCurrentId);
}

// ===== CANVAS IMAGE IMPORT (draw on an image) =====
const canvasImageCache = {};
const canvasBgBtn = document.getElementById('canvasRemoveBgBtn');

function canvasBgImage(drawing) {
  if (!drawing || !drawing.bg || !drawing.bg.data) return null;
  const cached = canvasImageCache[drawing.id];
  if (cached && cached.complete && cached.naturalWidth) return cached;
  const img = new Image();
  img.onload = function() { redrawCanvas(); };
  img.src = drawing.bg.data;
  canvasImageCache[drawing.id] = img;
  return null;
}

function updateCanvasBgBtn() {
  if (!canvasBgBtn) return;
  const drawing = currentDrawing();
  canvasBgBtn.style.display = drawing && drawing.bg && drawing.bg.data ? '' : 'none';
}

function importCanvasImage(file) {
  const drawing = currentDrawing();
  if (!drawing) { setCanvasStatus('Open a drawing first'); return; }
  if (!file || !file.type || file.type.indexOf('image/') !== 0) {
    setCanvasStatus('Please choose an image file (PNG, JPG, GIF, etc.)');
    return;
  }
  const reader = new FileReader();
  reader.onload = function(ev) {
    const img = new Image();
    img.onload = function() {
      const scale = Math.min(820 / img.naturalWidth, 1060 / img.naturalHeight, 1);
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const x = Math.round((820 - w) / 2);
      const y = Math.round((1060 - h) / 2);
      const out = document.createElement('canvas');
      out.width = w;
      out.height = h;
      const octx = out.getContext('2d');
      octx.drawImage(img, 0, 0, w, h);
      drawing.bg = { data: out.toDataURL('image/png'), x: x, y: y, w: w, h: h };
      drawing.updatedAt = Date.now();
      delete canvasImageCache[drawing.id];
      saveDrawings(drawings);
      updateCanvasBgBtn();
      redrawCanvas();
      setCanvasStatus('Image imported — draw on it!');
    };
    img.onerror = function() { setCanvasStatus('Could not load that image'); };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function removeCanvasBg() {
  const drawing = currentDrawing();
  if (!drawing || !drawing.bg) return;
  delete drawing.bg;
  delete canvasImageCache[drawing.id];
  drawing.updatedAt = Date.now();
  saveDrawings(drawings);
  updateCanvasBgBtn();
  redrawCanvas();
  setCanvasStatus('Background removed');
}

document.getElementById('canvasImportBtn').addEventListener('click', function() {
  document.getElementById('canvasFileInput').click();
});
document.getElementById('canvasFileInput').addEventListener('change', function() {
  if (this.files && this.files[0]) importCanvasImage(this.files[0]);
  this.value = '';
});
if (canvasBgBtn) canvasBgBtn.addEventListener('click', removeCanvasBg);

document.querySelectorAll('.canvas-tool').forEach(function(btn) {
  btn.addEventListener('click', function() {
    canvasTool = this.dataset.tool;
    document.querySelectorAll('.canvas-tool').forEach(function(b) { b.classList.toggle('active', b === this); });
  });
});
document.getElementById('canvasColor').addEventListener('input', function() { canvasColor = this.value; });
document.getElementById('canvasWidth').addEventListener('input', function() { canvasWidth = parseInt(this.value, 10) || 3; });
document.getElementById('canvasAxisBtn').addEventListener('click', toggleCanvasAxis);
document.getElementById('canvasSaveBtn').addEventListener('click', canvasSave);
document.getElementById('canvasClearBtn').addEventListener('click', canvasClear);
document.getElementById('canvasNewBtn').addEventListener('click', newDrawing);
document.getElementById('canvasTitle').addEventListener('change', function() {
  const drawing = currentDrawing();
  if (drawing) {
    drawing.name = this.value.trim() || 'Untitled Drawing';
    drawing.updatedAt = Date.now();
    saveDrawings(drawings);
    renderCanvasList();
  }
});

// ===== MATH PRACTICE (spaced repetition) =====
const MP_TOPICS = ['arithmetic', 'algebra', 'trigonometry', 'calculus', 'number_theory'];
const MP_TOPIC_NAMES = {
  arithmetic: 'Arithmetic',
  algebra: 'Algebra',
  trigonometry: 'Trigonometry',
  calculus: 'Calculus',
  number_theory: 'Number Theory'
};
const MP_BANK = {
  arithmetic: [
    { q: '12 × 8', a: '96', accept: ['96'], hint: 'Split 12 into 10 + 2.', explanation: 'Step 1: Break 12 into 10 and 2.\nStep 2: 10 × 8 = 80.\nStep 3: 2 × 8 = 16.\nStep 4: Add 80 + 16 = 96.' },
    { q: '3 + 4 × 2 (order of operations)', a: '11', accept: ['11'], hint: 'Order of operations: multiply before you add.', explanation: 'Step 1: Do the multiplication first: 4 × 2 = 8.\nStep 2: Now add: 3 + 8 = 11.' },
    { q: '144 ÷ 12', a: '12', accept: ['12'], hint: 'Think: what times 12 gives 144?', explanation: 'Step 1: 12 × 10 = 120, leaving 24.\nStep 2: 12 × 2 = 24.\nStep 3: So 144 ÷ 12 = 10 + 2 = 12.' },
    { q: '7² + 5', a: '54', accept: ['54'], hint: 'Work out 7² first.', explanation: 'Step 1: 7² = 7 × 7 = 49.\nStep 2: Add 5: 49 + 5 = 54.' },
    { q: '(8 − 3) × (6 + 2)', a: '40', accept: ['40'], hint: 'Do the brackets first.', explanation: 'Step 1: Inside the first bracket: 8 − 3 = 5.\nStep 2: Inside the second: 6 + 2 = 8.\nStep 3: Multiply: 5 × 8 = 40.' },
    { q: '17 + 19', a: '36', accept: ['36'], hint: 'Round 19 up to 20, then adjust.', explanation: 'Step 1: Round 19 up to 20: 17 + 20 = 37.\nStep 2: Subtract the extra 1: 37 − 1 = 36.' },
    { q: '2⁵', a: '32', accept: ['32'], hint: '2 × 2 × 2 × 2 × 2.', explanation: 'Step 1: 2⁵ means five 2s multiplied together: 2 × 2 = 4.\nStep 2: 4 × 2 = 8.\nStep 3: 8 × 2 = 16.\nStep 4: 16 × 2 = 32.' },
    { q: '1/4 + 1/2', a: '0.75', accept: ['0.75', '3/4', '0.75'], hint: 'Give both fractions the same denominator (quarters).', explanation: 'Step 1: Rewrite 1/2 as quarters: 1/2 = 2/4.\nStep 2: Add: 1/4 + 2/4 = 3/4.\nStep 3: As a decimal, 3/4 = 0.75.' },
    { q: '15% of 200', a: '30', accept: ['30'], hint: 'Find 10% first, then 5%.', explanation: 'Step 1: 10% of 200 = 20.\nStep 2: 5% of 200 = 10 (half of 10%).\nStep 3: 15% = 20 + 10 = 30.' },
    { q: '9² − 4 × 5', a: '61', accept: ['61'], hint: 'Exponents and multiplication come before subtraction.', explanation: 'Step 1: 9² = 81.\nStep 2: 4 × 5 = 20.\nStep 3: Subtract: 81 − 20 = 61.' },
    { q: '100 − 25 × 3', a: '25', accept: ['25'], hint: 'Multiply before subtracting.', explanation: 'Step 1: 25 × 3 = 75.\nStep 2: 100 − 75 = 25.' },
    { q: '6 × 7 + 8', a: '50', accept: ['50'], hint: 'Multiply first, then add.', explanation: 'Step 1: 6 × 7 = 42.\nStep 2: 42 + 8 = 50.' }
  ],
  algebra: [
    { q: 'Solve for x: 2x + 6 = 14', a: 'x = 4', accept: ['4'], hint: 'Get the x term alone by subtracting 6.', explanation: 'Step 1: Subtract 6 from both sides: 2x = 8.\nStep 2: Divide both sides by 2: x = 4.' },
    { q: 'Solve for x: 3(x − 2) = 15', a: 'x = 7', accept: ['7'], hint: 'Divide both sides by 3 first.', explanation: 'Step 1: Divide both sides by 3: x − 2 = 5.\nStep 2: Add 2: x = 7.' },
    { q: 'Solve for x: 5x − 3 = 2x + 12', a: 'x = 5', accept: ['5'], hint: 'Move the x terms to one side.', explanation: 'Step 1: Subtract 2x from both sides: 3x − 3 = 12.\nStep 2: Add 3: 3x = 15.\nStep 3: Divide by 3: x = 5.' },
    { q: 'Solve for x: x² = 81', a: 'x = 9 (or −9)', accept: ['9', '-9', '9, -9', '±9'], hint: 'Take the square root — remember there are two answers.', explanation: 'Step 1: Square root both sides: x = ±√81.\nStep 2: √81 = 9, so x = 9 or x = −9.' },
    { q: 'Factor: x² − 9', a: '(x − 3)(x + 3)', accept: [], hint: 'Difference of two squares.', explanation: 'Step 1: Recognize the a² − b² form with a = x and b = 3.\nStep 2: Use a² − b² = (a − b)(a + b).\nStep 3: So x² − 9 = (x − 3)(x + 3).' },
    { q: 'Solve for x: x/4 = 3', a: 'x = 12', accept: ['12'], hint: 'Multiply both sides by 4.', explanation: 'Step 1: Multiply both sides by 4: x = 12.' },
    { q: 'What is the slope of y = 3x + 2?', a: '3', accept: ['3'], hint: 'Slope-intercept form: y = mx + b.', explanation: 'Step 1: Slope-intercept form is y = mx + b, where m is the slope.\nStep 2: y = 3x + 2 → m = 3.' },
    { q: 'Simplify: (x²)(x³)', a: 'x⁵', accept: ['x5', 'x^5'], hint: 'Add the exponents when multiplying same bases.', explanation: 'Step 1: When multiplying powers of the same base, add the exponents.\nStep 2: x² · x³ = x^(2+3) = x⁵.' },
    { q: 'Solve for x: 2x = 10', a: 'x = 5', accept: ['5'], hint: 'Divide both sides by 2.', explanation: 'Step 1: Divide both sides by 2: x = 5.' },
    { q: 'If y = 2x + 1 and x = 3, what is y?', a: '7', accept: ['7'], hint: 'Substitute 3 in place of x.', explanation: 'Step 1: Substitute x = 3: y = 2(3) + 1.\nStep 2: y = 6 + 1 = 7.' }
  ],
  trigonometry: [
    { q: 'sin(30°)', a: '0.5', accept: ['0.5', '1/2'], hint: '30° is a key unit-circle angle.', explanation: 'Step 1: On the unit circle, sine is the y-coordinate.\nStep 2: At 30°, y = 1/2.\nStep 3: So sin(30°) = 1/2 = 0.5.' },
    { q: 'cos(60°)', a: '0.5', accept: ['0.5', '1/2'], hint: 'cos(60°) equals sin(30°) — the co-function identity.', explanation: 'Step 1: On the unit circle, cosine is the x-coordinate.\nStep 2: At 60°, x = 1/2.\nStep 3: So cos(60°) = 0.5.' },
    { q: 'tan(45°)', a: '1', accept: ['1'], hint: 'tan = sin ÷ cos, and at 45° they are equal.', explanation: 'Step 1: tan(θ) = sin(θ) ÷ cos(θ).\nStep 2: At 45°, sin(45°) = cos(45°) = √2/2.\nStep 3: (√2/2) ÷ (√2/2) = 1.' },
    { q: 'sin(90°)', a: '1', accept: ['1'], hint: 'The top of the unit circle.', explanation: 'Step 1: At 90° the point on the unit circle is (0, 1).\nStep 2: Sine is the y-coordinate, so sin(90°) = 1.' },
    { q: 'cos(0°)', a: '1', accept: ['1'], hint: 'Start of the unit circle, at (1, 0).', explanation: 'Step 1: At 0° the point on the unit circle is (1, 0).\nStep 2: Cosine is the x-coordinate, so cos(0°) = 1.' },
    { q: 'sin²(θ) + cos²(θ)', a: '1', accept: ['1'], hint: 'This is the Pythagorean identity.', explanation: 'Step 1: This is the Pythagorean identity: sin²θ + cos²θ = 1.\nStep 2: It holds for every angle θ, so the answer is 1.' },
    { q: 'cos(180°)', a: '−1', accept: ['-1'], hint: 'Halfway around the circle, at (−1, 0).', explanation: 'Step 1: At 180° the point is (−1, 0).\nStep 2: Cosine is the x-coordinate, so cos(180°) = −1.' },
    { q: 'sin(0°)', a: '0', accept: ['0'], hint: 'Sine is 0 wherever the point is on the x-axis.', explanation: 'Step 1: At 0° the point is (1, 0).\nStep 2: Sine is the y-coordinate, so sin(0°) = 0.' },
    { q: 'tan(0°)', a: '0', accept: ['0'], hint: 'tan = sin ÷ cos, and sin(0°) = 0.', explanation: 'Step 1: tan(0°) = sin(0°) ÷ cos(0°).\nStep 2: sin(0°) = 0 and cos(0°) = 1.\nStep 3: 0 ÷ 1 = 0.' },
    { q: 'Which is larger: sin(30°) or sin(60°)?', a: 'sin(60°)', accept: ['sin(60)', 'sin60'], hint: 'Sine increases from 0° to 90°.', explanation: 'Step 1: sin(30°) = 0.5 and sin(60°) ≈ 0.866.\nStep 2: Since 0.866 > 0.5, sin(60°) is larger.' }
  ],
  calculus: [
    { q: 'd/dx (x²)', a: '2x', accept: ['2x', '2*x'], hint: 'Use the power rule.', explanation: 'Step 1: Power rule: d/dx(xⁿ) = n·xⁿ⁻¹.\nStep 2: With n = 2: 2·x¹ = 2x.' },
    { q: 'd/dx (x³)', a: '3x²', accept: ['3x2', '3x^2'], hint: 'Power rule: bring the 3 down.', explanation: 'Step 1: Power rule: d/dx(xⁿ) = n·xⁿ⁻¹.\nStep 2: With n = 3: 3·x² = 3x².' },
    { q: 'd/dx (sin x)', a: 'cos x', accept: ['cos x', 'cosx'], hint: 'A standard derivative to memorize.', explanation: 'Step 1: d/dx(sin x) = cos x. This is a standard rule.' },
    { q: 'd/dx (eˣ)', a: 'eˣ', accept: ['e^x', 'ex'], hint: 'eˣ is its own derivative.', explanation: 'Step 1: d/dx(eˣ) = eˣ. The exponential function is its own derivative.' },
    { q: '∫ 2x dx', a: 'x² + C', accept: ['x2', 'x^2', 'x^2 + C'], hint: 'Reverse the power rule.', explanation: 'Step 1: ∫xⁿ dx = xⁿ⁺¹/(n+1) + C.\nStep 2: ∫2x dx = 2·(x²/2) + C = x² + C.\nStep 3: Always add the constant of integration C.' },
    { q: 'd/dx (x⁵)', a: '5x⁴', accept: ['5x4', '5x^4'], hint: 'Power rule: multiply by 5, then reduce the exponent.', explanation: 'Step 1: Power rule: d/dx(xⁿ) = n·xⁿ⁻¹.\nStep 2: With n = 5: 5·x⁴ = 5x⁴.' },
    { q: '∫ x dx', a: 'x²/2 + C', accept: ['x2/2', 'x^2/2'], hint: 'Add 1 to the exponent, then divide.', explanation: 'Step 1: ∫x dx = x^(1+1)/(1+1) + C.\nStep 2: = x²/2 + C.' },
    { q: 'd/dx (cos x)', a: '−sin x', accept: ['-sin x', '-sinx'], hint: 'A standard derivative — mind the sign.', explanation: 'Step 1: d/dx(cos x) = −sin x. Note the minus sign.' },
    { q: '∫ 1 dx', a: 'x + C', accept: ['x', 'x + C'], hint: 'The integral of a constant is that constant times x.', explanation: 'Step 1: ∫1 dx = x + C, since d/dx(x) = 1.' },
    { q: 'd/dx (ln x)', a: '1/x', accept: ['1/x', '1/x'], hint: 'The derivative of the natural log.', explanation: 'Step 1: d/dx(ln x) = 1/x. This is a standard rule.' }
  ],
  number_theory: [
    { q: 'Is 17 prime? (yes/no)', a: 'yes', accept: ['yes', 'y'], hint: 'Check divisibility by primes up to √17 ≈ 4.', explanation: 'Step 1: A prime has exactly two divisors: 1 and itself.\nStep 2: Check 2 (no) and 3 (no). √17 ≈ 4.1, so we can stop.\nStep 3: 17 is prime → yes.' },
    { q: 'Is 21 prime? (yes/no)', a: 'no', accept: ['no', 'n'], hint: 'Try dividing by 3.', explanation: 'Step 1: 21 = 3 × 7.\nStep 2: Since it has divisors other than 1 and itself, 21 is composite → no.' },
    { q: 'gcd(24, 36)', a: '12', accept: ['12'], hint: 'Use the Euclidean algorithm: 36 − 24 = 12.', explanation: 'Step 1: 36 ÷ 24 = 1 remainder 12.\nStep 2: 24 ÷ 12 = 2 remainder 0.\nStep 3: The last non-zero remainder is 12, so gcd(24, 36) = 12.' },
    { q: 'lcm(4, 6)', a: '12', accept: ['12'], hint: 'The first multiple of 6 that 4 also divides.', explanation: 'Step 1: Multiples of 6: 6, 12, 18...\nStep 2: 12 is divisible by 4, so lcm(4, 6) = 12.\nStep 3: Alternative: lcm = a×b ÷ gcd = 24 ÷ 2 = 12.' },
    { q: '13 mod 5', a: '3', accept: ['3'], hint: '13 divided by 5 leaves what remainder?', explanation: 'Step 1: 5 × 2 = 10, and 13 − 10 = 3.\nStep 2: The remainder is 3, so 13 mod 5 = 3.' },
    { q: '100 mod 7', a: '2', accept: ['2'], hint: '7 × 14 = 98.', explanation: 'Step 1: 7 × 14 = 98 is the largest multiple of 7 ≤ 100.\nStep 2: 100 − 98 = 2, so 100 mod 7 = 2.' },
    { q: 'Is 1 prime? (yes/no)', a: 'no', accept: ['no', 'n'], hint: 'Primes have exactly two factors; 1 has only one.', explanation: 'Step 1: By definition, a prime has exactly two distinct positive divisors.\nStep 2: 1 has only one divisor (1 itself).\nStep 3: So 1 is not prime → no.' },
    { q: 'How many divisors does 12 have?', a: '6', accept: ['6'], hint: 'List the factor pairs.', explanation: 'Step 1: Factor pairs of 12: (1, 12), (2, 6), (3, 4).\nStep 2: That gives divisors 1, 2, 3, 4, 6, 12.\nStep 3: Count: 6 divisors.' },
    { q: 'gcd(48, 18)', a: '6', accept: ['6'], hint: 'Euclidean algorithm: keep subtracting/remaindering.', explanation: 'Step 1: 48 ÷ 18 = 2 remainder 12.\nStep 2: 18 ÷ 12 = 1 remainder 6.\nStep 3: 12 ÷ 6 = 2 remainder 0.\nStep 4: gcd(48, 18) = 6.' },
    { q: '2⁵ mod 7', a: '4', accept: ['4'], hint: 'Compute 2⁵ = 32, then find the remainder mod 7.', explanation: 'Step 1: 2⁵ = 32.\nStep 2: 7 × 4 = 28, and 32 − 28 = 4.\nStep 3: So 2⁵ mod 7 = 4.' }
  ]
};

const MP_CUSTOM_KEY = 'ic_math_practice_custom';

function getMPCustomProblems() {
  try { return JSON.parse(localStorage.getItem(MP_CUSTOM_KEY)) || []; } catch(e) { return []; }
}

function saveMPCustomProblems(list) {
  localStorage.setItem(MP_CUSTOM_KEY, JSON.stringify(list));
  if (currentUser) {
    list.forEach(function(p) {
      sb('math_practice_problems').upsert({ id: p.id, topic: p.topic, q: p.q, a: p.a, accept: p.accept || [], hint: p.hint || '', explanation: p.explanation || '', author: p.author }, 'id');
    });
  }
}

function mpSyncCustom() {
  if (!currentUser) return;
  sb('math_practice_problems').select({}).then(function(r) {
    if (r.ok && r.data && r.data.length) {
      var server = r.data.map(function(c) {
        return { id: c.id, topic: c.topic, q: c.q, a: c.a, accept: c.accept || [], hint: c.hint || '', explanation: c.explanation || '', author: c.author || 'owner' };
      });
      var local = getMPCustomProblems();
      var merged = server.concat(local.filter(function(l) { return !server.some(function(s) { return s.id === l.id; }); }));
      localStorage.setItem(MP_CUSTOM_KEY, JSON.stringify(merged));
    }
  });
}

const MP_REFERENCE = {
  arithmetic: {
    title: 'Arithmetic Reference Sheet',
    html: '<h4>Order of Operations</h4><ul>' +
      '<li>Parentheses (brackets) first</li>' +
      '<li>Exponents (powers, squares)</li>' +
      '<li>Multiplication &amp; Division — left to right</li>' +
      '<li>Addition &amp; Subtraction — left to right</li>' +
      '<li>Memory aid: PEMDAS</li></ul>' +
      '<h4>Common Conversions</h4><ul>' +
      '<li>1/2 = 0.5 = 50%</li>' +
      '<li>1/4 = 0.25 = 25% &middot; 3/4 = 0.75 = 75%</li>' +
      '<li>1/5 = 0.2 = 20% &middot; 1/10 = 0.1 = 10%</li>' +
      '<li>1/8 = 0.125 = 12.5%</li>' +
      '<li>To convert a fraction to a decimal: divide top by bottom</li>' +
      '<li>To get a percent: multiply the decimal by 100</li></ul>' +
      '<h4>Percent Tricks</h4><ul>' +
      '<li>p% of N = (p ÷ 100) × N</li>' +
      '<li>10% = move the decimal one place left</li></ul>'
  },
  algebra: {
    title: 'Algebra Reference Sheet',
    html: '<h4>Factoring Patterns</h4><ul>' +
      '<li>Difference of squares: a² − b² = (a − b)(a + b)</li>' +
      '<li>Perfect square: a² + 2ab + b² = (a + b)²</li>' +
      '<li>Perfect square: a² − 2ab + b² = (a − b)²</li>' +
      '<li>Always check for a common factor first</li></ul>' +
      '<h4>Quadratic Formula</h4><ul>' +
      '<li>For ax² + bx + c = 0:</li>' +
      '<li>x = (−b ± √(b² − 4ac)) / 2a</li></ul>' +
      '<h4>Exponent Rules</h4><ul>' +
      '<li>aᵐ · aⁿ = aᵐ⁺ⁿ (multiply → add exponents)</li>' +
      '<li>aᵐ ÷ aⁿ = aᵐ⁻ⁿ (divide → subtract exponents)</li>' +
      '<li>(aᵐ)ⁿ = aᵐⁿ</li>' +
      '<li>a⁰ = 1 &middot; a⁻ⁿ = 1/aⁿ</li></ul>' +
      '<h4>Slope-Intercept Form</h4><ul>' +
      '<li>y = mx + b, where m is the slope and b is the y-intercept</li></ul>'
  },
  trigonometry: {
    title: 'Trigonometry Reference Sheet',
    html: '<h4>Unit Circle Values</h4><table class="mp-ref-table"><tr><th>Angle</th><th>sin</th><th>cos</th><th>tan</th></tr>' +
      '<tr><td>0°</td><td>0</td><td>1</td><td>0</td></tr>' +
      '<tr><td>30°</td><td>1/2</td><td>√3/2</td><td>√3/3</td></tr>' +
      '<tr><td>45°</td><td>√2/2</td><td>√2/2</td><td>1</td></tr>' +
      '<tr><td>60°</td><td>√3/2</td><td>1/2</td><td>√3</td></tr>' +
      '<tr><td>90°</td><td>1</td><td>0</td><td>undef.</td></tr>' +
      '<tr><td>180°</td><td>0</td><td>−1</td><td>0</td></tr></table>' +
      '<h4>Basic Identities</h4><ul>' +
      '<li>tan θ = sin θ / cos θ</li>' +
      '<li>Pythagorean identity: sin²θ + cos²θ = 1</li>' +
      '<li>csc θ = 1/sin θ &middot; sec θ = 1/cos θ &middot; cot θ = 1/tan θ</li></ul>'
  },
  calculus: {
    title: 'Calculus Reference Sheet',
    html: '<h4>Basic Derivative Rules</h4><ul>' +
      '<li>Power rule: d/dx(xⁿ) = n·xⁿ⁻¹</li>' +
      '<li>Constant: d/dx(c) = 0</li>' +
      '<li>Constant multiple: d/dx(c·f) = c·d/dx(f)</li>' +
      '<li>Sum rule: d/dx(f + g) = f\' + g\'</li>' +
      '<li>d/dx(sin x) = cos x &middot; d/dx(cos x) = −sin x</li>' +
      '<li>d/dx(eˣ) = eˣ &middot; d/dx(ln x) = 1/x</li></ul>' +
      '<h4>Basic Integral Rules</h4><ul>' +
      '<li>∫xⁿ dx = xⁿ⁺¹/(n+1) + C (n ≠ −1)</li>' +
      '<li>∫1 dx = x + C</li>' +
      '<li>∫sin x dx = −cos x + C &middot; ∫cos x dx = sin x + C</li>' +
      '<li>∫eˣ dx = eˣ + C &middot; ∫1/x dx = ln|x| + C</li>' +
      '<li>Always add the constant of integration C</li></ul>'
  },
  number_theory: {
    title: 'Number Theory Reference Sheet',
    html: '<h4>Divisibility Rules</h4><ul>' +
      '<li>2: last digit is even</li>' +
      '<li>3: sum of digits is divisible by 3</li>' +
      '<li>4: last two digits form a multiple of 4</li>' +
      '<li>5: ends in 0 or 5</li>' +
      '<li>6: divisible by both 2 and 3</li>' +
      '<li>9: sum of digits is divisible by 9</li>' +
      '<li>10: ends in 0</li></ul>' +
      '<h4>Primes &amp; Factorization</h4><ul>' +
      '<li>A prime has exactly two divisors: 1 and itself</li>' +
      '<li>1 is not prime</li>' +
      '<li>Every number has a unique prime factorization (Fundamental Theorem of Arithmetic)</li>' +
      '<li>gcd: greatest common divisor &middot; lcm: least common multiple</li>' +
      '<li>lcm(a, b) = a × b ÷ gcd(a, b)</li></ul>' +
      '<h4>Modular Arithmetic</h4><ul>' +
      '<li>a mod n = the remainder when a is divided by n</li>' +
      '<li>a ≡ b (mod n) if a − b is divisible by n</li>' +
      '<li>You can reduce exponents using the modulus: e.g. 2⁵ mod 7 = (32) mod 7 = 4</li></ul>'
  }
};

let mpProgress = null;
let mpSession = [];
let mpSessionIdx = 0;
let mpCurrentProblem = null;
let mpView = 'quiz';

function getMPKey() {
  return 'ic_math_practice_' + (currentUser || 'guest');
}

function getMPProgress() {
  try { return JSON.parse(localStorage.getItem(getMPKey())) || { cards: {}, stats: { again: 0, hard: 0, good: 0, easy: 0, seen: 0 } }; } catch(e) { return { cards: {}, stats: { again: 0, hard: 0, good: 0, easy: 0, seen: 0 } }; }
}

function saveMPProgress() {
  localStorage.setItem(getMPKey(), JSON.stringify(mpProgress));
}

function mpProblemId(topic, idx) {
  return topic + ':' + idx;
}

function mpProblemsForTopic(topic) {
  var out = [];
  MP_BANK[topic].forEach(function(p, idx) {
    out.push({ topic: topic, idx: idx, q: p.q, a: p.a, accept: p.accept, hint: p.hint || '', explanation: p.explanation || '', builtin: true });
  });
  getMPCustomProblems().forEach(function(p) {
    if (p.topic === topic) out.push({ topic: topic, idx: p.id, q: p.q, a: p.a, accept: p.accept || [], hint: p.hint || '', explanation: p.explanation || '', builtin: false, id: p.id });
  });
  return out;
}

function mpAllProblems() {
  var out = [];
  MP_TOPICS.forEach(function(topic) {
    out = out.concat(mpProblemsForTopic(topic));
  });
  return out;
}

function mpDueProblems() {
  var now = Date.now();
  return mpAllProblems().filter(function(p) {
    var card = mpProgress.cards[mpProblemId(p.topic, p.idx)];
    if (!card) return true;
    return card.due <= now;
  });
}

function mpUpdateCard(problem, rating) {
  var key = mpProblemId(problem.topic, problem.idx);
  var card = mpProgress.cards[key] || { ease: 2.5, interval: 0, reps: 0, due: 0, last: null };
  var ease = card.ease;
  var interval = card.interval || 0;
  var reps = card.reps || 0;
  if (rating === 'again') {
    reps = 0;
    interval = 0; // due now: resurfaces again in this same session
    ease = Math.max(1.3, ease - 0.2);
  } else if (rating === 'hard') {
    reps += 1;
    if (reps === 1) interval = 1 * 24 * 60 * 60 * 1000;
    else interval = Math.max(interval * 1.2, 1 * 24 * 60 * 60 * 1000);
    ease = Math.max(1.3, ease - 0.15);
  } else if (rating === 'good') {
    reps += 1;
    if (reps === 1) interval = 1 * 24 * 60 * 60 * 1000;
    else if (reps === 2) interval = 6 * 24 * 60 * 60 * 1000;
    else interval = Math.round(interval * ease);
    // nothing: ease stays
  } else if (rating === 'easy') {
    reps += 1;
    if (reps === 1) interval = 4 * 24 * 60 * 60 * 1000;
    else if (reps === 2) interval = 2 * 7 * 24 * 60 * 60 * 1000;
    else interval = Math.round(interval * ease * 1.3);
    ease = Math.min(3.0, ease + 0.15);
  }
  card.ease = Math.round(ease * 100) / 100;
  card.interval = interval;
  card.reps = reps;
  card.due = Date.now() + interval;
  card.last = rating;
  mpProgress.cards[key] = card;
  if (!mpProgress.stats) mpProgress.stats = { again: 0, hard: 0, good: 0, easy: 0, seen: 0 };
  mpProgress.stats[rating] = (mpProgress.stats[rating] || 0) + 1;
  mpProgress.stats.seen = (mpProgress.stats.seen || 0) + 1;
  saveMPProgress();
}

function mpTopicStats(topic) {
  var probs = mpProblemsForTopic(topic);
  var mastered = 0, due = 0, newc = 0, total = probs.length;
  var easeSum = 0, easeCount = 0;
  probs.forEach(function(p, idx) {
    var card = mpProgress.cards[mpProblemId(topic, idx)];
    if (!card) { newc++; due++; return; }
    easeSum += card.ease; easeCount++;
    if (card.interval >= 7 * 24 * 60 * 60 * 1000) mastered++;
    if (card.due <= Date.now()) due++;
  });
  var masteredPct = total ? Math.round(mastered / total * 100) : 0;
  var avgEase = easeCount ? Math.round(easeSum / easeCount * 100) / 100 : 0;
  return { total: total, newc: newc, due: due, mastered: mastered, masteredPct: masteredPct, avgEase: avgEase };
}

function mpWeakestTopic() {
  var worst = null, worstScore = Infinity;
  MP_TOPICS.forEach(function(topic) {
    var s = mpTopicStats(topic);
    var score = s.masteredPct - s.due * 5; // low mastery + high due = weak
    if (score < worstScore) { worstScore = score; worst = topic; }
  });
  return worst;
}

function mpRenderStatsRow() {
  var row = document.getElementById('mpStatsRow');
  if (!row) return;
  var due = mpDueProblems().length;
  var all = mpAllProblems();
  var seen = mpProgress.stats ? mpProgress.stats.seen || 0 : 0;
  var mastered = 0;
  MP_TOPICS.forEach(function(t) { mastered += mpTopicStats(t).mastered; });
  var weak = mpWeakestTopic();
  row.innerHTML =
    '<div class="mp-stat"><div class="mp-stat-num">' + due + '</div><div class="mp-stat-label">Due now</div></div>' +
    '<div class="mp-stat"><div class="mp-stat-num">' + seen + '/' + all.length + '</div><div class="mp-stat-label">Seen</div></div>' +
    '<div class="mp-stat"><div class="mp-stat-num">' + mastered + '</div><div class="mp-stat-label">Mastered</div></div>' +
    '<div class="mp-stat"><div class="mp-stat-num">' + (weak ? MP_TOPIC_NAMES[weak] : '—') + '</div><div class="mp-stat-label">Weakest</div></div>';
}

function mpRenderDashboard() {
  document.getElementById('mpDashSummary').innerHTML =
    '<div class="mp-dash-banner">Your weakest topic is <b>' + (mpWeakestTopic() ? MP_TOPIC_NAMES[mpWeakestTopic()] : '—') + '</b>. Keep practicing daily to improve.</div>';
  var html = '';
  MP_TOPICS.forEach(function(topic) {
    var s = mpTopicStats(topic);
    html += '<div class="mp-topic-card">' +
      '<div class="mp-topic-head"><span class="mp-topic-name">' + MP_TOPIC_NAMES[topic] + '</span>' +
      '<span class="mp-topic-ease">ease ' + s.avgEase.toFixed(2) + '</span></div>' +
      '<div class="mp-topic-bar"><div class="mp-topic-bar-fill" style="width:' + s.masteredPct + '%"></div></div>' +
      '<div class="mp-topic-meta">' + s.mastered + '/' + s.total + ' mastered &middot; ' + s.due + ' due &middot; ' + s.newc + ' new</div>' +
      '</div>';
  });
  document.getElementById('mpDashTopics').innerHTML = html;
  if (isOwnerOrAdmin(currentUser)) {
    var customs = getMPCustomProblems();
    var listHtml = customs.length ? customs.map(function(p) {
      return '<div class="mp-custom-row">' +
        '<div class="mp-custom-info"><span class="mp-custom-topic">' + (MP_TOPIC_NAMES[p.topic] || p.topic) + '</span>' +
        '<span class="mp-custom-q">' + escapeIRE(p.q) + '</span></div>' +
        '<div class="mp-custom-actions">' +
        '<button class="mp-btn mp-custom-edit" data-id="' + p.id + '">Edit</button>' +
        '<button class="mp-btn mp-rate-again mp-custom-del" data-id="' + p.id + '">Delete</button>' +
        '</div></div>';
    }).join('') : '<div class="mp-dash-banner" style="color:var(--text-muted);">No custom problems yet. Use the + Add button in the header to create one.</div>';
    var wrap = document.createElement('div');
    wrap.className = 'mp-dash-custom';
    wrap.innerHTML = '<div class="mp-dash-custom-head">Custom Problems <span style="font-weight:400;color:var(--text-muted);font-size:11px;">(owners only)</span></div><div class="mp-dash-custom-list">' + listHtml + '</div>';
    document.getElementById('mpDashTopics').appendChild(wrap);
    wrap.querySelectorAll('.mp-custom-edit').forEach(function(btn) {
      btn.addEventListener('click', function() { mpShowProblemForm(this.dataset.id); });
    });
    wrap.querySelectorAll('.mp-custom-del').forEach(function(btn) {
      btn.addEventListener('click', function() { mpDeleteProblemForm(this.dataset.id); });
    });
  }
}

function mpRevealAnswer() {
  document.getElementById('mpRateRow').classList.remove('hidden');
  var input = document.getElementById('mpAnswerInput');
  if (input) input.disabled = true;
  var check = document.getElementById('mpCheckBtn');
  if (check) check.disabled = true;
  var show = document.getElementById('mpShowAnswerBtn');
  if (show) show.style.display = 'none';
  var hint = document.getElementById('mpHintBtn');
  if (hint) hint.style.display = 'none';
  var wrap = document.getElementById('mpExplainWrap');
  if (wrap) wrap.style.display = 'block';
}

function mpShowAnswer() {
  var answerEl = document.getElementById('mpAnswerReveal');
  if (answerEl) {
    answerEl.innerHTML = 'Answer: <b>' + escapeIRE(mpCurrentProblem.a) + '</b>';
    answerEl.style.display = 'block';
  }
  mpRevealAnswer();
}

function mpRate(rating) {
  mpUpdateCard(mpCurrentProblem, rating);
  setMpStatus('Rated "' + rating + '" &mdash; next due ' + mpNextDueLabel(mpCurrentProblem));
  mpNext();
}

function mpNextDueLabel(problem) {
  var card = mpProgress.cards[mpProblemId(problem.topic, problem.idx)];
  if (!card) return 'soon';
  var days = card.interval / (24 * 60 * 60 * 1000);
  if (days < 1) return 'minutes';
  if (days < 2) return '1 day';
  if (days < 30) return Math.round(days) + ' days';
  return Math.round(days / 30) + ' months';
}

function mpNext() {
  mpSessionIdx++;
  if (mpSessionIdx >= mpSession.length) {
    mpSession = mpDueProblems();
    mpSessionIdx = 0;
    if (!mpSession.length) {
      document.getElementById('mpQuizCard').innerHTML =
        '<div class="mp-placeholder">All caught up! No problems due right now. Check back later or review your dashboard.</div>';
      mpRenderStatsRow();
      return;
    }
  }
  mpShowProblem(mpSession[mpSessionIdx]);
}

function mpAnswerCheck() {
  var input = document.getElementById('mpAnswerInput');
  var val = (input.value || '').trim().toLowerCase();
  if (!val) return;
  var accepted = (mpCurrentProblem.accept || []).map(function(a) { return String(a).toLowerCase(); });
  var correct = accepted.indexOf(val) >= 0;
  var result = document.getElementById('mpCheckResult');
  if (correct) {
    result.innerHTML = '<span style="color:#50e3c2;font-weight:600;">Correct!</span>';
  } else {
    result.innerHTML = '<span style="color:#ff6b6b;font-weight:600;">Incorrect. </span><span style="color:var(--text-muted);">Answer: ' + escapeIRE(mpCurrentProblem.a) + '</span>';
  }
  mpRevealAnswer();
}

function mpShowProblem(problem) {
  mpCurrentProblem = problem;
  var card = document.getElementById('mpQuizCard');
  card.innerHTML =
    '<div class="mp-card-top">' +
      '<div class="mp-problem-topic" style="color:var(--accent);font-weight:600;font-size:11px;letter-spacing:1.5px;">' + MP_TOPIC_NAMES[problem.topic].toUpperCase() + '</div>' +
      '<button id="mpRefBtn" class="mp-btn mp-btn-ghost mp-btn-ref" title="Open reference sheet for this topic">&#128218; Reference</button>' +
    '</div>' +
    '<div class="mp-problem-q">' + escapeIRE(problem.q) + '</div>' +
    '<div class="mp-answer-area">' +
      '<input type="text" id="mpAnswerInput" class="mp-answer-input" placeholder="Type your answer..." autocomplete="off">' +
      '<button id="mpCheckBtn" class="mp-btn mp-btn-check">Check</button>' +
      '<button id="mpShowAnswerBtn" class="mp-btn mp-btn-ghost">Show Answer</button>' +
    '</div>' +
    (problem.hint ? '<div class="mp-hint-area"><button id="mpHintBtn" class="mp-btn mp-btn-hint">&#128161; Hint</button><div id="mpHintBox" class="mp-hint-box" style="display:none;"></div></div>' : '') +
    '<div id="mpCheckResult" class="mp-check-result"></div>' +
    '<div id="mpAnswerReveal" class="mp-answer-reveal" style="display:none;"></div>' +
    (problem.explanation ? '<div id="mpExplainWrap" class="mp-explain" style="display:none;"><button id="mpExplainToggle" class="mp-explain-toggle">&#128218; Step-by-step explanation</button><div id="mpExplainBody" class="mp-explain-body" style="display:none;">' + escapeIRE(problem.explanation).replace(/\n/g, '<br>') + '</div></div>' : '') +
    '<div id="mpRateRow" class="mp-rate-row hidden">' +
      '<span class="mp-rate-label">How well did you know it?</span>' +
      '<button class="mp-btn mp-rate mp-rate-again" data-rating="again">Again</button>' +
      '<button class="mp-btn mp-rate mp-rate-hard" data-rating="hard">Hard</button>' +
      '<button class="mp-btn mp-rate mp-rate-good" data-rating="good">Good</button>' +
      '<button class="mp-btn mp-rate mp-rate-easy" data-rating="easy">Easy</button>' +
    '</div>';
  document.getElementById('mpAnswerInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); mpAnswerCheck(); }
  });
  document.getElementById('mpCheckBtn').addEventListener('click', mpAnswerCheck);
  document.getElementById('mpShowAnswerBtn').addEventListener('click', mpShowAnswer);
  document.getElementById('mpRefBtn').addEventListener('click', mpOpenReference);
  var hintBtn = document.getElementById('mpHintBtn');
  if (hintBtn) {
    hintBtn.addEventListener('click', function() {
      var box = document.getElementById('mpHintBox');
      box.innerHTML = escapeIRE(problem.hint);
      box.style.display = box.style.display === 'none' ? 'block' : 'none';
    });
  }
  var explainToggle = document.getElementById('mpExplainToggle');
  if (explainToggle) {
    explainToggle.addEventListener('click', function() {
      var body = document.getElementById('mpExplainBody');
      body.style.display = body.style.display === 'none' ? 'block' : 'none';
    });
  }
  document.querySelectorAll('#mpRateRow .mp-rate').forEach(function(btn) {
    btn.addEventListener('click', function() { mpRate(this.dataset.rating); });
  });
  document.getElementById('mpAnswerInput').focus();
  mpRenderStatsRow();
}

function mpStartSession() {
  mpSession = mpDueProblems();
  mpSessionIdx = 0;
  if (!mpSession.length) {
    document.getElementById('mpQuizCard').innerHTML =
      '<div class="mp-placeholder">No problems due right now. Everything is scheduled! Check back later.</div>';
    mpRenderStatsRow();
    return;
  }
  mpShowProblem(mpSession[0]);
}

function mpOpenReference() {
  var topic = mpCurrentProblem ? mpCurrentProblem.topic : 'arithmetic';
  var ref = MP_REFERENCE[topic] || MP_REFERENCE.arithmetic;
  document.getElementById('mpRefTitle').innerHTML = '&#128218; ' + ref.title;
  document.getElementById('mpRefBody').innerHTML = ref.html;
  document.getElementById('mpRefModal').classList.remove('hidden');
}

function mpCloseReference() {
  var modal = document.getElementById('mpRefModal');
  if (modal) modal.classList.add('hidden');
}

let mpFormEditId = null;

function mpShowProblemForm(editId) {
  if (!isOwnerOrAdmin(currentUser)) return;
  mpFormEditId = editId || null;
  var p = null;
  if (editId) p = getMPCustomProblems().find(function(x) { return x.id === editId; });
  var topicOptions = MP_TOPICS.map(function(t) {
    return '<option value="' + t + '"' + ((p && p.topic === t) ? ' selected' : '') + '>' + MP_TOPIC_NAMES[t] + '</option>';
  }).join('');
  var html =
    '<div class="mp-form-head">' + (editId ? 'Edit Problem' : 'New Custom Problem') + '</div>' +
    '<label class="mp-form-label">Topic</label>' +
    '<select id="mpFormTopic" class="mp-form-input">' + topicOptions + '</select>' +
    '<label class="mp-form-label">Question</label>' +
    '<input id="mpFormQ" class="mp-form-input" type="text" value="' + (p ? String(p.q).replace(/"/g,'&quot;') : '') + '" placeholder="e.g. Solve for x: 2x + 6 = 14">' +
    '<label class="mp-form-label">Answer</label>' +
    '<input id="mpFormA" class="mp-form-input" type="text" value="' + (p ? String(p.a).replace(/"/g,'&quot;') : '') + '" placeholder="e.g. x = 4">' +
    '<label class="mp-form-label">Accepted answers (comma separated)</label>' +
    '<input id="mpFormAccept" class="mp-form-input" type="text" value="' + (p ? String((p.accept || []).join(', ')).replace(/"/g,'&quot;') : '') + '" placeholder="e.g. 4, x = 4">' +
    '<label class="mp-form-label">Hint (optional)</label>' +
    '<textarea id="mpFormHint" class="mp-form-input mp-form-textarea" placeholder="A single helpful nudge without giving away the solution...">' + (p ? String(p.hint || '').replace(/"/g,'&quot;') : '') + '</textarea>' +
    '<label class="mp-form-label">Explanation (optional, one step per line)</label>' +
    '<textarea id="mpFormExplanation" class="mp-form-input mp-form-textarea" placeholder="Step 1: ...\nStep 2: ...">' + (p ? String(p.explanation || '').replace(/"/g,'&quot;') : '') + '</textarea>' +
    '<div id="mpFormStatus" class="mp-form-status"></div>' +
    '<div class="mp-form-actions">' +
      '<button id="mpFormSave" class="mp-btn mp-btn-check">' + (editId ? 'Update' : 'Publish') + ' Problem</button>' +
      (editId ? '<button id="mpFormDel" class="mp-btn mp-rate-again">Delete</button>' : '') +
      '<button id="mpFormCancel" class="mp-btn">Cancel</button>' +
    '</div>';
  document.getElementById('mpFormCard').innerHTML = html;
  document.getElementById('mpQuizView').classList.add('hidden');
  document.getElementById('mpDashView').classList.add('hidden');
  document.getElementById('mpFormView').classList.remove('hidden');
  document.getElementById('mpFormSave').addEventListener('click', mpSaveProblemForm);
  document.getElementById('mpFormCancel').addEventListener('click', mpCancelProblemForm);
  var del = document.getElementById('mpFormDel');
  if (del) del.addEventListener('click', function() { mpDeleteProblemForm(editId); });
  document.getElementById('mpFormQ').focus();
}

function mpSaveProblemForm() {
  var topic = document.getElementById('mpFormTopic').value;
  var q = document.getElementById('mpFormQ').value.trim();
  var a = document.getElementById('mpFormA').value.trim();
  var acceptRaw = document.getElementById('mpFormAccept').value.trim();
  var hint = document.getElementById('mpFormHint').value.trim();
  var explanation = document.getElementById('mpFormExplanation').value.trim();
  var status = document.getElementById('mpFormStatus');
  if (!q) { status.textContent = 'Question is required.'; status.className = 'mp-form-status error'; return; }
  if (!a) { status.textContent = 'Answer is required.'; status.className = 'mp-form-status error'; return; }
  var accept = acceptRaw ? acceptRaw.split(',').map(function(s) { return s.trim(); }).filter(Boolean) : [];
  if (!accept.length) accept = [a];
  var list = getMPCustomProblems();
  if (mpFormEditId) {
    var idx = list.findIndex(function(p) { return p.id === mpFormEditId; });
    if (idx >= 0) {
      list[idx].topic = topic;
      list[idx].q = q;
      list[idx].a = a;
      list[idx].accept = accept;
      list[idx].hint = hint;
      list[idx].explanation = explanation;
      list[idx].author = currentUser;
      list[idx].updatedAt = Date.now();
    }
  } else {
    list.push({ id: 'c' + Date.now() + Math.random().toString(36).slice(2, 6), topic: topic, q: q, a: a, accept: accept, hint: hint, explanation: explanation, author: currentUser || 'owner', createdAt: new Date().toLocaleDateString() });
  }
  saveMPCustomProblems(list);
  var wasEdit = !!mpFormEditId;
  setMpStatus('Problem ' + (wasEdit ? 'updated' : 'published') + ' — it will appear in your next due set.');
  mpCancelProblemForm();
  if (mpView === 'dash') return;
  mpSession = mpDueProblems();
  mpSessionIdx = 0;
  if (mpSession.length) mpShowProblem(mpSession[0]);
  else {
    document.getElementById('mpQuizCard').innerHTML = '<div class="mp-placeholder">All caught up! No problems due right now.</div>';
    mpRenderStatsRow();
  }
}

function mpDeleteProblemForm(id) {
  if (!confirm('Delete this custom problem?')) return;
  var list = getMPCustomProblems();
  saveMPCustomProblems(list.filter(function(p) { return p.id !== id; }));
  if (currentUser) sb('math_practice_problems').delete({ id: id });
  setMpStatus('Problem deleted.');
  var fv = document.getElementById('mpFormView');
  if (fv) fv.classList.add('hidden');
  if (mpView === 'dash') {
    document.getElementById('mpQuizView').classList.add('hidden');
    document.getElementById('mpDashView').classList.remove('hidden');
    mpRenderStatsRow();
    mpRenderDashboard();
  } else {
    document.getElementById('mpQuizView').classList.remove('hidden');
    mpSession = mpDueProblems();
    mpSessionIdx = 0;
    if (mpSession.length) mpShowProblem(mpSession[0]);
    else {
      document.getElementById('mpQuizCard').innerHTML = '<div class="mp-placeholder">All caught up! No problems due right now.</div>';
      mpRenderStatsRow();
    }
  }
}

function mpCancelProblemForm() {
  var fv = document.getElementById('mpFormView');
  if (fv) fv.classList.add('hidden');
  if (mpView === 'dash') {
    document.getElementById('mpQuizView').classList.add('hidden');
    document.getElementById('mpDashView').classList.remove('hidden');
    mpRenderStatsRow();
    mpRenderDashboard();
  } else {
    document.getElementById('mpQuizView').classList.remove('hidden');
    document.querySelectorAll('.mp-btn-view').forEach(function(b) { b.classList.toggle('active', b.id === 'mpViewQuiz'); });
  }
}

function renderMathPractice() {
  mpProgress = getMPProgress();
  mpSession = mpDueProblems();
  mpSessionIdx = 0;
  mpView = 'quiz';
  var qv = document.getElementById('mpQuizView');
  var dv = document.getElementById('mpDashView');
  qv.classList.remove('hidden');
  dv.classList.add('hidden');
  document.querySelectorAll('.mp-btn-view').forEach(function(b) {
    b.classList.toggle('active', b.id === 'mpViewQuiz');
  });
  setMpStatus('');
  if (!mpSession.length) {
    document.getElementById('mpQuizCard').innerHTML =
      '<div class="mp-placeholder">Welcome to Math Practice! You have <b>no due problems</b>. Start fresh — answer a few and rate them.</div>';
    mpRenderStatsRow();
  } else {
    mpShowProblem(mpSession[0]);
  }
}

function setMpStatus(msg) {
  var el = document.getElementById('mpStatus');
  if (el) el.innerHTML = msg;
}

document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('mpViewQuiz').addEventListener('click', function() {
    mpView = 'quiz';
    var qv = document.getElementById('mpQuizView');
    var dv = document.getElementById('mpDashView');
    qv.classList.remove('hidden');
    dv.classList.add('hidden');
    document.querySelectorAll('.mp-btn-view').forEach(function(b) { b.classList.toggle('active', b.id === 'mpViewQuiz'); });
    setMpStatus('');
    if (mpSession.length === 0) {
      mpSession = mpDueProblems();
      mpSessionIdx = 0;
    }
    if (mpSession.length) mpShowProblem(mpSession[mpSessionIdx]);
    else {
      document.getElementById('mpQuizCard').innerHTML =
        '<div class="mp-placeholder">No due problems. Start a fresh set or check back later.</div>';
      mpRenderStatsRow();
    }
  });
  document.getElementById('mpViewDash').addEventListener('click', function() {
    mpView = 'dash';
    var qv = document.getElementById('mpQuizView');
    var dv = document.getElementById('mpDashView');
    qv.classList.add('hidden');
    dv.classList.remove('hidden');
    document.querySelectorAll('.mp-btn-view').forEach(function(b) { b.classList.toggle('active', b.id === 'mpViewDash'); });
    mpRenderStatsRow();
    mpRenderDashboard();
  });
  var mpAddBtn = document.getElementById('mpAddProblemBtn');
  if (mpAddBtn) mpAddBtn.addEventListener('click', function() { mpShowProblemForm(null); });
  var refClose = document.getElementById('mpRefClose');
  if (refClose) refClose.addEventListener('click', mpCloseReference);
  var refModal = document.getElementById('mpRefModal');
  if (refModal) {
    refModal.addEventListener('click', function(e) {
      if (e.target === refModal) mpCloseReference();
    });
  }
});

// ===== NOTES TAB (search-only, typed notes saved as projects) =====
function getNotesTabKey() {
  return 'ic_notes_' + (currentUser || 'guest');
}
let notesProjects = [];
let notesCurrentId = null;

function getNotesProjects() {
  try { return JSON.parse(localStorage.getItem(getNotesTabKey())) || []; } catch(e) { return []; }
}
function saveNotesProjects(list) {
  localStorage.setItem(getNotesTabKey(), JSON.stringify(list));
  notesProjects = list;
}
function currentNoteProject() {
  return notesProjects.find(function(n) { return n.id === notesCurrentId; }) || null;
}
function setNotesStatus(msg) {
  const el = document.getElementById('notesStatus');
  if (el) el.textContent = msg;
}

function renderNotesList() {
  const list = document.getElementById('notesList');
  if (!list) return;
  if (!notesProjects.length) {
    list.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:12px;">No notes yet. Click + to create one.</div>';
    return;
  }
  list.innerHTML = notesProjects.map(function(n) {
    return '<div class="notes-item ' + (n.id === notesCurrentId ? 'notes-item-active' : '') + '" data-id="' + n.id + '">' +
      '<div style="min-width:0;flex:1;">' +
      '<div class="notes-item-name">' + escapeIRE(n.name || 'Untitled') + '</div>' +
      '<div class="notes-item-date">' + new Date(n.updatedAt).toLocaleDateString() + '</div>' +
      '</div>' +
      '<button class="notes-item-del-btn" data-del="' + n.id + '" title="Delete note">&#10005;</button>' +
      '</div>';
  }).join('');
  list.querySelectorAll('.notes-item').forEach(function(el) {
    el.addEventListener('click', function(ev) {
      if (ev.target.closest('.notes-item-del-btn')) return;
      openNoteProject(this.dataset.id);
    });
  });
  list.querySelectorAll('.notes-item-del-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { deleteNoteProject(this.dataset.del); });
  });
}

function openNoteProject(id) {
  notesCurrentId = id;
  const note = currentNoteProject();
  document.getElementById('notesTitle').value = note ? note.name : '';
  document.getElementById('notesEditor').value = note ? (note.content || '') : '';
  renderNotesList();
  setNotesStatus('');
}

function newNoteProject() {
  const note = { id: 'n' + Date.now() + Math.random().toString(36).slice(2, 6), name: 'Untitled Note', updatedAt: Date.now(), content: '' };
  notesProjects.unshift(note);
  notesCurrentId = note.id;
  saveNotesProjects(notesProjects);
  openNoteProject(note.id);
  setNotesStatus('New note created');
  document.getElementById('notesTitle').focus();
}

function deleteNoteProject(id) {
  if (!confirm('Delete this note?')) return;
  notesProjects = notesProjects.filter(function(n) { return n.id !== id; });
  if (notesCurrentId === id) notesCurrentId = notesProjects.length ? notesProjects[0].id : null;
  saveNotesProjects(notesProjects);
  renderNotesList();
  if (notesCurrentId) openNoteProject(notesCurrentId);
  else {
    document.getElementById('notesTitle').value = '';
    document.getElementById('notesEditor').value = '';
    setNotesStatus('');
  }
}

function notesSaveProject() {
  const note = currentNoteProject();
  if (!note) return;
  const t = document.getElementById('notesTitle');
  const e = document.getElementById('notesEditor');
  if (t.value.trim()) note.name = t.value.trim();
  note.content = e.value;
  note.updatedAt = Date.now();
  saveNotesProjects(notesProjects);
  renderNotesList();
  setNotesStatus('Saved ' + new Date().toLocaleTimeString());
}

function renderNotesTab() {
  notesProjects = getNotesProjects();
  if (!notesProjects.length) {
    const note = { id: 'n' + Date.now() + Math.random().toString(36).slice(2, 6), name: 'Untitled Note', updatedAt: Date.now(), content: '' };
    notesProjects.push(note);
    saveNotesProjects(notesProjects);
  }
  if (!notesCurrentId || !currentNoteProject()) notesCurrentId = notesProjects[0].id;
  openNoteProject(notesCurrentId);
}

document.getElementById('notesNewBtn').addEventListener('click', newNoteProject);
document.getElementById('notesSaveBtn').addEventListener('click', notesSaveProject);
document.getElementById('notesDeleteBtn').addEventListener('click', function() {
  if (notesCurrentId) deleteNoteProject(notesCurrentId);
});
document.getElementById('notesTitle').addEventListener('change', function() {
  const note = currentNoteProject();
  if (note) {
    note.name = this.value.trim() || 'Untitled Note';
    note.updatedAt = Date.now();
    saveNotesProjects(notesProjects);
    renderNotesList();
  }
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
