import { createLogger } from './logger';
/**
 * Idealista.pt Scraper
 *
 * Extracts property listings by parsing __NEXT_DATA__ JSON from the HTML.
 * Uses stealth Playwright with DataDome bypass capabilities.
 *
 * URL Pattern: https://www.idealista.pt/{transaction}-{type}/{location}/
 *
 * Protection: DataDome - residential/mobile proxies recommended
 * Set environment variables:
 *   PROXY_SERVER=http://proxy:port
 *   PROXY_USERNAME=user
 *   PROXY_PASSWORD=pass
 */

import { Browser, BrowserContext, Page, chromium } from 'playwright';
import { load } from 'cheerio';
import {
  applyStealthConfig,
  applyPageStealth,
  humanScroll,
  humanClick,
  bypassDataDome,
} from './stealth';
import type { Property } from './types';
import { delay as sleep } from './utils';
import { parseNextData, IdealistaNextData } from './parser.js';

const BASE_URL = 'https://www.idealista.pt';

// Popular Portuguese locations for property searches
export const PORTUGUESE_LOCATIONS = [
  'lisboa',
  'porto',
  'faro',
  'braga',
  'coimbra',
  'funchal',
  'setubal',
  'aveiro',
  'evora',
  'leiria',
  'cascais',
  'sintra',
  'matosinhos',
  'almada',
  'portimao',
];

export interface ScraperOptions {
  headless?: boolean;
  minDelayMs?: number;
  maxDelayMs?: number;
  proxy?: {
    server: string;
    username?: string;
    password?: string;
  };
}

export interface ScrapeResult {
  properties: Property[];
  totalFound: number;
  currentPage: number;
  hasNextPage: boolean;
}

export class IdealistaScraper {
  private logger = createLogger(this.constructor.name);
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private options: ScraperOptions;

  constructor(options: ScraperOptions = {}) {
    this.options = {
      headless: options.headless ?? true,
      minDelayMs: options.minDelayMs ?? 2000,
      maxDelayMs: options.maxDelayMs ?? 4000,
      proxy: options.proxy,
    };

    if (this.options.proxy) {
      this.logger.info(`[idealista] Using proxy: ${this.options.proxy.server}`);
    } else {
      this.logger.warn('[idealista] No proxy configured - DataDome may block datacenter IPs');
    }
  }

  /**
   * Initialize browser with stealth settings
   */
  async initialize(): Promise<void> {
    this.logger.info('[idealista] Initializing stealth browser...');

    // Launch options
    const launchOptions: Parameters<typeof chromium.launch>[0] = {
      headless: this.options.headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-infobars',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1920,1080',
        '--lang=pt-PT',
      ],
      ignoreDefaultArgs: ['--enable-automation'],
    };

    // Add proxy if configured
    if (this.options.proxy) {
      launchOptions.proxy = {
        server: this.options.proxy.server,
        username: this.options.proxy.username,
        password: this.options.proxy.password,
      };
    }

    this.browser = await chromium.launch(launchOptions);

