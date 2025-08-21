import express from "express";
import { WebSocketServer } from "ws";
import { randomUUID } from "crypto";
import cors from 'cors';

const wss = new WebSocketServer({ port: 8080 });
const app = express();
app.use(express.json());
app.use(cors());

const bids = [];
const asks = [];
const trades = []; // Store executed trades

// Helper function to broadcast order book updates to all clients
const broadcastOrderBook = (message = "Order book updated") => {
  const data = JSON.stringify({
    message,
    bids,
    asks,
    timestamp: Date.now(),
  });

  wss.clients.forEach(client => {
    if (client.readyState === client.OPEN) {
      client.send(data);
    }
  });
};

// Function to check for trade matches and execute them
const tryExecuteTrades = () => {
  // Sort orders to ensure best prices are at the front
  bids.sort((a, b) => b.price - a.price); // highest bids first
  asks.sort((a, b) => a.price - b.price); // lowest asks first

  let tradesExecuted = false;

  while (bids.length > 0 && asks.length > 0) {
    const bestBid = bids[0];
    const bestAsk = asks[0];

    // Check if trade can be executed (bid price >= ask price)
    if (bestBid.price >= bestAsk.price) {
      // Execute trade at the ask price (seller's price)
      const executionPrice = bestAsk.price;
      const executionQty = Math.min(bestBid.qty, bestAsk.qty);

      // Create trade record
      const trade = {
        id: randomUUID(),
        price: executionPrice,
        quantity: executionQty,
        buyerUserId: bestBid.userId,
        sellerUserId: bestAsk.userId,
        buyerOrderId: bestBid.id,
        sellerOrderId: bestAsk.id,
        timestamp: Date.now()
      };

      trades.push(trade);

      // Update order quantities and status
      bestBid.qty -= executionQty;
      bestAsk.qty -= executionQty;

      // Update order status based on remaining quantity
      if (bestBid.qty <= 0) {
        bestBid.status = 'executed';
        bids.shift();
      } else {
        bestBid.status = 'partially_filled';
      }

      if (bestAsk.qty <= 0) {
        bestAsk.status = 'executed';
        asks.shift();
      } else {
        bestAsk.status = 'partially_filled';
      }

      tradesExecuted = true;

      // Broadcast trade execution to all clients
      const tradeMessage = JSON.stringify({
        message: `Trade executed at ₹${executionPrice} for quantity ${executionQty}`,
        trade: trade,
        bids,
        asks,
        currentPrice: executionPrice,
        timestamp: Date.now(),
      });

      wss.clients.forEach(client => {
        if (client.readyState === client.OPEN) {
          client.send(tradeMessage);
        }
      });

      console.log(`Trade executed: ${executionQty} units at ₹${executionPrice}`);
    } else {
      // No more trades possible
      break;
    }
  }

  // If trades were executed, broadcast updated order book
  if (tradesExecuted) {
    broadcastOrderBook("Trades executed - order book updated");
  }
};

