import { Server } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import type { NextApiRequest, NextApiResponse } from 'next';
import { Socket } from 'net';
import { NewsCrawler } from '@/services/newsCrawler';

interface CustomServer extends HTTPServer {
  io?: Server;
}

interface CustomSocket extends Socket {
  server: CustomServer;
}

interface CustomResponse extends NextApiResponse {
  socket: CustomSocket;
}

export const config = {
  api: {
    bodyParser: false,
  },
};

const ioHandler = (req: NextApiRequest, res: CustomResponse) => {
  if (!res.socket.server.io) {
    const httpServer: HTTPServer = res.socket.server as any;
    const io = new Server(httpServer, {
      path: '/api/websocket',
      addTrailingSlash: false,
    });

    const newsCrawler = new NewsCrawler();
    const newsCache = new Map<string, any>();
    const screeningIntervals = new Map<string, NodeJS.Timeout>();

    io.on('connection', (socket) => {
      console.log('Client connected');

      // 發送緩存的新聞
      if (newsCache.size > 0) {
        const cachedNews = Array.from(newsCache.values());
        socket.emit('news', cachedNews);
      }

      // 立即執行一次市場監控
      console.log('執行初始市場監控...');
      newsCrawler.screenSymbols().then(results => {
        if (results.length > 0) {
          console.log('發現符合條件的交易對:', results);
          socket.emit('screening_results', results);
        } else {
          console.log('未發現符合條件的交易對');
        }
      }).catch(error => {
        console.error('初始市場監控發生錯誤:', error);
      });

      // 開始定期篩選
      const screeningInterval = setInterval(async () => {
        try {
          console.log('執行定期市場監控...');
          const screenResults = await newsCrawler.screenSymbols();
          console.log('監控結果:', screenResults);
          socket.emit('screening_results', screenResults);
        } catch (error) {
          console.error('定期市場監控發生錯誤:', error);
        }
      }, 180000); // 每3分鐘執行一次

      screeningIntervals.set(socket.id, screeningInterval);

      // 開始爬取每個新聞源
      Object.entries(newsCrawler.getSources()).forEach(async ([sourceName, sourceConfig]) => {
        try {
          console.log(`Starting to crawl ${sourceName}...`);
          
          const news = sourceConfig.type === 'rss'
            ? await newsCrawler.crawlRSSFeed(sourceConfig.url, sourceConfig)
            : await newsCrawler.crawlHTMLPage(sourceConfig.url, sourceConfig);

          const processedNews = await newsCrawler.processNews(news);
          
          processedNews.forEach(item => {
            newsCache.set(item.id, item);
          });

          const allNews = Array.from(newsCache.values());
          socket.emit('news', allNews);
          
          console.log(`Finished crawling ${sourceName}, found ${processedNews.length} news items`);
        } catch (error) {
          console.error(`Error crawling ${sourceName}:`, error);
        }
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected');
        // 清理篩選間隔
        const interval = screeningIntervals.get(socket.id);
        if (interval) {
          clearInterval(interval);
          screeningIntervals.delete(socket.id);
        }
      });
    });

    res.socket.server.io = io;
  }

  res.end();
};

export default ioHandler; 