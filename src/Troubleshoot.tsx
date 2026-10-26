import {useEffect, useRef} from 'react';
import {useLocation} from 'react-router-dom';
import {mountTroubleshooting} from '../products/dd84-desktop/troubleshootingUI.mjs';
import '../products/dd84-desktop/troubleshooting.css';

// Remains mounted across route changes, so a navigation click cannot discard a case.
export default function Troubleshoot() {
  const root=useRef<HTMLDivElement>(null), location=useLocation();
  useEffect(()=>mountTroubleshooting(root.current!, {externalLinks:true, save:async(value,filename)=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=filename;link.click();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    return {status:'unconfirmed'};
  }}),[]);
  return <div className="container" hidden={location.pathname!=='/troubleshoot'} ref={root}/>;
}
