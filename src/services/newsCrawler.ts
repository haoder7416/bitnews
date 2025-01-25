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
  language: 'en' | 'zh';
  reliability: number;
  sourceTier: 'primary' | 'secondary' | 'tertiary';
  marketData?: {
    price: string;
    change24h: string;
    volume24h: string;
  };
  marketImpact?: {
    sentiment: 'positive' | 'negative' | 'neutral';
    relatedAssets: string[];
    potentialImpact: 'high' | 'medium' | 'low';
  };
}

interface PionexMarketData {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  volume: string;
  high: string;    // 新增：最高價
  low: string;     // 新增：最低價
  volumeHistory: string[];  // 新增：歷史成交量
}

interface KlineData {
  time: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

interface ScreenerResult {
  symbol: string;
  pricePosition: number;  // 價格在高低點區間的位置百分比
  volumeIncrease: number; // 成交量增加的百分比
  lastPrice: string;
  volume: string;
  highPrice: string;
  lowPrice: string;
  distanceFromHigh: number;
  distanceFromLow: number;
}

interface NewsSource {
  url: string;
  type: 'rss' | 'html';
  language: 'en' | 'zh';
  tier: 'primary' | 'secondary' | 'tertiary';
}

interface HTMLNewsItem extends NewsItem {
  content?: string;
}

export class NewsCrawler {
  private readonly PIONEX_BASE_URL = 'https://api.pionex.com/api/v1';
  private readonly PIONEX_API_KEY = process.env.PIONEX_API_KEY || '';
  private readonly PIONEX_API_SECRET = process.env.PIONEX_API_SECRET || '';
  private marketDataCache: Map<string, PionexMarketData> = new Map();
  private klineDataCache: Map<string, KlineData[]> = new Map();  // 新增：K線數據緩存
  private lastFetchTime: number = 0;
  private readonly CACHE_DURATION = 180000; // 3分鐘緩存
  private readonly VOLUME_INCREASE_THRESHOLD = 2.0; // 成交量增加閾值（倍數）
  private readonly PRICE_RANGE_THRESHOLD = 1.0; // 價格區間閾值（100%）

  private sources: Record<string, NewsSource> = {
    // 主流英文媒體
    coindesk: {
      url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
      type: 'rss',
      language: 'en',
      tier: 'primary'
    },
    cointelegraph: {
      url: 'https://cointelegraph.com/rss',
      type: 'rss',
      language: 'en',
      tier: 'primary'
    },
    decrypt: {
      url: 'https://decrypt.co/feed',
      type: 'rss',
      language: 'en',
      tier: 'primary'
    },
    theblock: {
      url: 'https://www.theblock.co/rss.xml',
      type: 'rss',
      language: 'en',
      tier: 'primary'
    },
    blockworks: {
      url: 'https://blockworks.co/feed',
      type: 'rss',
      language: 'en',
      tier: 'secondary'
    },
    
    // 交易所新聞
    binance: {
      url: 'https://www.binance.com/en/feed',
      type: 'html',
      language: 'en',
      tier: 'primary'
    },
    kraken: {
      url: 'https://blog.kraken.com/feed',
      type: 'rss',
      language: 'en',
      tier: 'primary'
    },
    
    // 中文媒體
    jinse: {
      url: 'https://www.jinse.com/rss',
      type: 'rss',
      language: 'zh',
      tier: 'primary'
    },
    blockcast: {
      url: 'https://blockcast.it/feed/',
      type: 'rss',
      language: 'zh',
      tier: 'secondary'
    },
    '8btc': {
      url: 'https://www.8btc.com/feed',
      type: 'rss',
      language: 'zh',
      tier: 'primary'
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
      console.log('Using cached market data:', Object.fromEntries(this.marketDataCache));
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

      console.log('Fetching market data from Pionex...');
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

      // 打印完整的響應數據
      console.log('Pionex API response tickers:', JSON.stringify(response.data.data.tickers, null, 2));

      this.marketDataCache.clear();
      
      if (response.data?.result && Array.isArray(response.data.data.tickers)) {
        response.data.data.tickers.forEach((item: any) => {
          // 將交易對轉換為小寫並移除下劃線
          const symbol = item.symbol.toLowerCase().replace('_', '');
          console.log('Processing symbol:', symbol);
          
          // 檢查是否是我們需要的交易對
          if (['btcusdt', 'ethusdt', 'bnbusdt', 'solusdt', 'dotusdt'].includes(symbol)) {
            console.log('Found matching symbol:', symbol, 'with data:', item);
            
            // 從交易對中提取基礎貨幣
            const baseCurrency = symbol.replace('usdt', '');
            
            // 存儲市場數據
            this.marketDataCache.set(baseCurrency, {
              symbol: baseCurrency,
              lastPrice: item.close || item.lastPrice, // 使用 close 或 lastPrice
              priceChangePercent: ((parseFloat(item.close) - parseFloat(item.open)) / parseFloat(item.open) * 100).toFixed(2),
              volume: item.volume,
              high: item.high || '',
              low: item.low || '',
              volumeHistory: item.volumeHistory || []
            });
          }
        });
      }
      
      console.log('Updated market data cache:', Object.fromEntries(this.marketDataCache));
      this.lastFetchTime = Date.now();
      return this.marketDataCache;
    } catch (error) {
      console.error('Error fetching Pionex market data:', error);
      return this.marketDataCache.size > 0 ? this.marketDataCache : new Map();
    }
  }

