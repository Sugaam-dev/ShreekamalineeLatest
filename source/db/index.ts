import { drizzle } from "drizzle-orm/node-postgres";
import { getPostgresPool } from "../lib/postgres";
import * as schema from "./schema";

export function getDb() {
  return drizzle(getPostgresPool(), { schema });
}
