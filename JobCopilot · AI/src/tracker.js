// ===== 投递追踪模块：记录、状态管理、统计分析 =====
// 存储 key: 'app_tracker_v1'
// 每个投递记录就是一个 ApplicationRecord

/**
 * @typedef {Object} ApplicationRecord
 * @property {string}   id          - 唯一ID（jobId + 时间戳）
 * @property {string}   jobId       - BOSS岗位ID
 * @property {string}   jobName     - 岗位名称
 * @property {string}   company     - 公司名
 * @property {string}   salary      - 薪资
 * @property {string[]} tags        - 技能标签
 * @property {string}   city        - 城市
 * @property {string}   greeting    - 发送的打招呼语
 * @property {string}   resumeVer   - 使用的简历版本
 * @property {string}   status      - 'sent' | 'read' | 'replied' | 'interview' | 'rejected' | 'expired'
 * @property {string}   hrReply     - HR回复内容（如有）
 * @property {number}   appliedAt   - 投递时间戳
 * @property {number}   repliedAt   - 回复时间戳（如有）
 * @property {string}   notes       - 备注
 */

const TRACKER_KEY = 'app_tracker_v1';
const RESUME_VERSIONS_KEY = 'app_resume_versions_v1';

// ===== 状态枚举 =====
const APP_STATUS = {
  SENT:      { key: 'sent',      label: '已投递',   color: '#00a0e9', icon: '📤' },
  READ:      { key: 'read',      label: 'HR已读',   color: '#e8830c', icon: '👁'  },
  REPLIED:   { key: 'replied',   label: '已回复',   color: '#27ae60', icon: '💬' },
  INTERVIEW: { key: 'interview', label: '约面试',   color: '#8e44ad', icon: '🎯' },
  REJECTED:  { key: 'rejected',  label: '不合适',   color: '#c92a2a', icon: '✗'  },
  EXPIRED:   { key: 'expired',   label: '已过期',   color: '#888888', icon: '⏰' }
};

