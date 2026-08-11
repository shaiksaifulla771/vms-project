import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { auth, googleProvider, isFirebaseConfigured } from '../config/firebase';
import { signInWithPopup } from 'firebase/auth';
import {
  BadgeCheck,
  Building2,
  Check,
  Factory,
  LockKeyhole,
  Mail,
  ShieldAlert,
  ShieldCheck,
  UserPlus
} from 'lucide-react';

const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100';

const Login = () => {
  const { login, register, verifyOtp, setUser } = useAuth();
  const [activeTab, setActiveTab] = useState('signin');
  const [verifyEmail, setVerifyEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
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
    if (!password) nextErrors.password = 'Password is required';
    else if (password.length < 6) nextErrors.password = 'Password must be at least 6 characters';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSignInSubmit = async (event) => {
    event.preventDefault();
    resetFeedback();
    if (!validateCredentials()) return;

    setIsLoading(true);
    const res = await login(email, password, { delaySession: true });
    setIsLoading(false);

    if (res.success) {
      setUser(res.user);
      return;
    }

    if (res.requireVerification) {
      setVerifyEmail(res.email);
      setActiveTab('otp');
    } else {
      setErrors({ form: res.error });
    }
  };

  const handleSignUpSubmit = async (event) => {
    event.preventDefault();
    resetFeedback();
    if (!validateCredentials()) return;

    setIsLoading(true);
    const res = await register(username, email, password, role);
    setIsLoading(false);

    if (res.success) {
      const devOtp = res.data?.devOtp;
      setSuccessMsg(devOtp
        ? `Development mode: use OTP ${devOtp}. It expires in 5 minutes.`
        : 'Account created. Check your email for the 4-digit OTP. It expires in 5 minutes.');
      setVerifyEmail(email);
      setActiveTab('otp');
      setUsername('');
      setPassword('');
    } else {
      setErrors({ form: res.error });
    }
  };

  const handleOtpVerifySubmit = async (event) => {
    event.preventDefault();
    resetFeedback();
    if (!otpCode.trim() || otpCode.length !== 4) {
      setErrors({ otp: 'Enter the 4-digit OTP code' });
      return;
    }

    setIsLoading(true);
    const res = await verifyOtp(verifyEmail, otpCode);
    setIsLoading(false);

    if (res.success) {
      if (res.user?.accountStatus === 'Pending') {
        setSuccessMsg('Email verified. Your access request is now pending administrator approval.');
        setOtpCode('');
        setActiveTab('signin');
      } else {
        setUser(res.user);
      }
    } else {
      setErrors({ otp: res.error || 'OTP verification failed' });
    }
  };

  const handleGoogleSignIn = async () => {
    resetFeedback();
    setIsLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const fbUser = result.user;
      const res = await login(fbUser.email, 'firebase-google-sso', { delaySession: true });

      if (res.success) {
        setUser(res.user);
      } else {
        const regRes = await register(
          fbUser.displayName || fbUser.email.split('@')[0],
          fbUser.email,
          `firebase-google-sso-${fbUser.uid.slice(0, 8)}`,
          'Viewer'
        );
        if (regRes.success) {
          setSuccessMsg('Google account registered. Administrator approval is required before access.');
        } else {
          setErrors({ form: regRes.error || 'Google sign-in failed.' });
        }
      }
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setErrors({ form: err.message || 'Google sign-in failed.' });
      }
    } finally {
      setIsLoading(false);
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
          <div className="relative z-10 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-600 shadow-lg shadow-blue-950/40">
              <Factory className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-black uppercase tracking-wide">VendorOS VMS</h1>
              <p className="text-xs font-semibold uppercase tracking-widest text-blue-200">Enterprise operations suite</p>
            </div>
          </div>

          <div className="relative z-10 max-w-2xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs font-bold uppercase tracking-wider text-blue-100">
              <ShieldCheck className="h-4 w-4" />
              Secured access gateway
            </div>
            <h2 className="text-4xl font-black leading-tight tracking-normal">Control vendors, sites, materials, production, and approvals from one governed workspace.</h2>
            <div className="mt-8 grid grid-cols-3 gap-3">
              {[
                ['15+', 'ERP modules'],
                ['JWT', 'Session security'],
                ['RBAC', 'Role controls']
              ].map(([value, label]) => (
                <div key={label} className="rounded-lg border border-white/10 bg-white/10 p-4">
                  <p className="text-2xl font-black">{value}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-300">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 grid grid-cols-3 gap-3 text-xs font-semibold text-slate-300">
            <span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-300" />OTP verification</span>
            <span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-300" />Admin approval</span>
            <span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-300" />Audit-ready</span>
          </div>
        </section>

        <main className="flex items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-md">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white">
                <Factory className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-base font-black uppercase tracking-wide">VendorOS VMS</h1>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Enterprise operations</p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60">
              <div className="mb-6">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
                  {activeTab === 'signup' ? <UserPlus className="h-5 w-5" /> : <LockKeyhole className="h-5 w-5" />}
                </div>
                <h2 className="text-2xl font-black tracking-normal">Secure sign in</h2>
                <p className="mt-1 text-sm text-slate-500">Use an approved account to enter the VMS workspace.</p>
              </div>

              {successMsg && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
                  <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              {errors.form && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{errors.form}</span>
                </div>
              )}

              {activeTab === 'otp' ? (
                <form onSubmit={handleOtpVerifySubmit} className="space-y-4">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Verification email</label>
                    <input className={`${inputClass} mt-1 bg-slate-50`} value={verifyEmail} onChange={(e) => setVerifyEmail(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wide text-slate-600">4-digit OTP</label>
                    <input className={`${inputClass} mt-1 text-center font-mono text-lg font-black tracking-widest`} maxLength="4" value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ''))} />
                    {errors.otp && <p className="mt-1 text-xs font-semibold text-rose-600">{errors.otp}</p>}
                  </div>
                  <Button type="submit" isLoading={isLoading} className="w-full py-2.5">Verify account</Button>
                  <Button type="button" variant="outline" onClick={() => switchTab('signin')} className="w-full py-2.5">Back to sign in</Button>
                </form>
              ) : (
                <>
                  <div className="mb-5 grid grid-cols-2 rounded-lg bg-slate-100 p-1">
                    <button type="button" onClick={() => switchTab('signin')} className={`rounded-md px-3 py-2 text-sm font-bold transition ${activeTab === 'signin' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>Sign in</button>
                    <button type="button" onClick={() => switchTab('signup')} className={`rounded-md px-3 py-2 text-sm font-bold transition ${activeTab === 'signup' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>Request access</button>
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
                      <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Password</label>
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
                    <Button type="submit" isLoading={isLoading} className="w-full py-2.5">
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
                      <Button type="button" variant="outline" onClick={handleGoogleSignIn} isLoading={isLoading} className="w-full py-2.5">
                        Continue with Google
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 text-xs font-semibold text-slate-500">
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                JWT sessions
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
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
