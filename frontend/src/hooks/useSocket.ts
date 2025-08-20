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

    // return () => {
    //   ws.close();
    // };
  }, [url]);

  return { socket };
};

export default useSocket;
