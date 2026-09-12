// ===== 简历版本管理 =====
// 存储 key: 'app_resume_versions_v1'
const RESUME_VERSIONS_KEY = 'app_resume_versions_v1';

const ResumeManager = {
  async getAll() {
    const data = await chrome.storage.local.get(RESUME_VERSIONS_KEY);
    return data[RESUME_VERSIONS_KEY] || [{ id: 'default', name: '默认版本', text: '', createdAt: Date.now() }];
  },
  async saveAll(versions) {
    await chrome.storage.local.set({ [RESUME_VERSIONS_KEY]: versions });
  },
  async add(name, text) {
    const versions = await this.getAll();
    versions.push({ id: 'resume_' + Date.now(), name: name, text: text, createdAt: Date.now() });
    await this.saveAll(versions);
    return versions;
  },
  async update(id, name, text) {
    const versions = await this.getAll();
    const v = versions.find(v => v.id === id);
    if (v) { v.name = name; v.text = text; }
    await this.saveAll(versions);
  },
  async remove(id) {
    let versions = await this.getAll();
    versions = versions.filter(v => v.id !== id);
    if (versions.length === 0) {
      versions = [{ id: 'default', name: '默认版本', text: '', createdAt: Date.now() }];
    }
    await this.saveAll(versions);
  }
};
