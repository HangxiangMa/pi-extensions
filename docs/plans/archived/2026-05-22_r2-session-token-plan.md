## Goal

以程式碼修復 `@narumitw/pi-sync` 在 Cloudflare R2 上因誤送 `X-Amz-Security-Token` 而自動同步失敗的問題，不採用要求使用者 unset/覆蓋環境變數的快速止血方案；成功條件是使用 R2 靜態 access key 時，即使 shell 或 local config 裡存在 session token，pi-sync 也不會把它帶到 R2 request，並能通過既有 repo 檢查。

## Context

原本 `extensions/pi-sync/src/sync.ts` 的 `loadPartialConfig()` 會把 session token 套進 R2 request。這對 AWS STS/SSO S3 有用，但 Cloudflare R2 靜態金鑰會拒絕帶有 `x-amz-security-token` 的簽名 request，並回覆：

```text
InvalidArgument: X-Amz-Security-Token
```

## Assumptions

- 這次修復以 R2 靜態 access key 為主，不需要 R2 session token。
- 仍要保留一般 AWS S3 使用 `AWS_SESSION_TOKEN` 的能力。

## Non-Goals

- 不要求使用者 unset `AWS_SESSION_TOKEN`、修改 shell profile，或用 `PI_SYNC_SESSION_TOKEN=` 覆蓋啟動 Pi。

## Plan

- [x] 修改 `extensions/pi-sync/src/sync.ts` 的 session token 解析邏輯：偵測 endpoint 是否為 Cloudflare R2（hostname 結尾為 `.r2.cloudflarestorage.com`），R2 endpoint 下忽略 `PI_SYNC_SESSION_TOKEN`、`AWS_SESSION_TOKEN`、local config `sessionToken`；已由 `selectSessionToken()` code review 與實機 `/pisync status` 等效 handler 驗證。
- [x] 將空字串 token 正規化為未設定，避免 `PI_SYNC_SESSION_TOKEN=`、空白字串或 config 裡的 `"sessionToken": ""` 造成顯示或後續邏輯混淆；已由 `normalizeOptionalString()` 實作驗證。
- [x] 強化 `/pisync doctor` 與 `/pisync config` 的診斷文字：當 R2 endpoint 下有 session token 來源時，顯示該來源會被忽略且不洩漏 token 值；已用實機 config/doctor handler 輸出驗證。
- [x] 更新 `extensions/pi-sync/README.md` 的 R2 設定說明：標明 R2 靜態金鑰不需要 session token，且 R2 endpoint 會忽略所有 session token 來源；已由 README diff 驗證。
- [x] 執行格式與型別檢查：已從 repo root 跑 `npm run check` 並成功結束。
- [x] 做一次 package 內容 dry run：已跑 `npm run pack:sync`，tarball 清單只有 `LICENSE`、`README.md`、`package.json`、`src/sync.ts`。
- [x] 實機驗證 R2：已用實際 R2 config、保留測試用 `AWS_SESSION_TOKEN`，呼叫 extension `config`、`doctor`、`status` handler；`config` 顯示 `sessionToken: not configured`，`status` 成功讀到 remote pointer，未再收到 `InvalidArgument X-Amz-Security-Token`。

## Risks

- 如果某個非 R2 的 S3-compatible provider 也使用類似 endpoint，但需要 temporary token，偵測規則不能誤判；已限制偵測為 Cloudflare R2 hostname。
- 如果未來 Cloudflare R2 支援 session token，此版本會對 R2 endpoint 一律忽略 token；屆時可新增明確 opt-in flag。

## Rollback / Recovery

- 若新版行為影響 AWS S3 STS/SSO 使用者，回退 `selectSessionToken()` 的 R2 特例即可恢復舊行為。

## Completion Checklist

- [x] R2 endpoint 搭配 `AWS_SESSION_TOKEN` 或 local config `sessionToken` 不再產生 `x-amz-security-token`，由 `config` 顯示 `sessionToken: not configured` 與實際 R2 `status` 成功驗證。
- [x] AWS S3 非 R2 endpoint 仍可使用 `AWS_SESSION_TOKEN`，由非 R2 config handler 顯示 `sessionToken: configured` 驗證。
- [x] 使用者文件清楚說明 R2 不需要 session token，由 `extensions/pi-sync/README.md` diff 驗證。
- [x] repo 品質門檻通過，由 `npm run check` 成功輸出驗證。
- [x] pi-sync package dry run 無異常，由 `npm run pack:sync` 成功輸出驗證。
