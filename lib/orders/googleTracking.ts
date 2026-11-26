export function decodePolyline(encoded:string){
 if(encoded.length>100000)throw new Error('Route too large');
 const points:{lat:number;lng:number}[]=[];let index=0,lat=0,lng=0;
 function value(){let result=0,shift=0,byte;do{if(index>=encoded.length||shift>30)throw new Error('Invalid route');byte=encoded.charCodeAt(index++)-63;if(byte<0||byte>63)throw new Error('Invalid route');result|=(byte&31)<<shift;shift+=5;}while(byte>=32);return result&1?~(result>>1):result>>1;}
 while(index<encoded.length){lat+=value();lng+=value();points.push({lat:lat/1e5,lng:lng/1e5});if(points.length>20000)throw new Error('Route too large');}return points;
}
export const TRACKING_STATUSES=['AGENT_ACCEPTED','AGENT_ON_WAY','AGENT_ARRIVED','WASTE_VERIFICATION','WEIGHING'];
export async function getTrackingRoute(client:any,orderId:string,customerId:string,providerFetch:typeof fetch=fetch){
 const order=await client.order.findUnique({where:{id:orderId},include:{address:true}});
 if(!order||order.customerId!==customerId)return {status:'NOT_FOUND'};
 if(!order.agentId||!TRACKING_STATUSES.includes(order.status))return {status:'WAITING_FOR_AGENT',etaMinutes:null,points:[]};
 const loc=await client.agentLocation.findFirst({where:{agentId:order.agentId,orderId},orderBy:{timestamp:'desc'}});
 if(!loc||Date.now()-new Date(loc.timestamp).getTime()>120000)return {status:'GPS_UNAVAILABLE',etaMinutes:null,points:[]};
 const position={lat:loc.lat,lng:loc.lng,timestamp:loc.timestamp};
 const cached=await client.trackingRoute.findUnique({where:{orderId}});
 const fresh=cached?.agentId===order.agentId&&Date.now()-new Date(cached.computedAt).getTime()<45000;
 function result(route:any){return {status:'LIVE',position,etaMinutes:Math.max(1,Math.ceil(route.durationSeconds/60)),distanceMeters:route.distanceMeters,computedAt:route.computedAt,points:decodePolyline(route.encodedPolyline)};}
 if(fresh)return result(cached);
 const key=process.env.GOOGLE_MAPS_API_KEY?.trim();if(!key)return {status:'ETA_UNAVAILABLE',position,etaMinutes:null,points:[]};
 // A short durable lease bounds billable requests across customer tabs and Workers.
 const claim=await client.$transaction(async(tx:any)=>{
  const current=await tx.trackingRoute.findUnique({where:{orderId}});
  if(current?.refreshClaimedAt&&Date.now()-new Date(current.refreshClaimedAt).getTime()<20000)return false;
  const data={agentId:order.agentId,sourceLat:loc.lat,sourceLng:loc.lng,locationAt:loc.timestamp,refreshClaimedAt:new Date()};
  await tx.trackingRoute.upsert({where:{orderId},update:data,create:{orderId,...data,encodedPolyline:'',durationSeconds:0,distanceMeters:0,computedAt:new Date(0)}});return true;
 });
 if(!claim)return {status:'ETA_UPDATING',position,etaMinutes:null,points:[]};
 try{
  const r=await providerFetch('https://routes.googleapis.com/directions/v2:computeRoutes',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline'},body:JSON.stringify({origin:{location:{latLng:{latitude:loc.lat,longitude:loc.lng}}},destination:{location:{latLng:{latitude:order.address.lat,longitude:order.address.lng}}},travelMode:'DRIVE',routingPreference:'TRAFFIC_AWARE',polylineQuality:'OVERVIEW'}),signal:AbortSignal.timeout(10000),redirect:'manual'});
  if(!r.ok)throw new Error('Google routing unavailable');const j=await r.json();const route=j.routes?.[0];const seconds=Number(String(route?.duration||'').replace(/s$/,''));
  if(!Number.isFinite(seconds)||seconds<0||!Number.isFinite(route?.distanceMeters)||typeof route?.polyline?.encodedPolyline!=='string')throw new Error('Invalid Google route');
  decodePolyline(route.polyline.encodedPolyline);
  const saved=await client.trackingRoute.update({where:{orderId},data:{agentId:order.agentId,encodedPolyline:route.polyline.encodedPolyline,durationSeconds:Math.ceil(seconds),distanceMeters:route.distanceMeters,computedAt:new Date(),refreshClaimedAt:null}});
  // Recheck assignment after the network call; never expose a previous agent's live position.
  const current=await client.order.findUnique({where:{id:orderId}});if(current?.agentId!==order.agentId||!TRACKING_STATUSES.includes(current.status))return {status:'GPS_UNAVAILABLE',etaMinutes:null,points:[]};
  return result(saved);
 }catch{return {status:'ETA_UNAVAILABLE',position,etaMinutes:null,points:[]};}
}
