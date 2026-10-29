/* Only translates this add-on's own text. Native chats and drafts are never rewritten. */
(function (factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else api.install(globalThis, globalThis.__cqbPreferences ?? {});
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
  const japanese = {
  "不限": "無制限",
  "暂不可用": "取得できません",
  "时间暂不可用": "時刻を取得できません",
  "等待刷新": "更新待ち",
  "5小时": "5時間",
  "每周": "週間",
  "额度 ": "クレジット ",
  "可用重置": "利用可能なリセット",
  "-- 次": "-- 回",
  "{count} 次": "{count} 回",
  "次数未知": "回数不明",
  "Codex 剩余额度与可用重置": "Codex の残り使用量と利用可能なリセット",
  "跟随当前账户用量数据；点击时间切换显示模式，日期时间为{zone}。点击可用重置打开额度页面。": "現在のアカウントの使用量です 時刻をクリックすると表示を切り替えます（{zone}）利用可能なリセットをクリックすると使用量ページを開きます",
  "打开额度页面，与头像菜单中的可用重置相同": "プロフィールメニューのリセット項目と同じ使用量ページを開く",
  "暂未找到额度入口，请从头像菜单打开可用重置": "使用量ページを開けません プロフィールメニューから開いてください",
  "点击切换为日期时间（{zone}）": "日時を表示（{zone}）",
  "点击切换为剩余时间": "カウントダウンを表示",
  "点击打开使用量页面": "クリックして使用量ページを開く",
  "暂未取得刷新时间": "更新時刻を取得できません",
  "已开启": "オン",
  "已关闭": "オフ",
  "未连接": "未接続",
  "将于{time}发送所有聊天中的草稿，全部发送后将关闭定时发送": "{time} にすべてのチャットの下書きを送信し、完了後に予約送信をオフにします",
  "可开启，用于在额度刷新时自动发送所有聊天中的草稿，所有草稿发送后将关闭定时发送": "オンにすると使用量の更新時にすべてのチャットの下書きを送信し、完了後に予約送信をオフにします",
  "任意聊天回答结束时会播放音乐进行提醒，播放时长最多30分钟": "いずれかのチャットの回答が完了すると、最大30分間音楽で通知します",
  "可开启，用于在任意聊天回答结束时会播放音乐进行提醒，播放时长最多30分钟": "オンにするといずれかのチャットの回答完了を最大30分間音楽で通知します",
  "将于{time}播放音乐提醒": "{time} に音楽で通知します",
  "可开启，用于额度刷新时播放音乐进行提醒，播放时长最多30分钟，退出Codex仍然有效": "オンにすると使用量の更新を最大30分間音楽で通知します Codex を終了しても有効です",
  "{label}刷新时间，{time}，{zone}，{action}": "{label}の更新時刻：{time}（{zone}）{action}",
  "点击显示日期时间": "日時を表示",
  "点击显示剩余时间": "カウントダウンを表示",
  "{label}额度，剩余 {value}，{time}，{zone}": "{label}の残り使用量：{value}、{time}（{zone}）",
  "购买额度的剩余点数：{value}": "購入済みクレジットの残高：{value}",
  "可用重置 {count}，打开额度页面": "利用可能なリセット：{count} 使用量ページを開く",
  "北京时间": "北京時間",
  "定时发送": "予約送信",
  "完成提醒": "完了通知",
  "刷新提醒": "更新通知",
  "聊天与额度提醒": "チャットと使用量の通知",
  "发送中": "送信中",
  "完成 {sent} / 跳过 {skipped}": "送信 {sent} / スキップ {skipped}",
  "发送中断": "送信中断",
  "已取消": "キャンセル済み",
  "已过期": "期限切れ",
  "播放中": "再生中",
  "监听中": "待機中",
  "等待连接": "接続待ち",
  "响铃中": "通知音を再生中",
  "已安排": "設定済み",
  "等刷新时间": "更新時刻を待機中",
  "需处理": "確認が必要",
  "未开启": "オフ",
  "下次响铃：{time}（{zone}）；退出 Codex 后仍生效。": "次の通知：{time}（{zone}）Codex を終了しても有効です",
  "手动开启一次；五小时额度刷新确认后发送各聊天草稿，本轮结束自动关闭。": "手動でオンにすると、5時間の使用量の更新確認後に各チャットの下書きを送信し、この1回でオフになります",
  "聊天任务完成时只播放音乐，最多循环 30 分钟；鼠标在 Codex 内移动、点击或输入即停。": "チャットの完了時に最大30分間音楽を再生します Codex 内でのマウス移動、クリック、入力で停止します",
  "五小时额度重置后一分钟发出通知并循环响铃，最多 30 分钟；可在托盘中停止或关闭。": "5時間の使用量の更新から1分後に通知し、最大30分間音楽を再生します トレイから停止または無効にできます",
  "当前系统已静音，可能听不到刷新提醒": "現在ミュートになっています 更新通知の音が聞こえない可能性があります",
  "当前音量低于 1%，可能听不到刷新提醒": "現在の音量は1%未満です 更新通知の音が聞こえない可能性があります",
  "请通过底栏启动器连接后台": "ボトムバーランチャーから通知サービスに接続してください",
  "请用底栏启动器连接后台": "ボトムバーランチャーから通知サービスに接続してください",
  "提醒后台响应超时": "通知サービスの応答がタイムアウトしました",
  "底栏已恢复": "元のレイアウトに戻しました",
  "尚未连接到当前客户端的任务与草稿接口，请稍后重试": "タスクと下書きのインターフェースに接続できません 少し待って再試行してください",
  "当前客户端版本未适配任务事件与草稿接口": "この Codex バージョンのタスクイベントと下書きには対応していません",
  "找不到客户端模块入口": "Codex のモジュール入口が見つかりません",
  "客户端功能接口不可用": "Codex の機能インターフェースを利用できません",
  "尚未取得客户端状态": "Codex の状態を取得できません",
  "当前账户和额度数据不一致": "現在のアカウントと使用量データが一致しません",
  "上次发送中断，请检查聊天；不会自动重发": "前回の送信が中断されました チャットを確認してください 自動再送は行いません",
  "无效开关状态": "無効な切り替え状態です",
  "正在发送，请等待本轮结束": "送信中です 今回の送信が完了するまでお待ちください",
  "尚未取得下一次五小时重置时间，请稍后再开启": "次の5時間の更新時刻を取得できません 後でオンにしてください",
  "未知功能": "不明な機能です",
  "账户已切换，本轮已取消": "アカウントが切り替わったため、今回の送信をキャンセルしました",
  "本轮发送超时或客户端已退出，请检查聊天；不会自动重发": "送信がタイムアウトしたか Codex が終了しました チャットを確認してください 自動再送は行いません",
  "错过本轮刷新，已关闭；没有发送草稿": "今回の更新を過ぎたためオフにしました 下書きは送信していません",
  "播放器意外退出，可重新开关提醒": "プレーヤーが終了しました 通知をオフにしてから再度オンにしてください",
  "提醒后台连接超时": "通知サービスへの接続がタイムアウトしました",
  "提醒后台未运行": "通知サービスは起動していません",
  "无效后台响应": "通知サービスの応答が無効です",
  "无法启动独立提醒进程": "独立した通知サービスを起動できません",
  "请在 config.local.json 配置对应 WAV 文件": "設定で WAV ファイルを選択してください",
  "音乐文件不存在或超过 128 MB": "音楽ファイルが存在しないか128 MBを超えています",
  "请先配置可读取的 WAV 音乐文件": "読み取り可能な WAV ファイルを設定してください",
  "音乐播放失败": "音楽を再生できません",
  "播放器响应超时": "プレーヤーの応答がタイムアウトしました",
  "托盘播放器启动超时": "トレイプレーヤーの起動がタイムアウトしました",
  "无法启动 Windows 播放器": "Windows プレーヤーを起動できません",
  "托盘播放器已退出": "トレイプレーヤーは終了しました",
  "播放器已退出": "プレーヤーは終了しました",
  "暂时无法读取系统音量": "システム音量を取得できません",
  "未知后台命令": "不明なサービスコマンドです",
  "无效客户端路径": "Codex の実行ファイルのパスが無効です"
};
  const supportedLocales = ['zh-CN','en','ja'];
  function normalizeLocale(value) {
    return /^zh(?:-|$)/i.test(value ?? '') ? 'zh-CN' : /^ja(?:-|$)/i.test(value ?? '') ? 'ja' : 'en';
  }
  function create(preferences = {}, systemLanguage = 'zh-CN') {
    const selected = !preferences.language || preferences.language === 'auto' ? systemLanguage : preferences.language;
    const locale = normalizeLocale(selected);
    let timeZone = preferences.timeZone;
    if (!timeZone || timeZone === 'auto') timeZone = locale === 'zh-CN' ? 'Asia/Shanghai' : Intl.DateTimeFormat().resolvedOptions().timeZone;
    try { new Intl.DateTimeFormat('en',{timeZone}).format(); } catch { timeZone = locale === 'zh-CN' ? 'Asia/Shanghai' : 'UTC'; }
    const t = (key, values = {}) => {
      const dictionary = locale === 'ja' ? japanese : english;
      let text = locale === 'zh-CN' ? key : dictionary[key] ?? (locale === 'ja' && /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(key) ? key : /\p{Script=Han}/u.test(key) ? locale === 'ja' ? '操作を完了できません ローカルログを確認してください' : 'The operation could not be completed. Check the local logs.' : key);
      return text.replace(/\{(\w+)\}/g, (match,name) => Object.hasOwn(values,name) ? String(values[name]) : match);
    };
    const zone = timeZone === 'Asia/Shanghai' ? t('北京时间') : timeZone;
    return {locale,timeZone,zone,t};
  }
  function install(win,preferences = {}) {
    win.__cqbI18n?.dispose?.();
    const read = () => create({timeZone:preferences.timeZone},win.document.documentElement.lang || win.navigator?.language || 'en');
    let current = read();
    const api = {get locale(){return current.locale},get timeZone(){return current.timeZone},get zone(){return current.zone},t:(...args)=>current.t(...args),dispose(){observer.disconnect();if(win.__cqbI18n===api)delete win.__cqbI18n}};
    const observer = new win.MutationObserver(() => {
      const next = read();
      if(next.locale === current.locale && next.timeZone === current.timeZone)return;
      current = next;
      win.dispatchEvent(new win.CustomEvent('cqb-languagechange',{detail:{locale:current.locale,timeZone:current.timeZone}}));
    });
    observer.observe(win.document.documentElement,{attributes:true,attributeFilter:['lang']});
    win.__cqbI18n = api;
    return api;
  }
  return {create,install,normalizeLocale,supportedLocales,translationKeys:Object.keys(english)};
});
