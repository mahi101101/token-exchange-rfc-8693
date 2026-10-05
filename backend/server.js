import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';

const app = express();
const PORT = 3001;

// =====================================================================
// MIDDLEWARE
// =====================================================================
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Beautiful terminal logger to show requests during your live demo
app.use((req, res, next) => {
    console.log(`\n======================================================`);
    console.log(`📡 [${req.method}] ${req.originalUrl}`);
    
    // Safely check if req.body exists and is an object with keys
    if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
        console.log(`📦 Payload:`);
        console.dir(req.body, { colors: true });
    }
    
    console.log(`======================================================\n`);
    next();
});

// =====================================================================
// UTILITY: Generate Dummy Tokens
// =====================================================================
const SECRET = "super_secret_key_for_demo_purposes_only";

const generateToken = (payload) => {
    return jwt.sign(
        {
            iss: "https://demo-idp.local/",
            aud: "api://demo-audience",
            ...payload
        },
        SECRET,
        { expiresIn: '1h' }
    );
};

// =====================================================================
// ACT 1: Human Login 
// =====================================================================
app.get('/api/auth/human', async (req, res) => {
    setTimeout(() => {
        const humanToken = generateToken({
            sub: "usr_abf995f2-00ca-33b9-8fd1",
            client_id: "app_human_ui",
            scope: "openid profile email"
        });
        res.json({ access_token: humanToken });
    }, 800);
});

// =====================================================================
// ACT 3a: Agent Identity
// =====================================================================
app.post('/api/auth/agent', async (req, res) => {
    setTimeout(() => {
        const agentToken = generateToken({
            sub: "app_agent_m2m",
            client_id: "app_agent_m2m",
            scope: "read:data"
        });
        res.json({ access_token: agentToken });
    }, 800);
});

// =====================================================================
// ACT 3b: Token Exchange (RFC 8693)
// =====================================================================
app.post('/api/auth/exchange', async (req, res) => {
    const { grant_type, subject_token, actor_token } = req.body;

    if (grant_type !== 'urn:ietf:params:oauth:grant-type:token-exchange') {
        return res.status(400).json({ error: 'unsupported_grant_type' });
    }

    try {
        const subPayload = jwt.decode(subject_token);
        const actorPayload = jwt.decode(actor_token);

        setTimeout(() => {
            // The core RFC 8693 logic: Injecting the act claim
            const exchangedToken = generateToken({
                sub: subPayload.sub,                 
                client_id: actorPayload.client_id,   
                act: {
                    sub: actorPayload.sub            
                },
                scope: "openid profile read:data"
            });
            
            res.json({ access_token: exchangedToken });
        }, 1200);

    } catch (error) {
        res.status(400).json({ error: 'invalid_request', error_description: 'Failed to parse tokens' });
    }
});

// =====================================================================
// INTROSPECTION (RFC 7662) - Powers the React UI
// =====================================================================
app.post('/api/auth/introspect', (req, res) => {
    const { token } = req.body;
    try {
        // Verify and decode the token securely
        const decoded = jwt.verify(token, SECRET);
        res.json({ active: true, ...decoded });
    } catch (error) {
        res.json({ active: false });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`🚀 Dummy BFF Server running on http://localhost:${PORT}`);
    console.log(`🔗 Ready for live demo Token Exchange...`);
});