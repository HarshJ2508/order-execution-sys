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
const positions = []; // Track user positions with stop-loss
let currentMarketPrice = null; // Track the last traded price

// Helper function to broadcast order book updates to all clients
const broadcastOrderBook = (message = "Order book updated") => {
  const data = JSON.stringify({
    message,
    bids,
    asks,
    currentMarketPrice,
    timestamp: Date.now(),
  });

  wss.clients.forEach(client => {
    if (client.readyState === client.OPEN) {
      client.send(data);
    }
  });
};

// Function to update or create user positions after trade execution
const updateUserPosition = (userId, type, quantity, price, stopLoss, stopLossType) => {
  if (!stopLoss || !stopLossType) return; // No stop-loss to track

  // Find existing position for this user
  let position = positions.find(pos => pos.userId === userId);
  
  if (!position) {
    // Create new position
    position = {
      id: randomUUID(),
      userId: userId,
      netQuantity: 0,
      avgPrice: 0,
      stopLoss: stopLoss,
      stopLossType: stopLossType,
      createdAt: Date.now(),
      lastUpdated: Date.now()
    };
    positions.push(position);
  }

  // Update position based on trade
  if (type === 'bid') {
    // Buying - increase position
    const totalValue = (position.netQuantity * position.avgPrice) + (quantity * price);
    position.netQuantity += quantity;
    position.avgPrice = totalValue / position.netQuantity;
  } else {
    // Selling - decrease position
    position.netQuantity -= quantity;
    if (position.netQuantity <= 0) {
      // Position closed or reversed
      if (position.netQuantity === 0) {
        // Position fully closed - remove from tracking
        const index = positions.indexOf(position);
        positions.splice(index, 1);
        return;
      } else {
        // Position reversed to short
        position.avgPrice = price; // Reset avg price for new short position
        position.netQuantity = Math.abs(position.netQuantity);
      }
    }
  }

  // Update stop-loss if provided
  if (stopLoss && stopLossType) {
    position.stopLoss = stopLoss;
    position.stopLossType = stopLossType;
  }
  
  position.lastUpdated = Date.now();
};

