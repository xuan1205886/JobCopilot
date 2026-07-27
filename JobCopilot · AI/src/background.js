// ===== BOSS Service Worker =====
importScripts('/src/selectors.js', '/src/tracker.js');
const DS_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions';
const DS_MODEL = 'deepseek-chat';

const RESUME_TEXT = '';

let state = {
  phase: 'idle', paused: false, aborted: false,
  jobs: [], screened: [], greetings: {}, results: [], processed: {}
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});
try { chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {}); } catch (e) {}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rand = (a, b) => sleep(a + Math.random() * (b - a));
function log(text, level) { chrome.runtime.sendMessage({ type: 'LOG', text: text, level: level || 'info' }).catch(() => {}); }
function pushPhase() { chrome.runtime.sendMessage({ type: 'PHASE', phase: state.phase }).catch(() => {}); }
function progress(cur, total, label) { chrome.runtime.sendMessage({ type: 'PROGRESS', cur: cur, total: total, label: label || '' }).catch(() => {}); }
async function waitIfPaused() { while (state.paused && !state.aborted) await sleep(400); }
function getCfg() { return chrome.storage.local.get(['dsKey', 'resumeText', 'resumeImage', 'city', 'keyword', 'count']); }
function resumeFull(cfg) { return (cfg.resumeText || '').trim(); }
function jobInfo(j) { return '岗位：' + (j.name || '') + '\n技能标签：' + ((j.tags || []).join('、')) + '\n薪资：' + (j.salary || '') + '\n公司：' + (j.company || ''); }
function findJob(id) { for (var i = 0; i < state.jobs.length; i++) if (state.jobs[i].id === id) return state.jobs[i]; return null; }

async function callDS(messages, maxTokens) {
  const cfg = await getCfg();
  if (!cfg.dsKey) throw new Error('no API key');
  const resp = await fetch(DS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.dsKey },
    body: JSON.stringify({ model: DS_MODEL, messages: messages, max_tokens: maxTokens || 500, temperature: 0.5 })
  });
  if (!resp.ok) { const t = await resp.text().catch(() => ''); throw new Error('DS ' + resp.status + ': ' + t.slice(0, 120)); }
  const data = await resp.json();
  return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
}

async function screenJob(cfg, job) {
  const sys = '你是资深求职助手。请完全依据下面提供的【求职者简历】，判断某个岗位是否值得该求职者投递。\n【判断标准·适中】保留(match=true)：岗位方向与求职者简历的专业/技能/经历相关，且求职者的经验年限、学历、级别够得着该岗位（不超纲）。剔除(match=false)：方向与简历明显无关；岗位要求的经验/学历/硬技能明显超出简历；岗位级别明显高于求职者当前水平。请依据简历本身判断，不要套用任何固定行业或级别。\n【输出】只输出一个JSON对象，不要markdown：{"match":true或false,"reason":"一句话理由"}';
  const user = '求职者简历：\n' + resumeFull(cfg) + '\n\n待判断岗位：\n' + jobInfo(job) + '\n\n严格输出JSON。';
  const raw = await callDS([{ role: 'system', content: sys }, { role: 'user', content: user }], 200);
  let p = null;
  try { p = JSON.parse(raw); } catch (e) { const m = raw && raw.match(/\{[\s\S]*\}/); if (m) { try { p = JSON.parse(m[0]); } catch (e2) {} } }
  if (!p) return { match: false, reason: 'AI parse fail' };
  return { match: p.match === true, reason: p.reason || '' };
}

async function genGreetingFromJD(cfg, job, jd) {
  const sys = '你是求职者本人，在BOSS直聘给HR发招呼语。回复会原样发给HR，严禁任何注释、说明、括号备注、字数统计或引导语。\n【格式】1.开头前15字必须是"熟悉XXX、XXX"(填该JD要求且你简历具备的核心技能1-2个)。2.紧接"做过XXX"说明简历里与该岗位相关的具体项目/经历。3.全文80-120字，真诚自然。';
  const jdText = (jd && jd.trim()) ? jd.trim() : ('技能标签：' + (job.tags || []).join('、'));
  const user = '我的简历：\n' + resumeFull(cfg) + '\n\n目标岗位：' + (job.name || '') + (job.company ? ('（' + job.company + '）') : '') + '\n该岗位JD：\n' + jdText + '\n\n请按格式生成一段招呼语，开头必须"熟悉…"，直接输出招呼语本身，不要任何多余内容。';
  const raw = await callDS([{ role: 'system', content: sys }, { role: 'user', content: user }], 300);
  return (raw || '').trim();
}

