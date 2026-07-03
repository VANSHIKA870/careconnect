import React, { useState, useEffect, useRef } from 'react';
import { 
  Heart, Calendar, User, Users, Shield, Clock, Search, AlertTriangle, 
  CheckCircle, ShieldAlert, LogOut, ArrowRight, Eye, RefreshCw, Plus, 
  Trash2, Edit, ChevronRight, Settings, Pill, Activity, Info
} from 'lucide-react';

const API_BASE = 'https://careconnect-backend-9jvh.onrender.com/api';
export default function App() {
  // Authentication State
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [refreshToken, setRefreshToken] = useState(localStorage.getItem('refreshToken') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'));
  
  // Navigation / Routing State (state-based for robust local demo delivery)
  const [currentPage, setCurrentPage] = useState('landing'); // landing, login, register, dashboard, detail, book, medications, admin-doctors, admin-leaves, admin-appointments
  const [selectedApptId, setSelectedApptId] = useState(null);
  
  // Accessibility Settings
  const [zoomMode, setZoomMode] = useState(localStorage.getItem('zoomMode') || 'normal'); // normal, large, xlarge
  const [simpleMode, setSimpleMode] = useState(localStorage.getItem('simpleMode') === 'true');

  // App wide loading/error states
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Persist settings
  useEffect(() => {
    localStorage.setItem('zoomMode', zoomMode);
  }, [zoomMode]);

  useEffect(() => {
    localStorage.setItem('simpleMode', simpleMode);
  }, [simpleMode]);

  // Auth localstorage sync
  const loginUser = (data) => {
    setToken(data.accessToken);
    setRefreshToken(data.refreshToken);
    setUser(data.user);
    localStorage.setItem('token', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('user', JSON.stringify(data.user));
    setCurrentPage('dashboard');
  };

  const logoutUser = () => {
    setToken('');
    setRefreshToken('');
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    setCurrentPage('landing');
  };

  // API Call Wrapper with auto-token refresh
  const apiCall = async (endpoint, options = {}) => {
    setErrorMsg('');
    setSuccessMsg('');
    
    let currentToken = token;
    
    // Set headers
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    if (currentToken) {
      headers['Authorization'] = `Bearer ${currentToken}`;
    }

    let response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    // Handle token refresh
    if (response.status === 403 && refreshToken) {
      try {
        const refreshResponse = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });

        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json();
          setToken(refreshData.accessToken);
          localStorage.setItem('token', refreshData.accessToken);
          
          // Retry API call
          headers['Authorization'] = `Bearer ${refreshData.accessToken}`;
          response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers,
          });
        } else {
          // Refresh failed, logout
          logoutUser();
          throw new Error('Session expired. Please log in again.');
        }
      } catch (err) {
        logoutUser();
        throw err;
      }
    }

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.error || `Request failed with code ${response.status}`);
    }

    return response.json();
  };

  // Font size utilities based on zoom settings
  const getZoomClass = (patientFacing = false) => {
    if (patientFacing) {
      if (zoomMode === 'large') return 'patient-text-large';
      if (zoomMode === 'xlarge') return 'patient-text-xlarge';
      return 'patient-text-normal';
    } else {
      if (zoomMode === 'large') return 'text-zoom-large';
      if (zoomMode === 'xlarge') return 'text-zoom-xlarge';
      return 'text-zoom-normal';
    }
  };

  // Reset notifications after 6 seconds
  useEffect(() => {
    if (errorMsg || successMsg) {
      const t = setTimeout(() => {
        setErrorMsg('');
        setSuccessMsg('');
      }, 6000);
      return () => clearTimeout(t);
    }
  }, [errorMsg, successMsg]);

  return (
    <div className={`min-h-screen flex flex-col gradient-bg ${getZoomClass()} selection:bg-brand-500 selection:text-white`}>
      {/* 1. Accessibility Bar */}
      <div className="bg-slate-900 text-white py-2 px-4 flex flex-wrap justify-between items-center text-xs md:text-sm font-medium border-b border-slate-800 z-50 gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-brand-500 animate-pulse" />
          <span>CareConnect Accessibility Settings</span>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span>Text Size:</span>
            <div className="flex bg-slate-800 rounded border border-slate-700 p-0.5">
              <button 
                onClick={() => setZoomMode('normal')}
                className={`px-3 py-1 text-xs font-semibold rounded min-h-[32px] ${zoomMode === 'normal' ? 'bg-brand-500 text-white' : 'text-slate-300 hover:text-white'}`}
                aria-label="Set text size to normal"
              >
                A
              </button>
              <button 
                onClick={() => setZoomMode('large')}
                className={`px-3 py-1 text-sm font-semibold rounded min-h-[32px] ${zoomMode === 'large' ? 'bg-brand-500 text-white' : 'text-slate-300 hover:text-white'}`}
                aria-label="Set text size to large"
              >
                A+
              </button>
              <button 
                onClick={() => setZoomMode('xlarge')}
                className={`px-3 py-1 text-base font-semibold rounded min-h-[32px] ${zoomMode === 'xlarge' ? 'bg-brand-500 text-white' : 'text-slate-300 hover:text-white'}`}
                aria-label="Set text size to extra large"
              >
                A++
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <label htmlFor="simple-mode-toggle" className="cursor-pointer">Simple Mode (For Elderly):</label>
            <button
              id="simple-mode-toggle"
              onClick={() => setSimpleMode(!simpleMode)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 min-h-[32px] ${simpleMode ? 'bg-brand-500' : 'bg-slate-700'}`}
              aria-label="Toggle simplified interface layout"
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 ${simpleMode ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Global Navbar */}
      <header className="glass-panel sticky top-0 z-40 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentPage(user ? 'dashboard' : 'landing')}>
            <div className="bg-brand-500 p-2.5 rounded-2xl text-white shadow-lg shadow-brand-500/20">
              <Heart className="h-7 w-7" />
            </div>
            <span className="text-2xl font-bold tracking-tight bg-gradient-to-r from-brand-600 to-slate-900 bg-clip-text text-transparent">CareConnect</span>
          </div>

          <nav className="flex items-center gap-2">
            {user ? (
              <>
                <span className="hidden md:inline-block text-sm text-slate-600 mr-2">
                  Welcome, <strong>{user.fullName}</strong> ({user.role})
                </span>
                
                {user.role === 'PATIENT' && (
                  <>
                    <button 
                      onClick={() => setCurrentPage('dashboard')}
                      className="px-4 py-2 text-slate-700 hover:text-brand-500 font-semibold min-h-[48px] rounded-lg transition"
                    >
                      Dashboard
                    </button>
                    <button 
                      onClick={() => setCurrentPage('medications')}
                      className="px-4 py-2 text-slate-700 hover:text-brand-500 font-semibold min-h-[48px] rounded-lg transition flex items-center gap-2"
                    >
                      <Pill className="h-5 w-5 text-emerald-500" />
                      {!simpleMode && "My"} Medicines
                    </button>
                  </>
                )}

                {user.role === 'ADMIN' && (
                  <>
                    <button 
                      onClick={() => setCurrentPage('dashboard')}
                      className="px-4 py-2 text-slate-700 hover:text-brand-500 font-semibold min-h-[48px] rounded-lg transition"
                    >
                      Stats
                    </button>
                    <button 
                      onClick={() => setCurrentPage('admin-doctors')}
                      className="px-4 py-2 text-slate-700 hover:text-brand-500 font-semibold min-h-[48px] rounded-lg transition"
                    >
                      Doctors
                    </button>
                    <button 
                      onClick={() => setCurrentPage('admin-leaves')}
                      className="px-4 py-2 text-slate-700 hover:text-brand-500 font-semibold min-h-[48px] rounded-lg transition"
                    >
                      Leaves
                    </button>
                  </>
                )}

                <button 
                  onClick={logoutUser}
                  className="bg-slate-100 text-slate-700 hover:bg-red-50 hover:text-red-600 px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition min-h-[48px]"
                >
                  <LogOut className="h-5 w-5" />
                  Logout
                </button>
              </>
            ) : (
              <>
                <button 
                  onClick={() => setCurrentPage('login')}
                  className="px-5 py-2.5 text-slate-700 hover:text-brand-500 font-bold min-h-[48px]"
                >
                  Log In
                </button>
                <button 
                  onClick={() => setCurrentPage('register')}
                  className="bg-brand-500 text-white hover:bg-brand-600 px-5 py-2.5 rounded-xl font-bold transition shadow-lg shadow-brand-500/10 min-h-[48px]"
                >
                  Sign Up
                </button>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* 3. Status Notification Messages */}
      {errorMsg && (
        <div className="bg-red-50 border-y border-red-200 text-red-800 px-4 py-3 flex items-center justify-between max-w-7xl mx-auto w-full mt-2 rounded-lg shadow-sm" role="alert">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-6 w-6 text-red-500 shrink-0" />
            <span className="font-semibold">{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg('')} className="text-red-500 hover:text-red-700 text-xl font-bold px-2">&times;</button>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-50 border-y border-emerald-200 text-emerald-800 px-4 py-3 flex items-center justify-between max-w-7xl mx-auto w-full mt-2 rounded-lg shadow-sm" role="alert">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-6 w-6 text-emerald-500 shrink-0" />
            <span className="font-semibold">{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')} className="text-emerald-500 hover:text-emerald-700 text-xl font-bold px-2">&times;</button>
        </div>
      )}

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex flex-col justify-center items-center z-50">
          <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center max-w-xs text-center border border-slate-100">
            <RefreshCw className="h-12 w-12 text-brand-500 animate-spin mb-4" />
            <p className="font-bold text-slate-800 text-lg">{loadingText || "Processing your request..."}</p>
            <p className="text-sm text-slate-500 mt-2">Please wait, we are syncing with calendar and processing medical reports.</p>
          </div>
        </div>
      )}

      {/* 4. Core Routing Logic & Views */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentPage === 'landing' && <LandingPage setCurrentPage={setCurrentPage} zoomClass={getZoomClass(true)} simpleMode={simpleMode} />}
        {currentPage === 'login' && <LoginPage loginUser={loginUser} apiCall={apiCall} setCurrentPage={setCurrentPage} />}
        {currentPage === 'register' && <RegisterPage loginUser={loginUser} apiCall={apiCall} setCurrentPage={setCurrentPage} />}
        {currentPage === 'dashboard' && user && (
          user.role === 'PATIENT' ? (
            <PatientDashboard apiCall={apiCall} setCurrentPage={setCurrentPage} setSelectedApptId={setSelectedApptId} simpleMode={simpleMode} zoomClass={getZoomClass(true)} />
          ) : user.role === 'DOCTOR' ? (
            <DoctorDashboard apiCall={apiCall} setCurrentPage={setCurrentPage} setSelectedApptId={setSelectedApptId} simpleMode={simpleMode} />
          ) : (
            <AdminDashboard apiCall={apiCall} setCurrentPage={setCurrentPage} simpleMode={simpleMode} />
          )
        )}
        {currentPage === 'detail' && selectedApptId && (
          <AppointmentDetailPage apptId={selectedApptId} apiCall={apiCall} setCurrentPage={setCurrentPage} user={user} simpleMode={simpleMode} zoomClass={getZoomClass(true)} />
        )}
        {currentPage === 'book' && user && user.role === 'PATIENT' && (
          <BookAppointmentFlow apiCall={apiCall} setCurrentPage={setCurrentPage} patientUser={user} zoomClass={getZoomClass(true)} simpleMode={simpleMode} setLoading={setLoading} setLoadingText={setLoadingText} setErrorMsg={setErrorMsg} />
        )}
        {currentPage === 'medications' && user && user.role === 'PATIENT' && (
          <MedicationTracker apiCall={apiCall} zoomClass={getZoomClass(true)} simpleMode={simpleMode} />
        )}
        {currentPage === 'admin-doctors' && user && user.role === 'ADMIN' && (
          <AdminDoctorManager apiCall={apiCall} />
        )}
        {currentPage === 'admin-leaves' && user && user.role === 'ADMIN' && (
          <AdminLeaveManager apiCall={apiCall} />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-slate-950 text-slate-400 py-10 mt-auto border-t border-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="bg-brand-500 p-1.5 rounded-lg text-white">
              <Heart className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold text-white tracking-tight">CareConnect</span>
          </div>
          <p className="text-sm">&copy; {new Date().getFullYear()} CareConnect Inc. All healthcare details are securely encrypted.</p>
          <div className="flex items-center gap-4 text-sm font-semibold">
            <span className="text-slate-500">Secure Database: PostgreSQL & JWT</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ----------------------------------------------------
// PAGE COMPONENT 1: Public Landing Page
// ----------------------------------------------------
function LandingPage({ setCurrentPage, zoomClass, simpleMode }) {
  return (
    <div className="py-8 md:py-16 flex flex-col lg:flex-row items-center gap-12">
      <div className="flex-1 space-y-6">
        <div className="inline-flex items-center gap-2 bg-brand-50 border border-brand-100 text-brand-700 px-4 py-2 rounded-full text-sm font-bold shadow-sm">
          <Shield className="h-4 w-4" />
          <span>Fully Accessible Healthcare Booking Portal</span>
        </div>
        <h1 className="text-4xl md:text-6xl font-black text-slate-900 tracking-tight leading-tight">
          Reliable Healthcare, <br />
          <span className="text-brand-500">Made Simple.</span>
        </h1>
        <p className={`text-slate-600 leading-relaxed max-w-lg ${zoomClass}`}>
          CareConnect is designed to help patients of all ages schedule visits without friction. Our system guarantees no double-bookings, provides automatic Google Calendar syncing, and uses AI to simplify medical summary notes.
        </p>

        <div className="flex gap-4 pt-4">
          <button 
            onClick={() => setCurrentPage('register')}
            className="bg-brand-500 text-white hover:bg-brand-600 px-8 py-4 rounded-2xl font-bold flex items-center gap-2 transition shadow-lg shadow-brand-500/25 min-h-[52px]"
          >
            Find a Doctor Now
            <ArrowRight className="h-5 w-5" />
          </button>
          
          {!simpleMode && (
            <button 
              onClick={() => setCurrentPage('login')}
              className="bg-white text-slate-700 border border-slate-200 hover:border-slate-300 px-8 py-4 rounded-2xl font-bold transition min-h-[52px]"
            >
              Sign In
            </button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-6 pt-10 border-t border-slate-200">
          <div>
            <p className="text-3xl font-black text-slate-950">100%</p>
            <p className="text-sm text-slate-500 font-medium">Double-booking block</p>
          </div>
          <div>
            <p className="text-3xl font-black text-slate-950">AI</p>
            <p className="text-sm text-slate-500 font-medium">Symptom translation</p>
          </div>
          <div>
            <p className="text-3xl font-black text-slate-950">Calendar</p>
            <p className="text-sm text-slate-500 font-medium">Auto-sync events</p>
          </div>
        </div>
      </div>

      <div className="flex-1 w-full max-w-md mx-auto bg-white rounded-3xl p-8 shadow-xl border border-slate-100 flex flex-col gap-6">
        <h2 className="text-2xl font-bold text-slate-900">Immediate Care Access</h2>
        <p className="text-slate-500">Need help fast? Register an account, pick your specialist, and lock a time slot within 2 minutes.</p>
        
        <div className="space-y-4">
          <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-2xl">
            <div className="bg-brand-100 p-2.5 rounded-xl text-brand-600">
              <Calendar className="h-6 w-6" />
            </div>
            <div>
              <p className="font-bold text-slate-800">5-minute Slot Lock</p>
              <p className="text-sm text-slate-500">Your chosen time is reserved for you while completing the symptom check.</p>
            </div>
          </div>

          <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-2xl">
            <div className="bg-emerald-100 p-2.5 rounded-xl text-emerald-600">
              <CheckCircle className="h-6 w-6" />
            </div>
            <div>
              <p className="font-bold text-slate-800">Medication Alerts</p>
              <p className="text-sm text-slate-500">Receive SMS-style email alerts to take your doses on schedule.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// PAGE COMPONENT 2: Login Page
// ----------------------------------------------------
function LoginPage({ loginUser, apiCall, setCurrentPage }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await apiCall('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      loginUser(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white rounded-3xl p-8 shadow-xl border border-slate-100 my-8">
      <h2 className="text-3xl font-black text-slate-900 tracking-tight mb-2">Log In</h2>
      <p className="text-slate-500 mb-6">Access your dashboard to book and view appointments.</p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-3 text-sm mb-4 font-semibold">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2" htmlFor="login-email">
            Email Address
          </label>
          <input 
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 min-h-[48px]"
            required
            placeholder="e.g. patient@careconnect.com"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2" htmlFor="login-password">
            Password
          </label>
          <input 
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 min-h-[48px]"
            required
            placeholder="••••••••"
          />
        </div>

        <button 
          type="submit"
          disabled={loading}
          className="w-full bg-brand-500 text-white hover:bg-brand-600 font-bold py-3 px-4 rounded-xl transition min-h-[48px] flex items-center justify-center gap-2"
        >
          {loading ? "Logging in..." : "Log In"}
        </button>
      </form>

      <p className="text-center text-sm text-slate-500 mt-6 font-semibold">
        Don't have an account?{' '}
        <button onClick={() => setCurrentPage('register')} className="text-brand-500 hover:underline">
          Sign Up
        </button>
      </p>
    </div>
  );
}

// ----------------------------------------------------
// PAGE COMPONENT 3: Register Page
// ----------------------------------------------------
function RegisterPage({ loginUser, apiCall, setCurrentPage }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('PATIENT'); // PATIENT / DOCTOR
  
  // Role specific fields
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [specialisation, setSpecialisation] = useState('');
  const [bio, setBio] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const body = {
      email,
      password,
      fullName,
      phone,
      role,
    };

    if (role === 'PATIENT') {
      body.dateOfBirth = dateOfBirth;
      body.emergencyContact = emergencyContact;
    } else {
      body.specialisation = specialisation;
      body.bio = bio;
    }

    try {
      // 1. Register
      await apiCall('/auth/register', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      // 2. Automatically log in after registration
      const loginData = await apiCall('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      loginUser(loginData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto bg-white rounded-3xl p-8 shadow-xl border border-slate-100 my-4">
      <h2 className="text-3xl font-black text-slate-900 tracking-tight mb-2">Create Account</h2>
      <p className="text-slate-500 mb-6">Register today to lock and hold appointment slots.</p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-3 text-sm mb-4 font-semibold">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2" htmlFor="reg-role">I want to register as a:</label>
          <div className="grid grid-cols-2 gap-4">
            <button
              id="reg-role"
              type="button"
              onClick={() => setRole('PATIENT')}
              className={`py-3 px-4 border rounded-xl font-bold transition min-h-[48px] ${role === 'PATIENT' ? 'bg-brand-500 text-white border-brand-500' : 'bg-slate-50 text-slate-700 border-slate-200'}`}
            >
              Patient
            </button>
            <button
              type="button"
              onClick={() => setRole('DOCTOR')}
              className={`py-3 px-4 border rounded-xl font-bold transition min-h-[48px] ${role === 'DOCTOR' ? 'bg-brand-500 text-white border-brand-500' : 'bg-slate-50 text-slate-700 border-slate-200'}`}
            >
              Doctor
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2" htmlFor="reg-name">Full Name</label>
          <input 
            id="reg-name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 min-h-[48px]"
            required
            placeholder="e.g. John Doe"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2" htmlFor="reg-email">Email Address</label>
            <input 
              id="reg-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 min-h-[48px]"
              required
              placeholder="e.g. john@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2" htmlFor="reg-phone">Phone Number</label>
            <input 
              id="reg-phone"
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 min-h-[48px]"
              required
              placeholder="e.g. +1 555-0199"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2" htmlFor="reg-pass">Password</label>
          <input 
            id="reg-pass"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 min-h-[48px]"
            required
            placeholder="••••••••"
          />
        </div>

        {role === 'PATIENT' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2" htmlFor="reg-dob">Date of Birth</label>
              <input 
                id="reg-dob"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 min-h-[48px]"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2" htmlFor="reg-emergency">Emergency Contact (Phone)</label>
              <input 
                id="reg-emergency"
                type="text"
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 min-h-[48px]"
                required
                placeholder="e.g. Spouse (+1 555-0210)"
              />
            </div>
          </div>
        ) : (
          <div className="border-t border-slate-100 pt-4 space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2" htmlFor="reg-special">Medical Specialisation</label>
              <select
                id="reg-special"
                value={specialisation}
                onChange={(e) => setSpecialisation(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 min-h-[48px]"
                required
              >
                <option value="">Select a specialty</option>
                <option value="General Physician">General Physician</option>
                <option value="Cardiologist">Cardiologist</option>
                <option value="Paediatrician">Paediatrician</option>
                <option value="Neurologist">Neurologist</option>
                <option value="Dermatologist">Dermatologist</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2" htmlFor="reg-bio">Short Biography</label>
              <textarea
                id="reg-bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 min-h-[80px]"
                placeholder="Briefly state your qualifications and expertise..."
              />
            </div>
          </div>
        )}

        <button 
          type="submit"
          disabled={loading}
          className="w-full bg-brand-500 text-white hover:bg-brand-600 font-bold py-3 px-4 rounded-xl transition min-h-[48px] flex items-center justify-center gap-2"
        >
          {loading ? "Registering..." : "Create Account"}
        </button>
      </form>

      <p className="text-center text-sm text-slate-500 mt-6 font-semibold">
        Already have an account?{' '}
        <button onClick={() => setCurrentPage('login')} className="text-brand-500 hover:underline">
          Log In
        </button>
      </p>
    </div>
  );
}

// ----------------------------------------------------
// PAGE COMPONENT 4: Patient Dashboard
// ----------------------------------------------------
function PatientDashboard({ apiCall, setCurrentPage, setSelectedApptId, simpleMode, zoomClass }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAppointments();
  }, []);

  const loadAppointments = async () => {
    try {
      const data = await apiCall('/patient/appointments');
      setAppointments(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getUrgencyBadge = (urgency) => {
    switch (urgency) {
      case 'High':
        return <span className="inline-flex items-center gap-1 bg-red-100 text-red-800 text-sm font-bold px-3 py-1 rounded-full border border-red-200 shrink-0">🚨 High</span>;
      case 'Medium':
        return <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-sm font-bold px-3 py-1 rounded-full border border-amber-200 shrink-0">⚠️ Medium</span>;
      default:
        return <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-sm font-bold px-3 py-1 rounded-full border border-emerald-200 shrink-0">✅ Low</span>;
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'COMPLETED':
        return <span className="bg-slate-100 text-slate-800 border border-slate-200 px-3 py-1 rounded-full text-xs font-bold">Completed</span>;
      case 'CANCELLED':
        return <span className="bg-red-50 text-red-600 border border-red-100 px-3 py-1 rounded-full text-xs font-bold">Cancelled</span>;
      case 'RESCHED_NEEDED':
        return <span className="bg-rose-100 text-rose-700 border border-rose-200 px-3 py-1 rounded-full text-xs font-bold animate-pulse">Reschedule Required</span>;
      default:
        return <span className="bg-brand-50 text-brand-600 border border-brand-100 px-3 py-1 rounded-full text-xs font-bold">Confirmed</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Patient Portal</h2>
          <p className="text-slate-500">View notes, check medication schedules, or book a new appointment.</p>
        </div>
        
        <button
          onClick={() => setCurrentPage('book')}
          className="bg-brand-500 text-white hover:bg-brand-600 px-6 py-3.5 rounded-2xl font-bold flex items-center gap-2 transition shadow-lg shadow-brand-500/10 min-h-[48px]"
        >
          <Plus className="h-5 w-5" />
          Book Appointment
        </button>
      </div>

      <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-100">
        <h3 className="text-2xl font-bold text-slate-950 mb-6 flex items-center gap-2">
          <Calendar className="h-6 w-6 text-brand-500" />
          Your Appointments
        </h3>

        {loading ? (
          <div className="text-center py-10 font-bold text-slate-500 flex justify-center items-center gap-2">
            <RefreshCw className="h-5 w-5 animate-spin" /> Loading appointments...
          </div>
        ) : appointments.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
            <p className="font-bold text-slate-700 mb-2">No appointments scheduled</p>
            <p className="text-slate-500 mb-6">You do not have any active or past medical appointments.</p>
            <button 
              onClick={() => setCurrentPage('book')}
              className="bg-white text-brand-500 border border-brand-200 hover:bg-brand-50 px-6 py-3 rounded-xl font-bold transition min-h-[48px]"
            >
              Book Your First Visit
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {appointments.map((appt) => (
              <div 
                key={appt.id} 
                className={`p-5 rounded-2xl border transition hover:border-brand-200 ${appt.status === 'RESCHED_NEEDED' ? 'border-rose-300 bg-rose-50/20' : 'border-slate-100 bg-slate-50/50'}`}
              >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-slate-500 font-bold">DATE & TIME</p>
                    <p className="font-black text-slate-900">{new Date(appt.slotStart).toLocaleString()}</p>
                    <p className="text-sm font-semibold text-slate-700">Dr. {appt.doctor.user.fullName} ({appt.doctor.specialisation})</p>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    {getStatusBadge(appt.status)}
                    {!simpleMode && getUrgencyBadge(appt.symptomUrgency)}
                    
                    <button
                      onClick={() => {
                        setSelectedApptId(appt.id);
                        setCurrentPage('detail');
                      }}
                      className="bg-white hover:bg-slate-100 text-slate-800 font-bold px-4 py-2 border border-slate-200 rounded-xl text-sm transition min-h-[48px] flex items-center gap-1"
                    >
                      <Eye className="h-4 w-4" /> View Details
                    </button>
                  </div>
                </div>

                {appt.status === 'RESCHED_NEEDED' && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-sm font-bold flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
                    <span>This slot conflicts with doctor's scheduled leave. Please reschedule immediately using the View Details page.</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------
// PAGE COMPONENT 5: Doctor Dashboard
// ----------------------------------------------------
function DoctorDashboard({ apiCall, setCurrentPage, setSelectedApptId, simpleMode }) {
  const [appointments, setAppointments] = useState([]);
  const [stats, setStats] = useState(null);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, [filterDate]);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const appts = await apiCall(`/doctor/appointments?date=${filterDate}`);
      setAppointments(appts);

      const dashboardStats = await apiCall('/doctor/stats');
      setStats(dashboardStats);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getUrgencyColor = (urgency) => {
    switch (urgency) {
      case 'High':
        return 'border-l-8 border-l-red-500 bg-red-50/20';
      case 'Medium':
        return 'border-l-8 border-l-amber-500 bg-amber-50/20';
      default:
        return 'border-l-8 border-l-emerald-500 bg-emerald-50/20';
    }
  };

  const getUrgencyIcon = (urgency) => {
    switch (urgency) {
      case 'High':
        return <span className="text-red-600 font-black shrink-0">🚨 High</span>;
      case 'Medium':
        return <span className="text-amber-600 font-black shrink-0">⚠️ Medium</span>;
      default:
        return <span className="text-emerald-600 font-black shrink-0">✅ Low</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <h2 className="text-3xl font-black text-slate-900 tracking-tight">Doctor Portal</h2>
        <p className="text-slate-500">Manage your patient appointments, consult summaries, and write prescriptions.</p>
      </div>

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <p className="text-sm font-bold text-slate-500">Total Consultation Appointments</p>
            <p className="text-3xl font-black text-slate-950 mt-1">{stats.total}</p>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm border-l-8 border-l-emerald-500">
            <p className="text-sm font-bold text-slate-500">Completed Sessions</p>
            <p className="text-3xl font-black text-emerald-600 mt-1">{stats.completed}</p>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm border-l-8 border-l-brand-500">
            <p className="text-sm font-bold text-slate-500">Upcoming Confirmed</p>
            <p className="text-3xl font-black text-brand-600 mt-1">{stats.confirmed}</p>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm border-l-8 border-l-red-500">
            <p className="text-sm font-bold text-slate-500">High Urgency Cases</p>
            <p className="text-3xl font-black text-red-600 mt-1">{stats.urgencyBreakdown.High}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-100">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 border-b border-slate-100 pb-5">
          <h3 className="text-2xl font-bold text-slate-950 flex items-center gap-2">
            <Calendar className="h-6 w-6 text-brand-500" />
            Today's Schedule
          </h3>

          <div className="flex items-center gap-2">
            <label htmlFor="sched-date" className="text-sm font-bold text-slate-700 shrink-0">Filter Date:</label>
            <input 
              id="sched-date"
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 min-h-[44px]"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-10 font-bold text-slate-500 flex justify-center items-center gap-2">
            <RefreshCw className="h-5 w-5 animate-spin" /> Loading schedule...
          </div>
        ) : appointments.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
            <p className="font-bold text-slate-700">No appointments scheduled for this date</p>
          </div>
        ) : (
          <div className="space-y-4">
            {appointments.map((appt) => (
              <div 
                key={appt.id} 
                className={`p-5 rounded-2xl border border-slate-100 ${getUrgencyColor(appt.symptomUrgency)} transition`}
              >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="bg-slate-900 text-white font-bold text-xs px-2.5 py-1 rounded-md">
                        {new Date(appt.slotStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {getUrgencyIcon(appt.symptomUrgency)}
                      <span className="bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded font-bold border border-slate-200">{appt.status}</span>
                    </div>
                    <p className="font-bold text-slate-950">Patient: {appt.patient.user.fullName}</p>
                    <p className="text-sm text-slate-600 font-medium italic">Symptom detail: "{appt.symptomText}"</p>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedApptId(appt.id);
                      setCurrentPage('detail');
                    }}
                    className="bg-white hover:bg-slate-100 text-slate-800 font-bold px-5 py-3 border border-slate-200 rounded-xl text-sm transition min-h-[48px] shadow-sm flex items-center gap-2"
                  >
                    <Edit className="h-4 w-4 text-brand-500" /> Start Consultation / Notes
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------
// PAGE COMPONENT 6: Appointment Detail Page (AI summaries & Consultation Complete Form)
// ----------------------------------------------------
function AppointmentDetailPage({ apptId, apiCall, setCurrentPage, user, simpleMode, zoomClass }) {
  const [appt, setAppt] = useState(null);
  const [loading, setLoading] = useState(true);

  // Notes Form State
  const [doctorNotes, setDoctorNotes] = useState('');
  const [prescription, setPrescription] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [postVisitData, setPostVisitData] = useState(null);

  useEffect(() => {
    loadDetails();
  }, [apptId]);

  const loadDetails = async () => {
    setLoading(true);
    try {
      const data = await apiCall(`/doctor/appointments/${apptId}`).catch(() => 
        apiCall(`/patient/appointments/${apptId}`)
      );
      setAppt(data);
      setDoctorNotes(data.doctorNotes || '');
      setPrescription(data.prescription || '');

      if (data.status === 'COMPLETED' && data.postVisitSummary) {
        setPostVisitData(JSON.parse(data.postVisitSummary));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm("Are you sure you want to cancel this appointment? This will remove all synced calendar events.")) return;
    setLoading(true);
    try {
      await apiCall(`/patient/appointments/${apptId}`, { method: 'DELETE' });
      setCurrentPage('dashboard');
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const saveNotes = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      await apiCall(`/doctor/appointments/${apptId}/notes`, {
        method: 'PUT',
        body: JSON.stringify({ doctorNotes, prescription }),
      });
      alert('Notes saved successfully');
    } catch (err) {
      alert(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const completeAppointment = async () => {
    if (!doctorNotes.trim() || !prescription.trim()) {
      alert("Both clinical notes and medication prescription are required to complete consulting sessions.");
      return;
    }
    
    if (!window.confirm("Mark appointment as completed? This will trigger the Claude AI simplifier and setup reminders.")) return;

    setFormLoading(true);
    try {
      const completed = await apiCall(`/doctor/appointments/${apptId}/complete`, {
        method: 'PUT',
        body: JSON.stringify({ doctorNotes, prescription }),
      });
      setAppt(completed);
      if (completed.postVisitSummary) {
        setPostVisitData(JSON.parse(completed.postVisitSummary));
      }
      alert('Appointment completed successfully. AI summaries generated.');
    } catch (err) {
      alert(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-10 font-bold text-slate-500">
        Loading details...
      </div>
    );
  }

  if (!appt) return <p className="text-red-500 font-bold">Appointment details not found.</p>;

  const preVisitSummary = appt.symptomSummary ? JSON.parse(appt.symptomSummary) : null;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-wrap justify-between items-center gap-4">
        <div>
          <button onClick={() => setCurrentPage('dashboard')} className="text-xs font-bold text-brand-500 hover:underline uppercase tracking-wider mb-1 block">
            &larr; Back to Dashboard
          </button>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Appointment Details</h2>
          <p className="text-sm text-slate-500 mt-1">Visit ID: CC-00{appt.id} | Status: <strong>{appt.status}</strong></p>
        </div>

        {user.role === 'PATIENT' && appt.status !== 'CANCELLED' && appt.status !== 'COMPLETED' && (
          <button 
            onClick={handleCancel}
            className="bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 font-bold px-5 py-2.5 rounded-xl transition min-h-[48px]"
          >
            Cancel Appointment
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Side: General Info & Symptoms */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
            <h3 className="text-xl font-bold text-slate-950 border-b border-slate-100 pb-2">Consultation Schedule</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-400 font-bold">DATE & TIME</p>
                <p className="font-bold text-slate-800">{new Date(appt.slotStart).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-bold">URGENCY STATUS</p>
                <p className="font-bold text-slate-800">{appt.symptomUrgency}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-bold">PATIENT</p>
                <p className="font-bold text-slate-800">{user.role === 'PATIENT' ? appt.patient.user.fullName : appt.patient.user.fullName}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-bold">DOCTOR</p>
                <p className="font-bold text-slate-800">Dr. {user.role === 'DOCTOR' ? appt.doctor.user.fullName : appt.doctor.user.fullName}</p>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <p className="text-xs text-slate-400 font-bold uppercase mb-2">Patient Description of Symptoms ("What's wrong?")</p>
              <p className={`text-slate-800 leading-relaxed font-semibold bg-slate-50 p-4 rounded-xl border border-slate-150 ${zoomClass}`}>
                "{appt.symptomText}"
              </p>
            </div>
          </div>

          {/* AI Pre-visit summary (Claude output) */}
          {preVisitSummary && (
            <div className="bg-gradient-to-br from-brand-50/50 to-slate-50 p-6 rounded-3xl border border-brand-100 shadow-sm space-y-4">
              <h3 className="text-xl font-bold text-slate-950 flex items-center gap-2">
                <Shield className="h-6 w-6 text-brand-500 animate-pulse" />
                AI Pre-Visit Symptom Analysis (Claude 3.5)
              </h3>

              <div className="space-y-3">
                <div>
                  <p className="text-xs text-slate-500 font-bold uppercase">Chief Complaint</p>
                  <p className="text-slate-800 font-bold">{preVisitSummary.chiefComplaint}</p>
                </div>

                <div>
                  <p className="text-xs text-slate-500 font-bold uppercase mb-2">Suggested Consultation Questions</p>
                  <ul className="list-disc pl-5 space-y-1 text-slate-700">
                    {preVisitSummary.suggestedQuestions && preVisitSummary.suggestedQuestions.map((q, idx) => (
                      <li key={idx} className="font-medium">{q}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Completed consultation details (Patient View) */}
          {appt.status === 'COMPLETED' && postVisitData && (
            <div className="bg-emerald-50/20 p-6 rounded-3xl border border-emerald-100 shadow-sm space-y-6">
              <h3 className="text-xl font-bold text-emerald-800 flex items-center gap-2 border-b border-emerald-100 pb-3">
                <CheckCircle className="h-6 w-6 text-emerald-600" />
                Visit Summary & Treatment Plan
              </h3>

              <div className="space-y-3">
                <p className="text-xs text-emerald-700 font-bold uppercase">Patient-Friendly Summary</p>
                <p className={`text-slate-800 leading-relaxed font-bold bg-white p-4 rounded-xl border border-emerald-100 ${zoomClass}`}>
                  {postVisitData.summary}
                </p>
              </div>

              {postVisitData.medicationSchedule && postVisitData.medicationSchedule.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs text-emerald-700 font-bold uppercase">Your Prescribed Medicines</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {postVisitData.medicationSchedule.map((med, idx) => (
                      <div key={idx} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm space-y-1">
                        <p className="font-black text-slate-900 flex items-center gap-2">
                          <Pill className="h-5 w-5 text-emerald-500 shrink-0" />
                          {med.name}
                        </p>
                        <p className="text-sm font-semibold text-slate-700">Dosage: {med.dosage}</p>
                        <p className="text-sm text-slate-500">Timing: {med.timing}</p>
                        <p className="text-xs italic text-slate-500">{med.instructions}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {postVisitData.followUpSteps && postVisitData.followUpSteps.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-emerald-700 font-bold uppercase">Follow-up Steps</p>
                  <ul className="list-decimal pl-5 text-slate-700 space-y-1">
                    {postVisitData.followUpSteps.map((step, idx) => (
                      <li key={idx} className="font-semibold text-slate-800">{step}</li>
                    ))}
                  </ul>
                </div>
              )}

              {postVisitData.followUpDate && (
                <div className="p-3 bg-white rounded-xl border border-slate-100 inline-block">
                  <p className="text-xs text-slate-400 font-bold">RECOMMENDED FOLLOW-UP DATE</p>
                  <p className="font-bold text-brand-600">{new Date(postVisitData.followUpDate).toDateString()}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Doctor Notes Writing Panel */}
        {user.role === 'DOCTOR' && (
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm h-fit">
            <h3 className="text-xl font-bold text-slate-950 border-b border-slate-100 pb-2 mb-4">Consultation Form</h3>
            
            {appt.status === 'COMPLETED' ? (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl text-sm font-bold flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
                  <span>Consultation Session is Completed. Details locked.</span>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-bold uppercase">Your Clinical Notes</p>
                  <p className="text-slate-800 mt-1 font-medium bg-slate-50 p-3 rounded-lg border">{appt.doctorNotes}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-bold uppercase">Prescription</p>
                  <p className="text-slate-800 mt-1 font-medium bg-slate-50 p-3 rounded-lg border">{appt.prescription}</p>
                </div>
              </div>
            ) : (
              <form onSubmit={saveNotes} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2" htmlFor="doc-notes">
                    Clinical Notes (Internal Only)
                  </label>
                  <textarea
                    id="doc-notes"
                    value={doctorNotes}
                    onChange={(e) => setDoctorNotes(e.target.value)}
                    rows={4}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="Enter diagnostic assessments, symptom evaluations, general clinical notes..."
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2" htmlFor="doc-rx">
                    Prescriptions & Dosages
                  </label>
                  <textarea
                    id="doc-rx"
                    value={prescription}
                    onChange={(e) => setPrescription(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="e.g. Amoxicillin 500mg, 3 times a day for 7 days"
                    required
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={formLoading}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-750 font-bold py-3 rounded-xl transition min-h-[48px]"
                  >
                    Save Draft
                  </button>
                  <button
                    type="button"
                    onClick={completeAppointment}
                    disabled={formLoading}
                    className="flex-1 bg-brand-500 hover:bg-brand-600 text-white font-bold py-3 rounded-xl transition min-h-[48px]"
                  >
                    {formLoading ? "Saving..." : "Complete Consultation"}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------
// PAGE COMPONENT 7: Book Appointment Flow (4 Steps)
// ----------------------------------------------------
function BookAppointmentFlow({ apiCall, setCurrentPage, patientUser, zoomClass, simpleMode, setLoading, setLoadingText, setErrorMsg }) {
  const [step, setStep] = useState(1);
  const [specialisation, setSpecialisation] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Lists
  const [doctors, setDoctors] = useState([]);
  const [slots, setSlots] = useState([]);
  
  // Selected values
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  
  // Hold & timer
  const [holdInfo, setHoldInfo] = useState(null);
  const [holdTimer, setHoldTimer] = useState(0); // in seconds
  const timerRef = useRef(null);

  // Symptoms
  const [symptomText, setSymptomText] = useState('');
  
  // Confirmed details
  const [bookedAppt, setBookedAppt] = useState(null);

  useEffect(() => {
    loadDoctors();
  }, [specialisation]);

  useEffect(() => {
    if (selectedDoctor && date) {
      loadSlots();
    }
  }, [selectedDoctor, date]);

  // Handle slot hold countdown timer
  useEffect(() => {
    if (holdTimer > 0) {
      timerRef.current = setInterval(() => {
        setHoldTimer((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            setHoldInfo(null);
            setSelectedSlot(null);
            alert("Your 5-minute slot hold has expired. Please select a time slot again.");
            setStep(2); // Kick back to slots picking screen
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [holdTimer]);

  const loadDoctors = async () => {
    try {
      const data = await apiCall(`/patient/doctors?specialisation=${specialisation}`);
      setDoctors(data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadSlots = async () => {
    if (!selectedDoctor) return;
    try {
      const data = await apiCall(`/patient/doctors/${selectedDoctor.id}/slots?date=${date}`);
      setSlots(data);
    } catch (err) {
      console.error(err);
    }
  };

  // Step 2 Action: Select slot and trigger POST /api/patient/slots/hold
  const handleSelectSlot = async (slot) => {
    try {
      const res = await apiCall('/patient/slots/hold', {
        method: 'POST',
        body: JSON.stringify({ doctorId: selectedDoctor.id, slotStart: slot.start }),
      });
      
      const newHold = res.hold;
      setHoldInfo(newHold);
      setSelectedSlot(slot);
      
      // Calculate remaining seconds
      const expiry = new Date(newHold.expiresAt);
      const remainingSec = Math.floor((expiry.getTime() - Date.now()) / 1000);
      setHoldTimer(remainingSec > 0 ? remainingSec : 300);

      // Advance to symptoms screen
      setStep(3);
    } catch (err) {
      alert(err.message);
    }
  };

  // Release hold manually if they click back
  const releaseHold = async () => {
    if (!holdInfo) return;
    clearInterval(timerRef.current);
    try {
      await apiCall('/patient/slots/hold', {
        method: 'DELETE',
        body: JSON.stringify({ doctorId: selectedDoctor.id, slotStart: selectedSlot.start }),
      });
    } catch (err) {
      console.error(err);
    } finally {
      setHoldInfo(null);
      setHoldTimer(0);
      setSelectedSlot(null);
    }
  };

  // Step 3 Action: Submit Booking (POST /api/patient/appointments)
  const handleSubmitBooking = async (e) => {
    e.preventDefault();
    if (!symptomText.trim()) return;

    setLoading(true);
    setLoadingText("Booking your appointment...");
    
    // Stop local countdown timer
    clearInterval(timerRef.current);

    try {
      const appt = await apiCall('/patient/appointments', {
        method: 'POST',
        body: JSON.stringify({
          doctorId: selectedDoctor.id,
          slotStart: selectedSlot.start,
          symptomText,
        }),
      });

      setBookedAppt(appt);
      setHoldInfo(null);
      setHoldTimer(0);
      
      // Advance to step 4 confirmation screen
      setStep(4);
    } catch (err) {
      setErrorMsg(err.message);
      // Kick back to slot selection in case hold expired or double booking hit
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  // Format timer seconds into MM:SS
  const formatTimer = (totalSeconds) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-100 max-w-3xl mx-auto space-y-6">
      {/* Wizard Steps Header */}
      <div className="flex justify-between items-center border-b border-slate-100 pb-5">
        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Book an Appointment</h2>
        <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
          <span className={`px-2 py-1 rounded-md ${step === 1 ? 'bg-brand-500 text-white' : 'bg-slate-100'}`}>1. Find Doctor</span>
          <ChevronRight className="h-4 w-4" />
          <span className={`px-2 py-1 rounded-md ${step === 2 ? 'bg-brand-500 text-white' : 'bg-slate-100'}`}>2. Select Time</span>
          <ChevronRight className="h-4 w-4" />
          <span className={`px-2 py-1 rounded-md ${step === 3 ? 'bg-brand-500 text-white' : 'bg-slate-100'}`}>3. Symptoms</span>
          <ChevronRight className="h-4 w-4" />
          <span className={`px-2 py-1 rounded-md ${step === 4 ? 'bg-brand-500 text-white' : 'bg-slate-100'}`}>4. Confirm</span>
        </div>
      </div>

      {/* STEP 1: Search Specialties & Pick Doctor */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="space-y-3">
            <label className="block text-sm font-bold text-slate-700" htmlFor="specialty-select">What kind of doctor do you need?</label>
            <div className="relative">
              <Search className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
              <select
                id="specialty-select"
                value={specialisation}
                onChange={(e) => setSpecialisation(e.target.value)}
                className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 min-h-[48px] appearance-none bg-white font-semibold"
              >
                <option value="">All Specialties (Show all available doctors)</option>
                <option value="General Physician">General Physician</option>
                <option value="Cardiologist">Cardiologist</option>
                <option value="Paediatrician">Paediatrician</option>
                <option value="Neurologist">Neurologist</option>
                <option value="Dermatologist">Dermatologist</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {doctors.map((doc) => (
              <div 
                key={doc.id}
                className="p-5 border border-slate-100 bg-slate-50/50 rounded-2xl flex flex-col justify-between gap-4 transition hover:border-brand-200"
              >
                <div>
                  <h3 className="font-black text-slate-900 text-lg">Dr. {doc.fullName}</h3>
                  <span className="inline-block bg-brand-50 text-brand-700 border border-brand-100 text-xs font-bold px-2 py-1 rounded mt-1">{doc.doctorProfile.specialisation}</span>
                  <p className="text-slate-500 text-sm mt-3 line-clamp-3">{doc.doctorProfile.bio}</p>
                </div>
                
                <button
                  onClick={() => {
                    setSelectedDoctor(doc);
                    setStep(2);
                  }}
                  className="w-full bg-brand-500 hover:bg-brand-600 text-white font-bold py-2.5 px-4 rounded-xl transition min-h-[48px] flex items-center justify-center gap-1"
                >
                  View Available Slots &rarr;
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* STEP 2: Pick Date & Choose Available Time Slot */}
      {step === 2 && selectedDoctor && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <button 
              onClick={() => {
                setSelectedDoctor(null);
                setStep(1);
              }}
              className="text-brand-500 font-bold hover:underline"
            >
              &larr; Back to Doctor List
            </button>
            <span className="font-bold text-slate-800">Booking with Dr. {selectedDoctor.fullName}</span>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-bold text-slate-700" htmlFor="booking-date">Choose Date</label>
            <input 
              id="booking-date"
              type="date"
              value={date}
              min={new Date().toISOString().split('T')[0]}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 min-h-[48px] font-semibold"
            />
          </div>

          <div className="space-y-3">
            <p className="text-sm font-bold text-slate-700">Available Slots</p>
            {slots.length === 0 ? (
              <p className="text-slate-500 italic p-4 bg-slate-50 rounded-xl border border-dashed text-center">No hours available on this date or doctor is on leave.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {slots.map((slot, idx) => {
                  const isAvailable = slot.status === 'AVAILABLE';
                  return (
                    <button
                      key={idx}
                      disabled={!isAvailable}
                      onClick={() => handleSelectSlot(slot)}
                      className={`p-3 border rounded-xl font-bold min-h-[48px] transition ${isAvailable ? 'bg-slate-50 text-slate-800 hover:bg-brand-50 hover:border-brand-500' : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'}`}
                    >
                      {new Date(slot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 3: Write Symptoms (Symptom Form) & Countdown Timer */}
      {step === 3 && selectedDoctor && selectedSlot && (
        <form onSubmit={handleSubmitBooking} className="space-y-6">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Clock className="h-6 w-6 text-amber-500 shrink-0 animate-pulse" />
              <div>
                <p className="font-black text-slate-900">Holding slot for you</p>
                <p className="text-xs text-slate-500">We reserve this time for you while completing symptoms. Do not close this window.</p>
              </div>
            </div>
            <span className="text-xl font-black text-amber-600 bg-white border border-amber-200 rounded-xl px-4 py-2 shrink-0">{formatTimer(holdTimer)}</span>
          </div>

          <div>
            <p className="text-sm font-bold text-slate-500">APPOINTMENT SUMMARY</p>
            <p className="font-black text-slate-900 text-lg">Dr. {selectedDoctor.fullName} ({selectedDoctor.doctorProfile.specialisation})</p>
            <p className="font-bold text-slate-700">{new Date(selectedSlot.start).toLocaleString()}</p>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-bold text-slate-850" htmlFor="symptom-input">
              What's wrong? (Describe symptoms simply)
            </label>
            <textarea
              id="symptom-input"
              value={symptomText}
              onChange={(e) => setSymptomText(e.target.value)}
              rows={4}
              required
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Tell the doctor how you feel, where it hurts, and when it started..."
            />
          </div>

          <div className="flex gap-4 pt-2">
            <button
              type="button"
              onClick={async () => {
                await releaseHold();
                setStep(2);
              }}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-6 rounded-xl transition min-h-[48px]"
            >
              Change Date/Time
            </button>
            <button
              type="submit"
              className="flex-1 bg-brand-500 hover:bg-brand-600 text-white font-bold py-3 px-6 rounded-xl transition min-h-[48px] shadow-lg shadow-brand-500/10"
            >
              Book Appointment
            </button>
          </div>
        </form>
      )}

      {/* STEP 4: Booking Confirmation Screen */}
      {step === 4 && bookedAppt && (
        <div className="text-center py-8 space-y-6">
          <div className="bg-emerald-100 text-emerald-800 p-4 rounded-full w-20 h-20 mx-auto flex items-center justify-center border-4 border-emerald-50">
            <CheckCircle className="h-10 w-10" />
          </div>

          <div className="space-y-2">
            <h3 className="text-3xl font-black text-slate-900 tracking-tight">Booking Confirmed!</h3>
            <p className="text-slate-500 font-medium">Your visit has been successfully registered with CareConnect.</p>
          </div>

          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 max-w-md mx-auto text-left space-y-3 font-semibold text-slate-800">
            <div className="flex justify-between border-b pb-2">
              <span className="text-slate-400 text-xs">DOCTOR</span>
              <span>Dr. {selectedDoctor.fullName}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-slate-400 text-xs">DATE & TIME</span>
              <span>{new Date(bookedAppt.slotStart).toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-b pb-2 text-emerald-600">
              <span className="text-slate-400 text-xs">EMAIL</span>
              <span>Confirmation sent</span>
            </div>
            <div className="flex justify-between text-brand-600">
              <span className="text-slate-400 text-xs">CALENDAR</span>
              <span>Added to Google Calendar</span>
            </div>
          </div>

          <div className="pt-4">
            <button
              onClick={() => setCurrentPage('dashboard')}
              className="bg-brand-500 hover:bg-brand-600 text-white font-bold px-8 py-3.5 rounded-xl transition min-h-[48px] shadow-md"
            >
              Go to Portal Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------
// PAGE COMPONENT 8: Medication Reminders Tracker
// ----------------------------------------------------
function MedicationTracker({ apiCall, zoomClass, simpleMode }) {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReminders();
  }, []);

  const loadReminders = async () => {
    try {
      const data = await apiCall('/patient/medications');
      setReminders(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-100 max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-3xl font-black text-slate-900 tracking-tight">Your Medicines</h2>
        <p className="text-slate-500">Track and take your prescriptions as ordered by your doctor.</p>
      </div>

      {loading ? (
        <div className="text-center py-8 text-slate-500 font-bold">Loading reminders...</div>
      ) : reminders.length === 0 ? (
        <p className="text-slate-500 italic p-6 bg-slate-50 rounded-xl border border-dashed text-center">No active medication schedules at this time.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reminders.map((rem) => (
            <div key={rem.id} className="p-5 border border-slate-100 bg-slate-50/50 rounded-2xl space-y-3">
              <div className="flex items-center gap-3 border-b pb-2">
                <div className="bg-emerald-100 p-2 rounded-xl text-emerald-600">
                  <Pill className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-black text-slate-950 text-lg">{rem.medicationName}</h3>
                  <p className="text-xs text-slate-500 font-bold uppercase">Dr. {rem.appointment.doctor.user.fullName}</p>
                </div>
              </div>

              <div className={`space-y-2 text-slate-700 font-semibold ${zoomClass}`}>
                <p>Dosage: <strong className="text-slate-900">{rem.dosage}</strong></p>
                <p>Take <strong className="text-slate-900">{rem.frequencyPerDay} times</strong> every day.</p>
                <p className="text-sm">Active for: {rem.durationDays} Days (Started {new Date(rem.startDate).toLocaleDateString()})</p>
                
                <div className="bg-brand-50 border border-brand-100 p-2.5 rounded-xl text-brand-700 text-xs flex items-center gap-2 mt-3">
                  <Info className="h-4 w-4 text-brand-500 shrink-0" />
                  <span>Next alert scheduled: {new Date(rem.nextReminderAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------
// PAGE COMPONENT 9: Admin Doctor Manager (CRUD & Working Hours)
// ----------------------------------------------------
function AdminDoctorManager({ apiCall }) {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [editingId, setEditingId] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [specialisation, setSpecialisation] = useState('General Physician');
  const [slotDurationMin, setSlotDurationMin] = useState(30);
  const [bio, setBio] = useState('');
  const [showForm, setShowForm] = useState(false);

  // Working Hours panel
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [whMon, setWhMon] = useState(true);
  const [whTue, setWhTue] = useState(true);
  const [whWed, setWhWed] = useState(true);
  const [whThu, setWhThu] = useState(true);
  const [whFri, setWhFri] = useState(true);
  const [whStart, setWhStart] = useState('09:00');
  const [whEnd, setWhEnd] = useState('17:00');

  useEffect(() => {
    loadDoctors();
  }, []);

  const loadDoctors = async () => {
    try {
      const data = await apiCall('/admin/doctors');
      setDoctors(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrUpdate = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await apiCall(`/admin/doctors/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify({ fullName, phone, specialisation, slotDurationMin, bio }),
        });
        alert('Doctor updated successfully');
      } else {
        await apiCall('/admin/doctors', {
          method: 'POST',
          body: JSON.stringify({ email, password, fullName, phone, specialisation, slotDurationMin, bio }),
        });
        alert('Doctor created successfully');
      }
      resetForm();
      loadDoctors();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this doctor profile?")) return;
    try {
      await apiCall(`/admin/doctors/${id}`, { method: 'DELETE' });
      loadDoctors();
    } catch (err) {
      alert(err.message);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setEmail('');
    setPassword('');
    setFullName('');
    setPhone('');
    setSpecialisation('General Physician');
    setSlotDurationMin(30);
    setBio('');
    setShowForm(false);
  };

  const openEdit = (doc) => {
    setEditingId(doc.id);
    setEmail(doc.email);
    setPassword('locked'); // not editing password here
    setFullName(doc.fullName);
    setPhone(doc.phone);
    setSpecialisation(doc.doctorProfile.specialisation);
    setSlotDurationMin(doc.doctorProfile.slotDurationMin);
    setBio(doc.doctorProfile.bio);
    setShowForm(true);
  };

  const saveWorkingHours = async () => {
    const hours = [];
    const days = [
      { active: whMon, val: 1 },
      { active: whTue, val: 2 },
      { active: whWed, val: 3 },
      { active: whThu, val: 4 },
      { active: whFri, val: 5 },
    ];
    
    days.forEach(d => {
      if (d.active) {
        hours.push({ dayOfWeek: d.val, startTime: whStart, endTime: whEnd });
      }
    });

    try {
      await apiCall(`/admin/doctors/${selectedDocId}/working-hours`, {
        method: 'POST',
        body: JSON.stringify({ workingHours: hours }),
      });
      alert('Working hours saved successfully');
      setSelectedDocId(null);
      loadDoctors();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Manage Doctors</h2>
          <p className="text-slate-500">Create, edit profiles, and configure slots and default working hours.</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="bg-brand-500 text-white hover:bg-brand-600 px-5 py-3 rounded-xl font-bold transition min-h-[48px] flex items-center gap-2"
        >
          <Plus className="h-5 w-5" /> Add Doctor
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreateOrUpdate} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-md space-y-4 max-w-xl mx-auto">
          <h3 className="text-lg font-bold text-slate-900">{editingId ? 'Edit Doctor Profile' : 'Create New Doctor'}</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1" htmlFor="doc-fullname">Full Name</label>
              <input id="doc-fullname" type="text" value={fullName} onChange={e => setFullName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm min-h-[44px]" required />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1" htmlFor="doc-phone">Phone</label>
              <input id="doc-phone" type="text" value={phone} onChange={e => setPhone(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm min-h-[44px]" required />
            </div>
          </div>

          {!editingId && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1" htmlFor="doc-email">Email</label>
                <input id="doc-email" type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm min-h-[44px]" required />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1" htmlFor="doc-password">Password</label>
                <input id="doc-password" type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm min-h-[44px]" required />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1" htmlFor="doc-specialty">Specialty</label>
              <select id="doc-specialty" value={specialisation} onChange={e => setSpecialisation(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm min-h-[44px]">
                <option value="General Physician">General Physician</option>
                <option value="Cardiologist">Cardiologist</option>
                <option value="Paediatrician">Paediatrician</option>
                <option value="Neurologist">Neurologist</option>
                <option value="Dermatologist">Dermatologist</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1" htmlFor="doc-duration">Slot Duration (Min)</label>
              <input id="doc-duration" type="number" value={slotDurationMin} onChange={e => setSlotDurationMin(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm min-h-[44px]" required />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1" htmlFor="doc-bio-input">Biography</label>
            <textarea id="doc-bio-input" value={bio} onChange={e => setBio(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={resetForm} className="flex-1 bg-slate-100 py-2 rounded-lg font-bold min-h-[44px]">Cancel</button>
            <button type="submit" className="flex-1 bg-brand-500 text-white py-2 rounded-lg font-bold min-h-[44px] hover:bg-brand-600">Save Doctor</button>
          </div>
        </form>
      )}

      {selectedDocId && (
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-md space-y-4 max-w-xl mx-auto">
          <h3 className="text-lg font-bold text-slate-900">Configure Doctor Working Hours</h3>
          <div className="flex flex-wrap gap-4 justify-between">
            <label className="flex items-center gap-2"><input type="checkbox" checked={whMon} onChange={e => setWhMon(e.target.checked)} /> Mon</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={whTue} onChange={e => setWhTue(e.target.checked)} /> Tue</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={whWed} onChange={e => setWhWed(e.target.checked)} /> Wed</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={whThu} onChange={e => setWhThu(e.target.checked)} /> Thu</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={whFri} onChange={e => setWhFri(e.target.checked)} /> Fri</label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1" htmlFor="wh-start">Start Time</label>
              <input id="wh-start" type="text" value={whStart} onChange={e => setWhStart(e.target.value)} placeholder="09:00" className="w-full border rounded-lg px-3 py-2 text-sm min-h-[44px]" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1" htmlFor="wh-end">End Time</label>
              <input id="wh-end" type="text" value={whEnd} onChange={e => setWhEnd(e.target.value)} placeholder="17:00" className="w-full border rounded-lg px-3 py-2 text-sm min-h-[44px]" />
            </div>
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={() => setSelectedDocId(null)} className="flex-1 bg-slate-100 py-2 rounded-lg font-bold min-h-[44px]">Cancel</button>
            <button type="button" onClick={saveWorkingHours} className="flex-1 bg-brand-500 text-white py-2 rounded-lg font-bold min-h-[44px]">Save Hours</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-center text-slate-500">Loading doctor records...</p>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase">
                <th className="p-4">Name</th>
                <th className="p-4">Specialty</th>
                <th className="p-4">Phone</th>
                <th className="p-4">Slot</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {doctors.map(doc => (
                <tr key={doc.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="p-4 font-bold">{doc.fullName}</td>
                  <td className="p-4">{doc.doctorProfile.specialisation}</td>
                  <td className="p-4 text-sm font-semibold">{doc.phone}</td>
                  <td className="p-4 text-sm font-semibold">{doc.doctorProfile.slotDurationMin}m</td>
                  <td className="p-4 flex items-center gap-2 flex-wrap">
                    <button onClick={() => openEdit(doc)} className="bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 min-h-[36px]"><Edit className="h-3.5 w-3.5" /> Edit</button>
                    <button onClick={() => setSelectedDocId(doc.id)} className="bg-brand-50 text-brand-600 hover:bg-brand-100 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 min-h-[36px]"><Clock className="h-3.5 w-3.5" /> Hours</button>
                    <button onClick={() => handleDelete(doc.id)} className="bg-red-50 text-red-650 hover:bg-red-100 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 min-h-[36px]"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------
// PAGE COMPONENT 10: Admin Leave Manager (Doctor Leaves & Auto Conflicts Reschedule)
// ----------------------------------------------------
function AdminLeaveManager({ apiCall }) {
  const [doctors, setDoctors] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState('');
  const [leaveDate, setLeaveDate] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadDoctors();
  }, []);

  const loadDoctors = async () => {
    try {
      const data = await apiCall('/admin/doctors');
      setDoctors(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkLeave = async (e) => {
    e.preventDefault();
    if (!selectedDocId || !leaveDate) return;

    setLoading(true);
    try {
      const res = await apiCall(`/admin/doctors/${selectedDocId}/leave`, {
        method: 'POST',
        body: JSON.stringify({ date: leaveDate }),
      });
      alert(`Success! ${res.message}. Total rescheduled visits: ${res.affectedPatientsCount}`);
      setLeaveDate('');
      loadDoctors(); // Reload to update leaves list
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelLeave = async (docId, dateStr) => {
    if (!window.confirm("Cancel this scheduled leave day?")) return;
    try {
      await apiCall(`/admin/doctors/${docId}/leave`, {
        method: 'DELETE',
        body: JSON.stringify({ date: dateStr }),
      });
      alert('Leave day cancelled.');
      loadDoctors();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <h2 className="text-3xl font-black text-slate-900 tracking-tight">Leave Manager</h2>
        <p className="text-slate-500">Schedule leaves for doctors. CareConnect will automatically identify schedule conflicts, notify patients, cancel Google Calendar holds, and set them to Reschedule Needed.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Form to Mark Leave */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm h-fit">
          <h3 className="text-xl font-bold text-slate-950 border-b pb-3 mb-4">Mark Leave Day</h3>
          
          <form onSubmit={handleMarkLeave} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2" htmlFor="leave-doc">Select Doctor</label>
              <select
                id="leave-doc"
                value={selectedDocId}
                onChange={e => setSelectedDocId(e.target.value)}
                className="w-full border rounded-xl px-4 py-3 text-sm min-h-[48px] font-semibold bg-white"
                required
              >
                <option value="">Choose a doctor...</option>
                {doctors.map(doc => (
                  <option key={doc.id} value={doc.id}>Dr. {doc.fullName} ({doc.doctorProfile.specialisation})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2" htmlFor="leave-date-input">Leave Date</label>
              <input
                id="leave-date-input"
                type="date"
                value={leaveDate}
                onChange={e => setLeaveDate(e.target.value)}
                className="w-full border rounded-xl px-4 py-3 text-sm min-h-[48px] font-semibold bg-white"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-500 hover:bg-brand-600 text-white font-bold py-3 rounded-xl transition min-h-[48px] shadow-md shadow-brand-500/10 flex items-center justify-center gap-2"
            >
              {loading ? "Processing conflict logs..." : "Apply Leave & Resolve Conflicts"}
            </button>
          </form>
        </div>

        {/* Existing Leaves List */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <h3 className="text-xl font-bold text-slate-950 border-b pb-3 mb-4">Scheduled Doctor Leaves</h3>
          
          <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
            {doctors.every(doc => !doc.doctorProfile.leaveDays || doc.doctorProfile.leaveDays.length === 0) ? (
              <p className="text-slate-500 italic text-center py-6">No scheduled leaves on record.</p>
            ) : (
              doctors.map(doc => 
                doc.doctorProfile.leaveDays && doc.doctorProfile.leaveDays.map((ld, idx) => (
                  <div key={`${doc.id}-${idx}`} className="p-3 bg-slate-50 border rounded-xl flex justify-between items-center gap-4">
                    <div>
                      <p className="font-bold text-slate-900 text-sm">Dr. {doc.fullName}</p>
                      <p className="text-xs font-semibold text-slate-500">Date: {new Date(ld.date).toDateString()}</p>
                    </div>
                    <button
                      onClick={() => handleCancelLeave(doc.id, ld.date)}
                      className="bg-red-50 text-red-650 hover:bg-red-100 p-2 rounded-lg text-xs font-bold min-h-[36px]"
                    >
                      Cancel Leave
                    </button>
                  </div>
                ))
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// PAGE COMPONENT 11: Admin Stats & Appointments list (Used as admin home page)
// ----------------------------------------------------
function AdminDashboard({ apiCall, setCurrentPage, simpleMode }) {
  const [stats, setStats] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const dashboardStats = await apiCall('/admin/stats');
      setStats(dashboardStats);

      const appts = await apiCall('/admin/appointments');
      setAppointments(appts);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <h2 className="text-3xl font-black text-slate-900 tracking-tight">Admin System Panel</h2>
        <p className="text-slate-500">Overview of the entire CareConnect instance, including stats, doctor working profiles, and schedule items.</p>
      </div>

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <p className="text-sm font-bold text-slate-500">Active Doctors</p>
            <p className="text-3xl font-black text-slate-950 mt-1">{stats.totalDoctors}</p>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <p className="text-sm font-bold text-slate-500">Registered Patients</p>
            <p className="text-3xl font-black text-slate-950 mt-1">{stats.totalPatients}</p>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <p className="text-sm font-bold text-slate-500">Total Visits Booked</p>
            <p className="text-3xl font-black text-slate-950 mt-1">{stats.totalAppointments}</p>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <p className="text-sm font-bold text-slate-500">Urgency: High / Med</p>
            <p className="text-3xl font-black text-red-600 mt-1">{stats.urgency.High} <span className="text-slate-350 text-xl">/ {stats.urgency.Medium}</span></p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-100">
        <h3 className="text-xl font-bold text-slate-950 mb-4 border-b pb-3">System-wide Bookings Log</h3>
        
        {loading ? (
          <p className="text-center text-slate-500 py-6">Loading log data...</p>
        ) : appointments.length === 0 ? (
          <p className="text-center text-slate-500 py-6">No scheduled visits exist in the database.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase">
                  <th className="p-3">Visit ID</th>
                  <th className="p-3">Patient</th>
                  <th className="p-3">Doctor</th>
                  <th className="p-3">Schedule</th>
                  <th className="p-3">Urgency</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map(appt => (
                  <tr key={appt.id} className="border-b border-slate-50 hover:bg-slate-50/50 text-sm">
                    <td className="p-3 font-semibold text-slate-500">CC-00{appt.id}</td>
                    <td className="p-3 font-bold">{appt.patient.user.fullName}</td>
                    <td className="p-3">Dr. {appt.doctor.user.fullName}</td>
                    <td className="p-3 font-semibold">{new Date(appt.slotStart).toLocaleString()}</td>
                    <td className="p-3 font-bold">{appt.symptomUrgency}</td>
                    <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs font-bold ${appt.status === 'COMPLETED' ? 'bg-slate-100 text-slate-700' : appt.status === 'CANCELLED' ? 'bg-red-50 text-red-650' : 'bg-brand-50 text-brand-700'}`}>{appt.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
