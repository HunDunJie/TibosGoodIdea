# TibosGoodIdea 项目约定

这是开发用私有仓库，产品显示名为 Tibo’s Good Idea，稳定 productId 不改
当前基线 0.8.0-rc.4，Windows 11 x64 / Microsoft Store Codex 26.1023.6621.0

## 目录和构建

- 根目录：底栏源码、独立提醒服务、Windows 启动/安装/设置脚本、双语许可和说明
- tests/：现有自动检查，.github/workflows/test.yml：Windows CI
- sales/：中英文商品文案、封面、交付文字和验收记录
- dist/：生成的安装包、私有源码备份、卖家资料包及 SHA-256，不加入 Git
- runtime/node.exe：官网下载的固定版本，仅本地使用；Node 许可和下载脚本进入 Git
- config.local.json：仅本地的时区与私人音效路径，不加入 Git

在 Windows PowerShell 中按顺序运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File download-runtime.ps1
python pack-buyer.py
python pack-source.py
python pack-seller.py
```

买家只收 dist 中的 Windows-x64 ZIP，seller-kit 用于卖家上架准备，private-source 仅作私有备份
源码测试说明见 README；这次搬迁没有改变功能，不替代真实客户端验收

## 运行与发布边界

最初的候选包导入证据保存在 docs/migration.json 与 docs/migration-verification.json，不改写历史名称和散列
本次改名已将目录移至 D:/MyOtherProjects/TibosGoodIdea，旧 D 盘目录不保留别名或副本
已在不重启 Codex 的情况下切换本工具后台，保留开关、提醒计划和待发送轮次，见 docs/rename.md
个人配置可在本地继续使用，私人游戏音乐文件不复制到本项目，不上传 GitHub
原项目的历史包继续保留，不覆盖旧文件，不追溯撤销任何已有有效许可

GitHub 仓库必须保持私有，不启用 Pages，不创建公开 Release，不开始销售
OpenAI 支持答复仍待确认；获准后还需完成 sales/manual-acceptance.md 和平台收款交付验收
自己的商业许可不代替 OpenAI 或第三方权利，原贡献者版权与第三方许可证保留
