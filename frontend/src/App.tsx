import { useState, useEffect } from 'react';

// =====================================================================
// API CLIENT (Talking to Express BFF)
// =====================================================================
const mockBackend = {
  getHumanToken: async () => {
    const response = await fetch('/api/auth/human');
    const data = await response.json();
    return data.access_token;
  },
  getAgentToken: async () => {
    const response = await fetch('/api/auth/agent', { 
        method: 'POST' 
    });
    const data = await response.json();
    return data.access_token;
  },
  exchangeToken: async (subjectToken: string, actorToken: string) => {
    const response = await fetch('/api/auth/exchange', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        subject_token: subjectToken,
        actor_token: actorToken,
        subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
        actor_token_type: 'urn:ietf:params:oauth:token-type:jwt'
      })
    });
    const data = await response.json();
    return data.access_token;
  },
  introspectToken: async (token: string) => {
    const response = await fetch('/api/auth/introspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    return await response.json();
  }
};

// =====================================================================
// HTTP REQUEST VIEWER COMPONENT
// =====================================================================
const HttpRequestViewer = ({ method, url, body }: { method: string, url: string, body?: string }) => (
  <div className="mb-4 bg-black border border-gray-700 rounded-lg p-4 font-mono text-xs text-gray-300 shadow-inner">
    <div className="mb-2">
      <span className="text-green-400 font-bold">{method}</span> <span className="text-blue-400">{url}</span>
    </div>
    {body && (
      <div className="whitespace-pre-wrap text-gray-400 mt-2 border-t border-gray-800 pt-2 leading-loose">
        {body}
      </div>
    )}
  </div>
);

