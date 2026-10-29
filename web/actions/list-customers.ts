import { defineAction } from "@agent-native/core/action";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { requireOwnerEmail } from "../server/owner.js";

export default defineAction({
  description: "List the caller's customers, sorted by name.",
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => {
    const ownerEmail = requireOwnerEmail();
    return getDb()
      .select()
      .from(schema.customers)
      .where(eq(schema.customers.ownerEmail, ownerEmail))
      .orderBy(asc(schema.customers.name));
  },
});
