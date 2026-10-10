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
| **總覽** | 今天的課、七天內的事項、進行中的里程碑、今日時數與打卡、同步 NTU COOL |
| **行程** | 作業、考試、演講、週報、meeting。看板與月曆兩種檢視，可設每週／每兩週重複 |
| **課程** | 課程資料與週課表；可一併建立對應的研究主題，從課表方塊直接點過去。可一鍵同步 NTU COOL |
| **講義** | NTU COOL 上各課程的檔案，依模組（週次）排列；可預覽、下載到 vault 或略過 |
| **研究** | 研究主題 → 里程碑時間軸、研究日誌、相關論文與筆記、累計投入時數；可分成研究／課程／Side project 並篩選 |
| **筆記** | 直接讀寫你的 Obsidian vault，不是另一份拷貝；側欄是可摺疊的資料夾樹 |
| **文獻** | 論文清單、標籤、關聯研究主題、本機 PDF；點標題進閱讀頁：左邊論文、右邊筆記／Highlights／問 AI |
| **文獻回顧** | 把論文並排成比較矩陣，旁邊寫綜合整理，可匯出 |
| **時間** | 計時紀錄與實驗室進出打卡 |
| **統計** | 每週／每月時數、依主題分配、每日熱區、連續出勤 |
| **設定** | vault 路徑、時數目標、計時器、備份 |

側欄常駐**今日待辦**與**研究計時器**，每頁都在。

---

## 幾個好用的地方

**⌘K** — 打字就搜尋（行程、Obsidian 筆記（含研究日誌）、文獻、研究主題），清空輸入則變成快速新增。

**計時器不怕忘記停。** 頁面會定期回報「還開著」，如果電腦睡著或瀏覽器關掉，下次開啟時計時會**回溯結束在最後一次確認你還在的時刻**，不會把離開的十幾個小時算進統計。回來時會跳報告讓你確認或修正。

**論文可以貼 DOI 自動填。** 貼 DOI、arXiv 編號或整段 BibTeX，標題作者年份就填好了。付費論文（IEEE Xplore 那類）下載的 PDF 可以直接拖進來，會複製一份到論文庫，之後清 Downloads 也不會斷連。把 PDF 拖到文獻頁任何地方，就會直接新增一篇論文並打開閱讀頁。

**論文閱讀頁像 alphaXiv。** 左邊是論文，右邊三個分頁：
- **筆記**：每篇論文一份 vault 筆記（`Papers/<標題>.md`，frontmatter 帶 paper_id），邊讀邊寫、自動儲存，Obsidian 那邊同時看得到。舊的論文筆記第一次打開時會自動搬進去。
- **Highlights**：在論文上反白，選顏色就畫上重點，也可以加註解、插入筆記（`> 引文 — p.N`）、全部匯出到筆記。
- **問 AI**：用本機的 Claude Code 或 Codex 問這篇論文，吃你已登入的訂閱，不需要 API key。論文會先抽成純文字（`data/paper-ai/`），AI 只拿到唯讀權限；回答裡的 `p.N` 點了會跳頁，追問會接續同一段對話。反白後按「問 AI」可以針對那段問。⚙ 可以指定模型（例如 CLI 預設模型不能用時）。

**行事曆可以訂閱到 Mac。** 行程頁右上角「接到行事曆」。單向同步，改這邊會過去，改行事曆不會回來。

**筆記就是 vault 裡的檔案。** 在網頁改完，Obsidian 立刻看得到。如果同一篇你在兩邊都改過，存檔時會跳提示讓你選保留哪一份，不會靜默覆蓋。點開筆記預設是預覽模式，工具列有「複製全文」可以一次帶走整份 Markdown 原始內容。

**研究主題可以跟隨整個資料夾。** 不是一次性匯入——資料夾是綁在主題上的，每次開啟頁面才對當下的 vault 展開，所以你今天往 `daily/` 丟一篇新筆記，它自己就會出現在相關筆記裡。選一個資料夾等於連它底下所有子資料夾。「＋ 新增筆記」則會直接在 vault 建檔、自動連結、並開啟它。

