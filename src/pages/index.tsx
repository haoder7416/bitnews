import { useState, useEffect } from 'react';
import { Inter } from "next/font/google";
import { MagnifyingGlassIcon, ChartBarIcon, GlobeAltIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { io } from 'socket.io-client';
import type { NewsItem } from '@/services/newsCrawler';

interface ScreenerResult {
  symbol: string;
  pricePosition: number;
  volumeIncrease: number;
  lastPrice: string;
  volume: string;
  highPrice: string;
  lowPrice: string;
  distanceFromHigh: number;
  distanceFromLow: number;
}

const inter = Inter({
  subsets: ["latin"],
});

export default function Home() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('全部');
  const [selectedLanguage, setSelectedLanguage] = useState<'all' | 'en' | 'zh'>('all');
  const [news, setNews] = useState<NewsItem[]>([]);
  const [minReliability, setMinReliability] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [screeningResults, setScreeningResults] = useState<ScreenerResult[]>([]);
  const [activeTab, setActiveTab] = useState<'news' | 'market'>('news');
  const [lastScreeningUpdate, setLastScreeningUpdate] = useState<Date | null>(null);

  useEffect(() => {
    const socket = io({
      path: '/api/websocket',
    });

    socket.on('connect', () => {
      console.log('Connected to WebSocket');
      setIsConnected(true);
    });

    socket.on('news', (updatedNews: NewsItem[]) => {
      console.log('收到新聞更新:', updatedNews.length);
      setNews(prev => {
        const newsMap = new Map();
        [...prev, ...updatedNews].forEach(item => {
          newsMap.set(item.id, item);
        });
        return Array.from(newsMap.values());
      });
    });

    socket.on('screening_results', (results: ScreenerResult[]) => {
      console.log('收到市場監控結果:', results);
      setScreeningResults(results);
      setLastScreeningUpdate(new Date());
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from WebSocket');
      setIsConnected(false);
    });

    socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // 過濾新聞
  const filteredNews = news.filter((item) => {
    const matchesSearch = item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === '全部' || item.category === selectedCategory;
    const matchesLanguage = selectedLanguage === 'all' || item.language === selectedLanguage;
    const matchesReliability = item.reliability >= minReliability;
    return matchesSearch && matchesCategory && matchesLanguage && matchesReliability;
  });

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return 'text-green-600';
      case 'negative': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getImpactBadgeColor = (impact: string) => {
    switch (impact) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-blue-100 text-blue-800';
    }
  };

  return (
    <div className={inter.className}>
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col space-y-4">
            <div className="flex justify-between items-center">
              <h1 className="text-3xl font-bold text-gray-900">幣星文</h1>
              <div className="flex space-x-4">
                <button
                  onClick={() => setActiveTab('news')}
                  className={`px-4 py-2 rounded-md text-sm font-medium ${
                    activeTab === 'news'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  新聞中心
                </button>
                <button
                  onClick={() => setActiveTab('market')}
                  className={`px-4 py-2 rounded-md text-sm font-medium ${
                    activeTab === 'market'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  市場監控
                </button>
              </div>
            </div>
            
            {activeTab === 'news' && (
              <div className="flex flex-col space-y-4">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="搜尋新聞..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                
                <div className="flex justify-between items-center">
                  <div className="flex space-x-4 items-center">
                    <GlobeAltIcon className="h-5 w-5 text-gray-500" />
                    <select
                      value={selectedLanguage}
                      onChange={(e) => setSelectedLanguage(e.target.value as 'all' | 'en' | 'zh')}
                      className="rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    >
                      <option value="all">所有語言</option>
                      <option value="zh">中文</option>
                      <option value="en">English</option>
                    </select>
                  </div>

                  <div className="flex space-x-4 items-center">
                    <ShieldCheckIcon className="h-5 w-5 text-gray-500" />
                    <select
                      value={minReliability}
                      onChange={(e) => setMinReliability(Number(e.target.value))}
                      className="rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    >
                      <option value="0">所有可信度</option>
                      <option value="70">高可信度 (70+)</option>
                      <option value="50">中等可信度 (50+)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {activeTab === 'market' ? (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">市場異動監控</h2>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <span className="text-sm text-gray-500">
                    {isConnected ? '監控中' : '已斷開'}
                  </span>
                </div>
                {lastScreeningUpdate && (
                  <span className="text-sm text-gray-500">
                    最後更新: {lastScreeningUpdate.toLocaleTimeString('zh-TW')}
                  </span>
                )}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
              <div className="text-sm text-gray-600">
                <p>監控條件：</p>
                <ul className="list-disc list-inside mt-2">
                  <li>價格位置：距離最高點或最低點在 100% 範圍內</li>
                  <li>成交量：突然增加超過前幾個時段平均值的 2 倍</li>
                  <li>更新頻率：每 3 分鐘</li>
                </ul>
                <p className="mt-2 text-xs text-gray-500">
                  {isConnected ? (
                    lastScreeningUpdate ? (
                      `上次更新時間: ${lastScreeningUpdate.toLocaleString('zh-TW')}`
                    ) : '等待首次更新...'
                  ) : '連接已斷開，請重新整理頁面'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {!isConnected ? (
                <div className="col-span-full text-center text-gray-500 py-8">
                  正在連接監控服務...
                </div>
              ) : screeningResults.length === 0 ? (
                <div className="col-span-full text-center text-gray-500 py-8">
                  {lastScreeningUpdate ? '暫無異動提醒' : '正在進行首次監控...'}
                </div>
              ) : (
                screeningResults.map((result) => (
                  <div key={result.symbol} className="bg-white rounded-lg shadow p-4">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-lg font-medium text-indigo-600">{result.symbol}</h3>
                      <span className="text-sm font-medium text-gray-500">
                        ${parseFloat(result.lastPrice).toFixed(2)}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">最高價</span>
                        <span className="font-medium text-gray-900">
                          ${parseFloat(result.highPrice).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">最低價</span>
                        <span className="font-medium text-gray-900">
                          ${parseFloat(result.lowPrice).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">距離高點</span>
                        <span className={`font-medium ${
                          result.distanceFromHigh <= 100 ? 'text-red-600' : 'text-gray-600'
                        }`}>
                          {result.distanceFromHigh.toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">距離低點</span>
                        <span className={`font-medium ${
                          result.distanceFromLow <= 100 ? 'text-green-600' : 'text-gray-600'
                        }`}>
                          {result.distanceFromLow.toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">成交量增幅</span>
                        <span className="font-medium text-indigo-600">
                          {(result.volumeIncrease * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">24h成交量</span>
                        <span className="font-medium text-gray-900">
                          {parseFloat(result.volume).toLocaleString()} USDT
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="mb-6 flex space-x-4 overflow-x-auto">
              {['全部', '市場動態', '技術發展', '監管政策', '產業新聞', '其他'].map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap ${
                    selectedCategory === category
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>

            <div className="bg-white shadow overflow-hidden sm:rounded-md">
              {!isConnected ? (
                <div className="p-4 text-center text-gray-500">
                  正在連接伺服器...
                </div>
              ) : filteredNews.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  {news.length === 0 ? '正在獲取新聞...' : '沒有符合條件的新聞'}
                </div>
              ) : (
                <ul className="divide-y divide-gray-200">
                  {filteredNews.map((item) => (
                    <li key={item.id}>
                      <a href={item.url} target="_blank" rel="noopener noreferrer">
                        <div className="px-4 py-4 sm:px-6 hover:bg-gray-50">
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2">
                                <h3 className="text-lg font-medium text-indigo-600 truncate">
                                  {item.title}
                                </h3>
                                <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">
                                  可信度: {item.reliability}
                                </span>
                              </div>
                              <p className="mt-1 text-sm text-gray-600">
                                {item.description}
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                                <span className="text-gray-500">{item.source}</span>
                                <span className="text-gray-500">{new Date(item.date).toLocaleString('zh-TW')}</span>
                                <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                                  {item.category}
                                </span>
                                
                                {item.marketImpact && (
                                  <>
                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getSentimentColor(item.marketImpact.sentiment)}`}>
                                      情緒: {item.marketImpact.sentiment === 'positive' ? '正面' : item.marketImpact.sentiment === 'negative' ? '負面' : '中性'}
                                    </span>
                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getImpactBadgeColor(item.marketImpact.potentialImpact)}`}>
                                      影響: {item.marketImpact.potentialImpact === 'high' ? '高' : item.marketImpact.potentialImpact === 'medium' ? '中' : '低'}
                                    </span>
                                    {item.marketImpact.relatedAssets.length > 0 && (
                                      <span className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-800 rounded-full">
                                        相關: {item.marketImpact.relatedAssets.join(', ')}
                                      </span>
                                    )}
                                  </>
                                )}
                                
                                {item.marketData && (
                                  <div className="flex items-center space-x-2">
                                    <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                                      價格: ${parseFloat(item.marketData.price).toFixed(2)}
                                    </span>
                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                      parseFloat(item.marketData.change24h) >= 0
                                        ? 'bg-green-100 text-green-800'
                                        : 'bg-red-100 text-red-800'
                                    }`}>
                                      24h: {item.marketData.change24h}
                                    </span>
                                    <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">
                                      成交量: {parseFloat(item.marketData.volume24h).toLocaleString()} USDT
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
