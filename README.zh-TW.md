# Acadesk

大學／研究生活管理系統。課程、作業、研究進度、時間、文獻、筆記都在一個地方。

跑在你自己的電腦上，沒有帳號密碼，沒有雲端，資料不離開這台機器（除了你自己設定的 GitHub 備份與 NTU COOL 同步）。服務只聽 `127.0.0.1`，網路上的其他裝置連不到。

English: [README.md](README.md) · 授權：[MIT](LICENSE)

---

## 安裝

需要 **Node.js 22 以上**（備份腳本用到 `--experimental-strip-types`）。開機自動啟動與每日備份是 macOS 專屬（兩個 LaunchAgent），其餘部分哪裡有 Node 都能跑。

```bash
git clone https://github.com/hacheng0193/acadesk.git
cd acadesk
npm install
npm run build
npm start                   # http://localhost:3000（只有本機連得到）
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
| **課程** | 課程資料與週課表；可一併建立對應的研究主題，從課表方塊直接點過去。可一鍵同步 NTU COOL |
| **講義** | NTU COOL 上各課程的檔案，依模組（週次）排列；可預覽、下載到 vault 或略過 |
| **研究** | 研究主題 → 里程碑時間軸、研究日誌、相關論文與筆記、累計投入時數；可分成研究／課程／Side project 並篩選 |
| **筆記** | 直接讀寫你的 Obsidian vault，不是另一份拷貝；側欄是可摺疊的資料夾樹 |
| **文獻** | 論文清單、標籤、關聯研究主題、本機 PDF |
| **文獻回顧** | 把論文並排成比較矩陣，旁邊寫綜合整理，可匯出 |
| **時間** | 計時紀錄與實驗室進出打卡 |
| **統計** | 每週／每月時數、依主題分配、每日熱區、連續出勤 |
| **設定** | vault 路徑、時數目標、計時器、備份 |

側欄常駐**今日待辦**與**研究計時器**，每頁都在。

---

## 幾個好用的地方

**⌘K** — 打字就搜尋（行程、Obsidian 筆記（含研究日誌）、文獻、研究主題），清空輸入則變成快速新增。

**計時器不怕忘記停。** 頁面會定期回報「還開著」，如果電腦睡著或瀏覽器關掉，下次開啟時計時會**回溯結束在最後一次確認你還在的時刻**，不會把離開的十幾個小時算進統計。回來時會跳報告讓你確認或修正。

**論文可以貼 DOI 自動填。** 貼 DOI、arXiv 編號或整段 BibTeX，標題作者年份就填好了。付費論文（IEEE Xplore 那類）下載的 PDF 可以直接拖進來，會複製一份到論文庫，之後清 Downloads 也不會斷連。

**行事曆可以訂閱到 Mac。** 行程頁右上角「接到行事曆」。單向同步，改這邊會過去，改行事曆不會回來。

**筆記就是 vault 裡的檔案。** 在網頁改完，Obsidian 立刻看得到。如果同一篇你在兩邊都改過，存檔時會跳提示讓你選保留哪一份，不會靜默覆蓋。點開筆記預設是預覽模式，工具列有「複製全文」可以一次帶走整份 Markdown 原始內容。

**研究主題可以跟隨整個資料夾。** 不是一次性匯入——資料夾是綁在主題上的，每次開啟頁面才對當下的 vault 展開，所以你今天往 `daily/` 丟一篇新筆記，它自己就會出現在相關筆記裡。選一個資料夾等於連它底下所有子資料夾。「＋ 新增筆記」則會直接在 vault 建檔、自動連結、並開啟它。

**研究日誌就是筆記。** 「＋ 新增紀錄」會在 vault 建立 `<主題跟隨的資料夾>/<日期> <標題>.md`，frontmatter 帶 `type`（`experiment`／`meeting`／`idea`）與 `date`，建檔前表單上就看得到完整路徑，建完直接開啟繼續寫。主題頁的日誌只列標題、日期與前兩行摘要，點進去才看全文。規則很單純：**連到這個主題、且 frontmatter 的 `type` 是上述三種之一的筆記**就會出現在日誌裡，所以在 Obsidian 裡照這個格式寫的筆記也算。主題還沒跟隨任何資料夾時，會自動跟隨以主題命名的資料夾。舊版存在資料庫裡的紀錄，用 `node --experimental-strip-types scripts/migrate-logs-to-vault.mts` 預演、加 `--apply` 搬進 vault（會先留一份資料庫快照）。

**NTU COOL 一鍵同步。** 總覽與課程頁的「同步 NTU COOL」用你瀏覽器的登入 cookie 讀取 COOL（只讀，設定方式見下面「選用設定」），會：

- 把作業放進行程，標上「COOL 作業」；COOL 顯示已繳交就自動打勾，截止時間改了會跟著更新；同課程、同標題的手動事項會被接管，不會重複建立
- 列出新公告
- 列出各課程模組裡的檔案，讓你勾選要下載到 vault 的 `<課名>/Lectures/`，其餘可以先從 COOL 直接預覽，或略過

按鈕底下會標上次同步的時間。服務開著的時候，08:00–18:00 之間只要距離上次同步超過一小時就會自動同步一次，有新作業或新公告會跳 macOS 通知（第一次可能要到「系統設定 → 通知」允許「工序指令編寫程式」／Script Editor）；cookie 過期也會通知一次。不想要的話在 `.env.local` 設 `COOL_AUTO_SYNC=0`。

研究主題頁有「講義」按鈕，直接跳到該課的講義。

**PDF 用內建的檢視器開。** 用 PDF.js 自己畫頁面，所以在沒有 PDF 外掛的瀏覽器裡也看得到（文獻頁也是）。已下載的檔案另外可以用「預覽程式」開，或在 Finder 中顯示。

**課程可以接到研究主題。** 新增課程時預設會建立一個同名的研究主題（類別自動標成「課程」），之後從課程卡片或課表方塊點一下就能跳過去。用的是真正的外鍵，所以之後改名任一邊都不會斷連。不需要的課選「不連結」即可。

---

## 選用設定

### Obsidian

到設定頁填 vault 的絕對路徑，或在 `.env.local` 設 `OBSIDIAN_VAULT`（範例見 [.env.example](.env.example)）。沒設定的話，筆記頁會告訴你尚未設定，其他功能完全不受影響。

### NTU COOL

1. 在瀏覽器登入 `cool.ntu.edu.tw`
2. 開 DevTools（⌥⌘I）→ Network，重新整理，點任一個送到 `cool.ntu.edu.tw` 的請求
3. 在 Request Headers 找到 `Cookie`，把**整串值**複製到 `.env.local`：

   ```bash
   COOL_COOKIE=_normandy_session=...; log_session_id=...
   ```

4. 重啟服務，到課程頁按「同步 NTU COOL」

在 Console 打 `document.cookie` 拿不到——`_normandy_session` 是 HttpOnly，只能從 Network 或 Application → Cookies 複製。

課程會先用課號、再用課名自動對到 COOL 課程；對錯的到課程的編輯表單改，或選「不同步」。下載講義需要先設定 Obsidian vault。cookie 在你登出 COOL 或閒置一段時間後失效，同步時會提示，重新複製一份即可。程式只送 `GET` 請求，cookie 除了送給 COOL 本身之外不會離開這台電腦。

COOL 是 Canvas LMS，所以 `COOL_BASE_URL` 理論上可以指向別校的 Canvas，但只在 NTU COOL 上試過。

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

研究主題有一個**備份開關**（預設開）。關掉的不會上傳到 GitHub，但**仍完整保存在本機快照**裡。研究日誌是 vault 裡的筆記，本來就不在匯出範圍內。

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
| 你的 Obsidian vault | 筆記本體，以及從 COOL 下載的講義（`<課名>/Lectures/`）。這個 repo 的備份不碰它，用你自己的方式備份 |
| `.env.local` | 選用設定，包含 COOL cookie。已 gitignore |

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

**COOL 同步說 cookie 被拒絕** — 登入 session 過期了。到瀏覽器重新登入 COOL，照上面的步驟重新複製 Cookie 到 `.env.local`，再重啟服務。

**還原資料** — 步驟在 [scripts/launchd.md](scripts/launchd.md)，重點是**先停服務再覆蓋檔案**。從 GitHub 還原得到的是不含被排除項目的部分資料，完整還原一定要用本機快照。

---

## 已知限制

- **單人使用、沒有登入機制。** 它預設這是你自己的電腦，所以服務只聽 `127.0.0.1`，手機或別台電腦連不到。不要用反向代理或通道把它開到網路上——設了 COOL cookie 之後，連得到的人就能讀你的 COOL 課程。
- **對外連線只有兩處**：論文的 DOI／arXiv 查詢（Crossref／arXiv），送出的只有編號本身；以及 NTU COOL，只有設定 `COOL_COOKIE` 才會連。BibTeX 完全在本機解析。
- **部分按鈕只在 macOS 有用**：「Finder」、「預覽程式」與開啟本機 `file://` 連結都靠 `open` 指令，其餘功能各平台都能用。
- **課表匯入是針對臺大課程網**（`course.ntu.edu.tw`）的貼上格式寫的。別的學校對不上，手動輸入課程即可，其他功能不依賴它。
- **介面是繁體中文**，程式碼與註解是英文。

---

## 技術細節

Next.js 15（App Router、server actions）+ SQLite（`better-sqlite3`，資料庫在 `data/acadesk.db`）。

資料庫 schema 在 [db/schema.sql](db/schema.sql)；要對既有資料庫新增欄位走 [lib/db.ts](lib/db.ts) 的 `ADDED_COLUMNS` 冪等遷移。schema 是每條連線套用一次，所以**改完 schema 要重啟服務**才會生效，熱重載不夠。

更多維運細節見 [scripts/launchd.md](scripts/launchd.md)。