wss.on("connection", (ws) => {  
  ws.id = randomUUID();
  
  // Send initial connection confirmation and current order book
  ws.send(JSON.stringify({
    message: "Connected to WebSocket",
    id: ws.id,
    bids,
    asks,
    timestamp: Date.now(),
  }));

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);
    let order = {};

    if (data.type === "bid" || data.type === "ask") {
      order = {
        id: randomUUID(),
        userId: ws.id,
        type: data.type,
        qty: data.qty,
        price: data.price,
        orderType: data.orderType || 'limit', // default to limit if not specified
        stopLoss: data.stopLoss,
        date: Date.now(),
        status: 'pending', // Set default status
        executed: false,
        executedQty: 0,
        remainingQty: data.qty
      };

      // For market orders, set price to best available
      if (data.orderType === 'market') {
        if (data.type === 'bid' && asks.length > 0) {
          // For market buy order, use best ask price
          asks.sort((a, b) => a.price - b.price);
          order.price = asks[0].price;
        } else if (data.type === 'ask' && bids.length > 0) {
          // For market sell order, use best bid price
          bids.sort((a, b) => b.price - a.price);
          order.price = bids[0].price;
        } else {
          // No counterpart available for market order
          ws.send(JSON.stringify({
            error: `No ${data.type === 'bid' ? 'asks' : 'bids'} available for market order`,
            timestamp: Date.now(),
          }));
          return;
        }
      }
    }

    if (data.type === "bid") {
      // Check if user already has a bid order and replace it
      const investorIndex = bids.findIndex(bid => bid.userId === ws.id);
      if (investorIndex !== -1) {
        // Update existing order but preserve original ID and timestamp
        bids[investorIndex] = {
          ...bids[investorIndex],
          qty: data.qty,
          price: order.price,
          orderType: order.orderType,
          remainingQty: data.qty,
          status: 'pending' // Reset status when order is updated
        };
        order = bids[investorIndex]; // Use the updated order for response
      } else {
        bids.push(order);
      }

      bids.sort((a, b) => b.price - a.price); // highest first
      
      // Send confirmation to the user who placed the order
      ws.send(JSON.stringify({
        message: `${order.orderType === 'market' ? 'Market' : 'Limit'} bid order placed successfully`,
        orderId: order.id,
        orderType: order.orderType,
        status: order.status,
        bids,
        asks,
        timestamp: Date.now(),
      }));
      
      // Broadcast updated order book to all clients
      broadcastOrderBook(`New ${order.orderType} bid order placed at ₹${order.price}`);
      
      // Try to execute trades after adding bid
      tryExecuteTrades();
      
    } else if (data.type === "ask") {
      // Check if user already has an ask order and replace it
      const investorIndex = asks.findIndex(ask => ask.userId === ws.id);
      if (investorIndex !== -1) {
        // Update existing order but preserve original ID and timestamp
        asks[investorIndex] = {
          ...asks[investorIndex],
          qty: data.qty,
          price: order.price,
          orderType: order.orderType,
          remainingQty: data.qty,
          status: 'pending' // Reset status when order is updated
        };
        order = asks[investorIndex]; // Use the updated order for response
      } else {
        asks.push(order);
      }

      asks.sort((a, b) => a.price - b.price); // lowest first
      
      // Send confirmation to the user who placed the order
      ws.send(JSON.stringify({
        message: `${order.orderType === 'market' ? 'Market' : 'Limit'} ask order placed successfully`,
        orderId: order.id,
        orderType: order.orderType,
        status: order.status,
        bids,
        asks,
        timestamp: Date.now(),
      }));
      
      // Broadcast updated order book to all clients
      broadcastOrderBook(`New ${order.orderType} ask order placed at ₹${order.price}`);
      
      // Try to execute trades after adding ask
      tryExecuteTrades();
      
    } else if (data.type === "exe") {
      // Manual trade execution (keeping for backward compatibility)
      const { buyerOrderId, sellerOrderId } = data; 
      const buyerOrder = bids.find(bid => bid.id === buyerOrderId);
      const sellerOrder = asks.find(ask => ask.id === sellerOrderId);

      if (!buyerOrder || !sellerOrder) {
        ws.send(JSON.stringify({ error: "Invalid buyer/seller order" }));
        return;
      }

      if (buyerOrder.price >= sellerOrder.price) { 
        const executionPrice = sellerOrder.price; 
        const executionQty = Math.min(buyerOrder.qty, sellerOrder.qty);

        const trade = {
          id: randomUUID(),
          price: executionPrice,
          quantity: executionQty,
          buyerUserId: buyerOrder.userId,
          sellerUserId: sellerOrder.userId,
          buyerOrderId: buyerOrderId,
          sellerOrderId: sellerOrderId,
          timestamp: Date.now()
        };

        trades.push(trade);

        buyerOrder.qty -= executionQty;
        sellerOrder.qty -= executionQty;
        buyerOrder.executedQty = (buyerOrder.executedQty || 0) + executionQty;
        sellerOrder.executedQty = (sellerOrder.executedQty || 0) + executionQty;
        buyerOrder.remainingQty = buyerOrder.qty;
        sellerOrder.remainingQty = sellerOrder.qty;

        if (buyerOrder.qty <= 0) {
          buyerOrder.status = 'executed';
          bids.splice(bids.findIndex(bid => bid.id === buyerOrderId), 1);
        } else {
          buyerOrder.status = 'partially_filled';
        }
        
        if (sellerOrder.qty <= 0) {
          sellerOrder.status = 'executed';
          asks.splice(asks.findIndex(ask => ask.id === sellerOrderId), 1);
        } else {
          sellerOrder.status = 'partially_filled';
        }

        const tradeMessage = JSON.stringify({
          message: `Manual trade executed at ₹${executionPrice} for quantity ${executionQty}`,
          trade: trade,
          bids,
          asks,
          currentPrice: executionPrice,
          timestamp: Date.now(),
        });

        // Broadcast trade execution to all clients
        wss.clients.forEach(client => {
          if (client.readyState === client.OPEN) {
            client.send(tradeMessage);
          }
        });
      } else {
        ws.send(JSON.stringify({ error: "Bid price is lower than ask price" }));
      }

    } else if (data.type === "cancel") {
      const { orderId } = data;
      
      // Try to find and remove from bids
      const bidIndex = bids.findIndex(bid => bid.id === orderId && bid.userId === ws.id);
      if (bidIndex !== -1) {
        const cancelledOrder = bids[bidIndex];
        cancelledOrder.status = 'cancelled';
        bids.splice(bidIndex, 1);
        
        ws.send(JSON.stringify({
          message: `Bid order ${orderId} cancelled successfully`,
          bids,
          asks,
          timestamp: Date.now(),
        }));
        
        // Broadcast cancellation to all clients
        broadcastOrderBook(`Bid order cancelled at ₹${cancelledOrder.price}`);
        return;
      }

      // Try to find and remove from asks
      const askIndex = asks.findIndex(ask => ask.id === orderId && ask.userId === ws.id);
      if (askIndex !== -1) {
        const cancelledOrder = asks[askIndex];
        cancelledOrder.status = 'cancelled';
        asks.splice(askIndex, 1);
        
        ws.send(JSON.stringify({
          message: `Ask order ${orderId} cancelled successfully`,
          bids,
          asks,
          timestamp: Date.now(),
        }));
        
        // Broadcast cancellation to all clients
        broadcastOrderBook(`Ask order cancelled at ₹${cancelledOrder.price}`);
        return;
      }

      ws.send(JSON.stringify({ error: "Order not found or you don't have permission to cancel it" }));

    } else if (data.type === "getOrders") {
      // Get all orders for the current user
      const userBids = bids.filter(bid => bid.userId === ws.id);
      const userAsks = asks.filter(ask => ask.userId === ws.id);
      
      ws.send(JSON.stringify({
        message: "Your active orders",
        userBids,
        userAsks,
        bids, // Include full order book
        asks, // Include full order book
        timestamp: Date.now(),
      }));

    } else if (data.type === "getTrades") {
      // Get trade history
      const userTrades = trades.filter(trade => 
        trade.buyerUserId === ws.id || trade.sellerUserId === ws.id
      );
      
      ws.send(JSON.stringify({
        message: "Trade history",
        userTrades,
        allTrades: trades.slice(-50), // Last 50 trades for market data
        timestamp: Date.now(),
      }));
    }
  });

  // Clean up orders when user disconnects
  ws.on("close", () => {
    let ordersRemoved = false;
    
    // Remove all orders from disconnected user
    for (let i = bids.length - 1; i >= 0; i--) {
      if (bids[i].userId === ws.id) {
        bids.splice(i, 1);
        ordersRemoved = true;
      }
    }
    for (let i = asks.length - 1; i >= 0; i--) {
      if (asks[i].userId === ws.id) {
        asks.splice(i, 1);
        ordersRemoved = true;
      }
    }
    
    // Broadcast updated order book if any orders were removed
    if (ordersRemoved) {
      broadcastOrderBook("User disconnected - orders removed");
    }
  });

  // Handle connection errors
  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});

