import axios from "axios";
import { useEffect, useState } from "react";

const Order = ({ userId }: { userId: string }) => {
  const [orders, setOrders] = useState();

  useEffect(() => {
    console.log(userId);
    axios.get(`http://localhost:8000/order/${userId}`)
    .then(res => {
      setOrders(res.data);
    })
    .catch(err => console.log(err));
  })

  return <div>
    {JSON.stringify(orders)}
  </div>
}

export default Order;