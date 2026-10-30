# TibosGoodIdea 工作入口

测试与发布使用 [docs/release-workflow.md](docs/release-workflow.md)，不要临时重写测试清单、上传器或签名流程。

- 日常变更运行 `runtime/node.exe scripts/test.mjs quick`；按改动补充相关测试
- 正式发布运行 `runtime/node.exe scripts/test.mjs full`，同一代码指纹已有 24 小时内的完整成功报告时自动复用
- 完整测试、打包、断点续传、GitHub CI 门禁及更新索引均有现成入口，详见流程文档
- 测试/本地打包请求不包含发布授权；用户明确要求发布后继续完成全部发布检查
- 使用仓库内 [skills/tibo-release/SKILL.md](skills/tibo-release/SKILL.md)；技能副本可安装到 Codex 的 skills 目录
- 功能截图是已审阅资产，自动化测试会在结束时还原测试前的字节，不顺手提交重渲染图片
- 保留源码、安装版及真实客户端验收的区别，不用模拟测试声称发送过真实草稿