async function ensureInjected(tabId, file) {
  try { await chrome.scripting.executeScript({ target: { tabId: tabId }, files: ['src/selectors.js', file] }); } catch (e) {}
}
function sendToTab(tabId, msg) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, msg, (resp) => {
      if (chrome.runtime.lastError) resolve({ success: false, error: chrome.runtime.lastError.message });
      else resolve(resp || { success: false, error: 'no response' });
    });
  });
}
function waitTabComplete(tabId) {
  return new Promise((resolve) => {
    function lis(id, info) { if (id === tabId && info.status === 'complete') { chrome.tabs.onUpdated.removeListener(lis); setTimeout(resolve, 1200); } }
    chrome.tabs.onUpdated.addListener(lis);
    chrome.tabs.get(tabId, (t) => { if (t && t.status === 'complete') { chrome.tabs.onUpdated.removeListener(lis); setTimeout(resolve, 1200); } });
  });
}
function resolveCity(cfg) {
  const firstCity = (cfg.city || '').split(/[\/、,，\s]+/)[0].replace(/[市省]$/, '') || '';
  const code = (typeof CITY_MAP !== 'undefined' && CITY_MAP[firstCity]) || '100010000';
  return { name: firstCity, code: code, found: code !== '100010000' || firstCity === '全国' };
}
function buildSearchUrl(cfg) {
  const c = resolveCity(cfg);
  const params = new URLSearchParams({ query: cfg.keyword || '', city: c.code });
  return 'https://www.zhipin.com/web/geek/jobs?' + params.toString();
}
async function ensureTab(url) {
  let tabs = await chrome.tabs.query({ url: '*://*.zhipin.com/*' });
  let tab = tabs[0];
  if (!tab) tab = await chrome.tabs.create({ url: url });
  else await chrome.tabs.update(tab.id, { url: url });
  await waitTabComplete(tab.id);
  await sleep(2000);
  return tab;
}
async function getSearchTab(cfg) { return ensureTab(buildSearchUrl(cfg)); }
function curUrl(tabId) { return new Promise(res => chrome.tabs.get(tabId, t => res((t && t.url) || ''))); }

// ── Collect + Screen ──
async function runCollect() {
  state.aborted = false; state.paused = false;
  state.jobs = []; state.screened = []; state.greetings = {}; state.results = [];
  state.phase = 'collecting'; pushPhase();
  const cfg = await getCfg();
  if (!cfg.dsKey) { log('请先填写 DeepSeek API Key', 'error'); state.phase = 'idle'; pushPhase(); return; }
  if (!cfg.keyword) { log('请先填写岗位关键词', 'error'); state.phase = 'idle'; pushPhase(); return; }
  if (!(cfg.resumeText || '').trim()) { log('请先填写简历文字', 'error'); state.phase = 'idle'; pushPhase(); return; }

  const _c = resolveCity(cfg);
  log('打开搜索页：' + cfg.keyword + ' | ' + (_c.found ? _c.name : '全国'));
  const tab = await getSearchTab(cfg);
  const count = parseInt(cfg.count) || 20;

  log('收集中（目标 ' + count + '）...');
  await ensureInjected(tab.id, 'src/content-search.js');
  const r = await sendToTab(tab.id, { type: 'SCRAPE', count: count });
  if (!r || !r.success) { log('收集失败：' + (r && r.error), 'error'); state.phase = 'idle'; pushPhase(); return; }
  state.jobs = r.jobs || [];
  log('收集到 ' + state.jobs.length + ' 个岗位', 'success');
  if (!state.jobs.length) { state.phase = 'idle'; pushPhase(); return; }

  state.phase = 'screening'; pushPhase();
  log('AI 筛选中...');
  let done = 0; const total = state.jobs.length;
  progress(0, total, '筛选');
  const CONC = 3;
  for (let i = 0; i < state.jobs.length; i += CONC) {
    if (state.aborted) break; await waitIfPaused();
    const batch = state.jobs.slice(i, i + CONC);
    await Promise.all(batch.map(async (job) => {
      let res;
      try { res = await screenJob(cfg, job); }
      catch (e) { res = { match: false, reason: 'error:' + e.message }; }
      state.screened.push(Object.assign({}, job, { match: res.match, reason: res.reason }));
      done++; progress(done, total, '筛选');
    }));
  }
  const matched = state.screened.filter(j => j.match).length;
  log('筛选完成：匹配 ' + matched + ' / ' + total, 'success');
  await chrome.storage.local.set({ sw_jobs: state.jobs, sw_greetings: state.greetings, sw_screened: state.screened });
  state.phase = 'review'; pushPhase();
  chrome.runtime.sendMessage({ type: 'SCREENED', screened: state.screened }).catch(() => {});
}

