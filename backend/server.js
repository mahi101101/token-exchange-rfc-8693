import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';

const app = express();
// Make the port dynamic for deployment
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    console.log(`\n======================================================`);
    console.log(`📡 [${req.method}] ${req.originalUrl}`);
    if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
        console.log(`📦 Payload:`, req.body);
    }
    console.log(`======================================================\n`);
    next();
});

const SECRET = "super_secret_key_for_demo_purposes_only";

// =====================================================================
// ROUTING
// =====================================================================
const authRouter = express.Router();

// PHASE 1: Human Login 
authRouter.get('/human', async (req, res) => {
    const isExpired = req.query.expired === 'true';
    
    setTimeout(() => {
        const now = Math.floor(Date.now() / 1000);
        const token = jwt.sign(
            { 
                iss: "https://demo-idp.local/",
                aud: "api://agent-service", // RESTRICTED AUDIENCE
                sub: "usr_abf995f2-00ca-33b9-8fd1",
                client_id: "app_human_ui",
                scope: "openid profile email write:data read:data",
                iat: now,
                // If expired=true, set expiration to 1 hour in the past. Otherwise, 1 hour in the future.
                exp: isExpired ? now - 3600 : now + 3600
            },
            SECRET
        );
        res.json({ access_token: token });
    }, 800);
});

// PHASE 2: Agent Identity (Updated to support multiple agents)
authRouter.post('/agent', async (req, res) => {
    // Read the requested agent name, default to the original if not provided
    const agentId = req.body.agent_id || "app_agent_m2m";
    
    setTimeout(() => {
        const now = Math.floor(Date.now() / 1000);
        const agentToken = jwt.sign(
            {
                iss: "https://demo-idp.local/",
                aud: "https://demo-idp.local/",
                sub: agentId,
                client_id: agentId,
                scope: "exchange:tokens",
                iat: now,
                exp: now + 3600
            },
            SECRET
        );
        res.json({ access_token: agentToken });
    }, 800);
});

// PHASE 3: Token Exchange (Updated for RFC 8693 act nesting)
authRouter.post('/exchange', async (req, res) => {
    const { grant_type, subject_token, actor_token, scope } = req.body;

    if (grant_type !== 'urn:ietf:params:oauth:grant-type:token-exchange') {
        return res.status(400).json({ error: 'unsupported_grant_type' });
    }

    try {
        const subPayload = jwt.verify(subject_token, SECRET);
        const actorPayload = jwt.verify(actor_token, SECRET);

        const finalScopes = scope || subPayload.scope;

        setTimeout(() => {
            const now = Math.floor(Date.now() / 1000);
            
            // RFC 8693 Section 4.1.1: Nesting the 'act' claim
            // If the subject token already has an actor, we nest it inside the new actor!
            const newAct = { sub: actorPayload.sub };
            if (subPayload.act) {
                newAct.act = subPayload.act; 
            }

            const exchangedToken = jwt.sign(
                {
                    iss: "https://demo-idp.local/",
                    aud: "api://downstream-resource",
                    sub: subPayload.sub, // The subject ALWAYS remains the Human
                    client_id: actorPayload.client_id,   
                    act: newAct, // The nested chain of custody
                    scope: finalScopes,
                    iat: now,
                    exp: now + 3600
                },
                SECRET
            );
            
            res.json({ access_token: exchangedToken });
        }, 1200);

    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(400).json({ 
                error: 'invalid_request', 
                error_description: 'The subject_token is expired.' 
            });
        }
        res.status(400).json({ error: 'invalid_request', error_description: 'Failed to parse tokens' });
    }
});

// INTROSPECTION (RFC 7662) - Powers the React UI
authRouter.post('/introspect', (req, res) => {
    const { token } = req.body;
    try {
        const decoded = jwt.verify(token, SECRET);
        res.json({ active: true, ...decoded });
    } catch (error) {
        // For the sake of the UI demo, we still decode the expired token so we can display its payload!
        const decoded = jwt.decode(token);
        if (decoded) {
            res.json({ active: false, error: 'invalid_or_expired', ...decoded });
        } else {
            res.json({ active: false });
        }
    }
});

// PHASE 4: The Resource Server (Downstream API)
authRouter.get('/resource/data', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'missing_token' });
    
    const token = authHeader.split(' ')[1];
    
    try {
        const decoded = jwt.verify(token, SECRET);
        
        // SECURITY CHECK: Audience Restriction
        if (decoded.aud !== "api://downstream-resource") {
            return res.status(403).json({ 
                error: 'invalid_audience', 
                message: `Token audience is '${decoded.aud}'. Expected 'api://downstream-resource'.` 
            });
        }

        res.json({ 
            success: true, 
            message: "Successfully accessed protected data!", 
            actor: decoded.act ? decoded.act.sub : "direct user"
        });
    } catch (e) {
        if (e.name === 'TokenExpiredError') {
             return res.status(401).json({ error: 'token_expired', message: 'The provided token has expired.' });
        }
        res.status(401).json({ error: 'invalid_token' });
    }
});

// =====================================================================
// MOUNT ROUTERS
// =====================================================================

// Mount on BOTH paths so it works locally (vite) AND through Nginx!
app.use('/api/auth', authRouter);
app.use('/auth', authRouter);

// Change this line at the bottom of server.js:
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Dummy BFF Server running on port ${PORT}`));