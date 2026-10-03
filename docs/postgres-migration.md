# PostgreSQLへの完全移行

このアプリは、業務データとログインユーザーを通常のPostgreSQLに保存します。
SupabaseのURL、publishable key、service role keyは通常運用では不要です。

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
