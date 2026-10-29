/* Only translates this add-on's own text. Native chats and drafts are never rewritten. */
(function (factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.__cqbI18n = api.create(globalThis.__cqbPreferences ?? {}, globalThis.navigator?.language);
})(function () {
  'use strict';
  const english = {
    '不限':'Unlimited', '暂不可用':'Unavailable', '时间暂不可用':'Time unavailable', '等待刷新':'Awaiting reset',
    '5小时':'5h', '每周':'Weekly', '额度 ':'Credits ', '可用重置':'Available resets',
    '-- 次':'--', '{count} 次':'{count}', '次数未知':'Unknown count',
    'Codex 剩余额度与可用重置':'Codex usage and available resets',
    '跟随当前账户用量数据；点击时间切换显示模式，日期时间为{zone}。点击可用重置打开额度页面。':'Current account usage. Click a time to switch date/countdown ({zone}). Available resets opens Usage.',
    '打开额度页面，与头像菜单中的可用重置相同':'Open Usage, the same page as Available resets in the profile menu',
    '暂未找到额度入口，请从头像菜单打开可用重置':'Usage shortcut unavailable. Open Available resets from your profile menu.',
    '点击切换为日期时间（{zone}）':'Show date and time ({zone})',
    '点击切换为剩余时间':'Show countdown',
    '点击打开使用量页面':'Click to open Usage',
    '暂未取得刷新时间':'Reset time unavailable',
    '已开启':'On',
    '将于{time}发送所有聊天中的草稿，全部发送后将关闭定时发送':'Drafts in all chats will be sent at {time}; scheduled sending turns off after this round',
    '可开启，用于在额度刷新时自动发送所有聊天中的草稿，所有草稿发送后将关闭定时发送':'Enable to send drafts in all chats when the quota resets; scheduled sending turns off after this round',
    '任意聊天回答结束时会播放音乐进行提醒，播放时长最多30分钟':'Sound plays when any chat finishes a response, for up to 30 minutes',
    '可开启，用于在任意聊天回答结束时会播放音乐进行提醒，播放时长最多30分钟':'Enable to play sound when any chat finishes a response, for up to 30 minutes',
    '将于{time}播放音乐提醒':'A sound reminder will play at {time}',
    '可开启，用于额度刷新时播放音乐进行提醒，播放时长最多30分钟，退出Codex仍然有效':'Enable to play sound for the quota reset, for up to 30 minutes, even after Codex closes',
    '{label}刷新时间，{time}，{zone}，{action}':'{label} reset: {time} ({zone}). {action}',
    '点击显示日期时间':'Show date and time', '点击显示剩余时间':'Show countdown',
    '{label}额度，剩余 {value}，{time}，{zone}':'{label} available: {value}; {time} ({zone})',
    '购买额度的剩余点数：{value}':'Purchased credits available: {value}',
    '可用重置 {count}，打开额度页面':'Available resets: {count}. Open Usage',
    '北京时间':'Beijing time',
    '定时发送':'Send on reset', '完成提醒':'Completion sound', '刷新提醒':'Reset reminder', '聊天与额度提醒':'Chat and usage reminders',
    '已关闭':'Off', '未连接':'Disconnected', '发送中':'Sending', '完成 {sent} / 跳过 {skipped}':'Sent {sent} / skipped {skipped}',
    '发送中断':'Interrupted', '已取消':'Cancelled', '已过期':'Expired', '播放中':'Playing', '监听中':'Listening', '等待连接':'Connecting',
    '响铃中':'Ringing', '已安排':'Scheduled', '等刷新时间':'Waiting for reset time', '需处理':'Needs attention', '未开启':'Not enabled',
    '下次响铃：{time}（{zone}）；退出 Codex 后仍生效。':'Next alarm: {time} ({zone}). Works after Codex closes.',
    '手动开启一次；五小时额度刷新确认后发送各聊天草稿，本轮结束自动关闭。':'Arm once to send chat drafts after the next confirmed 5h reset. Turns off after one round.',
    '聊天任务完成时只播放音乐，最多循环 30 分钟；鼠标在 Codex 内移动、点击或输入即停。':'Play sound on task completion, for up to 30 minutes. Moving the mouse inside Codex, clicking or typing stops it.',
    '五小时额度重置后一分钟发出通知并循环响铃，最多 30 分钟；可在托盘中停止或关闭。':'Notify and loop sound one minute after the 5h reset, for up to 30 minutes. Stop or disable it in the tray.',
    '当前系统已静音，可能听不到刷新提醒':'System audio is muted. You may not hear the reset reminder.',
    '当前音量低于 1%，可能听不到刷新提醒':'System volume is below 1%. You may not hear the reset reminder.',
    '请通过底栏启动器连接后台':'Use the add-on launcher to connect the background service.',
    '请用底栏启动器连接后台':'Use the add-on launcher to connect the background service.',
    '提醒后台响应超时':'The reminder service timed out.', '底栏已恢复':'The original layout was restored.',
    '尚未连接到当前客户端的任务与草稿接口，请稍后重试':'Task and draft interfaces are not connected. Try again shortly.',
    '当前客户端版本未适配任务事件与草稿接口':'Task events and drafts are not supported on this Codex version.',
    '找不到客户端模块入口':'The Codex renderer entry point was not found.', '客户端功能接口不可用':'The Codex feature interface is unavailable.',
    '尚未取得客户端状态':'Codex state is not available yet.', '当前账户和额度数据不一致':'The current account does not match the usage data.',
    '上次发送中断，请检查聊天；不会自动重发':'The previous send was interrupted. Check your chats; drafts will not be retried.',
    '无效开关状态':'Invalid switch state.', '正在发送，请等待本轮结束':'Sending is in progress. Wait for this round to finish.',
    '尚未取得下一次五小时重置时间，请稍后再开启':'The next 5h reset time is unavailable. Try enabling this later.',
    '未知功能':'Unknown feature.', '账户已切换，本轮已取消':'The account changed; this round was cancelled.',
    '本轮发送超时或客户端已退出，请检查聊天；不会自动重发':'Sending timed out or Codex closed. Check your chats; drafts will not be retried.',
    '错过本轮刷新，已关闭；没有发送草稿':'This reset was missed. Sending is off; no drafts were sent.',
    '播放器意外退出，可重新开关提醒':'The player exited. Toggle the reminder off and on to reconnect.',
    '提醒后台连接超时':'The reminder service connection timed out.', '提醒后台未运行':'The reminder service is not running.',
    '无效后台响应':'Invalid reminder service response.', '无法启动独立提醒进程':'The reminder service could not start.',
    '请在 config.local.json 配置对应 WAV 文件':'Choose a WAV file in Settings.', '音乐文件不存在或超过 128 MB':'The sound file is missing or larger than 128 MB.',
    '请先配置可读取的 WAV 音乐文件':'Choose a readable WAV file in Settings.', '音乐播放失败':'Sound playback failed.',
    '播放器响应超时':'The sound player timed out.', '托盘播放器启动超时':'The tray player timed out while starting.',
    '无法启动 Windows 播放器':'The Windows sound player could not start.', '托盘播放器已退出':'The tray player exited.', '播放器已退出':'The sound player exited.',
    '暂时无法读取系统音量':'System volume could not be read.', '未知后台命令':'Unknown service command.', '无效客户端路径':'Invalid Codex executable path.'
  };
  function create(preferences = {}, systemLanguage = 'zh-CN') {
    const selected = preferences.language === 'auto' ? systemLanguage : preferences.language || 'zh-CN';
    const locale = /^en(?:-|$)/i.test(selected) ? 'en' : 'zh-CN';
    let timeZone = preferences.timeZone;
    if (!timeZone || timeZone === 'auto') timeZone = locale === 'zh-CN' ? 'Asia/Shanghai' : Intl.DateTimeFormat().resolvedOptions().timeZone;
    try { new Intl.DateTimeFormat('en',{timeZone}).format(); } catch { timeZone = locale === 'zh-CN' ? 'Asia/Shanghai' : 'UTC'; }
    const t = (key, values = {}) => {
      let text = locale === 'en' ? english[key] ?? (/\p{Script=Han}/u.test(key) ? 'The operation could not be completed. Check the local logs.' : key) : key;
      return text.replace(/\{(\w+)\}/g, (match,name) => Object.hasOwn(values,name) ? String(values[name]) : match);
    };
    const zone = timeZone === 'Asia/Shanghai' && locale === 'zh-CN' ? '北京时间' : timeZone;
    return {locale,timeZone,zone,t};
  }
  return {create};
});
