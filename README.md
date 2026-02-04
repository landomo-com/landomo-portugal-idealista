# Idealista Portugal Scraper

Modern TypeScript scraper for [idealista.pt](https://www.idealista.pt), Portugal's largest real estate portal.

## Features

- Extracts property listings from __NEXT_DATA__ JSON (Next.js SSR)
- Stealth Playwright with DataDome bypass
- Support for sale and rent listings
- Multiple Portuguese cities
- Redis storage integration
- CLI with Commander.js
- Full TypeScript support

## Installation

```bash
cd /home/samuelseidel/claude-code/scrapers/portugal/idealista
npm install
```

## Usage

### Basic Usage

```bash
# Scrape 5 properties from Lisboa
npm run test

# Scrape from Porto
tsx src/index.ts --location porto --limit 10

# Scrape rental properties
tsx src/index.ts --location faro -t rent --limit 5

# Multiple locations
tsx src/index.ts --multiple --limit 20
```

### CLI Options

```
-l, --location <location>         Location to scrape (default: lisboa)
-t, --transactionType <type>      Transaction type: sale or rent (default: sale)
--limit <number>                  Maximum properties to scrape
--maxPages <number>               Maximum pages to scrape (default: 5)
--headless <true|false>           Run browser in headless mode (default: true)
--dryRun                          Don't store to Redis, just print results
--multiple                        Scrape multiple popular locations
--help                            Show this help message
```

### Available Locations

Lisboa, Porto, Faro, Braga, Coimbra, Funchal, Setubal, Aveiro, Evora, Leiria, Cascais, Sintra, Matosinhos, Almada, Portimao

### Environment Variables

```bash
# Proxy configuration (recommended for DataDome bypass)
export PROXY_SERVER="http://proxy:port"
export PROXY_USERNAME="user"
export PROXY_PASSWORD="pass"

# Redis configuration
export REDIS_URL="redis://localhost:6379"
```

## Anti-Bot Protection

Idealista.pt uses **DataDome** protection. Residential or mobile proxies are highly recommended.

### Without Proxy
Direct scraping may work for a few requests but will likely be blocked.

### With Proxy
Use residential/mobile proxies for reliable scraping:
- Bright Data
- Smartproxy
- Oxylabs
- IPRoyal

## Data Structure

Each property includes:
- ID, URL, Title
- Price, Currency
- Property Type (apartment, villa, house, etc.)
- Transaction Type (sale/rent)
- Location (city, region, coordinates)
- Details (bedrooms, bathrooms, sqm, floor)
- Features (elevator, parking, pool, etc.)
- Images, Description
- Scraped timestamp

## Examples

### Example 1: Test Scrape (5 properties)
```bash
npm run test
```

### Example 2: Scrape Rentals in Porto
```bash
tsx src/index.ts --location porto --transactionType rent --limit 10 --headless false
```

### Example 3: Dry Run (No Redis)
```bash
tsx src/index.ts --location lisboa --limit 5 --dryRun
```

### Example 4: Multiple Cities
```bash
tsx src/index.ts --multiple --limit 25
```

## Technical Details

- **URL Pattern**: `https://www.idealista.pt/{transaction}-{type}/{location}/pagina-{n}.html`
- **Data Source**: __NEXT_DATA__ JSON embedded in HTML
- **Browser**: Playwright Chromium with stealth config
- **Anti-Detection**:
  - Navigator property spoofing
  - Canvas/WebGL fingerprint randomization
  - Human-like scrolling and timing
  - Cookie consent handling
  - DataDome bypass techniques

## Portuguese Terminology

- `comprar-casas` = Buy houses
- `arrendar-casas` = Rent houses
- `T0, T1, T2` = Studio, 1-bed, 2-bed
- `m²` = Square meters
- `R/C` = Ground floor
- `Cave` = Basement

## Limitations

- DataDome may block datacenter IPs
- Rate limiting recommended (2-4s between requests)
- Maximum 60 pages per search (Idealista limit)
- Requires active browser (Playwright)

## License

MIT
