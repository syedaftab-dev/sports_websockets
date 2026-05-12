import { Router } from "express";
import { createMatchSchema, listMatchesQuerySchema } from "../validation/matches.js";
import { matches } from "../db/schema.js"
import { db } from "../db/db.js"
import { getMatchStatus } from "../utils/match-status.js";
import  { desc } from 'drizzle-orm'
export const matchRouter= Router()
const MAX_LIMIT = 100;

matchRouter.get('/',async (req,res)=>{
    const parsed = listMatchesQuerySchema.safeParse(req.query)

    if(!parsed.success){
        return res.status(400).json({
            error: "Invalid query",
            details: JSON.stringify(parsed.error.issues)
        })
    }

    // no of rows or matches to be returned
    const limit = Math.min(parsed.data.limit ?? 50, MAX_LIMIT);

    try{

        const data = await db.select()
            .from(matches)
            .orderBy((desc(matches.createdAt)))
            .limit(limit)

        return res.status(200).json({ 
            data
        })
    }
    catch(err){
        res.status(500).json({ error: "Failed to list matches" });
    }
    

    res.status(200).json({ message: "Matches List"})
})

matchRouter.post('/',async (req,res)=>{
    // apply zod validation to user received data
    const parsed = createMatchSchema.safeParse(req.body);

    
    // if zod fails send error
    if(!parsed.success){
        return res.status(400).json({ error: 'Invalid Payload', details: JSON.stringify(parsed.error.issues) })
    }
    // if zod pass
    const { data: { startTime,endTime, homeScore, awayScore }} = parsed;
    try {
        // insert new match to databse
        const [event] = await db.insert(matches).values({
            ...parsed.data,
            startTime: new Date(startTime),
            endTime : new Date(endTime),
            homeScore: homeScore ?? 0,
            awayScore: awayScore ?? 0,
            status: getMatchStatus(startTime,endTime)
        }).returning();


        res.status(201).json({
            data: event
        })

    } catch (error) {
        res.status(500).json({
            error: "Failed to create match ",
            details: JSON.stringify(error)
        })
    }


})