    // Create context with Portuguese locale
    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      locale: 'pt-PT',
      timezoneId: 'Europe/Lisbon',
      geolocation: { latitude: 38.7223, longitude: -9.1393 }, // Lisbon
      permissions: ['geolocation'],
      extraHTTPHeaders: {
        'Accept-Language': 'pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      },
    });

    // Apply stealth configuration
    await applyStealthConfig(this.context, {
      locale: 'pt-PT',
      timezone: 'Europe/Lisbon',
      geolocation: { latitude: 38.7223, longitude: -9.1393 },
    });

    this.page = await this.context.newPage();
    await applyPageStealth(this.page);

    this.logger.info('[idealista] Browser initialized');
  }

  /**
   * Close browser and cleanup
   */
  async close(): Promise<void> {
    if (this.page) await this.page.close();
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
    this.logger.info('[idealista] Browser closed');
  }

  /**
   * Handle cookie consent banners
   */
  private async handleCookieConsent(): Promise<void> {
    if (!this.page) return;

    const cookieSelectors = [
      // Didomi (used by Idealista)
      '#didomi-notice-agree-button',
      '[id*="didomi"] button[class*="agree"]',
      // Portuguese accept buttons
      'button:has-text("Aceitar")',
      'button:has-text("Aceito")',
      'button:has-text("Aceitar tudo")',
      'button:has-text("Concordo")',
      // English accept buttons
      'button:has-text("Accept")',
      'button:has-text("Accept all")',
      // Generic patterns
      'button[id*="accept"]',
      'button[class*="accept"]',
    ];

    for (const selector of cookieSelectors) {
      try {
        const element = this.page.locator(selector).first();
        if (await element.isVisible({ timeout: 2000 }).catch(() => false)) {
          await humanClick(this.page, selector);
          this.logger.info('[idealista] Accepted cookie consent');
          await sleep(500);
          return;
        }
      } catch {
        // Continue to next selector
      }
    }
  }

  /**
   * Build search URL for a location
   */
  private buildSearchUrl(
    location: string,
    transactionType: 'sale' | 'rent' = 'sale',
    page: number = 1
  ): string {
    // Portuguese URL slugs: comprar-casas (buy) / arrendar-casas (rent)
    const typeSlug = transactionType === 'sale' ? 'comprar-casas' : 'arrendar-casas';
    const pageSlug = page > 1 ? `pagina-${page}.html` : '';
    return `${BASE_URL}/${typeSlug}/${location}/${pageSlug}`;
  }

  /**
   * Extract __NEXT_DATA__ JSON from page HTML
   */
  private extractNextData(html: string): IdealistaNextData | null {
    try {
      const $ = load(html);
      const scriptTag = $('#__NEXT_DATA__');

      if (scriptTag.length === 0) {
        this.logger.error('[idealista] __NEXT_DATA__ script tag not found');
        return null;
      }

      const jsonText = scriptTag.html();
      if (!jsonText) {
        this.logger.error('[idealista] __NEXT_DATA__ script tag is empty');
        return null;
      }

      const data = JSON.parse(jsonText) as IdealistaNextData;
      return data;
    } catch (error) {
      this.logger.error('[idealista] Failed to extract __NEXT_DATA__:', error);
      return null;
    }
  }

  /**
   * Scrape a single page of listings
   */
  async scrapePage(
    location: string,
    transactionType: 'sale' | 'rent' = 'sale',
    pageNumber: number = 1
  ): Promise<ScrapeResult> {
    if (!this.page) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }

    const url = this.buildSearchUrl(location, transactionType, pageNumber);
    this.logger.info(`[idealista] Scraping: ${url}`);

    try {
      // Navigate to page
      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // Wait for page to load
      await sleep(2000);

      // Check for DataDome
      await bypassDataDome(this.page);

      // Handle cookie consent (look for common buttons)
      await sleep(1000);
      await this.handleCookieConsent();

      // Scroll to simulate human behavior
      await humanScroll(this.page, 500);
      await sleep(1000);

      // Wait a bit more
      const delay = Math.floor(
        Math.random() * (this.options.maxDelayMs! - this.options.minDelayMs!) +
          this.options.minDelayMs!
      );
      await sleep(delay);

      // Get page HTML
      const html = await this.page.content();

      // Extract __NEXT_DATA__
      const nextData = this.extractNextData(html);
      if (!nextData) {
        this.logger.error('[idealista] Failed to extract Next.js data');
        return {
          properties: [],
          totalFound: 0,
          currentPage: pageNumber,
          hasNextPage: false,
        };
      }

      // Parse properties from Next.js data
      const properties = parseNextData(nextData, location);

      this.logger.info(`[idealista] Found ${properties.length} properties on page ${pageNumber}`);

      // Determine if there's a next page
      const hasNextPage = this.hasNextPage(nextData);

      return {
        properties,
        totalFound: this.getTotalCount(nextData),
        currentPage: pageNumber,
        hasNextPage,
      };
    } catch (error) {
      this.logger.error(`[idealista] Error scraping page ${pageNumber}:`, error);
      throw error;
    }
  }

  /**
   * Scrape multiple pages for a location
   */
  async scrapeLocation(
    location: string,
    transactionType: 'sale' | 'rent' = 'sale',
    options: { maxPages?: number; limit?: number } = {}
  ): Promise<Property[]> {
    const { maxPages = 5, limit } = options;
    const allProperties: Property[] = [];

    this.logger.info(`[idealista] Starting scrape for ${location} (${transactionType})`);
    this.logger.info(`[idealista] Max pages: ${maxPages}, Limit: ${limit || 'none'}`);

    for (let page = 1; page <= maxPages; page++) {
      try {
        const result = await this.scrapePage(location, transactionType, page);

        // Add properties
        allProperties.push(...result.properties);

        this.logger.info(`[idealista] Total scraped: ${allProperties.length} properties`);

        // Check if we've reached the limit
        if (limit && allProperties.length >= limit) {
          this.logger.info(`[idealista] Reached limit of ${limit} properties`);
          break;
        }

        // Check if there's a next page
        if (!result.hasNextPage) {
          this.logger.info('[idealista] No more pages available');
          break;
        }

        // Delay between pages
        if (page < maxPages) {
          const delay = Math.floor(
            Math.random() * (this.options.maxDelayMs! - this.options.minDelayMs!) +
              this.options.minDelayMs!
          );
          this.logger.info(`[idealista] Waiting ${delay}ms before next page...`);
          await sleep(delay);
        }
      } catch (error) {
        this.logger.error(`[idealista] Error on page ${page}:`, error);
        // Continue to next page or break depending on error
        if (error instanceof Error && error.message.includes('blocked')) {
          this.logger.error('[idealista] Blocked by anti-bot, stopping scrape');
          break;
        }
      }
    }

    // Trim to limit if specified
    const finalProperties = limit ? allProperties.slice(0, limit) : allProperties;

    this.logger.info(`[idealista] Scrape complete: ${finalProperties.length} properties`);
    return finalProperties;
  }

  /**
   * Scrape multiple locations
   */
  async scrapeLocations(
    locations: string[],
    transactionType: 'sale' | 'rent' = 'sale',
    options: { maxPagesPerLocation?: number; limit?: number } = {}
  ): Promise<Property[]> {
    const { maxPagesPerLocation = 3, limit } = options;
    const allProperties: Property[] = [];

    this.logger.info(`[idealista] Scraping ${locations.length} locations`);

    for (const location of locations) {
      try {
        const properties = await this.scrapeLocation(location, transactionType, {
          maxPages: maxPagesPerLocation,
          limit: limit ? limit - allProperties.length : undefined,
        });

        allProperties.push(...properties);

        this.logger.info(`[idealista] Total from all locations: ${allProperties.length}`);

        // Check if we've reached the overall limit
        if (limit && allProperties.length >= limit) {
          this.logger.info(`[idealista] Reached overall limit of ${limit} properties`);
          break;
        }

        // Delay between locations
        if (locations.indexOf(location) < locations.length - 1) {
          await sleep(3000 + Math.random() * 2000);
        }
      } catch (error) {
        this.logger.error(`[idealista] Error scraping ${location}:`, error);
        // Continue with next location
      }
    }

    return allProperties;
  }

  /**
   * Extract total count from Next.js data
   */
  private getTotalCount(nextData: IdealistaNextData): number {
    try {
      const searchData = nextData?.props?.pageProps?.searchData;
      return searchData?.total || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Check if there's a next page
   */
  private hasNextPage(nextData: IdealistaNextData): boolean {
    try {
      const searchData = nextData?.props?.pageProps?.searchData;
      const currentPage = searchData?.currentPage || 1;
      const totalPages = searchData?.totalPages || 1;
      return currentPage < totalPages;
    } catch {
      return false;
    }
  }
}
