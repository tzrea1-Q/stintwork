import { useEffect, useState } from 'react'
import VariantA from './variants/A'
import VariantB from './variants/B'
import VariantC from './variants/C'
import { PrototypeSwitcher, type Settings } from './proto/PrototypeSwitcher'
import { WorkbenchProvider, useWorkbench } from './proto/store'
import { translate } from './proto/i18n'
function read():Settings {const p=new URLSearchParams(location.search);return {variant:['A','B','C'].includes(p.get('variant')||'')?p.get('variant')!:'A',theme:['light','dark','system'].includes(p.get('theme')||'')?p.get('theme')!:'system',lang:p.get('lang')==='zh-CN'?'zh-CN':'en'}}
function AppContent(){const [settings,setSettings]=useState(read);const {toast,undo,setToast}=useWorkbench();const t=(s:string)=>translate(s,settings.lang)
 function set(key:keyof Settings,value:string){setSettings(old=>{const next={...old,[key]:value};const p=new URLSearchParams(location.search);p.set(key,value);history.replaceState(null,'',`${location.pathname}?${p}`);return next})}
 useEffect(()=>{const media=matchMedia('(prefers-color-scheme: dark)');const apply=()=>document.documentElement.classList.toggle('dark',settings.theme==='dark'||settings.theme==='system'&&media.matches);apply();media.addEventListener('change',apply);return()=>media.removeEventListener('change',apply)},[settings.theme])
 useEffect(()=>{document.documentElement.lang=settings.lang},[settings.lang])
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if((e.target as HTMLElement)?.matches('input,textarea,select,[contenteditable=true]'))return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){const v=['A','B','C'];set('variant',v[(v.indexOf(settings.variant)+(e.key==='ArrowRight'?1:2))%3])}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[settings.variant])
 useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),6000);return()=>clearTimeout(timer)},[toast,setToast])
 return <>{settings.variant==='A'?<VariantA t={t}/>:settings.variant==='B'?<VariantB t={t}/>:<VariantC t={t}/>}<PrototypeSwitcher settings={settings} set={set}/>{toast&&<div className="toast-custom" key={toast} role="status">{t(toast)}<button onClick={undo}>{t('Undo')}</button><span className="toast-bar"/></div>}</>}
export default function App(){return <WorkbenchProvider><AppContent/></WorkbenchProvider>}
