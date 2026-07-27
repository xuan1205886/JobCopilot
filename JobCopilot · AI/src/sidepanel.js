// ===== JobCopilot v1.1 侧边栏：投递 + 追踪 + 分析 + 设置 =====
const $ = (id) => document.getElementById(id);
const CFG_FIELDS = ['dsKey', 'resumeText', 'keyword', 'city', 'count'];

// ===== Tab 切换 =====
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    const target = $(btn.dataset.tab);
    if (target) target.classList.add('active');
    // 切换时刷新对应面板
    if (btn.dataset.tab === 'tab-tracker') refreshTracker();
    if (btn.dataset.tab === 'tab-analytics') refreshAnalytics();
    if (btn.dataset.tab === 'tab-settings') refreshResumeVersions();
  });
});

// ===== 折叠 =====
document.querySelectorAll('.card-h[data-toggle]').forEach(h => {
  h.addEventListener('click', () => {
    const body = $(h.dataset.toggle);
    body.style.display = body.style.display === 'none' ? 'block' : 'none';
  });
});

// ===== 配置（原有） =====
chrome.storage.local.get(CFG_FIELDS.concat(['resumeImage']), (d) => {
  CFG_FIELDS.forEach(f => { if (d[f] !== undefined && $(f)) $(f).value = d[f]; });
  if (d.resumeImage) showImg(d.resumeImage);
});

function showImg(dataUrl) { $('imgPrev').innerHTML = '<img src="' + dataUrl + '">'; }

$('resumeImg').addEventListener('change', (e) => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => { showImg(ev.target.result); chrome.storage.local.set({ resumeImage: ev.target.result }); };
  reader.readAsDataURL(file);
});

$('saveCfg').addEventListener('click', () => {
  const obj = {};
  CFG_FIELDS.forEach(f => { obj[f] = $(f).value.trim ? $(f).value.trim() : $(f).value; });
  chrome.storage.local.set(obj, () => { const s = $('saved'); s.style.display = 'inline'; setTimeout(() => s.style.display = 'none', 1500); });
});

function saveCfgSync() {
  return new Promise(res => {
    const obj = {};
    CFG_FIELDS.forEach(f => { obj[f] = $(f).value.trim ? $(f).value.trim() : $(f).value; });
    chrome.storage.local.set(obj, res);
  });
}

// ===== 运行控制（原有） =====
$('btnCollect').addEventListener('click', async () => {
  await saveCfgSync();
  if (!$('dsKey').value.trim()) return addLog('请先填 DeepSeek API Key', 'error');
  if (!$('keyword').value.trim()) return addLog('请先填岗位关键词', 'error');
  $('reviewCard').style.display = 'none';
  setRunning(true);
  chrome.runtime.sendMessage({ type: 'START_COLLECT' });
});

$('btnDeliver').addEventListener('click', () => {
  const ids = Array.from(document.querySelectorAll('.job-item input:checked')).map(c => c.dataset.id);
  if (!ids.length) return addLog('请至少勾选一个岗位', 'error');
  setRunning(true);
  addLog('开始投递 ' + ids.length + ' 个岗位', 'info');
  chrome.runtime.sendMessage({ type: 'START_DELIVER', jobIds: ids });
});

$('btnPause').addEventListener('click', () => {
  if ($('btnPause').textContent === '暂停') { $('btnPause').textContent = '继续'; chrome.runtime.sendMessage({ type: 'PAUSE' }); }
  else { $('btnPause').textContent = '暂停'; chrome.runtime.sendMessage({ type: 'RESUME' }); }
});
$('btnStop').addEventListener('click', () => { chrome.runtime.sendMessage({ type: 'STOP' }); setRunning(false); });
$('btnReset').addEventListener('click', () => { chrome.runtime.sendMessage({ type: 'RESET' }); $('reviewCard').style.display = 'none'; setRunning(false); });
$('clearLog').addEventListener('click', () => { $('log').innerHTML = ''; });

$('selAll').addEventListener('change', (e) => {
  document.querySelectorAll('.job-item:not(.skip) input').forEach(c => c.checked = e.target.checked);
});

function setRunning(running) {
  $('btnCollect').disabled = running;
  $('btnPause').disabled = !running;
  $('btnStop').disabled = !running;
  if (!running) $('btnPause').textContent = '暂停';
}

