import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const mockBackend = {
  // Now accepts an expired flag to trigger the past timestamp
  getHumanToken: async (expired: boolean = false) => {
    const res = await fetch(`${API_BASE}/api/auth/human?expired=${expired}`);
    return await res.json();
  },
  getAgentToken: async () => {
    const res = await fetch(`${API_BASE}/api/auth/agent`, { method: 'POST' });
    return await res.json();
  },
  exchangeToken: async (subjectToken: string, actorToken: string, scope?: string) => {
    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: subjectToken,
      actor_token: actorToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
      actor_token_type: 'urn:ietf:params:oauth:token-type:jwt'
    });
    if (scope) body.append('scope', scope);
    
    const res = await fetch(`${API_BASE}/api/auth/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    return Object.assign(await res.json(), { status: res.status });
  },
  introspectToken: async (token: string) => {
    const res = await fetch(`${API_BASE}/api/auth/introspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    return await res.json();
  },
  callResourceApi: async (token: string) => {
    const res = await fetch(`${API_BASE}/api/auth/resource/data`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return { status: res.status, data: await res.json() };
  }
};

// =====================================================================
// TOKEN VIEWER COMPONENT (Powered by Introspection)
// =====================================================================
const JwtViewer = ({ token, title, highlightAct = false }: any) => {
  const [payload, setPayload] = useState<any>(null);

  useEffect(() => {
    if (token) {
      mockBackend.introspectToken(token).then(setPayload).catch(() => {});
    }
  }, [token]);

  if (!token) return null;

  // Check if token was marked inactive/expired by the introspection endpoint
  const isWarning = payload?.active === false;

  return (
    <div className={`mt-4 border rounded-lg p-4 bg-gray-900/50 ${isWarning ? 'border-red-500/50' : 'border-gray-700'}`}>
      <div className={`text-xs font-bold mb-3 ${isWarning ? 'text-red-400' : 'text-yellow-500'} flex justify-between`}>
        <span>{isWarning ? '🚨' : '💳'} {title}</span>
        {isWarning && <span className="bg-red-900/40 px-2 py-0.5 rounded text-red-300">EXPIRED / INACTIVE</span>}
      </div>
      <div className="font-mono text-xs overflow-x-auto">
        {payload && Object.entries(payload).map(([key, value]) => {
          // Skip internal active flag used by UI
          if (key === 'active' || key === 'error') return null;

          // Format timestamps beautifully and highlight expired ones
          const isExp = key === 'exp';
          const isExpiredValue = isExp && (value as number) * 1000 < Date.now();
          let displayValue = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);

          // ADDED FULL DATE AND TIME HERE
          if (key === 'iat' || key === 'exp') {
             const date = new Date((value as number) * 1000).toLocaleString(); 
             displayValue = `${value} (${date})`;
          }

          return (
            <div key={key} className={`flex py-1 border-b border-gray-800 last:border-0 ${key === 'act' && highlightAct ? 'bg-green-900/30 -mx-2 px-2 rounded' : ''}`}>
              <div className="w-24 text-gray-500">{key}</div>
              <div className={`flex-1 break-all ${key === 'sub' ? 'text-blue-400' : key === 'act' && highlightAct ? 'text-green-400 font-bold' : key === 'aud' ? 'text-purple-400 font-bold' : isExpiredValue ? 'text-red-400 font-bold' : 'text-gray-300'}`}>
                {displayValue} {isExpiredValue && <span className="ml-2 bg-red-950 px-1 py-0.5 rounded border border-red-900">Past Time</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default function App() {
  const [mode, setMode] = useState<'basic' | 'advanced'>('basic');
  
  const [humanToken, setHumanToken] = useState<string | null>(null);
  const [agentToken, setAgentToken] = useState<string | null>(null);
  const [exchangedToken, setExchangedToken] = useState<string | null>(null);
  
  const [apiResult, setApiResult] = useState<any>(null);
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState<string | null>(null);
  
  // Advanced Features State
  const [downscope, setDownscope] = useState(false);
  const [simulateError, setSimulateError] = useState(false);

  const resetAll = () => {
    setHumanToken(null); setAgentToken(null); setExchangedToken(null); setApiResult(null); setExchangeError(null);
  };

  const handleHumanLogin = async () => {
    setLoadingStep('human');
    const data = await mockBackend.getHumanToken(simulateError);
    setHumanToken(data.access_token);
    setLoadingStep(null);
  };

  const handleAgentLogin = async () => {
    setLoadingStep('agent');
    const data = await mockBackend.getAgentToken();
    setAgentToken(data.access_token);
    setLoadingStep(null);
  };

  const handleTokenExchange = async () => {
    if (!humanToken || !agentToken) return;
    setLoadingStep('exchange');
    setExchangeError(null);
    
    const scopeParam = downscope ? "read:data" : undefined;
    const res = await mockBackend.exchangeToken(humanToken, agentToken, scopeParam);
    
    if (res.status >= 400) setExchangeError(res.error_description);
    else setExchangedToken(res.access_token);
    
    setLoadingStep(null);
  };

  const testApi = async (token: string, type: string) => {
    setLoadingStep(`api_${type}`);
    const res = await mockBackend.callResourceApi(token);
    setApiResult({ type, ...res });
    setLoadingStep(null);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-gray-200 p-4 md:p-8 font-sans leading-relaxed">
      
      {/* Navigation */}
      <header className="max-w-6xl mx-auto mb-8 text-center border-b border-gray-800 pb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-gray-100 mb-6">
          the handoff <span className="text-gray-500">—</span> <span className="text-orange-500">token exchange</span>
        </h1>
        <div className="flex justify-center gap-4">
          <button onClick={() => { setMode('basic'); resetAll(); }} className={`px-6 py-2 rounded-full text-sm transition-all ${mode === 'basic' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50' : 'bg-gray-900 text-gray-500 border border-gray-800 hover:text-gray-300'}`}>Basic Demo</button>
          <button onClick={() => { setMode('advanced'); resetAll(); }} className={`px-6 py-2 rounded-full text-sm transition-all ${mode === 'advanced' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50' : 'bg-gray-900 text-gray-500 border border-gray-800 hover:text-gray-300'}`}>Advanced Scenarios</button>
        </div>
      </header>

      {/* Advanced Controls Panel */}
      {mode === 'advanced' && (
        <div className="max-w-6xl mx-auto mb-6 p-4 bg-gray-900/50 border border-gray-800 rounded-lg flex flex-wrap gap-6 items-center">
          <span className="text-sm font-bold text-gray-400">Advanced Toggles:</span>
          <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-white">
            <input type="checkbox" checked={downscope} onChange={(e) => setDownscope(e.target.checked)} className="accent-orange-500" />
            Downscope to Read-Only during Exchange
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-white">
            <input type="checkbox" checked={simulateError} onChange={(e) => setSimulateError(e.target.checked)} className="accent-red-500" />
            Simulate Expired Human Token
          </label>
        </div>
      )}

      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* LEFT: HUMAN */}
        <div className="bg-gray-900 border border-blue-900/50 rounded-xl p-6 shadow-xl relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-blue-500"></div>
          <div className="text-blue-400 text-sm font-bold tracking-widest uppercase mb-6 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div> Human</div>

          <div className="mb-6">
            <h2 className="text-xl font-bold text-white mb-2">Phase 1: Human Authentication</h2>
            <p className="text-gray-400 text-sm mb-4">
              Log in using a standard <strong>Authorization Code</strong> flow. The browser redirects to the IdP, you authenticate, and come back with an access token.
            </p>
            <button onClick={handleHumanLogin} disabled={!!loadingStep} className="bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-6 rounded-lg w-full transition-colors">
              {loadingStep === 'human' ? 'Authenticating...' : '🔑 Log in as Human'}
            </button>
          </div>
          
          <JwtViewer token={humanToken} title="HUMAN ACCESS TOKEN" />
          
          {humanToken && !simulateError && (
             <div className="mt-8 border-t border-gray-800 pt-6">
               <h2 className="text-xl font-bold text-white mb-2">The Naive Handoff 🚨</h2>
               <p className="text-gray-400 text-sm">
                 You want the Agent to act on your behalf. The naive approach is handing it this exact token. But look at the <strong className="text-purple-400">aud</strong> claim—it is restricted to the agent itself. A properly configured Downstream API will reject it.
               </p>
             </div>
          )}
        </div>

        {/* RIGHT: AGENT */}
        <div className="bg-gray-900 border border-purple-900/50 rounded-xl p-6 shadow-xl relative">
           <div className="absolute top-0 left-0 w-full h-1 bg-purple-500"></div>
           <div className="text-purple-400 text-sm font-bold tracking-widest uppercase mb-6 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-purple-500"></div> AI Agent</div>

          {!humanToken ? (
            <div className="text-gray-600 flex flex-col items-center justify-center h-64 text-sm">
              <span className="text-4xl mb-4 opacity-50">🤖</span>
              Waiting for a human to authenticate...
            </div>
          ) : (
            <div className="space-y-8">
              
              {/* Phase 2 */}
              <div>
                <h2 className="text-xl font-bold text-white mb-2">Phase 2: Agent Identity</h2>
                <p className="text-gray-400 text-sm mb-4">
                  Before the Agent can securely exchange tokens, it needs to prove who it is. It requests its own token via the <strong>Client Credentials</strong> grant.
                </p>
                <button onClick={handleAgentLogin} disabled={!!loadingStep} className="bg-purple-600 hover:bg-purple-500 text-white font-medium py-2 px-6 rounded-lg w-full transition-colors">
                  {loadingStep === 'agent' ? 'Authenticating...' : "🚀 Get Agent Identity"}
                </button>
                <JwtViewer token={agentToken} title="AGENT'S M2M TOKEN" />
              </div>

              {/* Phase 3 */}
              {agentToken && (
                <div className="pt-6 border-t border-gray-800">
                  <h2 className="text-xl font-bold text-white mb-2">Phase 3: Delegation (RFC 8693)</h2>
                  <p className="text-gray-400 text-sm mb-4">
                    The Agent sends both tokens to the IdP's Token Exchange endpoint. It provides the Human token as the <code>subject_token</code>, and its own as the <code>actor_token</code>.
                  </p>
                  
                  <button onClick={handleTokenExchange} disabled={!!loadingStep} className="bg-green-600 hover:bg-green-500 text-white font-medium py-2 px-6 rounded-lg w-full mb-4 transition-colors">
                     {loadingStep === 'exchange' ? 'Processing...' : '🔄 Perform Token Exchange'}
                  </button>

                  {exchangeError && (
                    <div className="p-4 bg-red-950/40 border border-red-900/50 rounded-lg text-red-400 text-sm font-mono">
                      ❌ Identity Provider Error: {exchangeError}
                    </div>
                  )}

                  <JwtViewer token={exchangedToken} title="DELEGATED ACCESS TOKEN" highlightAct={true} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM: PHASE 4 - DOWNSTREAM API */}
      {humanToken && agentToken && (
        <div className="max-w-6xl mx-auto mt-6 bg-gray-900 border border-emerald-900/50 rounded-xl p-6 shadow-xl relative animate-in fade-in slide-in-from-bottom-4">
           <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500"></div>
           <div className="text-emerald-400 text-sm font-bold tracking-widest uppercase mb-6 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Phase 4: Resource Server</div>
           
           <p className="text-sm text-gray-400 mb-6">
             The downstream API strictly enforces limits. It validates the signature, the expiration date, and expects tokens specifically addressed to <code>api://downstream-resource</code>. Let's fire requests to the API and see what happens.
           </p>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <button onClick={() => testApi(humanToken, 'naive')} className="bg-gray-800 hover:bg-gray-700 border border-red-900 text-white py-3 rounded-lg text-sm transition-colors cursor-pointer">
                1. Call API using Original Human Token
              </button>
              <button onClick={() => testApi(exchangedToken || '', 'delegated')} disabled={!exchangedToken} className="bg-gray-800 hover:bg-gray-700 border border-green-900 text-white py-3 rounded-lg text-sm disabled:opacity-50 transition-colors cursor-pointer">
                2. Call API using Exchanged Token
              </button>
           </div>

           {apiResult && (
             <div className={`p-4 rounded-lg font-mono text-sm ${apiResult.status === 200 ? 'bg-green-950/30 border border-green-900/50 text-green-400' : 'bg-red-950/30 border border-red-900/50 text-red-400'}`}>
                <div className="font-bold mb-2">HTTP {apiResult.status} Response:</div>
                <div>{JSON.stringify(apiResult.data, null, 2)}</div>
             </div>
           )}
        </div>
      )}

    </div>
  );
}