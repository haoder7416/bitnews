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

    io.on('connection', (socket) => {
      console.log('Client connected');

      // 立即發送當前新聞
      newsCrawler.crawlAllSources().then((news) => {
        socket.emit('news', news);
      });

      // 設置定時爬蟲
      const crawlInterval = setInterval(async () => {
        try {
          const news = await newsCrawler.crawlAllSources();
          socket.emit('news', news);
        } catch (error) {
          console.error('Error crawling news:', error);
        }
      }, 1000); // 每秒更新一次

      socket.on('disconnect', () => {
        console.log('Client disconnected');
        clearInterval(crawlInterval);
      });
    });

    res.socket.server.io = io;
  }

  res.end();
};

export default ioHandler; 