import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { isFirebaseConfigured } from '../config/firebase';
import usePageMeta from '../hooks/usePageMeta';
import {
  BadgeCheck,
  Building2,
  Check,
  LockKeyhole,
  Mail,
  ShieldAlert,
  ShieldCheck,
  UserPlus
} from 'lucide-react';

const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100';

// 3D Isometric Emblem Logo for Xperte
const Xperte3DLogo = ({ size = "h-11 w-11" }) => (
  <div className={`relative flex items-center justify-center ${size} rounded-2xl bg-gradient-to-tr from-blue-700 via-indigo-600 to-cyan-400 p-2.5 shadow-[0_10px_25px_rgba(37,99,235,0.5),inset_0_2px_4px_rgba(255,255,255,0.4)] border border-white/20 transform hover:scale-105 transition-all duration-300`}>
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-[0_4px_8px_rgba(0,0,0,0.4)]">
      {/* 3D Cube Top Face */}
      <path d="M24 4L42 14L24 24L6 14L24 4Z" fill="url(#topGrad)" />
      {/* 3D Cube Left Face */}
      <path d="M6 14L24 24V44L6 34V14Z" fill="url(#leftGrad)" />
      {/* 3D Cube Right Face */}
      <path d="M24 24L42 14V34L24 44V24Z" fill="url(#rightGrad)" />
      {/* Inner Glowing Emblem lines */}
      <path d="M16 16L32 32M32 16L16 32" stroke="#FFFFFF" strokeWidth="4.5" strokeLinecap="round" opacity="0.95" />
      <defs>
        <linearGradient id="topGrad" x1="6" y1="4" x2="42" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#60A5FA" />
          <stop offset="1" stopColor="#3B82F6" />
        </linearGradient>
        <linearGradient id="leftGrad" x1="6" y1="14" x2="24" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1D4ED8" />
          <stop offset="1" stopColor="#1E40AF" />
        </linearGradient>
        <linearGradient id="rightGrad" x1="24" y1="14" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3B82F6" />
          <stop offset="1" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>
    </svg>
  </div>
);

