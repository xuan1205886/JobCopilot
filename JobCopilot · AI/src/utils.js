// ===== 通用纯函数：城市清洗与匹配（浏览器 content script / service worker 与 Node 测试共用） =====
(function (global) {
  // "深圳·南山区" / "深圳-南山区" / "深圳 南山区" / "深圳市" -> "深圳"
  function cityFromArea(text) {
    if (!text) return '';
    var first = String(text).split(/[·\-—\s/｜|，,、]+/)[0];
    return (first || '').replace(/[市省]$/, '').trim();
  }

  // 岗位城市是否匹配目标城市；任一方为空则不拦截（避免因提取失败误伤）
  function cityMatches(jobCity, targetCity) {
    if (!jobCity || !targetCity) return true;
    var a = String(jobCity).replace(/\s/g, '');
    var b = String(targetCity).replace(/\s/g, '');
    return a.indexOf(b) >= 0 || b.indexOf(a) >= 0;
  }

  var U = { cityFromArea: cityFromArea, cityMatches: cityMatches };
  global.Utils = U;
  if (typeof module !== 'undefined' && module.exports) module.exports = U;
})(typeof self !== 'undefined' ? self : this);
