import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';

const app = express();
const PORT = 3001;

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

// PHASE 2: Agent Identity
authRouter.post('/agent', async (req, res) => {
    setTimeout(() => {
        const now = Math.floor(Date.now() / 1000);
        const agentToken = jwt.sign(
            {
                iss: "https://demo-idp.local/",
                aud: "https://demo-idp.local/",
                sub: "app_agent_m2m",
                client_id: "app_agent_m2m",
                scope: "exchange:tokens",
                iat: now,
                exp: now + 3600
            },
            SECRET
        );
        res.json({ access_token: agentToken });
    }, 800);
});

// PHASE 3: Token Exchange (RFC 8693)
authRouter.post('/exchange', async (req, res) => {
    const { grant_type, subject_token, actor_token, scope } = req.body;

    if (grant_type !== 'urn:ietf:params:oauth:grant-type:token-exchange') {
        return res.status(400).json({ error: 'unsupported_grant_type' });
    }

    try {
        // We MUST verify the subject token to ensure it isn't expired/forged
        const subPayload = jwt.verify(subject_token, SECRET);
        const actorPayload = jwt.verify(actor_token, SECRET);

        // FEATURE TOGGLE: Downscoping
        const finalScopes = scope || subPayload.scope;

        setTimeout(() => {
            const now = Math.floor(Date.now() / 1000);
            const exchangedToken = jwt.sign(
                {
                    iss: "https://demo-idp.local/",
                    aud: "api://downstream-resource", // NEW AUDIENCE
                    sub: subPayload.sub,                
                    client_id: actorPayload.client_id,   
                    act: { sub: actorPayload.sub },
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
        res.status(400).json({ error: 'invalid_request', error_description: 'Failed to parse or verify tokens.' });
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

app.use('/api/auth', authRouter);

app.listen(PORT, () => console.log(`🚀 Dummy BFF Server running on http://localhost:${PORT}`));