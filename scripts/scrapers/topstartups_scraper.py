#!/usr/bin/env python3
"""
TopStartups.io Scraper
Scrapes startup information from topstartups.io and saves to CSV
"""

import time
import csv
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from bs4 import BeautifulSoup
import pandas as pd
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options

class TopStartupsScraper:
    def __init__(self, target_count=3000):
        """Initialize the scraper with target number of startups to collect"""
        self.target_count = target_count
        self.url = "https://topstartups.io/"
        self.driver = None
        self.startups_data = []

    def setup_driver(self):
        """Setup Chrome driver with appropriate options"""
        print("Setting up Chrome driver...")
        chrome_options = Options()
        chrome_options.add_argument("--start-maximized")
        chrome_options.add_argument("--disable-blink-features=AutomationControlled")
        chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
        chrome_options.add_experimental_option('useAutomationExtension', False)

        # Uncomment to run headless
        # chrome_options.add_argument("--headless")

        service = Service(ChromeDriverManager().install())
        self.driver = webdriver.Chrome(service=service, options=chrome_options)
        self.driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")

    def load_page(self):
        """Load the initial page"""
        print(f"Loading {self.url}...")
        self.driver.get(self.url)
        time.sleep(3)  # Wait for initial load

    def click_show_more(self):
        """Click the 'Show more' button if it exists"""
        try:
            print("Looking for 'Show more' button...")
            # Try different possible selectors for the show more button
            show_more_selectors = [
                "//button[contains(text(), 'Show more')]",
                "//a[contains(text(), 'Show more')]",
                "//button[contains(@class, 'show-more')]",
                "//a[contains(@class, 'show-more')]",
            ]

            for selector in show_more_selectors:
                try:
                    button = WebDriverWait(self.driver, 5).until(
                        EC.element_to_be_clickable((By.XPATH, selector))
                    )
                    self.driver.execute_script("arguments[0].scrollIntoView(true);", button)
                    time.sleep(1)
                    button.click()
                    print("Clicked 'Show more' button")
                    time.sleep(2)
                    return True
                except (TimeoutException, NoSuchElementException):
                    continue

            print("No 'Show more' button found, proceeding with scroll...")
            return False
        except Exception as e:
            print(f"Error clicking 'Show more': {e}")
            return False

    def scroll_and_load(self):
        """Scroll to bottom of page to trigger infinite scroll"""
        last_height = self.driver.execute_script("return document.body.scrollHeight")
        no_change_count = 0
        max_no_change = 5  # Stop if height doesn't change 5 times in a row

        print(f"Starting infinite scroll to load {self.target_count} startups...")

        while no_change_count < max_no_change:
            # Get current count of loaded items
            current_count = len(self.driver.find_elements(By.CLASS_NAME, "infinite-item"))
            print(f"Currently loaded: {current_count} startups")

            if current_count >= self.target_count:
                print(f"Target of {self.target_count} startups reached!")
                break

            # Scroll to bottom
            self.driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(2)  # Wait for content to load

            # Calculate new scroll height
            new_height = self.driver.execute_script("return document.body.scrollHeight")

            if new_height == last_height:
                no_change_count += 1
                print(f"No new content loaded (attempt {no_change_count}/{max_no_change})")
                time.sleep(2)  # Wait a bit longer
            else:
                no_change_count = 0
                last_height = new_height

        final_count = len(self.driver.find_elements(By.CLASS_NAME, "infinite-item"))
        print(f"Finished scrolling. Total startups loaded: {final_count}")

    def parse_startup_card(self, card_html):
        """Parse a single startup card and extract all information"""
        soup = BeautifulSoup(card_html, 'lxml')

        data = {
            'name': '',
            'logo_url': '',
            'website_url': '',
            'description': '',
            'industry_tags': '',
            'hq_location': '',
            'company_size': '',
            'founded_year': '',
            'funding_info': '',
            'founders_info': '',
            'linkedin_url': '',
            'company_site_url': '',
            'jobs_url': '',
            'is_featured': False
        }

        try:
            # Company name
            name_elem = soup.find('h3')
            if name_elem:
                name_link = name_elem.find('a')
                if name_link:
                    data['name'] = name_link.get_text(strip=True)
                    data['website_url'] = name_link.get('href', '')

            # Logo URL
            logo_elem = soup.find('img', class_='rounded-circle')
            if logo_elem:
                data['logo_url'] = logo_elem.get('src', '')

            # Check if featured
            featured_button = soup.find('button', id='sponsor-button')
            data['is_featured'] = featured_button is not None

            # Description (What they do)
            description_section = soup.find('b', id='card-header', string='What they do: ')
            if description_section:
                parent = description_section.parent
                # Get text after the <b> tag
                description_text = parent.get_text(separator=' ', strip=True)
                description_text = description_text.replace('What they do:', '').strip()
                # Remove industry tags from description
                for tag in parent.find_all('span', class_='badge'):
                    tag_text = tag.get_text(strip=True)
                    description_text = description_text.replace(tag_text, '')
                data['description'] = description_text.strip()

            # Industry tags
            industry_tags = []
            tags_section = soup.find('b', id='card-header', string='What they do: ')
            if tags_section:
                parent = tags_section.parent
                for tag in parent.find_all('span', id='industry-tags'):
                    industry_tags.append(tag.get_text(strip=True))
            data['industry_tags'] = ', '.join(industry_tags)

            # Quick facts (HQ, company size, founded year)
            quick_facts_section = soup.find('b', id='card-header', string='Quick facts: ')
            if quick_facts_section:
                parent = quick_facts_section.parent
                facts_text = parent.get_text(separator='|', strip=True)

                # Extract HQ
                if '📍HQ:' in facts_text:
                    hq_part = facts_text.split('📍HQ:')[1].split('|')[0].strip()
                    data['hq_location'] = hq_part

                # Extract company size
                size_tag = parent.find('span', id='company-size-tags', string=lambda x: x and 'employees' in x)
                if size_tag:
                    data['company_size'] = size_tag.get_text(strip=True)

                # Extract founded year
                founded_tag = parent.find('span', id='company-size-tags', string=lambda x: x and 'Founded:' in x)
                if founded_tag:
                    data['founded_year'] = founded_tag.get_text(strip=True).replace('Founded:', '').strip()

            # Funding information
            funding_section = soup.find('b', id='card-header', string='Funding: ')
            if funding_section:
                parent = funding_section.parent
                funding_tags = []
                for tag in parent.find_all('span', id='funding-tags'):
                    funding_tags.append(tag.get_text(strip=True))
                data['funding_info'] = ', '.join(funding_tags)

            # Founders information
            founders_section = soup.find('b', id='card-header', string='Founders: ')
            if founders_section:
                parent = founders_section.parent
                founders_text = parent.get_text(separator=' ', strip=True)
                founders_text = founders_text.replace('Founders:', '').strip()
                data['founders_info'] = founders_text

            # Take action links
            action_section = soup.find('b', id='card-header', string='Take action: ')
            if action_section:
                parent = action_section.parent
                links = parent.find_all('a', id='social_media_link')
                for link in links:
                    link_text = link.get_text(strip=True)
                    link_url = link.get('href', '')
                    if 'linkedin.com' in link_url:
                        data['linkedin_url'] = link_url
                    elif 'works here' in link_text or 'linkedin.com' in link_url:
                        data['linkedin_url'] = link_url
                    else:
                        data['company_site_url'] = link_url

            # Jobs URL
            jobs_link = soup.find('a', id='view-jobs')
            if jobs_link:
                data['jobs_url'] = jobs_link.get('href', '')

        except Exception as e:
            print(f"Error parsing card: {e}")

        return data

    def extract_all_startups(self):
        """Extract data from all loaded startup cards"""
        print("Extracting startup data from loaded cards...")

        cards = self.driver.find_elements(By.CLASS_NAME, "infinite-item")
        print(f"Found {len(cards)} startup cards to parse")

        for idx, card in enumerate(cards, 1):
            try:
                card_html = card.get_attribute('innerHTML')
                startup_data = self.parse_startup_card(card_html)

                if startup_data['name']:  # Only add if we got a name
                    self.startups_data.append(startup_data)

                if idx % 100 == 0:
                    print(f"Processed {idx}/{len(cards)} cards...")

            except Exception as e:
                print(f"Error processing card {idx}: {e}")
                continue

        print(f"Successfully extracted data for {len(self.startups_data)} startups")

    def save_to_csv(self, filename=None):
        """Save collected data to CSV file"""
        if not filename:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"outputs/topstartups_{timestamp}.csv"

        print(f"Saving data to {filename}...")

        df = pd.DataFrame(self.startups_data)
        df.to_csv(filename, index=False, encoding='utf-8')

        print(f"Successfully saved {len(self.startups_data)} startups to {filename}")
        print(f"\nData summary:")
        print(f"  - Total startups: {len(df)}")
        print(f"  - Startups with funding info: {df['funding_info'].notna().sum()}")
        print(f"  - Featured startups: {df['is_featured'].sum()}")
        print(f"  - Startups with jobs: {df['jobs_url'].notna().sum()}")

    def run(self):
        """Main execution method"""
        try:
            self.setup_driver()
            self.load_page()
            self.click_show_more()
            self.scroll_and_load()
            self.extract_all_startups()
            self.save_to_csv()

        except Exception as e:
            print(f"Error during scraping: {e}")
            raise
        finally:
            if self.driver:
                print("Closing browser...")
                self.driver.quit()

def main():
    """Entry point for the scraper"""
    print("=" * 60)
    print("TopStartups.io Scraper")
    print("=" * 60)
    print()

    scraper = TopStartupsScraper(target_count=3000)
    scraper.run()

    print()
    print("=" * 60)
    print("Scraping completed!")
    print("=" * 60)

if __name__ == "__main__":
    main()
