# Supabase削除前確認

- 更新日: 2026-10-11
- 要件 FR-023 / AC-037: 移行した2名のパスワードをPC上で再設定し、アプリへのログインを確認する。
- 要件 FR-024 / AC-038: 本番アプリがPostgreSQLに接続し、旧Supabaseを使わずデータを取得できる。
- 要件 FR-025 / AC-039: DBバックアップを別保存先に保管し、独立した検証用DBへ復元して全件照合する。
- 要件 FR-026 / AC-040: SupabaseのStorageと公開テーブルを確認し、未移行ファイル・業務テーブルがないことを確認する。
- Supabase削除はこの確認作業には含めない。

## 状況

- AC-040: 完了。Storageバケット0件。公開テーブル11件は移行対象と一致。
- AC-038: 未完了。本番 `https://endo-system.vercel.app/api/app-state` はHTTP 500、`DATABASE_URL is not configured` を返す。接続可能な本番DBが必要。
- AC-037: ユーザーによる非表示パスワード入力待ち。`scripts/reset-migrated-users.ps1` を用意し、入力ウィンドウを起動済み。再設定APIとログインAPIで各ユーザーを確認し、検証セッションをログアウトする。新しいパスワードは記録しない。成功証跡はGit管理対象外の `.local-postgres/reset-<ユーザーID>.json` に保存する。
- AC-039: 復元試験は完了。別保存先への保管は回答待ち。
- 本番のVercelプロジェクトは、現在ログインしている `yoshida0522s-projects` のスコープでは見つからない。既存本番環境の所有アカウントへのアクセスが必要。

## バックアップの検証結果

- `node --env-file=.env.local scripts/verify-postgres-backup.mjs` が終了コード0。
- バックアップ: `.local-postgres/backups/2026-10-11T11-57-31-815Z/endo.dump`。
- 復元先: 専用検証DB `endo_restore_1791719851817`。稼働DBは上書きしていない。
- 元DBの同一スナップショットからバックアップと期待値を取得し、14テーブルの全行を復元後と照合して一致。
- 同フォルダーに `verification.json` と旧Supabaseの `supabase-source.json` を保存。顧客情報とユーザー情報を含むためGit管理対象外。
- 別保存先は未決定。PC故障に備える保存先への転送完了とは扱わない。
- 自動テスト5件とlint合格。アプリ本体の変更がないため、今回のスクリプト追加では本番ビルドを再実施していない。

## パスワードの再設定

```powershell
powershell -ExecutionPolicy Bypass -File scripts/reset-migrated-users.ps1
```

SMTP設定がなくても、管理者がPC上で移行ユーザーのパスワードを設定し、ログインを確認できる。
通常のメールによるパスワード再設定機能を利用するにはSMTP設定が引き続き必要。
