import axios from "axios";
import { ArrowLeft, Calendar, TrendingDown, TrendingUp, Edit2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

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
  timestamp: number;
}

const MyOrder = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get user ID from localStorage or generate one
  const getUserId = () => {
    let userId = localStorage.getItem("userID");
    if (!userId) {
      // If no userId exists, we won't have any orders to show
      userId = "no-user";
    }
    return userId;
  };

  const fetchUserOrdersAndTrades = async () => {
    try {
      setLoading(true);
      const userId = getUserId();

      console.log("Fetching orders for user:", userId); // Debug log

      if (userId === "no-user") {
        setOrders([]);
        setTrades([]);
        setError("No user ID found. Please place an order first to generate a user session.");
        setLoading(false);
        return;
      }

      // Use the endpoint that properly processes user orders and trades
      const userDataRes = await axios.get(`http://localhost:8000/user-orders/${userId}`);
      const { orders: userOrders, trades: userTrades } = userDataRes.data;

      console.log("Received orders:", userOrders); // Debug log
      console.log("Received trades:", userTrades); // Debug log

      setOrders(userOrders || []);
      setTrades(userTrades || []);
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

    // Set up polling to refresh data every 5 seconds
    const interval = setInterval(fetchUserOrdersAndTrades, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const openEditModal = (order: Order) => {
    // TODO: Implement edit functionality
    console.log('Edit order:', order);
  };

  const cancelOrder = async (order: Order) => {
    // TODO: Implement cancel functionality via WebSocket
    console.log('Cancel order:', order);
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

  const handleRefresh = () => {
    fetchUserOrdersAndTrades();
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-gray-200">
          <button 
            onClick={() => navigate(-1)}
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
              onClick={() => navigate(-1)}
              className="flex items-center space-x-2 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all duration-200 cursor-pointer mb-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </button>
            <h3 className="font-semibold text-gray-900 text-lg">My Orders</h3>
            <p className="text-sm text-gray-600 mt-1">
              Track and manage your bond orders ({orders.length} orders, {trades.length} trades)
            </p>
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
            onClick={() => navigate(-1)}
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
              {orders.map((order) => (
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
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      order.orderType === 'market' 
                        ? 'bg-purple-100 text-purple-800' 
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {order.orderType === 'market' ? 'Market' : 'Limit'}
                    </span>
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
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
};

export default MyOrder;