// Function to check and trigger stop-loss orders based on positions
const checkStopLossOrders = (newMarketPrice) => {
  let stopLossTriggered = false;
  const triggeredOrders = [];

  // Check active orders in bids and asks arrays (existing logic)
  for (let i = bids.length - 1; i >= 0; i--) {
    const order = bids[i];
    if (order.stopLoss && order.stopLossType) {
      let shouldTrigger = false;
      
      if (order.stopLossType === 'stop_loss' && newMarketPrice <= order.stopLoss) {
        shouldTrigger = true;
      } else if (order.stopLossType === 'take_profit' && newMarketPrice >= order.stopLoss) {
        shouldTrigger = true;
      }

      if (shouldTrigger) {
        order.orderType = 'market';
        order.originalOrderType = 'limit';
        order.price = newMarketPrice;
        order.stopLossTriggered = true;
        order.stopLossTriggerPrice = newMarketPrice;
        order.stopLossTriggerTime = Date.now();
        
        triggeredOrders.push({
          ...order,
          originalType: 'bid',
          triggerReason: order.stopLossType === 'stop_loss' ? 'Stop-Loss Triggered' : 'Take-Profit Triggered'
        });
        
        stopLossTriggered = true;
      }
    }
  }

  for (let i = asks.length - 1; i >= 0; i--) {
    const order = asks[i];
    if (order.stopLoss && order.stopLossType) {
      let shouldTrigger = false;
      
      if (order.stopLossType === 'stop_loss' && newMarketPrice <= order.stopLoss) {
        shouldTrigger = true;
      } else if (order.stopLossType === 'take_profit' && newMarketPrice >= order.stopLoss) {
        shouldTrigger = true;
      }

      if (shouldTrigger) {
        order.orderType = 'market';
        order.originalOrderType = 'limit';
        order.price = newMarketPrice;
        order.stopLossTriggered = true;
        order.stopLossTriggerPrice = newMarketPrice;
        order.stopLossTriggerTime = Date.now();
        
        triggeredOrders.push({
          ...order,
          originalType: 'ask',
          triggerReason: order.stopLossType === 'stop_loss' ? 'Stop-Loss Triggered' : 'Take-Profit Triggered'
        });
        
        stopLossTriggered = true;
      }
    }
  }

  // NEW: Check positions for stop-loss triggers
  for (let i = positions.length - 1; i >= 0; i--) {
    const position = positions[i];
    let shouldTrigger = false;

    if (position.netQuantity > 0) {
      // Long position
      if (position.stopLossType === 'stop_loss' && newMarketPrice <= position.stopLoss) {
        shouldTrigger = true;
      } else if (position.stopLossType === 'take_profit' && newMarketPrice >= position.stopLoss) {
        shouldTrigger = true;
      }
    } else if (position.netQuantity < 0) {
      // Short position (reversed logic)
      if (position.stopLossType === 'stop_loss' && newMarketPrice >= position.stopLoss) {
        shouldTrigger = true;
      } else if (position.stopLossType === 'take_profit' && newMarketPrice <= position.stopLoss) {
        shouldTrigger = true;
      }
    }

    if (shouldTrigger) {
      // Create a market order to close the position
      const newOrder = {
        id: randomUUID(),
        userId: position.userId,
        type: position.netQuantity > 0 ? 'ask' : 'bid', // Opposite of current position
        qty: Math.abs(position.netQuantity),
        price: newMarketPrice,
        orderType: 'market',
        stopLoss: null,
        stopLossType: null,
        stopLossTriggered: true,
        stopLossTriggerPrice: newMarketPrice,
        stopLossTriggerTime: Date.now(),
        date: Date.now(),
        status: 'pending',
        executed: false,
        executedQty: 0,
        remainingQty: Math.abs(position.netQuantity),
        positionTriggered: true, // Mark as position-triggered
        originalPositionId: position.id
      };

      // Add to appropriate order book
      if (newOrder.type === 'ask') {
        asks.push(newOrder);
        asks.sort((a, b) => a.price - b.price);
      } else {
        bids.push(newOrder);
        bids.sort((a, b) => b.price - a.price);
      }

      triggeredOrders.push({
        ...newOrder,
        originalType: newOrder.type,
        triggerReason: position.stopLossType === 'stop_loss' ? 'Position Stop-Loss Triggered' : 'Position Take-Profit Triggered',
        positionSize: position.netQuantity,
        avgEntryPrice: position.avgPrice
      });

      // Remove the position since it's being closed
      positions.splice(i, 1);
      stopLossTriggered = true;
    }
  }

  // Broadcast stop-loss triggers to all clients
  if (triggeredOrders.length > 0) {
    const stopLossMessage = JSON.stringify({
      message: "Stop-loss orders triggered",
      triggeredOrders,
      currentMarketPrice: newMarketPrice,
      timestamp: Date.now(),
    });

    wss.clients.forEach(client => {
      if (client.readyState === client.OPEN) {
        client.send(stopLossMessage);
      }
    });
  }

  return stopLossTriggered;
};

// Function to check for trade matches and execute them
const tryExecuteTrades = () => {
  bids.sort((a, b) => b.price - a.price);
  asks.sort((a, b) => a.price - b.price);

  let tradesExecuted = false;

  while (bids.length > 0 && asks.length > 0) {
    const bestBid = bids[0];
    const bestAsk = asks[0];

    if (bestBid.price >= bestAsk.price) {
      const executionPrice = bestAsk.price;
      const executionQty = Math.min(bestBid.qty, bestAsk.qty);

      const trade = {
        id: randomUUID(),
        price: executionPrice,
        quantity: executionQty,
        buyerUserId: bestBid.userId,
        sellerUserId: bestAsk.userId,
        buyerOrderId: bestBid.id,
        sellerOrderId: bestAsk.id,
        buyerStopLossTriggered: bestBid.stopLossTriggered || false,
        sellerStopLossTriggered: bestAsk.stopLossTriggered || false,
        timestamp: Date.now()
      };

      trades.push(trade);
      currentMarketPrice = executionPrice;

      // Update positions for stop-loss tracking
      updateUserPosition(bestBid.userId, 'bid', executionQty, executionPrice, bestBid.stopLoss, bestBid.stopLossType);
      updateUserPosition(bestAsk.userId, 'ask', executionQty, executionPrice, bestAsk.stopLoss, bestAsk.stopLossType);

      bestBid.qty -= executionQty;
      bestAsk.qty -= executionQty;

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

      const stopLossTriggered = checkStopLossOrders(executionPrice);

      const tradeMessage = JSON.stringify({
        message: `Trade executed at ₹${executionPrice} for quantity ${executionQty}`,
        trade: trade,
        bids,
        asks,
        currentPrice: executionPrice,
        stopLossTriggered,
        timestamp: Date.now(),
      });

      wss.clients.forEach(client => {
        if (client.readyState === client.OPEN) {
          client.send(tradeMessage);
        }
      });

      console.log(`Trade executed: ${executionQty} units at ₹${executionPrice}`);
      
      if (stopLossTriggered) {
        // Immediately try to execute trades again without delay
        setImmediate(() => tryExecuteTrades());
      }
    } else {
      break;
    }
  }

  if (tradesExecuted) {
    broadcastOrderBook("Trades executed - order book updated");
  }
};

