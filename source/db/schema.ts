import { bigint, bigserial, doublePrecision, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

export const categoryPrices = pgTable("category_prices", {
  id: text("id").primaryKey(),
  price: doublePrecision("price"),
});

export const productOverrides = pgTable("product_overrides", {
  id: text("id").primaryKey(),
  data: text("data").notNull(),
  createdSeq: bigserial("created_seq", { mode: "number" }).notNull().unique(),
});

export const adminUsers = pgTable("admin_users", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull(),
});

export const adminCredentials = pgTable("admin_credentials", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  passwordHash: text("password_hash").notNull(),
  version: text("version").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const adminSessions = pgTable("admin_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  credentialVersion: text("credential_version").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
});

export const adminLoginLimits = pgTable("admin_login_limits", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull(),
  windowStart: bigint("window_start", { mode: "number" }).notNull(),
});

export const collectionDefinitions = pgTable("collection_definitions", {
  id: text("id").primaryKey(),
  nameKey: text("name_key").notNull(),
  data: text("data").notNull(),
  createdSeq: bigserial("created_seq", { mode: "number" }).notNull().unique(),
}, table => [uniqueIndex("collection_definitions_name_key_unique").on(table.nameKey)]);

export const categoryDefinitions = pgTable("category_definitions", {
  id: text("id").primaryKey(),
  collectionId: text("collection_id").notNull(),
  nameKey: text("name_key").notNull(),
  data: text("data").notNull(),
  createdSeq: bigserial("created_seq", { mode: "number" }).notNull().unique(),
}, table => [uniqueIndex("category_definitions_parent_name_unique").on(table.collectionId, table.nameKey)]);