**研究日誌就是筆記。** 「＋ 新增紀錄」會在 vault 建立 `<主題跟隨的資料夾>/<日期> <標題>.md`，frontmatter 帶 `type`（`experiment`／`meeting`／`idea`）與 `date`，建檔前表單上就看得到完整路徑，建完直接開啟繼續寫。主題頁的日誌只列標題、日期與前兩行摘要，點進去才看全文。規則很單純：**連到這個主題、且 frontmatter 的 `type` 是上述三種之一的筆記**就會出現在日誌裡，所以在 Obsidian 裡照這個格式寫的筆記也算。主題還沒跟隨任何資料夾時，會自動跟隨以主題命名的資料夾。舊版存在資料庫裡的紀錄，用 `node --experimental-strip-types scripts/migrate-logs-to-vault.mts` 預演、加 `--apply` 搬進 vault（會先留一份資料庫快照）。

**NTU COOL 一鍵同步。** 總覽與課程頁的「同步 NTU COOL」用鑰匙圈裡的台大帳密登入 COOL（只讀，設定方式見下面「選用設定」），會：

- 把作業放進行程，標上「COOL 作業」；COOL 顯示已繳交就自動打勾，截止時間改了會跟著更新；同課程、同標題的手動事項會被接管，不會重複建立
- 列出新公告
- 列出各課程模組裡的檔案，讓你勾選要下載到 vault 的 `<課名>/Lectures/`，其餘可以先從 COOL 直接預覽，或略過

按鈕底下會標上次同步的時間。服務開著的時候，08:00–18:00 之間只要距離上次同步超過一小時就會自動同步一次，有新作業或新公告會跳 macOS 通知（第一次可能要到「系統設定 → 通知」允許「工序指令編寫程式」／Script Editor）；自動登入失敗也會通知一次。不想要的話在 `.env.local` 設 `COOL_AUTO_SYNC=0`。

研究主題頁有「講義」按鈕，直接跳到該課的講義。

**PDF 用內建的檢視器開。** 用 PDF.js 自己畫頁面，所以在沒有 PDF 外掛的瀏覽器裡也看得到（文獻頁也是）。已下載的檔案另外可以用「預覽程式」開，或在 Finder 中顯示。

**課程可以接到研究主題。** 新增課程時預設會建立一個同名的研究主題（類別自動標成「課程」），之後從課程卡片或課表方塊點一下就能跳過去。用的是真正的外鍵，所以之後改名任一邊都不會斷連。不需要的課選「不連結」即可。

---

## 選用設定

### Obsidian

到設定頁填 vault 的絕對路徑，或在 `.env.local` 設 `OBSIDIAN_VAULT`（範例見 [.env.example](.env.example)）。沒設定的話，筆記頁會告訴你尚未設定，其他功能完全不受影響。

### NTU COOL

系統用你的台大帳密自動登入 COOL（走跟瀏覽器一樣的流程：COOL → 台大 SSO → 回到 COOL），帳密存在 macOS 鑰匙圈。

1. 在終端機執行（換成你的學號），它會請你輸入密碼，密碼不會留在指令紀錄裡：

   ```bash
   security add-generic-password -s alex-system-ntu -a 你的學號 -w
   ```

2. 重啟服務，到總覽或課程頁按「同步 NTU COOL」；之後白天也會每小時自動同步
3. 在同步視窗按「看紀錄」，第一行應該是「開始同步（認證：鑰匙圈帳密自動登入）」

登入後拿到的 cookie 存在資料庫裡重複使用。COOL 拒絕它的時候（通常大約一天），系統會自己重新登入、把請求重送一次，跳出「NTU COOL 已自動重新登入」通知，並在 `data/cool-auth.log` 記一行。如果台大 SSO 說帳密錯誤，自動登入會暫停（避免每小時試一次把帳號鎖住），要等你自己按一次「同步 NTU COOL」才會再試。不想再讓系統登入，刪掉鑰匙圈裡的 `alex-system-ntu` 就好；名稱可以用 `NTU_KEYCHAIN_SERVICE` 改。