wss.on("connection", (ws) => {  
  ws.id = randomUUID();
  
  ws.send(JSON.stringify({
    message: "Connected to WebSocket",
    id: ws.id,
    bids,
    asks,
    currentMarketPrice,
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
        orderType: data.orderType || 'limit',
        stopLoss: data.stopLoss,
        stopLossType: data.stopLossType,
        stopLossTriggered: false,
        date: Date.now(),
        status: 'pending',
        executed: false,
        executedQty: 0,
        remainingQty: data.qty
      };

      // Validation logic (same as before)
      if (order.stopLoss) {
        if (!order.stopLossType || !['stop_loss', 'take_profit'].includes(order.stopLossType)) {
          ws.send(JSON.stringify({
            error: "Invalid stop-loss type. Must be 'stop_loss' or 'take_profit'",
            timestamp: Date.now(),
          }));
          return;
        }

        if (data.type === 'bid') {
          if (order.stopLossType === 'stop_loss' && order.stopLoss >= order.price) {
            ws.send(JSON.stringify({
              error: "For buy orders, stop-loss price must be below the order price",
              timestamp: Date.now(),
            }));
            return;
          }
          if (order.stopLossType === 'take_profit' && order.stopLoss <= order.price) {
            ws.send(JSON.stringify({
              error: "For buy orders, take-profit price must be above the order price",
              timestamp: Date.now(),
            }));
            return;
          }
        } else {
          if (order.stopLossType === 'stop_loss' && order.stopLoss <= order.price) {
            ws.send(JSON.stringify({
              error: "For sell orders, stop-loss price must be above the order price",
              timestamp: Date.now(),
            }));
            return;
          }
          if (order.stopLossType === 'take_profit' && order.stopLoss >= order.price) {
            ws.send(JSON.stringify({
              error: "For sell orders, take-profit price must be below the order price",
              timestamp: Date.now(),
            }));
            return;
          }
        }
      }

      // For market orders, set price to best available
      if (data.orderType === 'market') {
        if (data.type === 'bid' && asks.length > 0) {
          asks.sort((a, b) => a.price - b.price);
          order.price = asks[0].price;
        } else if (data.type === 'ask' && bids.length > 0) {
          bids.sort((a, b) => b.price - a.price);
          order.price = bids[0].price;
        } else {
          ws.send(JSON.stringify({
            error: `No ${data.type === 'bid' ? 'asks' : 'bids'} available for market order`,
            timestamp: Date.now(),
          }));
          return;
        }
      }
    }

    if (data.type === "bid") {
      const investorIndex = bids.findIndex(bid => bid.userId === ws.id);
      if (investorIndex !== -1) {
        bids[investorIndex] = {
          ...bids[investorIndex],
          qty: data.qty,
          price: order.price,
          orderType: order.orderType,
          stopLoss: order.stopLoss,
          stopLossType: order.stopLossType,
          remainingQty: data.qty,
          status: 'pending'
        };
        order = bids[investorIndex];
      } else {
        bids.push(order);
      }

      bids.sort((a, b) => b.price - a.price);
      
      ws.send(JSON.stringify({
        message: `${order.orderType === 'market' ? 'Market' : 'Limit'} bid order placed successfully${order.stopLoss ? ` with ${order.stopLossType} at ₹${order.stopLoss}` : ''}`,
        orderId: order.id,
        orderType: order.orderType,
        stopLoss: order.stopLoss,
        stopLossType: order.stopLossType,
        status: order.status,
        bids,
        asks,
        timestamp: Date.now(),
      }));
      
      broadcastOrderBook(`New ${order.orderType} bid order placed at ₹${order.price}`);
      tryExecuteTrades();
      
    } else if (data.type === "ask") {
      const investorIndex = asks.findIndex(ask => ask.userId === ws.id);
      if (investorIndex !== -1) {
        asks[investorIndex] = {
          ...asks[investorIndex],
          qty: data.qty,
          price: order.price,
          orderType: order.orderType,
          stopLoss: order.stopLoss,
          stopLossType: order.stopLossType,
          remainingQty: data.qty,
          status: 'pending'
        };
        order = asks[investorIndex];
      } else {
        asks.push(order);
      }

      asks.sort((a, b) => a.price - b.price);
      
      ws.send(JSON.stringify({
        message: `${order.orderType === 'market' ? 'Market' : 'Limit'} ask order placed successfully${order.stopLoss ? ` with ${order.stopLossType} at ₹${order.stopLoss}` : ''}`,
        orderId: order.id,
        orderType: order.orderType,
        stopLoss: order.stopLoss,
        stopLossType: order.stopLossType,
        status: order.status,
        bids,
        asks,
        timestamp: Date.now(),
      }));
      
      broadcastOrderBook(`New ${order.orderType} ask order placed at ₹${order.price}`);
      tryExecuteTrades();
      
    } else if (data.type === "cancel") {
      const { orderId } = data;
      
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
        
        broadcastOrderBook(`Bid order cancelled at ₹${cancelledOrder.price}`);
        return;
      }

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
        
        broadcastOrderBook(`Ask order cancelled at ₹${cancelledOrder.price}`);
        return;
      }

      ws.send(JSON.stringify({ error: "Order not found or you don't have permission to cancel it" }));

    } else if (data.type === "update") {
  const { orderId, qty, price, orderType, stopLoss, stopLossType } = data;
  
  // Find the order in bids array
  const bidIndex = bids.findIndex(bid => bid.id === orderId && bid.userId === ws.id);
  if (bidIndex !== -1) {
    const order = bids[bidIndex];
    
    // Only allow updates to pending or partially filled orders
    if (order.status === 'pending' || order.status === 'partially_filled') {
      // Validate stop-loss if provided
      if (stopLoss) {
        if (!stopLossType || !['stop_loss', 'take_profit'].includes(stopLossType)) {
          ws.send(JSON.stringify({
            error: "Invalid stop-loss type. Must be 'stop_loss' or 'take_profit'",
            timestamp: Date.now(),
          }));
          return;
        }

        // Validation for bid orders
        if (stopLossType === 'stop_loss' && stopLoss >= price) {
          ws.send(JSON.stringify({
            error: "For buy orders, stop-loss price must be below the order price",
            timestamp: Date.now(),
          }));
          return;
        }
        if (stopLossType === 'take_profit' && stopLoss <= price) {
          ws.send(JSON.stringify({
            error: "For buy orders, take-profit price must be above the order price",
            timestamp: Date.now(),
          }));
          return;
        }
      }

      // Update the order
      const executedQty = order.executedQty || 0;
      const newRemainingQty = qty - executedQty;
      
      if (newRemainingQty < 0) {
        ws.send(JSON.stringify({
          error: `Cannot reduce quantity below executed amount (${executedQty})`,
          timestamp: Date.now(),
        }));
        return;
      }

      bids[bidIndex] = {
        ...order,
        qty: qty,
        price: price,
        orderType: orderType,
        stopLoss: stopLoss,
        stopLossType: stopLossType,
        remainingQty: newRemainingQty,
        lastUpdated: Date.now()
      };

      // Re-sort the bids array
      bids.sort((a, b) => b.price - a.price);
      
      ws.send(JSON.stringify({
        message: `Bid order ${orderId} updated successfully`,
        updatedOrder: bids[bidIndex],
        bids,
        asks,
        timestamp: Date.now(),
      }));
      
      broadcastOrderBook(`Bid order updated at ₹${price}`);
      tryExecuteTrades(); // Check for new matches after update
      return;
    } else {
      ws.send(JSON.stringify({
        error: `Cannot update order with status: ${order.status}`,
        timestamp: Date.now(),
      }));
      return;
    }
  }

  // Find the order in asks array
  const askIndex = asks.findIndex(ask => ask.id === orderId && ask.userId === ws.id);
  if (askIndex !== -1) {
    const order = asks[askIndex];
    
    // Only allow updates to pending or partially filled orders
    if (order.status === 'pending' || order.status === 'partially_filled') {
      // Validate stop-loss if provided
      if (stopLoss) {
        if (!stopLossType || !['stop_loss', 'take_profit'].includes(stopLossType)) {
          ws.send(JSON.stringify({
            error: "Invalid stop-loss type. Must be 'stop_loss' or 'take_profit'",
            timestamp: Date.now(),
          }));
          return;
        }

        // Validation for ask orders
        if (stopLossType === 'stop_loss' && stopLoss <= price) {
          ws.send(JSON.stringify({
            error: "For sell orders, stop-loss price must be above the order price",
            timestamp: Date.now(),
          }));
          return;
        }
        if (stopLossType === 'take_profit' && stopLoss >= price) {
          ws.send(JSON.stringify({
            error: "For sell orders, take-profit price must be below the order price",
            timestamp: Date.now(),
          }));
          return;
        }
      }

      // Update the order
      const executedQty = order.executedQty || 0;
      const newRemainingQty = qty - executedQty;
      
      if (newRemainingQty < 0) {
        ws.send(JSON.stringify({
          error: `Cannot reduce quantity below executed amount (${executedQty})`,
          timestamp: Date.now(),
        }));
        return;
      }

      asks[askIndex] = {
        ...order,
        qty: qty,
        price: price,
        orderType: orderType,
        stopLoss: stopLoss,
        stopLossType: stopLossType,
        remainingQty: newRemainingQty,
        lastUpdated: Date.now()
      };

      // Re-sort the asks array
      asks.sort((a, b) => a.price - b.price);
      
      ws.send(JSON.stringify({
        message: `Ask order ${orderId} updated successfully`,
        updatedOrder: asks[askIndex],
        bids,
        asks,
        timestamp: Date.now(),
      }));
      
      broadcastOrderBook(`Ask order updated at ₹${price}`);
      tryExecuteTrades(); // Check for new matches after update
      return;
    } else {
      ws.send(JSON.stringify({
        error: `Cannot update order with status: ${order.status}`,
        timestamp: Date.now(),
      }));
      return;
    }
  }

  // Order not found
  ws.send(JSON.stringify({
    error: "Order not found or you don't have permission to update it",
    timestamp: Date.now(),
  }));

} else if (data.type === "getOrders") {
      const userBids = bids.filter(bid => bid.userId === ws.id);
      const userAsks = asks.filter(ask => ask.userId === ws.id);
      
      ws.send(JSON.stringify({
        message: "Your active orders",
        userBids,
        userAsks,
        bids,
        asks,
        currentMarketPrice,
        timestamp: Date.now(),
      }));

    } else if (data.type === "getPositions") {
      const userPositions = positions.filter(pos => pos.userId === ws.id);
      
      ws.send(JSON.stringify({
        message: "Your positions",
        positions: userPositions,
        currentMarketPrice,
        timestamp: Date.now(),
      }));

    } else if (data.type === "getTrades") {
      const userTrades = trades.filter(trade => 
        trade.buyerUserId === ws.id || trade.sellerUserId === ws.id
      );
      
      ws.send(JSON.stringify({
        message: "Trade history",
        userTrades,
        allTrades: trades.slice(-50),
        currentMarketPrice,
        timestamp: Date.now(),
      }));
    }
  });

  ws.on("close", () => {
    let ordersRemoved = false;
    
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
    
    // Remove user positions when they disconnect (optional - you might want to keep them)
    for (let i = positions.length - 1; i >= 0; i--) {
      if (positions[i].userId === ws.id) {
        positions.splice(i, 1);
      }
    }
    
    if (ordersRemoved) {
      broadcastOrderBook("User disconnected - orders removed");
    }
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});

