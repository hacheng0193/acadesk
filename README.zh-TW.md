# Acadesk

大學／研究生活管理系統。課程、作業、研究進度、時間、文獻、筆記都在一個地方。

跑在你自己的電腦上，沒有帳號密碼，沒有雲端，資料不離開這台機器（除了你自己設定的 GitHub 備份）。

English: [README.md](README.md) · 授權：[MIT](LICENSE)

---

## 安裝

需要 **Node.js 22 以上**（備份腳本用到 `--experimental-strip-types`）。開機自動啟動與每日備份是 macOS 專屬（兩個 LaunchAgent），其餘部分哪裡有 Node 都能跑。

```bash
git clone https://github.com/<你>/acadesk.git
cd acadesk
npm install
npm run build
npm start                   # http://localhost:3000
```

想讓它登入後自動啟動、每天自己備份（macOS）：

```bash
npm run autostart:install
```

會依照專案當下的位置產生 `com.acadesk.server` 與 `com.acadesk.backup` 兩個 LaunchAgent。**搬動資料夾後再跑一次同樣的指令**就會修好路徑。要停用：`npm run autostart:uninstall`。

資料庫在第一次啟動時自動建立於 `data/acadesk.db`，沒有 migration 步驟、沒有預設資料——你會拿到一個全空的系統。

---

## 有哪些頁面

| 頁面 | 用途 |
|---|---|
| **總覽** | 今天的課、七天內的事項、進行中的里程碑、今日時數與打卡 |
| **行程** | 作業、考試、演講、週報、meeting。看板與月曆兩種檢視，可設每週／每兩週重複 |
| **課程** | 課程資料與週課表 |
| **研究** | 研究主題 → 里程碑時間軸、研究日誌、相關論文與筆記、累計投入時數 |
| **筆記** | 直接讀寫你的 Obsidian vault，不是另一份拷貝 |
| **文獻** | 論文清單、標籤、關聯研究主題、本機 PDF |
| **時間** | 計時紀錄與實驗室進出打卡 |
| **統計** | 每週／每月時數、依主題分配、每日熱區、連續出勤 |
| **設定** | vault 路徑、時數目標、計時器、備份 |

側欄常駐**今日待辦**與**研究計時器**，每頁都在。

---

## 幾個好用的地方

**⌘K** — 打字就搜尋（行程、研究日誌、Obsidian 筆記、文獻、研究主題），清空輸入則變成快速新增。

**計時器不怕忘記停。** 頁面會定期回報「還開著」，如果電腦睡著或瀏覽器關掉，下次開啟時計時會**回溯結束在最後一次確認你還在的時刻**，不會把離開的十幾個小時算進統計。回來時會跳報告讓你確認或修正。

**論文可以貼 DOI 自動填。** 貼 DOI、arXiv 編號或整段 BibTeX，標題作者年份就填好了。付費論文（IEEE Xplore 那類）下載的 PDF 可以直接拖進來，會複製一份到論文庫，之後清 Downloads 也不會斷連。

**行事曆可以訂閱到 Mac。** 行程頁右上角「接到行事曆」。單向同步，改這邊會過去，改行事曆不會回來。

**筆記就是 vault 裡的檔案。** 在網頁改完，Obsidian 立刻看得到。如果同一篇你在兩邊都改過，存檔時會跳提示讓你選保留哪一份，不會靜默覆蓋。

---

## 選用設定

### Obsidian

到設定頁填 vault 的絕對路徑，或在 `.env.local` 設 `OBSIDIAN_VAULT`（範例見 [.env.example](.env.example)）。沒設定的話，筆記頁會告訴你尚未設定，其他功能完全不受影響。

### 備份

**本機快照一定會跑**，異地備份要自己接。

**每次登入時**跑一次，另外每天 13:00 和 21:00 各跑一次。之所以不用「凌晨三點」這種固定時間：機器如果那時是關機的，LaunchAgent 根本沒載入，下次開機會從當下往後重算，那一次就永遠不會補跑。登入時備份則不管你幾點開機都會發生。

