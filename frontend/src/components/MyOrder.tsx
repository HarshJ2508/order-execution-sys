import { ArrowLeft, Calendar, TrendingDown, TrendingUp, Edit2, RefreshCw, AlertTriangle, Shield, Target, X } from "lucide-react";
import { useEffect, useState } from "react";

const formatDate = (date: string | number) => {
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

const formatTime = (date: string | number) => {
  return new Date(date).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit'
  });
};

interface Order {
  id: string;
  userId: string;
  type: 'bid' | 'ask';
  qty: number;
  price: number;
  orderType: 'limit' | 'market';
  stopLoss?: number;
  stopLossType?: 'stop_loss' | 'take_profit';
  stopLossTriggered?: boolean;
  stopLossTriggerPrice?: number;
  stopLossTriggerTime?: number;
  date: number;
  executed?: boolean;
  executedQty?: number;
  remainingQty?: number;
  status: 'pending' | 'executed' | 'partially_filled' | 'cancelled';
}

interface Trade {
  id: string;
  price: number;
  quantity: number;
  buyerUserId: string;
  sellerUserId: string;
  buyerOrderId: string;
  sellerOrderId: string;
  buyerStopLossTriggered?: boolean;
  sellerStopLossTriggered?: boolean;
  timestamp: number;
}

interface MyOrderProps {
  socket?: WebSocket | null;
}

