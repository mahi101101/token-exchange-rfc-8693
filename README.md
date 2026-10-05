# The Handoff: OAuth 2.0 Token Exchange (RFC 8693) Demo

A vendor-agnostic, interactive demonstration of how **AI Agents securely impersonate or act on behalf of humans** using the **OAuth 2.0 Token Exchange specification (RFC 8693)**.

---

## Architecture

This project uses a **Monorepo** structure with a **Backend-for-Frontend (BFF)** pattern.

As requested, the Human OAuth flow is modeled as a **Regular Web Application (Confidential Client)**, meaning the backend handles the authorization code exchange.

The React frontend **never sees the client secrets**.

```text
/token-exchange-demo
├── /frontend
│   ├── src/App.tsx          # Main UI (Token visualization, Acts 1–3)
│   └── package.json
│
├── /backend
│   ├── server.js            # Handles IdP communication and CORS
│   └── package.json
│
├── .env                     # Shared environment variables
└── package.json             # Root (uses `concurrently` to run both)
```

### Flow Overview

The demo consists of three main acts:

1. **Act 1 — Human Login**

   * The user authenticates with the Identity Provider (IdP).
   * The backend exchanges the authorization code for a human access token.

2. **Act 3a — AI Agent Identity**

   * The AI Agent authenticates using the Client Credentials grant.
   * The backend obtains an access token representing the agent itself.

3. **Act 3b — Token Exchange / Delegation**

   * The AI Agent exchanges tokens using **OAuth 2.0 Token Exchange (RFC 8693)**.
   * The resulting token represents the agent acting on behalf of the human.

---

## Prerequisites

You need an OAuth 2.0 / OpenID Connect Identity Provider that supports the required flows.

This demo can be configured with providers such as:

* Auth0
* Okta
* Ping
* Gravitee
* Other OAuth 2.0 providers supporting RFC 8693

> **Note:** Make sure your Identity Provider supports **OAuth 2.0 Token Exchange (RFC 8693)**. Some providers require custom actions, policies, or feature flags to enable Token Exchange.

---

## Identity Provider Setup

To use this demo, create **two applications** in your Identity Provider dashboard.

### 1. Human Application

Create a **Regular Web Application / Confidential Client**.

| Setting          | Value                            |
| ---------------- | -------------------------------- |
| Application Type | Regular Web Application          |
| Client Type      | Confidential                     |
| Grant Type       | Authorization Code               |
| Redirect URI     | `http://localhost:3000/callback` |

The human application's client secret must remain on the backend.

### 2. AI Agent Application

Create a **Machine-to-Machine / Confidential Client** application.

| Setting          | Value                              |
| ---------------- | ---------------------------------- |
| Application Type | Machine-to-Machine                 |
| Client Type      | Confidential                       |
| Grant Types      | Client Credentials, Token Exchange |

The agent application's client secret must also remain on the backend.

---

## Environment Variables

Create a `.env` file in the project root.

```env
# ==========================================
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
```

> **Security:** Never commit your `.env` file or client secrets to GitHub. Add `.env` to your `.gitignore`.

Example:

```gitignore
.env
node_modules/
```

---

# The Express.js Backend (BFF)

The Express.js backend acts as the **Backend-for-Frontend (BFF)**.

It is responsible for:

* Communicating with the Identity Provider
* Keeping OAuth client secrets out of the frontend
* Exchanging authorization codes
* Obtaining the AI Agent's access token
* Performing RFC 8693 Token Exchange
* Handling CORS
* Returning tokens to the frontend

## `backend/server.js`

```javascript
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
        const response = await axios.post(
            process.env.IDP_TOKEN_ENDPOINT,
            new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: process.env.HUMAN_CLIENT_ID,
                client_secret: process.env.HUMAN_CLIENT_SECRET,
                code: code,
                redirect_uri: process.env.REDIRECT_URI
            })
        );

        // Send access_token to frontend
        res.json({
            access_token: response.data.access_token
        });

    } catch (error) {
        res.status(500).json({
            error: 'Failed to exchange code for human token'
        });
    }
});


// ---------------------------------------------------------
// Act 3a: Agent gets its own identity
// ---------------------------------------------------------

app.post('/api/agent-token', async (req, res) => {
    try {
        const response = await axios.post(
            process.env.IDP_TOKEN_ENDPOINT,
            new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: process.env.AGENT_CLIENT_ID,
                client_secret: process.env.AGENT_CLIENT_SECRET,
                audience: 'api://your-api-audience'
            })
        );

        res.json({
            access_token: response.data.access_token
        });

    } catch (error) {
        res.status(500).json({
            error: 'Failed to get agent token'
        });
    }
});


// ---------------------------------------------------------
// Act 3b: Delegation via Token Exchange (RFC 8693)
// ---------------------------------------------------------

app.post('/api/token-exchange', async (req, res) => {
    const { subject_token, actor_token } = req.body;

    try {
        const response = await axios.post(
            process.env.IDP_TOKEN_ENDPOINT,
            new URLSearchParams({
                grant_type:
                    'urn:ietf:params:oauth:grant-type:token-exchange',

                client_id: process.env.AGENT_CLIENT_ID,
                client_secret: process.env.AGENT_CLIENT_SECRET,

                subject_token: subject_token,

                subject_token_type:
                    'urn:ietf:params:oauth:token-type:access_token',

                actor_token: actor_token,

                actor_token_type:
                    'urn:ietf:params:oauth:token-type:access_token',

                requested_token_type:
                    'urn:ietf:params:oauth:token-type:access_token'
            })
        );

        res.json({
            access_token: response.data.access_token
        });

    } catch (error) {
        res.status(500).json({
            error: 'Token exchange failed'
        });
    }
});


const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
    console.log(`BFF Server running on port ${PORT}`);
});
```

