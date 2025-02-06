import { format } from 'date-fns';

const tokenSymbolCache = new Map();
const priceCache = new Map();

export async function getTokenSymbol(tokenAddress) {
  if (tokenAddress === 'SOL') return 'SOL';
  if (tokenSymbolCache.has(tokenAddress)) {
    return tokenSymbolCache.get(tokenAddress);
  }

  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${tokenAddress}`);
    const data = await response.json();

    if (data.pairs && data.pairs.length > 0) {
      for (const pair of data.pairs) {
        if (pair.baseToken.address.toLowerCase() === tokenAddress.toLowerCase()) {
          tokenSymbolCache.set(tokenAddress, pair.baseToken.symbol);
          return pair.baseToken.symbol;
        }
        if (pair.quoteToken.address.toLowerCase() === tokenAddress.toLowerCase()) {
          tokenSymbolCache.set(tokenAddress, pair.quoteToken.symbol);
          return pair.quoteToken.symbol;
        }
      }
    }
    
    const shortAddress = `${tokenAddress.slice(0, 4)}...${tokenAddress.slice(-4)}`;
    tokenSymbolCache.set(tokenAddress, shortAddress);
    return shortAddress;
  } catch (error) {
    console.error('Error fetching token symbol:', error);
    return tokenAddress.slice(0, 8) + '...';
  }
}

export async function getHistoricalPrice(symbol, date) {
  if (!symbol) return 0;

  try {
    const dateStr = format(new Date(date), 'yyyy-MM-dd');
    const cacheKey = `${symbol}-${dateStr}`;

    // Check cache first
    if (priceCache.has(cacheKey)) {
      return priceCache.get(cacheKey);
    }

    const startTime = new Date(date);
    startTime.setUTCHours(0, 0, 0, 0);
    
    const endTime = new Date(date);
    endTime.setUTCHours(23, 59, 59, 999);

    const options = {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        symbol,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        interval: '1d'
      })
    };

    const response = await fetch(
      'https://api.g.alchemy.com/prices/v1/fyuU1FVPOuWzBDPiHMfxex-P7yV7OvGI/tokens/historical',
      options
    );
    
    const data = await response.json();
    
    if (data && data.data && data.data.length > 0) {
      // Find the closest date in the data
      const targetDate = new Date(date).getTime();
      const closestPrice = data.data.reduce((closest, current) => {
        const currentDate = new Date(current.timestamp).getTime();
        const closestDate = new Date(closest.timestamp).getTime();
        
        return Math.abs(currentDate - targetDate) < Math.abs(closestDate - targetDate) 
          ? current 
          : closest;
      });

      const price = parseFloat(closestPrice.value);
      priceCache.set(cacheKey, price);
      return price;
    }
    
    return 0;
  } catch (error) {
    console.error('Error fetching historical price:', error);
    return 0;
  }
}

// Helper function to detect if a transaction is a swap
export function isSwapTransaction(transfers) {
  if (transfers.length !== 2) return false;
  
  const hasInflow = transfers.some(t => t.type === 'Inflow');
  const hasOutflow = transfers.some(t => t.type === 'Outflow');
  
  return hasInflow && hasOutflow;
}

// Calculate USD values for swap transactions
export function calculateSwapValues(transfers) {
  const outflow = transfers.find(t => t.type === 'Outflow');
  const inflow = transfers.find(t => t.type === 'Inflow');
  
  if (outflow && inflow) {
    const usdValue = parseFloat(outflow.amountInUSD);
    if (usdValue > 0) {
      // Set the same USD value for both sides of the swap
      outflow.amountInUSD = (-usdValue).toFixed(2);
      inflow.amountInUSD = usdValue.toFixed(2);
    }
  }
  
  return transfers;
}
