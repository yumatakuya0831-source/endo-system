# Supabase削除前確認

- 更新日: 2026-10-11
- 要件 FR-023 / AC-037: 移行した2名のパスワードをPC上で再設定し、アプリへのログインを確認する。
- 要件 FR-024 / AC-038: 本番アプリがPostgreSQLに接続し、旧Supabaseを使わずデータを取得できる。
- 要件 FR-025 / AC-039: DBバックアップを別保存先に保管し、独立した検証用DBへ復元して全件照合する。
- 要件 FR-026 / AC-040: SupabaseのStorageと公開テーブルを確認し、未移行ファイル・業務テーブルがないことを確認する。
- Supabase削除はこの確認作業には含めない。
- 要件 FR-027 / AC-041: 外部PostgreSQLへ業務データと再設定済みユーザーのパスワードハッシュを移し、全件照合する。開発用デモ管理者・既存セッション・再設定トークンは本番へ移さない。

## 本番移行の準備

本番DBの接続URLをGit管理対象外の `.env.production.local` の `DATABASE_URL` に設定する。ローカルの `.env.local` は変更しない。

```powershell
node --env-file=.env.local scripts/transfer-postgres.mjs
node --env-file=.env.local scripts/transfer-postgres.mjs --apply
```

1つ目は接続・空DBの確認のみ。2つ目で実移行する。既存データがあるDBや、変更済みの設定があるDBは上書きせず停止する。
本番データがまだ入っていないDBを使用する。アプリ用のテーブル作成とデータ書き込みは同一トランザクションで行う。
移行用のデータとレポートは `.local-postgres/production-transfers/` に保存し、Gitには含めない。
VercelのProductionに本番DBの `DATABASE_URL` を設定する。ローカル用の `POSTGRES_SSL=disable` は本番に設定しない。`APP_ORIGIN` は本番URLを使う。
外部DBの作成と本番接続テストは未実施。Vercel管理画面へのログインが必要。

## 状況

- AC-040: 完了。Storageバケット0件。公開テーブル11件は移行対象と一致。
- AC-038: 未完了。本番 `https://endo-system.vercel.app/api/app-state` はHTTP 500、`DATABASE_URL is not configured` を返す。接続可能な本番DBが必要。
- AC-037: 完了。ユーザーの非表示入力により2名のパスワードを再設定し、再設定APIとログインAPIで成功を確認。検証セッションはログアウト済み。新しいパスワードは記録しない。成功証跡はGit管理対象外の `.local-postgres/reset-<ユーザーID>.json` に保存。
- AC-039: 完了。ユーザー指定のPC内別フォルダーへ最新バックアップを保存し、SHA256の一致を確認。復元試験も完了。
- AC-041: 進行中。ローカルの独立DBで移行処理を検証済み。外部DBへの実移行と本番照合は未実施。
- 本番のVercelプロジェクトは、現在ログインしている `yoshida0522s-projects` のスコープでは見つからない。既存本番環境の所有アカウントへのアクセスが必要。
- 所有プロジェクトは `yumatakuya0831-sources-projects/endo-system`。ユーザーが提示したDBはPC内の開発用DBだったため、外部PostgreSQLを用意する方針へ変更。Vercel MarketplaceのNeon Freeプランを候補とし、有料プランは承認対象外。
- ブラウザ確認中にGoogle認証画面へのアクセスが自動承認審査で拒否された。別経路で認証を回避せず、ユーザーによるVercelログインと外部DB作成を待つ。

## 本番移行処理の検証

- T-014 / FR-027 / AC-041: `node --env-file=.env.local scripts/verify-postgres-transfer.mjs` が終了コード0。検証対象はローカルの独立DBであり、本番接続の合格を意味しない。
- 独立検証DB: `endo_transfer_test_1791721238168`。検証のみの実行ではテーブル作成がロールバックされ、公開テーブル0件を確認。
- 実移行では業務データ35件とユーザー2名の全行照合に成功。ユーザーのパスワードハッシュと権限を追加照合し一致。
- 開発用デモ管理者、セッション、再設定トークンを除外。既存データがあるDBへの再実行は拒否し、登録ユーザーが変更されないことを確認。
- 証跡: `.local-postgres/transfer-tests/endo_transfer_test_1791721238168/verification.json`。データと接続設定はGit管理対象外。
- 本番接続はTLS証明書検証を有効にし、接続URLのSSLオプションによる検証無効化を防ぐ。
- `npm test`: 5件合格。`npm run lint` と `npm run build`: 終了コード0。

## バックアップの検証結果

- `node --env-file=.env.local scripts/verify-postgres-backup.mjs` が終了コード0。
- 最新バックアップ: `.local-postgres/backups/2026-10-11T12-03-40-127Z/endo.dump`。ユーザー2名のパスワード再設定後に取得。
- 最新復元先: 専用検証DB `endo_restore_1791720220129`。稼働DBは上書きしていない。
- 元DBの同一スナップショットからバックアップと期待値を取得し、14テーブルの全行を復元後と照合して一致。
- 同フォルダーに `verification.json` と旧Supabaseの `supabase-source.json` を保存。顧客情報とユーザー情報を含むためGit管理対象外。
- 別保存先: `C:\Users\kanta\ENDO-backups\2026-10-11T12-03-40-127Z\`。3ファイルのSHA256が元ファイルと一致。ユーザーの「このPC内の別フォルダー」指定に基づく保存であり、別端末やクラウドへの転送は行っていない。
- 外部PostgreSQLの作成とVercel側の本番設定は未完了。完了後に実移行、再デプロイ、登録ユーザーの本番ログインと業務データ照合を行う。

## パスワードの再設定

```powershell
powershell -ExecutionPolicy Bypass -File scripts/reset-migrated-users.ps1
```

SMTP設定がなくても、管理者がPC上で移行ユーザーのパスワードを設定し、ログインを確認できる。
通常のメールによるパスワード再設定機能を利用するにはSMTP設定が引き続き必要。
