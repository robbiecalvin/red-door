export const DEFAULT_MAP_STYLE = "https://tiles.openfreemap.org/styles/dark";
export function mapStyleUrl(value: unknown): string {
  const text=typeof value==="string" && value.trim()?value.trim():DEFAULT_MAP_STYLE;
  let url: URL;
  try{url=new URL(text);}catch{throw new Error("Map style must be an absolute HTTPS URL.");}
  if(url.protocol!=="https:" || url.username || url.password || url.hash)throw new Error("Map style must use HTTPS without credentials or fragments.");
  if(url.search)throw new Error("Map style URL must not contain keys or query parameters; use an approved public style endpoint.");
  return url.toString();
}
