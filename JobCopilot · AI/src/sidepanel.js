// ===== JobCopilot v1.2 侧边栏：投递 + 设置 =====
var $ = function(id) { return document.getElementById(id); };
var CFG_FIELDS = ['dsKey', 'resumeText', 'keyword', 'city', 'count'];

// ===== Tab 切换 =====
document.querySelectorAll('.tab-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
    document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });
    btn.classList.add('active');
    var target = $(btn.dataset.tab);
    if (target) target.classList.add('active');
    if (btn.dataset.tab === 'tab-settings') refreshResumeVersions();
  });
});

// ===== 折叠 =====
document.querySelectorAll('.card-h[data-toggle]').forEach(function(h) {
  h.addEventListener('click', function() {
    var body = $(h.dataset.toggle);
    body.style.display = body.style.display === 'none' ? 'block' : 'none';
  });
});

// ===== 配置 =====
chrome.storage.local.get(CFG_FIELDS.concat(['resumeImage']), function(d) {
  CFG_FIELDS.forEach(function(f) { if (d[f] !== undefined && $(f)) $(f).value = d[f]; });
  if (d.resumeImage) showImg(d.resumeImage);
});

function showImg(dataUrl) { $('imgPrev').innerHTML = '<img src="' + dataUrl + '">'; }

$('resumeImg').addEventListener('change', function(e) {
  var file = e.target.files[0]; if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) { showImg(ev.target.result); chrome.storage.local.set({ resumeImage: ev.target.result }); };
  reader.readAsDataURL(file);
});

$('saveCfg').addEventListener('click', function() {
  var obj = {};
  CFG_FIELDS.forEach(function(f) { obj[f] = $(f).value.trim ? $(f).value.trim() : $(f).value; });
  chrome.storage.local.set(obj, function() { var s = $('saved'); s.style.display = 'inline'; setTimeout(function() { s.style.display = 'none'; }, 1500); });
});

function saveCfgSync() {
  return new Promise(function(res) {
    var obj = {};
    CFG_FIELDS.forEach(function(f) { obj[f] = $(f).value.trim ? $(f).value.trim() : $(f).value; });
    chrome.storage.local.set(obj, res);
  });
}

// ===== 运行控制 =====
$('btnCollect').addEventListener('click', async function() {
  await saveCfgSync();
  if (!$('dsKey').value.trim()) return addLog('请先填 DeepSeek API Key', 'error');
  if (!$('keyword').value.trim()) return addLog('请先填岗位关键词', 'error');
  $('reviewCard').style.display = 'none';
  setRunning(true);
  sendToSW({ type:'START_COLLECT' });
});

$('btnDeliver').addEventListener('click', function() {
  var ids = Array.from(document.querySelectorAll('.job-item input:checked')).map(function(c) { return c.dataset.id; });
  if (!ids.length) return addLog('请至少勾选一个岗位', 'error');
  setRunning(true);
  addLog('开始投递 ' + ids.length + ' 个岗位', 'info');
  sendToSW({ type:'START_DELIVER', jobIds: ids });
});

$('btnPause').addEventListener('click', function() {
  if ($('btnPause').textContent === '暂停') { $('btnPause').textContent = '继续'; sendToSW({ type:'PAUSE' }); }
  else { $('btnPause').textContent = '暂停'; sendToSW({ type:'RESUME' }); }
});
$('btnStop').addEventListener('click', function() { sendToSW({ type:'STOP' }); setRunning(false); });
$('btnReset').addEventListener('click', function() { sendToSW({ type:'RESET' }); $('reviewCard').style.display = 'none'; setRunning(false); });
$('clearLog').addEventListener('click', function() { $('log').innerHTML = ''; });

$('selAll').addEventListener('change', function(e) {
  document.querySelectorAll('.job-item:not(.skip) input').forEach(function(c) { c.checked = e.target.checked; });
});

function setRunning(running) {
  $('btnCollect').disabled = running;
  $('btnPause').disabled = !running;
  $('btnStop').disabled = !running;
  if (!running) $('btnPause').textContent = '暂停';
}

function jobSub(j) { return [j.company, j.city, j.salary].filter(Boolean).join(' · '); }

