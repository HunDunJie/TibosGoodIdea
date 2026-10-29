using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Media;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

namespace CodexBottomBar {
  public static class WindowsAudio {
    // Core Audio is queried only. Set-method slots preserve the native COM vtable.
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] private class DeviceEnumerator { }
    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDeviceEnumerator {
      [PreserveSig] int EnumAudioEndpoints(int flow, uint mask, out IntPtr devices);
      [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice device);
    }
    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDevice {
      [PreserveSig] int Activate(ref Guid iid, uint context, IntPtr activation, out IAudioEndpointVolume volume);
    }
    [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioEndpointVolume {
      [PreserveSig] int RegisterControlChangeNotify(IntPtr notify);
      [PreserveSig] int UnregisterControlChangeNotify(IntPtr notify);
      [PreserveSig] int GetChannelCount(out uint channels);
      [PreserveSig] int SetMasterVolumeLevel(float level, ref Guid context);
      [PreserveSig] int SetMasterVolumeLevelScalar(float level, ref Guid context);
      [PreserveSig] int GetMasterVolumeLevel(out float level);
      [PreserveSig] int GetMasterVolumeLevelScalar(out float level);
      [PreserveSig] int SetChannelVolumeLevel(uint channel, float level, ref Guid context);
      [PreserveSig] int SetChannelVolumeLevelScalar(uint channel, float level, ref Guid context);
      [PreserveSig] int GetChannelVolumeLevel(uint channel, out float level);
      [PreserveSig] int GetChannelVolumeLevelScalar(uint channel, out float level);
      [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid context);
      [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
    }
    public sealed class VolumeState {
      public double Percent { get; set; }
      public bool Muted { get; set; }
    }
    public static VolumeState ReadVolume() {
      object enumeratorObject = null; IMMDevice device = null; IAudioEndpointVolume volume = null;
      try {
        enumeratorObject = new DeviceEnumerator();
        var enumerator = (IMMDeviceEnumerator)enumeratorObject;
        // eRender/eConsole: the default Windows playback endpoint used by legacy audio.
        Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 0, out device));
        var iid = typeof(IAudioEndpointVolume).GUID;
        Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, IntPtr.Zero, out volume));
        float level; bool muted;
        Marshal.ThrowExceptionForHR(volume.GetMasterVolumeLevelScalar(out level));
        Marshal.ThrowExceptionForHR(volume.GetMute(out muted));
        if (Single.IsNaN(level) || Single.IsInfinity(level) || level < 0 || level > 1) throw new Exception("无法读取音量");
        // Avoid float noise interpreting the Windows 1% setting as 0.99999998%.
        return new VolumeState { Percent = Math.Round(level * 100.0, 4), Muted = muted };
      } finally {
        if (volume != null) Marshal.ReleaseComObject(volume);
        if (device != null) Marshal.ReleaseComObject(device);
        if (enumeratorObject != null) Marshal.ReleaseComObject(enumeratorObject);
      }
    }
    private static readonly object Gate = new object();
    private static SoundPlayer player;
    private static NotifyIcon tray;
    private static System.Threading.Timer mouseTimer;
    private static string kind;
    private static int notificationsShown;
    public static int NotificationsShown { get { return Interlocked.CompareExchange(ref notificationsShown, 0, 0); } }
    public static string PlayingKind { get { lock (Gate) return kind; } }
    private static string codexExecutable;
    private static Point lastMouse;
    private static Thread uiThread;
    private static readonly ManualResetEvent Ready = new ManualResetEvent(false);
    private static string startupError;
    [StructLayout(LayoutKind.Sequential)] private struct POINT { public int X; public int Y; }
    [DllImport("user32.dll")] private static extern bool GetCursorPos(out POINT point);
    [DllImport("user32.dll")] private static extern IntPtr WindowFromPoint(POINT point);
    [DllImport("user32.dll")] private static extern IntPtr GetAncestor(IntPtr window, uint flag);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);

    private static void Emit(string action, string reason) {
      Console.Out.WriteLine("{\"event\":\"" + action + "\",\"reason\":\"" + reason + "\"}");
      Console.Out.Flush();
    }
    private static bool english;
    public static string Language { get { return english ? "en" : "zh-CN"; } }
    public static void SetLanguage(string language) { english = language != null && language.StartsWith("en", StringComparison.OrdinalIgnoreCase); }
    private static string T(string zh, string en) { return english ? en : zh; }
    public static void Start() {
      if (uiThread != null) return;
      uiThread = new Thread(delegate() {
        try {
          Application.EnableVisualStyles();
          var menu = new ContextMenuStrip();
          menu.Items.Add(T("停止本次响铃", "Stop sound"), null, delegate { Stop(); Emit("stop", "tray"); });
          menu.Items.Add(T("关闭刷新提醒", "Disable reset reminder"), null, delegate { Emit("disable-refresh", "tray"); });
          menu.Items.Add(T("关闭完成提醒", "Disable completion sound"), null, delegate { Emit("disable-completion", "tray"); });
          menu.Items.Add(new ToolStripSeparator());
          menu.Items.Add(T("声音设置", "Sound settings"), null, delegate { SoundSettings(); });
          menu.Items.Add(T("退出提醒服务（取消所有提醒）", "Exit service (cancel all reminders)"), null, delegate { Stop(); Emit("shutdown", "tray"); });
          tray = new NotifyIcon { Icon = SystemIcons.Information, Text = T("Codex 提醒：左键停止响铃，右键管理", "BottomBar Companion: click to stop, right-click to manage"), ContextMenuStrip = menu, Visible = true };
          tray.MouseClick += delegate(object sender, MouseEventArgs e) { if (e.Button == MouseButtons.Left) { Stop(); Emit("stop", "tray"); } };
          POINT initial; if (GetCursorPos(out initial)) lastMouse = new Point(initial.X, initial.Y);
          mouseTimer = new System.Threading.Timer(CheckMouse, null, 50, 50);
          Ready.Set(); Application.Run();
        } catch (Exception e) { startupError = e.Message; Ready.Set(); }
        finally { if (tray != null) { tray.Visible = false; tray.Dispose(); } }
      });
      uiThread.IsBackground = true; uiThread.SetApartmentState(ApartmentState.STA); uiThread.Start();
      if (!Ready.WaitOne(8000)) throw new Exception(T("托盘图标启动超时", "Tray icon startup timed out"));
      if (startupError != null) throw new Exception(startupError);
    }
    public static void SetCodex(string executable) { lock (Gate) codexExecutable = executable; }
    public static void CheckFile(string file) {
      if (!Path.IsPathRooted(file) || !String.Equals(Path.GetExtension(file), ".wav", StringComparison.OrdinalIgnoreCase) || !File.Exists(file))
        throw new Exception(T("请先配置可读取的 WAV 音乐文件", "Choose a readable WAV file in Settings"));
      using (var sound = new SoundPlayer(file)) sound.Load();
    }
    public static void Play(string file, string category, bool notify) {
      CheckFile(file);
      lock (Gate) {
        if (player != null) { player.Stop(); player.Dispose(); }
        player = new SoundPlayer(file); player.Load(); kind = category; player.PlayLooping();
      }
      if (category == "refresh" && notify && tray != null) {
        tray.BalloonTipTitle = T("Codex 五小时额度已到刷新时间", "Codex 5h reset time reached");
        tray.BalloonTipText = T("音乐最多循环播放 30 分钟。点击托盘图标停止；右键可关闭提醒。", "Sound loops for up to 30 minutes. Click the tray icon to stop; right-click to disable.");
        tray.ShowBalloonTip(4000);
        Interlocked.Increment(ref notificationsShown);
      }
    }
    public static void Stop() {
      lock (Gate) {
        kind = null;
        if (player != null) { player.Stop(); player.Dispose(); player = null; }
      }
    }
    private static void CheckMouse(object ignored) {
      try {
        lock (Gate) {
          POINT position; if (!GetCursorPos(out position)) return;
          var current = new Point(position.X, position.Y);
          if (current == lastMouse) return;
          lastMouse = current;
          if (kind == null || String.IsNullOrEmpty(codexExecutable)) return;
          var window = GetAncestor(WindowFromPoint(position), 2);
          uint pid; GetWindowThreadProcessId(window, out pid);
          using (var process = Process.GetProcessById((int)pid)) {
            if (!String.Equals(process.MainModule.FileName, codexExecutable, StringComparison.OrdinalIgnoreCase)) return;
          }
          Stop(); Emit("stop", "codex-mouse-move");
        }
      } catch { /* A disappearing or protected unrelated window is not Codex interaction. */ }
    }
    public static void SoundSettings() {
      Process.Start(new ProcessStartInfo("ms-settings:sound") { UseShellExecute = true });
    }
    public static void Dispose() {
      Stop(); if (mouseTimer != null) mouseTimer.Dispose();
      if (tray != null && tray.ContextMenuStrip.IsHandleCreated)
        tray.ContextMenuStrip.BeginInvoke(new Action(delegate { tray.Visible = false; Application.ExitThread(); }));
    }
  }
}
