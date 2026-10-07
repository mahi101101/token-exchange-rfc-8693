import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const mockBackend = {
  getHumanToken: async (expired: boolean = false) => {
    const res = await fetch(`${API_BASE}/api/auth/human?expired=${expired}`);
    return await res.json();
  },
  getAgentToken: async (agentId?: string) => {
    const res = await fetch(`${API_BASE}/api/auth/agent`, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(agentId ? { agent_id: agentId } : {})
    });
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
// HTTP REQUEST VIEWER COMPONENT
// =====================================================================
const HttpRequestViewer = ({ method, url, body, title }: { method: string, url: string, body?: string, title?: string }) => (
  <div className="mb-4 bg-black border border-gray-700 rounded-lg p-4 font-mono text-xs text-gray-300 shadow-inner overflow-hidden">
    {title && <div className="text-gray-500 mb-2 font-sans font-bold uppercase tracking-wider">{title}</div>}
    <div className="mb-2">
      <span className="text-green-400 font-bold">{method}</span> <span className="text-blue-400">{url}</span>
    </div>
    {body && (
      <div className="whitespace-pre-wrap break-all text-gray-400 mt-2 border-t border-gray-800 pt-2 leading-loose">
        {body}
      </div>
    )}
  </div>
);

// =====================================================================
// TOKEN VIEWER COMPONENT
// =====================================================================
const JwtViewer = ({ token, title, highlightAct = false }: any) => {
  const [payload, setPayload] = useState<any>(null);

  useEffect(() => {
    if (token) mockBackend.introspectToken(token).then(setPayload).catch(() => {});
  }, [token]);

  if (!token) return null;
  const isWarning = payload?.active === false;

  return (
    <div className={`mt-4 border rounded-lg p-4 bg-gray-900/50 ${isWarning ? 'border-red-500/50' : 'border-gray-700'}`}>
      <div className={`text-xs font-bold mb-3 ${isWarning ? 'text-red-400' : 'text-yellow-500'} flex justify-between`}>
        <span>{isWarning ? '🚨' : '💳'} {title}</span>
        {isWarning && <span className="bg-red-900/40 px-2 py-0.5 rounded text-red-300">EXPIRED / INACTIVE</span>}
      </div>
      <div className="font-mono text-xs overflow-x-auto">
        {payload && Object.entries(payload).map(([key, value]) => {
          if (key === 'active' || key === 'error') return null;
          
          const isExp = key === 'exp';
          const isExpiredValue = isExp && (value as number) * 1000 < Date.now();
          let displayValue = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);

          if (key === 'iat' || key === 'exp') {
             const date = new Date((value as number) * 1000).toLocaleString();
             displayValue = `${value} (${date})`;
          }

          return (
            <div key={key} className={`flex py-1 border-b border-gray-800 last:border-0 ${key === 'act' && highlightAct ? 'bg-green-900/30 -mx-2 px-2 rounded' : ''}`}>
              <div className="w-24 text-gray-500">{key}</div>
              <div className={`flex-1 break-all whitespace-pre-wrap ${key === 'sub' ? 'text-blue-400' : key === 'act' && highlightAct ? 'text-green-400 font-bold' : key === 'aud' ? 'text-purple-400 font-bold' : isExpiredValue ? 'text-red-400 font-bold' : 'text-gray-300'}`}>
                {displayValue} {isExpiredValue && <span className="ml-2 bg-red-950 px-1 py-0.5 rounded border border-red-900">Past Time</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

type AppMode = 'basic' | 'advanced' | 'multi-agent';

export default function App() {
  const [mode, setMode] = useState<AppMode>('basic');
  
  const [humanToken, setHumanToken] = useState<string | null>(null);
  const [apiResult, setApiResult] = useState<any>(null);
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState<string | null>(null);
  
  const [agentToken, setAgentToken] = useState<string | null>(null);
  const [exchangedToken, setExchangedToken] = useState<string | null>(null);
  const [downscope, setDownscope] = useState(false);
  const [simulateError, setSimulateError] = useState(false);

  const [agentChain, setAgentChain] = useState<{ agentId: string, m2mToken: string, exchangedToken: string }[]>([]);

  const resetAll = () => {
    setHumanToken(null); setAgentToken(null); setExchangedToken(null); 
    setAgentChain([]); setApiResult(null); setExchangeError(null);
  };

  const handleHumanLogin = async () => {
    setLoadingStep('human');
    const data = await mockBackend.getHumanToken(simulateError && mode === 'advanced');
    setHumanToken(data.access_token);
    
    setAgentToken(null);
    setExchangedToken(null);
    setAgentChain([]);
    setApiResult(null);
    setExchangeError(null);
    
    setLoadingStep(null);
  };

  const handleSingleAgentLogin = async () => {
    setLoadingStep('agent');
    const data = await mockBackend.getAgentToken();
    setAgentToken(data.access_token);
    
    setExchangedToken(null);
    setApiResult(null);
    setExchangeError(null);
    
    setLoadingStep(null);
  };

  const handleSingleTokenExchange = async () => {
    if (!humanToken || !agentToken) return;
    setLoadingStep('exchange');
    setExchangeError(null);
    
    const scopeParam = downscope && mode === 'advanced' ? "read:data" : undefined;
    const res = await mockBackend.exchangeToken(humanToken, agentToken, scopeParam);
    
    if (res.status >= 400) setExchangeError(res.error_description);
    else setExchangedToken(res.access_token);
    
    setLoadingStep(null);
  };

  const handleNextAgentHandOff = async () => {
    setLoadingStep('handoff');
    setExchangeError(null);
    
    const nextAgentIndex = agentChain.length + 1;
    const nextAgentId = `app_ai_agent_v${nextAgentIndex}`;
    const subjectTokenToExchange = agentChain.length === 0 ? humanToken! : agentChain[agentChain.length - 1].exchangedToken;

    const agentData = await mockBackend.getAgentToken(nextAgentId);
    const agentM2MToken = agentData.access_token;

    const exData = await mockBackend.exchangeToken(subjectTokenToExchange, agentM2MToken);

    if (exData.status >= 400) {
      setExchangeError(exData.error_description);
    } else {
      setAgentChain([...agentChain, {
        agentId: nextAgentId,
        m2mToken: agentM2MToken,
        exchangedToken: exData.access_token
      }]);
    }
    setLoadingStep(null);
  };

  const testApi = async (token: string, type: string) => {
    setLoadingStep(`api_${type}`);
    const res = await mockBackend.callResourceApi(token);
    setApiResult({ type, ...res });
    setLoadingStep(null);
  };

  const currentDelegatedToken = mode === 'multi-agent' 
    ? (agentChain.length > 0 ? agentChain[agentChain.length - 1].exchangedToken : null)
    : exchangedToken;

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-gray-200 p-4 md:p-8 font-sans leading-relaxed">
      
      {/* Navigation */}
      <header className="max-w-6xl mx-auto mb-8 text-center border-b border-gray-800 pb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-gray-100 mb-4">
          the handoff <span className="text-gray-500">—</span> <span className="text-orange-500">token exchange</span>
        </h1>
        
        <p className="text-gray-400 text-sm max-w-2xl mx-auto mb-6">
          {mode === 'basic' && "Understand the fundamental RFC 8693 flow: exchanging a human's token and an agent's token for a secure delegation token."}
          {mode === 'advanced' && "Explore real-world security mechanisms like scope reduction (downscoping) and Identity Provider token validation."}
          {mode === 'multi-agent' && "See how the Identity Provider preserves a secure chain of custody using nested claims when AI agents collaborate."}
        </p>

        <div className="flex flex-wrap justify-center gap-4">
          <button onClick={() => { setMode('basic'); resetAll(); }} className={`px-6 py-2 rounded-full text-sm transition-all ${mode === 'basic' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50' : 'bg-gray-900 text-gray-500 border border-gray-800 hover:text-gray-300'}`}>1. Basic Demo</button>
          <button onClick={() => { setMode('advanced'); resetAll(); }} className={`px-6 py-2 rounded-full text-sm transition-all ${mode === 'advanced' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50' : 'bg-gray-900 text-gray-500 border border-gray-800 hover:text-gray-300'}`}>2. Advanced Scenarios</button>
          <button onClick={() => { setMode('multi-agent'); resetAll(); }} className={`px-6 py-2 rounded-full text-sm transition-all ${mode === 'multi-agent' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50' : 'bg-gray-900 text-gray-500 border border-gray-800 hover:text-gray-300'}`}>3. Multi-Agent Chain</button>
        </div>
      </header>

      {/* Advanced Controls Panel */}
      {mode === 'advanced' && (
        <div className="max-w-6xl mx-auto mb-6 p-4 bg-gray-900/50 border border-gray-800 rounded-lg flex flex-wrap gap-6 items-center animate-in fade-in">
          <span className="text-sm font-bold text-gray-400">Security Toggles:</span>
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

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* LEFT: HUMAN */}
        <div className="bg-gray-900 border border-blue-900/50 rounded-xl p-6 shadow-xl relative h-fit sticky top-8">
          <div className="absolute top-0 left-0 w-full h-1 bg-blue-500"></div>
          <div className="text-blue-400 text-sm font-bold tracking-widest uppercase mb-6 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div> Human Context</div>

          <div className="mb-6">
            <h2 className="text-xl font-bold text-white mb-2">Phase 1: Human Authentication</h2>
            <p className="text-gray-400 text-sm mb-4">
              The flow begins with the human authenticating via a standard OpenID Connect/OAuth 2.0 flow. 
            </p>
            <button onClick={handleHumanLogin} disabled={!!loadingStep} className="bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-6 rounded-lg w-full transition-colors cursor-pointer">
              {loadingStep === 'human' ? 'Authenticating...' : '🔑 Authenticate Human'}
            </button>
          </div>
          
          <JwtViewer token={humanToken} title="HUMAN ACCESS TOKEN" />
        </div>

        {/* RIGHT: AGENTS */}
        <div className="bg-gray-900 border border-purple-900/50 rounded-xl p-6 shadow-xl relative min-h-[500px]">
           <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-pink-500"></div>
           
           <div className="text-purple-400 text-sm font-bold tracking-widest uppercase mb-6 flex items-center gap-2">
             <div className="w-2 h-2 rounded-full bg-purple-500"></div> 
             {mode === 'multi-agent' ? 'Agent Delegation Chain' : 'AI Agent Context'}
           </div>

          {!humanToken ? (
            <div className="text-gray-600 flex flex-col items-center justify-center h-64 text-sm">
              <span className="text-4xl mb-4 opacity-50">🤖</span>
              Waiting for a human token to be established...
            </div>
          ) : (
            <div className="space-y-8 animate-in fade-in">
              
              {/* RENDERING FOR BASIC/ADVANCED MODE */}
              {mode !== 'multi-agent' && (
                <>
                  <div>
                    <h2 className="text-xl font-bold text-white mb-2">Phase 2: Agent Identity</h2>
                    <p className="text-gray-400 text-sm mb-4">
                      The AI Agent requests a Machine-to-Machine (M2M) token using the <strong>Client Credentials</strong> grant.
                    </p>
                    <button onClick={handleSingleAgentLogin} disabled={!!loadingStep} className="bg-purple-600 hover:bg-purple-500 text-white font-medium py-2 px-6 rounded-lg w-full transition-colors cursor-pointer mb-4">
                      {loadingStep === 'agent' ? 'Authenticating...' : "🚀 Authenticate Agent (M2M)"}
                    </button>
                    
                    {agentToken && (
                      <HttpRequestViewer 
                        title="Identity Provider Request"
                        method="POST" 
                        url="/api/auth/agent" 
                        body={`grant_type=client_credentials\nclient_id=app_agent_m2m\nclient_secret=**********`} 
                      />
                    )}
                    <JwtViewer token={agentToken} title="AGENT'S M2M TOKEN" />
                  </div>

                  {agentToken && (
                    <div className="pt-6 border-t border-gray-800">
                      <h2 className="text-xl font-bold text-white mb-2">Phase 3: Secure Delegation (RFC 8693)</h2>
                      <p className="text-gray-400 text-sm mb-4">
                        The Agent calls the Token Exchange endpoint, providing both tokens.
                      </p>

                      <button onClick={handleSingleTokenExchange} disabled={!!loadingStep} className="bg-green-600 hover:bg-green-500 text-white font-medium py-2 px-6 rounded-lg w-full mb-4 transition-colors cursor-pointer">
                         {loadingStep === 'exchange' ? 'Processing Exchange...' : '🔄 Perform Token Exchange'}
                      </button>

                      {exchangedToken && (
                        <HttpRequestViewer 
                          title="Token Exchange Request"
                          method="POST" 
                          url="/api/auth/exchange" 
                          body={`grant_type=urn:ietf:params:oauth:grant-type:token-exchange\nrequested_token_type=urn:ietf:params:oauth:token-type:access_token\nsubject_token=${humanToken?.substring(0, 15)}...\nsubject_token_type=urn:ietf:params:oauth:token-type:jwt\nactor_token=${agentToken?.substring(0, 15)}...\nactor_token_type=urn:ietf:params:oauth:token-type:jwt${downscope && mode === 'advanced' ? '\nscope=read:data' : ''}`}
                        />
                      )}

                      {exchangeError && (
                        <div className="p-4 bg-red-950/40 border border-red-900/50 rounded-lg text-red-400 text-sm font-mono shadow-inner">
                          ❌ Identity Provider Rejected Request: {exchangeError}
                        </div>
                      )}
                      
                      <JwtViewer token={exchangedToken} title="DELEGATED ACCESS TOKEN" highlightAct={true} />
                    </div>
                  )}
                </>
              )}

              {/* RENDERING FOR MULTI-AGENT MODE */}
              {mode === 'multi-agent' && (
                <>
                  <div className="mb-6">
                    <h2 className="text-xl font-bold text-white mb-2">Phase 2 & 3: Agent Chaining</h2>
                    <p className="text-gray-400 text-sm mb-2">
                      Agent B performs another Token Exchange. The IdP safely nests the <code className="text-purple-400 font-bold">act</code> claim, recording the exact chain of custody.
                    </p>
                  </div>

                  {agentChain.map((step, index) => {
                    const prevToken = index === 0 ? humanToken! : agentChain[index-1].exchangedToken;
                    return (
                    <div key={index} className="animate-in fade-in slide-in-from-top-4 duration-500 border-l-2 border-purple-500/50 pl-4 ml-2 mt-6">
                      <div className="flex items-center gap-2 mb-4">
                        <span className="bg-purple-900 text-purple-200 text-xs px-2 py-1 rounded font-bold uppercase tracking-wider">Handoff #{index + 1}</span>
                        <h3 className="text-lg font-bold text-white">Delegated to <code className="text-purple-400">{step.agentId}</code></h3>
                      </div>

                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
                        <HttpRequestViewer 
                          title="1. Get Agent Identity"
                          method="POST" 
                          url="/api/auth/agent" 
                          body={`grant_type=client_credentials\nclient_id=${step.agentId}\nclient_secret=**********`}
                        />
                        <HttpRequestViewer 
                          title="2. Token Exchange"
                          method="POST" 
                          url="/api/auth/exchange" 
                          body={`grant_type=urn:ietf:params:oauth:grant-type:token-exchange\nsubject_token=${prevToken.substring(0, 15)}...\nactor_token=${step.m2mToken.substring(0, 15)}...`}
                        />
                      </div>

                      <JwtViewer token={step.exchangedToken} title={`TOKEN HELD BY ${step.agentId.toUpperCase()}`} highlightAct={true} />
                    </div>
                  )})}

                  {exchangeError && (
                     <div className="p-4 bg-red-950/40 border border-red-900/50 rounded-lg text-red-400 text-sm font-mono mt-4 shadow-inner">
                       ❌ Identity Provider Error: {exchangeError}
                     </div>
                  )}

                  <div className="pt-6 mt-6 border-t border-gray-800">
                    <button onClick={handleNextAgentHandOff} disabled={!!loadingStep} className="bg-purple-600 hover:bg-purple-500 text-white font-medium py-3 px-6 rounded-lg w-full transition-colors flex justify-center items-center gap-2 cursor-pointer shadow-lg hover:shadow-purple-900/50">
                      {loadingStep === 'handoff' ? 'Processing Hand-off...' : `🔄 ${agentChain.length === 0 ? 'Start Agent Chain' : 'Hand off to NEXT AI Agent'}`}
                    </button>
                  </div>
                </>
              )}

            </div>
          )}
        </div>
      </div>

      {/* BOTTOM: PHASE 4 - DOWNSTREAM API */}
      {humanToken && ((mode === 'multi-agent' && currentDelegatedToken) || (mode !== 'multi-agent' && agentToken)) && (
        <div className="max-w-6xl mx-auto mt-6 bg-gray-900 border border-emerald-900/50 rounded-xl p-6 shadow-xl relative animate-in fade-in slide-in-from-bottom-4">
           <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500"></div>
           <div className="text-emerald-400 text-sm font-bold tracking-widest uppercase mb-6 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Phase 4: Resource Server Verification</div>
           
           <p className="text-sm text-gray-400 mb-6">
             The Resource Server enforces strict security. It validates the cryptographic signature, checks the expiration, and verifies the <strong>Audience (<code className="text-emerald-400 font-bold">aud</code>)</strong>. It will safely reject the naive human token, but accept the properly exchanged token.
           </p>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <button onClick={() => testApi(humanToken, 'naive')} className="bg-gray-800 hover:bg-gray-700 border border-red-900/50 hover:border-red-700 text-white py-3 rounded-lg text-sm transition-all cursor-pointer flex items-center justify-center gap-2">
                🚨 Call API using Original Human Token
              </button>
              <button onClick={() => testApi(currentDelegatedToken || '', 'delegated')} disabled={!currentDelegatedToken} className="bg-gray-800 hover:bg-gray-700 border border-green-900/50 hover:border-green-700 text-white py-3 rounded-lg text-sm disabled:opacity-50 transition-all cursor-pointer flex items-center justify-center gap-2">
                ✅ Call API using Delegated Token
              </button>
           </div>

           {apiResult && (
             <div className={`p-4 rounded-lg font-mono text-sm shadow-inner ${apiResult.status === 200 ? 'bg-green-950/30 border border-green-900/50 text-green-400' : 'bg-red-950/30 border border-red-900/50 text-red-400'}`}>
                <div className="font-bold mb-2">HTTP {apiResult.status} Response:</div>
                <div className="whitespace-pre-wrap">{JSON.stringify(apiResult.data, null, 2)}</div>
             </div>
           )}
        </div>
      )}

    </div>
  );
}