自有代码按 GPL-3.0-only 开源，保留原贡献者版权；修改后分发须遵守 GPL 相应源码义务

- 启动时识别 Codex 接口，移除小版本更新导致整个底栏拒绝加载的版本号门槛
- 分别检查定时发送、完成提醒与使用量入口，单个接口改变时只暂停相关能力
- 自动检查签名适配表，文件散列全部匹配才应用；离线可使用本地识别及已验证缓存
- 保留原有单行底栏、中英日语言跟随、提醒服务、草稿保护、30 分钟上限及用户指定音乐
- 修复新增解析器目录卸载时残留空父目录的问题

首次升级：完整解压 Windows-x64.zip，运行 Install.cmd，退出旧 Codex 后从生成的快捷方式启动
之后启动时自动识别接口和检查适配表；结构性变更仍可能需要新版本，不能保证任意未来 Codex 都自动兼容

附带 source.zip 为对应源码；两份 ZIP 的 .sha256 文件可用于校验
Node、Acorn、录音资源各自保留原有权利，见随包声明
这是非官方工具，没有 OpenAI/Tibo 背书，不声称已获 OpenAI 对此集成方式的批准

自动回归和当前客户端只读接口识别通过，真实 Codex 冷启动、系统通知返回及真实草稿提交仍需人工验收
本次验证未重启当前 Codex、未发送真实草稿、未播放真实音乐

---

Original code is now GPL-3.0-only. Startup discovers current interfaces independently instead of rejecting an entire Codex version. Signed, exact-fingerprint adapter mappings are checked automatically, with offline fallback. Structural client changes may still need maintenance

For a first upgrade, extract the Windows ZIP, run Install.cmd, close the old Codex instance and use the generated shortcut. The source ZIP contains corresponding source. Recordings and third-party components retain their own rights

Independent, unofficial project without OpenAI or Tibo endorsement. Automated and read-only structural checks passed; real Codex cold start, notification activation and real draft submission still require separate acceptance
