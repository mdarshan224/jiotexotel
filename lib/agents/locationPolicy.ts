import { calculateDistanceKm } from '@/lib/geofence';
export const LOCATION_LEASE_MS = 90_000;
export const CITY_PROOF_MS = 120_000;
export const CITY_PROOF_RADIUS_METERS = 250;
export const MAX_GPS_ACCURACY_METERS = 100;
export const ONLINE_AGENT_STATUSES=['AVAILABLE','ASSIGNED','EN_ROUTE','ARRIVED','WEIGHING','ON_DUTY','BUSY'];
export const ACTIVE_PICKUP_STATUSES = ['AGENT_ASSIGNED','AGENT_ACCEPTED','AGENT_ON_WAY','AGENT_ARRIVED','WASTE_VERIFICATION','WEIGHING'];
export type AgentFix = { lat:number; lng:number; accuracy:number; capturedAt:number };
export class AgentLocationError extends Error {
  constructor(public code:string, message:string, public status=409){super(message);}
}
export function meters(a:{lat:number;lng:number},b:{lat:number;lng:number}){
  return calculateDistanceKm(a.lat,a.lng,b.lat,b.lng)*1000;
}
function time(value:unknown){return value instanceof Date?value.getTime():typeof value==='string'?Date.parse(value):NaN;}
/** Conservative operating bounds, combined with server-side Google locality verification.
 * This rectangle alone is NOT a city boundary or proof of physical presence.
 */
export function withinBengaluruBounds(fix:{lat:number;lng:number;accuracy?:number}){
  const buffer=(fix.accuracy ?? 0)/100_000;
  return fix.lat > 12.80+buffer && fix.lat < 13.18-buffer && fix.lng > 77.45+buffer && fix.lng < 77.78-buffer;
}
export function parseAgentFix(body:any,now=Date.now()):AgentFix{
  if(body?.mocked===true || body?.isMock===true || body?.developerMode===true)
    throw new AgentLocationError('LOCATION_UNTRUSTED','Mock location or developer mode was reported. Use an unmodified device location.');
  const f={lat:body?.lat,lng:body?.lng,accuracy:body?.accuracy,capturedAt:body?.capturedAt};
  if(!Object.values(f).every(v=>typeof v==='number'&&Number.isFinite(v)) || f.lat < -90 || f.lat > 90 || f.lng < -180 || f.lng > 180)
    throw new AgentLocationError('LOCATION_REQUIRED','Allow precise location and wait for a fresh GPS reading.');
  if(f.accuracy<=0 || f.accuracy>MAX_GPS_ACCURACY_METERS)
    throw new AgentLocationError('LOCATION_INACCURATE','Precise GPS within 100 metres is required. Enable precise location and try again.');
  if(now-f.capturedAt>30_000 || f.capturedAt-now>5_000)
    throw new AgentLocationError('LOCATION_STALE','A fresh GPS reading is required. Check your device clock and location settings.');
  if(!withinBengaluruBounds(f))
    throw new AgentLocationError('OUTSIDE_BENGALURU','You must be in Bengaluru to go online and receive pickups.');
  return f;
}
export function assertPlausibleMovement(agent:any,fix:AgentFix,now=Date.now()){
  const previous=time(agent.locationCapturedAt);
  if(!Number.isFinite(previous))return;
  if(fix.capturedAt<=previous)throw new AgentLocationError('LOCATION_REPLAY','This location reading has already been used. Wait for a new GPS reading.');
  const elapsed=(fix.capturedAt-previous)/1000;
  if(now-time(agent.locationReceivedAt)<10*60_000 && meters({lat:agent.currentLat,lng:agent.currentLng},fix)>elapsed*55+250+(agent.locationAccuracy||0)+fix.accuracy)
    throw new AgentLocationError('LOCATION_IMPLAUSIBLE','A sudden GPS jump was detected. Check device location and try again.');
}
export function hasCurrentCityProof(agent:any,fix:{lat:number;lng:number},now=Date.now()){
 const at=time(agent.bengaluruVerifiedAt);
 return Number.isFinite(at)&&at<=now&&now-at<=CITY_PROOF_MS&&
 typeof agent.bengaluruVerifiedLat==='number'&&typeof agent.bengaluruVerifiedLng==='number'&&
 meters({lat:agent.bengaluruVerifiedLat,lng:agent.bengaluruVerifiedLng},fix)<=CITY_PROOF_RADIUS_METERS;
}
export function hasFreshAgentPresence(agent:any,now=Date.now()){
 const received=time(agent.locationReceivedAt),captured=time(agent.locationCapturedAt);
 return Number.isFinite(received)&&received<=now&&now-received<=LOCATION_LEASE_MS&&
 Number.isFinite(captured)&&captured<=now+5000&&now-captured<=LOCATION_LEASE_MS&&
 typeof agent.locationAccuracy==='number'&&agent.locationAccuracy>0&&agent.locationAccuracy<=MAX_GPS_ACCURACY_METERS&&
 Number.isFinite(agent.currentLat)&&Number.isFinite(agent.currentLng)&&
 withinBengaluruBounds({lat:agent.currentLat,lng:agent.currentLng,accuracy:agent.locationAccuracy})&&
 hasCurrentCityProof(agent,{lat:agent.currentLat,lng:agent.currentLng},now);
}
export const AGENT_PRESENCE_SELECT = {
 id:true,status:true,serviceAreas:true,currentLat:true,currentLng:true,locationAccuracy:true,
 locationCapturedAt:true,locationReceivedAt:true,bengaluruVerifiedAt:true,bengaluruVerifiedLat:true,bengaluruVerifiedLng:true,
} as const;