// ===== CRUD =====
const Tracker = {
  /** 获取所有记录 */
  async getAll() {
    const data = await chrome.storage.local.get(TRACKER_KEY);
    return (data[TRACKER_KEY] || []).sort((a, b) => b.appliedAt - a.appliedAt);
  },

  /** 保存所有记录 */
  async saveAll(records) {
    await chrome.storage.local.set({ [TRACKER_KEY]: records });
  },

  /** 添加一条投递记录 */
  async add(job, greeting, resumeVer) {
    const records = await this.getAll();
    // 去重：同一 jobId + 同一天不重复添加
    const today = new Date().toDateString();
    const dup = records.find(r => r.jobId === job.id && new Date(r.appliedAt).toDateString() === today);
    if (dup) return dup;

    const record = {
      id:        job.id + '_' + Date.now(),
      jobId:     job.id || '',
      jobName:   job.name || '',
      company:   job.company || '',
      salary:    job.salary || '',
      tags:      job.tags || [],
      city:      job.city || '',
      greeting:  greeting || '',
      resumeVer: resumeVer || 'default',
      status:    'sent',
      hrReply:   '',
      appliedAt: Date.now(),
      repliedAt: null,
      notes:     ''
    };
    records.push(record);
    await this.saveAll(records);
    return record;
  },

  /** 更新记录状态 */
  async updateStatus(recordId, newStatus, hrReply) {
    const records = await this.getAll();
    const idx = records.findIndex(r => r.id === recordId);
    if (idx === -1) return null;
    records[idx].status = newStatus;
    if (hrReply !== undefined) records[idx].hrReply = hrReply;
    if (newStatus !== 'sent' && !records[idx].repliedAt) {
      records[idx].repliedAt = Date.now();
    }
    await this.saveAll(records);
    return records[idx];
  },

  /** 批量更新状态（用于从BOSS页面检测回复） */
  async batchUpdateStatus(updates) {
    // updates: [{jobId, status, hrReply}]
    const records = await this.getAll();
    let changed = 0;
    updates.forEach(u => {
      const r = records.find(r => r.jobId === u.jobId && r.status === 'sent');
      if (r) {
        r.status = u.status;
        if (u.hrReply) r.hrReply = u.hrReply;
        r.repliedAt = Date.now();
        changed++;
      }
    });
    if (changed > 0) await this.saveAll(records);
    return changed;
  },

  /** 删除记录 */
  async remove(recordId) {
    let records = await this.getAll();
    records = records.filter(r => r.id !== recordId);
    await this.saveAll(records);
  },

  /** 检查是否已投递（同一天同一岗位） */
  async isDuplicated(jobId) {
    const records = await this.getAll();
    const today = new Date().toDateString();
    return records.some(r => r.jobId === jobId && new Date(r.appliedAt).toDateString() === today);
  },

  /** 导出 CSV */
  async exportCSV() {
    const records = await this.getAll();
    const header = '投递时间,公司,岗位,薪资,城市,技能标签,打招呼语,状态,HR回复,回复时间,备注';
    const rows = records.map(r => [
      new Date(r.appliedAt).toLocaleString('zh-CN'),
      `"${(r.company || '').replace(/"/g, '""')}"`,
      `"${(r.jobName || '').replace(/"/g, '""')}"`,
      r.salary,
      r.city,
      `"${(r.tags || []).join('、')}"`,
      `"${(r.greeting || '').replace(/"/g, '""')}"`,
      (APP_STATUS[r.status.toUpperCase()] || {}).label || r.status,
      `"${(r.hrReply || '').replace(/"/g, '""')}"`,
      r.repliedAt ? new Date(r.repliedAt).toLocaleString('zh-CN') : '',
      `"${(r.notes || '').replace(/"/g, '""')}"`
    ].join(','));
    return [header].concat(rows).join('\n');
  },

  /** 清空所有记录 */
  async clearAll() {
    await chrome.storage.local.remove(TRACKER_KEY);
  }
};

// ===== 简历版本管理 =====
const ResumeManager = {
  /** 获取所有简历版本 */
  async getAll() {
    const data = await chrome.storage.local.get(RESUME_VERSIONS_KEY);
    return data[RESUME_VERSIONS_KEY] || [{ id: 'default', name: '默认版本', text: '', createdAt: Date.now() }];
  },

  /** 保存 */
  async saveAll(versions) {
    await chrome.storage.local.set({ [RESUME_VERSIONS_KEY]: versions });
  },

  /** 添加版本 */
  async add(name, text) {
    const versions = await this.getAll();
    versions.push({
      id: 'resume_' + Date.now(),
      name: name,
      text: text,
      createdAt: Date.now()
    });
    await this.saveAll(versions);
    return versions;
  },

  /** 更新版本 */
  async update(id, name, text) {
    const versions = await this.getAll();
    const v = versions.find(v => v.id === id);
    if (v) { v.name = name; v.text = text; }
    await this.saveAll(versions);
  },

  /** 删除版本 */
  async remove(id) {
    let versions = await this.getAll();
    versions = versions.filter(v => v.id !== id);
    if (versions.length === 0) {
      versions = [{ id: 'default', name: '默认版本', text: '', createdAt: Date.now() }];
    }
    await this.saveAll(versions);
  }
};