const MyOrder = ({ socket }: MyOrderProps) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentMarketPrice, setCurrentMarketPrice] = useState<number | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  const getUserId = () => {
    let userId = localStorage.getItem("userID");
    if (!userId) {
      userId = "no-user";
    }
    return userId;
  };

  const fetchUserOrdersAndTrades = async () => {
    try {
      setLoading(true);
      const userId = getUserId();

      console.log("Fetching orders for user:", userId);

      if (userId === "no-user") {
        setOrders([]);
        setTrades([]);
        setError("No user ID found. Please place an order first to generate a user session.");
        setLoading(false);
        return;
      }

      const userDataRes = await fetch(`http://localhost:8000/user-orders/${userId}`);
      const userData = await userDataRes.json();
      const { orders: userOrders, trades: userTrades, currentMarketPrice } = userData;

      console.log("Received orders:", userOrders);
      console.log("Received trades:", userTrades);

      setOrders(userOrders || []);
      setTrades(userTrades || []);
      setCurrentMarketPrice(currentMarketPrice);
      setError(null);
    } catch (err) {
      console.error('Error fetching orders:', err);
      setError('Failed to fetch orders. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserOrdersAndTrades();
    const interval = setInterval(fetchUserOrdersAndTrades, 5000);
    return () => clearInterval(interval);
  }, []);

  const openEditModal = (order: Order) => {
    if (order.status === 'pending' || order.status === 'partially_filled') {
      setEditingOrder(order);
      setShowEditModal(true);
    }
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditingOrder(null);
  };

  const handleUpdateOrder = async () => {
    if (!editingOrder) return;

    // Basic validation
    if (editingOrder.qty <= 0) {
      alert("Quantity must be greater than 0");
      return;
    }

    if (editingOrder.orderType === 'limit' && editingOrder.price <= 0) {
      alert("Price must be greater than 0");
      return;
    }

    console.log('Updating order:', editingOrder);
    
    if (socket && socket.readyState === WebSocket.OPEN) {
      // Send update command with order ID
      const updateData = {
        type: "update",
        orderId: editingOrder.id,
        qty: editingOrder.qty,
        price: editingOrder.price,
        orderType: editingOrder.orderType,
        stopLoss: editingOrder.stopLoss,
        stopLossType: editingOrder.stopLossType
      };
      
      socket.send(JSON.stringify(updateData));
    } else {
      console.error('WebSocket is not connected');
      alert('Unable to update order - WebSocket not connected');
    }
    
    closeEditModal();
    // Refresh orders after a short delay
    setTimeout(() => fetchUserOrdersAndTrades(), 1000);
  };

  const cancelOrder = async (order: Order) => {
    if (!confirm(`Are you sure you want to cancel this ${order.type} order?`)) {
      return;
    }

    console.log('Cancel order:', order);
    
    if (socket && socket.readyState === WebSocket.OPEN) {
      const cancelData = {
        type: "cancel",
        orderId: order.id
      };
      
      socket.send(JSON.stringify(cancelData));
      
      // Refresh orders after a short delay
      setTimeout(() => fetchUserOrdersAndTrades(), 1000);
    } else {
      console.error('WebSocket is not connected');
      alert('Unable to cancel order - WebSocket not connected');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'executed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'partially_filled':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'cancelled':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'executed':
        return 'Executed';
      case 'partially_filled':
        return 'Partially Filled';
      case 'pending':
        return 'Pending';
      case 'cancelled':
        return 'Cancelled';
      default:
        return 'Unknown';
    }
  };

  const getStopLossStatus = (order: Order) => {
    if (!order.stopLoss || !order.stopLossType) return null;
    
    if (order.stopLossTriggered) {
      return {
        text: `${order.stopLossType === 'stop_loss' ? 'Stop-Loss' : 'Take-Profit'} Triggered`,
        color: 'bg-red-100 text-red-800 border-red-200',
        icon: AlertTriangle
      };
    }

    return {
      text: order.stopLossType === 'stop_loss' ? 'Stop-Loss Active' : 'Take-Profit Active',
      color: order.stopLossType === 'stop_loss' ? 'bg-orange-100 text-orange-800 border-orange-200' : 'bg-green-100 text-green-800 border-green-200',
      icon: order.stopLossType === 'stop_loss' ? Shield : Target
    };
  };

  const handleRefresh = () => {
    fetchUserOrdersAndTrades();
  };

  const goBack = () => {
    window.history.back();
  };

  const isUpdateDisabled = !editingOrder || 
  editingOrder.qty <= 0 || 
  (editingOrder.orderType === 'limit' && (!editingOrder.price || editingOrder.price <= 0)) ||
  (!socket || socket.readyState !== WebSocket.OPEN);


  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-gray-200">
          <button 
            onClick={goBack}
            className="flex items-center space-x-2 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all duration-200 cursor-pointer mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </button>
          <h3 className="font-semibold text-gray-900 text-lg">My Orders</h3>
          <p className="text-sm text-gray-600 mt-1">Track and manage your bond orders</p>
        </div>
        <div className="p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your orders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <button 
              onClick={goBack}
              className="flex items-center space-x-2 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all duration-200 cursor-pointer mb-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </button>
            <h3 className="font-semibold text-gray-900 text-lg">My Orders</h3>
            <p className="text-sm text-gray-600 mt-1">
              Track and manage your bond orders ({orders.length} orders, {trades.length} trades)
            </p>
            {currentMarketPrice && (
              <p className="text-sm text-blue-600 font-medium mt-1">
                Current Market Price: ₹{currentMarketPrice.toLocaleString()}
              </p>
            )}
          </div>
          <button
            onClick={handleRefresh}
            className="flex items-center space-x-2 px-3 py-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-all duration-200 cursor-pointer"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>
      
      {error && (
        <div className="p-4 mx-6 mt-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600 text-sm">{error}</p>
          <button 
            onClick={handleRefresh} 
            className="mt-2 px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600 transition-colors"
          >
            Retry
          </button>
        </div>
      )}
      
      {orders.length === 0 && !error ? (
        <div className="p-8 text-center">
          <div className="text-gray-400 mb-4">
            <Calendar className="h-12 w-12 mx-auto" />
          </div>
          <h4 className="text-lg font-medium text-gray-900 mb-2">No Orders Yet</h4>
          <p className="text-gray-600 mb-4">
            {getUserId() === "no-user" 
              ? "You haven't placed any bond orders yet. Start by placing your first order to create a trading session."
              : "You haven't placed any bond orders yet."
            }
          </p>
          <button 
            onClick={goBack}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Start Trading
          </button>
        </div>
      ) : orders.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Date & Time
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Type
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Order Type
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Quantity
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Price
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Stop-Loss / Take-Profit
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Total Value
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Status
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {orders.map((order) => {
                const stopLossStatus = getStopLossStatus(order);
                return (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors duration-150">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {formatDate(order.date)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {formatTime(order.date)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-semibold ${
                        order.type === 'bid' 
                          ? 'bg-emerald-100 text-emerald-700' 
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {order.type === 'bid' ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        <span>{order.type === 'bid' ? 'BUY' : 'SELL'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-col items-center space-y-1">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          order.orderType === 'market' 
                            ? 'bg-purple-100 text-purple-800' 
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {order.orderType === 'market' ? 'Market' : 'Limit'}
                        </span>
                        {order.stopLossTriggered && (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                            Triggered
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="text-sm font-medium text-gray-900">
                        {order.qty.toLocaleString()}
                      </div>
                      {order.executedQty && order.executedQty > 0 && (
                        <div className="text-xs text-green-600">
                          {order.executedQty.toLocaleString()} executed
                        </div>
                      )}
                      {order.remainingQty !== undefined && order.remainingQty !== order.qty && (
                        <div className="text-xs text-gray-500">
                          {order.remainingQty.toLocaleString()} remaining
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="text-sm font-medium text-gray-900">
                        ₹{order.price.toLocaleString()}
                      </div>
                      {order.stopLossTriggered && order.stopLossTriggerPrice && (
                        <div className="text-xs text-red-600">
                          Triggered at ₹{order.stopLossTriggerPrice.toLocaleString()}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {stopLossStatus ? (
                        <div className="flex flex-col items-center space-y-1">
                          <span className={`inline-flex items-center space-x-1 px-2 py-1 text-xs font-semibold rounded-full border ${stopLossStatus.color}`}>
                            <stopLossStatus.icon className="h-3 w-3" />
                            <span>{stopLossStatus.text}</span>
                          </span>
                          <div className="text-xs text-gray-600">
                            ₹{order.stopLoss?.toLocaleString()}
                          </div>
                          {order.stopLossTriggered && order.stopLossTriggerTime && (
                            <div className="text-xs text-gray-500">
                              {formatTime(order.stopLossTriggerTime)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">None</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="text-sm font-bold text-gray-900">
                        ₹{(order.qty * order.price).toLocaleString()}
                      </div>
                      {order.executedQty && order.executedQty > 0 && (
                        <div className="text-xs text-green-600">
                          ₹{(order.executedQty * order.price).toLocaleString()} executed
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${getStatusColor(order.status)}`}>
                        {getStatusText(order.status)}
                      </span>
                      {order.status === 'partially_filled' && (
                        <div className="text-xs text-gray-500 mt-1">
                          {((order.executedQty || 0) / order.qty * 100).toFixed(1)}% filled
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {order.status === 'pending' || order.status === 'partially_filled' ? (
                        <div className="flex items-center justify-center space-x-2">
                          <button
                            onClick={() => openEditModal(order)}
                            className="inline-flex items-center space-x-1 px-2 py-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors duration-200 cursor-pointer"
                          >
                            <Edit2 className="h-3 w-3" />
                            <span className="text-xs font-medium">Edit</span>
                          </button>
                          <button
                            onClick={() => cancelOrder(order)}
                            className="inline-flex items-center space-x-1 px-2 py-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors duration-200 cursor-pointer"
                          >
                            <span className="text-xs font-medium">Cancel</span>
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">No actions</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Edit Order Modal */}
      {showEditModal && editingOrder && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-96 max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Edit {editingOrder.type === 'bid' ? 'Buy' : 'Sell'} Order
              </h3>
              <button 
                onClick={closeEditModal}
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
                    onClick={() => setEditingOrder(prev => prev ? { ...prev, orderType: 'limit' } : null)}
                    className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all duration-200 ${
                      editingOrder.orderType === 'limit'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Limit
                  </button>
                  <button
                    onClick={() => setEditingOrder(prev => prev ? { ...prev, orderType: 'market' } : null)}
                    className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all duration-200 ${
                      editingOrder.orderType === 'market'
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
                  value={editingOrder.qty || ''}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    setEditingOrder(prev => prev ? { 
                      ...prev, 
                      qty: isNaN(value) || value < 1 ? 1 : value 
                    } : null);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter quantity"
                />
              </div>

              {/* Price Input (only for limit orders) */}
              {editingOrder.orderType === 'limit' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Price (₹)</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={editingOrder.price || ''}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      setEditingOrder(prev => prev ? { 
                        ...prev, 
                        price: isNaN(value) || value <= 0 ? 0.01 : value 
                      } : null);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter price"
                  />
                </div>
              )}

              {/* Stop Loss Section */}
              <div>
                <div className="flex items-center space-x-2 mb-2">
                  <input
                    type="checkbox"
                    id="enable-stop-loss-edit"
                    checked={!!editingOrder.stopLoss && !!editingOrder.stopLossType}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setEditingOrder(prev => prev ? { 
                          ...prev, 
                          stopLoss: prev.stopLoss || 0,
                          stopLossType: prev.stopLossType || 'stop_loss'
                        } : null);
                      } else {
                        setEditingOrder(prev => prev ? { 
                          ...prev, 
                          stopLoss: undefined,
                          stopLossType: undefined
                        } : null);
                      }
                    }}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="enable-stop-loss-edit" className="text-sm font-semibold text-gray-700">
                    Enable Stop-Loss / Take-Profit
                  </label>
                </div>

                {editingOrder.stopLoss && editingOrder.stopLossType && (
                  <div className="space-y-3 mt-3 p-3 bg-gray-50 rounded-lg">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => setEditingOrder(prev => prev ? { ...prev, stopLossType: 'stop_loss' } : null)}
                          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                            editingOrder.stopLossType === 'stop_loss'
                              ? 'bg-red-500 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          Stop-Loss
                        </button>
                        <button
                          onClick={() => setEditingOrder(prev => prev ? { ...prev, stopLossType: 'take_profit' } : null)}
                          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                            editingOrder.stopLossType === 'take_profit'
                              ? 'bg-green-500 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          Take-Profit
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {editingOrder.stopLossType === 'stop_loss' ? 'Stop-Loss' : 'Take-Profit'} Price (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={editingOrder.stopLoss}
                        onChange={(e) => setEditingOrder(prev => prev ? { ...prev, stopLoss: parseFloat(e.target.value) || 0 } : null)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder={`Enter ${editingOrder.stopLossType === 'stop_loss' ? 'stop-loss' : 'take-profit'} price`}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Order Summary */}
              <div className="bg-gray-50 rounded-lg p-3">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Updated Order Summary</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Type:</span>
                    <span className="font-medium">{editingOrder.type === 'bid' ? 'Buy' : 'Sell'} ({editingOrder.orderType})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Quantity:</span>
                    <span className="font-medium">{editingOrder.qty}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Price:</span>
                    <span className="font-medium">₹{editingOrder.price}</span>
                  </div>
                  <div className="flex justify-between font-semibold border-t border-gray-300 pt-1">
                    <span className="text-gray-700">Total Value:</span>
                    <span className="text-gray-900">₹{(editingOrder.qty * editingOrder.price).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-3">
                <button
                  onClick={closeEditModal}
                  className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateOrder}
                  disabled={isUpdateDisabled}
                  className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors duration-200 text-white ${
                    editingOrder.type === 'bid' 
                      ? 'bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-400' 
                      : 'bg-red-500 hover:bg-red-600 disabled:bg-gray-400'
                  } disabled:cursor-not-allowed`}
                >
                  {(!socket || socket.readyState !== WebSocket.OPEN) ? 'WebSocket Disconnected' : 'Update Order'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyOrder;