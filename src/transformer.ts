/**
 * Transformer for Idealista Portugal
 * Converts Property (from parser.ts) to StandardProperty format
 */

import type { Property } from './types';

/**
 * StandardProperty - Target format for Core Service API
 * (Copied from @landomo/core for standalone operation)
 */
export interface StandardProperty {
  title: string;
  price: number;
  currency: string;
  property_type: string;
  transaction_type: 'sale' | 'rent';
  source_url?: string;
  location: PropertyLocation;
  details: PropertyDetails;
  images?: string[];
  videos?: string[];
  description?: string;
  description_language?: string;
  agent?: PropertyAgent;
  features?: string[];
  amenities?: PropertyAmenities;
  energy_rating?: string;
  price_per_sqm?: number;
  hoa_fees?: number;
  property_tax?: number;
  country_specific?: Record<string, any>;
  status?: 'active' | 'removed' | 'sold' | 'rented';
}

export interface PropertyLocation {
  address?: string;
  city: string;
  region?: string;
  country: string;
  postal_code?: string;
  coordinates?: {
    lat: number;
    lon: number;
  };
  geohash?: string;
}

export interface PropertyDetails {
  bedrooms?: number;
  bathrooms?: number;
  sqm?: number;
  sqm_type?: string;
  floor?: number;
  total_floors?: number;
  rooms?: number;
  year_built?: number;
}

export interface PropertyAgent {
  name: string;
  phone?: string;
  email?: string;
  agency?: string;
  agency_logo?: string;
}

export interface PropertyAmenities {
  has_parking?: boolean;
  has_garden?: boolean;
  has_balcony?: boolean;
  has_terrace?: boolean;
  has_pool?: boolean;
  has_elevator?: boolean;
  has_garage?: boolean;
  has_basement?: boolean;
  has_fireplace?: boolean;
  is_furnished?: boolean;
  is_new_construction?: boolean;
  is_luxury?: boolean;
}

/**
 * Core Service Ingestion Payload
 */
export interface IngestionPayload {
  portal: string;
  portal_id: string;
  country: string;
  data: StandardProperty;
  raw_data: any;
}

/**
 * Transform Property to StandardProperty format
 */
export function transformToStandard(property: Property): StandardProperty {
  // Calculate price per sqm if available
  const pricePerSqm =
    property.details?.sqm && property.price > 0
      ? Math.round(property.price / property.details.sqm)
      : undefined;

  // Extract amenities from features
  const amenities = extractAmenities(property.features);

  // Build standardized property
  const standardProperty: StandardProperty = {
    title: property.title,
    price: property.price,
    currency: property.currency,
    property_type: property.propertyType,
    transaction_type: property.transactionType as 'sale' | 'rent',
    source_url: property.url,
    description: property.description,
    description_language: 'pt', // Portuguese

    location: {
      address: property.location.address,
      city: property.location.city,
      region: property.location.region,
      country: property.location.country,
      postal_code: property.location.postcode,
      coordinates: property.location.coordinates,
    },

    details: {
      bedrooms: property.details?.bedrooms,
      bathrooms: property.details?.bathrooms,
      sqm: property.details?.sqm,
      sqm_type: property.details?.sqm ? 'living' : undefined,
      floor: property.details?.floor,
      total_floors: property.details?.totalFloors,
      rooms: property.details?.rooms,
      year_built: property.details?.constructionYear,
    },

    images: property.images,
    features: property.features,
    amenities,
    price_per_sqm: pricePerSqm,

    // Agent information
    agent: property.agent
      ? {
          name: property.agent.name || 'Unknown',
          phone: property.agent.phone,
          email: property.agent.email,
          agency: property.agent.agency,
        }
      : undefined,

    // Portugal-specific fields
    country_specific: buildCountrySpecific(property),

    status: 'active',
  };

  return standardProperty;
}

/**
 * Extract amenities from features array
 */
function extractAmenities(features: string[]): PropertyAmenities {
  const featuresLower = features.map((f) => f.toLowerCase());

  return {
    has_parking: featuresLower.some((f) =>
      ['parking', 'garagem', 'estacionamento', 'garage'].some((term) =>
        f.includes(term)
      )
    ),
    has_garden: featuresLower.some((f) =>
      ['garden', 'jardim'].some((term) => f.includes(term))
    ),
    has_balcony: featuresLower.some((f) =>
      ['balcony', 'balcão', 'varanda'].some((term) => f.includes(term))
    ),
    has_terrace: featuresLower.some((f) =>
      ['terrace', 'terraço', 'terrace'].some((term) => f.includes(term))
    ),
    has_pool: featuresLower.some((f) =>
      ['pool', 'piscina', 'swimming'].some((term) => f.includes(term))
    ),
    has_elevator: featuresLower.some((f) =>
      ['elevator', 'elevador', 'lift', 'ascensor'].some((term) =>
        f.includes(term)
      )
    ),
    has_garage: featuresLower.some((f) =>
      ['garage', 'garagem'].some((term) => f.includes(term))
    ),
    has_basement: featuresLower.some((f) =>
      ['basement', 'cave', 'subsolo'].some((term) => f.includes(term))
    ),
    has_fireplace: featuresLower.some((f) =>
      ['fireplace', 'lareira', 'chimenea'].some((term) => f.includes(term))
    ),
    is_furnished: featuresLower.some((f) =>
      ['furnished', 'mobilado', 'amueblado'].some((term) => f.includes(term))
    ),
    is_new_construction: featuresLower.some((f) =>
      ['new development', 'nova construção', 'obra nova'].some((term) =>
        f.includes(term)
      )
    ),
    is_luxury: featuresLower.some((f) =>
      ['luxury', 'luxo', 'premium'].some((term) => f.includes(term))
    ),
  };
}

/**
 * Build Portugal-specific fields
 */
function buildCountrySpecific(property: Property): Record<string, any> {
  const specific: Record<string, any> = {};

  // Add any additional metadata
  if (property.metadata) {
    Object.assign(specific, property.metadata);
  }

  // Add source info
  specific.source_portal = property.source || 'idealista_portugal';

  // Add scraped timestamp
  if (property.scrapedAt) {
    specific.scraped_at = property.scrapedAt;
  }

  // Add agent privacy info
  if (property.agent?.isPrivate !== undefined) {
    specific.private_owner = property.agent.isPrivate;
  }

  // Add available from date if present
  if (property.details?.availableFrom) {
    specific.available_from = property.details.availableFrom;
  }

  return specific;
}

/**
 * Create ingestion payload for Core Service API
 */
export function createIngestionPayload(property: Property): IngestionPayload {
  return {
    portal: 'idealista',
    portal_id: property.id,
    country: 'portugal',
    data: transformToStandard(property),
    raw_data: property,
  };
}

/**
 * Batch transform multiple properties
 */
export function transformBatch(properties: Property[]): StandardProperty[] {
  return properties.map(transformToStandard);
}

/**
 * Batch create ingestion payloads
 */
export function createIngestionPayloadBatch(
  properties: Property[]
): IngestionPayload[] {
  return properties.map(createIngestionPayload);
}
