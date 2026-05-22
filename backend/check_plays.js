import { db } from "./src/db/db.js";
import { commentary } from "./src/db/schema.js";
import { eq } from "drizzle-orm";

async function run() {
  try {
    const list = await db
      .select()
      .from(commentary)
      .where(eq(commentary.matchId, 131918653))
      .orderBy(commentary.sequence);
    
    console.log(`Plays for Minnesota United FC vs Real Salt Lake (ID: 131918653): ${list.length} plays`);
    list.slice(-15).forEach(p => {
      console.log(`[Seq: ${p.sequence}] Min: ${p.minute}' | Event: ${p.eventType} | Msg: ${p.message}`);
    });
  } catch (err) {
    console.error("Error:", err.message);
  }
}

run();
