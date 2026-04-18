import React, { useState, useEffect, createContext, useContext, useCallback, useMemo } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  updateProfile,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  addDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { firebaseConfig } from "./firebaseConfig";
import MeasurementForm from "./components/inches/MeasurementForm";
import InchLossChart from "./components/inches/InchLossChart";
import AnalyticsSummary from "./components/inches/AnalyticsSummary";

let _fb = null;
async function getFirebase() {
  if (_fb) return _fb;
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  _fb = {
    app,
    auth,
    db,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    GoogleAuthProvider,
    signInWithPopup,
    sendPasswordResetEmail,
    updateProfile,
    collection,
    doc,
    setDoc,
    getDoc,
    addDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    onSnapshot,
    serverTimestamp,
  };
  return _fb;
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTH CONTEXT
// ══════════════════════════════════════════════════════════════════════════════
const AuthCtx = createContext(null);
const useAuth = () => useContext(AuthCtx);

function AuthProvider({ children }) {
  const [user,    setUser]  = useState(undefined); // undefined = checking
  const [firebase, setFB]   = useState(null);
  const [fbError, setFbErr] = useState(null);

  useEffect(() => {
    getFirebase()
      .then(fb => {
        setFB(fb);
        return fb.onAuthStateChanged(fb.auth, u => setUser(u || null));
      })
      .catch(e => { setFbErr(e.message); setUser(null); });
  }, []);

  return <AuthCtx.Provider value={{ user, firebase, fbError }}>{children}</AuthCtx.Provider>;
}

// ══════════════════════════════════════════════════════════════════════════════
// FIRESTORE HOOKS
// ══════════════════════════════════════════════════════════════════════════════
function useCollection(col, uid) {
  const [data, setData]   = useState([]);
  const [loading, setLd]  = useState(true);
  const { firebase }      = useAuth();

  useEffect(() => {
    if (!firebase || !uid) { setLd(false); return; }
    const { db, collection, query, where, orderBy, onSnapshot } = firebase;
    const q = query(collection(db, col), where("uid","==",uid), orderBy("date","asc"));
    const unsub = onSnapshot(q,
      snap => { setData(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLd(false); },
      ()   => setLd(false)
    );
    return unsub;
  }, [firebase, uid, col]);

  return { data, loading };
}

function useUserMeasurements(uid) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const { firebase } = useAuth();

  useEffect(() => {
    if (!firebase || !uid) {
      setEntries([]);
      setLoading(false);
      return;
    }

    const measurementsRef = firebase.collection(firebase.db, "users", uid, "measurements");
    const measurementsQuery = firebase.query(measurementsRef, firebase.orderBy("date", "asc"));

    const unsub = firebase.onSnapshot(
      measurementsQuery,
      (snapshot) => {
        setEntries(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
        setLoading(false);
      },
      () => {
        setEntries([]);
        setLoading(false);
      }
    );

    return unsub;
  }, [firebase, uid]);

  const saveMeasurement = useCallback(
    async ({ dateKey, notes, values }) => {
      if (!firebase || !uid) throw new Error("Not authenticated");
      const measuredAt = new Date(`${dateKey}T00:00:00`);
      await firebase.setDoc(firebase.doc(firebase.db, "users", uid, "measurements", dateKey), {
        dateKey,
        date: measuredAt,
        notes: notes || "",
        ...values,
        updatedAt: firebase.serverTimestamp(),
      });
    },
    [firebase, uid]
  );

  const deleteMeasurement = useCallback(
    async (dateKey) => {
      if (!firebase || !uid || !dateKey) return;
      await firebase.deleteDoc(firebase.doc(firebase.db, "users", uid, "measurements", dateKey));
    },
    [firebase, uid]
  );

  return { entries, loading, saveMeasurement, deleteMeasurement };
}

function useUserDoc(uid) {
  const [profile, setProfile] = useState(null);
  const [loading, setLd]      = useState(true);
  const { firebase }          = useAuth();

  const toPersistedUserDoc = useCallback((data) => {
    if (!data || typeof data !== "object") return {};

    const allowed = [
      "name",
      "email",
      "goal",
      "weightUnit",
      "measureUnit",
      "accent",
      "goalWeight",
      "age",
      "height",
      "showCalories",
      "subscriptionPlan",
      "subscriptionStatus",
      "subscriptionEndDate",
      "subscriptionExpiresAt",
      "subscriptionActivatedAt",
      "subscriptionPaymentId",
      "subscriptionOrderId",
      "createdAt",
    ];

    return allowed.reduce((acc, key) => {
      if (key in data) acc[key] = data[key];
      return acc;
    }, {});
  }, []);

  useEffect(() => {
    if (!firebase || !uid) { setLd(false); return; }
    const { db, doc, onSnapshot } = firebase;
    return onSnapshot(doc(db, "users", uid),
      snap => { setProfile(snap.exists() ? snap.data() : {}); setLd(false); },
      ()   => setLd(false)
    );
  }, [firebase, uid]);

  const save = useCallback(async (data) => {
    if (!firebase || !uid) return;
    await firebase.setDoc(firebase.doc(firebase.db, "users", uid), toPersistedUserDoc(data), { merge: true });
  }, [firebase, uid, toPersistedUserDoc]);

  return { profile, loading, save };
}

function useAdd(col) {
  const { firebase, user } = useAuth();
  return useCallback(async (data) => {
    if (!firebase || !user) throw new Error("Not authenticated");
    return firebase.addDoc(firebase.collection(firebase.db, col),
      { ...data, uid: user.uid, createdAt: firebase.serverTimestamp() });
  }, [firebase, user, col]);
}

function useDel(col) {
  const { firebase } = useAuth();
  return useCallback(async (id) => {
    if (!firebase) return;
    return firebase.deleteDoc(firebase.doc(firebase.db, col, id));
  }, [firebase, col]);
}

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════
const NAV = [
  { id:"dashboard", icon:"⬡", label:"Dashboard" },
  { id:"weight",    icon:"⚖", label:"Weight" },
  { id:"inches",    icon:"📏", label:"Inches" },
  { id:"gym",       icon:"🏋", label:"Gym" },
  { id:"calculators",icon:"∑", label:"Calculators" },
  { id:"settings",  icon:"⊞", label:"Settings" },
];

const MUSCLE_COLORS = {
  Chest:"#f97316", Back:"#3b82f6", Legs:"#a855f7",
  Shoulders:"#22c55e", Hamstrings:"#ec4899", Arms:"#eab308", Core:"#06b6d4",
};

function addDaysISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function addDaysDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function isGymSubscriptionActive(settings) {
  if (!settings?.subscriptionPlan || settings.subscriptionPlan === "none") return false;
  const ts = settings?.subscriptionExpiresAt;
  if (ts && typeof ts.toDate === "function") {
    return ts.toDate().getTime() > Date.now();
  }
  if (settings?.subscriptionEndDate) {
    return settings.subscriptionEndDate >= new Date().toISOString().split("T")[0];
  }
  return false;
}

// ══════════════════════════════════════════════════════════════════════════════
// UI PRIMITIVES
// ══════════════════════════════════════════════════════════════════════════════
function Sparkline({ data, color="#f97316", height=48 }) {
  if (!data || data.length < 2)
    return <div className="flex items-center justify-center text-white/20 text-xs font-mono w-full" style={{height}}>no data yet</div>;
  const min=Math.min(...data), max=Math.max(...data), range=max-min||1;
  const w=200, h=height;
  const pts=data.map((v,i)=>({ x:(i/(data.length-1))*w, y:h-((v-min)/range)*(h-8)-4 }));
  const line=pts.map((p,i)=>`${i===0?"M":"L"}${p.x},${p.y}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{height}}>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={color} fillOpacity="0.15" />
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length-1].x} cy={pts[pts.length-1].y} r="4" fill={color} />
    </svg>
  );
}

function Ring({ pct, color="#f97316", size=80, label, sub }) {
  const r=(size-12)/2, c=2*Math.PI*r, d=(pct/100)*c;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10"/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${d} ${c}`} strokeLinecap="round" style={{transition:"stroke-dasharray 1s ease"}}/>
      </svg>
      {label && <span className="text-xs font-mono font-bold tracking-wider" style={{color}}>{label}</span>}
      {sub   && <span className="text-[10px] text-white/40 tracking-wide">{sub}</span>}
    </div>
  );
}

function Card({ label, value, unit, delta, deltaDir, sub, accent="#f97316", sparkData, className="" }) {
  return (
    <div className={`rounded-2xl p-5 relative overflow-hidden group transition-all duration-300 hover:scale-[1.02] ${className}`}
      style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)" }}>
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        style={{ background:`radial-gradient(ellipse at 60% 0%, ${accent}15 0%, transparent 70%)` }}/>
      <p className="text-[11px] font-mono uppercase tracking-[0.15em] text-white/40 mb-2">{label}</p>
      <div className="flex items-end gap-2 mb-1">
        <span className="text-3xl font-black tracking-tight" style={{fontFamily:"'DM Mono',monospace"}}>{value ?? "—"}</span>
        {unit && <span className="text-sm text-white/40 mb-1">{unit}</span>}
        {delta !== undefined && delta !== null && (
          <span className={`text-xs font-bold ml-auto mb-1 px-2 py-0.5 rounded-full ${deltaDir==="good"?"bg-green-500/20 text-green-400":"bg-red-500/20 text-red-400"}`}>
            {deltaDir==="good"?"▼":"▲"} {Math.abs(delta)}
          </span>
        )}
      </div>
      {sub && <p className="text-[11px] text-white/30">{sub}</p>}
      {sparkData && <div className="mt-3"><Sparkline data={sparkData} color={accent} height={36}/></div>}
    </div>
  );
}

