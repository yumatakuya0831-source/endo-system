# PostgreSQLへの完全移行

このアプリは、業務データとログインユーザーを通常のPostgreSQLに保存します。
SupabaseのURL、publishable key、service role keyは通常運用では不要です。

## Windowsでのローカル接続設定

### 既存PostgreSQLのパスワードが不明な場合

インストール済みPostgreSQLのバイナリを使って、既存サービスとは別の開発用DBを作成できます。

```powershell
npm run db:setup
```

接続先は `127.0.0.1:5433`、DB名は `endo_system_dev`、アプリ用ユーザーは `endo_app_dev` です。
DBファイルと管理用の認証情報はGit管理対象外の `.local-postgres/` に保存し、アプリの接続設定は `.env.local` に保存します。
この操作は既存の5432ポートのPostgreSQLと既存データを変更しません。新しいDBに旧データは取り込まれません。
PCを再起動した後は `npm run db:start` で専用DBを起動します。停止は `npm run db:stop` です。
初回設定後、`npm run dev` で開発サーバーを起動し、`admin / admin` でログインできます。

### 既存PostgreSQLのパスワードが分かる場合

PostgreSQLが `127.0.0.1:5432` で起動している場合、リポジトリで次を実行します。

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-postgres.ps1
```

管理ユーザー `postgres` のパスワードを画面で入力します。パスワードは非表示で入力され、コマンド引数やログに出力されません。
専用DB `endo_system_dev` と専用ユーザー `endo_app_dev` を新規作成し、スキーマを適用します。アプリ用パスワードはランダムに生成し、Git管理対象外の `.env.local` に接続設定を保存します。
同名のDBまたはユーザーが存在する場合は停止します。既存データや既存ユーザーのパスワードを上書きしません。
設定後は開発サーバーを再起動してください。既存Supabaseの業務データはこの手順では移行しません。

## 1. テーブル作成

PostgreSQLに接続して、次のSQLを実行します。

```bash
psql "$DATABASE_URL" -f postgres/schema.sql
```

既存DBに追加で適用する場合も同じSQLを実行できます。`if not exists` を使っているため、既存テーブルは保持されます。

## 2. 環境変数

`.env.local` に設定します。

```env
DATABASE_URL=postgresql://user:password@localhost:5432/endo_system
POSTGRES_SSL=disable
ADMIN_EMAILS=yumatakuya0831@gmail.com
NEXT_PUBLIC_ADMIN_EMAILS=yumatakuya0831@gmail.com
ADMIN_INITIAL_PASSWORD=本番では必ず長い初期パスワード
APP_ORIGIN=https://本番ドメイン
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=メール送信用ユーザー
SMTP_PASSWORD=メール送信用パスワード
SMTP_FROM="積算ノート <no-reply@example.com>"
```

`ADMIN_EMAILS` に含まれるメールアドレスで、まだユーザーが存在しない場合だけ、`ADMIN_INITIAL_PASSWORD` で初回ログインすると管理者ユーザーを自動作成します。
作成後はユーザー管理画面から通常のユーザー登録・管理者権限切替・削除ができます。

## 3. 範囲

- 顧客、工事、見積、請求、汎用マスタ、設定はPostgreSQLへ保存します。
- ログイン、ログアウト、ユーザー管理もPostgreSQLの `app_users` と `app_user_sessions` を使います。
- パスワード再設定トークンは `password_reset_tokens` に保存します。
- SMTP設定がある場合、パスワード再設定リンクをメール送信します。

## 4. パスワード再設定メール

`APP_ORIGIN` はメール内リンクのURLに使います。本番では必ず公開ドメインを設定してください。

Gmailなどを使う場合は、通常のログインパスワードではなく、アプリパスワードやSMTP用の認証情報を使います。
SMTP設定が未入力の場合、再設定リクエストは受け付けますがメールは送信されません。
