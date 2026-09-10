#!/bin/sh
# Remove both launchd agents. The app, its data and its backups are untouched.
set -e

for LABEL in com.acadesk.server com.acadesk.backup; do
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
done
echo "已移除開機自動啟動與每日備份（資料、備份與程式都沒動）"
