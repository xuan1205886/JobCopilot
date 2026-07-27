// ===== BOSS search page content script =====
(function () {
  if (window.__bossToudiSearch) return;
  window.__bossToudiSearch = true;

  var sleep = function(ms) { return new Promise(function(r) { setTimeout(r, ms); }); };

  function getCards() { return Array.from(document.querySelectorAll(SELECTORS.jobs.jobCard)); }

  function cleanText(s) {
    if (!s) return "";
    var result = "";
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c >= 0xE000 && c <= 0xF8FF) continue;  // PUA (should not appear if innerText used)
      if (c >= 0xD800 && c <= 0xDFFF) { i++; continue; }
      if (c >= 0x200B && c <= 0x200F) continue;
      if (c === 0x2028 || c === 0x2029 || c === 0x202F) continue;
      if (c === 0xFEFF || c === 0x00AD) continue;
      if (c >= 0x00 && c <= 0x1F) continue;
      if (c >= 0x7F && c <= 0x9F) continue;
      if (c === 0xFFFC || c === 0xFFFD) continue;
      if (c >= 0xDB80 && c <= 0xDBBF && i + 1 < s.length) {
        var lo = s.charCodeAt(i + 1);
        if (lo >= 0xDC00 && lo <= 0xDFFF) { i++; continue; }
      }
      result += s.charAt(i);
    }
    return result.replace(/\s+/g, " ").trim();
  }

  function debugChars(s) {
    if (!s) return "(empty)";
    var parts = [];
    for (var i = 0; i < s.length; i++) {
      var cp = s.charCodeAt(i);
      var hex = cp.toString(16).toUpperCase();
      if (cp >= 0xD800 && cp <= 0xDBFF && i + 1 < s.length) {
        var lo = s.charCodeAt(i + 1);
        if (lo >= 0xDC00 && lo <= 0xDFFF) {
          parts.push("U+" + (((cp - 0xD800) * 0x400) + (lo - 0xDC00) + 0x10000).toString(16).toUpperCase());
          i++; continue;
        }
      }
      parts.push("U+" + hex.padStart(4, "0"));
    }
    return parts.join(" ");
  }

  function parseCard(card) {
    var nameEl = card.querySelector(SELECTORS.jobs.jobName);
    var salEl = card.querySelector(SELECTORS.jobs.jobSalary);
    var salary = "";
    if (salEl) {
      var rawText = salEl.innerText || salEl.textContent || "";  // innerText uses rendered font (BOSS PUA -> digits)
      salary = cleanText(rawText);
      if (!window._debugCount) window._debugCount = 0;
      if (window._debugCount < 3) {
        window._debugCount++;
        try { chrome.runtime.sendMessage({ type: "DEBUG_SALARY", text: "[" + window._debugCount + "] raw=" + JSON.stringify(rawText) + " clean=" + JSON.stringify(salary) + " HTML=" + salEl.innerHTML.slice(0, 120) + " | " + debugChars(rawText) }); } catch(e) {}
      }
      if (!salary || salary.length < 2) {
        var dataVal = salEl.getAttribute("data-salary") || salEl.getAttribute("data-value") || "";
        if (dataVal) salary = cleanText(dataVal);
      }
    }
    var linkEl = card.querySelector('a[href*="/job_detail/"]') || card.querySelector('a[ka][href]') || card.querySelector("a");
    var link = linkEl ? linkEl.href : "";
    var m = link.match(/job_detail\/([^.?]+)\.html/);
    var rawName = cleanText(nameEl ? nameEl.innerText || nameEl.textContent : "");
    var id = (m && m[1]) || (rawName + "|" + salary);
    var tagEls = card.querySelectorAll(SELECTORS.jobs.tagList);
    var tags = [];
    for (var ti = 0; ti < tagEls.length; ti++) {
      var t = cleanText(tagEls[ti].innerText || tagEls[ti].textContent);
      if (t) tags.push(t);
    }
    var company = "";
    var compEl = card.querySelector('.company-name a, .company-name, [class*="company-name"], .boss-info .company-name, .company-info a, [class*="company"] a');
    if (compEl) company = cleanText(compEl.innerText || compEl.textContent);
    return { id: id, name: rawName || "unknown", salary: salary, tags: tags, company: company, link: link };
  }

  async function scrape(count) {
    var seen = {};
    var jobs = [];
    var stall = 0;
    window._debugCount = 0;
    for (var loop = 0; loop < 40 && jobs.length < count && stall < 4; loop++) {
      var cards = getCards();
      var added = 0;
      for (var ci = 0; ci < cards.length; ci++) {
        var j = parseCard(cards[ci]);
        if (j.id && !seen[j.id]) { seen[j.id] = 1; jobs.push(j); added++; if (jobs.length >= count) break; }
      }
      if (added === 0) stall++; else stall = 0;
      if (jobs.length >= count) break;
      window.scrollTo(0, document.body.scrollHeight);
      var container = document.querySelector('.job-list-container, .job-list-box, [class*="job-list"]');
      if (container) container.scrollTop = container.scrollHeight;
      await sleep(1200);
    }
    return jobs.slice(0, count);
  }

  function findCardByJob(job) {
    var cards = getCards();
    for (var i = 0; i < cards.length; i++) { var j = parseCard(cards[i]); if (job.id && j.id === job.id) return cards[i]; }
    for (var i = 0; i < cards.length; i++) { var j = parseCard(cards[i]); if (j.name === job.name && (!job.company || j.company === job.company)) return cards[i]; }
    return null;
  }

  function waitFor(sel, timeout) {
    return new Promise(function(resolve) {
      var t0 = Date.now();
      var iv = setInterval(function() {
        var el = document.querySelector(sel);
        if (el && el.offsetParent !== null) { clearInterval(iv); resolve(el); }
        else if (Date.now() - t0 > timeout) { clearInterval(iv); resolve(null); }
      }, 200);
    });
  }

  function waitForTextInContainer(container, texts, timeout) {
    return new Promise(function(resolve) {
      var t0 = Date.now();
      var iv = setInterval(function() {
        var els = container.querySelectorAll("a, button, span, div");
        for (var i = 0; i < els.length; i++) {
          var tx = (els[i].textContent || "").trim();
          if (texts.indexOf(tx) >= 0 && els[i].offsetParent !== null) { clearInterval(iv); resolve(els[i]); return; }
        }
        if (Date.now() - t0 > timeout) { clearInterval(iv); resolve(null); }
      }, 200);
    });
  }

  function getDetailPanel() {
    return document.querySelector('.job-detail-box, .job-detail-wrapper, [class*="job-detail"], .detail-content, .chat-panel, .right-panel');
  }

  async function openJD(job) {
    var card = findCardByJob(job);
    if (!card) return { success: false, error: "card not found" };
    card.scrollIntoView({ block: "center" });
    await sleep(400);
    card.click();
    await sleep(1600);
    var jd = "";
    var det = getDetailPanel();
    if (det) jd = (det.innerText || det.textContent || "").trim();
    if (!jd) {
      var secs = document.querySelectorAll('.job-sec-text, [class*="job-sec"], [class*="job-desc"]');
      jd = Array.from(secs).map(function(s) { return (s.innerText || s.textContent || "").trim(); }).filter(Boolean).join("\n");
    }
    return { success: true, jd: jd.slice(0, 1800) };
  }

  async function goChat(job) {
    var card = findCardByJob(job);
    if (!card) return { success: false, error: "card not found" };
    var btn = card.querySelector('a.op-btn-chat, .btn-chat, [class*="chat-btn"], [class*="im-chat"]');
    if (!btn) { var panel = getDetailPanel(); var scope = panel || card; btn = scope.querySelector('a.op-btn-chat, .btn-chat, [class*="chat-btn"], [class*="im-chat"]'); }
    if (!btn) {
      var panel2 = getDetailPanel(); var scope2 = panel2 || card;
      var all = scope2.querySelectorAll("a, button, span");
      for (var i = 0; i < all.length; i++) {
        var tx = (all[i].textContent || "").trim();
        if (tx === "\u7acb\u5373\u6c9f\u901a" || tx === "\u7ee7\u7eed\u6c9f\u901a") { btn = all[i]; break; }
      }
    }
    if (!btn) { card.click(); await sleep(1500); var panel3 = getDetailPanel() || card; btn = panel3.querySelector('a.op-btn-chat, .btn-chat, [class*="chat-btn"]'); }
    if (!btn) return { success: false, error: "button not found" };
    btn.click(); await sleep(1500);
    var go = await waitForTextInContainer(document.body, ["\u7ee7\u7eed\u6c9f\u901a"], 4000);
    if (go) { go.click(); return { success: true, navigated: true }; }
    return { success: true, navigated: false };
  }

  chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    if (msg.type === "SCRAPE") { scrape(msg.count || 20).then(function(jobs) { sendResponse({ success: true, jobs: jobs }); }).catch(function(e) { sendResponse({ success: false, error: e.message }); }); return true; }
    if (msg.type === "OPEN_JD") { openJD(msg.job).then(function(r) { sendResponse(r); }).catch(function(e) { sendResponse({ success: false, error: e.message }); }); return true; }
    if (msg.type === "GO_CHAT" || msg.type === "INITIATE" || msg.type === "CREATE_CONV") { goChat(msg.job).then(function(r) { sendResponse(r); }).catch(function(e) { sendResponse({ success: false, error: e.message }); }); return true; }
  });
})();