// ===== 统计分析 =====
const Analytics = {
  /** 计算核心指标 */
  async getStats() {
    const records = await Tracker.getAll();
    const total = records.length;

    if (total === 0) {
      return { total: 0, replied: 0, interview: 0, rejected: 0,
               replyRate: 0, interviewRate: 0, avgReplyHours: 0,
               byStatus: {}, byCompany: [], byTag: [], byCity: [], dailyTrend: [] };
    }

    const replied  = records.filter(r => ['replied','interview'].includes(r.status)).length;
    const interview = records.filter(r => r.status === 'interview').length;
    const rejected  = records.filter(r => r.status === 'rejected').length;
    const replyRate = total > 0 ? (replied / total * 100) : 0;
    const interviewRate = total > 0 ? (interview / total * 100) : 0;

    // 平均回复时间（小时）
    const repliedWithTime = records.filter(r => r.repliedAt && r.status !== 'sent');
    const avgReplyHours = repliedWithTime.length > 0
      ? repliedWithTime.reduce((s, r) => s + (r.repliedAt - r.appliedAt), 0) / repliedWithTime.length / 3600000
      : 0;

    // 按状态分布
    const byStatus = {};
    records.forEach(r => {
      const label = (APP_STATUS[r.status.toUpperCase()] || {}).label || r.status;
      byStatus[label] = (byStatus[label] || 0) + 1;
    });

    // 按公司聚合
    const companyMap = {};
    records.forEach(r => {
      if (!companyMap[r.company]) companyMap[r.company] = { company: r.company, total: 0, replied: 0 };
      companyMap[r.company].total++;
      if (['replied','interview'].includes(r.status)) companyMap[r.company].replied++;
    });
    const byCompany = Object.values(companyMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);

    // 按技能标签聚合
    const tagMap = {};
    records.forEach(r => {
      (r.tags || []).forEach(t => {
        if (!tagMap[t]) tagMap[t] = { tag: t, total: 0, replied: 0 };
        tagMap[t].total++;
        if (['replied','interview'].includes(r.status)) tagMap[t].replied++;
      });
    });
    const byTag = Object.values(tagMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);

    // 按城市聚合
    const cityMap = {};
    records.forEach(r => {
      const c = r.city || '未知';
      if (!cityMap[c]) cityMap[c] = { city: c, total: 0, replied: 0 };
      cityMap[c].total++;
      if (['replied','interview'].includes(r.status)) cityMap[c].replied++;
    });
    const byCity = Object.values(cityMap).sort((a, b) => b.total - a.total);

    // 每日趋势（最近14天）
    const dailyMap = {};
    const now = Date.now();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now - i * 86400000).toISOString().slice(0, 10);
      dailyMap[d] = { date: d, sent: 0, replied: 0 };
    }
    records.forEach(r => {
      const d = new Date(r.appliedAt).toISOString().slice(0, 10);
      if (dailyMap[d]) dailyMap[d].sent++;
      if (r.repliedAt) {
        const rd = new Date(r.repliedAt).toISOString().slice(0, 10);
        if (dailyMap[rd]) dailyMap[rd].replied++;
      }
    });
    const dailyTrend = Object.values(dailyMap);

    return {
      total, replied, interview, rejected,
      replyRate: Math.round(replyRate * 10) / 10,
      interviewRate: Math.round(interviewRate * 10) / 10,
      avgReplyHours: Math.round(avgReplyHours * 10) / 10,
      byStatus, byCompany, byTag, byCity, dailyTrend
    };
  },

  /** 获取打招呼语模板推荐（基于高回复率岗位） */
  async getGreetingRecommendations() {
    const records = await Tracker.getAll();
    const replied = records.filter(r => ['replied','interview'].includes(r.status));
    if (replied.length === 0) return [];

    // 提取高回复率打招呼语的开头模式
    const patterns = replied.slice(0, 10).map(r => ({
      jobName: r.jobName,
      company: r.company,
      greeting: r.greeting,
      tags: r.tags
    }));

    // 统计最常见的技能关键词
    const skillFreq = {};
    records.filter(r => ['replied','interview'].includes(r.status)).forEach(r => {
      (r.tags || []).forEach(t => {
        skillFreq[t] = (skillFreq[t] || 0) + 1;
      });
    });
    const topSkills = Object.entries(skillFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([skill, count]) => ({ skill, count }));

    return { patterns, topSkills };
  }
};
