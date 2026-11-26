import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
const key='junk-it-out-pickup-cart';
function storage(){const values=new Map<string,string>();return {getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v)},removeItem:(k:string)=>{values.delete(k)}}}
beforeEach(()=>{const win=new EventTarget();Object.assign(win,{localStorage:storage(),sessionStorage:storage()});vi.stubGlobal('window',win);vi.resetModules();});
afterEach(()=>vi.unstubAllGlobals());
describe('Persistent customer cart',()=>{
 it('restores quantities after module reload and does not depend on authentication',async()=>{let c=await import('@/lib/pickupCart');c.addToPickupCart('paper');c.updatePickupCartQuantity('paper',8);window.dispatchEvent(new Event('jio_auth_change'));vi.resetModules();c=await import('@/lib/pickupCart');expect(c.readPickupCart()).toEqual([{categoryId:'paper',quantity:8}]);});
 it('migrates the existing session cart to persistent storage once',async()=>{window.sessionStorage.setItem(key,JSON.stringify([{categoryId:'paper',quantity:4}]));const c=await import('@/lib/pickupCart');expect(c.readPickupCart()[0].quantity).toBe(4);expect(window.sessionStorage.getItem(key)).toBeNull();expect(window.localStorage.getItem(key)).toContain('paper');});
 it('keeps explicit empty carts empty after returning or reloading',async()=>{let c=await import('@/lib/pickupCart');c.addToPickupCart('paper');c.clearPickupCart();vi.resetModules();c=await import('@/lib/pickupCart');expect(c.readPickupCart()).toEqual([]);expect(window.localStorage.getItem(key)).toBe('[]');});
 it('notifies views on back navigation and other-tab changes and cleans up',async()=>{const c=await import('@/lib/pickupCart');const refresh=vi.fn(),stop=c.subscribePickupCart(refresh);window.dispatchEvent(new Event('pageshow'));const event=new Event('storage');Object.assign(event,{key});window.dispatchEvent(event);expect(refresh).toHaveBeenCalledTimes(2);stop();window.dispatchEvent(new Event('pageshow'));expect(refresh).toHaveBeenCalledTimes(2);});
 it('continues working when persistent storage is blocked',async()=>{Object.defineProperty(window,'localStorage',{get(){throw Error('blocked')}});const c=await import('@/lib/pickupCart');expect(()=>c.addToPickupCart('paper')).not.toThrow();expect(c.readPickupCart()).toEqual([{categoryId:'paper',quantity:1}]);});
});
