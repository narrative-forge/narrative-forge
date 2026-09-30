# 工作流约定（Agent 交付方式）

> 本文件定义 Narrative Forge 项目中 AI Agent 每一步交付结果的处理方式。
> 由用户在 TASK-001 完成后确定，后续所有任务默认遵循。

## 交付约定（方案 A）

- **Agent 不尝试向 GitHub 推送代码**：当前执行环境（Web 版沙箱）没有 GitHub 凭证，
  且仓库 `narrative-forge/narrative-forge` 由用户侧创建/持有。
- 每一步的直接结果，Agent 在 `/workspace` 落盘后，额外生成一个**干净的源码压缩包**
  （`git archive`，仅含受控文件，排除 `node_modules/` `dist/` `*.tsbuildinfo`），
  供用户下载后自行推送到 GitHub。
- 压缩包命名：`narrative-forge-<step>.zip`（`<step>` 为该步标识，如 `skeleton`、
  `task-002-docs`）。
- Agent 在本地 `git commit`，以保证压缩包内容完整、可追溯。

## 用户侧推送步骤

1. 从工作区下载最新压缩包并解压。
2. 在 GitHub 创建空仓库 `narrative-forge/narrative-forge`
   （**不要**勾选 Initialize with README / 添加 `.gitignore`，避免冲突）。
3. 本地执行：

   ```bash
   cd narrative-forge            # 解压后的目录
   git remote add origin https://github.com/narrative-forge/narrative-forge.git
   git push -u origin main
   ```

## 备注

- 若用户改为提供 GitHub Token，可临时切换为 Agent 代推（方案 B），但**默认仍为方案 A**。
- 本约定优先于任何"由 Agent 直接推送"的隐含假设。
- 与本文件相关的工程细节见 `docs/engineering-baseline.md`。
