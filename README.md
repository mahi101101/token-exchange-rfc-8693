The Handoff: OAuth 2.0 Token Exchange (RFC 8693) DemoA vendor-agnostic, interactive demonstration of how AI Agents securely impersonate/act on behalf of humans using the OAuth 2.0 Token Exchange specification.ArchitectureThis project uses a Monorepo structure with a Backend-for-Frontend (BFF) pattern.As requested, the Human OAuth flow is modeled as a Regular Web Application (Confidential Client), meaning the backend handles the authorization code exchange. The React frontend never sees the client secrets./token-exchange-demo
├── /frontend          # React App (Vite/CRA)
│   ├── src/App.tsx    # Main UI (Token visualization, Acts 1-3)
│   └── package.json
├── /backend           # Express.js BFF
│   ├── server.js      # Handles IdP communication and CORS
│   └── package.json
├── .env               # Shared environment variables
└── package.json       # Root (uses `concurrently` to run both)
Prerequisites: Identity Provider (IdP) SetupTo use this with Auth0, Okta, Ping, or Gravitee, you need to create TWO applications in your IdP dashboard:The Human App (Regular Web App):Grant Types: Authorization CodeRedirect URI: http://localhost:3000/callbackThe AI Agent App (Machine-to-Machine / Confidential):Grant Types: Client Credentials, Token ExchangeNote: Ensure your IdP supports RFC 8693. Some providers require custom actions or specific feature flags to enable Token Exchange.Environment Variables (.env)# ==========================================
# 1. Identity Provider Base Config
# ==========================================
IDP_ISSUER=https://your-tenant.us.auth0.com
IDP_TOKEN_ENDPOINT=https://your-tenant.us.auth0.com/oauth/token
IDP_AUTH_ENDPOINT=https://your-tenant.us.auth0.com/authorize

# ==========================================
# 2. Human Application (Act 1)
# ==========================================
HUMAN_CLIENT_ID=your_human_app_client_id
HUMAN_CLIENT_SECRET=your_human_app_client_secret
REDIRECT_URI=http://localhost:3000/callback

# ==========================================
# 3. AI Agent Application (Act 3)
# ==========================================
AGENT_CLIENT_ID=your_agent_app_client_id
AGENT_CLIENT_SECRET=your_agent_app_client_secret
The Express.js Backend (BFF)Here is the complete server.js code for your backend. It handles the heavy lifting, securely storing secrets and making the POST requests to the IdP.// backend/server.js
const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config({ path: '../.env' });

const app = express();
app.use(cors());
app.use(express.json());

// ---------------------------------------------------------
// Act 1: Human Login (Authorization Code Exchange)
// ---------------------------------------------------------
app.post('/api/human-token', async (req, res) => {
    const { code } = req.body; // Code received from frontend redirect
    
    try {
        const response = await axios.post(process.env.IDP_TOKEN_ENDPOINT, new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: process.env.HUMAN_CLIENT_ID,
            client_secret: process.env.HUMAN_CLIENT_SECRET,
            code: code,
            redirect_uri: process.env.REDIRECT_URI
        }));
        // Send access_token to frontend
        res.json({ access_token: response.data.access_token });
    } catch (error) {
        res.status(500).json({ error: 'Failed to exchange code for human token' });
    }
});

// ---------------------------------------------------------
// Act 3a: Agent gets its own identity
// ---------------------------------------------------------
app.post('/api/agent-token', async (req, res) => {
    try {
        const response = await axios.post(process.env.IDP_TOKEN_ENDPOINT, new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: process.env.AGENT_CLIENT_ID,
            client_secret: process.env.AGENT_CLIENT_SECRET,
            audience: 'api://your-api-audience'
        }));
        res.json({ access_token: response.data.access_token });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get agent token' });
    }
});

// ---------------------------------------------------------
// Act 3b: Delegation via Token Exchange (RFC 8693)
// ---------------------------------------------------------
app.post('/api/token-exchange', async (req, res) => {
    const { subject_token, actor_token } = req.body;

    try {
        const response = await axios.post(process.env.IDP_TOKEN_ENDPOINT, new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
            client_id: process.env.AGENT_CLIENT_ID,
            client_secret: process.env.AGENT_CLIENT_SECRET,
            subject_token: subject_token,
            subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
            actor_token: actor_token,
            actor_token_type: 'urn:ietf:params:oauth:token-type:access_token',
            requested_token_type: 'urn:ietf:params:oauth:token-type:access_token'
        }));
        res.json({ access_token: response.data.access_token });
    } catch (error) {
         res.status(500).json({ error: 'Token exchange failed' });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`BFF Server running on port ${PORT}`));
