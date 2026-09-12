// ===== 简历版本管理 =====
// 存储 key: 'app_resume_versions_v1'
// 每个版本：{ id, name, text, image, createdAt }，image 为 dataURL（可空）
const RESUME_VERSIONS_KEY = 'app_resume_versions_v1';

const ResumeManager = {
  async getAll() {
    const data = await chrome.storage.local.get(RESUME_VERSIONS_KEY);
    return data[RESUME_VERSIONS_KEY] || [{ id: 'default', name: '默认版本', text: '', image: '', createdAt: Date.now() }];
  },
  async saveAll(versions) {
    await chrome.storage.local.set({ [RESUME_VERSIONS_KEY]: versions });
  },
  async add(name, text, image) {
    const versions = await this.getAll();
    versions.push({ id: 'resume_' + Date.now(), name: name, text: text, image: image || '', createdAt: Date.now() });
    await this.saveAll(versions);
    return versions;
  },
  async update(id, name, text, image) {
    const versions = await this.getAll();
    const v = versions.find(v => v.id === id);
    if (v) { v.name = name; v.text = text; if (image !== undefined) v.image = image; }
    await this.saveAll(versions);
  },
  async remove(id) {
    let versions = await this.getAll();
    versions = versions.filter(v => v.id !== id);
    if (versions.length === 0) {
      versions = [{ id: 'default', name: '默认版本', text: '', image: '', createdAt: Date.now() }];
    }
    await this.saveAll(versions);
  }
};
