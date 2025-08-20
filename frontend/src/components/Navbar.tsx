import { Activity, BarChart3, Bell, Search, Settings, TrendingUp, Users } from "lucide-react";

const Navbar = () => {
  return (
    <nav className="bg-gray-900 text-white px-6 py-4 flex items-center justify-between shadow-lg">
      <div className="flex items-center space-x-8">
        <div className="flex items-center space-x-2">
          <BarChart3 className="h-8 w-8 text-blue-400" />
          <span className="text-xl font-bold">FixedIncome Pro</span>
        </div>
        
        <div className="flex items-center space-x-6">
          <button className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors">
            <Activity className="h-4 w-4" />
            <span>Market Watch</span>
          </button>
          <button className="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors">
            <TrendingUp className="h-4 w-4" />
            <span>Order Book</span>
          </button>
          <button className="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors">
            <Users className="h-4 w-4" />
            <span>Portfolio</span>
          </button>
          <button className="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors">
            <BarChart3 className="h-4 w-4" />
            <span>Analytics</span>
          </button>
        </div>
      </div>
      
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2 bg-gray-800 rounded-lg px-3 py-2">
          <Search className="h-4 w-4 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search bonds..." 
            className="bg-transparent text-white placeholder-gray-400 focus:outline-none w-48"
          />
        </div>
        <button className="p-2 rounded-lg hover:bg-gray-800 transition-colors">
          <Bell className="h-5 w-5" />
        </button>
        <button className="p-2 rounded-lg hover:bg-gray-800 transition-colors">
          <Settings className="h-5 w-5" />
        </button>
        <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
          <span className="text-sm font-medium">JD</span>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;