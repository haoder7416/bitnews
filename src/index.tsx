import React, { useState } from 'react';

interface ScreeningResult {
  symbol: string;
  lastPrice: string;
  highPrice: string;
  lowPrice: string;
  distanceFromHigh: number;
  distanceFromLow: number;
  volumeIncrease: number;
}

const [screeningResults, setScreeningResults] = useState<ScreeningResult[]>([]);

          {screeningResults.map((result: ScreeningResult, index: number) => (
            <div key={index} className="p-4 bg-white rounded-lg shadow mb-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-bold">{result.symbol}</h3>
                <span className="text-gray-600">價格: ${parseFloat(result.lastPrice).toFixed(2)}</span>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-2">
                <div>
                  <p className="text-sm text-gray-600">最高價</p>
                  <p className="font-medium">${parseFloat(result.highPrice).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">最低價</p>
                  <p className="font-medium">${parseFloat(result.lowPrice).toFixed(2)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-2">
                <div>
                  <p className="text-sm text-gray-600">距離最高價</p>
                  <p className={`font-medium ${result.distanceFromHigh <= 50 ? 'text-green-600' : 'text-yellow-600'}`}>
                    {result.distanceFromHigh.toFixed(2)}%
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">距離最低價</p>
                  <p className={`font-medium ${result.distanceFromLow <= 50 ? 'text-red-600' : 'text-yellow-600'}`}>
                    {result.distanceFromLow.toFixed(2)}%
                  </p>
                </div>
              </div>

              <div className="mt-2">
                <p className="text-sm text-gray-600">成交量增幅</p>
                <p className={`font-medium ${result.volumeIncrease >= 2 ? 'text-green-600' : 'text-gray-600'}`}>
                  {(result.volumeIncrease * 100).toFixed(2)}%
                </p>
              </div>
            </div>
          ))} 