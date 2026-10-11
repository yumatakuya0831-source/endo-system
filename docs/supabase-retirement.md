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
- AC-037: 完了。ユーザーの非表示入力により2名のパスワードを再設定し、再設定APIとログインAPIで成功を確認。検証セッションはログアウト済み。新しいパスワードは記録しない。成功証跡はGit管理対象外の `.local-postgres/reset-<ユーザーID>.json` に保存。
- AC-039: 完了。ユーザー指定のPC内別フォルダーへ最新バックアップを保存し、SHA256の一致を確認。復元試験も完了。
- 本番のVercelプロジェクトは、現在ログインしている `yoshida0522s-projects` のスコープでは見つからない。既存本番環境の所有アカウントへのアクセスが必要。

## バックアップの検証結果

- `node --env-file=.env.local scripts/verify-postgres-backup.mjs` が終了コード0。
- 最新バックアップ: `.local-postgres/backups/2026-10-11T12-03-40-127Z/endo.dump`。ユーザー2名のパスワード再設定後に取得。
- 最新復元先: 専用検証DB `endo_restore_1791720220129`。稼働DBは上書きしていない。
- 元DBの同一スナップショットからバックアップと期待値を取得し、14テーブルの全行を復元後と照合して一致。
- 同フォルダーに `verification.json` と旧Supabaseの `supabase-source.json` を保存。顧客情報とユーザー情報を含むためGit管理対象外。
- 別保存先: `C:\Users\kanta\ENDO-backups\2026-10-11T12-03-40-127Z\`。3ファイルのSHA256が元ファイルと一致。ユーザーの「このPC内の別フォルダー」指定に基づく保存であり、別端末やクラウドへの転送は行っていない。
- 本番PostgreSQLは用意済みとの回答あり。ホスト・ポート・DB名・ユーザー名と本番アプリURL、Vercelの所有アカウント情報の回答待ち。
- 自動テスト5件とlint合格。アプリ本体の変更がないため、今回のスクリプト追加では本番ビルドを再実施していない。

## パスワードの再設定

```powershell
powershell -ExecutionPolicy Bypass -File scripts/reset-migrated-users.ps1
```

SMTP設定がなくても、管理者がPC上で移行ユーザーのパスワードを設定し、ログインを確認できる。
通常のメールによるパスワード再設定機能を利用するにはSMTP設定が引き続き必要。
