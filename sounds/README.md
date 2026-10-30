# Default reminder music / 默认提醒音乐

The project owner selected the following WAV recordings for the installer defaults.
The bundled files are byte-for-byte copies of the supplied recordings, without
trimming, transcoding or volume changes.

| Reminder / 提醒 | Bundled file / 包内文件 | Supplied recording / 原文件 | Duration / 时长 |
| --- | --- | --- | --- |
| Completion / 完成 | `completion.wav` | `BGM_JuShang.wav` | 19.20 s |
| Reset / 刷新 | `refresh.wav` | `BGM_DuDuan.wav` | 66.78 s |

Both are stereo PCM WAV files at 44100 Hz / 16 bit. The reminder service loops the
selected recording for at most 30 minutes, subject to the existing stop rules.
Leave the WAV setting empty to use this bundled music, or choose a custom WAV in
Settings. Installation does not play audio.

SHA-256:

- `completion.wav`: `4defa78158f982653e6ed544c949344b3a56c9b933f57c9674be9dc616c7e1ce`
- `refresh.wav`: `13267481b9e81746d548feb9a5f089cf3a9107ceca326a8da44c8ca4baee5f11`

安装包按用户要求，完成提醒使用 BGM_JuShang，刷新提醒使用 BGM_DuDuan
两个包内文件均原样复制，不裁剪、不转码、不调整音量，替代旧版合成提示音
设置里的 WAV 路径留空即可使用上述内置音乐，也可以另选自定义 WAV
音乐按原有规则循环播放，最多 30 分钟，安装过程不会播放音乐

The recordings retain their original rights. The software code license does not
grant a separate right to reuse the recordings outside this tool.
音乐保留其原有权利，软件代码的许可不单独授予将音乐用于本工具之外的权利
