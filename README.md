# Tibo’s Good Idea — Codex 额度底栏与桌面皮肤

[English](README.en.md) · [中文安装说明](QUICKSTART.zh-CN.md) · [日本語](QUICKSTART.ja.md)

Windows Codex 的单行底栏附加工具，自有代码按 **GPL-3.0-only** 开源
将最左侧图标导航移至底部，头像在最左边；同一行显示点数、5 小时额度、每周额度、刷新时间和可用重置
项目目录和 GitHub 仓库名为 TibosGoodIdea，当前版本 **0.8.0-rc.19**

**English:** A Windows Codex desktop skin and quota bottom bar showing remaining usage, five-hour and weekly limits, reset times, reset countdowns and available resets, with scheduled draft sending and music reminders

**日本語:** Windows 版 Codex のデスクトップ用スキン・ボトムバー 残り利用枠、5時間・週間の利用制限、リセット時刻、リセットまでのカウントダウン、利用可能なリセット回数を表示し、下書きの予約送信と音楽通知に対応します

这是非官方项目，与 OpenAI 及 Tibo 没有关联或背书关系
开源许可只涉及本项目自有代码，不代表 OpenAI 已批准该客户端集成方式

## 功能

- 定时关闭：手动开启后每 3 分钟检查所有聊天，全部完成后安排 5 分钟关机；定时发送开启时暂停检查，按钮或托盘可撤销计划，持续断网需确认无本地工具仍执行；关机会强制关闭应用，未保存内容会丢失
- 定时发送：手动开启后，在下一次确认的 5 小时额度刷新后，通过原有提交入口发送各聊天已有的非空草稿，只执行一轮
- 完成提醒：任意已连接聊天回答结束时播放音乐，最多 30 分钟，不额外弹出完成通知
- 刷新提醒：5 小时额度刷新后一分钟弹出通知并播放音乐，最多 30 分钟；已安排的提醒在退出 Codex 后仍有效
- 鼠标在 Codex 内移动、点击或键盘操作会停止播放；托盘菜单可在 Codex 未开启时停止
- 日期与倒计时可点击切换并记住选择，倒计时每分钟更新；中文、英文、日文跟随 Codex
- 确认 Pro 账户没有 5 小时限制时隐藏该额度栏，定时发送和刷新提醒显示“不适用”并取消旧安排；每周额度、点数、可用重置及完成提醒照常使用，读取不到的数据仍显示未知

Windows 须保持开机且未睡眠，不会唤醒电脑，也不会安装登录自启任务
定时发送需保持 Codex 和底栏运行，请在开启前检查各聊天草稿

## 安装与更新

