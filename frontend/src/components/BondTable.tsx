// Dummy Indian bond data
const indianBonds = [
  {
    ticker: "GOISEC28",
    description: "Government of India Security 2028",
    faceValue: 100,
    rating: "AAA",
    daysToMaturity: 1245,
    ytm: 6.85,
    currentYield: 6.50,
    bids: [],
    asks: [],
    modifiedDuration: 3.2,
    couponRate: 6.50,
    maturityDate: "2028-12-15",
    issueDate: "2021-12-15",
    nextCouponDate: "2025-12-15",
    frequency: "Semi-Annual"
  },
  {
    ticker: "IRFC25",
    description: "Indian Railway Finance Corporation 2025",
    faceValue: 1000,
    rating: "AAA",
    daysToMaturity: 156,
    ytm: 7.25,
    currentYield: 7.10,
    bids: [],
    asks: [],
    bidPrice: 1015.30,
    askPrice: 1015.85,
    bidQuantity: 500000,
    askQuantity: 750000,
    modifiedDuration: 0.4,
    couponRate: 7.10,
    maturityDate: "2025-12-20",
    issueDate: "2020-12-20",
    nextCouponDate: "2025-06-20",
    frequency: "Semi-Annual"
  },
  {
    ticker: "HDFC30",
    description: "Housing Development Finance Corporation 2030",
    faceValue: 1000,
    rating: "AA+",
    daysToMaturity: 2100,
    ytm: 8.15,
    currentYield: 7.85,
    bids: [],
    asks: [],
    bidPrice: 965.20,
    askPrice: 966.10,
    bidQuantity: 2000000,
    askQuantity: 1500000,
    modifiedDuration: 4.8,
    couponRate: 7.85,
    maturityDate: "2030-09-15",
    issueDate: "2023-09-15",
    nextCouponDate: "2026-03-15",
    frequency: "Semi-Annual"
  },
  {
    ticker: "SBI27",
    description: "State Bank of India Tier II Bond 2027",
    faceValue: 1000,
    rating: "AA",
    daysToMaturity: 890,
    ytm: 7.95,
    currentYield: 7.75,
    bids: [],
    asks: [],
    bidPrice: 985.60,
    askPrice: 986.25,
    bidQuantity: 1200000,
    askQuantity: 900000,
    modifiedDuration: 2.1,
    couponRate: 7.75,
    maturityDate: "2027-04-10",
    issueDate: "2022-04-10",
    nextCouponDate: "2025-10-10",
    frequency: "Semi-Annual"
  },
  {
    ticker: "NTPC26",
    description: "National Thermal Power Corporation 2026",
    faceValue: 1000,
    rating: "AAA",
    daysToMaturity: 445,
    ytm: 6.95,
    currentYield: 6.80,
    bids: [],
    asks: [],
    bidPrice: 1005.80,
    askPrice: 1006.30,
    bidQuantity: 800000,
    askQuantity: 950000,
    modifiedDuration: 1.2,
    couponRate: 6.80,
    maturityDate: "2026-11-25",
    issueDate: "2021-11-25",
    nextCouponDate: "2025-11-25",
    frequency: "Annual"
  }
];

export interface Order {
  price: number;
  qty: number,
  orders: number,
}

export interface Bond {
  ticker: string;
  description: string;
  faceValue: number;
  rating: string;
  daysToMaturity: number;
  ytm: number;
  currentYield: number;
  bids: Order[],
  asks: Order[],
  modifiedDuration: number;
  couponRate: number;
  maturityDate: string;
  issueDate: string;
  nextCouponDate: string;
  frequency: string;
}

interface BondTableProps {
  onBondSelect: (bond: Bond) => void;
}

const BondTable = ({ onBondSelect }: BondTableProps) => {
  const getRatingColor = (rating: string) => {
    switch (rating) {
      case 'AAA': return 'text-green-600 bg-green-100';
      case 'AA+': return 'text-blue-600 bg-blue-100';
      case 'AA': return 'text-yellow-600 bg-yellow-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Indian Fixed Income Securities</h1>
          <p className="text-gray-600 mt-1">Live market data for government and corporate bonds</p>
        </div>        
      </div>

      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ticker</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Face Value</th>
                <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Rating</th>
                <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Days to Maturity</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {indianBonds.map((bond) => (
                <tr 
                  key={bond.ticker} 
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => onBondSelect(bond)}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{bond.ticker}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900 max-w-xs truncate">{bond.description}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="text-sm text-gray-900">₹{bond.faceValue}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRatingColor(bond.rating)}`}>
                      {bond.rating}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="text-sm text-gray-900">{bond.daysToMaturity}</div>
                    <div className="text-xs text-gray-500">{(bond.daysToMaturity / 365).toFixed(1)}y</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default BondTable;
