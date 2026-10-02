# PostgreSQLへの切り替え

SupabaseのDBはPostgreSQLですが、このアプリではSupabase JS経由でデータを読み書きしていました。
`NEXT_PUBLIC_DATA_BACKEND=postgres` にすると、業務データはNext.js API経由で通常のPostgreSQLへ保存します。

## 1. テーブル作成

PostgreSQLに接続して、次のSQLを実行します。

```bash
psql "$DATABASE_URL" -f postgres/schema.sql
```

## 2. 環境変数

`.env.local` に追加します。

```env
NEXT_PUBLIC_DATA_BACKEND=postgres
DATABASE_URL=postgresql://user:password@localhost:5432/endo_system
POSTGRES_SSL=disable
```

ログインとユーザー管理は現在のSupabase Authを使います。以下は引き続き必要です。

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_EMAILS=
NEXT_PUBLIC_ADMIN_EMAILS=
```

## 現時点の範囲

- 顧客、工事、見積、請求、設定などの業務データをPostgreSQLへ保存できます。
- 認証、パスワード再設定、ユーザー管理はSupabase Authを継続利用します。
- 削除同期は安全のため一括削除ではなく、今後個別APIで対応する想定です。
