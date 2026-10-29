import { sql } from "drizzle-orm";
import { boolean, integer, pgTable, text } from "drizzle-orm/pg-core";

export const services = pgTable("services", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  durationMinutes: integer("duration_minutes").notNull(),
  priceCents: integer("price_cents"),
  active: boolean("active").notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

export const customers = pgTable("customers", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

export const appointments = pgTable("appointments", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id),
  serviceId: text("service_id")
    .notNull()
    .references(() => services.id),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
  status: text("status").notNull().default("scheduled"),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`now()`),
});