---

## API Endpoints

The backend exposes the following endpoints:

| Endpoint                   | Purpose                                                    |
| -------------------------- | ---------------------------------------------------------- |
| `POST /api/human-token`    | Exchanges the human authorization code for an access token |
| `POST /api/agent-token`    | Obtains an access token for the AI Agent                   |
| `POST /api/token-exchange` | Performs RFC 8693 Token Exchange                           |

### `POST /api/human-token`

Exchanges an authorization code received from the frontend for a human access token.

**Request:**

```json
{
  "code": "authorization_code"
}
```

**Response:**

```json
{
  "access_token": "human_access_token"
}
```

---

### `POST /api/agent-token`

Obtains an access token representing the AI Agent using the Client Credentials grant.

**Response:**

```json
{
  "access_token": "agent_access_token"
}
```

---

### `POST /api/token-exchange`

Performs an OAuth 2.0 Token Exchange using RFC 8693.

**Request:**

```json
{
  "subject_token": "human_access_token",
  "actor_token": "agent_access_token"
}
```

**Response:**

```json
{
  "access_token": "delegated_access_token"
}
```

---

## OAuth 2.0 Token Exchange

The key concept demonstrated by this project is **delegation**.

The human first authenticates and receives an access token:

```text
Human
  │
  │ Authorization Code
  ▼
Identity Provider
  │
  │ Human Access Token
  ▼
Backend
```

The AI Agent then obtains its own identity:

```text
AI Agent
  │
  │ Client Credentials
  ▼
Identity Provider
  │
  │ Agent Access Token
  ▼
Backend
```

Finally, the backend performs the Token Exchange:

```text
Human Access Token
        +
Agent Access Token
        │
        ▼
   RFC 8693 Token Exchange
        │
        ▼
 Delegated Access Token
```

The resulting token allows the downstream API to understand both:

* **Who the human is**
* **Which agent is acting on the human's behalf**

---

## Security Model

The architecture intentionally keeps OAuth client credentials on the server.

```text
┌──────────────────────┐
│    React Frontend    │
│                      │
│  No client secrets   │
└──────────┬───────────┘
           │
           │ HTTP
           ▼
┌──────────────────────┐
│    Express BFF       │
│                      │
│  Client credentials  │
│  Token exchange      │
└──────────┬───────────┘
           │
           │ OAuth 2.0
           ▼
┌──────────────────────┐
│    Identity Provider │
└──────────────────────┘
```

The frontend should never contain:

* `HUMAN_CLIENT_SECRET`
* `AGENT_CLIENT_SECRET`

These values belong exclusively on the backend.

---

## Running the Demo

Install the dependencies for the monorepo:

```bash
npm install
```

Make sure your `.env` file is configured with the appropriate Identity Provider credentials.

Then start both the frontend and backend using the root `package.json`:

```bash
npm run dev
```

The frontend and backend will start according to the scripts configured in the root project.

---

## Project Structure

```text
token-exchange-demo/
│
├── frontend/
│   ├── src/
│   │   └── App.tsx
│   └── package.json
│
├── backend/
│   ├── server.js
│   └── package.json
│
├── .env
├── .gitignore
├── package.json
└── README.md
```

---

## Important Notes

### RFC 8693 Support

Not every Identity Provider supports OAuth 2.0 Token Exchange in the same way.

Depending on the provider, you may need to configure:

* Token Exchange permissions
* Custom scopes
* Actions or hooks
* API/resource server configuration
* Token Exchange policies
* Audience configuration

### Audience

The example uses:

```text
api://your-api-audience
```

Replace this with the actual audience configured for your downstream API.

### Production Considerations

This demo is intended for educational and demonstration purposes.

For production deployments, consider:

* Using secure, `HttpOnly` cookies instead of exposing access tokens to browser JavaScript where possible.
* Implementing CSRF protection.
* Restricting CORS to trusted origins.
* Validating and sanitizing all incoming requests.
* Validating token claims and issuer/audience.
* Using short-lived access tokens.
* Implementing proper token storage and rotation.
* Avoiding logging of access tokens or client secrets.
* Using HTTPS in all non-local environments.

---

## Goal

This demo illustrates how **OAuth 2.0 Token Exchange (RFC 8693)** can be used to establish a secure delegation relationship where an **AI Agent acts on behalf of an authenticated human** while maintaining distinct identities for the human and the agent.