// ── Deliver ──
async function runDeliver(jobIds) {
  state.aborted = false; state.paused = false; state.results = [];
  state.phase = 'delivering'; pushPhase();
  if (!state.jobs.length) { const d = await chrome.storage.local.get(['sw_jobs', 'sw_greetings']); state.jobs = d.sw_jobs || []; state.greetings = d.sw_greetings || {}; }
  const cfg = await getCfg();
  if (!cfg.resumeImage) log('未上传简历图片，将只发招呼语', 'warn');

  const ids = (jobIds || []).filter(id => !state.processed[id]);
  if (!ids.length) { log('没有可投递的岗位', 'warn'); finishDeliver(); return; }
  const searchUrl = buildSearchUrl(cfg);

  for (let k = 0; k < ids.length; k++) {
    if (state.aborted) break; await waitIfPaused();
    const job = findJob(ids[k]);
    if (!job) { log('[' + (k + 1) + '/' + ids.length + '] 找不到岗位，跳过', 'warn'); continue; }
    log('[' + (k + 1) + '/' + ids.length + '] ' + job.name + ' - ' + (job.company || ''));

    const tab = await ensureTab(searchUrl);
    await ensureInjected(tab.id, 'src/content-search.js');
    log('  读取JD...');
    const jdr = await sendToTab(tab.id, { type: 'OPEN_JD', job: job });
    const jd = (jdr && jdr.jd) || '';

    log('  生成招呼语...');
    let greeting = '';
    try { greeting = await genGreetingFromJD(cfg, job, jd); } catch (e) { log('  生成失败：' + e.message, 'error'); }
    if (!greeting) { recordFail(job, '招呼语生成失败'); log('  招呼语为空，跳过', 'warn'); progress(k + 1, ids.length, '投递'); continue; }
    state.greetings[job.id] = greeting;

    // Click "立即沟通" -> "继续沟通"
    log('  建立联系...');
    const goRes = await sendToTab(tab.id, { type: 'GO_CHAT', job: job });
    await sleep(2000);

    // Chat tab detection: could be current tab navigated OR new tab opened
    let chatTab = null;
    const u = await curUrl(tab.id);
    if (u.indexOf('/web/geek/chat') >= 0) {
      chatTab = tab;
    } else {
      // Check all tabs for a chat page (BOSS might open chat in a new tab)
      const allTabs = await chrome.tabs.query({ url: '*://*.zhipin.com/web/geek/chat*' });
      if (allTabs.length > 0) {
        chatTab = allTabs[0];
        await chrome.tabs.update(chatTab.id, { active: true });
        await sleep(1500);
      }
    }
    if (!chatTab) { recordFail(job, '未进入聊天页'); log('  未进入聊天页，跳过', 'error'); progress(k + 1, ids.length, '投递'); continue; }
    await waitTabComplete(chatTab.id);
    await ensureInjected(chatTab.id, 'src/content-chat.js');
    log('  发简历 + 招呼语...');
    const r = await sendToTab(chatTab.id, { type: 'SEND_ACTIVE', image: cfg.resumeImage || '', greeting: greeting, company: job.company || '' });
    if (r && r.success) { recordOk(job); state.processed[job.id] = 1; await chrome.storage.local.set({ processed: state.processed }); log('  ✓ 成功', 'success'); }
    else { recordFail(job, (r && r.error) || '发送失败'); log('  失败：' + (r && r.error), 'error'); }
    progress(k + 1, ids.length, '投递');
    await rand(2500, 4500);
  }
  finishDeliver();
}
function recordOk(job) {
  state.results.push({ id: job.id, name: job.name, ok: true });
  const greeting = state.greetings[job.id] || '';
  Tracker.add(job, greeting, 'default').catch(() => {});
}
function recordFail(job, msg) { state.results.push({ id: job.id, name: job.name, ok: false, msg: msg }); }
function finishDeliver() {
  const ok = state.results.filter(r => r.ok).length;
  const fail = state.results.length - ok;
  state.phase = 'done'; pushPhase();
  log('投递完成：成功 ' + ok + ' | 失败 ' + fail, 'success');
  chrome.runtime.sendMessage({ type: 'DONE', ok: ok, fail: fail }).catch(() => {});
}

