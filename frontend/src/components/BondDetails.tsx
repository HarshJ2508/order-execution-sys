import { useEffect, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { Link } from "react-router-dom";

interface Bond {
  ticker: string;
  description: string;
  ytm: number;
  faceValue: number;
  currentYield: number;
  couponRate: number;
  modifiedDuration: number;
  daysToMaturity: number;
  maturityDate: string;
  nextCouponDate: string;
  frequency: string;
}

interface Order {
  price: number;
  qty: number;
  orders?: number;
}

interface BondDetailsProps {
  socket: WebSocket | null;
  bond: Bond;
  onBack: () => void;
}

const BondDetails = ({ socket, bond, onBack }: BondDetailsProps) => {
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [order, setOrder] = useState<{ 
    type: 'bid' | 'ask'; 
    qty: number; 
    price: number;
    orderType: 'limit' | 'market';
    stopLoss: number;
    stopLossType: 'stop_loss' | 'take_profit' | '';
    enableStopLoss: boolean;
  }>();
  const [orderBook, setOrderBook] = useState<{
    bids: Order[],
    asks: Order[],
    currentMarketPrice?: number
  }>();
  const [currentMarketPrice, setCurrentMarketPrice] = useState<number | null>(null);

  const generateOrderBook = async () => {
    let bids: Order[] = [];
    let asks: Order[] = [];
    let marketPrice = null;
    try {
      const res = await fetch('http://localhost:8000/order-book');
      const data = await res.json();
      bids = data.bids ?? [];
      asks = data.asks ?? [];
      marketPrice = data.currentMarketPrice;
    } catch (error) {
      console.log(error);
    }
    return { bids, asks, currentMarketPrice: marketPrice };
  };

  // Initial order book fetch
  useEffect(() => {
    generateOrderBook()
    .then(res => {
      const { bids, asks, currentMarketPrice } = res;
      setOrderBook({ bids, asks, currentMarketPrice });
      setCurrentMarketPrice(currentMarketPrice);
    })
    .catch(err => {
      console.log(err);
    })
  }, [showOrderModal]);

  // WebSocket message listener for real-time updates
  useEffect(() => {
    if (!socket) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        
        // Store user ID when we get the connection confirmation
        if (data.message === "Connected to WebSocket" && data.id) {
          localStorage.setItem("userID", data.id);
        }
        
        // Update order book and market price when receiving bids/asks data
        if (data.bids && data.asks) {
          setOrderBook({
            bids: data.bids,
            asks: data.asks,
            currentMarketPrice: data.currentMarketPrice
          });
          if (data.currentMarketPrice) {
            setCurrentMarketPrice(data.currentMarketPrice);
          }
        }
        
        // Handle trade execution updates
        if (data.trade) {
          console.log('Trade executed:', data.trade);
          if (data.currentPrice) {
            setCurrentMarketPrice(data.currentPrice);
          }
        }

        // Handle stop-loss triggers
        if (data.triggeredOrders && data.triggeredOrders.length > 0) {
          console.log('Stop-loss orders triggered:', data.triggeredOrders);
          data.triggeredOrders.forEach((triggeredOrder: any) => {
            console.log(`${triggeredOrder.triggerReason}: Order ${triggeredOrder.id} at ₹${triggeredOrder.stopLossTriggerPrice}`);
          });
        }
        
        // Handle order confirmations
        if (data.message && (data.message.includes('order placed') || data.message.includes('cancelled'))) {
          console.log('Order update:', data.message);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    socket.addEventListener('message', handleMessage);
    return () => {
      socket.removeEventListener('message', handleMessage);
    };
  }, [socket]);

  const openOrderModal = (type: 'bid' | 'ask') => {
    const bestPrice = getBestPrice(type);
    setOrder({ 
      type, 
      qty: 1, 
      price: bestPrice || 100, 
      orderType: 'limit',
      stopLoss: 0,
      stopLossType: '',
      enableStopLoss: false
    });
    setShowOrderModal(true);
  };

  const closeOrderModal = () => {
    setShowOrderModal(false);
    setOrder(undefined);
  };

  const getBestPrice = (type: 'bid' | 'ask') => {
    if (type === 'bid' && orderBook?.asks?.length) {
      return orderBook.asks[0].price;
    }
    if (type === 'ask' && orderBook?.bids?.length) {
      return orderBook.bids[0].price;
    }
    return 0;
  };

  const validateStopLoss = () => {
    if (!order || !order.enableStopLoss || !order.stopLoss || !order.stopLossType) {
      return true;
    }

    const { type, price, stopLoss, stopLossType, orderType } = order;
    const effectivePrice = orderType === 'market' ? getBestPrice(type) : price;

    if (type === 'bid') {
      if (stopLossType === 'stop_loss' && stopLoss >= effectivePrice) {
        return "For buy orders, stop-loss price must be below the order price";
      }
      if (stopLossType === 'take_profit' && stopLoss <= effectivePrice) {
        return "For buy orders, take-profit price must be above the order price";
      }
    } else {
      if (stopLossType === 'stop_loss' && stopLoss <= effectivePrice) {
        return "For sell orders, stop-loss price must be above the order price";
      }
      if (stopLossType === 'take_profit' && stopLoss >= effectivePrice) {
        return "For sell orders, take-profit price must be below the order price";
      }
    }

    return true;
  };

  const handlePlaceOrder = async () => {
    if (!order) return;

    // Basic validation
    if (order.qty <= 0) {
      alert("Quantity must be greater than 0");
      return;
    }

    if (order.orderType === 'limit' && order.price <= 0) {
      alert("Price must be greater than 0");
      return;
    }

    const stopLossValidation = validateStopLoss();
    if (stopLossValidation !== true) {
      alert(stopLossValidation);
      return;
    }

    console.log('Order placed:', order);
    if (socket && socket.readyState === WebSocket.OPEN) {
      const orderData = {
        type: order.type,
        qty: order.qty,
        price: order.orderType === 'market' ? getBestPrice(order.type) : order.price,
        orderType: order.orderType,
        stopLoss: order.enableStopLoss ? order.stopLoss : undefined,
        stopLossType: order.enableStopLoss ? order.stopLossType : undefined
      };
      
      socket.send(JSON.stringify(orderData));
    } else {
      console.error('WebSocket is not connected');
    }
    closeOrderModal();
  };

  const handleOrderTypeChange = (orderType: 'limit' | 'market') => {
    setOrder((prevOrder) => {
      if (!prevOrder) return undefined;
      
      const newOrder = { ...prevOrder, orderType };
      
      if (orderType === 'market') {
        newOrder.price = getBestPrice(prevOrder.type);
      }
      
      return newOrder;
    });
  };

  const handleStopLossToggle = (enabled: boolean) => {
    setOrder((prevOrder) => {
      if (!prevOrder) return undefined;
      return {
        ...prevOrder,
        enableStopLoss: enabled,
        stopLoss: enabled ? prevOrder.stopLoss : 0,
        stopLossType: enabled ? (prevOrder.stopLossType || 'stop_loss') : ''
      };
    });
  };

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button 
              onClick={onBack}
              className="flex items-center space-x-2 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all duration-200 cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="border-l border-gray-300 pl-4">
              <h1 className="text-lg font-bold text-gray-900">{bond.ticker}</h1>
              <p className="text-xs text-gray-600 max-w-md truncate">{bond.description}</p>
            </div>
          </div>
          
          <div className="text-right">
            <div className="text-xl font-bold text-green-600">{bond.ytm}%</div>
            <p className="text-xs text-gray-500">Yield to Maturity</p>
            {currentMarketPrice && (
              <p className="text-sm text-blue-600 font-semibold">
                Last Price: ₹{currentMarketPrice}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 px-6 py-4 overflow-hidden">
        <div className="grid grid-cols-12 gap-4 h-full">
          {/* Bond Info Panel */}
          <div className="col-span-3">
            <div className="bg-white rounded-lg border border-gray-200 h-full">
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 border-b border-gray-200">
                <h3 className="font-semibold text-gray-900">Bond Details</h3>
              </div>
              <div className="p-4 space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Face Value</span>
                  <span className="font-semibold">₹{bond.faceValue.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Current Yield</span>
                  <span className="font-semibold">{bond.currentYield}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Coupon Rate</span>
                  <span className="font-semibold">{bond.couponRate}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Duration</span>
                  <span className="font-semibold">{bond.modifiedDuration}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Days to Maturity</span>
                  <span className="font-semibold">{bond.daysToMaturity}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Maturity Date</span>
                  <span className="font-semibold">{bond.maturityDate}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Next Coupon</span>
                  <span className="font-semibold">{bond.nextCouponDate}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Frequency</span>
                  <span className="font-semibold">{bond.frequency}</span>
                </div>
                {currentMarketPrice && (
                  <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                    <span className="text-gray-600">Market Price</span>
                    <span className="font-bold text-blue-600">₹{currentMarketPrice}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2 border-t border-gray-200"></div>
                <div className="flex flex-col gap-2">
                  <Link to={'/my-order'} className="text-gray-600">Check my orders</Link> 
                  <Link to={'/net-position'} className="text-gray-600">Check net positions</Link>
                </div>
              </div>
            </div>
          </div>

          {/* Order Book Panel */}
          <div className="col-span-9">
            <div className="bg-white rounded-lg border border-gray-200 h-full flex flex-col">
              <div className="bg-gradient-to-r from-gray-50 to-slate-50 px-4 py-3 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">Market Depth</h3>
                  <div className="text-sm text-gray-500">
                    {socket?.readyState === WebSocket.OPEN ? 
                      <span className="text-green-600">● Connected</span> : 
                      <span className="text-red-600">● Disconnected</span>
                    }
                  </div>
                </div>
              </div>

              <div className="flex-1 p-4 overflow-hidden">
                <div className="grid grid-cols-2 gap-6 h-full">
                  {/* Bids */}
                  <div className="flex flex-col">
                    <div className="flex items-center space-x-2 mb-3">
                      <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
                      <h4 className="font-semibold text-emerald-600">Bids ({orderBook?.bids?.length || 0})</h4>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className="grid grid-cols-3 gap-3 text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2 border-b border-gray-200">
                        <span>Price</span>
                        <span className="text-center">Quantity</span>
                        <span className="text-center">Orders</span>
                      </div>
                      
                      <div className="mt-2 space-y-1 overflow-y-auto max-h-96">
                        {orderBook?.bids?.length ? orderBook.bids.map((bid, index) => (
                          <div 
                            key={index} 
                            className="grid grid-cols-3 gap-3 pb-3 border-b border-gray-200 py-2 hover:bg-green-50 rounded transition-colors duration-150 cursor-pointer"
                            onClick={() => openOrderModal('ask')}
                          >
                            <span className="font-bold text-emerald-600 text-sm tracking-wide">{bid.price !== 0 ? `₹ ${bid.price}` : '-'}</span>
                            <span className="text-center font-medium text-gray-900 text-sm"> {bid.qty} </span>
                            <span className="text-center text-gray-600 text-sm">{bid.orders ?? 1}</span>
                          </div>
                        )) : (
                          <div className="text-center text-gray-500 py-8">No bids available</div>
                        )}
                      </div>
                    </div>
                    <button 
                      onClick={() => openOrderModal('bid')}
                      className="px-4 py-3 text-white bg-emerald-500 cursor-pointer rounded-lg font-medium transition-colors duration-200 text-sm hover:bg-emerald-600"
                    >
                      BUY
                    </button>
                  </div>
                  
                  {/* Asks */}
                  <div className="flex flex-col">
                    <div className="flex items-center space-x-2 mb-3">
                      <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                      <h4 className="font-semibold text-red-500">Asks ({orderBook?.asks?.length || 0})</h4>
                    </div>
                    
                    <div className="flex-1 overflow-hidden">
                      <div className="grid grid-cols-3 gap-3 text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2 border-b border-gray-200">
                        <span>Price</span>
                        <span className="text-center">Quantity</span>
                        <span className="text-center">Orders</span>
                      </div>
                      
                      <div className="mt-2 space-y-1 overflow-y-auto max-h-96">
                        {orderBook?.asks?.length ? orderBook.asks.map((ask, index) => (
                          <div 
                            key={index} 
                            className="grid grid-cols-3 gap-3 py-2 pb-3 border-b border-gray-200 hover:bg-red-50 rounded transition-colors duration-150 cursor-pointer"
                            onClick={() => openOrderModal('bid')}
                          >
                            <span className="font-bold text-red-500 text-sm tracking-wide">{ask.price !== 0 ? `₹ ${ask.price}` : '-'}</span>
                            <span className="text-center font-medium text-gray-900 text-sm">{ask.qty}</span>
                            <span className="text-center text-gray-600 text-sm">{ask.orders ?? 1}</span>
                          </div>
                        )) : (
                          <div className="text-center text-gray-500 py-8">No asks available</div>
                        )}
                      </div>
                    </div>

                    <button 
                      onClick={() => openOrderModal('ask')}
                      className="px-4 py-3 cursor-pointer bg-red-500 hover:bg-red-700 text-white rounded-lg font-medium transition-colors duration-200 text-sm"
                    >
                      SELL
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Order Modal */}
      {showOrderModal && order && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-96 max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {order.type === 'bid' ? 'Buy Order' : 'Sell Order'} - {bond.ticker}
              </h3>
              <button 
                onClick={closeOrderModal}
                className="p-1 hover:bg-gray-100 cursor-pointer rounded-full transition-colors"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Order Type Selection */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Order Type</label>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleOrderTypeChange('limit')}
                    className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all duration-200 ${
                      order.orderType === 'limit'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Limit
                  </button>
                  <button
                    onClick={() => handleOrderTypeChange('market')}
                    className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all duration-200 ${
                      order.orderType === 'market'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Market
                  </button>
                </div>
              </div>

              {/* Quantity Input */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={order.qty}
                  onChange={(e) => setOrder(prev => prev ? { ...prev, qty: parseInt(e.target.value) || 0 } : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter quantity"
                />
              </div>

              {/* Price Input (only for limit orders) */}
              {order.orderType === 'limit' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Price (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={order.price}
                    onChange={(e) => setOrder(prev => prev ? { ...prev, price: parseFloat(e.target.value) || 0 } : undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter price"
                  />
                </div>
              )}

              {/* Market Price Display (for market orders) */}
              {order.orderType === 'market' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Market Price (₹)</label>
                  <div className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-700">
                    {order.price > 0 ? `₹${order.price}` : 'No market price available'}
                  </div>
                </div>
              )}

              {/* Stop Loss Section */}
              <div>
                <div className="flex items-center space-x-2 mb-2">
                  <input
                    type="checkbox"
                    id="enable-stop-loss"
                    checked={order.enableStopLoss}
                    onChange={(e) => handleStopLossToggle(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="enable-stop-loss" className="text-sm font-semibold text-gray-700">
                    Enable Stop-Loss
                  </label>
                </div>

                {order.enableStopLoss && (
                  <div className="space-y-3 mt-3 p-3 bg-gray-50 rounded-lg">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {order.stopLossType === 'stop_loss' ? 'Stop-Loss' : 'Take-Profit'} Price (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={order.stopLoss}
                        onChange={(e) => setOrder(prev => prev ? { ...prev, stopLoss: parseFloat(e.target.value) || 0 } : undefined)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder={`Enter ${order.stopLossType === 'stop_loss' ? 'stop-loss' : 'take-profit'} price`}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Order Summary */}
              <div className="bg-gray-50 rounded-lg p-3">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Order Summary</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Type:</span>
                    <span className="font-medium">{order.type === 'bid' ? 'Buy' : 'Sell'} ({order.orderType})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Quantity:</span>
                    <span className="font-medium">{order.qty}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Price:</span>
                    <span className="font-medium">₹{order.price}</span>
                  </div>
                  <div className="flex justify-between font-semibold border-t border-gray-300 pt-1">
                    <span className="text-gray-700">Total Value:</span>
                    <span className="text-gray-900">₹{(order.qty * order.price).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-3">
                <button
                  onClick={closeOrderModal}
                  className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePlaceOrder}
                  disabled={!socket || socket.readyState !== WebSocket.OPEN}
                  className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors duration-200 text-white ${
                    order.type === 'bid' 
                      ? 'bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-400' 
                      : 'bg-red-500 hover:bg-red-600 disabled:bg-gray-400'
                  } disabled:cursor-not-allowed`}
                >
                  Place {order.type === 'bid' ? 'Buy' : 'Sell'} Order
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BondDetails;