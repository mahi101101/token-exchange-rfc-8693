# The Handoff: OAuth 2.0 Token Exchange (RFC 8693) Demo

An interactive, full-stack demonstration of how **AI Agents securely act on behalf of human users** using the **OAuth 2.0 Token Exchange specification ([RFC 8693](https://datatracker.ietf.org/doc/html/rfc8693))**.

This application visually contrasts the naive approach (sharing user credentials or tokens directly with an agent) against the standard RFC 8693 token exchange pattern—maintaining an auditable chain of custody via the `act` (actor) claim, enforcing audience restriction (`aud`), and supporting scope downscoping.

---

## Architecture

This project follows a **Monorepo** structure implementing a **Backend-for-Frontend (BFF)** pattern.

The human OAuth flow and AI agent identity management are handled by the backend BFF. The React frontend never holds confidential client secrets.

```text
OAuth 2.0 Token Exchange (RFC 8693) Demo/
├── frontend/                     # React 19 + TypeScript + Vite + Tailwind CSS v4
│   ├── src/
│   │   ├── App.tsx               # Main interactive UI (JWT & HTTP viewers, 3 modes)
│   │   └── main.tsx              # React entry point
│   ├── vite.config.ts            # Base path (/token-exchange/) & dev proxy (/api)
│   ├── Dockerfile                # Frontend container (Port 5173)
│   └── package.json
│
├── backend/                      # Node.js (ES Module) Express BFF & Mock IdP
│   ├── server.js                 # Token issuance, RFC 8693 exchange, Resource API
│   ├── Dockerfile                # Backend container (Port 3001)
│   └── package.json
│
├── docker-compose.yaml           # Multi-container orchestration (Backend, Frontend, Proxy)
├── nginx.conf                    # Nginx reverse proxy configuration (Port 8080)
└── README.md
```

---

## Key Concepts Demonstrated

### 1. Delegation vs. Impersonation
* **Naive Impersonation (Anti-pattern):** Passing the human's access token directly to an AI agent. The downstream resource cannot tell whether actions were initiated by the human directly or by an automated agent. Furthermore, audience mismatches occur.
* **Secure Delegation (RFC 8693):** The agent exchanges the human token and its own client identity for a new **Delegated Token**. The token preserves the human as the `sub` (subject), introduces the agent in the `act` (actor) claim, and retargets the `aud` (audience) to the target resource.

### 2. Audience Restriction (`aud`)
* The original human token targets `api://agent-service`.
* The downstream resource server strictly requires `api://downstream-resource`.
* Calling the downstream API with the naive human token fails with HTTP **403 Forbidden** (`invalid_audience`). The exchanged token succeeds with HTTP **200 OK**.

### 3. Chain of Custody (Nested `act` Claim)
Under RFC 8693 Section 4.1.1, when multiple agents collaborate in a chain (e.g. Human &rarr; Agent 1 &rarr; Agent 2):
```json
{
  "sub": "usr_abf995f2-00ca-33b9-8fd1",
  "client_id": "app_ai_agent_v2",
  "act": {
    "sub": "app_ai_agent_v2",
    "act": {
      "sub": "app_ai_agent_v1"
    }
  },
  "aud": "api://downstream-resource"
}
```
Every handoff is cryptographically tracked in the token's claims.

### 4. Scope Reduction (Downscoping)
During token exchange, the agent can request a subset of permissions (e.g., downscoping from `read:data write:data` to `read:data`), practicing the principle of least privilege.

---

## Interactive UI Modes

The React frontend includes three dedicated demonstration modes:

1. **Basic Demo**:
   * Step-by-step walkthrough of Phase 1 (Human Login), Phase 2 (Agent Identity), Phase 3 (Token Exchange), and Phase 4 (Resource Server Verification).
2. **Advanced Scenarios**:
   * **Scope Downscoping Toggle**: Request only `read:data` during exchange.
   * **Expired Token Toggle**: Simulate an expired human token and observe Identity Provider validation rejections.
3. **Multi-Agent Chain**:
   * Visualizes recursive agent handoffs. Launch multiple agents sequentially and inspect the nested `act` claims generated at each step.

Each step includes a **Live HTTP Request Viewer** (displaying exact request payloads) and a **Live JWT Decoder** (powered by RFC 7662 token introspection).

---

## Flow Overview

```text
   [Human User]                   [AI Agent]                 [BFF / IdP]              [Resource Server]
        │                              │                          │                           │
  1. Authenticate                      │                          │                           │
        ├──────────────────────────────┼─────────────────────────>│                           │
        │<─────────────────────────────┼──────────────────────────┤ (Human Token issued)      │
        │                              │                          │                           │
        │                        2. Client Credentials            │                           │
        │                              ├─────────────────────────>│                           │
        │                              │<─────────────────────────┤ (Agent M2M Token issued)  │
        │                              │                          │                           │
        │                        3. Token Exchange (RFC 8693)     │                           │
        │                              │  subject_token +         │                           │
        │                              │  actor_token             │                           │
        │                              ├─────────────────────────>│                           │
        │                              │<─────────────────────────┤ (Delegated Token with     │
        │                              │                          │  nested 'act' claim)      │
        │                              │                          │                           │
        │                              │ 4. Access Protected API  │                           │
        │                              │    (Bearer Delegated Token)                          │
        │                              ├─────────────────────────────────────────────────────>│
        │                              │<─────────────────────────────────────────────────────┤ (200 OK)
```

---

## Backend API Endpoints

The Express server listens on port `3001` and mounts routes on both `/api/auth` and `/auth`:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/auth/human` | Generates a signed Human Access Token (`?expired=true` to test expiry) |
| `POST` | `/api/auth/agent` | Generates an Agent M2M Access Token (body: `{ agent_id?: string }`) |
| `POST` | `/api/auth/exchange` | Performs RFC 8693 Token Exchange (`subject_token`, `actor_token`, `scope`) |
| `POST` | `/api/auth/introspect` | RFC 7662 Introspection endpoint decoding and validating tokens for the UI |
| `GET` | `/api/auth/resource/data` | Protected Downstream Resource Server API enforcing audience check |

### 1. `GET /api/auth/human`
* **Query Parameters:** `expired=true` (optional)
* **Response:**
  ```json
  {
    "access_token": "eyJhbGciOi..."
  }
  ```
* **Decoded Payload:**
  ```json
  {
    "iss": "https://demo-idp.local/",
    "aud": "api://agent-service",
    "sub": "usr_abf995f2-00ca-33b9-8fd1",
    "client_id": "app_human_ui",
    "scope": "openid profile email write:data read:data",
    "iat": 1728374400,
    "exp": 1728378000
  }
  ```

### 2. `POST /api/auth/agent`
* **Request Body:**
  ```json
  {
    "agent_id": "app_agent_m2m"
  }
  ```
* **Response:**
  ```json
  {
    "access_token": "eyJhbGciOi..."
  }
  ```

### 3. `POST /api/auth/exchange`
* **Request Content-Type:** `application/x-www-form-urlencoded`
* **Parameters:**
  ```text
  grant_type=urn:ietf:params:oauth:grant-type:token-exchange
  subject_token=<human_token>
  subject_token_type=urn:ietf:params:oauth:token-type:jwt
  actor_token=<agent_token>
  actor_token_type=urn:ietf:params:oauth:token-type:jwt
  scope=read:data (optional)
  ```
* **Response:**
  ```json
  {
    "access_token": "eyJhbGciOi..."
  }
  ```
* **Decoded Payload:**
  ```json
  {
    "iss": "https://demo-idp.local/",
    "aud": "api://downstream-resource",
    "sub": "usr_abf995f2-00ca-33b9-8fd1",
    "client_id": "app_agent_m2m",
    "act": {
      "sub": "app_agent_m2m"
    },
    "scope": "openid profile email write:data read:data",
    "iat": 1728374400,
    "exp": 1728378000
  }
  ```

### 4. `GET /api/auth/resource/data`
* **Header:** `Authorization: Bearer <token>`
* **Success Response (HTTP 200):**
  ```json
  {
    "success": true,
    "message": "Successfully accessed protected data!",
    "actor": "app_agent_m2m"
  }
  ```
* **Audience Mismatch (HTTP 403):**
  ```json
  {
    "error": "invalid_audience",
    "message": "Token audience is 'api://agent-service'. Expected 'api://downstream-resource'."
  }
  ```

---

## Running the Demo

You can run the demo either using **Docker Compose** (recommended for production-like reverse proxy routing) or as **Local Development Services**.

### Option A: Docker Compose (Recommended)

Docker Compose starts the backend, frontend, and an Nginx reverse proxy on port `8080`.

1. Start all services:
   ```bash
   docker compose up --build
   ```
2. Open your browser:
   * **Application URL:** `http://localhost:8080/token-exchange/`
3. Port mappings:
   * `8080`: Nginx Reverse Proxy (routes `/token-exchange/` to frontend and `/api/` to backend)
   * `5173`: Vite frontend
   * `3001`: Express backend

To stop the containers:
```bash
docker compose down
```

---

### Option B: Local Development (Node.js)

Ensure Node.js (v18+) is installed.

#### 1. Start the Backend
```bash
cd backend
npm install
npm run dev
```
The backend server runs at `http://localhost:3001`.

#### 2. Start the Frontend
In a new terminal:
```bash
cd frontend
npm install
npm run dev
```
The frontend Vite server runs at `http://localhost:5173`.
* Access the app at: `http://localhost:5173/token-exchange/`
* During development, Vite automatically proxies all `/api/*` calls to `http://localhost:3001`.

---

## Adapting to an Enterprise Identity Provider

Out of the box, the backend runs a **self-contained mock Identity Provider** using `jsonwebtoken` so you can test and explore the demo immediately without requiring third-party credentials.

To connect this demo to an external OAuth 2.0 provider that supports RFC 8693 (such as **Auth0**, **Okta**, **PingIdentity**, or **Gravitee**):

1. **Register Applications in your IdP:**
   * **Human Application:** Regular Web Application / Confidential Client (Authorization Code grant).
   * **AI Agent Application:** Machine-to-Machine / Confidential Client (Client Credentials & Token Exchange grants).
2. **Update the BFF (`backend/server.js`):**
   * Replace the local JWT signing functions with outbound HTTPS requests to your IdP's token endpoint (`POST /oauth/token`).
   * Forward client credentials (`HUMAN_CLIENT_SECRET`, `AGENT_CLIENT_SECRET`) securely from backend environment variables.
   * Verify IdP tokens using the provider's JWKS endpoint (`/.well-known/jwks.json`).

---

## Security Considerations

* **Confidential Clients:** The frontend never stores or handles client secrets. All token operations requiring client authentication stay on the BFF.
* **Audience Restriction:** Downstream resources must strictly validate the `aud` claim to prevent token forwarding and cross-service impersonation attacks.
* **Short-Lived Delegated Tokens:** Exchanged tokens should have short expirations to minimize risk in automated workflows.
* **Production Hardening:** In production applications, store tokens in secure, `HttpOnly`, `SameSite` cookies instead of browser memory, and enforce TLS/HTTPS across all endpoints.

---

## License

MIT