app.get('/health', (req, res) => {
  res.send("Server is up!");
});

app.get('/order/:id', (req, res) => {
  const userId = req.params.id;
  const order = bids.find(bid => bid.userId === userId) || asks.find(ask => ask.userId === userId);

  if (order) {
    res.json(order);
  } else {
    res.status(404).json({ error: "Order not found" });
  }
});

// New endpoint to get all orders for a specific user
app.get('/user-orders/:userId', (req, res) => {
  const userId = req.params.userId;
  
  // Get user's orders from both active bids and asks
  const userBids = bids.filter(bid => bid.userId === userId);
  const userAsks = asks.filter(ask => ask.userId === userId);
  
  // Get user's trade history
  const userTrades = trades.filter(trade => 
    trade.buyerUserId === userId || trade.sellerUserId === userId
  );
  
  // Get historical orders (orders that were executed or cancelled but removed from active arrays)
  // We'll reconstruct them from trades
  const historicalOrdersFromTrades = [];
  
  // Create a map to track all order IDs that have had trades
  const orderTradeMap = new Map();
  
  userTrades.forEach(trade => {
    // Track buyer orders
    if (trade.buyerUserId === userId) {
      if (!orderTradeMap.has(trade.buyerOrderId)) {
        orderTradeMap.set(trade.buyerOrderId, {
          orderId: trade.buyerOrderId,
          userId: userId,
          type: 'bid',
          trades: [],
          totalExecutedQty: 0
        });
      }
      orderTradeMap.get(trade.buyerOrderId).trades.push(trade);
      orderTradeMap.get(trade.buyerOrderId).totalExecutedQty += trade.quantity;
    }
    
    // Track seller orders
    if (trade.sellerUserId === userId) {
      if (!orderTradeMap.has(trade.sellerOrderId)) {
        orderTradeMap.set(trade.sellerOrderId, {
          orderId: trade.sellerOrderId,
          userId: userId,
          type: 'ask',
          trades: [],
          totalExecutedQty: 0
        });
      }
      orderTradeMap.get(trade.sellerOrderId).trades.push(trade);
      orderTradeMap.get(trade.sellerOrderId).totalExecutedQty += trade.quantity;
    }
  });
  
  // Process orders to determine status based on trades
  const processOrders = (orders) => {
    return orders.map(order => {
      const relatedTrades = userTrades.filter(trade => 
        trade.buyerOrderId === order.id || trade.sellerOrderId === order.id
      );
      
      if (relatedTrades.length > 0) {
        const totalExecutedQty = relatedTrades.reduce((sum, trade) => sum + trade.quantity, 0);
        const remainingQty = order.qty - totalExecutedQty;
        
        return {
          ...order,
          executed: remainingQty <= 0,
          executedQty: totalExecutedQty,
          remainingQty: Math.max(0, remainingQty),
          status: remainingQty <= 0 ? 'executed' : 
                  totalExecutedQty > 0 ? 'partially_filled' : (order.status || 'pending')
        };
      }
      
      return {
        ...order,
        executed: false,
        executedQty: order.executedQty || 0,
        remainingQty: order.remainingQty || order.qty,
        status: order.status || 'pending'
      };
    });
  };

  // Create historical orders for trades that don't have corresponding active orders
  orderTradeMap.forEach((orderInfo, orderId) => {
    const existsInActive = [...userBids, ...userAsks].some(order => order.id === orderId);
    
    if (!existsInActive && orderInfo.trades.length > 0) {
      const firstTrade = orderInfo.trades[0];
      const avgPrice = orderInfo.trades.reduce((sum, trade) => sum + (trade.price * trade.quantity), 0) / orderInfo.totalExecutedQty;
      
      historicalOrdersFromTrades.push({
        id: orderId,
        userId: userId,
        type: orderInfo.type,
        qty: orderInfo.totalExecutedQty, // We can only infer this was the minimum qty
        price: avgPrice,
        orderType: 'limit', // Default assumption
        date: firstTrade.timestamp,
        status: 'executed',
        executed: true,
        executedQty: orderInfo.totalExecutedQty,
        remainingQty: 0
      });
    }
  });

  const processedBids = processOrders(userBids);
  const processedAsks = processOrders(userAsks);
  const allOrders = [...processedBids, ...processedAsks, ...historicalOrdersFromTrades];
  
  // Sort orders by date (newest first)
  allOrders.sort((a, b) => b.date - a.date);
  
  res.json({
    orders: allOrders,
    bids: processedBids,
    asks: processedAsks,
    trades: userTrades,
    totalOrders: allOrders.length,
    totalTrades: userTrades.length,
    timestamp: Date.now()
  });
});