// ── Messages ──
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'DEBUG_SALARY') { log(msg.text, 'info'); return; }
  if (msg.type === 'START_COLLECT') { runCollect(); sendResponse({ ok: true }); return; }
  if (msg.type === 'START_DELIVER') { runDeliver(msg.jobIds); sendResponse({ ok: true }); return; }
  if (msg.type === 'PAUSE') { state.paused = true; log('已暂停', 'warn'); sendResponse({ ok: true }); return; }
  if (msg.type === 'RESUME') { state.paused = false; log('继续', 'info'); sendResponse({ ok: true }); return; }
  if (msg.type === 'STOP') { state.aborted = true; state.paused = false; log('已停止', 'warn'); state.phase = 'idle'; pushPhase(); sendResponse({ ok: true }); return; }
  if (msg.type === 'RESET') { state.processed = {}; chrome.storage.local.set({ processed: {} }); state.jobs = []; state.screened = []; state.greetings = {}; state.results = []; state.phase = 'idle'; pushPhase(); log('已重置', 'warn'); sendResponse({ ok: true }); return; }
  if (msg.type === 'GET_STATE') { sendResponse({ phase: state.phase, screened: state.screened }); return; }
  if (msg.type === 'TRACKER_GET_ALL') { Tracker.getAll().then(r => sendResponse(r)).catch(() => sendResponse([])); return true; }
  if (msg.type === 'TRACKER_UPDATE_STATUS') { Tracker.updateStatus(msg.recordId, msg.status, msg.hrReply).then(r => sendResponse(r)).catch(() => sendResponse(null)); return true; }
  if (msg.type === 'TRACKER_REMOVE') { Tracker.remove(msg.recordId).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false })); return true; }
  if (msg.type === 'TRACKER_EXPORT') { Tracker.exportCSV().then(r => sendResponse(r)).catch(() => sendResponse('')); return true; }
  if (msg.type === 'TRACKER_CLEAR') { Tracker.clearAll().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false })); return true; }
  if (msg.type === 'ANALYTICS_GET') { Analytics.getStats().then(r => sendResponse(r)).catch(() => sendResponse(null)); return true; }
  if (msg.type === 'ANALYTICS_GREETING_TIPS') { Analytics.getGreetingRecommendations().then(r => sendResponse(r)).catch(() => sendResponse(null)); return true; }
  if (msg.type === 'RESUME_GET_ALL') { ResumeManager.getAll().then(r => sendResponse(r)).catch(() => sendResponse([])); return true; }
  if (msg.type === 'RESUME_ADD') { ResumeManager.add(msg.name, msg.text).then(r => sendResponse(r)).catch(() => sendResponse([])); return true; }
  if (msg.type === 'RESUME_UPDATE') { ResumeManager.update(msg.id, msg.name, msg.text).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false })); return true; }
  if (msg.type === 'RESUME_REMOVE') { ResumeManager.remove(msg.id).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false })); return true; }
  if (msg.type === 'SCAN_REPLIES') {
    const updates = msg.replies || [];
    if (updates.length > 0) { Tracker.batchUpdateStatus(updates).then(n => sendResponse({ updated: n })).catch(() => sendResponse({ updated: 0 })); }
    else { sendResponse({ updated: 0 }); }
    return true;
  }
});

chrome.storage.local.get('processed').then(r => { if (r.processed) state.processed = r.processed; });
