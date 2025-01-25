import { useState } from 'react';
import { Inter } from "next/font/google";
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

const inter = Inter({
  subsets: ["latin"],
});

// 模擬新聞數據
const mockNews = [
  {
    id: 1,
    title: 'Bitcoin突破5萬美元大關',
    description: '比特幣價格在多重利好因素推動下突破5萬美元...',
    source: 'CoinDesk',
    date: '2024-01-25',
    category: '市場動態',
  },
  {
    id: 2,
    title: 'Ethereum 2.0質押量創新高',
    description: 'Ethereum網絡質押量突破2000萬個ETH...',
    source: 'CoinTelegraph',
    date: '2024-01-25',
    category: '技術發展',
  },
  // 更多模擬數據...
];

export default function Home() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('全部');

  return (
    <div className={inter.className}>
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-900">幣星文</h1>
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
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* 分類過濾器 */}
        <div className="mb-6 flex space-x-4">
          {['全部', '市場動態', '技術發展', '監管政策', '產業新聞'].map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                selectedCategory === category
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {/* 新聞列表 */}
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <ul className="divide-y divide-gray-200">
            {mockNews.map((news) => (
              <li key={news.id}>
                <div className="px-4 py-4 sm:px-6 hover:bg-gray-50 cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-medium text-indigo-600 truncate">
                        {news.title}
                      </h3>
                      <p className="mt-1 text-sm text-gray-600">
                        {news.description}
                      </p>
                      <div className="mt-2 flex items-center text-sm text-gray-500">
                        <span className="mr-4">{news.source}</span>
                        <span>{news.date}</span>
                        <span className="ml-4 px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          {news.category}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
