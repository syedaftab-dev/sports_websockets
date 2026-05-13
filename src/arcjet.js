import arcjet, { detectBot, shield, slidingWindow } from "@arcjet/node";

const arcjetKey = process.env.ARCJET_KEY;
const arcjetMode = process.env.ARCJET_MODE === 'DRY_RUN' ? 'DRY_RUN' : 'LIVE';

if(!arcjetKey)throw new Error('Missing Arcjet Key');

// for http server
export const httpArcjet = arcjetKey ? 
    arcjet({
        key: arcjetKey,
        rules:[
            shield({ mode: arcjetMode }), // protects from hacker from sql injection and other etc
            detectBot({ mode: arcjetMode, allow: ["CATEGORY:SEARCH_ENGINE","CATEGORY:PREVIEW"]}), // bots allowed 1st->better SEO and 2nd -> thumbnail
            slidingWindow({ mode: arcjetMode, interval: '10s', max: 50}) // rate limiting 50 req in 10s for an IP
        ]
    }) : null;

    // for webscoket server
export const wsArcjet = arcjetKey ?
    arcjet({
        key: arcjetKey,
        rules:[
            shield({ mode: arcjetMode }), // protects from hacker from sql injection and other etc
            detectBot({ mode: arcjetMode, allow: ['CATEGORY: SEARCH_ENGINE','CATEGORY:PREVIEW']}), // bots allowed 1st->better SEO and 2nd -> thumbnail
            slidingWindow({ mode: arcjetMode, interval: '2s', max: 5}) // rate limiting 5 req in 2s for an IP
        ]
    }):null;

// for rest api
export function securityMiddleware(){
    return async (req,res,nex)=>{
        if(!httpArcjet)return next();


        try {
        
            // use httpsArcjet to analyse the api
            const decision = await httpArcjet.protect(req);
            
            if(decision.isDenied()){
                if(decision.reason.isRateLimit()){
                    return res.status(429).json({ error: 
                        'Too many requests'
                    })
                }
                // anyother reason
                return res.status(403).json({ error: "Forbidden"});
            }
        } catch (error) {
            console.log('Arcjet middlware error',error);
            return res.status(503).json({ error: "service unavailable "});
        }
        // if no errors
        next();
    }
}