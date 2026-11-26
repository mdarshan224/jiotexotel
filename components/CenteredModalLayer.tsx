'use client';
import {useEffect, useRef, useState, type Ref, type HTMLAttributes} from 'react';
import {createPortal} from 'react-dom';
let locks = 0;
let previousOverflow = '';
/** Body portal avoids transformed page containers trapping fixed dialogs. */
export default function CenteredModalLayer({children,className='',style,ref:forwardedRef,...props}:HTMLAttributes<HTMLDivElement>&{ref?:Ref<HTMLDivElement>}){
 const [mounted,setMounted]=useState(false);
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{setMounted(true);},[]);
 useEffect(()=>{
  if(!mounted) return;
  const root=ref.current!;
  const previous=document.activeElement as HTMLElement|null;
  if(locks++===0){previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';}
  const resize=()=>{
   const v=window.visualViewport;
   root.style.top=`${v?.offsetTop||0}px`;
   root.style.height=`${v?.height||window.innerHeight}px`;
  };
  resize();window.visualViewport?.addEventListener('resize',resize);window.visualViewport?.addEventListener('scroll',resize);window.addEventListener('resize',resize);
  root.focus({preventScroll:true});
  const trap=(e:KeyboardEvent)=>{
   if(e.key!=='Tab')return;
   const items=Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')).filter(el=>el.getClientRects().length>0);
   const first=items[0],last=items[items.length-1];
   if(!first){e.preventDefault();return;}
   if(e.shiftKey&&(document.activeElement===first||document.activeElement===root)){e.preventDefault();last.focus();}
   else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===root)){e.preventDefault();first.focus();}
  };
  root.addEventListener('keydown',trap);
  return ()=>{window.visualViewport?.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('scroll',resize);window.removeEventListener('resize',resize);root.removeEventListener('keydown',trap);if(--locks===0)document.body.style.overflow=previousOverflow;if(previous?.isConnected)previous.focus({preventScroll:true});};
 },[mounted]);
 if(!mounted)return null;
 return createPortal(<div {...props} ref={node=>{ref.current=node;if(typeof forwardedRef==='function')forwardedRef(node);else if(forwardedRef)(forwardedRef as {current:HTMLDivElement|null}).current=node;}} tabIndex={-1} style={style} className={`jio-centered-modal ${className}`}>{children}</div>,document.body);
}