function renderReview(screened) {
  const matched = screened.filter(j => j.match);
  const skipped = screened.filter(j => !j.match);
  $('reviewCount').textContent = '匹配 ' + matched.length + ' / ' + screened.length;
  let html = '';
  matched.forEach(j => {
    html += '<div class="job-item"><input type="checkbox" checked data-id="' + esc(j.id) + '">'
      + '<div class="job-main"><div class="job-title">' + esc(j.name) + '</div>'
      + '<div class="job-sub">' + esc(j.company) + ' · ' + esc(j.salary) + '</div>'
      + '<div class="job-reason m">✓ ' + esc(j.reason) + '</div></div></div>';
  });
  skipped.forEach(j => {
    html += '<div class="job-item skip"><input type="checkbox" disabled data-id="' + esc(j.id) + '">'
      + '<div class="job-main"><div class="job-title">' + esc(j.name) + '</div>'
      + '<div class="job-sub">' + esc(j.company) + ' · ' + esc(j.salary) + '</div>'
      + '<div class="job-reason s">✗ ' + esc(j.reason) + '</div></div></div>';
  });
  $('reviewList').innerHTML = html || '<div class="job-sub">无岗位</div>';
  $('reviewCard').style.display = 'block';
}
function esc(s) { return (s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ===== 消息接收（原有） =====
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'LOG') addLog(msg.text, msg.level);
  if (msg.type === 'PROGRESS') $('progText').textContent = (msg.label ? msg.label + ' ' : '') + msg.cur + '/' + msg.total;
  if (msg.type === 'PHASE') {
    const map = { idle: '未开始', collecting: '收集中', screening: 'AI筛选中', review: '待审核', delivering: '投递中', done: '已完成' };
    $('phaseText').textContent = map[msg.phase] || msg.phase;
    if (msg.phase === 'review' || msg.phase === 'done' || msg.phase === 'idle') setRunning(false);
  }
  if (msg.type === 'SCREENED') renderReview(msg.screened);
  if (msg.type === 'DONE') { setRunning(false); $('progText').textContent = ''; }
});

