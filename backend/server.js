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

// const bidsTable = [];
// const asksTable = [];

wss.on("connection", (ws) => {  
  ws.id = randomUUID();
  ws.send(JSON.stringify({
    id: ws.id
  }));

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);
    let order = {};

    if (data.type === "bid" || data.type === "ask") {
      order = {
        id: randomUUID(), // Unique order ID
        userId: ws.id,    // User ID who placed the order
        type: data.type,
        qty: data.qty,
        price: data.price,
        stopLoss: data.stopLoss,
        date: Date.now(),
      };
    }

    if (data.type === "bid") {
      const investorIndex = bids.findIndex(bid => bid.userId === ws.id);
      if (investorIndex !== -1) {
        bids[investorIndex] = {
          ...bids[investorIndex],
          qty: data.qty,
          price: data.price,
        };
      } else {
        bids.push(order);
      }

      bids.sort((a, b) => b.price - a.price); // highest first
      ws.send(JSON.stringify({
        message: `Bid order placed successfully`,
        orderId: order.id,
        bids,
        asks,
        date: Date.now(),
      }));

    } else if (data.type === "ask") {
      const investorIndex = asks.findIndex(ask => ask.userId === ws.id);
      if (investorIndex !== -1) {
        asks[investorIndex] = {
          ...asks[investorIndex],
          qty: data.qty,
          price: data.price,
        };
      } else {
        asks.push(order);
      }

      asks.sort((a, b) => a.price - b.price); // lowest first
      ws.send(JSON.stringify({
        message: `Ask order placed successfully`,
        orderId: order.id,
        bids,
        asks,
        date: Date.now(),
      }));

    } else if (data.type === "exe") {
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

        buyerOrder.qty -= executionQty;
        sellerOrder.qty -= executionQty;

        if (buyerOrder.qty <= 0) {
          bids.splice(bids.findIndex(bid => bid.id === buyerOrderId), 1);
        }
        if (sellerOrder.qty <= 0) {
          asks.splice(asks.findIndex(ask => ask.id === sellerOrderId), 1);
        }

        const tradeMessage = JSON.stringify({
          message: `Trade executed at ${executionPrice} for quantity ${executionQty}`,
          trade: {
            price: executionPrice,
            quantity: executionQty,
            buyerUserId: buyerOrder.userId,
            sellerUserId: sellerOrder.userId,
            timestamp: Date.now()
          },
          bids,
          asks,
          currentPrice: executionPrice,
          date: Date.now(),
        });

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
        bids.splice(bidIndex, 1);
        ws.send(JSON.stringify({
          message: `Bid order ${orderId} cancelled successfully`,
          bids,
          asks,
          date: Date.now(),
        }));
        return;
      }

      // Try to find and remove from asks
      const askIndex = asks.findIndex(ask => ask.id === orderId && ask.userId === ws.id);
      if (askIndex !== -1) {
        asks.splice(askIndex, 1);
        ws.send(JSON.stringify({
          message: `Ask order ${orderId} cancelled successfully`,
          bids,
          asks,
          date: Date.now(),
        }));
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
        date: Date.now(),
      }));
    }
  });

  // Clean up orders when user disconnects
  ws.on("close", () => {
    // Remove all orders from disconnected user
    for (let i = bids.length - 1; i >= 0; i--) {
      if (bids[i].userId === ws.id) {
        bids.splice(i, 1);
      }
    }
    for (let i = asks.length - 1; i >= 0; i--) {
      if (asks[i].userId === ws.id) {
        asks.splice(i, 1);
      }
    }
  });
});

app.get('/heath', (req, res) => {
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

app.get('/order-book', (req, res) => {
  res.send({
    bids,
    asks
  })
})

app.listen('8000', () => {
  console.log('Server activated on port 8000');
});