多跑幾次不花成本——內容沒變就不會產生 commit，快照也只留每天最後一份。

兩份東西：

- **本機快照** `backups/snapshots/*.db` — 完整，**每天保留一份、共 14 天**，還原用這個
- **GitHub 異地備份** `backups/export/acadesk-export.json` — 推到你的 private repo，內容沒變就不會產生 commit

要啟用 GitHub 備份，自己開一個 **private** repo 然後：

```bash
cd backups/export
git init && git remote add origin <你的 private repo>
```

程式不會替你開 repo，也不碰你的憑證。

研究主題與研究日誌各有一個**備份開關**（預設開）。關掉的不會上傳到 GitHub，但**仍完整保存在本機快照**裡。關掉研究主題時，底下的日誌會一併排除。

> 從關閉改成開啟會跳確認框，因為 **git 歷史撤不回**——推送過的內容之後再關掉，也只是不再出現在新的 commit。有疑慮就先關著。

論文 PDF 不會上傳到 GitHub（版權與體積）。Obsidian 筆記在 vault 裡，沿用你原本的備份方式。

設定頁看得到上次備份時間與推送結果，也有「立即備份」。超過三天沒備份會變成橘色警示，避免它安靜地停掉而你沒發現。

---

## 你的資料在哪裡

| | |
|---|---|
| `data/acadesk.db` | 你輸入的一切。已 gitignore |
| `data/papers/` | 你附加的 PDF。已 gitignore |
| `backups/snapshots/` | 還原等級的 `.db`，每天最新一份、14 天。已 gitignore |
| `backups/export/` | 給 GitHub 備份用的 JSON。已 gitignore |
| 你的 Obsidian vault | 筆記本體，這個 repo 的備份不碰它，用你自己的方式備份 |

**全新 clone 下來不含以上任何一項。**

---

## 常用指令

```bash
npm run backup              # 手動備份一次
npm run autostart:install   # 重新安裝／修正路徑（搬動資料夾後要跑）
npm run autostart:uninstall # 停用自動啟動與每日備份
npm run dev                 # 開發模式（會自己換一個 port）
```

改完程式碼要重新建置並重啟服務，才會反映到 http://localhost:3000：

```bash
npm run build && launchctl kickstart -k gui/$(id -u)/com.acadesk.server
```

看記錄：

```bash
tail -f ~/Library/Logs/acadesk.log           # 網站
tail -f ~/Library/Logs/acadesk-backup.log    # 備份
```

---

## 出問題的時候

**網站打不開** — `launchctl print gui/$(id -u)/com.acadesk.server | head -20` 看狀態，再看上面的記錄檔。

**改了程式沒反應** — 服務跑的是建置產物，要 `npm run build` 再 kickstart。

**搜尋找不到東西** — 設定頁有「重建搜尋索引」。

**還原資料** — 步驟在 [scripts/launchd.md](scripts/launchd.md)，重點是**先停服務再覆蓋檔案**。從 GitHub 還原得到的是不含被排除項目的部分資料，完整還原一定要用本機快照。

---

## 已知限制

- **單人使用、沒有登入機制。** 它預設這是你自己的電腦，不要把它開到網路上。
- **全站唯一會對外連網的功能**是論文的 DOI／arXiv 查詢（Crossref／arXiv），送出的只有編號本身；BibTeX 完全在本機解析。
- **課表匯入是針對臺大課程網**（`course.ntu.edu.tw`）的貼上格式寫的。別的學校對不上，手動輸入課程即可，其他功能不依賴它。
- **介面是繁體中文**，程式碼與註解是英文。

---

## 技術細節

Next.js 15（App Router、server actions）+ SQLite（`better-sqlite3`，資料庫在 `data/acadesk.db`）。

資料庫 schema 在 [db/schema.sql](db/schema.sql)；要對既有資料庫新增欄位走 [lib/db.ts](lib/db.ts) 的 `ADDED_COLUMNS` 冪等遷移。schema 是每條連線套用一次，所以**改完 schema 要重啟服務**才會生效，熱重載不夠。

更多維運細節見 [scripts/launchd.md](scripts/launchd.md)。
