import { createLogger } from '@shared/logger';
/**
 * Idealista.pt Scraper - CLI Entry Point
 *
 * Usage:
 *   tsx src/index.ts [options]
 *
 * Options:
 *   --location <location>          Location to scrape (default: lisboa)
 *   --transactionType <sale|rent>  Transaction type (default: sale)
 *   --limit <number>               Maximum properties to scrape
 *   --maxPages <number>            Max pages to scrape (default: 5)
 *   --headless <true|false>        Run browser in headless mode (default: true)
 *   --dryRun                       Don't store to Redis, just print results
 *   --help                         Show this help message
 */

import { Command } from 'commander';
import { IdealistaScraper, PORTUGUESE_LOCATIONS } from './scraper.js';
import { connectRedis, disconnectRedis, saveProperties } from '@shared/redis.js';
import type { Property } from '@shared/types.js';

const logger = createLogger('module');

const program = new Command();

program
  .name('idealista-portugal-scraper')
  .description('Scrape property listings from idealista.pt')
  .option('-l, --location <location>', 'Location to scrape', 'lisboa')
  .option('-t, --transactionType <type>', 'Transaction type (sale|rent)', 'sale')
  .option('--limit <number>', 'Maximum properties to scrape', parseInt)
  .option('--maxPages <number>', 'Maximum pages to scrape', '5')
  .option('--headless <boolean>', 'Run browser in headless mode', 'true')
  .option('--dryRun', "Don't store to Redis, just print results", false)
  .option('--multiple', 'Scrape multiple locations', false);

program.parse();

const options = program.opts();

interface CliOptions {
  location: string;
  transactionType: 'sale' | 'rent';
  limit?: number;
  maxPages: number;
  headless: boolean;
  dryRun: boolean;
  multiple: boolean;
}

function printHelp(): void {
  logger.info(`
Idealista.pt Scraper

Usage:
  tsx src/index.ts [options]

Options:
  -l, --location <location>         Location to scrape (default: lisboa)
  -t, --transactionType <type>      Transaction type: sale or rent (default: sale)
  --limit <number>                  Maximum properties to scrape
  --maxPages <number>               Maximum pages to scrape (default: 5)
  --headless <true|false>           Run browser in headless mode (default: true)
  --dryRun                          Don't store to Redis, just print results
  --multiple                        Scrape multiple popular locations
  --help                            Show this help message

Available locations:
  ${PORTUGUESE_LOCATIONS.join(', ')}

Examples:
  tsx src/index.ts --location lisboa --limit 5
  tsx src/index.ts -l porto -t rent --maxPages 3
  tsx src/index.ts --multiple --limit 50
  tsx src/index.ts --location faro --dryRun --headless false

Environment Variables:
  PROXY_SERVER       - Proxy server URL (e.g., http://proxy:port)
  PROXY_USERNAME     - Proxy username
  PROXY_PASSWORD     - Proxy password
  REDIS_URL          - Redis connection URL (default: redis://localhost:6379)
`);
}

function formatProperty(prop: Property): void {
  logger.info("-" + "=".repeat(60));
  logger.info(`ID: ${prop.id}`);
  logger.info(`Title: ${prop.title}`);
  logger.info(`Price: ${prop.currency} ${prop.price.toLocaleString()}`);
  logger.info(`Type: ${prop.propertyType} (${prop.transactionType})`);
  logger.info(`Location: ${prop.location.city}${prop.location.region ? ', ' + prop.location.region : ''}`);
  if (prop.location.address) {
    logger.info(`Address: ${prop.location.address}`);
  }
  logger.info(`Details: ${prop.details.sqm || '?'} sqm | ${prop.details.rooms || '?'} rooms | ${prop.details.bathrooms || '?'} bath`);
  if (prop.features.length > 0) {
    logger.info(`Features: ${prop.features.slice(0, 5).join(', ')}`);
  }
  logger.info(`URL: ${prop.url}`);
}

