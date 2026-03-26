export type LngLat = Readonly<{
  lng: number;
  lat: number;
}>;

export type MapMarker = Readonly<{
  id: string;
  position: LngLat;
  color: string;
  markerType?: "user" | "spot" | "group";
  markerGlyph?: string;
  label?: string;
  imageUrl?: string;
  onClick?: () => void;
  draggable?: boolean;
  onDragEnd?: (position: LngLat) => void;
}>;

export type MapViewOptions = Readonly<{
  center: LngLat;
  zoom: number;
}>;
