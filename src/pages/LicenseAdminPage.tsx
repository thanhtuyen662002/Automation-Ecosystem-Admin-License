import React, { useEffect, useState } from 'react';
import { licenseAdminApi, getAdminSecret, setAdminSecret, removeAdminSecret, getAdminFunctionUrl } from '../lib/licenseAdminApi';
import { Plan, License, CreateLicenseParams, LicenseDevice } from '../types/licenseAdmin';
import { 
  AlertCircle, ChevronDown, ChevronRight, MonitorSmartphone
} from 'lucide-react';

export default function LicenseAdminPage() {
  const [adminSecretStr, setAdminSecretStr] = useState(getAdminSecret() || '');
  const [isAuthorized, setIsAuthorized] = useState(!!getAdminSecret());

  const handleAdminSecretLogin = () => {
    if (adminSecretStr) {
      setAdminSecret(adminSecretStr);
      setIsAuthorized(true);
    }
  };

  const handleLogout = () => {
    removeAdminSecret();
    setIsAuthorized(false);
    setAdminSecretStr('');
  };

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans text-slate-900">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-slate-200 p-8 space-y-6">
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">License Admin</h1>
            <p className="text-slate-500 text-center mt-2 text-sm">Enter your admin secret to manage licenses.</p>
          </div>
          <div className="space-y-4">
            <input 
              type="password" 
              placeholder="Admin Secret" 
              className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
              value={adminSecretStr}
              onChange={(e) => setAdminSecretStr(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdminSecretLogin()}
            />
            <button 
              onClick={handleAdminSecretLogin}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg transition-colors shadow-md active:scale-[0.98]"
            >
              Unlock Admin
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <LicenseDashboard onLogout={handleLogout} />;
}

function LicenseDashboard({ onLogout }: { onLogout: () => void }) {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRequestMessage, setLastRequestMessage] = useState('');
  const [lastHttpStatus, setLastHttpStatus] = useState('');
  const [lastError, setLastError] = useState('');
  const [lastStartedAt, setLastStartedAt] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Page state
  const [activeTab, setActiveTab] = useState<'licenses'|'audit'|'customers'>('licenses');

  // Form State
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [label, setLabel] = useState('');
  const [plan, setPlan] = useState<Plan>('standard');
  const [duration, setDuration] = useState('365');
  const [maxDevices, setMaxDevices] = useState(1);
  const [source, setSource] = useState('manual');
  const [paymentId, setPaymentId] = useState('');
  const [notes, setNotes] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<{key: string, id: string} | null>(null);
  const [copiedTime, setCopiedTime] = useState(0);

  // Timer effect for elapsed
  useEffect(() => {
    let interval: number;
    if (isCreating || loading) {
      interval = window.setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => window.clearInterval(interval);
  }, [isCreating, loading]);

  // Pagination state (client-side for display only in this demo)
  const [page, setPage] = useState(1);
  const limit = 50;
  
  // Expanded Row
  const [expandedId, setExpandedId] = useState<string|null>(null);

  const fetchLicenses = async () => {
    try {
      setLoading(true);
      setError('');
      setLastRequestMessage('Fetching licenses...');
      const res = await licenseAdminApi.listLicenses({ search, status: statusFilter, limit: limit, offset: (page-1)*limit });
      setLicenses(res.items);
      setLastRequestMessage('Fetch success');
    } catch (err: any) {
      setLastRequestMessage(`Fetch failed: ${err.message}`);
      if (err.message === 'missing_secret') {
        setError('Bạn chưa nhập Admin Secret.');
      } else if (err.message === 'unauthorized') {
        setError('Admin secret không đúng hoặc LICENSE_ADMIN_SECRET trên Supabase chưa khớp.');
      } else if (err.message === 'forbidden') {
        setError(`CORS bị chặn. Cần thêm origin AI Studio preview vào LICENSE_ADMIN_ALLOWED_ORIGINS hoặc function CORS allow origin hiện tại. (Origin: ${window.location.origin})`);
      } else {
        setError(err.message || 'Không kết nối được Supabase Edge Function.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'licenses') {
      fetchLicenses();
    }
  }, [statusFilter, page, activeTab]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreating) return;

    const uiTimeout = window.setTimeout(() => {
      setIsCreating(false);
      setLastRequestMessage('Create timeout ở UI sau 25s');
      setError(`Request tạo key quá lâu và không có phản hồi. Khả năng cao AI Studio preview đang chặn request trước khi tới Supabase. Origin hiện tại: ${window.location.origin}`);
    }, 25000);

    try {
      setIsCreating(true);
      setError('');
      setLastRequestMessage('Generating key...');
      setLastStartedAt(new Date().toISOString());
      setLastError('');
      setLastHttpStatus('');
      
      console.log('Sending create license request...');

      let defaultLabel = customerName || customerEmail || 'Customer';
      let durationLabel = duration === 'lifetime' ? 'Lifetime' : `${duration} days`;
      const computedLabel = label.trim() || `${defaultLabel} - ${plan} - ${durationLabel}`;

      let expiresAt: string | null = null;
      if (duration !== 'lifetime' && plan !== 'lifetime') {
        const days = parseInt(duration, 10);
        if (!isNaN(days)) {
          const d = new Date();
          d.setDate(d.getDate() + days);
          expiresAt = d.toISOString();
        }
      }

      const params: CreateLicenseParams = {
        label: computedLabel,
        plan,
        max_devices: maxDevices,
        expires_at: expiresAt,
        metadata: {
          customer_email: customerEmail,
          customer_name: customerName,
          source,
          payment_id: paymentId || null,
          notes: notes
        }
      };

      const res = await licenseAdminApi.createLicense(params);

      if (!res?.license?.license_key) {
        throw new Error('API không trả về license_key. Kiểm tra response của license-admin create_license.');
      }
      
      setNewlyCreatedKey({
        key: res.license.license_key,
        id: res.license.id
      });
      
      setLastRequestMessage('Key generated successfully');
      
      // Reset form
      setCustomerName(''); setCustomerEmail(''); setLabel(''); 
      setPaymentId(''); setNotes('');
      
      fetchLicenses().catch((refreshErr) => {
        console.warn('[license-admin] refresh list failed after create', refreshErr);
      });
    } catch (err: any) {
       setLastRequestMessage(`Create failed: ${err.message}`);
       setLastError(err.message);
       setError(err.message || 'Create license failed.');
    } finally {
      window.clearTimeout(uiTimeout);
      setIsCreating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTime(Date.now());
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 text-slate-900 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            </div>
            <span className="font-bold text-lg tracking-tight">AECO Admin</span>
          </div>
          <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">Automation Ecosystem</p>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <div className="px-3 py-2 text-sm font-semibold text-slate-500 uppercase tracking-wider">Management</div>
          <button 
            onClick={() => setActiveTab('licenses')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${activeTab === 'licenses' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path></svg>
            License Keys
          </button>
          <button 
            onClick={() => setActiveTab('audit')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${activeTab === 'audit' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
            Audit Logs
          </button>
          <button 
            onClick={() => setActiveTab('customers')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${activeTab === 'customers' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
            Customers
          </button>
        </nav>
        <div className="p-4 border-t border-slate-800">
          <div className="flex flex-col gap-2 mb-4 border-b border-slate-700 pb-4 px-2">
             <div className="text-[10px] text-slate-400 font-mono break-all" title="Function URL">
               🌐 {getAdminFunctionUrl()}
             </div>
             <div className="text-[10px] text-slate-400 font-mono break-all" title="Origin">
               📍 {window.location.origin}
             </div>
             <div className="text-[10px] text-slate-400 font-mono flex gap-4">
                <span title="Anon Key">🔑 {import.meta.env.VITE_SUPABASE_ANON_KEY ? 'Yes' : 'No'}</span>
                <span title="Admin Secret">🛡️ {getAdminSecret() ? 'Yes' : 'No'}</span>
             </div>
             <div className="text-[10px] text-slate-400 font-mono flex gap-4">
                <span title="Time elapsed">⏱️ {elapsedSeconds}s</span>
                <span title="Started">⏰ {lastStartedAt ? new Date(lastStartedAt).toLocaleTimeString() : '-'}</span>
             </div>
             <div className="text-[10px] items-start text-slate-500 font-mono mt-1 break-all line-clamp-2" title="Last Request Status">
               ⚡ {lastRequestMessage || 'Idle'}
             </div>
             <div className="text-[10px] items-start text-red-400 font-mono mt-1 break-all line-clamp-2" title="Last Error">
               {lastError ? `❌ ${lastError}` : ''}
             </div>
             
             <button
               onClick={() => {
                 setLastStartedAt(new Date().toISOString());
                 setLastRequestMessage('Testing connection...');
                 setLastError('');
                 setElapsedSeconds(0);
                 licenseAdminApi.testConnection()
                   .then(() => setLastRequestMessage('Connection OK'))
                   .catch(err => {
                     setLastRequestMessage('Connection failed');
                     setLastError(err.message);
                   });
               }}
               className="mt-2 w-full px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded flex justify-center items-center gap-2 border border-slate-600 transition-colors"
             >
               Test Connection
             </button>
          </div>
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center font-bold text-xs shadow-inner">AD</div>
            <div className="flex-1">
              <p className="text-sm font-medium leading-tight">Root Admin</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Master Access</p>
            </div>
            <button onClick={onLogout} className="text-slate-400 hover:text-white p-1" title="Logout">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 relative">
        {/* Header Bar */}
        <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0 shadow-sm z-10">
          <h1 className="text-xl font-bold text-slate-800">License Admin Dashboard</h1>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1 bg-green-50 text-green-700 rounded-full border border-green-200">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              <span className="text-xs font-bold uppercase tracking-wider">Secret Verified</span>
            </div>
          </div>
        </header>

        {/* Page Layout */}
        <div className="p-8 flex flex-col gap-6 overflow-hidden flex-1">
          {error && (
            <div className="bg-red-50 text-red-700 p-4 rounded-xl flex items-center space-x-3 border border-red-100 shadow-sm shrink-0">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm font-semibold">{error}</p>
              <button className="ml-auto" onClick={() => setError('')}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
          )}

          {activeTab === 'licenses' && (
             <>
               {/* Top Row: Form and Success Area */}
               <div className="grid grid-cols-12 gap-6 shrink-0 z-0">
                 {/* Creation Form */}
                 <div className={`bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between transition-all duration-500 ${newlyCreatedKey ? 'col-span-12 xl:col-span-7' : 'col-span-12'}`}>
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">Create New License</h2>
              <form onSubmit={handleCreate} className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1 content-start">
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Customer Name</label>
                  <input type="text" value={customerName} onChange={e=>setCustomerName(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors" placeholder="e.g. Nguyen Van A" />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Customer Email</label>
                  <input type="email" value={customerEmail} onChange={e=>setCustomerEmail(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors" placeholder="user@example.com" />
                </div>
                <div className="col-span-2 md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Admin Label</label>
                  <input type="text" value={label} onChange={e=>setLabel(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors" placeholder="Auto-generated if left empty" />
                </div>

                <div className="col-span-1 border-t border-slate-100 pt-3 md:border-0 md:pt-0">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Plan Type</label>
                  <select value={plan} onChange={e=>setPlan(e.target.value as Plan)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors">
                    <option value="standard">Standard</option>
                    <option value="pro">Pro</option>
                    <option value="agency">Agency</option>
                    <option value="trial">Trial</option>
                    <option value="lifetime">Lifetime</option>
                  </select>
                </div>
                <div className="col-span-1 border-t border-slate-100 pt-3 md:border-0 md:pt-0">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Duration</label>
                  <select disabled={plan === 'lifetime'} value={plan === 'lifetime' ? 'lifetime' : duration} onChange={e=>setDuration(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors">
                    <option value="365">1 Year</option>
                    <option value="90">90 Days</option>
                    <option value="30">30 Days</option>
                    <option value="7">7 Days</option>
                    <option value="lifetime">Lifetime</option>
                  </select>
                </div>
                <div className="col-span-1 border-t border-slate-100 pt-3 md:border-0 md:pt-0">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Max Devices</label>
                  <input type="number" min="1" max="20" value={maxDevices} onChange={e=>setMaxDevices(parseInt(e.target.value)||1)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors" />
                </div>
                <div className="col-span-1 border-t border-slate-100 pt-3 md:border-0 md:pt-0">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Source</label>
                  <select value={source} onChange={e=>setSource(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors">
                    <option value="manual">Manual</option>
                    <option value="stripe">Stripe</option>
                    <option value="payos">PayOS</option>
                    <option value="bank_transfer">Bank Transfer</option>
                  </select>
                </div>

                <div className="col-span-2 md:col-span-3">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Notes</label>
                  <input type="text" value={notes} onChange={e=>setNotes(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors" placeholder="Additional info..." />
                </div>
                <div className="col-span-2 md:col-span-1 flex items-end justify-end mt-2 md:mt-0">
                  <button 
                    type="submit" 
                    disabled={isCreating}
                    className="w-full px-6 py-2 bg-indigo-600 text-white rounded-md font-bold text-sm shadow-md hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center whitespace-nowrap h-[38px]"
                  >
                    {isCreating ? 
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      : 'Generate Key'
                    }
                  </button>
                </div>
              </form>
            </div>

            {/* Success Message / New Key Banner */}
            {newlyCreatedKey && (
              <div className="col-span-12 xl:col-span-5 bg-indigo-900 rounded-xl shadow-lg p-6 relative overflow-hidden flex flex-col justify-between">
                <div className="relative z-10 flex flex-col h-full">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-indigo-200 text-xs font-bold uppercase tracking-widest">Recent Key Generated</h2>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-indigo-500/30 text-indigo-100 rounded text-[10px] font-bold">JUST NOW</span>
                      <button onClick={() => setNewlyCreatedKey(null)} className="text-indigo-400 hover:text-white transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                      </button>
                    </div>
                  </div>
                  <div className="bg-white/10 border border-white/20 p-4 rounded-lg backdrop-blur-sm mb-4">
                    <code className="text-xl md:text-2xl text-white font-mono block text-center tracking-widest select-all">{newlyCreatedKey.key}</code>
                  </div>
                  <div className="flex items-start gap-3 mt-auto">
                    <div className="w-5 h-5 mt-0.5 text-amber-400 shrink-0">
                      <svg fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"></path></svg>
                    </div>
                    <p className="text-[11px] text-indigo-200 leading-tight">
                      CRITICAL: This raw key is shown only once and is not stored in plain text. Please copy it immediately and send it to the customer.
                    </p>
                  </div>
                  <button 
                    onClick={() => copyToClipboard(newlyCreatedKey.key)}
                    className="mt-4 w-full py-2 bg-indigo-500 text-white rounded-md text-sm font-bold hover:bg-indigo-400 transition-colors shadow flex justify-center items-center gap-2"
                  >
                    {Date.now() - copiedTime < 3000 ? (
                       <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg> Copied to Clipboard</>
                    ) : (
                       <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg> Copy Key to Clipboard</>
                    )}
                  </button>
                </div>
                {/* Decorative Background Elements */}
                <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-48 h-48 bg-indigo-600/30 rounded-full blur-2xl pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/4 w-40 h-40 bg-blue-500/20 rounded-full blur-2xl pointer-events-none"></div>
              </div>
            )}
          </div>

          {/* Table Section */}
          <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col z-10 min-h-0">
            <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row gap-4 items-center justify-between shrink-0">
              <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                <div className="relative">
                  <input 
                    type="text" 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && fetchLicenses()}
                    className="pl-9 pr-4 py-2 bg-slate-100 border border-transparent focus:border-slate-300 rounded-lg text-sm w-full sm:w-80 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium text-slate-800 placeholder-slate-400" 
                    placeholder="Search prefix, label, or email..."
                  />
                  <svg className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                </div>
                <select 
                  value={statusFilter} 
                  onChange={e => setStatusFilter(e.target.value)}
                  className="px-3 py-2 bg-slate-100 border border-transparent focus:border-slate-300 rounded-lg text-sm text-slate-600 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="revoked">Revoked</option>
                  <option value="expired">Expired</option>
                </select>
              </div>
              <button onClick={fetchLicenses} className="p-2 text-slate-400 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-md transition-all self-end sm:self-auto shadow-sm" title="Refresh">
                <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
              </button>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 whitespace-nowrap">Prefix</th>
                    <th className="px-6 py-3 whitespace-nowrap">Label / Customer</th>
                    <th className="px-6 py-3 text-center whitespace-nowrap">Plan</th>
                    <th className="px-6 py-3 text-center whitespace-nowrap">Devices</th>
                    <th className="px-6 py-3 whitespace-nowrap">Dates</th>
                    <th className="px-6 py-3 text-right whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading && licenses.length === 0 && (
                     <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-500 text-sm font-medium">Loading licenses...</td></tr>
                  )}
                  {!loading && licenses.length === 0 && (
                     <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-500 text-sm font-medium">No licenses found matching criteria.</td></tr>
                  )}
                  {licenses.map(lic => {
                    const isRevoked = lic.status === 'revoked';
                    const isExpired = lic.status === 'expired';
                    
                    let planBadgeOpts = "bg-slate-50 text-slate-600 border border-slate-200"; // default
                    if (lic.plan === 'pro') planBadgeOpts = "bg-indigo-50 text-indigo-700 border border-indigo-100";
                    if (lic.plan === 'agency') planBadgeOpts = "bg-purple-50 text-purple-700 border border-purple-100";
                    if (lic.plan === 'lifetime') planBadgeOpts = "bg-amber-50 text-amber-700 border border-amber-100";
                    if (lic.plan === 'standard') planBadgeOpts = "bg-emerald-50 text-emerald-700 border border-emerald-100";

                    return (
                      <React.Fragment key={lic.id}>
                        <tr className={`hover:bg-slate-50/80 transition-colors ${expandedId === lic.id ? 'bg-indigo-50/30' : ''} ${isRevoked ? 'bg-red-50/20' : ''}`}>
                          <td className="px-6 py-4">
                            <span className="flex items-center gap-2">
                              <code className={`text-xs font-mono px-1.5 py-0.5 rounded ${isRevoked ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-indigo-700'}`}>
                                {lic.license_key_prefix}
                              </code>
                              <button onClick={()=>copyToClipboard(lic.license_key_prefix)} className="text-slate-400 hover:text-indigo-600 transition-colors p-1 rounded hover:bg-slate-200/50" title="Copy Prefix">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                              </button>
                            </span>
                          </td>
                          <td className={`px-6 py-4 ${isRevoked ? 'grayscale opacity-70' : ''}`}>
                            <p className="text-sm font-semibold text-slate-800 line-clamp-1" title={lic.label || 'No label'}>{lic.label || 'No label'}</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">{lic.metadata?.customer_email || 'No email associated'}</p>
                          </td>
                          <td className={`px-6 py-4 text-center ${isRevoked ? 'grayscale opacity-60' : ''}`}>
                            <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${planBadgeOpts}`}>
                              {lic.plan}
                            </span>
                          </td>
                          <td className={`px-6 py-4 text-center text-sm font-medium ${isRevoked ? 'text-slate-400' : 'text-slate-700'}`}>
                            {lic.active_devices_count} / {lic.max_devices}
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-500 space-y-1">
                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                              <span className="w-12 inline-block font-semibold text-slate-400">Gen:</span> 
                              <span>{new Date(lic.created_at).toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'})}</span>
                            </div>
                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                              <span className="w-12 inline-block font-semibold text-slate-400">Exp:</span> 
                              {lic.expires_at ? (
                                <span className={isExpired ? 'text-red-500 font-bold' : ''}>{new Date(lic.expires_at).toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'})}</span>
                              ) : (
                                <span className="text-amber-600 font-bold tracking-wider">LIFETIME</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {isRevoked ? (
                               <div className="flex justify-end gap-2 items-center">
                                 <span className="inline-block px-2.5 py-1 text-[10px] font-bold text-red-500 uppercase tracking-widest border border-red-200 rounded bg-red-50">Revoked</span>
                                 <button 
                                  onClick={async() => { if(confirm('Reactivate this license?')){ await licenseAdminApi.reactivateLicense(lic.id); fetchLicenses(); } }}
                                  className="px-2 py-1 bg-white border border-slate-200 text-xs font-bold text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 rounded transition-colors shadow-sm"
                                  title="Reactivate"
                                 >
                                  Undo
                                 </button>
                               </div>
                            ) : (
                              <div className="flex justify-end gap-2 items-center">
                                {lic.status === 'suspended' && (
                                  <span className="inline-block px-2.5 py-1 text-[10px] font-bold text-amber-600 uppercase tracking-widest border border-amber-200 rounded bg-amber-50 mr-2">Suspended</span>
                                )}
                                <button 
                                  onClick={() => setExpandedId(expandedId === lic.id ? null : lic.id)} 
                                  className={`px-2 py-1 text-xs font-bold border rounded transition-colors shadow-sm ${expandedId === lic.id ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                >
                                  {expandedId === lic.id ? 'Close' : 'Stats'}
                                </button>
                                
                                <div className="h-4 w-px bg-slate-200 mx-1"></div>

                                {lic.status === 'active' && (
                                   <button 
                                     onClick={async()=>{ if(confirm('Suspend this license?')){ await licenseAdminApi.suspendLicense(lic.id, 'Admin suspended'); fetchLicenses(); } }}
                                     className="px-2 py-1 bg-white border border-slate-200 text-xs font-bold text-slate-600 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200 rounded transition-colors shadow-sm"
                                     title="Suspend"
                                   >
                                     Suspend
                                   </button>
                                )}
                                {lic.status === 'suspended' && (
                                   <button 
                                     onClick={async()=>{ await licenseAdminApi.reactivateLicense(lic.id); fetchLicenses(); }}
                                     className="px-2 py-1 bg-white border border-slate-200 text-xs font-bold text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 rounded transition-colors shadow-sm"
                                     title="Reactivate"
                                   >
                                     Reactivate
                                   </button>
                                )}

                                <button 
                                  onClick={async()=>{ if(confirm('Revoke this license completely?')){ await licenseAdminApi.revokeLicense(lic.id, 'Admin manual revoke'); fetchLicenses(); } }}
                                  className="px-2 py-1 bg-white border border-red-200 text-xs font-bold text-red-600 hover:bg-red-50 rounded transition-colors shadow-sm"
                                >
                                  Revoke
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                        
                        {expandedId === lic.id && (
                          <tr>
                            <td colSpan={6} className="bg-slate-50/80 p-0 shadow-inner border-b border-slate-100">
                               <ExpandedLicenseView license_id={lic.id} maxDevices={lic.max_devices} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination block */}
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between shrink-0 gap-3">
              <p className="text-xs text-slate-500 font-medium whitespace-nowrap">
                 {/* Only showing loaded count as we don't have total count readily from API without modifying it, but we'll show page */}
                 Page {page} {licenses.length > 0 ? `(Showing ${licenses.length} licenses)` : ''}
              </p>
              <div className="flex gap-2 w-full sm:w-auto">
                <button 
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="w-full sm:w-auto px-4 py-1.5 bg-white border border-slate-200 text-xs font-bold text-slate-700 rounded hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  Previous
                </button>
                <button 
                  onClick={() => setPage(p => p + 1)}
                  disabled={licenses.length < limit}
                  className="w-full sm:w-auto px-4 py-1.5 bg-white border border-slate-200 text-xs font-bold text-slate-700 rounded hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
          </>
          )}

          {activeTab === 'audit' && <AuditLogsTab />}
          {activeTab === 'customers' && <CustomersTab />}
        </div>
      </main>
    </div>
  );
}

function AuditLogsTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    licenseAdminApi.getAuditLogs(null, 200).then(res => {
      setLogs(res.items);
      setLoading(false);
    }).catch(console.error);
  }, []);

  return (
    <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col z-10 min-h-0">
      <div className="px-6 py-4 border-b border-slate-100 shrink-0">
        <h2 className="text-lg font-bold text-slate-800">Recent Validation Events & Admin Actions</h2>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse min-w-[600px]">
          <thead className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200">
            <tr>
              <th className="px-6 py-3 whitespace-nowrap">Time</th>
              <th className="px-6 py-3 whitespace-nowrap">Action</th>
              <th className="px-6 py-3 whitespace-nowrap">License ID</th>
              <th className="px-6 py-3 whitespace-nowrap">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500 text-sm">Loading logs...</td></tr> : null}
            {!loading && logs.length === 0 ? <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500 text-sm">No recent logs.</td></tr> : null}
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-slate-50/50">
                <td className="px-6 py-3 text-xs text-slate-500 whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
                <td className="px-6 py-3 text-sm font-semibold text-slate-700">{log.action}</td>
                <td className="px-6 py-3 text-xs font-mono text-indigo-600">{log.license_id || '-'}</td>
                <td className="px-6 py-3 text-xs text-slate-600 truncate max-w-xs">{JSON.stringify(log.ip_address || log.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CustomersTab() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    licenseAdminApi.listCustomers().then(res => {
      setCustomers(res.items);
      setLoading(false);
    }).catch(console.error);
  }, []);

  return (
    <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col z-10 min-h-0">
      <div className="px-6 py-4 border-b border-slate-100 shrink-0">
        <h2 className="text-lg font-bold text-slate-800">Customers Directory</h2>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200">
            <tr>
              <th className="px-6 py-3 whitespace-nowrap">Email/Key</th>
              <th className="px-6 py-3 whitespace-nowrap">Name/Label</th>
              <th className="px-6 py-3 text-center whitespace-nowrap">Licenses</th>
              <th className="px-6 py-3 whitespace-nowrap">First Seen</th>
              <th className="px-6 py-3 whitespace-nowrap text-right">Extracted Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500 text-sm">Loading customers...</td></tr> : null}
            {!loading && customers.length === 0 ? <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500 text-sm">No customers mapped.</td></tr> : null}
            {customers.map((c, i) => (
              <tr key={i} className="hover:bg-slate-50/50">
                <td className="px-6 py-3 text-sm font-medium text-slate-800">{c.customer_email}</td>
                <td className="px-6 py-3 text-sm text-slate-600">{c.customer_name}</td>
                <td className="px-6 py-3 text-center text-sm font-bold text-indigo-600 bg-indigo-50/50">{c.total_licenses}</td>
                <td className="px-6 py-3 text-xs text-slate-500">{new Date(c.first_seen).toLocaleDateString()}</td>
                <td className="px-6 py-3 text-xs text-right space-x-1">
                  {c.licenses.map((l: any, idx: number) => (
                    <span key={idx} className={`inline-block px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider ${l.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                      {l.plan}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExpandedLicenseView({ license_id, maxDevices }: { license_id: string, maxDevices: number }) {
  const [devices, setDevices] = useState<LicenseDevice[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDev = async () => {
    setLoading(true);
    try {
      const res = await licenseAdminApi.listDevices(license_id);
      setDevices(res.items);
    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDev();
  }, [license_id]);

  const handleReset = async () => {
    if(confirm('Revoke all devices to allow the user to activate on new machines?')) {
      try {
         await licenseAdminApi.resetDevices(license_id, 'Admin manual reset');
         fetchDev();
      } catch(e) { alert('Failed to reset'); }
    }
  }

  return (
    <div className="py-6 px-8 grid grid-cols-1 md:grid-cols-2 gap-8 relative before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-indigo-400">
      <div className="flex flex-col h-full max-h-72">
        <div className="flex items-center justify-between mb-3 border-b border-slate-200 pb-2">
           <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
             <MonitorSmartphone className="w-4 h-4 text-slate-400" />
             Activated Devices 
           </h4>
           <div className="flex items-center space-x-3">
             <button onClick={fetchDev} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">Refresh</button>
             <span className="text-slate-300">|</span>
             <button onClick={handleReset} className="text-xs font-bold text-red-600 hover:text-red-800 hover:underline transition-colors">Reset Hardware ID</button>
           </div>
        </div>
        
        <div className="flex-1 overflow-y-auto pr-2 space-y-2 pb-2">
          {loading ? (
            <div className="text-sm text-slate-500 font-medium p-4 py-8 text-center bg-white border border-slate-200 rounded-lg">Loading devices...</div>
          ) : devices.length === 0 ? (
            <div className="text-sm text-slate-500 font-medium bg-white p-4 py-8 rounded-lg border border-dashed border-slate-300 text-center">No devices associated with this license yet.</div>
          ) : (
            devices.map(d => {
              const isRevoked = d.status === 'revoked';
              return (
                <div key={d.id} className={`bg-white border text-sm rounded-lg p-3 flex justify-between items-center transition-opacity shadow-sm ${isRevoked ? 'border-red-100 bg-red-50/50 grayscale opacity-80' : 'border-slate-200'}`}>
                  <div>
                    <div className="font-bold text-slate-800">{d.device_name || 'Unknown Device'}</div>
                    <div className="text-[11px] text-slate-500 mt-1 font-mono bg-slate-100 inline-block px-1.5 py-0.5 rounded">{d.platform || '?'} • App v{d.app_version || '?'}</div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1.5">
                     <div className={`text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded border ${d.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                       {d.status}
                     </div>
                     <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                     {d.last_seen_at ? `Seen ${new Date(d.last_seen_at).toLocaleDateString()}` : 'Never seen'}
                     </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="flex flex-col h-full max-h-72">
        <div className="flex items-center justify-between mb-3 border-b border-slate-200 pb-2">
           <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
             <AlertCircle className="w-4 h-4 text-slate-400" />
             License Parameters
           </h4>
        </div>
        <div className="bg-indigo-50/50 rounded-lg p-5 text-sm text-indigo-900 border border-indigo-100 space-y-3 shadow-inner flex-1 overflow-auto">
          <div className="flex items-center gap-2">
            <span className="font-bold w-28 text-slate-500 text-xs uppercase tracking-wider">Max Devices:</span> 
            <span className="font-mono font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded">{maxDevices}</span>
          </div>
          <div className="h-px bg-indigo-100 my-2"></div>
          <p className="text-xs font-semibold leading-relaxed">
             Active device seat count is determined by devices with <code className="bg-white border border-indigo-200 text-indigo-600 px-1 rounded">status = 'active'</code>.
          </p>
          <div className="bg-white p-3 rounded border border-indigo-100 shadow-sm">
             <p className="text-[11px] font-medium text-slate-600 leading-relaxed">
               Hardware Reset: If a customer replaces their computer or OS, use the "Reset Hardware ID" button. This will soft-revoke their existing machine hashes but leave the license itself active, freeing up seats for their new machines exactly up to the limit of {maxDevices}.
             </p>
          </div>
        </div>
      </div>
    </div>
  )
}