**沒有鑰匙圈項目的話**，可以改用瀏覽器的登入 cookie，但它在你登出 COOL 或閒置一段時間後就會失效：開 DevTools（⌥⌘I）→ Network，重新整理，點任一個送到 `cool.ntu.edu.tw` 的請求，在 Request Headers 找到 `Cookie`，把**整串值**設成 `.env.local` 的 `COOL_COOKIE=...`。在 Console 打 `document.cookie` 拿不到——`_normandy_session` 是 HttpOnly。兩個都有的話用鑰匙圈。

課程會先用課號、再用課名自動對到 COOL 課程；對錯的到課程的編輯表單改，或選「不同步」。下載講義需要先設定 Obsidian vault。程式只對 COOL 送 `GET` 請求，帳密和 cookie 除了送給台大 SSO 和 COOL 本身之外不會離開這台電腦。

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
| `data/paper-ai/` | 給「問 AI」用的論文純文字快取。已 gitignore，刪掉會自動重建 |
| `backups/snapshots/` | 還原等級的 `.db`，每天最新一份、14 天。已 gitignore |
| `backups/export/` | 給 GitHub 備份用的 JSON。已 gitignore |
| 你的 Obsidian vault | 筆記本體，以及從 COOL 下載的講義（`<課名>/Lectures/`）。這個 repo 的備份不碰它，用你自己的方式備份 |
| `.env.local` | 選用設定，包含備用的 COOL cookie。已 gitignore |

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

**跳出「NTU COOL 自動同步失敗」通知，或同步說自動登入失敗** — 看 `data/cool-auth.log` 最後幾行。「學校登入系統拒絕了鑰匙圈裡的帳號密碼」：你改過台大密碼，用 `security add-generic-password -U -s alex-system-ntu -a 你的學號 -w` 更新鑰匙圈，再手動按一次「同步 NTU COOL」。「找不到學校的登入表單」或「沒有回到 COOL」：學校登入頁改版或多了驗證步驟，自動登入要跟著改。用 `COOL_COOKIE` 的話，是登入 session 過期了，重新複製一份並重啟服務。

**還原資料** — 步驟在 [scripts/launchd.md](scripts/launchd.md)，重點是**先停服務再覆蓋檔案**。從 GitHub 還原得到的是不含被排除項目的部分資料，完整還原一定要用本機快照。

---

## 已知限制

- **單人使用、沒有登入機制。** 它預設這是你自己的電腦，所以服務只聽 `127.0.0.1`，手機或別台電腦連不到。不要用反向代理或通道把它開到網路上——設定 COOL 登入之後，連得到的人就能讀你的 COOL 課程。
- **對外連線只有兩處**：論文的 DOI／arXiv 查詢（Crossref／arXiv），送出的只有編號本身；以及 NTU COOL 和台大 SSO，只有存了鑰匙圈項目或設定 `COOL_COOKIE` 才會連（設了之後 08:00–18:00 每小時也會自動連，`COOL_AUTO_SYNC=0` 可關掉）。BibTeX 完全在本機解析。「問 AI」執行的是你本機的 `claude`／`codex` CLI，論文文字會送到 Anthropic／OpenAI，跟你平常用那兩個 CLI 一樣。
- **部分按鈕只在 macOS 有用**：「Finder」、「預覽程式」與開啟本機 `file://` 連結都靠 `open` 指令，其餘功能各平台都能用。
- **課表匯入是針對臺大課程網**（`course.ntu.edu.tw`）的貼上格式寫的。別的學校對不上，手動輸入課程即可，其他功能不依賴它。
- **介面是繁體中文**，程式碼與註解是英文。

---

## 技術細節

Next.js 15（App Router、server actions）+ SQLite（`better-sqlite3`，資料庫在 `data/acadesk.db`）。

資料庫 schema 在 [db/schema.sql](db/schema.sql)；要對既有資料庫新增欄位走 [lib/db.ts](lib/db.ts) 的 `ADDED_COLUMNS` 冪等遷移。schema 是每條連線套用一次，所以**改完 schema 要重啟服務**才會生效，熱重載不夠。

更多維運細節見 [scripts/launchd.md](scripts/launchd.md)。
