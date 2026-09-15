# llmrix.github.io — LLM Wiki

**LLM Wiki** 是一个零后端、文件驱动的知识库站点，部署在：

<https://llmrix.github.io/>

React 19 · Vite 6 · Tailwind CSS 4 · TypeScript 5 · KaTeX · Mermaid.js

## 如何新增文章

1. 在 `src/source/` 下新建一个 `.md` 文件（带 YAML frontmatter）：

```markdown
---
title: "Article Title"
category: Guide
date: 2026-09-15 00:00:00
tags: [LLM, AI]
summary: "Short description shown in the list."
---

文章正文（Markdown / KaTeX 公式 / Mermaid 图 / 代码高亮均可）...
```

2. `git push` 到 `main`
3. **GitHub Actions 自动构建并部署**，几分钟后文章上线，无需手动操作

> `src/source/about.md` 是特殊的，它驱动「About」页面；其余 `.md` 文件都会作为文章发布。
> `src/public/*.md` 下的文件同样会自动发布。

## 部署机制

- 工作流：[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)，push 到 `main` 时触发（也可在 Actions 页手动运行）
- 构建：`npm ci` + `npm run build`（Vite 自动打包 `src/source/` 与 `src/public/` 下的所有 Markdown）
- 用户站点（`<owner>.github.io`）在根路径部署，`vite.config.ts` 会自动识别（无需 `/<repo>/` 前缀）
- 深链接回退：刷新 `/post/xxx` 由 [`public/404.html`](public/404.html) 转回应用内路由

## 常用命令

| Command | Description |
| --- | --- |
| `npm run dev` | 本地开发 `http://localhost:3000` |
| `npm run build` | 构建到 `dist/` |
| `npm run lint` | TypeScript 类型检查 |
| `npm run preview` | 本地预览构建产物 |

## 站点配置

编辑 `src/config/config.json` 可修改站点标题、简介、社交链接、每页文章数等。
