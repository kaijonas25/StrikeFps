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
