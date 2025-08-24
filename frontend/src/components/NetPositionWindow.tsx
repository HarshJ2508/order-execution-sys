import React, { useEffect, useState } from "react";
import { ArrowLeft, TrendingUp, TrendingDown, Calculator, DollarSign, Target, Activity, RefreshCw } from "lucide-react";

interface Trade {
  id: string;
  price: number;
  quantity: number;
  buyerUserId: string;
  sellerUserId: string;
  buyerOrderId: string;
  sellerOrderId: string;
  timestamp: number;
}

interface Position {
  symbol: string; // In your case, it's bonds, but keeping generic
  netQuantity: number;
  avgPrice: number;
  totalInvestment: number;
  currentValue: number;
  unrealizedPnL: number;
  realizedPnL: number;
  totalPnL: number;
  pnLPercentage: number;
  trades: Trade[];
  lastUpdated: number;
}

interface NetPositionProps {
  socket?: WebSocket | null;
}

const NetPosition = ({ socket }: NetPositionProps) => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [currentMarketPrice, setCurrentMarketPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [calculationMethod, setCalculationMethod] = useState<'FIFO' | 'LIFO'>('FIFO'); 

  const getUserId = () => {
    return localStorage.getItem("userID") || "no-user";
  };

  const calculatePositions = (userTrades: Trade[], method: 'FIFO' | 'LIFO' = 'FIFO') => {
    const userId = getUserId();
    if (userId === "no-user" || userTrades.length === 0) {
      return [];
    }

    // Group trades by symbol (in your case, all trades are for the same bond)
    // For demonstration, I'll treat all trades as one symbol "BOND"
    const positionMap = new Map<string, {
      buys: { price: number; quantity: number; timestamp: number; id: string }[];
      sells: { price: number; quantity: number; timestamp: number; id: string }[];
    }>();

    // Process trades for this user
    userTrades.forEach(trade => {
      const symbol = "BOND"; // You can modify this to handle multiple bonds
      
      if (!positionMap.has(symbol)) {
        positionMap.set(symbol, { buys: [], sells: [] });
      }
      
      const position = positionMap.get(symbol)!;
      
      if (trade.buyerUserId === userId) {
        position.buys.push({
          price: trade.price,
          quantity: trade.quantity,
          timestamp: trade.timestamp,
          id: trade.id
        });
      }
      
      if (trade.sellerUserId === userId) {
        position.sells.push({
          price: trade.price,
          quantity: trade.quantity,
          timestamp: trade.timestamp,
          id: trade.id
        });
      }
    });

    const calculatedPositions: Position[] = [];

    positionMap.forEach((tradeData, symbol) => {
      let { buys, sells } = tradeData;
      
      // Sort based on calculation method
      if (method === 'FIFO') {
        buys.sort((a, b) => a.timestamp - b.timestamp);
        sells.sort((a, b) => a.timestamp - b.timestamp);
      } else if (method === 'LIFO') {
        buys.sort((a, b) => b.timestamp - a.timestamp);
        sells.sort((a, b) => b.timestamp - a.timestamp);
      }

      let netQuantity = 0;
      let totalBuyQuantity = buys.reduce((sum, buy) => sum + buy.quantity, 0);
      let totalSellQuantity = sells.reduce((sum, sell) => sum + sell.quantity, 0);
      let avgPrice = 0;
      let totalInvestment = 0;
      let realizedPnL = 0;

      netQuantity = totalBuyQuantity - totalSellQuantity;

      let remainingBuys = [...buys];
        let remainingSells = [...sells];
        let tempRealizedPnL = 0;
        let tempTotalInvestment = 0;

        // Match sells against buys to calculate realized PnL
        for (const sell of sells) {
          let sellQuantityLeft = sell.quantity;
          
          while (sellQuantityLeft > 0 && remainingBuys.length > 0) {
            const buy = remainingBuys[0];
            const matchQuantity = Math.min(sellQuantityLeft, buy.quantity);
            
            tempRealizedPnL += matchQuantity * (sell.price - buy.price);
            sellQuantityLeft -= matchQuantity;
            buy.quantity -= matchQuantity;
            
            if (buy.quantity <= 0) {
              remainingBuys.shift();
            }
          }
        }

        realizedPnL = tempRealizedPnL;

        // Calculate average price of remaining position
        if (remainingBuys.length > 0) {
          const remainingValue = remainingBuys.reduce((sum, buy) => sum + (buy.price * buy.quantity), 0);
          const remainingQuantity = remainingBuys.reduce((sum, buy) => sum + buy.quantity, 0);
          avgPrice = remainingQuantity > 0 ? remainingValue / remainingQuantity : 0;
          totalInvestment = remainingValue;
        } else if (netQuantity < 0) {
          // Short position - use weighted average of sells
          const totalSellValue = sells.reduce((sum, sell) => sum + (sell.price * sell.quantity), 0);
          avgPrice = totalSellQuantity > 0 ? totalSellValue / totalSellQuantity : 0;
          totalInvestment = Math.abs(netQuantity) * avgPrice;
        }

      const currentValue = currentMarketPrice ? Math.abs(netQuantity) * currentMarketPrice : totalInvestment;
      let unrealizedPnL = 0;
      
      if (currentMarketPrice && netQuantity !== 0) {
        if (netQuantity > 0) {
          // Long position
          unrealizedPnL = (currentMarketPrice - avgPrice) * netQuantity;
        } else {
          // Short position
          unrealizedPnL = (avgPrice - currentMarketPrice) * Math.abs(netQuantity);
        }
      }

      const totalPnL = realizedPnL + unrealizedPnL;
      const pnLPercentage = totalInvestment > 0 ? (totalPnL / totalInvestment) * 100 : 0;

      if (totalBuyQuantity > 0 || totalSellQuantity > 0) {
        calculatedPositions.push({
          symbol,
          netQuantity,
          avgPrice,
          totalInvestment,
          currentValue,
          unrealizedPnL,
          realizedPnL,
          totalPnL,
          pnLPercentage,
          trades: userTrades.filter(t => t.buyerUserId === userId || t.sellerUserId === userId),
          lastUpdated: Date.now()
        });
      }
    });

    return calculatedPositions;
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const userId = getUserId();

      if (userId === "no-user") {
        setPositions([]);
        setTrades([]);
        setError("No user ID found. Please place an order first to generate a user session.");
        setLoading(false);
        return;
      }

      // Fetch user orders and trades
      const userDataRes = await fetch(`http://localhost:8000/user-orders/${userId}`);
      const userData = await userDataRes.json();
      const { orders: userOrders, trades: userTrades, currentMarketPrice: marketPrice } = userData;

      setOrders(userOrders || []);
      setTrades(userTrades || []);
      setCurrentMarketPrice(marketPrice);

      // Calculate positions
      const calculatedPositions = calculatePositions(userTrades || [], calculationMethod);
      setPositions(calculatedPositions);
      
      setError(null);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to fetch position data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [calculationMethod]);

  useEffect(() => {
    const interval = setInterval(fetchData, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [calculationMethod]);

  // WebSocket listener for real-time updates
  useEffect(() => {
    if (!socket) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.currentPrice || data.currentMarketPrice) {
          const newPrice = data.currentPrice || data.currentMarketPrice;
          setCurrentMarketPrice(newPrice);
          
          // Recalculate positions with new market price
          setPositions(prevPositions => 
            prevPositions.map(pos => {
              const currentValue = newPrice ? Math.abs(pos.netQuantity) * newPrice : pos.totalInvestment;
              let unrealizedPnL = 0;
              
              if (newPrice && pos.netQuantity !== 0) {
                if (pos.netQuantity > 0) {
                  unrealizedPnL = (newPrice - pos.avgPrice) * pos.netQuantity;
                } else {
                  unrealizedPnL = (pos.avgPrice - newPrice) * Math.abs(pos.netQuantity);
                }
              }

              const totalPnL = pos.realizedPnL + unrealizedPnL;
              const pnLPercentage = pos.totalInvestment > 0 ? (totalPnL / pos.totalInvestment) * 100 : 0;

              return {
                ...pos,
                currentValue,
                unrealizedPnL,
                totalPnL,
                pnLPercentage,
                lastUpdated: Date.now()
              };
            })
          );
        }

        // Refresh data when trades are executed
        if (data.trade || data.message?.includes('executed')) {
          setTimeout(() => fetchData(), 1000);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    socket.addEventListener('message', handleMessage);
    return () => socket.removeEventListener('message', handleMessage);
  }, [socket]);

  const getTotalMetrics = () => {
    const totalInvestment = positions.reduce((sum, pos) => sum + pos.totalInvestment, 0);
    const totalCurrentValue = positions.reduce((sum, pos) => sum + pos.currentValue, 0);
    const totalUnrealizedPnL = positions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0);
    const totalRealizedPnL = positions.reduce((sum, pos) => sum + pos.realizedPnL, 0);
    const totalPnL = totalUnrealizedPnL + totalRealizedPnL;
    const totalPnLPercentage = totalInvestment > 0 ? (totalPnL / totalInvestment) * 100 : 0;

    return {
      totalInvestment,
      totalCurrentValue,
      totalUnrealizedPnL,
      totalRealizedPnL,
      totalPnL,
      totalPnLPercentage
    };
  };

  const goBack = () => {
    window.history.back();
  };

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercentage = (percentage: number) => {
    return `${percentage >= 0 ? '+' : ''}${percentage.toFixed(2)}%`;
  };

  const totalMetrics = getTotalMetrics();

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 px-6 py-4 border-b border-gray-200">
          <button 
            onClick={goBack}
            className="flex items-center space-x-2 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all duration-200 cursor-pointer mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </button>
          <h3 className="font-semibold text-gray-900 text-lg">Net Position Window</h3>
          <p className="text-sm text-gray-600 mt-1">Your consolidated trading positions and P&L</p>
        </div>
        <div className="p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your positions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <button 
              onClick={goBack}
              className="flex items-center space-x-2 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all duration-200 cursor-pointer mb-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </button>
            <h3 className="font-semibold text-gray-900 text-lg">Net Position Window</h3>
            <p className="text-sm text-gray-600 mt-1">
              Your consolidated trading positions and P&L ({positions.length} positions)
            </p>
            {currentMarketPrice && (
              <p className="text-sm text-blue-600 font-medium mt-1">
                Current Market Price: {formatCurrency(currentMarketPrice)}
              </p>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Calculation Method</label>
              <select
                value={calculationMethod}
                onChange={(e) => setCalculationMethod(e.target.value as 'FIFO' | 'LIFO')}
                className="px-3 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option value="FIFO">First In, First Out</option>
                <option value="LIFO">Last In, First Out</option>
              </select>
            </div>
            <button
              onClick={fetchData}
              className="flex items-center space-x-2 px-3 py-2 text-green-600 hover:text-green-800 hover:bg-green-50 rounded-lg transition-all duration-200 cursor-pointer"
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 mx-6 mt-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600 text-sm">{error}</p>
          <button 
            onClick={fetchData} 
            className="mt-2 px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Portfolio Summary */}
      <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-slate-50">
        <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <DollarSign className="h-5 w-5 mr-2 text-green-600" />
          Portfolio Summary
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Investment</p>
            <p className="text-lg font-bold text-gray-900">{formatCurrency(totalMetrics.totalInvestment)}</p>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Current Value</p>
            <p className="text-lg font-bold text-gray-900">{formatCurrency(totalMetrics.totalCurrentValue)}</p>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Unrealized P&L</p>
            <p className={`text-lg font-bold ${totalMetrics.totalUnrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(totalMetrics.totalUnrealizedPnL)}
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Realized P&L</p>
            <p className={`text-lg font-bold ${totalMetrics.totalRealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(totalMetrics.totalRealizedPnL)}
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total P&L</p>
            <div className="flex items-center space-x-1">
              {totalMetrics.totalPnL >= 0 ? 
                <TrendingUp className="h-4 w-4 text-green-600" /> : 
                <TrendingDown className="h-4 w-4 text-red-600" />
              }
              <p className={`text-lg font-bold ${totalMetrics.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(totalMetrics.totalPnL)}
              </p>
              <span className={`text-sm ${totalMetrics.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ({formatPercentage(totalMetrics.totalPnLPercentage)})
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Individual Positions */}
      {positions.length === 0 && !error ? (
        <div className="p-8 text-center">
          <div className="text-gray-400 mb-4">
            <Target className="h-12 w-12 mx-auto" />
          </div>
          <h4 className="text-lg font-medium text-gray-900 mb-2">No Positions</h4>
          <p className="text-gray-600 mb-4">
            You haven't executed any trades yet. Start trading to see your positions here.
          </p>
          <button 
            onClick={goBack}
            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
          >
            Start Trading
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Symbol
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Net Quantity
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Avg Price
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Investment
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Current Value
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Unrealized P&L
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Realized P&L
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Total P&L
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  % P&L
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {positions.map((position, index) => (
                <tr key={index} className="hover:bg-gray-50 transition-colors duration-150">
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <Activity className="h-4 w-4 text-blue-500" />
                      <div>
                        <div className="text-sm font-medium text-gray-900">{position.symbol}</div>
                        <div className="text-xs text-gray-500">
                          {position.trades.length} trade{position.trades.length !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className={`text-sm font-medium ${position.netQuantity >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {position.netQuantity >= 0 ? '+' : ''}{position.netQuantity.toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500">
                      {position.netQuantity >= 0 ? 'Long' : 'Short'}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="text-sm font-medium text-gray-900">
                      {formatCurrency(position.avgPrice)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {calculationMethod}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="text-sm font-medium text-gray-900">
                      {formatCurrency(position.totalInvestment)}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="text-sm font-medium text-gray-900">
                      {formatCurrency(position.currentValue)}
                    </div>
                    {currentMarketPrice && (
                      <div className="text-xs text-gray-500">
                        @ {formatCurrency(currentMarketPrice)}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className={`text-sm font-medium ${position.unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(position.unrealizedPnL)}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className={`text-sm font-medium ${position.realizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(position.realizedPnL)}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className={`text-sm font-bold ${position.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(position.totalPnL)}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center space-x-1">
                      {position.totalPnL >= 0 ? 
                        <TrendingUp className="h-3 w-3 text-green-600" /> : 
                        <TrendingDown className="h-3 w-3 text-red-600" />
                      }
                      <span className={`text-sm font-medium ${position.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatPercentage(position.pnLPercentage)}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default NetPosition;