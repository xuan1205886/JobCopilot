// ===== 搜索页 content script：收集岗位 + 建立联系（立即沟通→继续沟通跳聊天页）=====
(function () {
  if (window.__bossToudiSearch) return;
  window.__bossToudiSearch = true;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function getCards() { return Array.from(document.querySelectorAll(SELECTORS.jobs.jobCard)); }

  // 清洗文本：去掉图标字体私用区字符、零宽字符、控制字符（修复薪资显示正方体）
  function cleanText(s) {
    return (s || '').replace(/[-​-‏ -  ﻿]/g, '').replace(/\s+/g, ' ').trim();
  }

  function parseCard(card) {
    const nameEl = card.querySelector(SELECTORS.jobs.jobName);
    const salEl = card.querySelector(SELECTORS.jobs.jobSalary);
    const linkEl = card.querySelector('a[href*="/job_detail/"]') || card.querySelector('a[ka][href]') || card.querySelector('a');
    const link = linkEl ? linkEl.href : '';
    const m = link.match(/job_detail\/([^.?]+)\.html/);
    const id = (m && m[1]) || ((nameEl ? cleanText(nameEl.textContent) : '') + '|' + (salEl ? cleanText(salEl.textContent) : ''));
    const tags = Array.from(card.querySelectorAll(SELECTORS.jobs.tagList)).map(t => cleanText(t.textContent)).filter(Boolean);
    let company = '';
    const compEl = card.querySelector('.company-name a, .company-name, [class*="company-name"], .boss-info .company-name, .company-info a, [class*="company"] a');
    if (compEl) company = cleanText(compEl.textContent);
    return {
      id: id,
      name: nameEl ? cleanText(nameEl.textContent) : '未知岗位',
      salary: salEl ? cleanText(salEl.textContent) : '',
      tags: tags,
      company: company,
      link: link
    };
  }

  async function scrape(count) {
    const seen = {};
    const jobs = [];
    let stall = 0;
    for (let loop = 0; loop < 40 && jobs.length < count && stall < 4; loop++) {
      const cards = getCards();
      let added = 0;
      for (const c of cards) {
        const j = parseCard(c);
        if (j.id && !seen[j.id]) { seen[j.id] = 1; jobs.push(j); added++; if (jobs.length >= count) break; }
      }
      if (added === 0) stall++; else stall = 0;
      if (jobs.length >= count) break;
      window.scrollTo(0, document.body.scrollHeight);
      const container = document.querySelector('.job-list-container, .job-list-box, [class*="job-list"]');
      if (container) container.scrollTop = container.scrollHeight;
      await sleep(1200);
    }
    return jobs.slice(0, count);
  }

  function findCardByJob(job) {
    const cards = getCards();
    for (const c of cards) { const j = parseCard(c); if (job.id && j.id === job.id) return c; }
    for (const c of cards) { const j = parseCard(c); if (j.name === job.name && (!job.company || j.company === job.company)) return c; }
    return null;
  }

  function waitFor(sel, timeout) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) { clearInterval(iv); resolve(el); }
        else if (Date.now() - t0 > timeout) { clearInterval(iv); resolve(null); }
      }, 200);
    });
  }

  // 等待文字匹配的可见元素（限定在指定容器内查找）
  function waitForTextInContainer(container, texts, timeout) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        const els = container.querySelectorAll('a, button, span, div');
        for (const el of els) {
          const tx = (el.textContent || '').trim();
          if (texts.indexOf(tx) >= 0 && el.offsetParent !== null) { clearInterval(iv); resolve(el); return; }
        }
        if (Date.now() - t0 > timeout) { clearInterval(iv); resolve(null); }
      }, 200);
    });
  }

  // 获取当前右侧详情面板
  function getDetailPanel() {
    return document.querySelector('.job-detail-box, .job-detail-wrapper, [class*="job-detail"], .detail-content, .chat-panel, .right-panel');
  }

  // 点开卡片 → 抓取右侧详情面板的完整JD
  async function openJD(job) {
    const card = findCardByJob(job);
    if (!card) return { success: false, error: '未找到岗位卡片' };
    card.scrollIntoView({ block: 'center' });
    await sleep(400);
    card.click();
    await sleep(1600);
    let jd = '';
    const det = getDetailPanel();
    if (det) jd = (det.innerText || '').trim();
    if (!jd) {
      const secs = document.querySelectorAll('.job-sec-text, [class*="job-sec"], [class*="job-desc"]');
      jd = Array.from(secs).map(s => (s.innerText || '').trim()).filter(Boolean).join('\n');
    }
    return { success: true, jd: jd.slice(0, 1800) };
  }

  // 卡片已打开 → 局限在详情面板内找按钮 → 弹窗点"继续沟通"（跳转聊天页）
  async function goChat(job) {
    // 先确保卡片打开了
    const card = findCardByJob(job);
    if (!card) return { success: false, error: '未找到岗位卡片' };

    // 只在该岗位的卡片内查找，避免命中其他岗位的按钮
    let btn = card.querySelector('a.op-btn-chat, .btn-chat, [class*="chat-btn"], [class*="im-chat"]');
    if (!btn) {
      // 卡片可能已打开到右面板，限定在详情面板内搜索
      const panel = getDetailPanel();
      const scope = panel || card;
      btn = scope.querySelector('a.op-btn-chat, .btn-chat, [class*="chat-btn"], [class*="im-chat"]');
    }
    if (!btn) {
      // 最后兜底：仍限定在卡片或详情面板内搜索文字
      const panel = getDetailPanel();
      const scope = panel || card;
      const all = scope.querySelectorAll('a, button, span');
      for (const el of all) {
        const tx = (el.textContent || '').trim();
        if (tx === '立即沟通' || tx === '继续沟通') { btn = el; break; }
      }
    }
    if (!btn) {
      // 面板可能被关了，重开然后等面板加载
      card.click(); await sleep(1500);
      const panel2 = getDetailPanel() || card;
      btn = panel2.querySelector('a.op-btn-chat, .btn-chat, [class*="chat-btn"]');
    }
    if (!btn) return { success: false, error: '未在目标卡片内找到立即沟通按钮' };

    btn.click();
    await sleep(1500);
    const go = await waitForTextInContainer(document.body, ['继续沟通'], 4000);
    if (go) { go.click(); return { success: true, navigated: true }; }
    return { success: true, navigated: false };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'SCRAPE') {
      scrape(msg.count || 20).then(jobs => sendResponse({ success: true, jobs: jobs })).catch(e => sendResponse({ success: false, error: e.message }));
      return true;
    }
    if (msg.type === 'OPEN_JD') {
      openJD(msg.job).then(r => sendResponse(r)).catch(e => sendResponse({ success: false, error: e.message }));
      return true;
    }
    if (msg.type === 'GO_CHAT' || msg.type === 'INITIATE' || msg.type === 'CREATE_CONV') {
      goChat(msg.job).then(r => sendResponse(r)).catch(e => sendResponse({ success: false, error: e.message }));
      return true;
    }
  });
})();