  // 為新聞添加市場數據
  private async enrichNewsWithMarketData(news: NewsItem[]): Promise<NewsItem[]> {
    const marketData = await this.getMarketData();
    console.log('Market data for enrichment:', Object.fromEntries(marketData));
    
    return news.map(item => {
      const titleAndDesc = (item.title + ' ' + item.description).toLowerCase();
      const cryptoKeywords = {
        'btc': ['btc', 'bitcoin', '比特幣'],
        'eth': ['eth', 'ethereum', '以太坊'],
        'bnb': ['bnb', 'binance', '幣安'],
        'sol': ['sol', 'solana', '索拉納'],
        'dot': ['dot', 'polkadot', '波卡']
      };

      console.log(`Checking news item: "${item.title}"`);
      for (const [symbol, keywords] of Object.entries(cryptoKeywords)) {
        if (keywords.some(keyword => titleAndDesc.includes(keyword))) {
          console.log(`Found match for ${symbol} in news item`);
          const data = marketData.get(symbol);
          if (data) {
            console.log(`Adding market data for ${symbol}:`, data);
            return {
              ...item,
              marketData: {
                price: parseFloat(data.lastPrice).toFixed(2),
                change24h: parseFloat(data.priceChangePercent).toFixed(2) + '%',
                volume24h: data.volume
              }
            };
          } else {
            console.log(`No market data found for ${symbol}`);
          }
        }
      }
      return item;
    });
  }

  private calculateReliability(item: NewsItem): number {
    let score = 0;
    
    // 根據來源評分
    if (item.sourceTier === 'primary') score += 40;
    else if (item.sourceTier === 'secondary') score += 30;
    else score += 20;
    
    // 根據內容完整性評分
    if (item.description.length > 100) score += 20;
    if (item.marketData) score += 20;
    
    // 根據時效性評分
    const age = Date.now() - new Date(item.date).getTime();
    if (age < 3600000) score += 20; // 1小時內
    else if (age < 86400000) score += 10; // 24小時內
    
    return Math.min(score, 100);
  }

  private analyzeSentiment(content: string): 'positive' | 'negative' | 'neutral' {
    const positiveWords = ['bullish', 'surge', 'gain', 'rise', 'growth', 'adopt', 'success', '上漲', '增長', '利好'];
    const negativeWords = ['bearish', 'crash', 'drop', 'fall', 'ban', 'risk', 'hack', '下跌', '風險', '利空'];
    
    const text = content.toLowerCase();
    let positiveCount = 0;
    let negativeCount = 0;
    
    positiveWords.forEach(word => {
      if (text.includes(word)) positiveCount++;
    });
    
    negativeWords.forEach(word => {
      if (text.includes(word)) negativeCount++;
    });
    
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  private findRelatedAssets(content: string): string[] {
    const cryptoKeywords = {
      'BTC': ['btc', 'bitcoin', '比特幣'],
      'ETH': ['eth', 'ethereum', '以太坊'],
      'BNB': ['bnb', 'binance', '幣安'],
      'SOL': ['sol', 'solana', '索拉納'],
      'DOT': ['dot', 'polkadot', '波卡']
    };
    
    const relatedAssets: string[] = [];
    const text = content.toLowerCase();
    
    for (const [asset, keywords] of Object.entries(cryptoKeywords)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        relatedAssets.push(asset);
      }
    }
    
    return relatedAssets;
  }

