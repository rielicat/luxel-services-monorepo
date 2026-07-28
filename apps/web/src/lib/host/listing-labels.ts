/** es-CL labels for the listing facts Hospitable mirrors from Airbnb. Curated
 *  map for the common slugs; anything unknown falls back to a prettified slug
 *  so new API values render reasonably instead of breaking. */

const AMENITIES: Record<string, string> = {
  ac: 'Aire acondicionado',
  heating: 'Calefacción',
  kitchen: 'Cocina',
  wireless_internet: 'WiFi',
  tv: 'TV',
  jacuzzi: 'Jacuzzi',
  free_parking: 'Estacionamiento gratis',
  street_parking: 'Estacionamiento en la calle',
  elevator: 'Ascensor',
  washer: 'Lavadora',
  dryer: 'Secadora',
  hot_water: 'Agua caliente',
  oven: 'Horno',
  microwave: 'Microondas',
  refrigerator: 'Refrigerador',
  mini_fridge: 'Frigobar',
  freezer: 'Congelador',
  coffee: 'Cafetera',
  iron: 'Plancha',
  hair_dryer: 'Secador de pelo',
  laptop_friendly_workspace: 'Espacio de trabajo',
  luggage_dropoff_allowed: 'Guardado de equipaje',
  long_term_stays_allowed: 'Estadías largas',
  smoke_detector: 'Detector de humo',
  carbon_monoxide_detector: 'Detector de CO',
  bbq_area: 'Zona de parrilla',
  patio: 'Patio',
  outdoor_seating: 'Terraza',
  piano: 'Piano',
  bicycle: 'Bicicletas',
};

export function amenityLabel(slug: string): string {
  return AMENITIES[slug] ?? slug.replace(/_/g, ' ');
}

const PROPERTY_TYPES: Record<string, string> = {
  apartment: 'Departamento',
  house: 'Casa',
  condominium: 'Condominio',
  loft: 'Loft',
  cabin: 'Cabaña',
  guesthouse: 'Casa de huéspedes',
  townhouse: 'Casa adosada',
};

export function propertyTypeLabel(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return PROPERTY_TYPES[slug] ?? slug.replace(/_/g, ' ');
}

const ROOM_TYPES: Record<string, string> = {
  'Entire Home': 'Alojamiento entero',
  'Private Room': 'Habitación privada',
  'Shared Room': 'Habitación compartida',
};

export function roomTypeLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return ROOM_TYPES[value] ?? value;
}