// =====================================================================
// TOKEN VIEWER COMPONENT (Powered by Introspection)
// =====================================================================
const JwtViewer = ({ token, title, highlightAct = false, isWarning = false }: { token: string, title: string, highlightAct?: boolean, isWarning?: boolean }) => {
  const [payload, setPayload] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      setLoading(true);
      mockBackend.introspectToken(token)
        .then(data => {
          setPayload(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [token]);

  if (!token) return null;

  return (
    <div className={`mt-4 border rounded-lg p-4 bg-gray-900/50 ${isWarning ? 'border-red-500/50' : 'border-gray-700'}`}>
      <div className={`text-xs font-bold mb-3 ${isWarning ? 'text-red-400' : 'text-yellow-500'}`}>
        {isWarning ? '🚨' : '💳'} {title}
      </div>
      
      {loading ? (
        <div className="text-gray-500 text-xs animate-pulse">Introspecting token securely via IdP...</div>
      ) : (
        <div className="font-mono text-xs overflow-x-auto">
          {payload && Object.entries(payload).map(([key, value]) => {
            const isActClaim = key === 'act';
            const isSubClaim = key === 'sub';
            
            return (
              <div key={key} className={`flex py-1 border-b border-gray-800 last:border-0 ${isActClaim && highlightAct ? 'bg-green-900/30 -mx-2 px-2 rounded' : ''}`}>
                <div className="w-24 text-gray-500">{key}</div>
                <div className={`flex-1 break-all ${isSubClaim ? 'text-blue-400' : isActClaim && highlightAct ? 'text-green-400 font-bold' : 'text-gray-300'}`}>
                  {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// =====================================================================
// MAIN APP COMPONENT
// =====================================================================
export default function App() {
  const [humanToken, setHumanToken] = useState<string | null>(null);
  const [agentToken, setAgentToken] = useState<string | null>(null);
  const [exchangedToken, setExchangedToken] = useState<string | null>(null);

  const [loadingStep, setLoadingStep] = useState<string | null>(null);
  const [activeAct, setActiveAct] = useState(1);

  const handleHumanLogin = async () => {
    setLoadingStep('human');
    const token = await mockBackend.getHumanToken();
    setHumanToken(token);
    setLoadingStep(null);
  };

  const handleNaiveHandoff = () => {
    setActiveAct(2);
  };

  const handleAgentLogin = async () => {
    setActiveAct(3);
    setLoadingStep('agent');
    const token = await mockBackend.getAgentToken();
    setAgentToken(token);
    setLoadingStep(null);
  };

  const handleTokenExchange = async () => {
    if (!humanToken || !agentToken) return;
    setLoadingStep('exchange');
    const token = await mockBackend.exchangeToken(humanToken, agentToken);
    setExchangedToken(token);
    setLoadingStep(null);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-gray-200 p-8 font-sans">
      
      <header className="max-w-6xl mx-auto mb-8 text-center border-b border-gray-800 pb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-100">
          the handoff <span className="text-gray-500">—</span> <span className="text-orange-500">token exchange</span> demo
        </h1>
        <div className="mt-4 inline-flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-full px-6 py-2 text-sm text-gray-400">
          🛡️ AUTHORIZATION SERVER: <span className="text-gray-200 font-medium">Standard IdP (RFC 8693)</span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* LEFT COLUMN: THE HUMAN */}
        <div className="bg-gray-900 border border-blue-900/50 rounded-xl p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-blue-600"></div>
          
          <div className="flex items-center gap-2 text-blue-400 text-sm font-bold tracking-widest uppercase mb-6">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            You — The Human
          </div>

          {/* Act 1 */}
          <div className="mb-8">
            <h2 className="text-xl font-bold text-white mb-2">Act 1 — "Who are you?" {humanToken && '✅'}</h2>
            <p className="text-gray-400 text-sm mb-4 leading-relaxed">
              Log in using a standard <strong className="text-gray-300">Authorization Code</strong> flow. 
              The browser redirects to the IdP, you authenticate, and come back with an access token.
            </p>
            
            {!humanToken ? (
              <button 
                onClick={handleHumanLogin}
                disabled={loadingStep === 'human'}
                className="bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-6 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {loadingStep === 'human' ? 'Authenticating...' : '🔑 Log in'}
              </button>
            ) : (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                <JwtViewer token={humanToken} title="YOUR ACCESS TOKEN" />
                
                {activeAct === 1 && (
                  <div className="mt-8 border-t border-gray-800 pt-6">
                    <h2 className="text-xl font-bold text-white mb-2">Act 2 — "The Naive Handoff" 🚨</h2>
                    <p className="text-gray-400 text-sm mb-4">
                      You want the Agent to do something on your behalf. The naive approach? Just hand it your token directly. Let's see what happens...
                    </p>
                    <button 
                      onClick={handleNaiveHandoff}
                      className="bg-gray-800 hover:bg-gray-700 border border-gray-600 text-white font-medium py-2 px-6 rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      📤 Hand my token to Agent
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: THE AGENT */}
        <div className="bg-gray-900 border border-purple-900/50 rounded-xl p-6 shadow-xl relative overflow-hidden">
           <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-pink-600"></div>
           
           <div className="flex items-center gap-2 text-purple-400 text-sm font-bold tracking-widest uppercase mb-6">
            <div className="w-2 h-2 rounded-full bg-purple-500"></div>
            Agent — The Bot
          </div>

          {activeAct === 1 && (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 min-h-[300px]">
              <span className="text-4xl mb-4 opacity-50">🤖</span>
              Waiting for a human...
            </div>
          )}

          {/* Act 2: Impersonation Warning */}
          {activeAct === 2 && (
             <div className="animate-in fade-in slide-in-from-right-4 duration-500">
               <h2 className="text-xl font-bold text-white mb-2">Act 2 — "The Naive Handoff" 🚨</h2>
               <p className="text-gray-400 text-sm mb-4">I received the human's token. Let me look at it...</p>
               
               <JwtViewer token={humanToken!} title="IMPERSONATION TOKEN (SAME TOKEN!)" isWarning={true} />
               
               <div className="mt-4 p-4 bg-red-950/40 border border-red-900/50 rounded-lg text-red-400 text-sm">
                 <strong>⚠️ I am <span className="font-mono text-blue-400">usr_abf995f2...</span> now! This is impersonation.</strong>
                 <br/>There is no <code>act</code> claim — nobody can tell I'm an agent acting on behalf.
               </div>

               <div className="mt-8 border-t border-gray-800 pt-6">
                 <h2 className="text-xl font-bold text-white mb-2">Act 3 — "The Proper Handoff" 🔐</h2>
                 <p className="text-gray-400 text-sm mb-4">
                   Let me do this right. First I'll get <strong>my own token</strong>, then call Token Exchange.
                 </p>
                 <button 
                    onClick={handleAgentLogin}
                    className="bg-purple-600 hover:bg-purple-500 text-white font-medium py-2 px-6 rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    🚀 Start Proper Delegation (RFC 8693)
                  </button>
               </div>
             </div>
          )}

          {/* Act 3: Proper Token Exchange */}
          {activeAct === 3 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-500 space-y-8">
              
              {/* 3a: Agent gets identity */}
              <div>
                <h2 className="text-xl font-bold text-white mb-2">Act 3a — Agent gets its own identity {agentToken && '✅'}</h2>
                <p className="text-gray-400 text-sm mb-4">Got my own token via <code className="text-purple-400">client_credentials</code>.</p>
                
                <HttpRequestViewer 
                  method="POST" 
                  url="/api/auth/agent" 
                  body="grant_type=client_credentials&#10;client_id=app_agent_m2m&#10;client_secret=**********" 
                />

                {loadingStep === 'agent' && <div className="text-gray-500 mb-4">Authenticating as agent...</div>}
                <JwtViewer token={agentToken || ''} title="AGENT'S OWN TOKEN" />
              </div>

              {/* 3b: The Exchange */}
              {agentToken && (
                 <div className="border-t border-gray-800 pt-6 animate-in fade-in duration-500">
                    <h2 className="text-xl font-bold text-white mb-2">Act 3b — Delegation Token Exchange {exchangedToken && '✅'}</h2>
                    <p className="text-gray-400 text-sm mb-4">
                      I send both tokens to the IdP: the human's as <code>subject_token</code> and mine as <code>actor_token</code>.
                    </p>
                    
                    <HttpRequestViewer 
                      method="POST" 
                      url="/api/auth/exchange" 
                      body={`grant_type=urn:ietf:params:oauth:grant-type:token-exchange\nrequested_token_type=urn:ietf:params:oauth:token-type:access_token\nsubject_token=${humanToken?.substring(0, 30)}...\nsubject_token_type=urn:ietf:params:oauth:token-type:jwt\nactor_token=${agentToken?.substring(0, 30)}...\nactor_token_type=urn:ietf:params:oauth:token-type:jwt`}
                    />

                    {!exchangedToken ? (
                      <button 
                        onClick={handleTokenExchange}
                        disabled={loadingStep === 'exchange'}
                        className="bg-green-600 hover:bg-green-500 text-white font-medium py-2 px-6 rounded-lg transition-colors flex items-center gap-2 w-full justify-center disabled:opacity-50 cursor-pointer"
                      >
                        {loadingStep === 'exchange' ? 'Processing Exchange...' : '🔄 Perform Token Exchange (RFC 8693)'}
                      </button>
                    ) : (
                      <div className="space-y-4">
                        <div className="p-4 bg-green-950/30 border border-green-900/50 rounded-lg text-green-400 text-sm flex items-center gap-2">
                           ✅ Delegation successful — issued token with act claim
                        </div>
                        <JwtViewer token={exchangedToken} title="DELEGATED ACCESS TOKEN" highlightAct={true} />
                      </div>
                    )}
                 </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}