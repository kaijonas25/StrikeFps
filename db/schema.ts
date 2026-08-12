import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const players = sqliteTable("players", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  callsign: text("callsign").notNull(),
  level: integer("level").notNull().default(1),
  experience: integer("experience").notNull().default(0),
  kills: integer("kills").notNull().default(0),
  deaths: integer("deaths").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  matchesPlayed: integer("matches_played").notNull().default(0),
  loadoutJson: text("loadout_json").notNull().default("{}"),
  operatorJson: text("operator_json").notNull().default("{}"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const playerMatchResults = sqliteTable("player_match_results", {
  id: text("id").primaryKey(),
  playerId: text("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
  matchId: text("match_id").notNull(),
  kills: integer("kills").notNull(),
  deaths: integer("deaths").notNull(),
  won: integer("won", { mode: "boolean" }).notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const adminRoles = sqliteTable("admin_roles", {
  email: text("email").primaryKey(),
  role: text("role", { enum: ["owner", "junior"] }).notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
