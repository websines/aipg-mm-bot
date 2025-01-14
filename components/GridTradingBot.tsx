'use client';

import { useState, useEffect } from 'react';

interface Balance {
  currency: string;
  availableAmount: string;
  frozenAmount: string;
  totalAmount: string;
}

interface Order {
  symbol: string;
  orderId: string;
  side: string;
  price: string;
  origQty: string;
  executedQty: string;
  type: string;
  state: string;
}

interface GridParams {
  symbol: string;
  positions: number;
  total_amount: number;
  min_distance: number;
  max_distance: number;
}

interface GridStatus {
  symbol: string;
  current_price: number;
  balance: Balance;
  open_orders: Order[];
  positions: number;
  stats: {
    total_trades: number;
    total_volume: number;
    total_fees: number;
    realized_pnl: number;
  };
  total_amount: number;
  min_distance: number;
  max_distance: number;
  upper_price: number;
  lower_price: number;
  grid_spread: number;
  avg_distance: number;
  is_running: boolean;
  created_at: string;
  updated_at: string;
}

interface SortConfig {
  key: 'side' | 'price' | 'origQty' | 'executedQty' | 'state';
  direction: 'asc' | 'desc';
}

interface GridStatusResponse {
  is_running: boolean;
  grid_status: GridStatus;
}

interface ExchangePrices {
  xt: number | null;
  xeggex: number | null;
  coinex: number | null;
  xeggex_bid?: number | null;
  xeggex_ask?: number | null;
  timestamp: string;
}

