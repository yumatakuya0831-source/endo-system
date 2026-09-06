import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const appState = sqliteTable("app_state", {
  key: text("key").primaryKey(),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull(),
});
