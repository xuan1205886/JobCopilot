<div align="center">

# 🤖 JobCopilot · AI 求职智能体 v1.1

**AI 岗位匹配 + 千岗千面招呼语 + 自动投递 + 投递追踪 + 回复率分析**

> Fork 自 [JobCopilot](https://github.com/huluobo2237-pixel/JobCopilot) (87⭐ MIT)，增加数据追踪与分析能力

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-Edge%20%7C%20Chrome-brightgreen.svg)](https://www.microsoft.com/edge)
[![Manifest](https://img.shields.io/badge/Manifest-V3-orange.svg)](https://developer.chrome.com/docs/extensions/mv3/)
[![AI](https://img.shields.io/badge/AI-DeepSeek-purple.svg)](https://platform.deepseek.com/)

</div>

---

## ✨ 功能特性

### 🚀 智能投递（原版功能）
- 🔍 **自动搜索收集**：按关键词、城市自动抓取 BOSS 直聘岗位
- 🤖 **AI 智能筛选**：DeepSeek 结合你的简历，自动剔除不匹配岗位
- ✍️ **千岗千面招呼语**：每个岗位单独生成个性化招呼语，精准对口
- 📎 **自动发送简历**：先发简历图片，再发招呼语，一个岗位完整闭环
- 🛡️ **拟人化节奏**：随机延迟、逐个投递，自然防风控

### 🆕 v1.1 新增
- 📋 **投递追踪表**：完整记录公司、岗位、薪资、招呼语、投递时间、回复状态
- 📊 **回复率分析**：核心指标面板、每日趋势图、技能/公司/城市多维度分析
- 💡 **招呼语优化**：基于高回复率数据分析，推荐最佳技能关键词和话术模板
- 📝 **多简历版本**：支持 A/B Test，不同方向岗位用不同版本简历
- 📥 **数据导出**：一键导出 CSV，方便在 Excel 中进一步分析
- 🎯 **状态管理**：手动标记 HR 已读、已回复、约面试、不合适等状态

## 🚀 快速开始

### 1. 安装
```bash
git clone https://github.com/xuan1205886/JobCopilot.git
```

### 2. 加载扩展
1. 打开 `edge://extensions`（Chrome 为 `chrome://extensions`）
2. 打开右上角 **开发者模式**
3. 点 **加载解压缩的扩展**，选择 `JobCopilot · AI` 文件夹
4. 点击扩展图标，打开侧边栏

### 3. 配置
| 配置项 | 说明 |
|--------|------|
| DeepSeek API Key | [官网申请](https://platform.deepseek.com/) |
| 简历图片 | 投递时发给 HR 的简历截图 |
| 简历文字 | AI 筛选和招呼语的质量取决于它的详细程度 |
| 关键词 / 城市 | 如：`Python后端` / `沈阳` |
| 收集数量 | 每次抓取岗位数（建议 20-40） |

### 4. 使用流程
```
设置页配好简历版本 → 填写关键词/城市 → 开始收集+AI筛选 → 审核勾选 → 自动投递
                                                                             ↓
                                                             追踪页看回复 → 分析页优化策略
```

## 🛠️ 技术栈

- **浏览器扩展**：Manifest V3，原生 JavaScript，零依赖
- **AI 模型**：DeepSeek（`deepseek-chat`）做岗位筛选 + 招呼语生成
- **数据存储**：Chrome Storage Local（纯本地，不上传任何数据）
- **架构**：Service Worker 编排 + Content Scripts 操作页面 + Side Panel UI

## 📁 项目结构

```
JobCopilot · AI/
├── manifest.json           # 扩展配置
├── icons/                  # 图标
├── src/
│   ├── background.js       # 核心编排 + DeepSeek + 追踪API
│   ├── tracker.js          # 🆕 投递追踪 + 统计分析 + 简历版本管理
│   ├── content-search.js   # 搜索页：抓取岗位 + 建立联系
│   ├── content-chat.js     # 聊天页：发送简历 + 招呼语
│   ├── selectors.js        # DOM 选择器与城市编码
│   ├── sidepanel.html      # 🆕 四Tab侧边栏 UI
│   ├── sidepanel.js        # 🆕 完整交互逻辑
│   └── sidepanel.css       # 🆕 样式
└── README.md
```

## 🆚 与原版对比

| 能力 | 原版 | v1.1 |
|------|:---:|:---:|
| AI 筛选岗位 | ✅ | ✅ |
| 个性化招呼语 | ✅ | ✅ |
| 自动投递 | ✅ | ✅ |
| 投递记录表 | ❌ | ✅ |
| 状态管理 | ❌ | ✅ (6种状态) |
| 回复率分析 | ❌ | ✅ |
| 每日趋势图 | ❌ | ✅ |
| 技能/公司排行 | ❌ | ✅ |
| 招呼语优化建议 | ❌ | ✅ |
| 多简历版本 | ❌ | ✅ |
| CSV 导出 | ❌ | ✅ |

## ⚠️ 免责声明

- 本项目仅供 **学习交流与个人效率提升** 使用
- 自动化操作可能违反 BOSS 直聘的用户协议，使用风险由使用者自行承担
- 请合理设置投递数量与频率，尊重 HR、珍惜每一次沟通机会

## 📄 License

[MIT](./LICENSE) © 2026 — 基于 [huluobo2237-pixel/JobCopilot](https://github.com/huluobo2237-pixel/JobCopilot) 增强
