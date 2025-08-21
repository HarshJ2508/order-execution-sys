import { useEffect, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import type { Bond, Order } from "./BondTable";
import axios from "axios";
import { Link } from "react-router-dom";

interface BondDetailsProps {
  socket: WebSocket | null;
  bond: Bond;
  onBack: () => void;
}

const BondDetails = ({ socket, bond, onBack }: BondDetailsProps) => {
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [order, setOrder] = useState<{ 
    type: 'bid' | 'ask', 
    qty: number, 
    price: number,
    orderType: 'limit' | 'market'
  }>();
  const [orderBook, setOrderBook] = useState<{
    bids: Order[],
    asks: Order[]
  }>();

  const generateOrderBook = async () => {
    let bids: Order[] = [];
    let asks: Order[] = [];
    try {
      const res = await axios.get('http://localhost:8000/order-book');
      bids = res.data.bids ?? [];
      asks = res.data.asks ?? [];
    } catch (error) {
      console.log(error);
    }
    return { bids, asks };
  };

  // Initial order book fetch
  useEffect(() => {
    generateOrderBook()
    .then(res => {
      const bids = res.bids;
      const asks = res.asks;
      setOrderBook({
        bids,
        asks
      })
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
        
        // Update order book when receiving bids/asks data
        if (data.bids && data.asks) {
          setOrderBook({
            bids: data.bids,
            asks: data.asks
          });
        }
        
        // Handle trade execution updates
        if (data.trade) {
          console.log('Trade executed:', data.trade);
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

    // Cleanup listener on unmount or socket change
    return () => {
      socket.removeEventListener('message', handleMessage);
    };
  }, [socket]);

  const openOrderModal = (type: 'bid' | 'ask') => {
    setOrder({ type, qty: 0, price: 0, orderType: 'limit' });
    setShowOrderModal(true);
  };

  const closeOrderModal = () => {
    setShowOrderModal(false);
    setOrder(undefined);
  };

  const getBestPrice = (type: 'bid' | 'ask') => {
    if (type === 'bid' && orderBook?.asks?.length) {
      return orderBook.asks[0].price; // Best ask price for buying
    }
    if (type === 'ask' && orderBook?.bids?.length) {
      return orderBook.bids[0].price; // Best bid price for selling
    }
    return 0;
  };

  const handlePlaceOrder = async () => {
    console.log('Order placed:', order);
    if (socket && socket.readyState === WebSocket.OPEN) {
      const orderData = {
        type: order?.type,
        qty: order?.qty,
        price: order?.orderType === 'market' ? getBestPrice(order.type) : order?.price,
        orderType: order?.orderType
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
      
      // For market orders, set price to best available price
      if (orderType === 'market') {
        newOrder.price = getBestPrice(prevOrder.type);
      }
      
      return newOrder;
    });
  };

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Compact Header */}
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
          </div>
        </div>
      </div>

      {/* Main Content - Single Viewport */}
      <div className="flex-1 px-6 py-4 overflow-hidden">
        <div className="grid grid-cols-12 gap-4 h-full">
          {/* Left Panel - Bond Info */}
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
                <Link to={'/my-order'}>Check your order</Link>
              </div>
            </div>
          </div>

          {/* Right Panel - Order Book with Trading Buttons */}
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

      {showOrderModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-96 max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {order?.type === 'bid' ? 'Buy Order' : 'Sell Order'} - {bond.ticker}
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
                    className={`flex-1 py-2 px-3 rounded-lg font-medium text-sm transition-colors duration-200 ${
                      order?.orderType === 'limit'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Limit Order
                  </button>
                  <button
                    onClick={() => handleOrderTypeChange('market')}
                    className={`flex-1 py-2 px-3 rounded-lg font-medium text-sm transition-colors duration-200 ${
                      order?.orderType === 'market'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Market Order
                  </button>
                </div>
                {order?.orderType === 'market' && (
                  <p className="text-xs text-gray-500 mt-1">
                    Market orders execute immediately at the best available price
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Quantity</label>
                <input 
                  type="number" 
                  value={order?.qty !== 0 ? order?.qty : ""}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setOrder((prevOrder) => prevOrder
                      ? { ...prevOrder, qty: value }
                      : { type: 'bid', qty: value, price: 0, orderType: 'limit' }
                    );
                  }}
                  placeholder="Enter quantity"
                  className="w-full p-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Price (₹) {order?.orderType === 'market' && '(Auto-filled)'}
                </label>
                <input 
                  type="number" 
                  value={order?.price !== 0 ? order?.price : ""}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setOrder((prevOrder) => prevOrder
                      ? { ...prevOrder, price: value }
                      : { type: 'bid', qty: 0, price: value, orderType: 'limit' }
                    );
                  }}
                  step="0.01"
                  placeholder="Enter price"
                  disabled={order?.orderType === 'market'}
                  className={`w-full p-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 ${
                    order?.orderType === 'market' ? 'bg-gray-100 cursor-not-allowed' : ''
                  }`}
                />
                {order?.orderType === 'market' && (
                  <p className="text-xs text-blue-600 mt-1">
                    Best {order.type === 'bid' ? 'Ask' : 'Bid'}: ₹{getBestPrice(order.type) || 'N/A'}
                  </p>
                )}
              </div>

              
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">Total Value:</span>
                  <span className="font-bold text-gray-900">
                    {order && order.qty && order.price
                      ? (
                        <>
                          {"\u20B9"}
                          {(order.qty * order.price).toLocaleString()}
                        </>
                      )
                      : "₹ 0"
                    }
                  </span>
                </div>
              </div>
              
            </div>

            <div className="p-6 pt-0 flex space-x-3">
              <button 
                onClick={closeOrderModal}
                className="flex-1 py-2 px-2 cursor-pointer border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors duration-200"
              >
                Cancel
              </button>
              <button 
                onClick={handlePlaceOrder}
                disabled={
                  !order?.qty || 
                  (order?.orderType === 'limit' && !order.price) || 
                  (order?.orderType === 'market' && !getBestPrice(order.type)) ||
                  socket?.readyState !== WebSocket.OPEN
                }
                className={`flex-1 py-2 px-2 cursor-pointer rounded-lg font-semibold text-white transition-all duration-200 ${
                  order?.type === 'bid' 
                    ? 'bg-emerald-500 hover:bg-emerald-700 disabled:bg-gray-400' 
                    : 'bg-red-500 hover:bg-red-700 disabled:bg-gray-400'
                } disabled:cursor-not-allowed`}
              >
                Place {order?.type === 'bid' ? 'Buy' : 'Sell'} Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BondDetails;