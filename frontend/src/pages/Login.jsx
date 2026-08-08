import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Factory, ShieldAlert, Check, Sparkles } from 'lucide-react';
import { tsParticles } from '@tsparticles/engine';
import { loadSlim } from '@tsparticles/slim';
import Lottie from 'lottie-react';

const Login = () => {
  const { login, register, verifyOtp, setUser } = useAuth();
  const [activeTab, setActiveTab] = useState('signin');
  const [verifyEmail, setVerifyEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [demoOtpCode, setDemoOtpCode] = useState('');
  
  // Form Fields
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Viewer');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [successMsg, setSuccessMsg] = useState('');
  
  // Animation States
  const [genieState, setGenieState] = useState('materializing'); 
  const [animationData, setAnimationData] = useState(null);

  useEffect(() => {
    // 1. Initialize Particles Engine directly
    const initParticles = async () => {
      await loadSlim(tsParticles);
      await tsParticles.load({
        id: "tsparticles",
        options: {
          fullScreen: { enable: false, zIndex: 0 },
          fpsLimit: 60,
          particles: {
            number: { value: 60, density: { enable: true, value_area: 800 } },
            color: { value: ["#ffffff", "#e0b0ff", "#ffd700"] },
            shape: { type: "circle" },
            opacity: { value: 0.3, random: true, anim: { enable: true, speed: 0.5, opacity_min: 0.1, sync: false } },
            size: { value: 15, random: true, anim: { enable: true, speed: 2, size_min: 5, sync: false } },
            move: { enable: true, speed: 0.8, direction: "top", random: true, straight: false, outModes: { default: "out" }, attract: { enable: true, rotateX: 600, rotateY: 1200 } }
          },
          interactivity: { events: { onHover: { enable: true, mode: "bubble" } }, modes: { bubble: { distance: 250, size: 20, duration: 2, opacity: 0.8 } } }
        }
      });
    };
    initParticles();

    // 2. Fetch a floating magical character (substitution for Genie)
    fetch('https://assets10.lottiefiles.com/packages/lf20_ucbyrun5.json')
      .then(res => res.json())
      .then(data => {
        setAnimationData(data);
        setTimeout(() => setGenieState('idle'), 2000);
      });
  }, []);

  const handleTyping = () => {
    if (genieState !== 'materializing' && genieState !== 'granting' && genieState !== 'error' && genieState !== 'celebrate') {
      setGenieState('typing');
      clearTimeout(window.typingTimeout);
      window.typingTimeout = setTimeout(() => {
        if (genieState !== 'error') setGenieState('idle');
      }, 1000);
    }
  };

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

  const handleSignInSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!validateForm()) return;
    setIsLoading(true);
    setErrors({});
    const res = await login(email, password, { delaySession: true });
    setIsLoading(false);
    
    if (!res.success) {
      if (res.requireVerification) {
        setVerifyEmail(res.email);
        setActiveTab('otp');
      } else {
        setErrors({ form: res.error });
        setGenieState('error');
        setTimeout(() => setGenieState('idle'), 800); 
      }
    } else {
      // No animation delays, direct login
      setGenieState('granting');
      setTimeout(() => {
        setUser(res.user); 
      }, 500); // Tiny delay just for UI feedback
    }
  };

  const handleSignUpSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsLoading(true);
    setErrors({});
    const res = await register(username, email, password, role);
    setIsLoading(false);
    if (res.success) {
      setSuccessMsg('Account registered! Please check your email for the OTP.');
      setActiveTab('otp');
      setVerifyEmail(email);
      setGenieState('celebrate');
      setTimeout(() => setGenieState('idle'), 1500);
      setUsername('');
      setEmail('');
      setPassword('');
    } else {
      setErrors({ form: res.error });
      setGenieState('error');
      setTimeout(() => setGenieState('idle'), 800);
    }
  };

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
      if (res.user && res.user.accountStatus === 'Pending') {
         setSuccessMsg('OTP verified! Your account is pending Admin approval.');
         setGenieState('celebrate');
         setTimeout(() => setGenieState('idle'), 1500);
      } else {
         setSuccessMsg('Account verified successfully! You are now logged in.');
         setGenieState('granting');
         setTimeout(() => {
           setUser(res.user);
         }, 500);
      }
      setOtpCode('');
      setDemoOtpCode('');
    } else {
      setErrors({ otp: res.error || 'OTP verification failed' });
      setGenieState('error');
      setTimeout(() => setGenieState('idle'), 800);
    }
  };

  const handleTabSwitch = (tab) => {
    setActiveTab(tab);
    setErrors({});
    setSuccessMsg('');
    if (tab === 'signup') {
      setGenieState('unregistered');
    } else {
      setGenieState('idle');
    }
  };

  const handleQuickLogin = async (presetEmail, presetRole) => {
    setEmail(presetEmail);
    const targetPassword = presetEmail === 'admin@vms.com' ? 'admin123' : 'manager123';
    setPassword(targetPassword);
    setErrors({});
    setIsLoading(true);
    const res = await login(presetEmail, targetPassword, { delaySession: true });
    setIsLoading(false);
    if (res.success) {
      setGenieState('granting');
      setUser(res.user);
    } else {
      setGenieState('error');
      setTimeout(() => setGenieState('idle'), 800);
    }
  };

  const getGenieStyle = () => {
    let base = "w-full h-full transition-all duration-500 ease-in-out transform ";
    base += "drop-shadow-[0_0_15px_rgba(138,43,226,0.6)] hue-rotate-[240deg] saturate-150 ";
    switch (genieState) {
      case 'materializing': return base + "opacity-0 scale-50 translate-y-20";
      case 'idle': return base + "opacity-100 scale-100 translate-y-0";
      case 'typing': return base + "opacity-100 scale-105 -translate-y-2 rotate-2";
      case 'error': return base + "opacity-100 genie-shake hue-rotate-[300deg] saturate-200";
      case 'unregistered': return base + "opacity-100 scale-100 -rotate-12 -translate-x-10";
      case 'celebrate': return base + "opacity-100 genie-celebrate";
      case 'granting': return base + "opacity-100 scale-125 -translate-y-10 drop-shadow-[0_0_40px_rgba(255,215,0,0.8)] hue-rotate-[280deg]";
      default: return base + "opacity-100 scale-100";
    }
  };

  return (
    <div className="min-h-screen bg-magical-gradient flex flex-col items-center justify-center p-4 relative overflow-hidden">


      {/* --- NATIVE SMOKE PARTICLES CONTAINER --- */}
      <div id="tsparticles" className="absolute inset-0 z-0 pointer-events-none opacity-60"></div>

      <div className="w-full max-w-4xl z-10 flex flex-col md:flex-row items-center justify-center gap-12">
        {/* --- GENIE CHARACTER --- */}
        <div className="w-64 h-64 md:w-96 md:h-96 relative flex items-center justify-center">
          {animationData && (
            <div className={getGenieStyle()}>
              <Lottie animationData={animationData} loop={true} />
            </div>
          )}
        </div>

        {/* --- GLASSMORPHIC LOGIN CARD --- */}
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2.5">
            <div className="inline-flex bg-purple-600 p-3 rounded-2xl text-white shadow-lg shadow-purple-600/30">
              <Factory className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white drop-shadow-md">ERP Portal</h1>
              <p className="text-xs text-slate-300 font-semibold tracking-wide uppercase mt-0.5">Corporate Operations</p>
            </div>
          </div>

          {successMsg && (
            <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 p-3 rounded-xl text-xs font-bold leading-relaxed flex items-start space-x-2 backdrop-blur-sm shadow-[0_0_15px_rgba(16,185,129,0.3)]">
              <Check className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {activeTab === 'otp' ? (
             <Card className="glass-card-magical text-white border-transparent">
              <CardHeader>
                <CardTitle className="text-white text-base">OTP Code Verification</CardTitle>
                <div className="text-slate-400 text-xs mt-1">
                  Activate your account by entering the verification code sent to <span className="text-purple-300 font-bold">{verifyEmail}</span>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleOtpVerifySubmit} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wide">6-Digit Code</label>
                    <input
                      type="text"
                      maxLength="6"
                      placeholder="Enter Code"
                      value={otpCode}
                      onKeyDown={handleTyping}
                      onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
                      className="w-full text-center font-mono text-xl tracking-widest font-black py-2.5 bg-slate-900/50 border border-purple-500/30 rounded-lg text-white focus:outline-none focus:border-purple-400 focus:shadow-[0_0_10px_rgba(168,85,247,0.4)] transition-all"
                      required
                    />
                    {errors.otp && <p className="text-[10px] text-red-400 font-semibold">{errors.otp}</p>}
                  </div>
                  <Button type="submit" isLoading={isLoading} className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold py-2.5 border-0">
                    Verify & Enter
                  </Button>
                  <Button type="button" onClick={() => setActiveTab('signin')} className="w-full bg-transparent hover:bg-white/10 text-slate-300 border border-white/20">
                    Back to Sign In
                  </Button>
                </form>
              </CardContent>
             </Card>
          ) : (
            <Card className="glass-card-magical text-white border-transparent">
              <div className="flex border-b border-purple-500/30">
                <button
                  type="button"
                  onClick={() => handleTabSwitch('signin')}
                  className={`flex-1 text-center py-3.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
                    activeTab === 'signin' ? 'border-purple-400 text-white bg-purple-500/20 shadow-[inset_0_-4px_10px_rgba(168,85,247,0.2)]' : 'border-transparent text-slate-400 hover:text-slate-300'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => handleTabSwitch('signup')}
                  className={`flex-1 text-center py-3.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
                    activeTab === 'signup' ? 'border-purple-400 text-white bg-purple-500/20 shadow-[inset_0_-4px_10px_rgba(168,85,247,0.2)]' : 'border-transparent text-slate-400 hover:text-slate-300'
                  }`}
                >
                  Create Account
                </button>
              </div>

              <CardContent className="pt-6 relative z-10">
                {errors.form && (
                  <div className="mb-4 bg-red-500/20 border border-red-500/40 text-red-300 p-3 rounded-lg text-xs font-bold leading-relaxed flex items-start space-x-1.5 backdrop-blur-sm">
                    <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{errors.form}</span>
                  </div>
                )}
                {activeTab === 'signin' ? (
                  <form onSubmit={handleSignInSubmit} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-300 uppercase tracking-wide">Corporate Email</label>
                      <input type="email" value={email} onKeyDown={handleTyping} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 bg-slate-900/50 border border-purple-500/30 rounded-lg text-sm text-white focus:outline-none focus:border-purple-400 focus:shadow-[0_0_10px_rgba(168,85,247,0.4)] transition-all" required />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-slate-300 uppercase tracking-wide">Access Password</label>
                        <button type="button" onClick={() => handleTabSwitch('forgot')} className="text-[10px] text-purple-400 hover:text-purple-300 font-bold tracking-wider hover:underline transition-all">Forgot Password?</button>
                      </div>
                      <input type="password" value={password} onKeyDown={handleTyping} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 bg-slate-900/50 border border-purple-500/30 rounded-lg text-sm text-white focus:outline-none focus:border-purple-400 focus:shadow-[0_0_10px_rgba(168,85,247,0.4)] transition-all" required />
                    </div>
                    <Button type="submit" isLoading={isLoading} className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold py-2.5 shadow-lg shadow-purple-500/25 border-0">Log In</Button>
                  </form>
                ) : activeTab === 'forgot' ? (
                  <div className="space-y-4">
                    <div className="text-center space-y-2 mb-4">
                      <p className="text-sm text-slate-300">Enter your email to receive a password reset link.</p>
                      <p className="text-[10px] text-purple-300 bg-purple-900/30 p-2 rounded border border-purple-500/30">
                        Note: The password reset backend endpoint is not currently implemented. This is a UI placeholder.
                      </p>
                    </div>
                    <form onSubmit={(e) => { e.preventDefault(); setActiveTab('forgotSent'); }} className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-300 uppercase tracking-wide">Corporate Email</label>
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 bg-slate-900/50 border border-purple-500/30 rounded-lg text-sm text-white focus:outline-none focus:border-purple-400 focus:shadow-[0_0_10px_rgba(168,85,247,0.4)] transition-all" required />
                      </div>
                      <Button type="submit" className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold py-2.5 shadow-lg border-0">Send Reset Link</Button>
                      <Button type="button" onClick={() => setActiveTab('signin')} className="w-full bg-transparent hover:bg-white/10 text-slate-300 border border-white/20">
                        Cancel
                      </Button>
                    </form>
                  </div>
                ) : activeTab === 'forgotSent' ? (
                  <div className="space-y-4 text-center py-4">
                    <div className="mx-auto w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mb-4">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-bold text-white">Link Sent!</h3>
                    <p className="text-sm text-slate-300 px-4">If an account exists for {email || 'that address'}, a reset link has been sent.</p>
                    <Button type="button" onClick={() => setActiveTab('signin')} className="w-full mt-4 bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 border-0">
                      Back to Login
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleSignUpSubmit} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-300 uppercase tracking-wide">Employee Username</label>
                      <input type="text" value={username} onKeyDown={handleTyping} onChange={(e) => setUsername(e.target.value)} className="w-full px-3 py-2 bg-slate-900/50 border border-purple-500/30 rounded-lg text-sm text-white focus:outline-none focus:border-purple-400 focus:shadow-[0_0_10px_rgba(168,85,247,0.4)] transition-all" required />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-300 uppercase tracking-wide">Corporate Email</label>
                      <input type="email" value={email} onKeyDown={handleTyping} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 bg-slate-900/50 border border-purple-500/30 rounded-lg text-sm text-white focus:outline-none focus:border-purple-400 focus:shadow-[0_0_10px_rgba(168,85,247,0.4)] transition-all" required />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-300 uppercase tracking-wide">Define Password</label>
                      <input type="password" value={password} onKeyDown={handleTyping} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 bg-slate-900/50 border border-purple-500/30 rounded-lg text-sm text-white focus:outline-none focus:border-purple-400 focus:shadow-[0_0_10px_rgba(168,85,247,0.4)] transition-all" required />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-300 uppercase tracking-wide">Requested Role</label>
                      <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full px-3 py-2 bg-slate-900/50 border border-purple-500/30 rounded-lg text-sm text-white focus:outline-none focus:border-purple-400 focus:shadow-[0_0_10px_rgba(168,85,247,0.4)] transition-all" required>
                        <option value="Viewer">Viewer (Default)</option>
                        <option value="Inventory">Inventory</option>
                        <option value="Production">Production</option>
                        <option value="Warehouse">Warehouse</option>
                        <option value="Admin">Admin (Requires Admin Approval)</option>
                      </select>
                      <p className="text-[10px] text-purple-300 mt-1">Your selected role will be reviewed by an administrator.</p>
                    </div>
                    <Button type="submit" isLoading={isLoading} className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold py-2.5 shadow-lg shadow-emerald-500/25 border-0 mt-2">Create New Account</Button>
                  </form>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