const Login = () => {
  usePageMeta('Sign In & Authentication', 'Secure enterprise authentication portal for VendorOS.');
  const { loginWithEmailPassword, loginWithGoogle, registerWithEmailPassword, sendPasswordReset } = useAuth();
  const [activeTab, setActiveTab] = useState('signin');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Viewer');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [successMsg, setSuccessMsg] = useState('');

  const resetFeedback = () => {
    setErrors({});
    setSuccessMsg('');
  };

  const validateCredentials = () => {
    const nextErrors = {};
    if (activeTab === 'signup' && !username.trim()) nextErrors.username = 'Full name is required';
    if (!email.trim()) nextErrors.email = 'Work email is required';
    else if (!/\S+@\S+\.\S+/.test(email)) nextErrors.email = 'Enter a valid email address';
    if (activeTab !== 'forgot' && !password) nextErrors.password = 'Password is required';
    else if (activeTab !== 'forgot' && password.length < 6) nextErrors.password = 'Password must be at least 6 characters';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSignInSubmit = async (event) => {
    event.preventDefault();
    resetFeedback();
    if (!validateCredentials()) return;

    setIsLoading(true);
    const res = await loginWithEmailPassword(email, password);
    setIsLoading(false);

    if (!res.success) {
      setErrors({ form: res.error || 'Authentication failed' });
    }
  };

  const handleSignUpSubmit = async (event) => {
    event.preventDefault();
    resetFeedback();
    if (!validateCredentials()) return;

    setIsLoading(true);
    const res = await registerWithEmailPassword(username, email, password, role);
    setIsLoading(false);

    if (res.success) {
      setSuccessMsg(res.message || 'Account created. Check your email for verification. Access request is pending administrator approval.');
      setActiveTab('signin');
      setUsername('');
      setPassword('');
    } else {
      setErrors({ form: res.error });
    }
  };

  const handleForgotPasswordSubmit = async (event) => {
    event.preventDefault();
    resetFeedback();
    if (!email.trim()) {
      setErrors({ email: 'Work email is required to reset password' });
      return;
    }

    setIsLoading(true);
    const res = await sendPasswordReset(email);
    setIsLoading(false);

    if (res.success) {
      setSuccessMsg(res.message);
      setActiveTab('signin');
    } else {
      setErrors({ form: res.error });
    }
  };

  const handleGoogleSignIn = async () => {
    resetFeedback();
    setIsLoading(true);
    const res = await loginWithGoogle();
    setIsLoading(false);

    if (!res.success && res.error !== 'Sign in cancelled') {
      setErrors({ form: res.error || 'Google sign-in failed.' });
    }
  };

  const switchTab = (tab) => {
    setActiveTab(tab);
    resetFeedback();
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden overflow-hidden bg-slate-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(37,99,235,0.28),transparent_42%),radial-gradient(circle_at_80%_18%,rgba(20,184,166,0.22),transparent_30%)]" />
          
          {/* 3D XPERTE BRAND HEADER */}
          <div className="relative z-10 flex items-center gap-3">
            <Xperte3DLogo size="h-12 w-12" />
            <div>
              <h1 className="text-xl font-black uppercase tracking-wider bg-gradient-to-r from-white via-slate-100 to-blue-300 bg-clip-text text-transparent">
                Xperte
              </h1>
              <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Enterprise Operations Suite</p>
            </div>
          </div>

          <div className="relative z-10 max-w-2xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs font-bold uppercase tracking-wider text-blue-100">
              <ShieldCheck className="h-4 w-4 text-cyan-400" />
              Secured Access Gateway
            </div>
            
            <div className="space-y-2 text-2xl lg:text-3xl font-black leading-snug tracking-tight text-white">
              <p>Unified enterprise hub to control vendors, multi-site networks, and inventory.</p>
              <p className="text-blue-300">Streamline production, location scope access, and audit approvals in real time.</p>
            </div>

            <div className="mt-8 grid grid-cols-3 gap-3">
              {[
                ['15+', 'ERP MODULES'],
                ['FIREBASE', 'AUTH SECURITY'],
                ['RBAC', 'ROLE CONTROLS']
              ].map(([value, label]) => (
                <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-xs">
                  <p className="text-2xl font-black text-white">{value}</p>
                  <p className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 grid grid-cols-3 gap-3 text-xs font-semibold text-slate-300">
            <span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" />Email verification</span>
            <span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" />Admin approval</span>
            <span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" />Audit-ready</span>
          </div>
        </section>

        <main className="flex items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-md">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <Xperte3DLogo size="h-10 w-10" />
              <div>
                <h1 className="text-lg font-black uppercase tracking-wider text-slate-900">Xperte</h1>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Enterprise Operations</p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60">
              <div className="mb-6">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-md">
                  {activeTab === 'signup' ? <UserPlus className="h-5 w-5" /> : <LockKeyhole className="h-5 w-5" />}
                </div>
                <h2 className="text-2xl font-black tracking-tight">
                  {activeTab === 'forgot' ? 'Reset password' : activeTab === 'signup' ? 'Request access' : 'Secure sign in'}
                </h2>
                <p className="mt-1 text-sm text-slate-500 font-medium">
                  {activeTab === 'forgot' ? 'Enter your work email to receive a password reset link.' : 'Use an approved Firebase account to enter the Xperte workspace.'}
                </p>
              </div>

              {successMsg && (
                <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
                  <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              {errors.form && (
                <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{errors.form}</span>
                </div>
              )}

              {activeTab === 'forgot' ? (
                <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Work email</label>
                    <div className="relative mt-1">
                      <Mail className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                      <input type="email" className={`${inputClass} pl-9`} value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    {errors.email && <p className="mt-1 text-xs font-semibold text-rose-600">{errors.email}</p>}
                  </div>
                  <Button type="submit" isLoading={isLoading} className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-extrabold shadow-md">
                    Send password reset link
                  </Button>
                  <Button type="button" variant="outline" onClick={() => switchTab('signin')} className="w-full py-2.5">
                    Back to sign in
                  </Button>
                </form>
              ) : (
                <>
                  <div className="mb-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
                    <button type="button" onClick={() => switchTab('signin')} className={`rounded-lg px-3 py-2 text-sm font-bold transition ${activeTab === 'signin' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>Sign in</button>
                    <button type="button" onClick={() => switchTab('signup')} className={`rounded-lg px-3 py-2 text-sm font-bold transition ${activeTab === 'signup' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>Request access</button>
                  </div>

                  <form onSubmit={activeTab === 'signin' ? handleSignInSubmit : handleSignUpSubmit} className="space-y-4">
                    {activeTab === 'signup' && (
                      <div>
                        <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Full name</label>
                        <input className={`${inputClass} mt-1`} value={username} onChange={(e) => setUsername(e.target.value)} />
                        {errors.username && <p className="mt-1 text-xs font-semibold text-rose-600">{errors.username}</p>}
                      </div>
                    )}
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Work email</label>
                      <div className="relative mt-1">
                        <Mail className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                        <input type="email" className={`${inputClass} pl-9`} value={email} onChange={(e) => setEmail(e.target.value)} />
                      </div>
                      {errors.email && <p className="mt-1 text-xs font-semibold text-rose-600">{errors.email}</p>}
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Password</label>
                        {activeTab === 'signin' && (
                          <button type="button" onClick={() => switchTab('forgot')} className="text-xs font-bold text-blue-600 hover:underline">
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <input type="password" className={`${inputClass} mt-1`} value={password} onChange={(e) => setPassword(e.target.value)} />
                      {errors.password && <p className="mt-1 text-xs font-semibold text-rose-600">{errors.password}</p>}
                    </div>
                    {activeTab === 'signup' && (
                      <div>
                        <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Requested role</label>
                        <select className={`${inputClass} mt-1`} value={role} onChange={(e) => setRole(e.target.value)}>
                          <option value="Viewer">Viewer</option>
                          <option value="Inventory">Inventory</option>
                          <option value="Production">Production</option>
                          <option value="Warehouse">Warehouse</option>
                          <option value="Planner">Planner</option>
                          <option value="Admin">Admin</option>
                        </select>
                      </div>
                    )}
                    <Button type="submit" isLoading={isLoading} className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-extrabold shadow-md">
                      {activeTab === 'signin' ? 'Enter workspace' : 'Submit access request'}
                    </Button>
                  </form>

                  {isFirebaseConfigured && activeTab === 'signin' && (
                    <>
                      <div className="my-5 flex items-center gap-3">
                        <div className="h-px flex-1 bg-slate-200" />
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">or</span>
                        <div className="h-px flex-1 bg-slate-200" />
                      </div>
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={handleGoogleSignIn} 
                        isLoading={isLoading} 
                        className="w-full py-2.5 flex items-center justify-center gap-2.5 font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 shadow-xs"
                      >
                        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                        </svg>
                        Continue with Google
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 text-xs font-semibold text-slate-500">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                Firebase Auth
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <Building2 className="h-4 w-4 text-blue-600" />
                Role approval
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Login;
