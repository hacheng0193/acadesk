#!/bin/sh
# Daily backup entry point for the login agent.
#
# Local snapshot always runs. The GitHub push only happens if the user has set
# up backups/export as a git repo with a remote - it is opt-in, and the app
# never creates repos or touches credentials on the user's behalf.
set -e

cd "$(dirname "$0")/.."

# launchd hands processes a bare PATH; git and node both need putting back.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

EXPORT_DIR="backups/export"
record() { node --experimental-strip-types scripts/record-setting.mts "$1" "$2" 2>/dev/null || true; }

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 開始備份"
node --experimental-strip-types scripts/backup.mts

if [ ! -d "$EXPORT_DIR/.git" ]; then
  echo "[acadesk-backup] 未設定 git 遠端備份，只做本機快照"
  record git_backup_status "未設定"
  exit 0
fi

cd "$EXPORT_DIR"

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "[acadesk-backup] git repo 沒有 origin 遠端，略過推送"
  cd - >/dev/null
  record git_backup_status "沒有設定 origin 遠端"
  exit 0
fi

git add -A

# Nothing changed today: don't manufacture an empty commit.
if git diff --cached --quiet; then
  echo "[acadesk-backup] 內容無變化，不產生 commit"
  cd - >/dev/null
  record git_backup_status "無變化（$(date '+%Y-%m-%d %H:%M')）"
  exit 0
fi

git commit -q -m "備份 $(date '+%Y-%m-%d %H:%M')"

if git push -q origin HEAD 2>/tmp/acadesk-git-push.err; then
  echo "[acadesk-backup] 已推送到 GitHub"
  cd - >/dev/null
  record git_backup_status "成功（$(date '+%Y-%m-%d %H:%M')）"
else
  ERR=$(tr '\n' ' ' < /tmp/acadesk-git-push.err | cut -c1-300)
  echo "[acadesk-backup] 推送失敗：$ERR"
  cd - >/dev/null
  # Surface it in the UI. A backup that fails quietly is not a backup.
  record git_backup_status "推送失敗（$(date '+%Y-%m-%d %H:%M')）：$ERR"
  exit 1
fi
