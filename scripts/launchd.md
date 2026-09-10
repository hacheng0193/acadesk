# 開機自動啟動與每日備份

> **這一整份文件是 macOS 專屬的。** 其他作業系統上，Acadesk 本身照常運作
> （`npm run build && npm start`），只是沒有自動啟動與排程備份——請自行用
> systemd timer、cron 或任何習慣的方式定期跑 `npm run backup`。

兩個 macOS LaunchAgent：

- `com.acadesk.server` — 登入後自動在 http://localhost:3000 起 Acadesk
- `com.acadesk.backup` — 登入時備份一次，另外每天 13:00 與 21:00 各一次

- 設定檔：`~/Library/LaunchAgents/com.acadesk.server.plist`
- 實際執行：`scripts/serve.sh`（跑正式建置，沒有建置的話會先自己建）
- 記錄檔：`~/Library/Logs/acadesk.log`

## 安裝

```bash
npm run autostart:install
```

## 移除

```bash
npm run autostart:uninstall
```

## 常用操作

```bash
# 看狀態（state / pid / last exit code）
launchctl print gui/$(id -u)/com.acadesk.server | head -20

# 改完程式後重啟服務
npm run build && launchctl kickstart -k gui/$(id -u)/com.acadesk.server

# 看記錄
tail -f ~/Library/Logs/acadesk.log
```

## 注意事項

- 這是 **LaunchAgent**，在你「登入」後啟動，不是開機畫面就啟動。個人用的服務這樣才對——它需要你的家目錄，而且開機當下磁碟可能還沒解鎖。
- plist 裡寫的是絕對路徑。**搬動專案資料夾之後要重跑一次 `npm run autostart:install`。**
- 服務跑的是正式建置（`.next-prod`）；`npm run dev` 用的是 `.next`，兩者分開，不會互相破壞。
- 因為 3000 被這個服務長期佔著，之後開發時 dev server 會自動換一個 port。


---

# 備份

`npm run autostart:install` 會一併裝好備份代理。

**排程為什麼不是固定深夜時段**：睡眠中錯過的排程 launchd 會在喚醒後補跑（有文件保證），但**關機**不一樣——代理當時根本沒載入，下次登入是全新 bootstrap，會從當下往後算下一次觸發，錯過的那次不會補。所以改成登入時就跑一次，加上白天兩個時段涵蓋「機器連續開好幾天」的情況。

兩種產物各司其職：

| 產物 | 位置 | 內容 |
|---|---|---|
| 本機快照 | `backups/snapshots/acadesk-*.db` | **完整**，每天保留最新一份、共 14 天 |
| 異地匯出 | `backups/export/acadesk-export.json` | 文字，**不含**被開關排除的項目 |

快照用 `VACUUM INTO` 產生——WAL 模式下直接 `cp` 檔案是不安全的。

## 啟用 GitHub 異地備份

自己在 GitHub 開一個 **private** repo，然後：

```bash
cd backups/export
git init && git add -A && git commit -m "初始備份"
git remote add origin git@github.com:<你的帳號>/<repo>.git
git push -u origin HEAD
```

之後每日代理會自動 commit + push。**內容沒變就不會產生 commit**，不會有一堆空紀錄。

論文 PDF 不會進 git（版權與體積），靠 Time Machine／iCloud 覆蓋。

## 逐筆的備份開關

研究主題與研究日誌各有一個開關，預設開啟。關掉的項目**不會出現在 GitHub 匯出**，但**仍完整保存在本機快照**裡。關掉研究主題時，底下的日誌一律連帶排除。

從關閉改成開啟會跳確認框，因為那是不可逆的方向：**git 歷史撤不回**，一旦推送過，之後再關也只是不再出現在新的 commit。

## 還原

```bash
# 1. 先停服務，否則會寫回正在使用中的檔案
launchctl bootout gui/$(id -u)/com.acadesk.server

# 2. 覆蓋回去（先留一份現況以防萬一）
cp data/acadesk.db data/acadesk.db.before-restore
cp backups/snapshots/acadesk-<要還原的時間>.db data/acadesk.db
rm -f data/acadesk.db-wal data/acadesk.db-shm

# 3. 重新啟動
npm run autostart:install
```

從 GitHub 的 JSON 還原得到的是**不含被排除項目**的部分資料，完整還原一定要用本機快照。
