// import { PrismaClient } from "@prisma/client";
// import { PrismaPg } from "@prisma/adapter-pg";
// import { env } from "../config/env.js";

// const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

// export const prisma = new PrismaClient({ adapter });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "../config/env.js";

// console.log("TEST DATABASE:", env.DATABASE_URL);

const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
});

export const prisma = new PrismaClient({ adapter });
