---
name: tibo-release
description: Run TibosGoodIdea Windows tests, build local packages, or publish GitHub releases and signed update indexes using its reusable checked-in workflow. Use for TiBo validation, packaging, release and interrupted-release recovery.
---

# TiBo 测试与发布

默认仓库 `D:/MyOtherProjects/TibosGoodIdea`，远程 `HunDunJie/TibosGoodIdea`。位置可能变化时先核对 Git remote；不扫描整个磁盘。

以仓库内 `AGENTS.md` 和 `docs/release-workflow.md` 为唯一操作流程，按本次范围读取并运行现有入口：

- 日常验证：`runtime/node.exe scripts/test.mjs quick`
- 发布验证：`runtime/node.exe scripts/test.mjs full`
- 打包/发布/更新索引/核验：`python scripts/release.py --help`，按流程文档的检查点执行

用户只要检查或本地包时，停在相应产物；明确要求发布后完成 Release 和更新索引核验，不再重复询问已有授权。技能本身不授予发消息、发帖或发布权限。

不要再临时写 GitHub 上传器、测试清单、临时密钥脚本；现成工具已处理 Git Credential Manager、curl 的内存凭据、draft ID、SHA-256、CI 门禁、上传恢复和索引自引用问题。只读相应 JSON 报告、相关失败日志尾部和当前改动，不重复读取全部历史审查文档或截图。相同指纹的成功报告可复用；代码变化必须重测。

不要覆盖发布资产、重打既有不同目标标签、轮换签名密钥或把私钥放进仓库。失败先查具体原因；网络失败原命令续跑，CI 失败遵循流程文档的停止条件。完整大包下载未做时据实报告验证边界。
