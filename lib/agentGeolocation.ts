export const MAX_AGENT_POSITION_AGE_MS = 30_000;
const MAX_FUTURE_POSITION_SKEW_MS = 5_000;

export function getFreshAgentCoordinates(
  position: {
    coords: Pick<GeolocationCoordinates, 'latitude' | 'longitude'>;
    timestamp: number;
  },
  now = Date.now(),
) {
  const { latitude, longitude } = position.coords;
  const age = now - position.timestamp;
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    !Number.isFinite(position.timestamp) ||
    age > MAX_AGENT_POSITION_AGE_MS ||
    age < -MAX_FUTURE_POSITION_SKEW_MS
  ) {
    return null;
  }

  return { lat: latitude, lng: longitude };
}

export function getAgentGeolocationErrorMessage(code: number) {
  switch (code) {
    case 1:
      return 'Location permission was denied. Allow location access in your browser settings to share your route.';
    case 2:
      return 'Your device could not determine a location. Check location services and try again.';
    case 3:
      return 'Location request timed out. Check your connection or location services and try again.';
    default:
      return 'Location sharing is unavailable. Check your device settings and try again.';
  }
}

/** Includes accuracy and capture time; the server independently validates every fix. */
export function getFreshAgentFix(position:GeolocationPosition,now=Date.now()){
 const point=getFreshAgentCoordinates(position,now);
 if(!point||!Number.isFinite(position.coords.accuracy)||position.coords.accuracy<=0||position.coords.accuracy>100)return null;
 return {...point,accuracy:position.coords.accuracy,capturedAt:position.timestamp};
}
export function requestPreciseAgentLocation():Promise<NonNullable<ReturnType<typeof getFreshAgentFix>>>{
 return new Promise((resolve,reject)=>{
  if(!navigator.geolocation)return reject(new Error('Location services are required to go online.'));
  navigator.geolocation.getCurrentPosition(position=>{
   const fix=getFreshAgentFix(position);
   if(fix)resolve(fix);else reject(new Error('Enable precise location and wait for GPS accuracy within 100 metres.'));
  },error=>reject(new Error(getAgentGeolocationErrorMessage(error.code))),{enableHighAccuracy:true,maximumAge:0,timeout:15000});
 });
}