从 [Releases](https://github.com/HunDunJie/TibosGoodIdea/releases) 下载 Windows-x64 ZIP，完整解压到自己选定的位置，双击唯一的 **Start.cmd** 即可
无需安装、管理员权限或自动创建的快捷方式，也不会向 AppData 复制程序。首次使用请先完成任务并自行退出 Codex
配置在当前目录的 config.local.json，数据在 data，更新在 versions。托盘右键管理设置、提醒和关机计划
删除或移动前先在托盘选择 **退出 TiBo**，再处理整个文件夹。详见 [快速开始](QUICKSTART.zh-CN.md)

当前检查环境：Windows 11 x64，Microsoft Store Codex **26.1027.3384.0**。按能力识别接口，未验证的接口单独停用。未来结构变化仍可能需要维护者适配
使用本机调试连接，不修改 Codex 安装文件或原生入口。更新仅访问固定公开签名索引及本项目签名包，不上传账号、额度、草稿、客户端代码或个人配置；网络异常关机判断另对 OpenAI 静态资源站点作无账号连通性探测

## 自动更新

每次 Start.cmd 启动都检查 Codex 适配与 TiBo 更新，修复和新功能都自动处理，无需手动点更新
Codex 指纹变化时检查适配；Codex 没更新也检查 TiBo 自身版本，仅下载确认兼容的发布
客户端已退出且服务安全时本次启动切换，运行中或忙碌时推迟。离线使用当前可用版，校验失败保留旧版
旧版用户下载本版并在自己选定的位置启动一次；验证后迁移设置与提醒，不迁移关机倒计时。旧文件和快捷方式保留，请改用新 Start.cmd
[完整更新规则](docs/program-updates.md) · [兼容性与适配](COMPATIBILITY.md)

## 功能预览

以下均使用实际界面代码与示例数据渲染，演示外壳不是实机 Codex 截图

![底栏布局](docs/images/01-overview.png)
![日期与倒计时](docs/images/02-time-modes.png)
![三个功能说明](docs/images/03-feature-tooltips.png)
![中文、英文、日文](docs/images/04-languages.png)
英文与日文功能图见 [English](docs/images/05-feature-tooltips-en.png) · [日本語](docs/images/06-feature-tooltips-ja.png)

## 源码与验证

需要 Node.js 22+、Python 3、Windows PowerShell 5.1 和 Microsoft Edge
运行 download-runtime.ps1 下载校验固定版本的官方 Node；运行 `python pack-buyer.py` 后解压生成的 Windows ZIP，使用其中的 Start.cmd 启动
开发依赖使用 `npm install --ignore-scripts`，运行 `npm test` 及 package.json 中的 UI、语言、显示、音量、适配器、发送重排、控制器、安装卸载和后台测试
Windows CI 在 .github/workflows/test.yml

`python pack-buyer.py` 生成完整 Windows 包及 SHA-256，`python pack-source.py` 生成对应源码包
个人配置、后台状态、签名私钥、下载的运行时和 dist 均不进入 Git
签名维护流程见 [updates/README.md](updates/README.md)，本次改动与验证见 [docs/automatic-adaptation.md](docs/automatic-adaptation.md)
模拟测试不会发送真实草稿或播放真实音乐，真实冷启动、通知返回和真实多聊天发送仍需单独验收

## 搜索关键词 / Search terms / 検索キーワード

| 中文 | English | 日本語 |
| --- | --- | --- |
| Codex 皮肤、界面美化 | Codex skin, desktop theme | Codex スキン、テーマ、UI カスタマイズ |
| Codex 底栏、底部导航栏 | Codex bottom bar, bottom navigation | Codex ボトムバー、下部ナビゲーション |
| 剩余额度、用量显示、额度监控 | remaining quota, usage display, quota monitor | 残り利用枠、使用量表示、利用状況モニター |
| 五小时额度、每周额度 | five-hour quota, weekly quota | 5時間の利用枠、週間利用枠 |
| 刷新时间、重置时间、刷新倒计时 | reset time, quota reset countdown | リセット時刻、リセットまでのカウントダウン |
| 可用重置、重置次数 | available resets, reset credits | 利用可能なリセット回数、リセットクレジット |
| 定时发送、草稿自动发送 | scheduled draft sending, send on quota reset | 下書きの予約送信、利用枠リセット後の自動送信 |
| 完成提醒、任务结束提醒 | task completion reminder, completion sound | タスク完了通知、回答完了通知 |
| 刷新提醒、音乐提醒 | quota reset reminder, music notification | リセット通知、音楽通知 |
| 中英日多语言、Windows 桌面工具 | multilingual Windows desktop utility | 中国語・英語・日本語対応、Windows デスクトップツール |

## 许可证

自有代码、图标和说明为 [GPL-3.0-only](LICENSE)，保留原贡献者版权声明
分发修改版也须按 GPL 提供相应源码，允许按 GPL 收费分发
Node、Acorn 和内置音乐分别保留原有权利，范围见 [许可说明](LICENSE.zh-CN.md) 与 [第三方声明](THIRD-PARTY-NOTICES.md)
历史 sales 目录仅保留旧版准备记录，不是当前发布许可或已开通的销售渠道
