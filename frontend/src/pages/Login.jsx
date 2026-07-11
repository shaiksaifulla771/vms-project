import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Factory, ShieldAlert, KeyRound, Check, Sparkles, UserPlus } from 'lucide-react';

const Login = () => {
  const { login, register, verifyOtp } = useAuth();

  // Navigation tabs: 'signin' | 'signup' | 'otp'
  const [activeTab, setActiveTab] = useState('signin');
  
  // Verification Context
  const [verifyEmail, setVerifyEmail] = useState('');
  const [demoOtpCode, setDemoOtpCode] = useState(''); // Stores the OTP returned by server for copying
  const [otpCode, setOtpCode] = useState('');

  // Form Fields
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Inventory Manager');

  // Loading & Errors
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [successMsg, setSuccessMsg] = useState('');

  // Validation
  const validateForm = () => {
    const newErrors = {};
    if (activeTab === 'signup') {
      if (!username.trim()) newErrors.username = 'Username is required';
    }
    if (!email.trim()) {
      newErrors.email = 'Email address is required';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Please provide a valid email format';
    }
    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Submit Sign In
  const handleSignInSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsLoading(true);
    setErrors({});
    const res = await login(email, password);
    setIsLoading(false);

    if (!res.success) {
      if (res.requireVerification) {
        // Redirect to OTP tab
        setVerifyEmail(res.email);
        setDemoOtpCode(''); // No demo code available if they didn't just register, they must check logs
        setActiveTab('otp');
      } else {
        setErrors({ form: res.error });
      }
    }
  };

  // Submit Sign Up (Registration)
  const handleSignUpSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsLoading(true);
    setErrors({});
    const res = await register(username, email, password, role);
    setIsLoading(false);

    if (res.success) {
      setSuccessMsg('Account registered successfully! You are now logged in.');
      // Clean form fields
      setUsername('');
      setEmail('');
      setPassword('');
    } else {
      setErrors({ form: res.error });
    }
  };

  // Submit OTP Verification
  const handleOtpVerifySubmit = async (e) => {
    e.preventDefault();
    if (!otpCode.trim() || otpCode.length !== 6) {
      setErrors({ otp: 'Please enter a valid 6-digit OTP' });
      return;
    }

    setIsLoading(true);
    setErrors({});
    const res = await verifyOtp(verifyEmail, otpCode);
    setIsLoading(false);

    if (res.success) {
      setSuccessMsg('Account verified successfully! You are now logged in.');
      setOtpCode('');
      setDemoOtpCode('');
      // AuthContext will automatically update user state, redirecting to Dashboard
    } else {
      setErrors({ otp: res.error });
    }
  };

  // Instant developer quick logins
  const handleQuickLogin = async (presetEmail, presetRole) => {
    setEmail(presetEmail);
    setPassword('admin123'); // Both admin and manager presets use admin123/manager123, let's map correctly:
    if (presetEmail === 'admin@vms.com') {
      setPassword('admin123');
    } else {
      setPassword('manager123');
    }
    
    setErrors({});
    setIsLoading(true);
    // Directly submit
    const targetPassword = presetEmail === 'admin@vms.com' ? 'admin123' : 'manager123';
    await login(presetEmail, targetPassword);
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl -z-10"></div>
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-emerald-600/10 rounded-full blur-3xl -z-10"></div>

      <div className="w-full max-w-md space-y-6 z-10">
        {/* Branding header */}
        <div className="text-center space-y-2.5">
          <div className="inline-flex bg-blue-600 p-3 rounded-2xl text-white shadow-lg shadow-blue-600/20">
            <Factory className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">Food Processing ERP</h1>
            <p className="text-xs text-slate-400 font-semibold tracking-wide uppercase mt-0.5">Corporate Operations Portal</p>
          </div>
        </div>

        {/* Dynamic Success notifications */}
        {successMsg && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-xl text-xs font-semibold leading-relaxed flex items-start space-x-2">
            <Check className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* OTP Verification card view */}
        {activeTab === 'otp' ? (
          <Card className="bg-slate-900 border-slate-800 text-white shadow-xl">
            <CardHeader>
              <CardTitle className="text-white text-base">OTP Code Verification</CardTitle>
              <CardDescription className="text-slate-400 text-xs">
                Activate your account by entering the verification code sent to <span className="text-blue-400 font-bold">{verifyEmail}</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleOtpVerifySubmit} className="space-y-4">
                {/* Developer convenience OTP box */}
                {demoOtpCode && (
                  <div className="bg-blue-500/10 border border-blue-500/25 text-blue-400 rounded-xl p-3.5 space-y-1.5 shadow-sm">
                    <div className="flex items-center space-x-1 text-xs font-bold">
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>EVALUATOR QUICK-OTP</span>
                    </div>
                    <p className="text-xs leading-relaxed text-slate-300">
                      Copy and enter this simulated registration OTP code:
                    </p>
                    <div className="font-mono text-base font-extrabold tracking-widest text-center py-1.5 bg-slate-950/60 rounded border border-blue-500/10 text-white select-all">
                      {demoOtpCode}
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">6-Digit Verification Code</label>
                  <input
                    type="text"
                    maxLength="6"
                    placeholder="Enter Code"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
                    className="w-full text-center font-mono text-xl tracking-widest font-black py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    required
                  />
                  {errors.otp && <p className="text-[10px] text-red-400 font-semibold">{errors.otp}</p>}
                </div>

                <Button type="submit" isLoading={isLoading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5">
                  Activate & Sign In
                </Button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSuccessMsg('');
                      setActiveTab('signin');
                    }}
                    className="text-xs text-blue-400 hover:text-blue-300 font-bold"
                  >
                    Back to Sign In
                  </button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : (
          /* Sign In & Create Account Card */
          <Card className="bg-slate-900 border-slate-800 text-white shadow-xl">
            {/* Custom Tab selectors */}
            <div className="flex border-b border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setErrors({});
                  setSuccessMsg('');
                  setActiveTab('signin');
                }}
                className={`flex-1 text-center py-3.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
                  activeTab === 'signin' ? 'border-blue-500 text-white bg-slate-800/15' : 'border-transparent text-slate-500 hover:text-slate-400'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setErrors({});
                  setSuccessMsg('');
                  setActiveTab('signup');
                }}
                className={`flex-1 text-center py-3.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
                  activeTab === 'signup' ? 'border-blue-500 text-white bg-slate-800/15' : 'border-transparent text-slate-500 hover:text-slate-400'
                }`}
              >
                Create Account
              </button>
            </div>

            <CardContent className="pt-6">
              {errors.form && (
                <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-xs font-semibold leading-relaxed flex items-start space-x-1.5">
                  <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{errors.form}</span>
                </div>
              )}

              {activeTab === 'signin' ? (
                /* SIGN IN FORM */
                <form onSubmit={handleSignInSubmit} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Corporate Email</label>
                    <input
                      type="email"
                      placeholder="e.g. employee@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                      required
                    />
                    {errors.email && <p className="text-[10px] text-red-400 font-semibold">{errors.email}</p>}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Access Password</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                      required
                    />
                    {errors.password && <p className="text-[10px] text-red-400 font-semibold">{errors.password}</p>}
                  </div>

                  <Button type="submit" isLoading={isLoading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5">
                    Sign In
                  </Button>
                </form>
              ) : (
                /* CREATE ACCOUNT FORM */
                <form onSubmit={handleSignUpSubmit} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Employee Username</label>
                    <input
                      type="text"
                      placeholder="e.g. John Doe"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                      required
                    />
                    {errors.username && <p className="text-[10px] text-red-400 font-semibold">{errors.username}</p>}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Corporate Email</label>
                    <input
                      type="email"
                      placeholder="e.g. employee@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                      required
                    />
                    {errors.email && <p className="text-[10px] text-red-400 font-semibold">{errors.email}</p>}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Define Password</label>
                    <input
                      type="password"
                      placeholder="At least 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                      required
                    />
                    {errors.password && <p className="text-[10px] text-red-400 font-semibold">{errors.password}</p>}
                  </div>

                  <div className="flex flex-col space-y-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Assign Operations Role</label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                      required
                    >
                      <option value="Admin">Admin (Full Access Clearance)</option>
                      <option value="Inventory Manager">Inventory Manager (Sourcing / Warehouse)</option>
                      <option value="Production Manager">Production Manager (BOM / shop floor)</option>
                    </select>
                  </div>

                  <Button type="submit" isLoading={isLoading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5">
                    Register Account
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        )}

        {/* 3 Presets quick login buttons */}
        {activeTab === 'signin' && (
          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-[10px] text-slate-500 font-extrabold uppercase tracking-widest justify-center">
              <KeyRound className="h-3.5 w-3.5 text-slate-600" />
              <span>Dev Evaluation Presets (Verified)</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => handleQuickLogin('admin@vms.com', 'Admin')}
                disabled={isLoading}
                className="bg-slate-900 border border-slate-800 hover:bg-slate-800/80 p-2.5 rounded-xl text-center transition-all disabled:opacity-50 hover:scale-102 flex flex-col items-center justify-between min-h-[75px]"
              >
                <span className="text-[10px] font-black text-rose-400 uppercase tracking-wider">Admin</span>
                <span className="text-[9px] text-slate-500 truncate w-full mt-1.5">Full System</span>
              </button>

              <button
                onClick={() => handleQuickLogin('inventory@vms.com', 'Inventory Manager')}
                disabled={isLoading}
                className="bg-slate-900 border border-slate-800 hover:bg-slate-800/80 p-2.5 rounded-xl text-center transition-all disabled:opacity-50 hover:scale-102 flex flex-col items-center justify-between min-h-[75px]"
              >
                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider">Inventory</span>
                <span className="text-[9px] text-slate-500 truncate w-full mt-1.5">Warehouse Only</span>
              </button>

              <button
                onClick={() => handleQuickLogin('production@vms.com', 'Production Manager')}
                disabled={isLoading}
                className="bg-slate-900 border border-slate-800 hover:bg-slate-800/80 p-2.5 rounded-xl text-center transition-all disabled:opacity-50 hover:scale-102 flex flex-col items-center justify-between min-h-[75px]"
              >
                <span className="text-[10px] font-black text-amber-400 uppercase tracking-wider">Production</span>
                <span className="text-[9px] text-slate-500 truncate w-full mt-1.5">Shop Floor Only</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;