// REST API endpoints (same as before, plus new ones)
app.get('/health', (req, res) => {
  res.send("Server is up!");
});

app.get('/positions', (req, res) => {
  res.json({
    positions: positions,
    totalPositions: positions.length,
    currentMarketPrice,
    timestamp: Date.now()
  });
});

app.get('/user-positions/:userId', (req, res) => {
  const userId = req.params.userId;
  const userPositions = positions.filter(pos => pos.userId === userId);
  
  res.json({
    positions: userPositions,
    currentMarketPrice,
    timestamp: Date.now()
  });
});

// All other existing endpoints remain the same...
app.get('/order/:id', (req, res) => {
  const userId = req.params.id;
  const order = bids.find(bid => bid.userId === userId) || asks.find(ask => ask.userId === userId);

  if (order) {
    res.json(order);
  } else {
    res.status(404).json({ error: "Order not found" });
  }
});

app.get('/user-orders/:userId', (req, res) => {
  const userId = req.params.userId;
  
  const userBids = bids.filter(bid => bid.userId === userId);
  const userAsks = asks.filter(ask => ask.userId === userId);
  
  const userTrades = trades.filter(trade => 
    trade.buyerUserId === userId || trade.sellerUserId === userId
  );
  
  const historicalOrdersFromTrades = [];
  const orderTradeMap = new Map();
  
  userTrades.forEach(trade => {
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

  orderTradeMap.forEach((orderInfo, orderId) => {
    const existsInActive = [...userBids, ...userAsks].some(order => order.id === orderId);
    
    if (!existsInActive && orderInfo.trades.length > 0) {
      const firstTrade = orderInfo.trades[0];
      const avgPrice = orderInfo.trades.reduce((sum, trade) => sum + (trade.price * trade.quantity), 0) / orderInfo.totalExecutedQty;
      
      historicalOrdersFromTrades.push({
        id: orderId,
        userId: userId,
        type: orderInfo.type,
        qty: orderInfo.totalExecutedQty,
        price: avgPrice,
        orderType: 'limit',
        stopLoss: null,
        stopLossType: null,
        stopLossTriggered: orderInfo.trades.some(trade => 
          trade.buyerStopLossTriggered || trade.sellerStopLossTriggered
        ),
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
  
  allOrders.sort((a, b) => b.date - a.date);
  
  res.json({
    orders: allOrders,
    bids: processedBids,
    asks: processedAsks,
    trades: userTrades,
    totalOrders: allOrders.length,
    totalTrades: userTrades.length,
    currentMarketPrice,
    timestamp: Date.now()
  });
});

app.get('/order-book', (req, res) => {
  res.json({
    bids: bids.sort((a, b) => b.price - a.price),
    asks: asks.sort((a, b) => a.price - b.price),
    currentMarketPrice,
    timestamp: Date.now()
  });
});

app.get('/trades', (req, res) => {
  res.json({
    trades: trades.slice(-100),
    totalTrades: trades.length,
    currentMarketPrice,
    timestamp: Date.now()
  });
});

app.get('/market-stats', (req, res) => {
  const lastTrade = trades[trades.length - 1];
  const volume24h = trades
    .filter(trade => Date.now() - trade.timestamp < 24 * 60 * 60 * 1000)
    .reduce((sum, trade) => sum + trade.quantity, 0);

  res.json({
    lastPrice: currentMarketPrice || (lastTrade ? lastTrade.price : null),
    bestBid: bids.length > 0 ? Math.max(...bids.map(b => b.price)) : null,
    bestAsk: asks.length > 0 ? Math.min(...asks.map(a => a.price)) : null,
    volume24h: volume24h,
    totalTrades: trades.length,
    activeBids: bids.length,
    activeAsks: asks.length,
    currentMarketPrice,
    timestamp: Date.now()
  });
});

app.get('/ws-info', (req, res) => {
  res.json({
    connectedClients: wss.clients.size,
    totalBids: bids.length,
    totalAsks: asks.length,
    totalTrades: trades.length,
    totalPositions: positions.length,
    currentMarketPrice,
    timestamp: Date.now()
  });
});

app.post('/force-match', (req, res) => {
  const tradesBeforeCount = trades.length;
  tryExecuteTrades();
  const tradesAfterCount = trades.length;
  
  res.json({
    message: "Trade matching attempted",
    newTrades: tradesAfterCount - tradesBeforeCount,
    bids: bids.length,
    asks: asks.length,
    currentMarketPrice,
    timestamp: Date.now()
  });
});

// Endpoint to manually trigger stop-loss checks (for testing)
app.post('/check-stop-loss', (req, res) => {
  const { testPrice } = req.body;
  const price = testPrice || currentMarketPrice;
  
  if (!price) {
    return res.status(400).json({
      error: "No test price provided and no current market price available",
      timestamp: Date.now()
    });
  }

  const stopLossTriggered = checkStopLossOrders(price);
  
  res.json({
    message: "Stop-loss check completed",
    testPrice: price,
    stopLossTriggered,
    bids: bids.length,
    asks: asks.length,
    positions: positions.length,
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
  console.log('  GET  /positions - All positions');
  console.log('  GET  /user-positions/:userId - User positions');
  console.log('  GET  /market-stats - Market statistics');
  console.log('  GET  /ws-info - WebSocket info');
  console.log('  POST /force-match - Force trade matching');
  console.log('  POST /check-stop-loss - Test stop-loss triggers');
});