async function main(): Promise<void> {
  const opts = options as CliOptions;

  // Parse boolean option
  const headlessValue = opts.headless as any;
  opts.headless = headlessValue !== false && headlessValue !== 'false';
  opts.maxPages = parseInt(opts.maxPages as any, 10);

  // Validate transaction type
  if (opts.transactionType !== 'sale' && opts.transactionType !== 'rent') {
    logger.error(`Invalid transaction type: ${opts.transactionType}. Use 'sale' or 'rent'.`);
    process.exit(1);
  }

  logger.info("=" + "=".repeat(60));
  logger.info('Idealista.pt Scraper');
  logger.info("=" + "=".repeat(60));
  logger.info(`Location: ${opts.multiple ? 'Multiple locations' : opts.location}`);
  logger.info(`Transaction type: ${opts.transactionType}`);
  logger.info(`Max pages: ${opts.maxPages}`);
  logger.info(`Limit: ${opts.limit || 'none'}`);
  logger.info(`Headless: ${opts.headless}`);
  logger.info(`Dry run: ${opts.dryRun}`);
  logger.info("=" + "=".repeat(60));

  // Configure proxy from environment
  const proxyConfig = process.env.PROXY_SERVER ? {
    server: process.env.PROXY_SERVER,
    username: process.env.PROXY_USERNAME,
    password: process.env.PROXY_PASSWORD,
  } : undefined;

  const scraper = new IdealistaScraper({
    headless: opts.headless,
    minDelayMs: 2000,
    maxDelayMs: 4000,
    proxy: proxyConfig,
  });

  let properties: Property[] = [];

  try {
    await scraper.initialize();

    if (opts.multiple) {
      // Scrape multiple locations
      const locations = PORTUGUESE_LOCATIONS.slice(0, 5); // Top 5 locations
      logger.info(`\nScraping ${locations.length} locations: ${locations.join(', ')}\n`);

      properties = await scraper.scrapeLocations(locations, opts.transactionType, {
        maxPagesPerLocation: opts.maxPages,
        limit: opts.limit,
      });
    } else {
      // Single location scrape
      properties = await scraper.scrapeLocation(
        opts.location,
        opts.transactionType,
        {
          maxPages: opts.maxPages,
          limit: opts.limit,
        }
      );
    }

    logger.info("\n' + '=" + "=".repeat(60));
    logger.info('Scraping complete!');
    logger.info(`Total properties scraped: ${properties.length}`);
    logger.info("=" + "=".repeat(60));

    if (properties.length === 0) {
      logger.info('\nNo properties were scraped. This might be due to:');
      logger.info('  - DataDome bot protection blocking requests');
      logger.info('  - Invalid location name');
      logger.info('  - Network issues');
      logger.info('  - No listings available for the search criteria');
      process.exit(1);
    }

    // Print sample of results
    logger.info('\nSample properties:');
    const sample = properties.slice(0, 3);
    for (const prop of sample) {
      formatProperty(prop);
    }

    if (opts.dryRun) {
      logger.info('\n[Dry run] Skipping Redis storage');
      logger.info('\nFull results (JSON):');
      logger.info('Data dump', properties));
    } else {
      // Store in Redis
      logger.info('\nStoring properties in Redis...');
      try {
        await connectRedis(process.env.REDIS_URL);
        await saveProperties(properties);
        logger.info(`Successfully stored ${properties.length} properties in Redis`);
      } catch (error) {
        logger.error('Failed to store properties in Redis:', error);
        logger.info('Results will be output to console instead:');
        logger.info('Data dump', properties));
      } finally {
        await disconnectRedis();
      }
    }

    logger.info('\nDone!');
  } catch (error) {
    logger.error('Scraper error:', error);
    process.exit(1);
  } finally {
    await scraper.close();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('\nReceived SIGINT, shutting down...');
  await disconnectRedis();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('\nReceived SIGTERM, shutting down...');
  await disconnectRedis();
  process.exit(0);
});

// Check for help flag
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  printHelp();
  process.exit(0);
}

main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
