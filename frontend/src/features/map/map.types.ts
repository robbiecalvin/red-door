export type LngLat = Readonly<{
  lng: number;
  lat: number;
}>;

export type MapMarker = Readonly<{
  id: string;
  position: LngLat;
  color: string;
  markerType?: "user" | "spot";
  markerGlyph?: string;
  label?: string;
  imageUrl?: string;
  onClick?: () => void;
}>;

export type MapViewOptions = Readonly<{
  center: LngLat;
  zoom: number;
}>;