app.get('/order-book', (req, res) => {
  res.json({
    bids: bids.sort((a, b) => b.price - a.price),
    asks: asks.sort((a, b) => a.price - b.price),
    timestamp: Date.now()
  });
});

// Get trade history
app.get('/trades', (req, res) => {
  res.json({
    trades: trades.slice(-100), // Last 100 trades
    totalTrades: trades.length,
    timestamp: Date.now()
  });
});

// Get market statistics
app.get('/market-stats', (req, res) => {
  const lastTrade = trades[trades.length - 1];
  const volume24h = trades
    .filter(trade => Date.now() - trade.timestamp < 24 * 60 * 60 * 1000)
    .reduce((sum, trade) => sum + trade.quantity, 0);

  res.json({
    lastPrice: lastTrade ? lastTrade.price : null,
    bestBid: bids.length > 0 ? Math.max(...bids.map(b => b.price)) : null,
    bestAsk: asks.length > 0 ? Math.min(...asks.map(a => a.price)) : null,
    volume24h: volume24h,
    totalTrades: trades.length,
    activeBids: bids.length,
    activeAsks: asks.length,
    timestamp: Date.now()
  });
});

// New endpoint to get WebSocket connection info
app.get('/ws-info', (req, res) => {
  res.json({
    connectedClients: wss.clients.size,
    totalBids: bids.length,
    totalAsks: asks.length,
    totalTrades: trades.length,
    timestamp: Date.now()
  });
});

// Force trade execution (for testing)
app.post('/force-match', (req, res) => {
  const tradesBeforeCount = trades.length;
  tryExecuteTrades();
  const tradesAfterCount = trades.length;
  
  res.json({
    message: "Trade matching attempted",
    newTrades: tradesAfterCount - tradesBeforeCount,
    bids: bids.length,
    asks: asks.length,
    timestamp: Date.now()
  });
});

app.listen('8000', () => {
  console.log('Server activated on port 8000');
  console.log('WebSocket server running on port 8080');
  console.log('Available endpoints:');
  console.log('  GET  /health - Server status');
  console.log('  GET  /order-book - Current order book');
  console.log('  GET  /trades - Trade history');
  console.log('  GET  /market-stats - Market statistics');
  console.log('  GET  /ws-info - WebSocket info');
  console.log('  POST /force-match - Force trade matching');
});