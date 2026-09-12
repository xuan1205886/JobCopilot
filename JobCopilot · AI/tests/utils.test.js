const assert = require('assert');
const U = require('../src/utils.js');

// cityFromArea
assert.strictEqual(U.cityFromArea('深圳·南山区'), '深圳');
assert.strictEqual(U.cityFromArea('深圳-福田区'), '深圳');
assert.strictEqual(U.cityFromArea('上海市·浦东新区'), '上海');
assert.strictEqual(U.cityFromArea('北京市'), '北京');
assert.strictEqual(U.cityFromArea('上海'), '上海');
assert.strictEqual(U.cityFromArea(''), '');
assert.strictEqual(U.cityFromArea(null), '');

// cityMatches
assert.strictEqual(U.cityMatches('深圳', '深圳'), true);
assert.strictEqual(U.cityMatches('深圳市', '深圳'), true);
assert.strictEqual(U.cityMatches('深圳', '沈阳市'), false);
assert.strictEqual(U.cityMatches('', '深圳'), true);   // 提取失败不拦截
assert.strictEqual(U.cityMatches('深圳', ''), true);
assert.strictEqual(U.cityMatches('上海', '北京'), false);

console.log('✓ utils.js 全部测试通过');
