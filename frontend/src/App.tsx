import { Routes, Route } from "react-router-dom";
import OrderExecutionSystem from "./components/OrderExecutionSystem";
import Order from "./components/Order";
import useSocket from "./hooks/useSocket";
import { useEffect, useState } from "react";

const App = () => {
  const { socket } = useSocket();
  const [userId, setUserId] = useState();

  useEffect(() => {
    if (socket) {
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("In App: "+JSON.stringify(data));
          setUserId(data.id);
        } catch (err) {
          console.error("Invalid JSON received:", event.data);
        }
      };
    }
  }, [socket]);

  return <Routes>
    <Route path='/' element={<OrderExecutionSystem socket={socket}/>} />
    <Route path='/orders' element={<Order userId={userId ?? ''} />} />
  </Routes>
}

export default App;