import { Routes, Route } from "react-router-dom";
import OrderExecutionSystem from "./components/OrderExecutionSystem";
import useSocket from "./hooks/useSocket";
import MyOrder from "./components/MyOrder";

const App = () => {
  const { socket } = useSocket();

  return <Routes>
    <Route path='/' element={<OrderExecutionSystem socket={socket} />} />
    <Route path='/my-order' element={<MyOrder />} /> 
  </Routes>
}

export default App;