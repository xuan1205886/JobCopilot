// ===== 聊天页 content script：打开会话 + 先发图片 + 再发招呼语 =====
(function () {
  if (window.__bossToudiChat) return;
  window.__bossToudiChat = true;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // 多选择器找第一个可见元素
  function findVisible(selList) {
    for (const sel of selList) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        if (el && (el.offsetParent !== null || getComputedStyle(el).position === 'fixed')) return el;
      }
    }
    return null;
  }
  async function waitVisible(selList, timeout) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const el = findVisible(selList);
      if (el) return el;
      await sleep(250);
    }
    return null;
  }

  const INPUT_SELS = ['div#chat-input', '#chat-input', 'div.chat-input', '.chat-input[contenteditable]', '[contenteditable="true"]', 'textarea.input-area', '.chat-editor textarea', 'textarea[placeholder]', 'textarea'];
  const SEND_SELS = ['button.btn-send', '.btn-send', 'button[class*="send"]', '[class*="send-btn"]'];
  const IMG_SELS = ['.btn-sendimg input[type=file]', '.toolbar input[type=file]', 'input[type=file]'];

  // 诊断dump
  function dumpInputs() {
    const out = [];
    document.querySelectorAll('[contenteditable="true"], textarea, div[id*="input"], div[class*="input"]').forEach((el, i) => {
      if (i < 8) out.push(el.tagName + '#' + (el.id || '') + '.' + (typeof el.className === 'string' ? el.className.slice(0, 40) : ''));
    });
    return out.join(' | ') || '无可编辑元素';
  }

  function dataURLtoFile(dataUrl, name) {
    const parts = dataUrl.split(',');
    const mime = parts[0].match(/:(.*?);/)[1];
    const bin = atob(parts[1]);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new File([arr], name || 'resume.png', { type: mime });
  }

  async function openConversation(company, hrName, position) {
    await waitVisible([SELECTORS.chat.userList], 8000);
    const items = Array.from(document.querySelectorAll(SELECTORS.chat.userList));
    if (!items.length) return { ok: false, err: '会话列表为空' };
    let target = null;
    const ck = (company || '').replace(/\s/g, '');
    const hk = (hrName || '').replace(/\s/g, '');
    const pk = (position || '').replace(/\s/g, '');
    for (const li of items) {
      const tx = (li.textContent || '').replace(/\s/g, '');
      if (ck && tx.indexOf(ck) >= 0) { target = li; break; }
      if (pk && tx.indexOf(pk) >= 0) { target = li; break; }
      if (hk && tx.indexOf(hk) >= 0) { target = li; break; }
    }
    // 找不到匹配的会话时不兜底——宁可不发，不能发错人
    if (!target) return { ok: false, err: '未找到目标会话（公司:' + (company || '?') + ' 岗位:' + (position || '?') + '）' };
    target.click();
    await sleep(1600);
    return { ok: true };
  }

  async function sendImage(image) {
    if (!image) return true;
    const input = findVisible(IMG_SELS) || document.querySelector('input[type=file]');
    if (!input) return false;
    const file = dataURLtoFile(image, 'resume.png');
    const dt = new DataTransfer();
    dt.items.add(file);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'files').set;
    setter.call(input, dt.files);
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(2500);
    return true;
  }

  function inputText(el) { return (el.isContentEditable || el.getAttribute('contenteditable') === 'true') ? (el.textContent || '') : (el.value || ''); }

  function pressEnter(el) {
    const opt = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent('keydown', opt));
    el.dispatchEvent(new KeyboardEvent('keypress', opt));
    el.dispatchEvent(new KeyboardEvent('keyup', opt));
  }

  async function sendText(greeting) {
    const input = await waitVisible(INPUT_SELS, 8000);
    if (!input) return { ok: false, err: '未找到输入框｜页面候选：' + dumpInputs() };
    input.focus();
    await sleep(300);
    const editable = input.isContentEditable || input.getAttribute('contenteditable') === 'true';
    if (editable) {
      input.textContent = greeting;
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: greeting }));
    } else {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(input, greeting);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await sleep(700);
    if (!inputText(input).trim()) return { ok: false, err: '文字未填入输入框' };

    const before = document.querySelectorAll(SELECTORS.chat.messageSent).length;
    pressEnter(input);
    const btn = findVisible(SEND_SELS);
    if (btn && !btn.classList.contains('disabled') && !btn.disabled) btn.click();

    for (let i = 0; i < 12; i++) {
      await sleep(300);
      const cleared = !inputText(input).trim();
      const after = document.querySelectorAll(SELECTORS.chat.messageSent).length;
      if (cleared || after > before) return { ok: true };
    }
    return { ok: false, err: '发送未确认' };
  }

  async function doSend(msg) {
    const oc = await openConversation(msg.company, msg.hrName, msg.position);
    if (!oc.ok) return { success: false, error: oc.err };
    const imgOk = await sendImage(msg.image);
    await sleep(800);
    const tr = await sendText(msg.greeting);
    if (!tr.ok) return { success: false, error: tr.err };
    return { success: true, imageOk: imgOk };
  }

  // 发给当前已打开的会话（点"继续沟通"跳转后，BOSS通常直接进入目标会话）
  // 不再盲点第一个会话——如果输入框隐藏在会话列表后，尝试匹配目标公司
  async function sendActive(image, greeting, company) {
    let input = await waitVisible(INPUT_SELS, 6000);
    if (!input) {
      // 不在目标聊天页：尝试在会话列表中找到匹配的会话
      const items = document.querySelectorAll(SELECTORS.chat.userList);
      if (items.length > 0) {
        let found = null;
        const ck = (company || '').replace(/\s/g, '');
        for (const li of items) {
          if (ck && (li.textContent || '').replace(/\s/g, '').indexOf(ck) >= 0) { found = li; break; }
        }
        // 找不到匹配的不兜底——宁愿跳过也不发错人
        if (found) {
          found.click();
          await sleep(1500);
          input = await waitVisible(INPUT_SELS, 6000);
        }
      }
    }
    if (!input) return { success: false, error: '未找到输入框（可能不在目标聊天页）｜' + dumpInputs() };
    const imgOk = await sendImage(image);
    await sleep(800);
    const tr = await sendText(greeting);
    if (!tr.ok) return { success: false, error: tr.err };
    return { success: true, imageOk: imgOk };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'SEND') {
      doSend(msg).then(r => sendResponse(r)).catch(e => sendResponse({ success: false, error: e.message }));
      return true;
    }
    if (msg.type === 'SEND_ACTIVE') {
      sendActive(msg.image, msg.greeting, msg.company).then(r => sendResponse(r)).catch(e => sendResponse({ success: false, error: e.message }));
      return true;
    }
  });
})();
