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
  const [order, setOrder] = useState<{ type: 'bid' | 'ask', qty: number, price: number }>();
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

  const openOrderModal = (type: 'bid' | 'ask') => {
    setOrder({ type, qty: 0, price: 0 });
    setShowOrderModal(true);
  };

  const closeOrderModal = () => {
    setShowOrderModal(false);
    setOrder(undefined);
  };

  const handlePlaceOrder = async () => {
    console.log('Order placed:', order);
    socket?.send(JSON.stringify({
      type: order?.type,
      qty: order?.qty,
      price: order?.price
    }))
    closeOrderModal();
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
                <Link to={'/orders'}>Check your order</Link>
              </div>
            </div>
          </div>

          {/* Right Panel - Order Book with Trading Buttons */}
          <div className="col-span-9">
            <div className="bg-white rounded-lg border border-gray-200 h-full flex flex-col">
              <div className="bg-gradient-to-r from-gray-50 to-slate-50 px-4 py-3 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">Market Depth</h3>
                 
                </div>
              </div>

              
                <div className="flex-1 p-4 overflow-hidden">
                  <div className="grid grid-cols-2 gap-6 h-full">
                    {/* Bids */}
                    <div className="flex flex-col">
                      <div className="flex items-center space-x-2 mb-3">
                        <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
                        <h4 className="font-semibold text-emerald-600">Bids</h4>
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <div className="grid grid-cols-3 gap-3 text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2 border-b border-gray-200">
                          <span>Price</span>
                          <span className="text-center">Quantity</span>
                          <span className="text-center">Orders</span>
                        </div>
                        
                        <div className="mt-2 space-y-1">
                          {orderBook?.bids.map((bid, index) => (
                            <div 
                              key={index} 
                              className="grid grid-cols-3 gap-3 pb-3 border-b border-gray-200 py-2 hover:bg-green-50 rounded transition-colors duration-150 cursor-pointer"
                              onClick={() => openOrderModal('ask')}
                            >
                              <span className="font-bold text-emerald-600 text-sm tracking-wide">{bid.price !== 0 ? `₹ ${bid.price}` : '-'}</span>
                              <span className="text-center font-medium text-gray-900 text-sm"> {bid.qty} </span>
                              <span className="text-center text-gray-600 text-sm">{bid.orders ?? 1}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <button 
                        onClick={() => openOrderModal('bid')}
                        className="px-4 py-3 text-white bg-emerald-500 cursor-pointer rounded-lg font-medium transition-colors duration-200 text-sm"
                      >
                        BUY
                      </button>
                    </div>
                    {/* Asks */}
                    <div className="flex flex-col">
                      <div className="flex items-center space-x-2 mb-3">
                        <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                        <h4 className="font-semibold text-red-500">Asks</h4>
                      </div>
                      
                      <div className="flex-1 overflow-hidden">
                        <div className="grid grid-cols-3 gap-3 text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2 border-b border-gray-200">
                          <span>Price</span>
                          <span className="text-center">Quantity</span>
                          <span className="text-center">Orders</span>
                        </div>
                        
                        <div className="mt-2 space-y-1">
                          {orderBook?.asks.map((ask, index) => (
                            <div 
                              key={index} 
                              className="grid grid-cols-3 gap-3 py-2 pb-3 border-b border-gray-200 hover:bg-red-50 rounded transition-colors duration-150 cursor-pointer"
                              onClick={() => openOrderModal('bid')}
                            >
                              <span className="font-bold text-red-500 text-sm tracking-wide">{ask.price !== 0 ? `₹ ${ask.price}` : '-'}</span>
                              <span className="text-center font-medium text-gray-900 text-sm">{ask.qty}</span>
                              <span className="text-center text-gray-600 text-sm">{ask.orders ?? 1}</span>
                            </div>
                          ))}
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
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Quantity</label>
                <input 
                  type="number" 
                  value={order?.qty !== 0 ? order?.qty : ""}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setOrder((prevOrder) => prevOrder
                      ? { ...prevOrder, qty: value }
                      : { type: order?.type ? 'bid' : 'ask', qty: value, price: 0 }
                    );
                  }}
                  placeholder="Enter quantity"
                  className="w-full p-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Price (₹)</label>
                <input 
                  type="number" 
                  value={order?.price !== 0 ? order?.price : ""}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setOrder((prevOrder) => prevOrder
                      ? { ...prevOrder, price: value }
                      : { type: order?.type ? 'bid' : 'ask', qty: 0, price: value }
                    );
                  }}
                  step="0.01"
                  className="w-full p-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                />
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
                      : 0
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
                disabled={!order?.qty || !order.price}
                className={`flex-1 py-2 px-2 cursor-pointer rounded-lg font-semibold text-white transition-all duration-200 ${
                  order?.type === 'bid' 
                    ? 'bg-emerald-500 hover:bg-green-700 disabled:bg-gray-400' 
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