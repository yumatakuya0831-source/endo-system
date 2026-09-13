# Supabase Migration

`app/lib/domain.ts` の初期データを Supabase に移行するための手順です。

## 1. SQL を実行する

Supabase Dashboard で対象プロジェクトを開き、SQL Editor に以下のファイル全文を貼り付けて実行します。

```text
supabase/migrations/20260912000000_initial_app_data.sql
```

この SQL は次を行います。

- アプリ用テーブルの作成
- 初期データの upsert
- 登録済みユーザーだけが読み書きできる RLS policy の作成

## 2. ユーザーを登録する

Supabase Dashboard の `Authentication` > `Users` から、利用を許可するユーザーを作成します。

本番運用では `Authentication` > `Providers` > `Email` で、一般ユーザーによる公開サインアップを無効にし、管理者が追加したユーザーだけログインできる設定にしてください。

## 3. アプリからユーザー登録できるようにする

マスタ管理の「ユーザー管理」からユーザーを登録するには、`.env.local` に以下を追加します。

```text
SUPABASE_SERVICE_ROLE_KEY=Supabaseのservice_roleキー
ADMIN_EMAILS=管理者のメールアドレス
NEXT_PUBLIC_ADMIN_EMAILS=管理者のメールアドレス
```

複数の管理者を許可する場合は、カンマ区切りで指定します。

```text
ADMIN_EMAILS=admin@example.com,owner@example.com
```

`ADMIN_EMAILS` はサーバー側の実権限、`NEXT_PUBLIC_ADMIN_EMAILS` は画面表示制御用です。`SUPABASE_SERVICE_ROLE_KEY` はサーバー側だけで使う秘密キーです。GitHubへコミットしないでください。

## 4. 投入結果を確認する

SQL 実行後、登録済みユーザーでログインしてアプリを開きます。CLIで確認する場合は、`.env.local` に一時的に以下を追加してから実行します。

```text
SUPABASE_TEST_EMAIL=登録済みユーザーのメールアドレス
SUPABASE_TEST_PASSWORD=登録済みユーザーのパスワード
```

```bash
node scripts/verify-supabase-data.mjs
```

すべて `ok` になれば、`domain.ts` の初期データは Supabase に移行済みです。

## 注意

現在の policy は「ログイン済みユーザー全員が同じデータを読み書きできる」構成です。社内利用には使いやすい一方、会社別・部署別・担当者別にデータを分ける本番では、`profiles` や `company_id` を追加して RLS policy をさらに絞ってください。
