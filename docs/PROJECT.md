# TibosGoodIdea 项目约定

产品显示名为 Tibo’s Good Idea，稳定 productId 保持 bottom-bar-companion
当前版本 0.8.0-rc.14，自有代码按 GPL-3.0-only 开源，第三方组件及录音分别保留原权利

- 根目录：底栏、独立提醒后台、Windows 启动/安装/卸载脚本
- tests/ 与 .github/workflows/test.yml：隔离测试及 Windows CI
- updates/：公开签名适配表、可读源码表和公钥，不包含私钥
- vendor/acorn/：固定 8.15.0 的 MIT 语法解析器和原许可证
- dist/：本地生成的完整 Windows 包、对应源码包和 SHA-256，不加入 Git
- sales/：历史销售准备资料，不替代当前 GPL，也不代表已开放销售或获官方授权

打包：download-runtime.ps1 → python pack-buyer.py → python pack-source.py
个人配置、后台状态、私钥不进入仓库或包；历史迁移散列作为证据保留
功能检查和真实客户端验收须分别报告，不自动重启正在承载工作的 Codex
维护签名表见 updates/README.md；更改录音来源或许可须单独核对
