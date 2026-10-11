# ローカルPostgreSQL接続設定

- 更新日: 2026-10-11
- 要件 FR-020 / 受入条件 AC-032: 既存サービスの認証情報が不明でも、独立したローカルDBへアプリを接続できる。
- 受入条件 AC-033: デモ管理者としてログインし、業務データとユーザー一覧を取得できる。
- 設計: インストール済みPostgreSQLを使用し、専用データディレクトリを5433ポートで起動する。アプリは管理用ユーザーと分離した、DB所有者の一般ログインロールを使用する。
- 秘密情報: `.env.local` と `.local-postgres/` はGit管理対象外。管理パスワードとアプリ用パスワードはランダム生成し、出力しない。
- 既存サービスと既存データを変更しない。旧データ移行はこの作業の対象外。

## 実施結果

- `npm run db:setup`: 成功。`endo_system_dev` を作成し、14個のテーブルを作成。
- T-011: `http://localhost:3000/api/auth/login` に `admin / admin` を送信し、管理者ロールでログイン成功。
- T-012: 同じセッションで `/api/app-state` と `/api/users` を取得し成功。検証セッションはログアウト済み。
- アプリ接続の `current_database()` は `endo_system_dev`、`current_user` は `endo_app_dev`。スーパーユーザー権限なしを確認。
- `npm test`: 3件合格。`npm run lint`、`npm run build`: 成功。いずれも終了コード0。
- `.env.local` とDB認証情報・データファイルがgitignore対象であることを確認。
- 既存PostgreSQLは5432ポートで継続稼働。専用PostgreSQLは5433ポートで稼働。
- 再起動後の自動起動は設定していない。`npm run db:start` を実行する。
- ロールバック: `npm run db:stop` で専用DBを停止し、`.env.local` の接続先を変更する。DBファイルは削除しない。
