# 固定测试与发布流程

本地和 GitHub Actions 共用 `scripts/test.mjs` 与 `scripts/test-plan.json`。正式上传使用 `scripts/release.py`，不依赖 gh 或本机 npm。以下命令均在仓库根目录执行，Windows 需要 Python 3.10+、Git、curl、PowerShell、Edge 和 Playwright；发行运行时使用已经校验的 `runtime/node.exe`。Playwright 优先从项目依赖或 NODE_PATH 获取，也识别 Codex 当前已配置的缓存路径

## 日常验证

```powershell
runtime/node.exe scripts/test.mjs quick
```

包含语法检查、单元测试、发布工具自测、原生适配及定时发送集成测试。改动特有测试按需补充。`full` 才具有发布资格，包含同一语法/单元检查及全部 14 组界面、服务、安装卸载和更新回滚测试

测试逐项执行，失败即停；详细输出保存在 `work/validation/<version>/<mode>`，聊天只需读取最终 JSON 及失败日志尾部。程序会还原测试生成的五张截图。结果绑定 Git 可见输入文件的 SHA-256 指纹；相同代码 24 小时内复用通过报告，`--force` 可强制重跑。CI 始终强制执行，并保存报告和日志为 Actions artifact。没有运行真正 Codex 的草稿提交或有声验收

## 已获发布授权后的顺序

1. 查看 `git status`、当前发布版本和改动内容，明确本次版本及变更说明。保留未提交的既有修复
2. 升版并写中英日发布说明（历史发布说明不改写）：

   ```powershell
   python scripts/release.py prepare 0.8.0-rc.17
   # 编写 docs/release-notes-0.8.0-rc.17.md
   runtime/node.exe scripts/test.mjs full
   python scripts/release.py build
   ```

3. 自审实际差异及归档清单，再提交、推送 main。打包不会代替代码审查。构建输入必须和成功测试报告完全一致；脚本检查 Windows ZIP 中每个文件的 SHA-256、ZIP CRC、GPL 源码包及两个校验文件
4. 发布检查点：

   ```powershell
   python scripts/release.py publish --notes docs/release-notes-0.8.0-rc.17.md
   ```

   自动核对仓库/账号、创建相同代码的版本标签、创建 draft、上传四项资产并对照 GitHub 保存的 SHA-256/大小。只有精确发布提交的 main 与 tag 两次 Windows CI 均通过，才公开 Release。退出码 3 表示 CI 尚未完成；继续查询 Actions 状态，完成后原样重跑该命令。其他非零退出码先查原因，不自动跳过、强制重打标签或反复重跑失败测试

   断点信息在 `work/release/<version>`。重跑会复用已匹配的资产；发现同名但内容不同即停止，绝不删除或替换已上传资产。网络超时后同样原命令续跑，不重新打包。正式归档一旦进入上传检查点就不能 rebuild

5. 更新索引仅针对本次已验证的 Codex 指纹：

   ```powershell
   python scripts/release.py index --asar '实际安装位置/app/resources/app.asar' --kind fix
   ```

   复用外置的 `%LOCALAPPDATA%/TibosGoodIdea-Maintainer/program-signing-private.pem`；私钥与凭据不进入仓库、命令参数或日志。必须先公开不可变 ZIP，再生成指向它的更高修订号索引，避免 ZIP 包含自身校验值。功能性选装更新用 `--kind feature`。同版本匹配的索引重复执行不涨修订号

6. 自审并提交 `updates/program-catalog.json`，用 `[skip ci]` 提交元数据、推送 main；不重建 Windows/源码 ZIP。最后运行：

   ```powershell
   python scripts/release.py verify
   ```

   再次核对公开 Release、四项资产的服务端摘要、精确提交的 CI、实际下载的公开小索引、签名及 ZIP 对应关系。该检查不下载完整大资产，结果明确标为 `fullPublicAssetDownloadVerified=false`，不能描述成完整下载重哈希通过。需要验证完整下载时另行执行并单独记录

## 固定完成标准与恢复

- `work/release/<version>/publication.json` 是机器记录，包含代码提交、资产、CI 和公开索引验证结果，可按需复制为公开发布证据；日志不用逐条粘贴进聊天
- 发布完成后 `git status -sb` 应干净。实际发布版本、链接、主要变更和重要验收限制写入交付回复
- 保留 rc.14 及更早安装须手动升级一次的说明。发布操作不重启用户的 Codex，不擅自发送草稿或试听音乐
- 发布中断后从相同检查点恢复；CI 真失败就修复后重新测试并使用新版本，若证实为环境瞬态，可审查日志后只重跑失败 CI，不能把重跑当作修复
- 维护工具自身改动先运行 `python tests/release_workflow_test.py`；此测试只用隔离临时目录和模拟 GitHub，不会发布

流程升级时同步更新 `scripts/test-plan.json` 与工作流文档，CI 不再维护第二份测试清单
