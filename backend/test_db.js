import { db } from "./src/db/db.js";
import { matches, commentary } from "./src/db/schema.js";
import { desc } from "drizzle-orm";

async function test() {
  try {
    const list = await db.select().from(matches);
    console.log(`Total matches in DB: ${list.length}`);
    list.forEach(m => {
      console.log(`- ID: ${m.id}, Sport: ${m.sport}, Teams: ${m.homeTeam} vs ${m.awayTeam}, Status: ${m.status}, Scores: ${m.homeScore} vs ${m.awayScore}`);
    });

    const comms = await db.select().from(commentary).orderBy(desc(commentary.createdAt)).limit(10);
    console.log(`\nLast 10 commentary rows in DB:`);
    comms.forEach(c => {
      console.log(`- MatchId: ${c.matchId}, Min: ${c.minute}, Seq: ${c.sequence}, Msg: ${c.message}`);
    });
  } catch (err) {
    console.error("DB Query Error:", err.message);
  }
}

test();
