import { db } from "./src/db/db.js";
import { matches, commentary } from "./src/db/schema.js";

async function clean() {
  try {
    console.log("Cleaning database...");
    await db.delete(commentary);
    await db.delete(matches);
    console.log("Database cleared successfully!");
  } catch (err) {
    console.error("Error clearing DB:", err.message);
  }
}

clean();
