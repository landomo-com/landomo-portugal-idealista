import { createLogger } from './logger';
/**
 * Parser for Idealista.pt __NEXT_DATA__ JSON structure
 *
 * Extracts property information from the Next.js data embedded in the page HTML.
 * Note: Structure is identical to Idealista Italy/Spain
 */

import type { Property } from './types';

const logger = createLogger('module');

const SOURCE = 'idealista_portugal';
const COUNTRY = 'Portugal';
const CURRENCY = 'EUR';
const BASE_URL = 'https://www.idealista.pt';

/**
 * Idealista property item structure from __NEXT_DATA__
 */
export interface IdealistaPropertyItem {
  propertyCode?: string;
  thumbnail?: string;
  externalReference?: string;
  numPhotos?: number;
  floor?: string;
  price?: number;
  propertyType?: string;
  operation?: string;
  size?: number;
  exterior?: boolean;
  rooms?: number;
  bathrooms?: number;
  address?: string;
  province?: string;
  municipality?: string;
  district?: string;
  country?: string;
  neighborhood?: string;
  latitude?: number;
  longitude?: number;
  description?: string;
  detailedType?: {
    typology?: string;
    subTypology?: string;
  };
  status?: string;
  newDevelopment?: boolean;
  hasVideo?: boolean;
  has3DTour?: boolean;
  hasPlan?: boolean;
  hasLift?: boolean;
  parkingSpace?: {
    hasParkingSpace?: boolean;
    isParkingSpaceIncludedInPrice?: boolean;
  };
  priceInfo?: {
    price?: {
      amount?: number;
      currencySuffix?: string;
    };
  };
  parkingSpacePrice?: {
    amount?: number;
  };
  priceByArea?: number;
  detailedType_typology?: string;
  suggestedTexts?: {
    subtitle?: string;
    title?: string;
  };
  hasParkingSpace?: boolean;
  isParkingSpaceIncludedInPrice?: boolean;
  url?: string;
  distance?: string;
  hasSwimmingPool?: boolean;
  hasTerrace?: boolean;
  hasGarden?: boolean;
  highlight?: {
    type?: string;
  };
  labels?: Array<{ type?: string; text?: string }>;
}

/**
 * Idealista search data structure
 */
export interface IdealistaSearchData {
  elementList?: IdealistaPropertyItem[];
  total?: number;
  totalPages?: number;
  currentPage?: number;
  actualPage?: number;
}

/**
 * Idealista __NEXT_DATA__ structure
 */
export interface IdealistaNextData {
  props?: {
    pageProps?: {
      searchData?: IdealistaSearchData;
      [key: string]: any;
    };
    [key: string]: any;
  };
  page?: string;
  query?: Record<string, any>;
  buildId?: string;
  [key: string]: any;
}

/**
 * Clean and normalize text
 */
