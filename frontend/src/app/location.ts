export async function permittedLocation(geo: Geolocation | undefined = navigator.geolocation): Promise<{lat:number;lng:number}|null> {
  if(!geo)return null;
  return new Promise(resolve=>geo.getCurrentPosition(position=>{
    const lat=position.coords.latitude,lng=position.coords.longitude;
    resolve(Number.isFinite(lat)&&Math.abs(lat)<=90&&Number.isFinite(lng)&&Math.abs(lng)<=180?{lat,lng}:null);
  },()=>resolve(null),{enableHighAccuracy:false,timeout:12000,maximumAge:30000}));
}