function SecHead({ title, sub, action }) {
  return (
    <div className="flex items-end justify-between mb-6">
      <div>
        <h2 className="text-2xl font-black" style={{fontFamily:"'Bebas Neue',cursive",letterSpacing:"0.04em"}}>{title}</h2>
        {sub && <p className="text-xs text-white/40 font-mono mt-0.5">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

function Badge({ label, color }) {
  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full font-mono tracking-wider"
    style={{ background:`${color}25`, color, border:`1px solid ${color}40` }}>{label}</span>;
}

function Spin({ size=20 }) {
  return <div className="animate-spin rounded-full border-2 border-white/20 border-t-orange-400 flex-shrink-0" style={{width:size,height:size}}/>;
}

function Inp({ label, ...p }) {
  return (
    <div>
      {label && <label className="text-[11px] font-mono uppercase tracking-wider text-white/40 block mb-2">{label}</label>}
      <input {...p} className="w-full rounded-xl px-4 py-3 text-white font-mono bg-transparent outline-none text-sm"
        style={{ border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.04)", colorScheme:"dark", ...p.style }}/>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTH PAGE
// ══════════════════════════════════════════════════════════════════════════════
function AuthPage() {
  const { firebase, fbError } = useAuth();
  const [mode, setMode]  = useState("login");
  const [email, setEmail] = useState("");
  const [pw, setPw]      = useState("");
  const [name, setName]  = useState("");
  const [err, setErr]    = useState("");
  const [msg, setMsg]    = useState("");
  const [busy, setBusy]  = useState(false);

  const go = async () => {
    if (!firebase) return;
    setErr(""); setMsg(""); setBusy(true);
    try {
      if (mode === "login") {
        await firebase.signInWithEmailAndPassword(firebase.auth, email, pw);
      } else if (mode === "register") {
        const cred = await firebase.createUserWithEmailAndPassword(firebase.auth, email, pw);
        await firebase.updateProfile(cred.user, { displayName: name });
        await firebase.setDoc(firebase.doc(firebase.db, "users", cred.user.uid), {
          name, email, goal:"Fat Loss", weightUnit:"kg", measureUnit:"cm",
          accent:"#f97316", goalWeight:"75", age:"", height:"",
          subscriptionPlan:"none", subscriptionEndDate:"", subscriptionExpiresAt:null,
          createdAt: firebase.serverTimestamp(),
        });
      } else {
        await firebase.sendPasswordResetEmail(firebase.auth, email);
        setMsg("Password reset email sent! Check your inbox.");
      }
    } catch(e) {
      const m = { "auth/user-not-found":"No account with that email.", "auth/wrong-password":"Incorrect password.",
        "auth/email-already-in-use":"Email already registered.", "auth/weak-password":"Password must be 6+ characters.",
        "auth/invalid-email":"Invalid email address.", "auth/invalid-credential":"Invalid email or password." };
      setErr(m[e.code] || e.message);
    } finally { setBusy(false); }
  };

  const googleLogin = async () => {
    if (!firebase) return;
    setErr(""); setBusy(true);
    try {
      const provider = new firebase.GoogleAuthProvider();
      const cred = await firebase.signInWithPopup(firebase.auth, provider);
      const ref  = firebase.doc(firebase.db, "users", cred.user.uid);
      const snap = await firebase.getDoc(ref);
      if (!snap.exists()) {
        await firebase.setDoc(ref, {
          name: cred.user.displayName||"", email: cred.user.email,
          goal:"Fat Loss", weightUnit:"kg", measureUnit:"cm",
          accent:"#f97316", goalWeight:"75", age:"", height:"",
          subscriptionPlan:"none", subscriptionEndDate:"", subscriptionExpiresAt:null,
          createdAt: firebase.serverTimestamp(),
        });
      }
    } catch(e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background:"#0d0d0d", fontFamily:"'DM Sans','Segoe UI',sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;700;900&display=swap');`}</style>
      <div className="absolute inset-0 pointer-events-none"
        style={{ background:"radial-gradient(ellipse at 30% 20%, #f9731618 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, #3b82f608 0%, transparent 60%)" }}/>

      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg" style={{background:"#f97316"}}>F</div>
            <span className="font-black text-3xl tracking-[0.15em] text-white" style={{fontFamily:"'Bebas Neue',cursive"}}>GYMRATTRACKER</span>
          </div>
          <p className="text-white/30 text-xs font-mono tracking-widest">PERSONAL FITNESS TRACKER</p>
        </div>

        {fbError && (
          <div className="mb-4 p-4 rounded-xl text-xs font-mono text-amber-300" style={{ background:"rgba(251,191,36,0.08)", border:"1px solid rgba(251,191,36,0.3)" }}>
            ⚠ Firebase config needs setup.<br/>Update <code>FIREBASE_CONFIG</code> at the top of the file with your project credentials.
          </div>
        )}

        <div className="rounded-2xl p-7" style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)" }}>
          {mode !== "reset" && (
            <div className="flex rounded-xl overflow-hidden mb-6" style={{ background:"rgba(255,255,255,0.05)" }}>
              {[["login","Sign In"],["register","Create Account"]].map(([m,l])=>(
                <button key={m} onClick={()=>{ setMode(m); setErr(""); setMsg(""); }}
                  className="flex-1 py-2.5 text-sm font-mono font-medium transition-all"
                  style={{ background:mode===m?"#f97316":"transparent", color:mode===m?"#fff":"rgba(255,255,255,0.4)" }}>{l}</button>
              ))}
            </div>
          )}

          {mode==="reset" && (
            <div className="mb-4">
              <button onClick={()=>{setMode("login");setErr("");setMsg("");}} className="text-xs font-mono text-white/40 hover:text-white/70 transition-colors">← Back</button>
              <p className="text-sm font-mono text-white/60 mt-2">Enter your email to receive a reset link.</p>
            </div>
          )}

          <div className="space-y-4">
            {mode==="register" && <Inp label="Full Name" type="text" placeholder="Your name" value={name} onChange={e=>setName(e.target.value)}/>}
            <Inp label="Email" type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)}/>
            {mode!=="reset" && <Inp label="Password" type="password" placeholder="••••••••" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()}/>}
          </div>

          {err && <p className="mt-3 text-xs font-mono text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{err}</p>}
          {msg && <p className="mt-3 text-xs font-mono text-green-400 bg-green-500/10 px-3 py-2 rounded-lg">{msg}</p>}

          <button onClick={go} disabled={busy}
            className="w-full mt-5 py-3.5 rounded-xl font-mono font-bold tracking-widest text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
            style={{ background:"#f97316", color:"#fff", opacity:busy?0.7:1 }}>
            {busy ? <Spin size={18}/> : mode==="login" ? "SIGN IN" : mode==="register" ? "CREATE ACCOUNT" : "SEND RESET LINK"}
          </button>

          {mode!=="reset" && (
            <>
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-white/10"/><span className="text-[10px] font-mono text-white/30">OR</span><div className="flex-1 h-px bg-white/10"/>
              </div>
              <button onClick={googleLogin} disabled={busy}
                className="w-full py-3 rounded-xl font-mono text-sm transition-all hover:bg-white/10 flex items-center justify-center gap-2"
                style={{ border:"1px solid rgba(255,255,255,0.12)", color:"rgba(255,255,255,0.7)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>
              {mode==="login" && (
                <button onClick={()=>{setMode("reset");setErr("");setMsg("");}} className="w-full mt-3 text-xs font-mono text-white/30 hover:text-white/60 transition-colors text-center">
                  Forgot password?
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
function Dashboard({ settings }) {
  const { user } = useAuth();
  const { data: weights,  loading: wL  } = useCollection("weights",      user?.uid);
  const { entries: nestedMeasures, loading: mL } = useUserMeasurements(user?.uid);
  const subActive = isGymSubscriptionActive(settings);
  const { data: workouts, loading: woL } = useCollection("workouts", subActive ? user?.uid : null);

  const measures = useMemo(
    () =>
      nestedMeasures.flatMap((entry) => ([
        { part: "waist", val: entry.waist, date: entry.dateKey },
        { part: "chest", val: entry.chest, date: entry.dateKey },
        { part: "hips", val: entry.hips, date: entry.dateKey },
        { part: "thigh", val: entry.thigh, date: entry.dateKey },
        { part: "arms", val: entry.arms, date: entry.dateKey },
      ]).filter((measurement) => Number.isFinite(measurement.val))),
    [nestedMeasures]
  );
  const loading = wL || mL || woL;

  const sorted   = [...weights].sort((a,b)=>a.date.localeCompare(b.date));
  const currentW = sorted.length ? sorted[sorted.length-1].weight : null;
  const startW   = sorted.length ? sorted[0].weight : null;
  const goalW    = parseFloat(settings?.goalWeight)||75;
  const wDelta   = currentW&&startW ? +(currentW-startW).toFixed(1) : null;
  const wPct     = currentW&&startW&&startW!==goalW ? Math.min(100,Math.max(0,Math.round(((startW-currentW)/(startW-goalW))*100))) : 0;

  const latestM = {}, firstM = {};
  ["waist", "chest", "hips", "thigh", "arms"].forEach((p) => {
    const arr=measures.filter(m=>m.part===p).sort((a,b)=>a.date.localeCompare(b.date));
    if(arr.length){latestM[p]=arr[arr.length-1].val; firstM[p]=arr[0].val;}
  });

  const weekAgo   = new Date(Date.now()-7*86400000).toISOString().split("T")[0];
  const weeklyWo  = workouts.filter(w=>w.date>=weekAgo);

  const recent = [
    ...sorted.slice(-3).reverse().map(w=>({icon:"⚖",text:`Weight: ${w.weight} ${settings?.weightUnit||"kg"}`,time:w.date,color:"#f97316"})),
    ...[...workouts].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,3).map(w=>({icon:"🏋",text:`${w.exercise} ${w.sets}×${w.reps}@${w.weight}kg`,time:w.date,color:"#3b82f6"})),
    ...measures.slice(-2).reverse().map(m=>({icon:"📏",text:`${m.part}: ${m.val} ${settings?.measureUnit||"cm"}`,time:m.date,color:"#22c55e"})),
  ].sort((a,b)=>b.time.localeCompare(a.time)).slice(0,6);

  return (
    <div className="space-y-8">
      {loading&&<div className="flex items-center gap-2 text-white/40 text-sm font-mono"><Spin size={16}/>Loading your data from Firebase…</div>}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card label="Current Weight" value={currentW??null} unit={settings?.weightUnit||"kg"}
          delta={wDelta!==null?Math.abs(wDelta):undefined} deltaDir="good"
          sub={`Goal: ${goalW} ${settings?.weightUnit||"kg"}`} accent="#f97316"
          sparkData={sorted.map(w=>w.weight)} className="col-span-2"/>
        <Card label="Waist" value={latestM.waist??null} unit={settings?.measureUnit||"cm"}
          delta={latestM.waist&&firstM.waist?+(latestM.waist-firstM.waist).toFixed(1):undefined} deltaDir="good"
          accent="#22c55e" sparkData={measures.filter(m=>m.part==="waist").map(m=>m.val)}/>
        <Card label="This Week" value={new Set(weeklyWo.map(w=>w.date)).size} unit="sessions"
          sub={`${workouts.length} exercises total`} accent="#3b82f6"/>
      </div>

      <div className="rounded-2xl p-6" style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)"}}>
        <p className="text-[11px] font-mono uppercase tracking-[0.15em] text-white/40 mb-5">GOAL PROGRESS</p>
        {!loading && weights.length===0 && measures.length===0
          ? <p className="text-white/30 text-sm font-mono text-center py-4">Log your first entry to see progress rings.</p>
          : <div className="flex flex-wrap gap-8 justify-around">
              <Ring pct={wPct} color="#f97316" size={90} label={`${wPct}%`} sub="Weight Goal"/>
              <Ring pct={latestM.waist&&firstM.waist?Math.min(100,Math.max(0,Math.round(((firstM.waist-latestM.waist)/Math.max(firstM.waist-80,1))*100))):0}
                color="#22c55e" size={90} label={`${latestM.waist&&firstM.waist?Math.min(100,Math.max(0,Math.round(((firstM.waist-latestM.waist)/Math.max(firstM.waist-80,1))*100))):0}%`} sub="Waist Goal"/>
              <Ring pct={Math.min(100,new Set(weeklyWo.map(w=>w.date)).size*25)} color="#3b82f6" size={90}
                label={`${Math.min(100,new Set(weeklyWo.map(w=>w.date)).size*25)}%`} sub="Weekly Target"/>
              <Ring pct={Math.min(100,sorted.length*5)} color="#a855f7" size={90}
                label={`${Math.min(100,sorted.length*5)}%`} sub="Consistency"/>
            </div>
        }
      </div>

      <div className="rounded-2xl p-6" style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)"}}>
        <p className="text-[11px] font-mono uppercase tracking-[0.15em] text-white/40 mb-5">RECENT ACTIVITY</p>
        {recent.length===0
          ? <p className="text-white/30 text-sm font-mono text-center py-4">No logs yet — start tracking!</p>
          : <div className="space-y-4">
              {recent.map((l,i)=>(
                <div key={i} className="flex items-center gap-3">
                  <span className="text-lg w-8 text-center">{l.icon}</span>
                  <div className="flex-1"><p className="text-sm font-medium">{l.text}</p><p className="text-[11px] text-white/30 font-mono">{l.time}</p></div>
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{background:l.color}}/>
                </div>
              ))}
            </div>
        }
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// WEIGHT PAGE
// ══════════════════════════════════════════════════════════════════════════════
function WeightPage({ settings }) {
  const { user } = useAuth();
  const { data: weights, loading } = useCollection("weights", user?.uid);
  const add = useAdd("weights");
  const del = useDel("weights");
  const [form, setForm] = useState({ weight:"", note:"", date:new Date().toISOString().split("T")[0] });
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState("");

  const sorted  = [...weights].sort((a,b)=>a.date.localeCompare(b.date));
  const current = sorted.length ? sorted[sorted.length-1].weight : null;
  const start   = sorted.length ? sorted[0].weight : null;
  const goalW   = parseFloat(settings?.goalWeight)||75;

  const save = async () => {
    if (!form.weight) { setErr("Enter a weight value."); return; }
    setBusy(true); setErr("");
    try {
      await add({ weight:parseFloat(form.weight), date:form.date, note:form.note });
      setForm(f=>({...f, weight:"", note:""}));
    } catch(e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-8">
      <SecHead title="WEIGHT TRACKING" sub={current?`Current: ${current} ${settings?.weightUnit||"kg"} · Goal: ${goalW}`:"Log your first weight"}/>

      <div className="rounded-2xl p-6" style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)"}}>
        <p className="text-[11px] font-mono uppercase tracking-widest text-white/40 mb-4">WEIGHT HISTORY</p>
        <div className="h-32">{loading?<div className="flex items-center justify-center h-full"><Spin/></div>:<Sparkline data={sorted.map(w=>w.weight)} color="#f97316" height={128}/>}</div>
        {sorted.length>=2&&(
          <div className="flex justify-between mt-4 pt-4" style={{borderTop:"1px solid rgba(255,255,255,0.06)"}}>
            <div><p className="text-[10px] text-white/30 font-mono">STARTED</p><p className="text-lg font-black">{start} {settings?.weightUnit||"kg"}</p></div>
            <div className="text-center"><p className="text-[10px] text-white/30 font-mono">LOST</p><p className="text-lg font-black text-green-400">−{(start-current).toFixed(1)} {settings?.weightUnit||"kg"}</p></div>
            <div className="text-right"><p className="text-[10px] text-white/30 font-mono">NOW</p><p className="text-lg font-black">{current} {settings?.weightUnit||"kg"}</p></div>
          </div>
        )}
      </div>

      <div className="rounded-2xl p-6" style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)"}}>
        <p className="text-[11px] font-mono uppercase tracking-widest text-white/40 mb-5">LOG WEIGHT</p>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Inp label={`Weight (${settings?.weightUnit||"kg"})`} type="number" step="0.1" placeholder="e.g. 80.5"
            value={form.weight} onChange={e=>setForm(f=>({...f,weight:e.target.value}))}/>
          <Inp label="Date" type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/>
        </div>
        <div className="mb-4">
          <Inp label="Note (optional)" type="text" placeholder="How are you feeling?" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}/>
        </div>
        {err&&<p className="text-xs text-red-400 font-mono mb-3">{err}</p>}
        <button onClick={save} disabled={busy}
          className="w-full py-3 rounded-xl font-mono font-bold tracking-widest text-sm transition-all flex items-center justify-center gap-2"
          style={{background:"#f97316",color:"#fff",opacity:busy?0.7:1}}>
          {busy?<><Spin size={16}/>SAVING…</>:"LOG WEIGHT"}
        </button>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{border:"1px solid rgba(255,255,255,0.07)"}}>
        <div className="px-6 py-4" style={{background:"rgba(255,255,255,0.04)"}}>
          <p className="text-[11px] font-mono uppercase tracking-widest text-white/40">HISTORY ({weights.length} entries)</p>
        </div>
        {loading?<div className="p-8 flex justify-center"><Spin/></div>
        :sorted.length===0?<p className="text-center text-white/30 text-sm font-mono py-8">No weight logs yet.</p>
        :[...sorted].reverse().map(e=>(
          <div key={e.id} className="px-6 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors" style={{borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
            <div>
              <p className="font-mono text-sm text-white/60">{e.date}</p>
              {e.note&&<p className="text-xs text-white/30 mt-0.5">{e.note}</p>}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xl font-black font-mono">{e.weight}</span>
              <span className="text-xs text-white/30">{settings?.weightUnit||"kg"}</span>
              <button onClick={()=>del(e.id)} className="text-white/20 hover:text-red-400 transition-colors text-xs">✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InchesAnalyticsPage({ settings }) {
  const { user } = useAuth();
  const { entries, loading, saveMeasurement, deleteMeasurement } = useUserMeasurements(user?.uid);
  const parts = useMemo(() => ([
    { key: "waist", label: "Waist", color: "#f97316" },
    { key: "chest", label: "Chest", color: "#3b82f6" },
    { key: "hips", label: "Hips", color: "#a855f7" },
    { key: "thigh", label: "Thigh", color: "#22c55e" },
    { key: "arms", label: "Arms", color: "#eab308" },
  ]), []);
  const existingDateKeys = useMemo(() => new Set(entries.map((entry) => entry.dateKey)), [entries]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [range, setRange] = useState("30");
  const latestEntry = useMemo(() => (entries.length ? entries[entries.length - 1] : null), [entries]);

  const filteredEntries = useMemo(() => {
    if (!entries.length || range === "all") return entries;
    const days = Number.parseInt(range, 10);
    if (!Number.isFinite(days)) return entries;
    const latestDate = new Date(`${entries[entries.length - 1].dateKey}T00:00:00`).getTime();
    return entries.filter((entry) => {
      const entryDate = new Date(`${entry.dateKey}T00:00:00`).getTime();
      return latestDate - entryDate <= (days - 1) * 24 * 60 * 60 * 1000;
    });
  }, [entries, range]);

  const onSaveMeasurements = async (payload) => {
    setBusy(true);
    setErr("");
    try {
      const normalizedValues = Object.fromEntries(
        parts.map((part) => {
          const nextVal = payload.values?.[part.key];
          if (Number.isFinite(nextVal)) return [part.key, nextVal];
          const prevVal = latestEntry?.[part.key];
          return [part.key, Number.isFinite(prevVal) ? prevVal : 0];
        })
      );

      await saveMeasurement({ ...payload, values: normalizedValues });
    } catch (e) {
      setErr(e.message || "Failed to save measurements.");
      throw e;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <SecHead title="INCH LOSS ANALYTICS" sub="Daily measurement logs and visual progress tracking"/>

      <MeasurementForm
        parts={parts}
        unit={settings?.measureUnit || "cm"}
        existingDateKeys={existingDateKeys}
        onSave={onSaveMeasurements}
        busy={busy}
        externalError={err}
      />

      {loading ? (
        <div className="flex justify-center py-8"><Spin/></div>
      ) : (
        <>
          <InchLossChart
            entries={filteredEntries}
            parts={parts}
            unit={settings?.measureUnit || "cm"}
            range={range}
            setRange={setRange}
          />

          <AnalyticsSummary
            entries={filteredEntries}
            allEntries={entries}
            parts={parts}
            unit={settings?.measureUnit || "cm"}
          />

          <div className="rounded-2xl overflow-hidden" style={{border:"1px solid rgba(255,255,255,0.07)"}}>
            <div className="px-6 py-4" style={{background:"rgba(255,255,255,0.04)"}}>
              <p className="text-[11px] font-mono uppercase tracking-widest text-white/40">MEASUREMENT HISTORY ({entries.length} days)</p>
            </div>
            {entries.length===0 ? (
              <p className="text-center text-white/30 text-sm font-mono py-8">No measurement logs yet.</p>
            ) : (
              [...entries].reverse().map(entry => (
                <div key={entry.id} className="px-6 py-4 flex items-start justify-between gap-4" style={{borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
                  <div className="space-y-1">
                    <p className="font-mono text-sm text-white/70">{entry.dateKey}</p>
                    <p className="text-xs text-white/40 font-mono">Waist {entry.waist} · Chest {entry.chest} · Hips {entry.hips} · Thigh {entry.thigh} · Arms {entry.arms}</p>
                    {entry.notes && <p className="text-xs text-white/30">{entry.notes}</p>}
                  </div>
                  <button type="button" onClick={()=>deleteMeasurement(entry.dateKey)} className="text-white/25 hover:text-red-400 text-xs transition-colors">✕</button>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// GYM PAGE
// ══════════════════════════════════════════════════════════════════════════════
function GymPage({ settings, setSettings }) {
  const { user, firebase } = useAuth();
  const subActive = isGymSubscriptionActive(settings);
  const { data: workouts, loading } = useCollection("workouts", subActive ? user?.uid : null);
  const add = useAdd("workouts");
  const del = useDel("workouts");
  const muscles = Object.keys(MUSCLE_COLORS);
  const [form, setForm] = useState({ date:new Date().toISOString().split("T")[0], exercise:"", sets:"", reps:"", weight:"", muscle:"Chest", rpe:"", note:"" });
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState("");
  const [subBusy, setSubBusy] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [analyticsExerciseKey, setAnalyticsExerciseKey] = useState("");
  const configuredApiBase = (import.meta.env.VITE_API_BASE_URL || "").trim();
  const normalizeApiBase = (value) => {
    const trimmed = (value || "").trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
    return `https://${trimmed}`;
  };

  const hardcodedBackendBase = "https://gymrat-tracker-r7u8.vercel.app";
  const localBackendBase = "http://localhost:4000";
  const isLocalHost = window.location.hostname === "localhost";
  const apiBase = normalizeApiBase(configuredApiBase)
    || (isLocalHost
      ? localBackendBase
      : hardcodedBackendBase);

  const apiCandidates = [...new Set((isLocalHost
    ? [
      localBackendBase,
      normalizeApiBase(configuredApiBase),
      hardcodedBackendBase,
      apiBase,
    ]
    : [
      normalizeApiBase(configuredApiBase),
      apiBase,
      hardcodedBackendBase,
    ]
  ).filter(Boolean))];

  const buildApiUrl = (path, baseOverride) => {
    const resolvedBase = baseOverride || apiBase;
    const normalizedBase = resolvedBase.endsWith("/") ? resolvedBase.slice(0, -1) : resolvedBase;
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${normalizedBase}${normalizedPath}`;
  };

  const postJsonWithApiFallback = async (path, payload, authHeaders = {}) => {
    let lastErrorMessage = "Unable to connect to payment server";

    for (const base of apiCandidates) {
      let response;
      try {
        response = await fetch(buildApiUrl(path, base), {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify(payload),
        });
      } catch {
        // Try next candidate if this host is unreachable or blocked by network/CORS.
        continue;
      }

      const raw = await response.text();
      let data = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        data = null;
      }

      if (response.ok && data?.status === "ok") {
        return { data, base };
      }

      lastErrorMessage = data?.message || `Unable to start payment (${response.status})`;

      // Retry next known API base if this domain does not support this POST route.
      if (response.status === 404 || response.status === 405) {
        continue;
      }

      throw new Error(lastErrorMessage);
    }

    throw new Error(lastErrorMessage);
  };

  const loadRazorpayScript = () =>
    new Promise((resolve, reject) => {
      if (window.Razorpay) {
        resolve(window.Razorpay);
        return;
      }

      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve(window.Razorpay);
      script.onerror = () => reject(new Error("Failed to load Razorpay checkout script"));
      document.body.appendChild(script);
    });

  const activatePlan = async (plan) => {
    setErr("");
    setSubBusy(true);

    try {
      if (!user?.uid) {
        throw new Error("Please sign in before starting membership payment.");
      }

      const RazorpayCtor = await loadRazorpayScript();
      if (!RazorpayCtor) {
        throw new Error("Razorpay checkout is not available right now. Please refresh and try again.");
      }

      const { data: orderData, base: activeApiBase } = await postJsonWithApiFallback(
        "/api/payments/create-order",
        { plan, uid: user.uid }
      );

      if (!orderData?.order?.id || !orderData?.keyId) {
        throw new Error("Payment gateway is not configured correctly. Missing Razorpay order details.");
      }

      const options = {
        key: orderData.keyId,
        amount: orderData.order.amount,
        currency: orderData.order.currency,
        name: "GymRatTracker",
        description: `${plan === "monthly" ? "Monthly" : "Yearly"} Gym Membership`,
        order_id: orderData.order.id,
        prefill: {
          name: user?.displayName || "",
          email: user?.email || "",
        },
        theme: { color: "#f97316" },
        handler: async (paymentResult) => {
          try {
            const verifyUrl = buildApiUrl("/api/payments/verify", activeApiBase);
            const verifyRes = await fetch(verifyUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...paymentResult, plan }),
            });

            const rawVerifyBody = await verifyRes.text();
            let verifyData = null;
            try {
              verifyData = rawVerifyBody ? JSON.parse(rawVerifyBody) : null;
            } catch {
              verifyData = null;
            }

            if (!verifyRes.ok || verifyData?.status !== "ok" || !verifyData?.verified) {
              throw new Error(verifyData?.message || "Payment verification failed");
            }

            // Backend verify endpoint is the source of truth. Refresh profile after success.
            if (firebase && user?.uid) {
              const profileRef = firebase.doc(firebase.db, "users", user.uid);
              const profileSnap = await firebase.getDoc(profileRef);
              if (profileSnap.exists()) {
                setSettings((s) => ({ ...s, ...profileSnap.data() }));
              }
            }
            setErr("");
          } catch (e) {
            setErr(e.message || "Payment succeeded but verification failed");
          }
        },
      };

      const paymentObject = new RazorpayCtor(options);
      paymentObject.on("payment.failed", (response) => {
        const message = response?.error?.description || "Payment failed. Please try again.";
        setErr(message);
      });
      paymentObject.open();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSubBusy(false);
    }
  };

  if (!subActive) {
    return (
      <div className="space-y-8">
        <SecHead title="GYM TRACKER" sub="Subscription required to unlock this section"/>
        <div className="rounded-2xl p-8" style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)"}}>
          <p className="text-sm text-white/70 mb-6">Login is free. To use the Gym section, choose a subscription plan.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button type="button" onClick={() => activatePlan("monthly")} disabled={subBusy}
              className="rounded-xl p-5 text-left transition-all hover:scale-[1.01]"
              style={{border:"1px solid rgba(255,255,255,0.12)",background:"rgba(59,130,246,0.08)"}}>
              <p className="text-xs font-mono uppercase tracking-widest text-blue-300">Monthly</p>
              <p className="text-3xl font-black mt-2">₹69</p>
              <p className="text-xs text-white/50 mt-2">30 days access</p>
            </button>
            <button type="button" onClick={() => activatePlan("yearly")} disabled={subBusy}
              className="rounded-xl p-5 text-left transition-all hover:scale-[1.01]"
              style={{border:"1px solid rgba(255,255,255,0.12)",background:"rgba(34,197,94,0.08)"}}>
              <p className="text-xs font-mono uppercase tracking-widest text-green-300">Yearly</p>
              <p className="text-3xl font-black mt-2">₹399</p>
              <p className="text-xs text-white/50 mt-2">365 days access</p>
            </button>
          </div>
          {err && <p className="text-xs text-red-400 font-mono mt-4">{err}</p>}
        </div>
      </div>
    );
  }

  const save = async () => {
    const exerciseName = form.exercise.trim();
    if (!exerciseName || !form.sets||!form.reps) { setErr("Fill exercise, sets, and reps."); return; }
    setBusy(true); setErr("");
    try {
      await add({ ...form, exercise: exerciseName, sets:parseInt(form.sets), reps:parseInt(form.reps), weight:parseFloat(form.weight||0), rpe:parseInt(form.rpe||0) });
      setForm(f=>({...f, exercise:"", sets:"", reps:"", weight:"", rpe:"", note:""}));
    } catch(e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const sorted  = [...workouts].sort((a,b)=>b.date.localeCompare(a.date));
  const getDayLabel = (isoDate) => {
    if (!isoDate) return "Unknown Day";
    const parsed = new Date(`${isoDate}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return "Unknown Day";
    return parsed.toLocaleDateString(undefined, { weekday: "long" });
  };

  const buildExerciseGroups = (entries) => Object.values(entries.reduce((acc, workout) => {
    const normalizedKey = (workout.exercise || "Unnamed Exercise").trim().toLowerCase();
    if (!acc[normalizedKey]) {
      acc[normalizedKey] = {
        key: normalizedKey,
        title: (workout.exercise || "Unnamed Exercise").trim() || "Unnamed Exercise",
        logs: [],
      };
    }
    acc[normalizedKey].logs.push(workout);
    return acc;
  }, {})).sort((a, b) => b.logs[0].date.localeCompare(a.logs[0].date));

  const normalizedHistoryQuery = historyQuery.trim().toLowerCase();
  const filteredSorted = normalizedHistoryQuery
    ? sorted.filter((workout) => {
      const dateText = (workout.date || "").toLowerCase();
      const dayText = getDayLabel(workout.date).toLowerCase();
      return dateText.includes(normalizedHistoryQuery) || dayText.includes(normalizedHistoryQuery);
    })
    : sorted;

  const exerciseGroups = buildExerciseGroups(filteredSorted);
  const allExerciseGroups = buildExerciseGroups(sorted);
  const analyticsSelectedKey = allExerciseGroups.some((group) => group.key === analyticsExerciseKey)
    ? analyticsExerciseKey
    : allExerciseGroups[0]?.key || "";
  const selectedAnalyticsGroup = allExerciseGroups.find((group) => group.key === analyticsSelectedKey) || null;
  const selectedAnalyticsLogs = selectedAnalyticsGroup?.logs || [];
  const analyticsTotalVolume = selectedAnalyticsLogs.reduce((sum, log) => sum + log.sets * log.reps * log.weight, 0);
  const analyticsMaxWeight = selectedAnalyticsLogs.length ? Math.max(...selectedAnalyticsLogs.map((log) => log.weight || 0)) : 0;
  const analyticsAvgWeight = selectedAnalyticsLogs.length
    ? (selectedAnalyticsLogs.reduce((sum, log) => sum + (log.weight || 0), 0) / selectedAnalyticsLogs.length)
    : 0;
  const analyticsAvgRpeLogs = selectedAnalyticsLogs.filter((log) => (log.rpe || 0) > 0);
  const analyticsAvgRpe = analyticsAvgRpeLogs.length
    ? (analyticsAvgRpeLogs.reduce((sum, log) => sum + log.rpe, 0) / analyticsAvgRpeLogs.length)
    : null;
  const analyticsUniqueDays = new Set(selectedAnalyticsLogs.map((log) => log.date)).size;
  const analyticsTrendData = [...selectedAnalyticsLogs].reverse().map((log) => log.weight || 0);
  const weekAgo = new Date(Date.now()-7*86400000).toISOString().split("T")[0];
  const weekly  = workouts.filter(w=>w.date>=weekAgo);
  const weekVol = weekly.reduce((s,w)=>s+w.sets*w.reps*w.weight,0);

  return (
    <div className="space-y-8">
      <SecHead title="GYM TRACKER" sub="Exercise logs, volume tracking, and workout history"/>
      <div className="grid grid-cols-3 gap-4">
        <Card label="This Week" value={new Set(weekly.map(w=>w.date)).size} unit="sessions" sub="Unique training days" accent="#3b82f6"/>
        <Card label="Weekly Volume" value={weekVol>0?weekVol.toLocaleString():"—"} unit="kg" sub="sets × reps × weight" accent="#a855f7"/>
        <Card label="All Exercises" value={workouts.length} unit="logged" sub="Total entries" accent="#f97316"/>
      </div>

      <div className="rounded-2xl p-6" style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)"}}>
        <SecHead title="EXERCISE ANALYTICS" sub="Performance insights for a selected exercise"/>
        {allExerciseGroups.length===0 ? (
          <p className="text-sm text-white/40 font-mono">Log at least one exercise to unlock analytics.</p>
        ) : (
          <div className="space-y-5">
            <div>
              <label className="text-[11px] font-mono uppercase tracking-wider text-white/40 block mb-2">Select Exercise</label>
              <select value={analyticsSelectedKey} onChange={e=>setAnalyticsExerciseKey(e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-white font-mono outline-none text-sm"
                style={{border:"1px solid rgba(255,255,255,0.1)",background:"#1a1a1a",colorScheme:"dark"}}>
                {allExerciseGroups.map(group=><option key={group.key} value={group.key}>{group.title}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card label="Total Logs" value={selectedAnalyticsLogs.length} sub="Times this exercise was recorded" accent="#3b82f6"/>
              <Card label="Total Volume" value={analyticsTotalVolume.toLocaleString()} unit="kg" sub="sets × reps × weight" accent="#a855f7"/>
              <Card label="Best Weight" value={analyticsMaxWeight>0?analyticsMaxWeight:"—"} unit={analyticsMaxWeight>0?"kg":""} sub="Highest logged weight" accent="#f97316"/>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card label="Avg Weight" value={analyticsAvgWeight>0?analyticsAvgWeight.toFixed(1):"—"} unit={analyticsAvgWeight>0?"kg":""} sub="Average load per log" accent="#22c55e"/>
              <Card label="Avg RPE" value={analyticsAvgRpe!==null?analyticsAvgRpe.toFixed(1):"—"} sub={analyticsAvgRpe!==null?"Only logs with RPE":"No RPE data yet"} accent="#ec4899"/>
              <Card label="Training Days" value={analyticsUniqueDays} sub={`Last logged: ${selectedAnalyticsLogs[0]?.date || "—"}`} accent="#06b6d4"/>
            </div>

            <div className="rounded-xl p-4" style={{border:"1px solid rgba(255,255,255,0.08)",background:"rgba(255,255,255,0.02)"}}>
              <p className="text-[11px] font-mono uppercase tracking-widest text-white/40 mb-3">Weight Trend</p>
              <Sparkline data={analyticsTrendData} color="#f97316" height={56}/>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl p-6" style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)"}}>
        <p className="text-[11px] font-mono uppercase tracking-widest text-white/40 mb-5">LOG EXERCISE</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
          <div className="col-span-2">
            <Inp label="Exercise Name" type="text" placeholder="e.g. Bench Press" value={form.exercise} onChange={e=>setForm(p=>({...p,exercise:e.target.value}))}/>
          </div>
          <Inp label="Date" type="date" value={form.date} onChange={e=>setForm(p=>({...p,date:e.target.value}))}/>
          <Inp label="Sets" type="number" placeholder="4" value={form.sets} onChange={e=>setForm(p=>({...p,sets:e.target.value}))}/>
          <Inp label="Reps" type="number" placeholder="8" value={form.reps} onChange={e=>setForm(p=>({...p,reps:e.target.value}))}/>
          <Inp label="Weight (kg)" type="number" placeholder="80" value={form.weight} onChange={e=>setForm(p=>({...p,weight:e.target.value}))}/>
          <Inp label="RPE (1-10)" type="number" placeholder="8" value={form.rpe} onChange={e=>setForm(p=>({...p,rpe:e.target.value}))}/>
          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-white/40 block mb-2">Muscle Group</label>
            <select value={form.muscle} onChange={e=>setForm(p=>({...p,muscle:e.target.value}))}
              className="w-full rounded-xl px-4 py-3 text-white font-mono outline-none text-sm"
              style={{border:"1px solid rgba(255,255,255,0.1)",background:"#1a1a1a",colorScheme:"dark"}}>
              {muscles.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="col-span-2 md:col-span-3">
            <Inp label="Notes" type="text" placeholder="Optional notes…" value={form.note} onChange={e=>setForm(p=>({...p,note:e.target.value}))}/>
          </div>
        </div>
        {err&&<p className="text-xs text-red-400 font-mono mb-3">{err}</p>}
        <button onClick={save} disabled={busy}
          className="w-full py-3 rounded-xl font-mono font-bold tracking-widest text-sm transition-all flex items-center justify-center gap-2"
          style={{background:"#3b82f6",color:"#fff",opacity:busy?0.7:1}}>
          {busy?<><Spin size={16}/>SAVING…</>:"LOG EXERCISE"}
        </button>
      </div>

      <div className="rounded-2xl p-4" style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)"}}>
        <Inp
          label="Search Workout Day / Date"
          type="text"
          placeholder="e.g. monday, mon, 2026-04-14"
          value={historyQuery}
          onChange={e=>setHistoryQuery(e.target.value)}
        />
      </div>

      {loading?<div className="flex justify-center py-8"><Spin/></div>
      :exerciseGroups.map((group)=>(
        <div key={group.title.toLowerCase()} className="rounded-2xl overflow-hidden" style={{border:"1px solid rgba(255,255,255,0.07)"}}>
          <div className="px-6 py-3 flex items-center justify-between" style={{background:"rgba(255,255,255,0.04)"}}>
            <span className="font-mono text-sm text-white/60">{group.title}</span>
            <span className="text-[11px] font-mono text-white/30">{group.logs.length} logs · {group.logs.reduce((s,e)=>s+e.sets*e.reps*e.weight,0).toLocaleString()} kg vol</span>
          </div>
          {Object.entries(group.logs.reduce((acc, log) => {
            if (!acc[log.date]) acc[log.date] = [];
            acc[log.date].push(log);
            return acc;
          }, {}))
            .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
            .map(([date, logs]) => (
              <div key={`${group.title}-${date}`}>
                <div className="px-6 py-2 flex items-center justify-between" style={{background:"rgba(255,255,255,0.02)",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                  <span className="text-[11px] font-mono text-white/50">{date}</span>
                  <span className="text-[11px] font-mono text-white/35">{getDayLabel(date)}</span>
                </div>
                {logs.map(e=>(
                  <div key={e.id} className="px-6 py-4 flex items-center gap-4" style={{borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
                    <div className="w-2 h-10 rounded-full flex-shrink-0" style={{background:MUSCLE_COLORS[e.muscle]||"#888"}}/>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{e.exercise}</p>
                      {e.note&&<p className="text-[11px] text-white/30 font-mono mt-0.5 truncate">{e.note}</p>}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <Badge label={e.muscle} color={MUSCLE_COLORS[e.muscle]||"#888"}/>
                      <div className="text-right">
                        <p className="font-mono font-bold text-sm">{e.sets}×{e.reps} @ {e.weight}kg</p>
                        {e.rpe>0&&<p className="text-[11px] text-white/30 font-mono">RPE {e.rpe}</p>}
                      </div>
                      <button onClick={()=>del(e.id)} className="text-white/20 hover:text-red-400 transition-colors text-xs">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
        </div>
      ))}
      {!loading&&workouts.length===0&&<p className="text-center text-white/30 text-sm font-mono py-4">No workouts logged yet.</p>}
      {!loading&&workouts.length>0&&exerciseGroups.length===0&&<p className="text-center text-white/30 text-sm font-mono py-4">No logs match that day/date search.</p>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CALCULATORS
// ══════════════════════════════════════════════════════════════════════════════
function CalcPage({ settings }) {
  const [st, setSt] = useState({ age:parseFloat(settings?.age)||28, weight:80, height:parseFloat(settings?.height)||178, gender:"male", activity:1.55 });
  const bmr  = st.gender==="male" ? 10*st.weight+6.25*st.height-5*st.age+5 : 10*st.weight+6.25*st.height-5*st.age-161;
  const tdee = Math.round(bmr*st.activity);
  const cut  = tdee-500;
  const acts = [{v:1.2,l:"Sedentary"},{v:1.375,l:"Light (1-3/wk)"},{v:1.55,l:"Moderate (3-5/wk)"},{v:1.725,l:"Active (6-7/wk)"},{v:1.9,l:"Very Active"}];

  return (
    <div className="space-y-8">
      <SecHead title="CALCULATORS" sub="BMR · TDEE · Calorie targets"/>
      <div className="rounded-2xl p-6" style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)"}}>
        <p className="text-[11px] font-mono uppercase tracking-widest text-white/40 mb-5">YOUR STATS</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[["Age (years)","age"],["Weight (kg)","weight"],["Height (cm)","height"]].map(([l,k])=>(
            <div key={k}>
              <label className="text-[11px] font-mono uppercase tracking-wider text-white/40 block mb-2">{l}</label>
              <input type="number" value={st[k]} onChange={e=>setSt(p=>({...p,[k]:parseFloat(e.target.value)||0}))}
                className="w-full rounded-xl px-4 py-3 text-white font-mono bg-transparent outline-none text-sm"
                style={{border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.04)"}}/>
            </div>
          ))}
          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-white/40 block mb-2">Gender</label>
            <div className="flex gap-2">
              {["male","female"].map(g=>(
                <button key={g} onClick={()=>setSt(p=>({...p,gender:g}))}
                  className="flex-1 py-3 rounded-xl font-mono text-sm capitalize transition-all"
                  style={{background:st.gender===g?"#f97316":"rgba(255,255,255,0.04)",color:st.gender===g?"#fff":"rgba(255,255,255,0.4)",border:"1px solid rgba(255,255,255,0.08)"}}>{g}</button>
              ))}
            </div>
          </div>
          <div className="col-span-2">
            <label className="text-[11px] font-mono uppercase tracking-wider text-white/40 block mb-2">Activity Level</label>
            <select value={st.activity} onChange={e=>setSt(p=>({...p,activity:parseFloat(e.target.value)}))}
              className="w-full rounded-xl px-4 py-3 text-white font-mono outline-none text-sm"
              style={{border:"1px solid rgba(255,255,255,0.1)",background:"#1a1a1a",colorScheme:"dark"}}>
              {acts.map(a=><option key={a.v} value={a.v}>{a.l}</option>)}
            </select>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[{l:"BMR",v:Math.round(bmr),s:"Mifflin-St Jeor",c:"#f97316",d:"Calories at complete rest"},
          {l:"TDEE",v:tdee,s:`×${st.activity} multiplier`,c:"#3b82f6",d:"Total daily expenditure"},
          {l:"Cut Target",v:cut,s:"−500 kcal/day",c:"#22c55e",d:"~0.5 kg/week fat loss"},
        ].map(c=>(
          <div key={c.l} className="rounded-2xl p-6" style={{background:"rgba(255,255,255,0.04)",border:`1px solid ${c.c}30`}}>
            <p className="text-[11px] font-mono uppercase tracking-widest mb-1" style={{color:c.c+"99"}}>{c.l}</p>
            <p className="text-4xl font-black mb-1" style={{color:c.c}}>{c.v.toLocaleString()}</p>
            <p className="text-xs text-white/30 font-mono">{c.s}</p>
            <p className="text-xs text-white/50 mt-3">{c.d}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl p-6" style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)"}}>
        <p className="text-[11px] font-mono uppercase tracking-widest text-white/40 mb-5">MACRO TARGETS</p>
        <div className="grid grid-cols-3 gap-6">
          {[{label:"Protein",g:Math.round(st.weight*2.2),cal:Math.round(st.weight*2.2*4),color:"#f97316",pct:35},
            {label:"Carbs",g:Math.round(cut*0.4/4),cal:Math.round(cut*0.4),color:"#3b82f6",pct:40},
            {label:"Fat",g:Math.round(cut*0.25/9),cal:Math.round(cut*0.25),color:"#eab308",pct:25},
          ].map(m=>(
            <div key={m.label} className="text-center">
              <Ring pct={m.pct} color={m.color} size={72} label={`${m.pct}%`}/>
              <p className="font-bold mt-2">{m.label}</p>
              <p className="text-lg font-black font-mono" style={{color:m.color}}>{m.g}g</p>
              <p className="text-xs text-white/30 font-mono">{m.cal} kcal</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SETTINGS PAGE
// ══════════════════════════════════════════════════════════════════════════════
function SettingsPage({ settings, setSettings }) {
  const { user, firebase } = useAuth();
  const { save }           = useUserDoc(user?.uid);
  const [busy, setBusy]    = useState(false);
  const [saved, setSaved]  = useState(false);

  const update = (k,v) => setSettings(s=>({...s,[k]:v}));

  const saveAll = async () => {
    setBusy(true);
    try { await save(settings); setSaved(true); setTimeout(()=>setSaved(false),2500); }
    catch(e) { console.error(e); }
    finally { setBusy(false); }
  };

  const signout = async () => { if(firebase) await firebase.signOut(firebase.auth); };

  const themes = [{name:"Ember",color:"#f97316"},{name:"Electric",color:"#3b82f6"},{name:"Neon",color:"#22c55e"},{name:"Rose",color:"#ec4899"},{name:"Violet",color:"#a855f7"},{name:"Cyan",color:"#06b6d4"}];
  const goals  = ["Fat Loss","Recomposition","Muscle Gain","Maintenance"];

  const Toggle = ({label,k}) => (
    <div className="flex items-center justify-between py-4" style={{borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
      <span className="text-sm font-mono">{label}</span>
      <button onClick={()=>update(k,!settings[k])}
        className="w-12 h-6 rounded-full transition-all relative flex-shrink-0"
        style={{background:settings[k]?"#f97316":"rgba(255,255,255,0.1)"}}>
        <div className="w-4 h-4 rounded-full bg-white absolute top-1 transition-all" style={{left:settings[k]?"calc(100% - 20px)":"4px"}}/>
      </button>
    </div>
  );

  return (
    <div className="space-y-8">
      <SecHead title="SETTINGS" sub={`Signed in as ${user?.email}`}
        action={
          <button onClick={signout}
            className="text-xs font-mono px-4 py-2 rounded-xl transition-all"
            style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)",color:"#f87171"}}>
            Sign Out
          </button>
        }/>

      <div className="rounded-2xl p-6" style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)"}}>
        <p className="text-[11px] font-mono uppercase tracking-widest text-white/40 mb-4">UNITS</p>
        {[["Weight Unit","weightUnit",["kg","lb"]],["Measurement","measureUnit",["cm","in"]]].map(([l,k,opts])=>(
          <div key={k} className="flex items-center justify-between py-4" style={{borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
            <span className="text-sm font-mono">{l}</span>
            <div className="flex gap-2">
              {opts.map(u=>(
                <button key={u} onClick={()=>update(k,u)}
                  className="px-4 py-1.5 rounded-lg font-mono text-sm transition-all"
                  style={{background:settings[k]===u?"#f97316":"rgba(255,255,255,0.06)",color:settings[k]===u?"#fff":"rgba(255,255,255,0.4)"}}>{u}</button>
              ))}
            </div>
          </div>
        ))}
        <Toggle label="Show calorie cards on dashboard" k="showCalories"/>
      </div>

      <div className="rounded-2xl p-6" style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)"}}>
        <p className="text-[11px] font-mono uppercase tracking-widest text-white/40 mb-4">GOAL TYPE</p>
        <div className="grid grid-cols-2 gap-3">
          {goals.map(g=>(
            <button key={g} onClick={()=>update("goal",g)}
              className="py-3 rounded-xl font-mono text-sm transition-all"
              style={{background:settings.goal===g?"#f97316":"rgba(255,255,255,0.04)",color:settings.goal===g?"#fff":"rgba(255,255,255,0.5)",border:`1px solid ${settings.goal===g?"#f97316":"rgba(255,255,255,0.08)"}`}}>{g}</button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl p-6" style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)"}}>
        <p className="text-[11px] font-mono uppercase tracking-widest text-white/40 mb-4">GYM SUBSCRIPTION</p>
        <p className="text-sm text-white/70">Plan: <span className="font-bold text-white">{settings.subscriptionPlan === "none" ? "Free" : settings.subscriptionPlan}</span></p>
        <p className="text-xs text-white/40 mt-1">Valid until: {settings.subscriptionEndDate || "Not active"}</p>
      </div>

      <div className="rounded-2xl p-6" style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)"}}>
        <p className="text-[11px] font-mono uppercase tracking-widest text-white/40 mb-4">ACCENT THEME</p>
        <div className="flex gap-4 flex-wrap">
          {themes.map(t=>(
            <button key={t.name} onClick={()=>update("accent",t.color)} className="flex flex-col items-center gap-2 transition-all hover:scale-110">
              <div className="w-10 h-10 rounded-full" style={{background:t.color, boxShadow:settings.accent===t.color?`0 0 0 3px ${t.color}40, 0 0 0 5px rgba(255,255,255,0.1)`:"none"}}/>
              <span className="text-[10px] font-mono text-white/40">{t.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl p-6" style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)"}}>
        <p className="text-[11px] font-mono uppercase tracking-widest text-white/40 mb-4">PROFILE</p>
        <div className="grid grid-cols-2 gap-4 mb-5">
          {[["Name","name","Your name"],["Goal Weight (kg)","goalWeight","75"],["Age","age","28"],["Height (cm)","height","178"]].map(([l,k,ph])=>(
            <div key={k}>
              <label className="text-[11px] font-mono uppercase tracking-wider text-white/40 block mb-2">{l}</label>
              <input type="text" placeholder={ph} value={settings[k]||""} onChange={e=>update(k,e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-white font-mono bg-transparent outline-none text-sm"
                style={{border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.04)"}}/>
            </div>
          ))}
        </div>
        <button onClick={saveAll} disabled={busy}
          className="w-full py-3 rounded-xl font-mono font-bold tracking-widest text-sm transition-all flex items-center justify-center gap-2"
          style={{background:saved?"#22c55e":"#f97316",color:"#fff",opacity:busy?0.7:1}}>
          {busy?<><Spin size={16}/>SAVING…</>:saved?"✓  SAVED TO FIRESTORE":"SAVE SETTINGS"}
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// APP SHELL
// ══════════════════════════════════════════════════════════════════════════════
function AppShell() {
  const { user, fbError } = useAuth();
  const { profile, loading: pL } = useUserDoc(user?.uid);
  const [page, setPage]   = useState("dashboard");
  const [open, setOpen]   = useState(false);
  const [settings, setSt] = useState({
    weightUnit:"kg", measureUnit:"cm", showCalories:true,
    goal:"Fat Loss", accent:"#f97316", name:"", goalWeight:"75", age:"", height:"",
    subscriptionPlan:"none", subscriptionEndDate:"", subscriptionExpiresAt:null,
  });

  useEffect(() => {
    if (profile && Object.keys(profile).length) setSt(s=>({...s,...profile}));
  }, [profile]);

  if (user===undefined || (user && pL)) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{background:"#0d0d0d"}}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg" style={{background:"#f97316"}}>F</div>
          <Spin size={28}/>
          <p className="text-white/30 text-xs font-mono tracking-widest">CONNECTING TO FIREBASE…</p>
        </div>
      </div>
    );
  }

  if (!user) return <AuthPage/>;

  const pages = { dashboard:Dashboard, weight:WeightPage, inches:InchesAnalyticsPage, gym:GymPage, calculators:CalcPage, settings:SettingsPage };
  const Page  = pages[page];
  const accent = settings.accent||"#f97316";

  return (
    <div className="min-h-screen text-white" style={{background:"#0d0d0d",fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;700;900&display=swap');
        *{box-sizing:border-box;}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px;}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.6);}
        select option{background:#1a1a1a;}
      `}</style>
      <div className="fixed inset-0 pointer-events-none"
        style={{background:`radial-gradient(ellipse at 20% 0%, ${accent}18 0%, transparent 50%), radial-gradient(ellipse at 80% 100%, ${accent}08 0%, transparent 50%)`}}/>

      {/* Mobile bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3"
        style={{background:"rgba(13,13,13,0.95)",borderBottom:"1px solid rgba(255,255,255,0.07)",backdropFilter:"blur(12px)"}}>
        <button className="text-2xl" onClick={()=>setOpen(s=>!s)}>☰</button>
        <span className="font-black tracking-widest text-sm" style={{fontFamily:"'Bebas Neue',cursive",color:accent}}>GYMRATTRACKER</span>
        <div className="w-8"/>
      </div>

      <div className="flex min-h-screen">
        <aside className={`fixed md:sticky top-0 h-screen z-40 flex flex-col transition-all duration-300 ${open?"translate-x-0":"-translate-x-full md:translate-x-0"}`}
          style={{width:220,background:"rgba(10,10,10,0.98)",borderRight:"1px solid rgba(255,255,255,0.07)",backdropFilter:"blur(16px)"}}>
          <div className="px-6 py-8">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black" style={{background:accent}}>F</div>
              <span className="font-black tracking-[0.2em]" style={{fontFamily:"'Bebas Neue',cursive",fontSize:"1.1rem"}}>GYMRATTRACKER</span>
            </div>
            <p className="text-[10px] font-mono text-white/25 mt-1 tracking-widest">PERSONAL TRACKER</p>
          </div>
          <nav className="flex-1 px-3 space-y-1">
            {NAV.map(item=>(
              <button key={item.id} onClick={()=>{setPage(item.id);setOpen(false);}}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all duration-200"
                style={page===item.id?{background:`${accent}20`,color:accent,border:`1px solid ${accent}30`}:{color:"rgba(255,255,255,0.4)",border:"1px solid transparent"}}>
                <span className="text-base">{item.icon}</span>
                <span className="text-sm font-mono font-medium tracking-wider">{item.label}</span>
                {page===item.id&&<div className="ml-auto w-1.5 h-1.5 rounded-full" style={{background:accent}}/>}
              </button>
            ))}
          </nav>
          <div className="p-4 m-3 rounded-xl" style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)"}}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{background:accent+"30",color:accent}}>
                {(settings.name||user.displayName||user.email||"U")[0].toUpperCase()}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-bold truncate">{settings.name||user.displayName||"User"}</p>
                <p className="text-[10px] font-mono text-white/30 truncate">{settings.goal}</p>
              </div>
            </div>
          </div>
        </aside>

        {open&&<div className="fixed inset-0 bg-black/60 z-30 md:hidden" onClick={()=>setOpen(false)}/>}

        <main className="flex-1 min-w-0 px-4 md:px-8 pt-20 md:pt-10 pb-12 max-w-4xl mx-auto w-full">
          <Page settings={settings} setSettings={setSt}/>
        </main>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ROOT
// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  return <AuthProvider><AppShell/></AuthProvider>;
}
