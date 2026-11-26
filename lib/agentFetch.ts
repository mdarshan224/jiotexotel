/** Select the partner cookie explicitly, including in native apps without Referer. */
export function agentFetch(path:string,init?:RequestInit){
 if(!path.startsWith('/api/'))throw new Error('Invalid partner API path.');
 const headers=new Headers(init?.headers);headers.set('X-Jio-Portal','agent');
 return fetch(path,{credentials:'same-origin',...init,headers});
}