export default function GridTradingBot() {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  
  const [balances, setBalances] = useState<Balance | null>(null);
  const [openOrders, setOpenOrders] = useState<Order[]>([]);
  const [gridParams, setGridParams] = useState<GridParams>({
    symbol: 'AIPG_USDT',
    positions: 5,
    total_amount: 100,
    min_distance: 0.5,
    max_distance: 10,
  });
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gridStatus, setGridStatus] = useState<GridStatus | null>(null);
  const [operationInProgress, setOperationInProgress] = useState<'create' | 'stop' | ''>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(5);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'price', direction: 'desc' });
  const [filterSide] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [filterStatus] = useState<string>('ALL');
  const [exchangePrices, setExchangePrices] = useState<ExchangePrices | null>(null);

  useEffect(() => {
    void fetchInitialData();
    const statusInterval = setInterval(() => void fetchGridStatus(), 30 * 1000);
    const pricesInterval = setInterval(() => void fetchAllPrices(), 30 * 1000);
    return () => {
      clearInterval(statusInterval);
      clearInterval(pricesInterval);
    };
  }, []);

  const fetchInitialData = async () => {
    try {
      setError(null);
      
      const response = await fetch(`${API_BASE_URL}/api/grid/status`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to fetch grid status');
      }

      const data = await response.json();
      handleStatusUpdate(data);
      
      if (data.grid_status) {
        if (data.grid_status.balance) {
          setBalances(data.grid_status.balance);
        }
        if (data.grid_status.open_orders) {
          setOpenOrders(data.grid_status.open_orders);
        }
      }
    } catch (error) {
      console.error('Error fetching initial data:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch initial data');
    }
  };

  const fetchGridStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/grid/status`);
      if (!response.ok) {
        throw new Error('Failed to fetch grid status');
      }
      const data = await response.json();
      handleStatusUpdate(data);
    } catch (error) {
      console.error('Error fetching grid status:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch grid status');
    }
  };

  const handleStatusUpdate = (data: GridStatusResponse) => {
    if (data.grid_status) {
      setIsRunning(data.is_running);
      setGridStatus(data.grid_status);
    } else {
      setIsRunning(false);
      setGridStatus(null);
    }
  };

  const createGrid = async () => {
    try {
      setError(null);
      setOperationInProgress('create');
      console.log('Creating grid with params:', gridParams);
      const response = await fetch(`${API_BASE_URL}/api/grid/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(gridParams),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to create grid');
      }

      const data = await response.json();
      handleStatusUpdate(data);
    } catch (error) {
      console.error('Error creating grid:', error);
      setError(error instanceof Error ? error.message : 'Failed to create grid');
      setIsRunning(false);
    } finally {
      setOperationInProgress('');
    }
  };

  const stopGrid = async () => {
    try {
      setOperationInProgress('stop');
      setError(null);
      
      const response = await fetch(`${API_BASE_URL}/api/grid/stop`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to stop grid');
      }

      setIsRunning(false);
      setGridStatus(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to stop grid');
    } finally {
      setOperationInProgress('');
    }
  };

  const sortAndFilterOrders = (orders: Order[]): Order[] => {
    let filteredOrders = [...orders];
    
    if (filterSide !== 'ALL') {
      filteredOrders = filteredOrders.filter(order => order.side === filterSide);
    }
    if (filterStatus !== 'ALL') {
      filteredOrders = filteredOrders.filter(order => order.state === filterStatus);
    }

    return filteredOrders.sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        if (sortConfig.key === 'price' || sortConfig.key === 'origQty' || sortConfig.key === 'executedQty') {
          return sortConfig.direction === 'asc' 
            ? parseFloat(aValue) - parseFloat(bValue)
            : parseFloat(bValue) - parseFloat(aValue);
        }
        return sortConfig.direction === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      return 0;
    });
  };

  const handleSort = (key: SortConfig['key']) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const fetchAllPrices = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/prices/all`);
      if (!response.ok) {
        throw new Error('Failed to fetch prices');
      }
      const data = await response.json();
      setExchangePrices(data);
    } catch (error) {
      console.error('Error fetching prices:', error);
    }
  };

  const totalPages = Math.ceil((openOrders?.length || 0) / itemsPerPage);
  const paginatedOrders = openOrders 
    ? sortAndFilterOrders(openOrders).slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
      )
    : [];

  useEffect(() => {
    setCurrentPage(1);
  }, [filterSide, filterStatus]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header with Price Cards */}
        <div className="flex flex-col space-y-4">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              AIPG Grid Trading Bot
            </h1>
            <div className="text-sm text-gray-400">
              Last Update: {exchangePrices?.timestamp ? new Date(exchangePrices.timestamp).toLocaleString() : 'Never'}
            </div>
          </div>

          {/* Compact Price Cards */}
          <div className="grid grid-cols-3 gap-4 bg-gray-800 p-4 rounded-xl">
            {/* XT Card */}
            <div className="flex items-center justify-between bg-blue-600/10 rounded-lg p-3">
              <div>
                <div className="text-sm font-medium text-blue-400">XT.com</div>
                <div className="text-lg font-bold">
                  {exchangePrices?.xt 
                    ? `$${exchangePrices.xt.toFixed(6)}` 
                    : <div className="animate-pulse bg-blue-700/50 h-6 w-24 rounded"></div>
                  }
                </div>
              </div>
              <div className="bg-blue-500/20 px-2 py-1 rounded text-xs text-blue-300">
                Primary
              </div>
            </div>

            {/* Xeggex Card */}
            <div className="flex items-center justify-between bg-purple-600/10 rounded-lg p-3">
              <div>
                <div className="text-sm font-medium text-purple-400">Xeggex</div>
                <div className="text-lg font-bold">
                  {exchangePrices?.xeggex 
                    ? `$${exchangePrices.xeggex.toFixed(6)}` 
                    : <div className="animate-pulse bg-purple-700/50 h-6 w-24 rounded"></div>
                  }
                </div>
                {(exchangePrices?.xeggex_bid || exchangePrices?.xeggex_ask) && (
                  <div className="text-xs text-purple-300 mt-1">
                    ${exchangePrices.xeggex_bid?.toFixed(6)} / ${exchangePrices.xeggex_ask?.toFixed(6)}
                  </div>
                )}
              </div>
              {exchangePrices?.xeggex && exchangePrices?.xt && (
                <div className={`px-2 py-1 rounded text-xs ${
                  exchangePrices.xeggex > exchangePrices.xt
                    ? 'bg-red-500/20 text-red-300'
                    : 'bg-green-500/20 text-green-300'
                }`}>
                  {((exchangePrices.xeggex - exchangePrices.xt) / exchangePrices.xt * 100).toFixed(2)}%
                </div>
              )}
            </div>

            {/* Coinex Card */}
            <div className="flex items-center justify-between bg-indigo-600/10 rounded-lg p-3">
              <div>
                <div className="text-sm font-medium text-indigo-400">Coinex</div>
                <div className="text-lg font-bold">
                  {exchangePrices?.coinex 
                    ? `$${exchangePrices.coinex.toFixed(6)}` 
                    : <div className="animate-pulse bg-indigo-700/50 h-6 w-24 rounded"></div>
                  }
                </div>
              </div>
              {exchangePrices?.coinex && exchangePrices?.xt && (
                <div className={`px-2 py-1 rounded text-xs ${
                  exchangePrices.coinex > exchangePrices.xt
                    ? 'bg-red-500/20 text-red-300'
                    : 'bg-green-500/20 text-green-300'
                }`}>
                  {((exchangePrices.coinex - exchangePrices.xt) / exchangePrices.xt * 100).toFixed(2)}%
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Grid Bot Interface */}
        <div className="grid grid-cols-12 gap-6">
          {/* Left Panel - Grid Controls */}
          <div className="col-span-4 space-y-4">
            {/* Grid Parameters */}
            <div className="bg-gray-800 rounded-xl p-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold">Grid Parameters</h2>
                <button
                  onClick={() => void createGrid()}
                  disabled={operationInProgress === 'create'}
                  className={`px-3 py-1.5 rounded font-medium text-sm transition-all ${
                    operationInProgress === 'create'
                      ? 'bg-green-600/50 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-700'
                  }`}
                >
                  {operationInProgress === 'create' ? 'Creating...' : 'Create Grid'}
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <label className="text-sm font-medium text-gray-400">
                    Grid Lines
                  </label>
                  <input
                    type="number"
                    value={gridParams.positions}
                    onChange={(e) => setGridParams({ ...gridParams, positions: parseInt(e.target.value) })}
                    className="w-24 bg-gray-700 border border-gray-600 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <label className="text-sm font-medium text-gray-400">
                    Investment
                  </label>
                  <div className="relative w-24">
                    <input
                      type="number"
                      value={gridParams.total_amount}
                      onChange={(e) => setGridParams({ ...gridParams, total_amount: parseFloat(e.target.value) })}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                      USDT
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <label className="text-sm font-medium text-gray-400">
                    Min Distance
                  </label>
                  <div className="relative w-24">
                    <input
                      type="number"
                      value={gridParams.min_distance}
                      onChange={(e) => setGridParams({ ...gridParams, min_distance: parseFloat(e.target.value) })}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                      %
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <label className="text-sm font-medium text-gray-400">
                    Max Distance
                  </label>
                  <div className="relative w-24">
                    <input
                      type="number"
                      value={gridParams.max_distance}
                      onChange={(e) => setGridParams({ ...gridParams, max_distance: parseFloat(e.target.value) })}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                      %
                    </span>
                  </div>
                </div>
              </div>

              {error && (
                <div className="mt-4 bg-red-900/50 border border-red-500/50 text-red-200 px-3 py-2 rounded text-sm">
                  {error}
                </div>
              )}
            </div>

            {/* Wallet Balance */}
            {balances && (
              <div className="bg-gray-800 rounded-xl p-4">
                <h2 className="text-lg font-bold mb-3">Wallet Balance</h2>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-700/30 rounded-lg p-3">
                    <div className="text-sm text-gray-400">Available</div>
                    <div className="text-lg font-bold mt-1">{balances.availableAmount}</div>
                  </div>
                  <div className="bg-gray-700/30 rounded-lg p-3">
                    <div className="text-sm text-gray-400">Frozen</div>
                    <div className="text-lg font-bold mt-1">{balances.frozenAmount}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Grid Status */}
            {gridStatus && (
              <div className="bg-gray-800 rounded-xl p-4">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-lg font-bold">Grid Status</h2>
                  <button
                    onClick={() => void stopGrid()}
                    disabled={operationInProgress === 'stop'}
                    className={`px-3 py-1.5 rounded font-medium text-sm transition-all ${
                      operationInProgress === 'stop'
                        ? 'bg-red-600/50 cursor-not-allowed'
                        : 'bg-red-600 hover:bg-red-700'
                    }`}
                  >
                    {operationInProgress === 'stop' ? 'Stopping...' : 'Stop Grid'}
                  </button>
                </div>
                
                <div className="space-y-3">
                  <div className="bg-gray-700/30 rounded-lg p-3">
                    <div className="text-sm text-gray-400">Running Time</div>
                    <div className="text-lg font-bold mt-1">
                      {formatRunningTime(new Date(gridStatus.created_at))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-700/30 rounded-lg p-3">
                      <div className="text-sm text-gray-400">Trades</div>
                      <div className="text-lg font-bold mt-1">
                        {gridStatus.stats?.total_trades || 0}
                      </div>
                    </div>
                    <div className="bg-gray-700/30 rounded-lg p-3">
                      <div className="text-sm text-gray-400">PnL</div>
                      <div className={`text-lg font-bold mt-1 ${
                        (gridStatus.stats?.realized_pnl || 0) >= 0 
                          ? 'text-green-400' 
                          : 'text-red-400'
                      }`}>
                        {((gridStatus.stats?.realized_pnl || 0) / (gridStatus.total_amount || 1) * 100).toFixed(2)}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Panel - Orders */}
          <div className="col-span-8">
            {/* Orders Table */}
            {openOrders.length > 0 ? (
              <div className="bg-gray-800 rounded-xl p-4">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-bold">Open Orders</h2>
                  <div className="text-sm text-gray-400">
                    {openOrders.length} Active Orders
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-gray-400 text-sm">
                        <th className="pb-3 pl-3">Side</th>
                        <th className="pb-3">Price</th>
                        <th className="pb-3">Amount</th>
                        <th className="pb-3">Filled</th>
                        <th className="pb-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {paginatedOrders.map((order) => (
                        <tr key={order.orderId} className="text-sm">
                          <td className="py-2 pl-3">
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              order.side === 'BUY' 
                                ? 'bg-green-500/20 text-green-300'
                                : 'bg-red-500/20 text-red-300'
                            }`}>
                              {order.side}
                            </span>
                          </td>
                          <td className="py-2">${parseFloat(order.price).toFixed(6)}</td>
                          <td className="py-2">{parseFloat(order.origQty).toFixed(2)}</td>
                          <td className="py-2">
                            <div className="flex items-center gap-2">
                              <div className="w-16 bg-gray-700 rounded-full h-1">
                                <div 
                                  className="bg-blue-500 h-1 rounded-full" 
                                  style={{width: `${(parseFloat(order.executedQty) / parseFloat(order.origQty)) * 100}%`}}
                                ></div>
                              </div>
                              <span>{parseFloat(order.executedQty).toFixed(2)}</span>
                            </div>
                          </td>
                          <td className="py-2">
                            <span className="px-2 py-0.5 bg-gray-700 rounded text-xs">
                              {order.state}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex justify-center mt-4 space-x-1">
                    {Array.from({ length: totalPages }, (_, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentPage(i + 1)}
                        className={`px-2 py-1 rounded text-xs ${
                          currentPage === i + 1
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-gray-800 rounded-xl p-8 text-center">
                <div className="text-gray-400">No active orders</div>
                <div className="text-sm text-gray-500 mt-1">
                  Orders will appear here when the grid is running
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatRunningTime(startTime: Date): string {
  const now = new Date();
  const diff = now.getTime() - startTime.getTime();
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}
