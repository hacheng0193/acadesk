#!/bin/sh
# Install the launchd agents:
#   com.acadesk.server - keeps the app running on http://localhost:3000
#   com.acadesk.backup - daily local snapshot (+ GitHub push if configured)
#
# Both plists are generated from wherever the project currently lives, so moving
# the folder and re-running this is all it takes to fix the paths.
set -e

PROJECT="$(cd "$(dirname "$0")/.." && pwd)"
LOGDIR="$HOME/Library/Logs"
AGENTS="$HOME/Library/LaunchAgents"

mkdir -p "$AGENTS" "$LOGDIR"

# bootout returns before the job is actually gone; bootstrapping over a
# still-unloading service fails with a bare "Input/output error".
wait_gone() {
  i=0
  while launchctl print "gui/$(id -u)/$1" >/dev/null 2>&1 && [ "$i" -lt 30 ]; do
    sleep 0.5
    i=$((i + 1))
  done
}

reload() {
  label="$1"
  plist="$AGENTS/$label.plist"
  plutil -lint "$plist" > /dev/null
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
  wait_gone "$label"
  launchctl bootstrap "gui/$(id -u)" "$plist"
}

# ---------- server: runs at login, restarts if it dies ----------
cat > "$AGENTS/com.acadesk.server.plist" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.acadesk.server</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/sh</string>
        <string>$PROJECT/scripts/serve.sh</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$PROJECT</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>30</integer>
    <key>StandardOutPath</key>
    <string>$LOGDIR/acadesk.log</string>
    <key>StandardErrorPath</key>
    <string>$LOGDIR/acadesk.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>NODE_ENV</key>
        <string>production</string>
    </dict>
</dict>
</plist>
PLIST_EOF

# ---------- backup: opportunistic, then exits ----------
# KeepAlive is deliberately absent: this is a one-shot job, not a service.
#
# Scheduling notes, which are the whole reason this is not a single nightly run:
#   - Asleep at the scheduled time: launchd fires it on wake (documented).
#   - Powered off at the scheduled time: the agent is not loaded at all, and a
#     fresh bootstrap at next login computes its next fire date going forward -
#     so a 3am-only schedule silently never runs on a machine that sleeps off
#     overnight. RunAtLoad covers that case by backing up shortly after login.
#   - The midday/evening intervals cover the opposite case: a machine left on
#     for days, where RunAtLoad never fires again.
# Running more often is cheap: unchanged content produces no git commit, and
# snapshots are pruned to the newest one per day.
cat > "$AGENTS/com.acadesk.backup.plist" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.acadesk.backup</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/sh</string>
        <string>$PROJECT/scripts/backup-run.sh</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$PROJECT</string>
    <key>RunAtLoad</key>
    <true/>
    <key>StartCalendarInterval</key>
    <array>
        <dict>
            <key>Hour</key>
            <integer>13</integer>
            <key>Minute</key>
            <integer>0</integer>
        </dict>
        <dict>
            <key>Hour</key>
            <integer>21</integer>
            <key>Minute</key>
            <integer>0</integer>
        </dict>
    </array>
    <key>StandardOutPath</key>
    <string>$LOGDIR/acadesk-backup.log</string>
    <key>StandardErrorPath</key>
    <string>$LOGDIR/acadesk-backup.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
</dict>
</plist>
PLIST_EOF

reload com.acadesk.server
reload com.acadesk.backup

echo "已啟用開機自動啟動與每日備份"
echo "  專案：$PROJECT"
echo "  網址：http://localhost:3000"
echo "  記錄：$LOGDIR/acadesk.log · $LOGDIR/acadesk-backup.log"
echo
if [ -d "$PROJECT/backups/export/.git" ]; then
  echo "  GitHub 備份：已設定"
else
  echo "  GitHub 備份：尚未設定（只會做本機快照）"
  echo "  要啟用的話，自己在 GitHub 開一個 private repo，然後："
  echo "    cd $PROJECT/backups/export"
  echo "    git init && git remote add origin <你的 private repo>"
fi
