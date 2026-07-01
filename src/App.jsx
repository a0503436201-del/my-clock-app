import React, { useState, useEffect, useMemo } from 'react';
import { 
  Clock, 
  History, 
  Settings as SettingsIcon, 
  Calculator, 
  Play, 
  Square, 
  Trash2, 
  Edit, 
  Plus,
  Save,
  X,
  AlertCircle,
  Briefcase,
  ChevronRight,
  CheckCircle2
} from 'lucide-react';
import { signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

// ==========================================
// Firebase Setup - מיובא מהקובץ שיצרנו
// ==========================================
import { auth, db } from './firebase';

// מזהה קבוע לפרויקט שלך עבור מסד הנתונים
const appId = 'myclockapp-main';

// --- Constants ---
const DAYS_OF_WEEK = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const DEFAULT_RATES = { 0: 35, 1: 35, 2: 35, 3: 35, 4: 35, 5: 52.5, 6: 70 }; 
const DEFAULT_CREDIT_POINTS = 2.25;

// --- Time Helpers ---
const formatTime = (timestamp) => {
  if (!timestamp) return '--:--';
  return new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
};

const formatDate = (timestamp) => {
  if (!timestamp) return '--/--/----';
  return new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(timestamp));
};

const getMonthYear = (timestamp) => {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// --- Tax Calculator ---
const calculateNetSalary = (gross, creditPoints) => {
  if (gross <= 0) return { net: 0, incomeTax: 0, niHealthTax: 0 };
  
  let niHealthTax = 0;
  const lowerBracketLimit = 7522;
  
  if (gross <= lowerBracketLimit) {
    niHealthTax = gross * 0.035; 
  } else {
    niHealthTax = (lowerBracketLimit * 0.035) + ((gross - lowerBracketLimit) * 0.12);
  }

  let incomeTax = 0;
  const brackets = [
    { limit: 7010, rate: 0.10 },
    { limit: 10060, rate: 0.14 },
    { limit: 16150, rate: 0.20 },
    { limit: 22440, rate: 0.31 },
    { limit: 46690, rate: 0.35 },
  ];

  let previousLimit = 0;
  for (const bracket of brackets) {
    if (gross > previousLimit) {
      const taxableAmount = Math.min(gross, bracket.limit) - previousLimit;
      incomeTax += taxableAmount * bracket.rate;
      previousLimit = bracket.limit;
    } else {
      break;
    }
  }
  if (gross > 46690) incomeTax += (gross - 46690) * 0.47;

  const creditDiscount = creditPoints * 242;
  incomeTax = Math.max(0, incomeTax - creditDiscount);

  const net = gross - niHealthTax - incomeTax;
  return { net, incomeTax, niHealthTax };
};

// ==========================================
// Main Application
// ==========================================
export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  
  const [shifts, setShifts] = useState([]);
  const [settings, setSettings] = useState({ rates: DEFAULT_RATES, creditPoints: DEFAULT_CREDIT_POINTS });
  const [currentShift, setCurrentShift] = useState(null);
  const [loading, setLoading] = useState(true);

  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Custom UI States
  const [editingShift, setEditingShift] = useState(null);
  const [isAddingManual, setIsAddingManual] = useState(false);
  const [shiftToDelete, setShiftToDelete] = useState(null); 
  const [toast, setToast] = useState(null); 
  
  const [selectedMonth, setSelectedMonth] = useState(getMonthYear(Date.now()));

  // 1. Auth Init
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth error:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Data Fetching
  useEffect(() => {
    if (!user) return;

    // Settings
    const settingsRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'config');
    const unsubSettings = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        setSettings({ ...settings, ...docSnap.data() });
      }
    }, console.error);

    // Active Shift
    const activeShiftRef = doc(db, 'artifacts', appId, 'users', user.uid, 'activeShift', 'current');
    const unsubActive = onSnapshot(activeShiftRef, (docSnap) => {
      if (docSnap.exists()) {
        setCurrentShift(docSnap.data());
      } else {
        setCurrentShift(null);
      }
    }, console.error);

    // All Shifts
    const shiftsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'shifts');
    const unsubShifts = onSnapshot(shiftsRef, (snapshot) => {
      const shiftsData = [];
      snapshot.forEach((doc) => shiftsData.push({ id: doc.id, ...doc.data() }));
      shiftsData.sort((a, b) => b.startTime - a.startTime);
      setShifts(shiftsData);
      setLoading(false);
    }, console.error);

    return () => { unsubSettings(); unsubActive(); unsubShifts(); };
  }, [user]);

  // Clock tick
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // --- UI Helpers ---
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // --- Actions ---
  const handleClockIn = async () => {
    if (!user) return;
    await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'activeShift', 'current'), { startTime: Date.now() });
    showToast('משמרת התחילה בהצלחה');
  };

  const handleClockOut = async () => {
    if (!user || !currentShift) return;
    await saveCompleteShift(currentShift.startTime, Date.now());
    await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'activeShift', 'current'));
    showToast('משמרת הסתיימה ונשמרה');
  };

  const saveCompleteShift = async (start, end, existingId = null) => {
    const durationHours = (end - start) / (1000 * 60 * 60);
    const dayOfWeek = new Date(start).getDay();
    const hourlyRate = settings.rates[dayOfWeek] || 35;
    const totalGross = durationHours * hourlyRate;

    const shiftData = {
      startTime: start,
      endTime: end,
      durationHours,
      dayOfWeek,
      hourlyRate,
      totalGross,
      monthYear: getMonthYear(start)
    };

    const shiftId = existingId || Date.now().toString();
    await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'shifts', shiftId), shiftData);
  };

  const executeDeleteShift = async () => {
    if (!user || !shiftToDelete) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'shifts', shiftToDelete));
    setShiftToDelete(null);
    showToast('המשמרת נמחקה', 'success');
  };

  const handleSaveSettings = async (newSettings) => {
    if (!user) return;
    await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'config'), newSettings);
    setSettings(newSettings);
    showToast('הגדרות נשמרו בענן');
  };

  // --- Derived State ---
  const elapsedActiveMs = currentShift ? currentTime.getTime() - currentShift.startTime : 0;
  const elapsedHours = Math.floor(elapsedActiveMs / 3600000);
  const elapsedMinutes = Math.floor((elapsedActiveMs % 3600000) / 60000);
  const elapsedSeconds = Math.floor((elapsedActiveMs % 60000) / 1000);

  const monthsAvailable = useMemo(() => {
    const months = new Set(shifts.map(s => s.monthYear));
    months.add(getMonthYear(Date.now()));
    return Array.from(months).sort().reverse();
  }, [shifts]);

  const currentMonthShifts = useMemo(() => shifts.filter(s => s.monthYear === selectedMonth), [shifts, selectedMonth]);

  const monthSalaryStats = useMemo(() => {
    const totalGross = currentMonthShifts.reduce((sum, s) => sum + s.totalGross, 0);
    const totalHours = currentMonthShifts.reduce((sum, s) => sum + s.durationHours, 0);
    const { net, incomeTax, niHealthTax } = calculateNetSalary(totalGross, settings.creditPoints);
    return { totalGross, totalHours, net, incomeTax, niHealthTax };
  }, [currentMonthShifts, settings.creditPoints]);

  // --- Modal Components ---
  const ManualShiftModal = ({ onClose, initialData = null }) => {
    const toLocalISOString = (date) => {
      const tzOffset = (new Date()).getTimezoneOffset() * 60000;
      return new Date(date - tzOffset).toISOString().slice(0, 16);
    };

    const [start, setStart] = useState(initialData ? toLocalISOString(initialData.startTime) : toLocalISOString(Date.now() - 8 * 3600000));
    const [end, setEnd] = useState(initialData ? toLocalISOString(initialData.endTime) : toLocalISOString(Date.now()));
    const [errorMsg, setErrorMsg] = useState('');

    const handleSave = () => {
      const startMs = new Date(start).getTime();
      const endMs = new Date(end).getTime();
      if (endMs <= startMs) {
        setErrorMsg('שעת סיום חייבת להיות אחרי שעת התחלה');
        return;
      }
      saveCompleteShift(startMs, endMs, initialData?.id);
      showToast(initialData ? 'משמרת עודכנה בהצלחה' : 'משמרת חדשה נשמרה');
      onClose();
    };

    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 transition-opacity" dir="rtl">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 transform transition-all">
          <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
            <h3 className="text-xl font-bold text-slate-800">
              {initialData ? 'עריכת משמרת' : 'הוספת משמרת ידנית'}
            </h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 p-2 rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>
          <div className="space-y-5">
            {errorMsg && (
              <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-semibold flex items-center gap-2">
                <AlertCircle size={18} /> {errorMsg}
              </div>
            )}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">שעת התחלה</label>
              <input 
                type="datetime-local" 
                value={start} 
                onChange={(e) => {setStart(e.target.value); setErrorMsg('');}} 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" 
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">שעת סיום</label>
              <input 
                type="datetime-local" 
                value={end} 
                onChange={(e) => {setEnd(e.target.value); setErrorMsg('');}} 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" 
              />
            </div>
            <button onClick={handleSave} className="w-full bg-indigo-600 text-white rounded-xl py-3.5 font-bold mt-4 hover:bg-indigo-700 active:scale-95 transition-all flex justify-center items-center gap-2 shadow-lg shadow-indigo-600/20">
              <Save size={20} /> שמור נתונים
            </button>
          </div>
        </div>
      </div>
    );
  };

  const DeleteConfirmModal = () => (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 text-center transform transition-all">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <Trash2 size={32} />
        </div>
        <h3 className="text-xl font-bold text-slate-800 mb-2">מחיקת משמרת</h3>
        <p className="text-slate-500 font-medium mb-8">האם אתה בטוח שברצונך למחוק משמרת זו? לא ניתן יהיה לשחזר אותה לאחר מכן.</p>
        <div className="flex gap-3">
          <button 
            onClick={() => setShiftToDelete(null)} 
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 rounded-xl transition-colors"
          >
            ביטול
          </button>
          <button 
            onClick={executeDeleteShift} 
            className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-red-500/30 transition-all active:scale-95"
          >
            מחק משמרת
          </button>
        </div>
      </div>
    </div>
  );

  // --- Loading State ---
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50" dir="rtl">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
          <p className="text-slate-500 font-medium animate-pulse">טוען נתונים מהענן...</p>
        </div>
      </div>
    );
  }

  // --- Render ---
  return (
    <div className="flex flex-col h-screen bg-slate-50 max-w-md mx-auto relative overflow-hidden font-sans" dir="rtl">
      
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-20 left-1/2 transform -translate-x-1/2 px-5 py-3 rounded-2xl shadow-xl z-50 font-bold text-white flex items-center gap-2 transition-all fade-in ${toast.type === 'error' ? 'bg-red-500' : 'bg-slate-800'}`}>
          {toast.type !== 'error' && <CheckCircle2 size={20} className="text-emerald-400" />}
          {toast.message}
        </div>
      )}

      {/* Top Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4 flex justify-between items-center z-10 sticky top-0">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 p-2 rounded-lg text-white">
            <Briefcase size={20} />
          </div>
          <h1 className="text-xl font-black text-slate-800 tracking-tight">TimeTracker</h1>
        </div>
        <div className="text-sm font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
          {currentTime.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'short' })}
        </div>
      </header>

      {/* Modals */}
      {(isAddingManual || editingShift) && (
        <ManualShiftModal onClose={() => { setIsAddingManual(false); setEditingShift(null); }} initialData={editingShift} />
      )}
      {shiftToDelete && <DeleteConfirmModal />}

      {/* Main Scrollable Content */}
      <main className="flex-1 overflow-y-auto pb-28 pt-4 px-4 relative scroll-smooth">
        
        {/* --- Dashboard Tab --- */}
        {activeTab === 'dashboard' && (
          <div className="flex flex-col items-center justify-center min-h-full py-8 fade-in">
            <div className="text-center mb-10">
              <p className="text-slate-500 font-medium mb-1">השעה כעת</p>
              <p className="text-5xl font-black text-slate-800 tracking-tighter">{formatTime(currentTime)}</p>
            </div>

            <div className="relative w-full max-w-xs aspect-square mb-10 flex items-center justify-center">
              <div className={`absolute inset-0 rounded-full border-[12px] transition-colors duration-500 ${currentShift ? 'border-indigo-100' : 'border-slate-100'}`}></div>
              {currentShift && (
                <div className="absolute inset-0 rounded-full border-[12px] border-indigo-500 animate-[pulse_2s_cubic-bezier(0.4,0,0.6,1)_infinite] opacity-40"></div>
              )}
              <div className="relative z-10 text-center">
                <p className="text-sm font-bold text-slate-400 mb-2 uppercase tracking-wider">
                  {currentShift ? 'זמן עבודה' : 'לא במשמרת'}
                </p>
                <div className={`text-4xl font-mono font-black ${currentShift ? 'text-indigo-600' : 'text-slate-300'}`}>
                  {String(elapsedHours).padStart(2, '0')}:
                  {String(elapsedMinutes).padStart(2, '0')}:
                  {String(elapsedSeconds).padStart(2, '0')}
                </div>
              </div>
            </div>

            <div className="w-full max-w-xs">
              {currentShift ? (
                <button 
                  onClick={handleClockOut} 
                  className="w-full bg-slate-800 hover:bg-slate-900 text-white rounded-2xl py-5 text-xl font-bold flex justify-center items-center gap-3 active:scale-95 transition-all shadow-xl shadow-slate-900/20"
                >
                  <Square fill="currentColor" size={22} /> סיום משמרת
                </button>
              ) : (
                <button 
                  onClick={handleClockIn} 
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl py-5 text-xl font-bold flex justify-center items-center gap-3 active:scale-95 transition-all shadow-xl shadow-indigo-600/30"
                >
                  <Play fill="currentColor" size={24} /> התחלת משמרת
                </button>
              )}
            </div>
          </div>
        )}

        {/* --- History Tab --- */}
        {activeTab === 'history' && (
          <div className="fade-in space-y-4">
            <div className="flex justify-between items-center bg-white p-2 rounded-2xl shadow-sm border border-slate-100 mb-2">
              <h2 className="text-xl font-bold text-slate-800 px-4">היסטוריית משמרות</h2>
              <button 
                onClick={() => setIsAddingManual(true)} 
                className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 p-3 rounded-xl transition-colors font-semibold flex items-center gap-2 text-sm"
              >
                <Plus size={18} strokeWidth={3} /> הוספה
              </button>
            </div>
            
            {shifts.length === 0 ? (
              <div className="text-center text-slate-500 py-12 flex flex-col items-center">
                <History size={48} className="text-slate-200 mb-4" />
                <p className="font-medium">אין משמרות רשומות עדיין.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {shifts.map(shift => (
                  <div key={shift.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-3 group hover:border-indigo-100 transition-colors">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-slate-800 flex items-center gap-2">
                          {formatDate(shift.startTime)} 
                          <span className="text-xs font-semibold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md">
                            {DAYS_OF_WEEK[shift.dayOfWeek]}
                          </span>
                        </div>
                        <div className="text-slate-500 mt-1.5 flex items-center gap-2 text-sm font-medium">
                          <Clock size={16} className="text-indigo-400" /> 
                          {formatTime(shift.startTime)} <ChevronRight size={14} className="text-slate-300"/> {formatTime(shift.endTime)}
                        </div>
                      </div>
                      <div className="text-left">
                        <div className="text-indigo-600 font-bold text-lg">₪{shift.totalGross.toFixed(0)}</div>
                        <div className="text-slate-400 text-xs font-medium mt-0.5">{shift.durationHours.toFixed(2)} שעות</div>
                      </div>
                    </div>
                    
                    <div className="flex gap-2 pt-3 border-t border-slate-50 mt-1">
                      <button onClick={() => setEditingShift(shift)} className="flex-1 flex justify-center items-center gap-2 py-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg text-sm font-semibold transition-colors">
                        <Edit size={16} /> עריכה
                      </button>
                      <div className="w-px bg-slate-100"></div>
                      <button onClick={() => setShiftToDelete(shift.id)} className="flex-1 flex justify-center items-center gap-2 py-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg text-sm font-semibold transition-colors">
                        <Trash2 size={16} /> מחיקה
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* --- Salary Tab --- */}
        {activeTab === 'salary' && (
          <div className="fade-in space-y-6">
            <div className="flex justify-between items-center bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
              <h2 className="text-xl font-bold text-slate-800 px-4">חישוב שכר</h2>
              <select 
                value={selectedMonth} 
                onChange={(e) => setSelectedMonth(e.target.value)} 
                className="bg-slate-50 border-none text-slate-700 font-semibold rounded-xl px-4 py-3 outline-none cursor-pointer"
              >
                {monthsAvailable.map(m => <option key={m} value={m}>{m.split('-').reverse().join('/')}</option>)}
              </select>
            </div>

            <div className="bg-gradient-to-br from-slate-900 to-indigo-900 rounded-3xl p-7 text-white shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl -mr-10 -mt-10"></div>
              <div className="text-indigo-200 mb-1 font-semibold text-sm tracking-wide">נטו משוער • {selectedMonth.split('-').reverse().join('/')}</div>
              <div className="text-6xl font-black mb-6 tracking-tighter">
                ₪{monthSalaryStats.net.toFixed(0)}
              </div>
              <div className="flex justify-between text-sm border-t border-white/10 pt-5">
                <div>
                  <span className="block text-indigo-300 font-medium mb-1">סך שעות</span>
                  <span className="font-bold text-lg">{monthSalaryStats.totalHours.toFixed(1)}</span>
                </div>
                <div className="text-left">
                  <span className="block text-indigo-300 font-medium mb-1">ברוטו</span>
                  <span className="font-bold text-lg">₪{monthSalaryStats.totalGross.toFixed(0)}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 space-y-4">
              <h3 className="font-bold text-slate-800 text-lg mb-4">פירוט ניכויים</h3>
              <div className="flex justify-between items-center pb-4 border-b border-slate-50">
                <span className="text-slate-600 font-medium">ביטוח לאומי ובריאות</span>
                <span className="text-red-500 font-bold bg-red-50 px-3 py-1 rounded-lg">
                  -₪{monthSalaryStats.niHealthTax.toFixed(0)}
                </span>
              </div>
              <div className="flex justify-between items-center pb-2">
                <span className="text-slate-600 font-medium flex items-center gap-2">
                  מס הכנסה 
                  <span className="text-xs font-bold bg-indigo-50 text-indigo-600 px-2 py-1 rounded-md">
                    {settings.creditPoints} נ.ז
                  </span>
                </span>
                <span className="text-red-500 font-bold bg-red-50 px-3 py-1 rounded-lg">
                  -₪{monthSalaryStats.incomeTax.toFixed(0)}
                </span>
              </div>
              <div className="mt-4 bg-amber-50/50 border border-amber-100 text-amber-800 text-xs p-3.5 rounded-xl flex items-start gap-3 leading-relaxed">
                <AlertCircle size={18} className="shrink-0 text-amber-500" />
                <p>החישוב הינו אומדן המבוסס על מדרגות המס לשנת 2024 ואינו מהווה תחליף לתלוש משכורת רשמי.</p>
              </div>
            </div>
          </div>
        )}

        {/* --- Settings Tab --- */}
        {activeTab === 'settings' && (
          <div className="fade-in space-y-6">
            <h2 className="text-2xl font-bold text-slate-800">הגדרות מתקדמות</h2>
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-5 border-b border-slate-50 bg-slate-50/50">
                <h3 className="font-bold text-slate-800">תעריף שעתי (₪)</h3>
                <p className="text-xs text-slate-500 mt-1">הגדר שכר בסיס שונה לכל יום בשבוע</p>
              </div>
              <div className="p-5 space-y-1">
                {DAYS_OF_WEEK.map((day, index) => (
                  <div key={index} className="flex justify-between items-center py-2 border-b border-slate-50 last:border-0">
                    <span className="font-semibold text-slate-700 w-24">יום {day}</span>
                    <input 
                      type="number" 
                      value={settings.rates[index]}
                      onChange={(e) => setSettings({...settings, rates: {...settings.rates, [index]: Number(e.target.value)}})}
                      className="w-24 bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-center font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
               <div className="p-5 border-b border-slate-50 bg-slate-50/50">
                <h3 className="font-bold text-slate-800">נתוני מס</h3>
              </div>
              <div className="p-5">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-slate-700">נקודות זיכוי</span>
                  <input 
                    type="number" step="0.25" value={settings.creditPoints}
                    onChange={(e) => setSettings({...settings, creditPoints: Number(e.target.value)})}
                    className="w-24 bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-center font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>
              </div>
            </div>
            <button 
              onClick={() => handleSaveSettings(settings)} 
              className="w-full bg-slate-800 text-white rounded-2xl py-4 font-bold flex justify-center items-center gap-2 shadow-lg hover:bg-slate-900 active:scale-95 transition-all"
            >
              <Save size={20} /> שמור הגדרות בענן
            </button>
          </div>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="bg-white/90 backdrop-blur-lg border-t border-slate-200 px-6 py-4 flex justify-between items-center absolute bottom-0 w-full z-40">
        {[
          { id: 'dashboard', icon: <Clock />, label: 'שעון' },
          { id: 'history', icon: <History />, label: 'היסטוריה' },
          { id: 'salary', icon: <Calculator />, label: 'שכר' },
          { id: 'settings', icon: <SettingsIcon />, label: 'הגדרות' }
        ].map(item => {
          const isActive = activeTab === item.id;
          return (
            <button 
              key={item.id} 
              onClick={() => setActiveTab(item.id)} 
              className={`flex flex-col items-center w-16 gap-1.5 transition-all duration-300 ${isActive ? 'text-indigo-600 scale-110' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <div className={`${isActive ? 'bg-indigo-50 p-2 rounded-2xl shadow-sm' : 'p-2'}`}>
                {React.cloneElement(item.icon, { size: 24, strokeWidth: isActive ? 2.5 : 2 })}
              </div>
              <span className={`text-[10px] ${isActive ? 'font-black tracking-wide' : 'font-medium'}`}>{item.label}</span>
            </button>
          )
        })}
      </nav>

      <style dangerouslySetInnerHTML={{__html: `
        .fade-in { animation: fadeIn 0.3s ease-out forwards; }
        @keyframes fadeIn { 
          from { opacity: 0; transform: translateY(10px); } 
          to { opacity: 1; transform: translateY(0); } 
        }
      `}} />
    </div>
  );
}