function addLog(text, level) {
  level = level || 'info';
  const now = new Date();
  const t = [now.getHours(), now.getMinutes(), now.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
  const el = document.createElement('div');
  el.className = 'log-item ' + level;
  el.innerHTML = '<span class="log-time">[' + t + ']</span>' + esc(text);
  $('log').appendChild(el);
  $('log').scrollTop = $('log').scrollHeight;
}

// ══════════════════════════════════════════════════
//  Tab 2: 追踪记录
// ══════════════════════════════════════════════════
const STATUS_MAP = {
  sent: { label: '已投递', cls: 'status-sent', icon: '📤' },
  read: { label: 'HR已读', cls: 'status-read', icon: '👁' },
  replied: { label: '已回复', cls: 'status-replied', icon: '💬' },
  interview: { label: '约面试', cls: 'status-interview', icon: '🎯' },
  rejected: { label: '不合适', cls: 'status-rejected', icon: '✗' },
  expired: { label: '已过期', cls: 'status-expired', icon: '⏰' }
};

async function refreshTracker() {
  const records = await sendToSW({ type: 'TRACKER_GET_ALL' }) || [];
  const filterStatus = ($('filterStatus') && $('filterStatus').value) || 'all';
  const filterCompany = ($('filterCompany') && $('filterCompany').value || '').toLowerCase();

  let filtered = records;
  if (filterStatus !== 'all') filtered = filtered.filter(r => r.status === filterStatus);
  if (filterCompany) filtered = filtered.filter(r =>
    (r.company || '').toLowerCase().includes(filterCompany) ||
    (r.jobName || '').toLowerCase().includes(filterCompany)
  );

  $('trackerCount').textContent = '共 ' + records.length + ' 条';
  let html = '';
  filtered.forEach(r => {
    const st = STATUS_MAP[r.status] || STATUS_MAP.sent;
    const time = new Date(r.appliedAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    html += '<div class="tracker-item">'
      + '<div class="tracker-top">'
        + '<div><span class="tracker-name">' + esc(r.jobName) + '</span>'
        + '<div class="tracker-company">' + esc(r.company) + (r.salary ? ' · ' + esc(r.salary) : '') + '</div></div>'
        + '<span class="tracker-status ' + st.cls + '">' + st.icon + ' ' + st.label + '</span>'
      + '</div>'
      + '<div class="tracker-meta">' + time
        + (r.city ? ' · ' + esc(r.city) : '')
        + (r.tags && r.tags.length ? ' · ' + esc(r.tags.slice(0, 4).join('、')) : '') + '</div>';
    if (r.greeting) {
      html += '<div class="tracker-greeting">' + esc(r.greeting.slice(0, 60)) + (r.greeting.length > 60 ? '...' : '') + '</div>';
    }
    if (r.hrReply) {
      html += '<div class="tracker-hr-reply">💬 HR: ' + esc(r.hrReply.slice(0, 100)) + '</div>';
    }
    // 状态修改
    html += '<select class="status-select" data-id="' + esc(r.id) + '" onchange="changeStatus(this)">';
    Object.entries(STATUS_MAP).forEach(([k, v]) => {
      html += '<option value="' + k + '"' + (r.status === k ? ' selected' : '') + '>' + v.icon + ' ' + v.label + '</option>';
    });
    html += '</select>';
    // 删除按钮
    html += ' <button class="mini-btn" style="color:#c92a2a" onclick="removeRecord(\'' + esc(r.id) + '\')">删除</button>';
    html += '</div>';
  });
  $('trackerList').innerHTML = html || '<div style="text-align:center;color:#999;padding:20px">暂无投递记录</div>';
}

function changeStatus(sel) {
  const recordId = sel.dataset.id;
  const newStatus = sel.value;
  sendToSW({ type: 'TRACKER_UPDATE_STATUS', recordId: recordId, status: newStatus });
}

function removeRecord(recordId) {
  if (confirm('确认删除这条投递记录？')) {
    sendToSW({ type: 'TRACKER_REMOVE', recordId: recordId });
    setTimeout(refreshTracker, 300);
  }
}

$('filterStatus').addEventListener('change', refreshTracker);
$('filterCompany').addEventListener('input', refreshTracker);

$('btnExportCSV').addEventListener('click', async () => {
  const csv = await sendToSW({ type: 'TRACKER_EXPORT' }) || '';
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = '投递记录_' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  addLog('CSV 已导出', 'success');
});

$('btnClearTracker').addEventListener('click', () => {
  if (confirm('确认清空所有投递记录？此操作不可恢复！')) {
    sendToSW({ type: 'TRACKER_CLEAR' });
    setTimeout(refreshTracker, 300);
  }
});

// ══════════════════════════════════════════════════
//  Tab 3: 数据分析
// ══════════════════════════════════════════════════
async function refreshAnalytics() {
  const stats = await sendToSW({ type: 'ANALYTICS_GET' });
  if (!stats || stats.total === 0) {
    $('analyticsContent').innerHTML = '<div style="text-align:center;color:#999;padding:40px">📭 暂无投递数据，开始投递后这里会出现分析报告</div>';
    return;
  }

  // 核心指标
  $('statsGrid').innerHTML =
    '<div class="stat-card"><div class="stat-num blue">' + stats.total + '</div><div class="stat-label">总投递</div></div>' +
    '<div class="stat-card"><div class="stat-num green">' + stats.replyRate + '%</div><div class="stat-label">回复率</div></div>' +
    '<div class="stat-card"><div class="stat-num purple">' + stats.interviewRate + '%</div><div class="stat-label">面试率</div></div>' +
    '<div class="stat-card"><div class="stat-num green">' + stats.replied + '</div><div class="stat-label">已回复</div></div>' +
    '<div class="stat-card"><div class="stat-num red">' + stats.rejected + '</div><div class="stat-label">不合适</div></div>' +
    '<div class="stat-card"><div class="stat-num blue">' + stats.avgReplyHours + 'h</div><div class="stat-label">平均回复时间</div></div>';

  // 每日趋势
  const maxSent = Math.max(1, ...stats.dailyTrend.map(d => d.sent));
  let chartHtml = '';
  stats.dailyTrend.forEach(d => {
    const sentH = Math.max(1, Math.round(d.sent / maxSent * 70));
    const repliedH = d.replied > 0 ? Math.max(1, Math.round(d.replied / maxSent * 50)) : 0;
    chartHtml += '<div class="chart-col">'
      + '<div class="bar-wrap">'
        + '<div class="bar-sent" style="height:' + sentH + 'px" title="投递:' + d.sent + '"></div>'
        + (repliedH > 0 ? '<div class="bar-replied" style="height:' + repliedH + 'px" title="回复:' + d.replied + '"></div>' : '')
      + '</div>'
      + '<div class="bar-date">' + d.date.slice(5) + '</div>'
    + '</div>';
  });
  $('dailyChart').innerHTML = chartHtml || '<div style="color:#999;font-size:11px">无数据</div>';

  // 技能标签排名
  let tagHtml = '';
  const maxTag = Math.max(1, ...stats.byTag.map(t => t.total));
  stats.byTag.forEach(t => {
    const pct = Math.round(t.total / maxTag * 100);
    tagHtml += '<span class="rank-tag" title="投递' + t.total + '次, 回复' + t.replied + '次" style="opacity:' + (0.3 + pct / 200) + '">'
      + t.tag + ' (' + t.total + '/' + t.replied + ')</span>';
  });
  $('tagRank').innerHTML = tagHtml || '<span style="color:#999">无数据</span>';

  // 公司排行
  let compHtml = '';
  const maxComp = Math.max(1, ...stats.byCompany.map(c => c.total));
  stats.byCompany.forEach(c => {
    const pct = Math.round(c.total / maxComp * 100);
    compHtml += '<div class="rank-item">'
      + '<span class="rank-name">' + esc(c.company) + '</span>'
      + '<div class="rank-bars"><div class="rank-bar-total" style="width:' + pct + 'px"></div></div>'
      + '<span class="rank-num">投' + c.total + ' 回' + c.replied + '</span>'
    + '</div>';
  });
  $('companyRank').innerHTML = compHtml || '<span style="color:#999">无数据</span>';

  // 招呼语建议
  const tips = await sendToSW({ type: 'ANALYTICS_GREETING_TIPS' });
  if (tips && tips.topSkills && tips.topSkills.length > 0) {
    let tipHtml = '<p style="font-size:12px;color:#666;margin-bottom:8px"><strong>高回复率技能关键词（建议在招呼语中优先提及）：</strong></p>';
    tipHtml += tips.topSkills.map(s => '<span class="rank-tag">' + esc(s.skill) + ' (' + s.count + '次回复)</span>').join(' ');
    if (tips.patterns && tips.patterns.length > 0) {
      tipHtml += '<p style="font-size:12px;color:#666;margin-top:10px"><strong>高回复招呼语示例：</strong></p>';
      tips.patterns.slice(0, 3).forEach(p => {
        tipHtml += '<div style="font-size:11px;color:#666;margin-top:4px;padding:6px;background:#f0fdf4;border-radius:4px">'
          + '<strong>' + esc(p.jobName) + '</strong> @' + esc(p.company) + '<br>'
          + esc(p.greeting.slice(0, 80)) + '...</div>';
      });
    }
    $('greetingTips').innerHTML = tipHtml;
  }
}

// ══════════════════════════════════════════════════
//  Tab 4: 设置 — 简历版本管理
// ══════════════════════════════════════════════════
let _editingResumeId = null;

async function refreshResumeVersions() {
  const versions = await sendToSW({ type: 'RESUME_GET_ALL' }) || [];
  let html = '';
  versions.forEach(v => {
    const isDefault = v.id === 'default';
    const activeText = (v.text || '').slice(0, 60);
    html += '<div class="resume-ver-item' + (isDefault ? ' active-ver' : '') + '">'
      + '<div class="ver-header">'
        + '<span class="ver-name">' + esc(v.name) + (isDefault ? ' <span style="font-size:10px;color:#00a0e9">[当前使用]</span>' : '') + '</span>'
        + '<div class="ver-actions">'
          + '<button onclick="useResumeVer(\'' + esc(v.id) + '\')">使用</button>'
          + '<button onclick="editResumeVer(\'' + esc(v.id) + '\', \'' + esc(v.name) + '\', \'' + esc((v.text || '').replace(/'/g, "\\'").replace(/\n/g, '\\n')) + '\')">编辑</button>'
          + (!isDefault ? '<button onclick="deleteResumeVer(\'' + esc(v.id) + '\')" style="color:#c92a2a">删除</button>' : '')
        + '</div>'
      + '</div>'
      + '<div class="ver-preview">' + (activeText || '（空内容）') + '</div>'
    + '</div>';
  });
  $('resumeVerList').innerHTML = html || '<div style="color:#999">暂无简历版本</div>';
}

$('btnAddResumeVer').addEventListener('click', () => {
  _editingResumeId = null;
  $('newResumeName').value = '';
  $('newResumeText').value = '';
  $('resumeVerForm').style.display = 'block';
});

$('btnCancelResumeVer').addEventListener('click', () => {
  $('resumeVerForm').style.display = 'none';
});

$('btnSaveResumeVer').addEventListener('click', async () => {
  const name = $('newResumeName').value.trim();
  const text = $('newResumeText').value.trim();
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
  chrome.storage.local.get(['resumeText'], async (d) => {
    const versions = await sendToSW({ type: 'RESUME_GET_ALL' }) || [];
    const v = versions.find(v => v.id === id);
    if (v && $('resumeText')) {
      $('resumeText').value = v.text;
      // 更新默认版本标记
      versions.forEach(v2 => v2.id === id ? v2._active = true : delete v2._active);
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
  if (!confirm('确认删除这个简历版本？')) return;
  await sendToSW({ type: 'RESUME_REMOVE', id: id });
  refreshResumeVersions();
}

// ===== SW 通信封装 =====
function sendToSW(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(resp);
    });
  });
}