function cleanText(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Parse floor string to number
 */
function parseFloor(floor?: string): number | undefined {
  if (!floor) return undefined;
  const cleaned = floor.toLowerCase().trim();

  // Map Portuguese floor terms
  if (cleaned.includes('r/c') || cleaned.includes('rés') || cleaned.includes('térr')) return 0;
  if (cleaned.includes('cave') || cleaned.includes('subsolo')) return -1;
  if (cleaned.includes('sótão') || cleaned.includes('ático')) return 99; // Top floor indicator

  // Extract number
  const match = cleaned.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : undefined;
}

/**
 * Map Idealista property type to standard type
 */
function mapPropertyType(propertyType?: string, typology?: string): string {
  const type = (propertyType || typology || '').toLowerCase();

  if (type.includes('flat') || type.includes('apartamento') || type.includes('apartment')) {
    return 'apartment';
  }
  if (type.includes('moradia') || type.includes('villa') || type.includes('chalet')) return 'villa';
  if (type.includes('house') || type.includes('casa')) return 'house';
  if (type.includes('penthouse') || type.includes('cobertura')) return 'penthouse';
  if (type.includes('duplex')) return 'duplex';
  if (type.includes('studio') || type.includes('t0')) return 'studio';
  if (type.includes('loft')) return 'loft';
  if (type.includes('office') || type.includes('escritório')) return 'office';
  if (type.includes('premises') || type.includes('loja')) return 'commercial';
  if (type.includes('garage') || type.includes('garagem')) return 'garage';
  if (type.includes('parking') || type.includes('estacionamento')) return 'parking';
  if (type.includes('building') || type.includes('prédio')) return 'building';
  if (type.includes('land') || type.includes('terreno')) return 'land';

  return 'other';
}

/**
 * Map operation to transaction type
 */
function mapTransactionType(operation?: string): string {
  const op = (operation || '').toLowerCase();

  if (op.includes('sale') || op.includes('comprar') || op.includes('venda')) {
    return 'sale';
  }
  if (op.includes('rent') || op.includes('arrendar') || op.includes('alugar')) {
    return 'rent';
  }

  return 'sale'; // default
}

/**
 * Extract features from property item
 */
function extractFeatures(item: IdealistaPropertyItem): string[] {
  const features: string[] = [];

  if (item.exterior) features.push('exterior');
  if (item.hasLift) features.push('elevator');
  if (item.hasParkingSpace) features.push('parking');
  if (item.hasSwimmingPool) features.push('swimming pool');
  if (item.hasTerrace) features.push('terrace');
  if (item.hasGarden) features.push('garden');
  if (item.hasVideo) features.push('video available');
  if (item.has3DTour) features.push('3D tour');
  if (item.hasPlan) features.push('floor plan');
  if (item.newDevelopment) features.push('new development');

  // Add labels
  if (item.labels) {
    item.labels.forEach((label) => {
      if (label.text) {
        features.push(label.text.toLowerCase());
      }
    });
  }

  return features;
}

/**
 * Build property URL
 */
function buildPropertyUrl(propertyCode?: string, url?: string): string {
  if (url) {
    // If URL is relative, make it absolute
    if (url.startsWith('/')) {
      return `${BASE_URL}${url}`;
    }
    if (url.startsWith('http')) {
      return url;
    }
  }

  if (propertyCode) {
    return `${BASE_URL}/imovel/${propertyCode}/`;
  }

  return BASE_URL;
}

/**
 * Parse a single property item from Idealista data
 */
function parsePropertyItem(
  item: IdealistaPropertyItem,
  location: string
): Property {
  const price = item.price || item.priceInfo?.price?.amount || 0;
  const propertyType = mapPropertyType(
    item.propertyType,
    item.detailedType?.typology || item.detailedType_typology
  );
  const transactionType = mapTransactionType(item.operation);

  // Build address from available fields
  const addressParts = [
    item.address,
    item.neighborhood,
    item.district,
    item.municipality,
  ].filter(Boolean);

  const property: Property = {
    id: item.propertyCode || item.externalReference || `idealista-${Date.now()}`,
    source: SOURCE,
    url: buildPropertyUrl(item.propertyCode, item.url),
    title: cleanText(item.suggestedTexts?.title || item.address) || 'Property in Portugal',
    price,
    currency: CURRENCY,
    propertyType,
    transactionType,
    location: {
      address: addressParts.length > 0 ? addressParts.join(', ') : undefined,
      city: item.municipality || location,
      region: item.province,
      country: COUNTRY,
      coordinates:
        item.latitude && item.longitude
          ? { lat: item.latitude, lon: item.longitude }
          : undefined,
    },
    details: {
      bedrooms: item.rooms,
      bathrooms: item.bathrooms,
      sqm: item.size,
      floor: parseFloor(item.floor),
      rooms: item.rooms,
    },
    features: extractFeatures(item),
    images: item.thumbnail ? [item.thumbnail] : [],
    description: cleanText(
      item.description || item.suggestedTexts?.subtitle
    ),
    scrapedAt: new Date().toISOString(),
  };

  return property;
}

/**
 * Parse __NEXT_DATA__ and extract all properties
 */
export function parseNextData(
  nextData: IdealistaNextData,
  location: string
): Property[] {
  try {
    const elementList =
      nextData?.props?.pageProps?.searchData?.elementList || [];

    if (elementList.length === 0) {
      logger.warn('[idealista-parser] No properties found in Next.js data');
      return [];
    }

    const properties = elementList
      .map((item) => {
        try {
          return parsePropertyItem(item, location);
        } catch (error) {
          logger.error('[idealista-parser] Error parsing property item:', error);
          return null;
        }
      })
      .filter((p): p is Property => p !== null);

    logger.info(`[idealista-parser] Parsed ${properties.length} properties`);
    return properties;
  } catch (error) {
    logger.error('[idealista-parser] Error parsing Next.js data:', error);
    return [];
  }
}

/**
 * Extract search metadata from Next.js data
 */
export function extractSearchMetadata(nextData: IdealistaNextData): {
  total: number;
  currentPage: number;
  totalPages: number;
} {
  const searchData = nextData?.props?.pageProps?.searchData;

  return {
    total: searchData?.total || 0,
    currentPage: searchData?.currentPage || searchData?.actualPage || 1,
    totalPages: searchData?.totalPages || 1,
  };
}
