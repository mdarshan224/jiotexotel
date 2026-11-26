import { AgentFix, AgentLocationError, hasCurrentCityProof } from './locationPolicy';
/** Never accepts a city name supplied by the agent. Missing/failed Google verification fails closed. */
export async function verifyBengaluruLocality(agent:any,fix:AgentFix,providerFetch:typeof fetch=fetch){
 if(hasCurrentCityProof(agent,fix))return null;
 const key=process.env.GOOGLE_MAPS_API_KEY?.trim();
 if(!key)throw new AgentLocationError('LOCATION_VERIFICATION_UNAVAILABLE','City verification is unavailable. Please contact support.',503);
 try{
  const url=new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('latlng',`${fix.lat},${fix.lng}`);url.searchParams.set('key',key);
  url.searchParams.set('result_type','locality');url.searchParams.set('language','en');
  const response=await providerFetch(url,{signal:AbortSignal.timeout(8000),redirect:'error'});
  if(!response.ok)throw new Error('provider');
  const data=await response.json();
  if(data.status!=='OK')throw new Error('provider');
  const city=data.results?.some((result:any)=>{
    const parts=result.address_components;
    return Array.isArray(parts)&&parts.some((p:any)=>p.types?.includes('country')&&p.short_name==='IN')&&
      parts.some((p:any)=>p.types?.includes('locality')&&/^(bengaluru|bangalore)$/i.test(p.long_name?.trim()||''));
  });
  if(!city)throw new AgentLocationError('OUTSIDE_BENGALURU','Your device location must be verified as Bengaluru before going online.');
  return {bengaluruVerifiedAt:new Date(),bengaluruVerifiedLat:fix.lat,bengaluruVerifiedLng:fix.lng};
 }catch(error){
  if(error instanceof AgentLocationError)throw error;
  // Do not log request URLs: they contain the Maps credential and precise GPS.
  throw new AgentLocationError('LOCATION_VERIFICATION_UNAVAILABLE','Could not verify your city. Check location and try again.',503);
 }
}