  // 檢查新聞是否與加密貨幣相關
  private isRelevantToTargetAssets(content: string): boolean {
    const relatedAssets = this.findRelatedAssets(content);
    return relatedAssets.length > 0;
  }

  private determinePotentialImpact(content: string, relatedAssets: string[]): 'high' | 'medium' | 'low' {
    const highImpactWords = ['regulation', 'sec', 'ban', 'hack', 'major', 'breakthrough', '監管', '重大', '突破'];
    const text = content.toLowerCase();
    
    if (relatedAssets.includes('BTC') || relatedAssets.includes('ETH')) {
      if (highImpactWords.some(word => text.includes(word))) {
        return 'high';
      }
      return 'medium';
    }
    
    if (highImpactWords.some(word => text.includes(word))) {
      return 'medium';
    }
    
    return 'low';
  }

  private removeDuplicateNews(news: NewsItem[]): NewsItem[] {
    const seen = new Set();
    return news.filter(item => {
      const key = `${item.title}-${item.date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async crawlRSSFeed(url: string, source: NewsSource): Promise<NewsItem[]> {
    try {
      const response = await axios.get(url);
      const $ = cheerio.load(response.data, { xmlMode: true });
      const items: NewsItem[] = [];
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

      $('item').each((_, element) => {
        const title = $(element).find('title').text();
        const description = $(element).find('description').text();
        const link = $(element).find('link').text();
        const pubDate = $(element).find('pubDate').text();
        const newsDate = new Date(pubDate).getTime();
        const content = title + ' ' + description;

        // 只處理24小時內且與目標加密貨幣相關的新聞
        if (newsDate > oneDayAgo && this.isRelevantToTargetAssets(content)) {
          const relatedAssets = this.findRelatedAssets(content);

          items.push({
            id: Buffer.from(link).toString('base64'),
            title,
            description: this.cleanDescription(description),
            url: link,
            source: new URL(url).hostname,
            date: new Date(pubDate).toISOString(),
            category: this.categorizeNews(content),
            language: source.language,
            sourceTier: source.tier,
            reliability: 0,
            marketImpact: {
              sentiment: this.analyzeSentiment(content),
              relatedAssets,
              potentialImpact: this.determinePotentialImpact(content, relatedAssets)
            }
          });
        }
      });

      return items;
    } catch (error) {
      console.error(`Error crawling RSS feed ${url}:`, error);
      return [];
    }
  }

  async crawlHTMLPage(url: string, source: NewsSource): Promise<NewsItem[]> {
    try {
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox']
      });
      const page = await browser.newPage();
      await page.goto(url);
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

      const items: HTMLNewsItem[] = await page.evaluate((oneDayAgo) => {
        const articles = document.querySelectorAll('article');
        return Array.from(articles)
          .map(article => {
            const title = article.querySelector('h2')?.textContent || '';
            const description = article.querySelector('p')?.textContent || '';
            const link = article.querySelector('a')?.href || '';
            const dateEl = article.querySelector('time');
            const date = dateEl ? new Date(dateEl.getAttribute('datetime') || dateEl.textContent || '') : new Date();
            const content = title + ' ' + description;
            
            if (date.getTime() > oneDayAgo) {
              return {
                id: btoa(link),
                title,
                description,
                url: link,
                source: window.location.hostname,
                date: date.toISOString(),
                category: 'General',
                language: source.language,
                sourceTier: source.tier,
                reliability: 0,
                content: content
              };
            }
            return null;
          })
          .filter(item => item !== null);
      }, oneDayAgo);

      await browser.close();

      // 過濾與加密貨幣相關的新聞並添加市場影響分析
      return items
        .filter(item => this.isRelevantToTargetAssets(item.content || ''))
        .map(item => {
          const relatedAssets = this.findRelatedAssets(item.content || '');
          const { content, ...itemWithoutContent } = item;
          return {
            ...itemWithoutContent,
            marketImpact: {
              sentiment: this.analyzeSentiment(content || ''),
              relatedAssets,
              potentialImpact: this.determinePotentialImpact(content || '', relatedAssets)
            }
          };
        });
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
      '市場動態': ['price', 'market', 'trading', 'bitcoin', 'ethereum', 'btc', 'eth', 'bull', 'bear', 'rally', 'dump', 'pump', '漲', '跌', '市場', '交易'],
      '技術發展': ['blockchain', 'protocol', 'upgrade', 'development', 'tech', 'fork', 'update', '技術', '升級', '開發'],
      '監管政策': ['regulation', 'sec', 'law', 'government', 'policy', 'ban', 'approve', '監管', '法規', '政策'],
      '產業新聞': ['company', 'business', 'partnership', 'launch', 'invest', 'fund', '公司', '合作', '投資']
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

    for (const [sourceName, sourceConfig] of Object.entries(this.sources)) {
      try {
        const news = sourceConfig.type === 'rss' 
          ? await this.crawlRSSFeed(sourceConfig.url, sourceConfig)
          : await this.crawlHTMLPage(sourceConfig.url, sourceConfig);
        
        allNews.push(...news);
      } catch (error) {
        console.error(`Error crawling ${sourceName}:`, error);
      }
    }

    // 去重
    let uniqueNews = this.removeDuplicateNews(allNews);

    // 添加市場數據
    uniqueNews = await this.enrichNewsWithMarketData(uniqueNews);

    // 計算可信度
    uniqueNews = uniqueNews.map(item => ({
      ...item,
      reliability: this.calculateReliability(item)
    }));

    // 根據日期和可信度排序
    return uniqueNews.sort((a, b) => {
      // 首先按照可信度排序
      const reliabilityDiff = b.reliability - a.reliability;
      if (reliabilityDiff !== 0) return reliabilityDiff;
      
      // 如果可信度相同，則按照日期排序
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }

  // 獲取所有新聞源
  public getSources(): Record<string, NewsSource> {
    return this.sources;
  }

  // 處理新聞數據（添加市場數據和計算可信度）
  public async processNews(news: NewsItem[]): Promise<NewsItem[]> {
    // 只保留24小時內且與目標加密貨幣相關的新聞
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    let filteredNews = news.filter(item => {
      const newsDate = new Date(item.date).getTime();
      const content = item.title + ' ' + item.description;
      return newsDate > oneDayAgo && this.isRelevantToTargetAssets(content);
    });

    if (filteredNews.length === 0) {
      return [];
    }

    // 去重
    let uniqueNews = this.removeDuplicateNews(filteredNews);

    // 添加市場數據
    uniqueNews = await this.enrichNewsWithMarketData(uniqueNews);

    // 計算可信度
    uniqueNews = uniqueNews.map(item => ({
      ...item,
      reliability: this.calculateReliability(item)
    }));

    // 根據日期和可信度排序
    return uniqueNews.sort((a, b) => {
      // 首先按照可信度排序
      const reliabilityDiff = b.reliability - a.reliability;
      if (reliabilityDiff !== 0) return reliabilityDiff;
      
      // 如果可信度相同，則按照日期排序
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }

  // 新增：獲取 3 分鐘 K 線數據
  private async getKlineData(symbol: string): Promise<KlineData[]> {
    try {
      const timestamp = Date.now();
      // 修正 API 路徑，移除重複的 api/v1
      const path = `/market/klines/${symbol}/3m?limit=10`;
      const signature = this.generateSignature(timestamp, 'GET', path);

      console.log(`正在請求 K 線數據: ${this.PIONEX_BASE_URL}${path}`);
      
      const response = await axios.get(
        `${this.PIONEX_BASE_URL}${path}`,
        {
          headers: {
            'X-API-KEY': this.PIONEX_API_KEY,
            'X-TIMESTAMP': timestamp.toString(),
            'X-SIGNATURE': signature,
            'Accept': 'application/json'
          }
        }
      );

      console.log(`K 線數據響應:`, response.data);

      if (response.data?.data && Array.isArray(response.data.data)) {
        return response.data.data.map((item: any) => ({
          time: item[0],
          open: item[1],
          high: item[2],
          low: item[3],
          close: item[4],
          volume: item[5]
        }));
      }

      console.log(`無效的 K 線數據響應格式:`, response.data);
      return [];
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`獲取 ${symbol} K 線數據失敗:`, {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          headers: error.response?.headers
        });
      } else {
        console.error(`獲取 ${symbol} K 線數據時發生未知錯誤:`, error);
      }
      return [];
    }
  }

  // 新增：分析價格位置
  private analyzePricePosition(klineData: KlineData[], currentPrice: number): { 
    distanceFromHigh: number;
    distanceFromLow: number;
    highPrice: number;
    lowPrice: number;
  } {
    if (!klineData.length) return {
      distanceFromHigh: 0,
      distanceFromLow: 0,
      highPrice: 0,
      lowPrice: 0
    };
    
    const highPrice = Math.max(...klineData.map(k => parseFloat(k.high)));
    const lowPrice = Math.min(...klineData.map(k => parseFloat(k.low)));
    
    // 計算與最高點和最低點的距離（百分比）
    const distanceFromHigh = ((highPrice - currentPrice) / highPrice) * 100;
    const distanceFromLow = ((currentPrice - lowPrice) / lowPrice) * 100;
    
    return {
      distanceFromHigh,
      distanceFromLow,
      highPrice,
      lowPrice
    };
  }

  // 新增：分析成交量變化
  private analyzeVolumeChange(klineData: KlineData[]): number {
    if (klineData.length < 2) return 0;
    
    const currentVolume = parseFloat(klineData[0].volume);
    const previousVolumes = klineData.slice(1).map(k => parseFloat(k.volume));
    const avgPreviousVolume = previousVolumes.reduce((a, b) => a + b, 0) / previousVolumes.length;
    
    return currentVolume / avgPreviousVolume;
  }

  // 修改篩選邏輯
  public async screenSymbols(): Promise<ScreenerResult[]> {
    const results: ScreenerResult[] = [];
    const symbols = ['btcusdt', 'ethusdt', 'bnbusdt', 'solusdt', 'dotusdt'];
    
    console.log('開始市場監控篩選...');

    for (const symbol of symbols) {
      try {
        console.log(`正在處理 ${symbol}...`);
        const klineData = await this.getKlineData(symbol);
        
        if (!klineData.length) {
          console.log(`無法獲取 ${symbol} 的 K 線數據`);
          continue;
        }

        const currentPrice = parseFloat(klineData[0].close);
        const priceAnalysis = this.analyzePricePosition(klineData, currentPrice);
        const volumeIncrease = this.analyzeVolumeChange(klineData);

        console.log(`${symbol} 分析結果:`, {
          currentPrice,
          distanceFromHigh: priceAnalysis.distanceFromHigh.toFixed(2) + '%',
          distanceFromLow: priceAnalysis.distanceFromLow.toFixed(2) + '%',
          volumeIncrease: (volumeIncrease * 100).toFixed(2) + '%'
        });

        // 檢查是否在最高價或最低價的100%距離內
        const priceCondition = priceAnalysis.distanceFromHigh <= 100 || priceAnalysis.distanceFromLow <= 100;
        const volumeCondition = volumeIncrease >= this.VOLUME_INCREASE_THRESHOLD;

        console.log(`${symbol} 條件檢查:`, {
          priceCondition,
          volumeCondition,
          distanceFromHigh: priceAnalysis.distanceFromHigh.toFixed(2) + '%',
          distanceFromLow: priceAnalysis.distanceFromLow.toFixed(2) + '%',
          VOLUME_INCREASE_THRESHOLD: this.VOLUME_INCREASE_THRESHOLD
        });

        // 只要滿足價格條件就添加到結果中
        if (priceCondition) {
          console.log(`${symbol} 符合監控條件！`);
          results.push({
            symbol: symbol.replace('usdt', '').toUpperCase(),
            pricePosition: priceAnalysis.distanceFromLow <= 100 ? -1 : 1, // -1 表示接近低點，1 表示接近高點
            volumeIncrease,
            lastPrice: klineData[0].close,
            volume: klineData[0].volume,
            highPrice: priceAnalysis.highPrice.toString(),
            lowPrice: priceAnalysis.lowPrice.toString(),
            distanceFromHigh: priceAnalysis.distanceFromHigh,
            distanceFromLow: priceAnalysis.distanceFromLow
          });
        }
      } catch (error) {
        console.error(`處理 ${symbol} 時發生錯誤:`, error);
      }
    }

    console.log(`監控完成，找到 ${results.length} 個符合條件的交易對`);
    return results;
  }
}

export const newsCrawler = new NewsCrawler(); 