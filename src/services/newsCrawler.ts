import axios from 'axios';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import crypto from 'crypto';

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
  lastPrice: string;
  priceChangePercent: string;
  volume: string;
}

export class NewsCrawler {
  private readonly PIONEX_BASE_URL = 'https://api.pionex.com/api/v1';
  private readonly PIONEX_API_KEY = process.env.PIONEX_API_KEY || '';
  private readonly PIONEX_API_SECRET = process.env.PIONEX_API_SECRET || '';
  private marketDataCache: Map<string, PionexMarketData> = new Map();
  private lastFetchTime: number = 0;
  private readonly CACHE_DURATION = 180000; // 3分鐘緩存
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

  // 生成 Pionex API 簽名
  private generateSignature(timestamp: number, method: string, path: string): string {
    const message = `${timestamp}${method}${path}`;
    return crypto
      .createHmac('sha256', this.PIONEX_API_SECRET)
      .update(message)
      .digest('hex');
  }

  // 獲取 Pionex 市場數據
  private async getMarketData(): Promise<Map<string, PionexMarketData>> {
    const now = Date.now();
    
    // 如果緩存有效，直接返回緩存數據
    if (this.marketDataCache.size > 0 && now - this.lastFetchTime < this.CACHE_DURATION) {
      return this.marketDataCache;
    }

    try {
      // 添加延遲以遵守速率限制
      const timeSinceLastFetch = now - this.lastFetchTime;
      if (timeSinceLastFetch < 30000) { // 確保至少間隔 30 秒
        await new Promise(resolve => setTimeout(resolve, 30000 - timeSinceLastFetch));
      }

      const timestamp = Date.now();
      const path = '/market/tickers';
      const signature = this.generateSignature(timestamp, 'GET', path);

      const response = await axios.get(
        `${this.PIONEX_BASE_URL}${path}`,
        {
          headers: {
            'X-API-KEY': this.PIONEX_API_KEY,
            'X-TIMESTAMP': timestamp.toString(),
            'X-SIGNATURE': signature
          }
        }
      );

      this.marketDataCache.clear();
      
      if (response.data && Array.isArray(response.data)) {
        response.data.forEach((item: any) => {
          const symbol = item.symbol.toLowerCase();
          if (['btcusdt', 'ethusdt', 'bnbusdt', 'solusdt', 'dotusdt'].includes(symbol)) {
            this.marketDataCache.set(symbol.replace('usdt', ''), {
              symbol: symbol,
              lastPrice: item.lastPrice,
              priceChangePercent: item.priceChangePercent,
              volume: item.volume
            });
          }
        });
      }
      
      this.lastFetchTime = Date.now();
      return this.marketDataCache;
    } catch (error) {
      console.error('Error fetching Pionex market data:', error);
      // 如果請求失敗但有緩存，返回緩存的數據
      return this.marketDataCache.size > 0 ? this.marketDataCache : new Map();
    }
  }

  // 為新聞添加市場數據
  private async enrichNewsWithMarketData(news: NewsItem[]): Promise<NewsItem[]> {
    const marketData = await this.getMarketData();
    
    return news.map(item => {
      const symbols = ['btc', 'eth', 'bnb', 'sol', 'dot'];
      for (const symbol of symbols) {
        if (item.title.toLowerCase().includes(symbol)) {
          const data = marketData.get(symbol);
          if (data) {
            return {
              ...item,
              marketData: {
                price: parseFloat(data.lastPrice).toFixed(2),
                change24h: parseFloat(data.priceChangePercent).toFixed(2) + '%',
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