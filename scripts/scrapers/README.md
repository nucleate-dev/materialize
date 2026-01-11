# TopStartups.io Scraper

Python scraper to collect startup information from topstartups.io, including company details, funding, founders, and more.

## Features

- Handles infinite scroll to load all startups (target: 3000)
- Automatically clicks "Show more" button
- Extracts comprehensive startup data:
  - Company name, logo, and website
  - Description and industry tags
  - HQ location, company size, and founded year
  - Funding information and investors
  - Founders information
  - LinkedIn and jobs URLs
- Exports to CSV with timestamp
- Progress tracking during scraping

## Setup

### 1. Create and activate virtual environment

```bash
cd scripts/scrapers

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
# On macOS/Linux:
source venv/bin/activate

# On Windows:
# venv\Scripts\activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

This will install:
- selenium (web automation)
- beautifulsoup4 (HTML parsing)
- pandas (CSV export)
- lxml (parser)
- webdriver-manager (automatic ChromeDriver management)

## Usage

### Run the scraper

```bash
python topstartups_scraper.py
```

The scraper will:
1. Open Chrome browser (visible by default)
2. Navigate to topstartups.io
3. Click "Show more" if present
4. Scroll continuously to load ~3000 startups
5. Extract all data from loaded cards
6. Save to `outputs/topstartups_YYYYMMDD_HHMMSS.csv`

### Output

The CSV file will contain these columns:

| Column | Description |
|--------|-------------|
| name | Company name |
| logo_url | URL to company logo |
| website_url | Company website |
| description | What the company does |
| industry_tags | Industry categories (comma-separated) |
| hq_location | Headquarters location |
| company_size | Number of employees |
| founded_year | Year founded |
| funding_info | Investors and funding rounds (comma-separated) |
| founders_info | Information about founders |
| linkedin_url | Company LinkedIn profile |
| company_site_url | Company website (from "Take action") |
| jobs_url | Careers/jobs page URL |
| is_featured | Whether the startup is featured/sponsored |

## Configuration

### Change target number of startups

Edit `topstartups_scraper.py`:

```python
scraper = TopStartupsScraper(target_count=5000)  # Change from 3000 to 5000
```

### Run in headless mode

Uncomment this line in the script (line ~47):

```python
chrome_options.add_argument("--headless")
```

### Adjust scroll timing

If the scraper is not loading enough content, increase wait times:

```python
time.sleep(3)  # Increase wait time after scroll
```

## Troubleshooting

### Chrome driver issues

The script uses webdriver-manager to automatically download the correct ChromeDriver. If you encounter issues:

```bash
pip install --upgrade webdriver-manager
```

### Rate limiting / blocking

If the site blocks your requests:
- Add longer sleep times between scrolls
- Use headless mode
- Consider adding random delays

### Not loading enough startups

- Increase `max_no_change` value (currently 5)
- Increase scroll wait time (currently 2 seconds)
- Check console output for "No new content loaded" messages

## Example Output

```
============================================================
TopStartups.io Scraper
============================================================

Setting up Chrome driver...
Loading https://topstartups.io/...
Looking for 'Show more' button...
Clicked 'Show more' button
Starting infinite scroll to load 3000 startups...
Currently loaded: 50 startups
Currently loaded: 100 startups
...
Currently loaded: 3000 startups
Target of 3000 startups reached!
Finished scrolling. Total startups loaded: 3000
Extracting startup data from loaded cards...
Found 3000 startup cards to parse
Processed 100/3000 cards...
Processed 200/3000 cards...
...
Successfully extracted data for 3000 startups
Saving data to outputs/topstartups_20260110_123045.csv...
Successfully saved 3000 startups to outputs/topstartups_20260110_123045.csv

Data summary:
  - Total startups: 3000
  - Startups with funding info: 2847
  - Featured startups: 127
  - Startups with jobs: 2156

Closing browser...

============================================================
Scraping completed!
============================================================
```

## Notes

- Chrome browser must be installed on your system
- Scraping takes several minutes depending on internet speed and number of startups
- The scraper respects the site's load times with built-in delays
- Output files are timestamped to prevent overwrites
