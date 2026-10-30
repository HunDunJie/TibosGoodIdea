# 定时发送后恢复聊天路径修复

用户补充的流程为：额度刷新后定时发送草稿，任务完成后播放完成提醒，返回查看时发现 Codex 内容区空白

## 确认的缺陷

`sendRound()` 原先保存 `window.location.pathname + search + hash` 并在结束后传给原生 `navigate()`。在当前实际客户端中，窗口地址为 `/index.html`，原生导航对象的 `pathname` 为 `/local/<chat-id>`，两者并非同一个地址。旧代码因此把 Electron 的 HTML 加载地址当成了应用内聊天路由

这是已确认的代码错误，且与用户所述流程吻合。原始空白窗口已被关闭，未取得该窗口当时的 DOM/renderer 异常，不能断言已完成事故因果的唯一归因

## 修复范围

- 优先从原生导航对象保存真实聊天路径及查询信息
- 不向原生路由传入 `/index.html` 或 `/detached-window.html`
- 无法获得安全的恢复路径时保留最后访问的聊天
- 没有访问草稿聊天时不执行恢复导航
- 同步或异步的恢复失败均保留本轮真实提交统计
- 完成提醒播放逻辑未改动

## 验证

1. 新增内存路由回归用例，修复前明确失败：实际 `/index.html`，预期 `/local/start?tab=activity#draft`
2. 修复后原生导航与兼容导航两条分支均恢复原聊天；完成事件继续送达
3. 缺失原生路径时不恢复 HTML 加载地址；空草稿轮次不导航；同步恢复失败保留提交统计
4. 原生适配浏览器测试、额度刷新定时发送集成测试通过，86 项单元测试通过，语法及差异检查通过
5. 本机仅替换已安装 rc.14 的 `native-features.js`，操作前确认与仓库修复前版本一致并备份；通过已有重新加载脚本应用，未重启 Codex
6. 只读检查确认运行中的 `sendRound` 包含修复，主页面、导航、底栏、额度和功能连接正常

测试没有发送真实草稿或播放测试音乐。未声称真实用户流程已再次人工验收

本地备份位于 `E:/文档/ChatGPT/TibosGoodIdea/diagnostics/native-features-before-route-fix-20261030.js.bak`

上述记录对应本地热修复完成时点，当时 GitHub 上的 rc.16 资产没有修改

## rc.17 发布补记

本修复现已纳入 [v0.8.0-rc.17](https://github.com/HunDunJie/TibosGoodIdea/releases/tag/v0.8.0-rc.17)，与通用测试发布流程一起交付。发布代码提交为 `42c63a1`，本地完整 63 步检查及 main/tag 两次 Windows CI 均通过。发布过程未替换历史 rc.16 资产