function renderReview(screened) {
  var matched = screened.filter(function(j) { return j.match; });
  var skipped = screened.filter(function(j) { return !j.match; });
  $('reviewCount').textContent = '匹配 ' + matched.length + ' / ' + screened.length;
  var html = '';
  matched.forEach(function(j) {
    html += '<div class="job-item"><input type="checkbox" checked data-id="' + esc(j.id) + '">'
      + '<div class="job-main"><div class="job-title">' + esc(j.name) + '</div>'
      + '<div class="job-sub">' + esc(jobSub(j)) + '</div>'
      + '<div class="job-reason m">✓ ' + esc(j.reason) + '</div></div></div>';
  });
  skipped.forEach(function(j) {
    html += '<div class="job-item skip"><input type="checkbox" disabled data-id="' + esc(j.id) + '">'
      + '<div class="job-main"><div class="job-title">' + esc(j.name) + '</div>'
      + '<div class="job-sub">' + esc(jobSub(j)) + '</div>'
      + '<div class="job-reason s">✗ ' + esc(j.reason) + '</div></div></div>';
  });
  $('reviewList').innerHTML = html || '<div class="job-sub">无岗位</div>';
  $('reviewCard').style.display = 'block';
}
function esc(s) { return (s || '').replace(/[&<>"]/g, function(c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

// ===== 消息接收 =====
chrome.runtime.onMessage.addListener(function(msg) {
  if (msg.type === 'LOG') addLog(msg.text, msg.level);
  if (msg.type === 'PROGRESS') $('progText').textContent = (msg.label ? msg.label + ' ' : '') + msg.cur + '/' + msg.total;
  if (msg.type === 'PHASE') {
    var map = { idle: '未开始', collecting: '收集中', screening: 'AI筛选中', review: '待审核', delivering: '投递中', done: '已完成' };
    $('phaseText').textContent = map[msg.phase] || msg.phase;
    if (msg.phase === 'review' || msg.phase === 'done' || msg.phase === 'idle') setRunning(false);
  }
  if (msg.type === 'SCREENED') renderReview(msg.screened);
  if (msg.type === 'DONE') { setRunning(false); $('progText').textContent = ''; }
});

function addLog(text, level) {
  level = level || 'info';
  var now = new Date();
  var t = [now.getHours(), now.getMinutes(), now.getSeconds()].map(function(n) { return String(n).padStart(2, '0'); }).join(':');
  var el = document.createElement('div');
  el.className = 'log-item ' + level;
  el.innerHTML = '<span class="log-time">[' + t + ']</span>' + esc(text);
  $('log').appendChild(el);
  $('log').scrollTop = $('log').scrollHeight;
}

// ═══════════════════════════════════
//  Tab 4: 简历版本
// ═══════════════════════════════════
var _editingResumeId = null;

async function refreshResumeVersions() {
  var versions = await sendToSW({ type: 'RESUME_GET_ALL' }) || [];
  var html = '';
  versions.forEach(function(v) {
    var isDefault = v.id === 'default';
    var activeText = (v.text || '').slice(0, 60);
    html += '<div class="resume-ver-item' + (isDefault ? ' active-ver' : '') + '">'
      + '<div class="ver-header">'
        + '<span class="ver-name">' + esc(v.name) + (isDefault ? ' <span style="font-size:10px;color:#00a0e9">[当前]</span>' : '') + '</span>'
        + '<div class="ver-actions">'
          + '<button onclick="useResumeVer(\'' + esc(v.id) + '\')">使用</button>'
          + '<button onclick="editResumeVer(\'' + esc(v.id) + '\',\'' + esc(v.name) + '\',\'' + esc((v.text || '').replace(/'/g,"\\'").replace(/\n/g,'\\n')) + '\')">编辑</button>'
          + (!isDefault ? '<button onclick="deleteResumeVer(\'' + esc(v.id) + '\')" style="color:#c92a2a">删除</button>' : '')
        + '</div>'
      + '</div>'
      + '<div class="ver-preview">' + (activeText || '（空）') + '</div>'
    + '</div>';
  });
  $('resumeVerList').innerHTML = html || '<div style="color:#999">暂无</div>';
}

$('btnAddResumeVer').addEventListener('click', function() {
  _editingResumeId = null;
  $('newResumeName').value = '';
  $('newResumeText').value = '';
  $('resumeVerForm').style.display = 'block';
});

$('btnCancelResumeVer').addEventListener('click', function() {
  $('resumeVerForm').style.display = 'none';
});

$('btnSaveResumeVer').addEventListener('click', async function() {
  var name = $('newResumeName').value.trim();
  var text = $('newResumeText').value.trim();
  if (!name) return alert('请输入版本名称');
  if (_editingResumeId) {
    await sendToSW({ type: 'RESUME_UPDATE', id: _editingResumeId, name: name, text: text });
  } else {
    await sendToSW({ type: 'RESUME_ADD', name: name, text: text });
  }
  $('resumeVerForm').style.display = 'none';
  _editingResumeId = null;
  refreshResumeVersions();
});

function useResumeVer(id) {
  sendToSW({ type: 'RESUME_GET_ALL' }).then(function(versions) {
    versions = versions || [];
    var v = versions.find(function(x) { return x.id === id; });
    if (v && $('resumeText')) {
      $('resumeText').value = v.text;
      refreshResumeVersions();
      addLog('已切换到简历版本：' + v.name, 'info');
    }
  });
}

function editResumeVer(id, name, text) {
  _editingResumeId = id;
  $('newResumeName').value = name;
  $('newResumeText').value = text.replace(/\\n/g, '\n');
  $('resumeVerForm').style.display = 'block';
}

async function deleteResumeVer(id) {
  if (!confirm('确认删除？')) return;
  await sendToSW({ type: 'RESUME_REMOVE', id: id });
  refreshResumeVersions();
}

// ===== SW 通信（带重试，SW 被回收时自动唤醒） =====
function sendToSW(msg, retries) {
  retries = retries || 3;
  return new Promise(function(resolve) {
    function attempt(n) {
      chrome.runtime.sendMessage(msg, function(resp) {
        if (chrome.runtime.lastError) {
          if (n < retries) {
            setTimeout(function() { attempt(n + 1); }, 300);
          } else {
            resolve(null);
          }
        } else {
          resolve(resp);
        }
      });
    }
    attempt(0);
  });
}
