# 工作流约定（Agent 交付方式）

> 本文件定义 Narrative Forge 项目中 AI Agent 每一步交付结果的处理方式。
> 由用户在 TASK-001 完成后确定，并在 TASK-003 推送环节更新为「Agent 直接推送」。

## 交付约定（默认：Agent 直接推送）

- GitHub 连接器已配置：Agent 通过连接器直接把每一步结果推送到
  `narrative-forge/narrative-forge` 的 **`master`** 分支（远端默认分支为 `master`，非 `main`）。
- 每一步：Agent 在 `/workspace` 落盘 → `git commit` → `git push` 到远端 `master`。
- 推送方式：使用连接器提供的 `GITHUB_TOKEN`（经环境变量引用，禁止打印/硬编码）。
  - `git` 协议对 `github.com` 走通（push/fetch 正常）；若遇瞬时连接重置，重试即可。
  - 当本地与远端历史分叉（如用户侧曾把提交压成 `INIT`），使用
    `git fetch origin master` 更新跟踪引用后 `git push --force-with-lease origin master`
    安全强推（仅覆盖我方自身分叉历史，内容零丢失）。

## 回退方案（方案 A，连接器不可用时）

- 若连接器或推送暂不可用，Agent 退化为生成**干净源码压缩包**
  （`git archive`，仅含受控文件，排除 `node_modules/` `dist/` `*.tsbuildinfo`），
  供用户下载后自行推送。
- 压缩包命名：`narrative-forge-<step>.zip`；用户侧推送目标分支为 `master`：

  ```bash
  cd narrative-forge
  git remote add origin https://github.com/narrative-forge/narrative-forge.git
  git push -u origin master
  ```

## 备注

- 本约定优先于任何"由用户下载再推送"的隐含假设；直接推送为默认。
- 与本文件相关的工程细节见 `docs/engineering-baseline.md`。
