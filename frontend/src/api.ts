const API_URL='http://127.0.0.1:8000'
const TOKEN_KEY='folio_access_token'
export const auth={token:()=>localStorage.getItem(TOKEN_KEY),setToken:(value:string)=>localStorage.setItem(TOKEN_KEY,value),clear:()=>localStorage.removeItem(TOKEN_KEY),google:()=>location.assign(`${API_URL}/auth/google`)}
export async function api<T>(path:string,options:RequestInit={}){const headers=new Headers(options.headers);headers.set('Content-Type','application/json');const token=auth.token();if(token)headers.set('Authorization',`Bearer ${token}`);const response=await fetch(API_URL+path,{...options,headers});if(!response.ok)throw new Error((await response.json().catch(()=>({detail:'Request failed'}))).detail||'Request failed');return response.status===204?undefined as T:response.json() as Promise<T>}
