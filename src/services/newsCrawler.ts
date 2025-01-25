import axios from 'axios';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';

export interface NewsItem {
  id: string;
  title: string;
  description: string;
  url: string;
  source: string;
  date: string;
  category: string;
  marketData?: {
    price: string;
    change24h: string;
    volume24h: string;
  };
}

interface PionexMarketData {
  symbol: string;
  price: string;
  volume: string;
  priceChangePercent: string;
}

export class NewsCrawler {
  private readonly PIONEX_BASE_URL = 'https://api.pionex.com/api/v1';
  private readonly PIONEX_API_KEY = ''; // 需要添加您的 API Key
  private readonly PIONEX_API_SECRET = ''; // 需要添加您的 API Secret
  private sources = {
    coindesk: {
      url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
      type: 'rss'
    },
    cointelegraph: {
      url: 'https://cointelegraph.com/rss',
      type: 'rss'
    },
    binance: {
      url: 'https://www.binance.com/en/feed',
      type: 'html'
    }
  };

  // 獲取 Pionex 市場數據
  private async getPionexMarketData(): Promise<Map<string, PionexMarketData>> {
    try {
      const timestamp = Date.now().toString();
      const headers = {
        'X-API-Key': this.PIONEX_API_KEY,
        'X-Timestamp': timestamp,
        // 需要根據 Pionex API 文檔添加其他必要的認證頭
      };

      const response = await axios.get(`${this.PIONEX_BASE_URL}/market/tickers`, {
        headers
      });

      const marketData = new Map<string, PionexMarketData>();
      
      if (response.data && Array.isArray(response.data.data)) {
        response.data.data.forEach((item: any) => {
          marketData.set(item.symbol.toLowerCase(), {
            symbol: item.symbol,
            price: item.last,
            volume: item.volume,
            priceChangePercent: item.change
          });
        });
      }
      
      return marketData;
    } catch (error) {
      console.error('Error fetching Pionex market data:', error);
      return new Map();
    }
  }

  // 為新聞添加市場數據
  private async enrichNewsWithMarketData(news: NewsItem[]): Promise<NewsItem[]> {
    const marketData = await this.getPionexMarketData();
    
    return news.map(item => {
      const symbols = ['btc', 'eth', 'bnb', 'sol', 'dot'];
      for (const symbol of symbols) {
        if (item.title.toLowerCase().includes(symbol)) {
          const data = marketData.get(symbol + 'usdt');
          if (data) {
            return {
              ...item,
              marketData: {
                price: data.price,
                change24h: data.priceChangePercent + '%',
                volume24h: data.volume
              }
            };
          }
        }
      }
      return item;
    });
  }

  async crawlRSSFeed(url: string): Promise<NewsItem[]> {
    try {
      const response = await axios.get(url);
      const $ = cheerio.load(response.data, { xmlMode: true });
      const items: NewsItem[] = [];

      $('item').each((_, element) => {
        const title = $(element).find('title').text();
        const description = $(element).find('description').text();
        const link = $(element).find('link').text();
        const pubDate = $(element).find('pubDate').text();

        items.push({
          id: Buffer.from(link).toString('base64'),
          title: title,
          description: this.cleanDescription(description),
          url: link,
          source: new URL(url).hostname,
          date: new Date(pubDate).toISOString(),
          category: this.categorizeNews(title + ' ' + description)
        });
      });

      return items;
    } catch (error) {
      console.error(`Error crawling RSS feed ${url}:`, error);
      return [];
    }
  }

  async crawlHTMLPage(url: string): Promise<NewsItem[]> {
    try {
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox']
      });
      const page = await browser.newPage();
      await page.goto(url);

      const items: NewsItem[] = await page.evaluate(() => {
        const articles = document.querySelectorAll('article');
        return Array.from(articles).map(article => {
          const title = article.querySelector('h2')?.textContent || '';
          const description = article.querySelector('p')?.textContent || '';
          const link = article.querySelector('a')?.href || '';
          
          return {
            id: btoa(link),
            title,
            description,
            url: link,
            source: window.location.hostname,
            date: new Date().toISOString(),
            category: 'General'
          };
        });
      });

      await browser.close();
      return items;
    } catch (error) {
      console.error(`Error crawling HTML page ${url}:`, error);
      return [];
    }
  }

  private cleanDescription(description: string): string {
    // 移除 HTML 標籤
    return description.replace(/<[^>]*>/g, '').trim();
  }

  private categorizeNews(content: string): string {
    const categories = {
      '市場動態': ['price', 'market', 'trading', 'bitcoin', 'ethereum', 'btc', 'eth'],
      '技術發展': ['blockchain', 'protocol', 'upgrade', 'development', 'tech'],
      '監管政策': ['regulation', 'sec', 'law', 'government', 'policy'],
      '產業新聞': ['company', 'business', 'partnership', 'launch']
    };

    content = content.toLowerCase();
    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => content.includes(keyword))) {
        return category;
      }
    }
    return '其他';
  }

  async crawlAllSources(): Promise<NewsItem[]> {
    const allNews: NewsItem[] = [];

    for (const [source, config] of Object.entries(this.sources)) {
      try {
        const news = config.type === 'rss' 
          ? await this.crawlRSSFeed(config.url)
          : await this.crawlHTMLPage(config.url);
        
        allNews.push(...news);
      } catch (error) {
        console.error(`Error crawling ${source}:`, error);
      }
    }

    // 根據日期排序，最新的在前
    const sortedNews = allNews.sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // 添加市場數據
    return this.enrichNewsWithMarketData(sortedNews);
  }
}

export const newsCrawler = new NewsCrawler(); 