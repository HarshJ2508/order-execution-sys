import { useEffect, useState } from "react";

const useSocket = (url: string = 'ws://localhost:8080') => {
  const [socket, setSocket] = useState<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(url);
    setSocket(ws);

    ws.onopen = () => {
      console.log("✅ Connected to WebSocket server");
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
    };

    ws.onclose = () => {
      console.log("❌ Disconnected from WebSocket server");
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log(data);
        if (data.id) {
          localStorage.setItem('userID', data.id);
        }
      } catch (err) {
        console.error("Invalid JSON received:", event.data);
      }
    };

    return () => {
      // ws.close();
      localStorage.removeItem('userID');
    };
  }, [url]);

  return { socket };
};

export default useSocket;
