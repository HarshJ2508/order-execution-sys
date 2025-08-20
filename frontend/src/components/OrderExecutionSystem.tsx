import { useState } from "react";
import type { Bond } from "./BondTable";
import Navbar from "./Navbar";
import BondDetails from "./BondDetails";
import BondTable from "./BondTable";

const OrderExecutionSystem = ({ socket }: { socket: WebSocket | null }) => {
  const [selectedBond, setSelectedBond] = useState<Bond | null>(null);

  interface HandleBondSelect {
    (bond: Bond): void;
  }

  const handleBondSelect: HandleBondSelect = (bond) => {
    setSelectedBond(bond);
  };

  const handleBack = () => {
    setSelectedBond(null);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* <Navbar /> */}
      
      {selectedBond ? (
        <BondDetails socket={socket} bond={selectedBond} onBack={handleBack} />
      ) : (
        <BondTable onBondSelect={handleBondSelect} />
      )}
    </div>
  );
};

export default OrderExecutionSystem;