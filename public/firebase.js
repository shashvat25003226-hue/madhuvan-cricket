// Firebase web config is public, not a secret. Supabase PostgreSQL is the source of match/account data.
// Firebase Analytics sends anonymized page events only after consent, never private player or score data.
const firebaseConfig = {
  apiKey: "AIzaSyCD3q4BQOJ-L3Ny1z2jr8Nq8p0495PS7gc",
  authDomain: "madhuvan-cricket.firebaseapp.com",
  projectId: "madhuvan-cricket",
  storageBucket: "madhuvan-cricket.firebasestorage.app",
  messagingSenderId: "444747162708",
  appId: "1:444747162708:web:6219a8bc0b05e393eef9c1",
  measurementId: "G-WVR4B9MV33"
};
const OPT_IN_KEY='mc_analytics_consent';
export function optedIn(){try{return localStorage.getItem(OPT_IN_KEY)==='yes'}catch{return false}}
export function setConsent(value){try{localStorage.setItem(OPT_IN_KEY,value?'yes':'no')}catch{}if(value)startFirebase()}
let analytics,log;
export async function startFirebase(){
 if(!optedIn()||navigator.doNotTrack==='1'||!window.isSecureContext)return;
 try{
  const [{initializeApp},{getAnalytics,isSupported,logEvent}]=await Promise.all([
   import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js'),
   import('https://www.gstatic.com/firebasejs/11.10.0/firebase-analytics.js')]);
  if(!(await isSupported()))return;
  analytics=getAnalytics(initializeApp(firebaseConfig));log=logEvent;
  recordPage();
 }catch(e){console.info('Firebase Analytics not available:',e.message)}
}
export function recordPage(){if(analytics&&log&&optedIn())log(analytics,'page_view',{page_path:location.hash||'#home'})}
window.mcFirebase={optedIn,setConsent,recordPage};
startFirebase();