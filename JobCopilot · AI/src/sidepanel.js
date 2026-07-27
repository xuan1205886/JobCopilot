// ===== JobCopilot v1.1 侧边栏：投递 + 追踪 + 分析 + 设置 =====
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
    if (btn.dataset.tab === 'tab-tracker') refreshTracker();
    if (btn.dataset.tab === 'tab-analytics') refreshAnalytics();
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

function renderReview(screened) {
  var matched = screened.filter(function(j) { return j.match; });
  var skipped = screened.filter(function(j) { return !j.match; });
  $('reviewCount').textContent = '匹配 ' + matched.length + ' / ' + screened.length;
  var html = '';
  matched.forEach(function(j) {
    html += '<div class="job-item"><input type="checkbox" checked data-id="' + esc(j.id) + '">'
      + '<div class="job-main"><div class="job-title">' + esc(j.name) + '</div>'
      + '<div class="job-sub">' + esc(j.company) + ' · ' + esc(j.salary) + '</div>'
      + '<div class="job-reason m">✓ ' + esc(j.reason) + '</div></div></div>';
  });
  skipped.forEach(function(j) {
    html += '<div class="job-item skip"><input type="checkbox" disabled data-id="' + esc(j.id) + '">'
      + '<div class="job-main"><div class="job-title">' + esc(j.name) + '</div>'
      + '<div class="job-sub">' + esc(j.company) + ' · ' + esc(j.salary) + '</div>'
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
//  Tab 2: 追踪记录
// ═══════════════════════════════════
var STATUS_MAP = {
  sent: { label: '已投递', cls: 'status-sent', icon: '📤' },
  read: { label: 'HR已读', cls: 'status-read', icon: '👁' },
  replied: { label: '已回复', cls: 'status-replied', icon: '💬' },
  interview: { label: '约面试', cls: 'status-interview', icon: '🎯' },
  rejected: { label: '不合适', cls: 'status-rejected', icon: '✗' },
  expired: { label: '已过期', cls: 'status-expired', icon: '⏰' }
};

async function refreshTracker() {
  var records = await sendToSW({ type: 'TRACKER_GET_ALL' }) || [];
  var filterStatus = ($('filterStatus') && $('filterStatus').value) || 'all';
  var filterCompany = ($('filterCompany') && $('filterCompany').value || '').toLowerCase();

  var filtered = records;
  if (filterStatus !== 'all') filtered = filtered.filter(function(r) { return r.status === filterStatus; });
  if (filterCompany) filtered = filtered.filter(function(r) {
    return (r.company || '').toLowerCase().indexOf(filterCompany) >= 0 ||
           (r.jobName || '').toLowerCase().indexOf(filterCompany) >= 0;
  });

  $('trackerCount').textContent = '共 ' + records.length + ' 条';
  var html = '';
  filtered.forEach(function(r) {
    var st = STATUS_MAP[r.status] || STATUS_MAP.sent;
    var time = new Date(r.appliedAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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
    html += '<select class="status-select" data-id="' + esc(r.id) + '" onchange="changeStatus(this)">';
    Object.keys(STATUS_MAP).forEach(function(k) {
      var v = STATUS_MAP[k];
      html += '<option value="' + k + '"' + (r.status === k ? ' selected' : '') + '>' + v.icon + ' ' + v.label + '</option>';
    });
    html += '</select>';
    html += ' <button class="mini-btn" style="color:#c92a2a" onclick="removeRecord(\'' + esc(r.id) + '\')">删除</button>';
    html += '</div>';
  });
  $('trackerList').innerHTML = html || '<div style="text-align:center;color:#999;padding:20px">暂无投递记录</div>';
}

function changeStatus(sel) {
  sendToSW({ type: 'TRACKER_UPDATE_STATUS', recordId: sel.dataset.id, status: sel.value });
}

function removeRecord(recordId) {
  if (confirm('确认删除这条投递记录？')) {
    sendToSW({ type: 'TRACKER_REMOVE', recordId: recordId });
    setTimeout(refreshTracker, 300);
  }
}

$('filterStatus').addEventListener('change', refreshTracker);
$('filterCompany').addEventListener('input', refreshTracker);

$('btnExportCSV').addEventListener('click', async function() {
  var csv = await sendToSW({ type: 'TRACKER_EXPORT' }) || '';
  var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = '投递记录_' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  addLog('CSV 已导出', 'success');
});

$('btnClearTracker').addEventListener('click', function() {
  if (confirm('确认清空所有投递记录？此操作不可恢复！')) {
    sendToSW({ type: 'TRACKER_CLEAR' });
    setTimeout(refreshTracker, 300);
  }
});

$('btnScanReplies').addEventListener('click', async function() {
  addLog('打开BOSS聊天页扫描回复...', 'info');
  try {
    var records = await sendToSW({ type: 'TRACKER_GET_ALL' }) || [];
    var sentRecords = records.filter(function(r) { return r.status === 'sent'; });
    if (sentRecords.length === 0) {
      addLog('没有状态为「已投递」的记录需要扫描', 'warn');
      return;
    }

    var tabs = await chrome.tabs.query({ url: '*://*.zhipin.com/web/geek/chat*' });
    var tab = tabs[0];
    if (!tab) {
      tab = await chrome.tabs.create({ url: 'https://www.zhipin.com/web/geek/chat' });
      await new Promise(function(r) { setTimeout(r, 4000); });
    } else {
      await chrome.tabs.update(tab.id, { url: 'https://www.zhipin.com/web/geek/chat', active: true });
      await new Promise(function(r) { setTimeout(r, 3000); });
    }

    var companyNames = sentRecords.map(function(r) { return r.company; }).filter(Boolean);

    var results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: function(targetCompanies) {
        var allLis = document.querySelectorAll('[class*="user-list"] li, [class*="conversation"] li, [class*="chat-list"] li');
        if (!allLis.length) {
          var chatPanel = document.querySelector('[class*="chat-panel"], [class*="user-list"], [class*="conversation-list"]');
          if (chatPanel) allLis = chatPanel.querySelectorAll('li');
        }
        var conversations = [];
        for (var i = 0; i < allLis.length; i++) {
          var li = allLis[i];
          var fullText = (li.innerText || li.textContent || '');
          if (fullText.length < 3) continue;
          var companyName = '';
          var titleEl = li.querySelector('[class*="name"], [class*="title"], [class*="company"]');
          if (titleEl) {
            companyName = (titleEl.innerText || titleEl.textContent || '').trim();
          } else {
            var lines = fullText.split(/\n/);
            companyName = (lines[0] || '').trim();
          }
          var previewEl = li.querySelector('[class*="preview"], [class*="last"], [class*="msg"], [class*="text"], [class*="abstract"]');
          var lastMsgText = previewEl ? (previewEl.innerText || previewEl.textContent || '').trim() : '';
          var badgeEl = li.querySelector('[class*="unread"], [class*="badge"], [class*="count"], [class*="dot"], .red-dot');
          var hasBadge = !!(badgeEl && badgeEl.offsetParent !== null);
          var fromHR = false;
          if (lastMsgText && lastMsgText.length > 2) {
            var bareMsg = lastMsgText.replace(/^(我|You|Me)\s*[:：]\s*/i, '');
            if (bareMsg && !bareMsg.startsWith('熟悉') && !bareMsg.startsWith('你好') && !bareMsg.startsWith('您好')) {
              fromHR = true;
            }
          }
          var matchedCompany = '';
          for (var j = 0; j < targetCompanies.length; j++) {
            var tc = targetCompanies[j].replace(/\s/g, '');
            var cn = companyName.replace(/\s/g, '');
            if (tc && cn && (cn.indexOf(tc) >= 0 || tc.indexOf(cn) >= 0)) {
              matchedCompany = targetCompanies[j];
              break;
            }
          }
          conversations.push({ name: companyName.slice(0, 40), lastMsg: lastMsgText.slice(0, 120), hasBadge: hasBadge, fromHR: fromHR, matchedCompany: matchedCompany });
        }
        return conversations;
      },
      args: [companyNames]
    });

    var conversations = (results && results[0] && results[0].result) || [];
    if (!conversations.length) { addLog('未找到任何会话', 'warn'); return; }
    addLog('找到 ' + conversations.length + ' 个会话', 'info');

    var updatedCount = 0;
    for (var ci = 0; ci < conversations.length; ci++) {
      var conv = conversations[ci];
      if (!conv.matchedCompany) continue;
      if (conv.fromHR || conv.hasBadge) {
        var matched = sentRecords.find(function(r) {
          return (r.company || '').replace(/\s/g, '') === conv.matchedCompany.replace(/\s/g, '');
        });
        if (matched) {
          var isRejection = conv.lastMsg.indexOf('不合适') >= 0 || conv.lastMsg.indexOf('不匹配') >= 0 || conv.lastMsg.indexOf('抱歉') >= 0;
          var newStatus = isRejection ? 'rejected' : 'replied';
          await sendToSW({ type: 'TRACKER_UPDATE_STATUS', recordId: matched.id, status: newStatus, hrReply: conv.lastMsg });
          updatedCount++;
          addLog('  ✅ ' + conv.name + ' → ' + (isRejection ? '不合适' : '已回复'), isRejection ? 'warn' : 'success');
        }
      }
    }

    if (updatedCount > 0) { addLog('自动更新了 ' + updatedCount + ' 条记录', 'success'); refreshTracker(); }
    else { addLog('没有找到匹配的回复', 'warn'); }

    var trackerBtn = document.querySelector('.tab-btn[data-tab="tab-tracker"]');
    if (trackerBtn) trackerBtn.click();
  } catch (e) { addLog('扫描失败：' + e.message, 'error'); }
});

// ═══════════════════════════════════
//  Tab 3: 数据分析
// ═══════════════════════════════════
async function refreshAnalytics() {
  var stats = await sendToSW({ type: 'ANALYTICS_GET' });
  if (!stats || stats.total === 0) {
    $('analyticsContent').innerHTML = '<div style="text-align:center;color:#999;padding:40px">暂无投递数据</div>';
    return;
  }

  $('statsGrid').innerHTML =
    '<div class="stat-card"><div class="stat-num blue">' + stats.total + '</div><div class="stat-label">总投递</div></div>' +
    '<div class="stat-card"><div class="stat-num green">' + stats.replyRate + '%</div><div class="stat-label">回复率</div></div>' +
    '<div class="stat-card"><div class="stat-num purple">' + stats.interviewRate + '%</div><div class="stat-label">面试率</div></div>' +
    '<div class="stat-card"><div class="stat-num green">' + stats.replied + '</div><div class="stat-label">已回复</div></div>' +
    '<div class="stat-card"><div class="stat-num red">' + stats.rejected + '</div><div class="stat-label">不合适</div></div>' +
    '<div class="stat-card"><div class="stat-num blue">' + stats.avgReplyHours + 'h</div><div class="stat-label">平均回复时间</div></div>';

  var maxSent = Math.max(1, maxVal(stats.dailyTrend, 'sent'));
  var chartHtml = '';
  stats.dailyTrend.forEach(function(d) {
    var sentH = Math.max(1, Math.round(d.sent / maxSent * 70));
    chartHtml += '<div class="chart-col"><div class="bar-wrap">'
      + '<div class="bar-sent" style="height:' + sentH + 'px" title="投递:' + d.sent + '"></div>'
      + '</div><div class="bar-date">' + d.date.slice(5) + '</div></div>';
  });
  $('dailyChart').innerHTML = chartHtml || '<div style="color:#999;font-size:11px">无数据</div>';

  var maxTag = Math.max(1, maxVal(stats.byTag, 'total'));
  var tagHtml = '';
  stats.byTag.forEach(function(t) {
    tagHtml += '<span class="rank-tag" title="投递' + t.total + '次, 回复' + t.replied + '次">' + t.tag + ' (' + t.total + '/' + t.replied + ')</span>';
  });
  $('tagRank').innerHTML = tagHtml || '<span style="color:#999">无数据</span>';

  var maxComp = Math.max(1, maxVal(stats.byCompany, 'total'));
  var compHtml = '';
  stats.byCompany.forEach(function(c) {
    compHtml += '<div class="rank-item"><span class="rank-name">' + esc(c.company) + '</span>'
      + '<div class="rank-bars"><div class="rank-bar-total" style="width:' + Math.round(c.total / maxComp * 100) + 'px"></div></div>'
      + '<span class="rank-num">投' + c.total + ' 回' + c.replied + '</span></div>';
  });
  $('companyRank').innerHTML = compHtml || '<span style="color:#999">无数据</span>';

  var tips = await sendToSW({ type: 'ANALYTICS_GREETING_TIPS' });
  if (tips && tips.topSkills && tips.topSkills.length > 0) {
    var tipHtml = '<p style="font-size:12px;color:#666;margin-bottom:8px"><strong>高回复率技能关键词：</strong></p>';
    tipHtml += tips.topSkills.map(function(s) { return '<span class="rank-tag">' + esc(s.skill) + ' (' + s.count + '次)</span>'; }).join(' ');
    $('greetingTips').innerHTML = tipHtml;
  }
}
function maxVal(arr, key) { var m = 0; arr.forEach(function(x) { if (x[key] > m) m = x[key]; }); return m; }

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
