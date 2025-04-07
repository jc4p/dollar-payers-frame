import axios from 'axios';

// Single key for cache
const CACHE_KEY = 'current-logs';

// Simple cache functions
async function getFromCache() {
  try {
    const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const cfKvBinding = process.env.CLOUDFLARE_KV_BINDING;
    const cfToken = process.env.CLOUDFLARE_KV_TOKEN;
    
    if (!cfAccountId || !cfKvBinding || !cfToken) {
      console.log("Cloudflare KV credentials not configured");
      return null;
    }
    
    console.log("Checking cache for data");
    
    const url = `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/storage/kv/namespaces/${cfKvBinding}/values/${CACHE_KEY}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${cfToken}`
      }
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log("No cached data found");
        return null;
      }
      throw new Error(`Failed to get cached data: ${response.status}`);
    }
    
    const data = await response.text();
    try {
      return JSON.parse(data);
    } catch (e) {
      console.log("Cache data is not valid JSON");
      return null;
    }
  } catch (error) {
    console.error("Error getting cached data:", error.message);
    return null;
  }
}

async function setToCache(data) {
  try {
    const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const cfKvBinding = process.env.CLOUDFLARE_KV_BINDING;
    const cfToken = process.env.CLOUDFLARE_KV_TOKEN;
    
    if (!cfAccountId || !cfKvBinding || !cfToken) {
      console.log("Cloudflare KV credentials not configured");
      return false;
    }
    
    console.log("Caching data");
    
    // 15 minutes expiration
    const expirationTtl = 900;
    const url = `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/storage/kv/namespaces/${cfKvBinding}/values/${CACHE_KEY}?expiration_ttl=${expirationTtl}`;
    
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${cfToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      throw new Error(`Failed to cache data: ${response.status}`);
    }
    
    console.log("Data cached successfully for 15 minutes");
    return true;
  } catch (error) {
    console.error("Error caching data:", error.message);
    return false;
  }
}

// Helper function to fetch Farcaster profile by ETH address
async function getFarcasterProfile(address) {
  try {
    const apiKey = process.env.NEYNAR_API_KEY;
    if (!apiKey) {
      console.error("Neynar API key not configured");
      return null;
    }
    
    const response = await axios.get(
      `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${address}&address_types=verified_address`,
      {
        headers: {
          'accept': 'application/json',
          'x-api-key': apiKey
        }
      }
    );
    
    const lowerAddress = address.toLowerCase();
    const data = response.data;
    
    if (data && data[lowerAddress] && data[lowerAddress].length > 0) {
      const user = data[lowerAddress][0];
      return {
        username: user.username,
        display_name: user.display_name,
        pfp_url: user.pfp_url,
        fid: user.fid
      };
    }
    
    return null;
  } catch (error) {
    console.error(`Error fetching Farcaster profile for ${address}: ${error.message}`);
    return null;
  }
}

// Helper function to get USDC balance of address
async function getUSDCBalance(rpcUrl, contractAddress, usdcAddress) {
  // Retry mechanism as this call sometimes fails
  const maxRetries = 3;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // USDC balanceOf function signature: 0x70a08231
      // Add the address padded to 32 bytes
      const cleanAddress = contractAddress.toLowerCase().replace(/^0x/, '');
      const data = `0x70a08231000000000000000000000000${cleanAddress}`;
      
      const response = await axios.post(rpcUrl, {
        jsonrpc: '2.0',
        id: 5,
        method: 'eth_call',
        params: [
          {
            to: usdcAddress,
            data: data
          },
          'latest'
        ]
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.data && response.data.result) {
        // Convert hex string to decimal and account for 6 decimals (USDC has 6 decimals)
        const balanceHex = response.data.result;
        const balanceWei = parseInt(balanceHex, 16);
        const balanceUSDC = balanceWei / 1000000; // USDC has 6 decimals
        return balanceUSDC;
      }
      
      console.log(`Balance call attempt ${attempt} failed, retrying...`);
    } catch (error) {
      if (attempt === maxRetries) {
        console.error('Error fetching USDC balance after multiple retries:', error.message);
      } else {
        console.log(`Balance call attempt ${attempt} failed, retrying...`);
      }
    }
  }
  
  return 0;
}

export async function GET(request) {
  try {
    // Check for cache bust parameter
    const requestUrl = new URL(request.url);
    const bustCache = requestUrl.searchParams.has('bust');
    
    let cachedData = null;
    
    if (bustCache) {
      console.log("Cache bust requested, skipping cache");
    } else {
      // Try to get data from cache first
      cachedData = await getFromCache();
      
      if (cachedData) {
        console.log("Using cached data");
        // Mark the data as cached and include the original cache timestamp
        const responseData = {
          ...cachedData,
          cached: true
        };
        // Adding Cache-Control header to ensure browser doesn't cache
        const headers = {
          'Cache-Control': 'no-store, max-age=0, must-revalidate'
        };
        return Response.json(responseData, { headers });
      }
    }
    
    console.log("Cache miss, fetching fresh data");
    
    // Get API key from environment variables or use default from RPC URL
    const rpcUrl = process.env.ALCHEMY_BASE_RPC_URL;
    
    if (!rpcUrl) {
      return Response.json(
        { error: "Alchemy RPC URL not configured" },
        { status: 500 }
      );
    }

    // Alchemy Base RPC URL
    const url = rpcUrl;

    // Contract addresses and event signature
    const targetAddress = "0xAc37dFbef27CAbBbF4f5c0a655B89303F1FB4dcA"; // Target contract
    const usdcAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC contract
    const transferEventSignature = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"; // Transfer event
    
    // Calculate timestamp for looking back 7 days
    const now = Math.floor(Date.now() / 1000);
    const sevenDaysAgo = now - (7 * 24 * 60 * 60);

    // Get the latest block number
    console.log(`Making RPC request to ${url}`);
    const blockNumberResponse = await axios.post(url, {
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_blockNumber',
      params: []
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const latestBlockHex = blockNumberResponse.data.result;
    const latestBlock = parseInt(latestBlockHex, 16);
    
    // Looking back ~50000 blocks (approx 3-4 days on Base at 2 sec blocks)
    // Use a smaller number if you encounter performance issues
    const fromBlock = Math.max(0, latestBlock - 50000);
    
    console.log(`Fetching transactions to ${targetAddress} from block ${fromBlock} (0x${fromBlock.toString(16)}) to ${latestBlock} (${latestBlockHex})`);
    
    // Step 1: Get transfer logs from USDC contract where target is recipient
    const txResponse = await axios.post(url, {
      jsonrpc: '2.0',
      id: 2,
      method: 'eth_getLogs',
      params: [{
        // Look for Transfer events from USDC where target is recipient
        toBlock: 'latest',
        fromBlock: `0x${fromBlock.toString(16)}`,
        address: usdcAddress,
        topics: [
          transferEventSignature, 
          null,
          `0x000000000000000000000000${targetAddress.slice(2)}`
        ]
      }]
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    // Extract unique transaction hashes
    const logs = txResponse.data.result || [];
    console.log(`Found ${logs.length} logs in range`);
    
    // Transfer logs are already filtered by our query parameters
    const filteredLogs = logs;
    console.log(`All ${filteredLogs.length} logs match our transfer criteria`);
    
    // Get unique transaction hashes
    const txHashes = [...new Set(filteredLogs.map(log => log.transactionHash))];
    console.log(`Found ${txHashes.length} unique transactions`);
    
    // Step 3: Get transaction details and organize results
    const blockTimestamps = {};
    const transferDetails = [];
    
    // Limit to 250 transactions to include more history while avoiding timeouts
    const limitedTxHashes = txHashes.slice(0, 250);
    
    for (const txHash of limitedTxHashes) {
      try {
        // Get transaction details
        const txResponse = await axios.post(url, {
          jsonrpc: '2.0',
          id: 3,
          method: 'eth_getTransactionByHash',
          params: [txHash]
        }, {
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        const tx = txResponse.data.result;
        if (!tx) continue;
        
        // Get block info for timestamp
        const blockNumber = tx.blockNumber;
        
        if (!blockTimestamps[blockNumber]) {
          const blockResponse = await axios.post(url, {
            jsonrpc: '2.0',
            id: 4,
            method: 'eth_getBlockByNumber',
            params: [blockNumber, false]
          }, {
            headers: {
              'Content-Type': 'application/json'
            }
          });
          
          const block = blockResponse.data.result;
          if (block && block.timestamp) {
            blockTimestamps[blockNumber] = parseInt(block.timestamp, 16);
          }
        }
        
        const timestamp = blockTimestamps[blockNumber];
        
        // Check if this transaction is within our time range
        if (timestamp && timestamp >= sevenDaysAgo) {
          // For ERC-20 transfers, we need to extract the sender from the topics
          // The sender is in the first topic after the event signature (topics[1])
          const log = filteredLogs.find(l => l.transactionHash === txHash);
          const from_address = log ? `0x${log.topics[1].slice(26).toLowerCase()}` : tx.from.toLowerCase();
          
          transferDetails.push({
            from_address,
            timestamp: new Date(timestamp * 1000).toISOString(),
            transaction_hash: txHash
          });
        }
      } catch (error) {
        console.error(`Error processing transaction ${txHash}: ${error.message}`);
        continue;
      }
    }

    // Sort transfers by timestamp (most recent first)
    transferDetails.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Get current USDC balance of the contract
    const contractBalance = await getUSDCBalance(url, targetAddress, usdcAddress);

    // Create a map to track unique contributors and their total contributions
    const uniqueContributors = new Map();
    
    // Group by contributor address and tally up their contributions
    // Note: In a real app, we'd analyze transaction amounts, but here we're just counting transactions
    for (const transfer of transferDetails) {
      const address = transfer.from_address.toLowerCase();
      const count = uniqueContributors.get(address) || 0;
      uniqueContributors.set(address, count + 1);
    }
    
    // Convert to array for sorting - most frequent contributors first
    const contributorRankings = Array.from(uniqueContributors.entries())
      .map(([address, count]) => ({ address, count }))
      .sort((a, b) => {
        // First by count descending
        if (b.count !== a.count) return b.count - a.count;
        // Then by address for stable sort
        return a.address.localeCompare(b.address);
      });
    
    // Add rank to each transfer
    // For individual transfers, we're ranking by recency (most recent is #1)
    // We want the first item in the sorted list to be #N, and the last to be #1
    const totalTransfers = transferDetails.length;
    
    transferDetails.forEach((transfer, index) => {
      // Calculate reverse rank (most recent = highest rank number)
      const recencyRank = totalTransfers - index;
      
      // For consistency we also include contributor rank info
      const address = transfer.from_address.toLowerCase();
      const rankObj = contributorRankings.find(r => r.address === address);
      const contributorRank = rankObj ? contributorRankings.indexOf(rankObj) + 1 : null;
      
      transfer.rank = {
        position: recencyRank, // This is now based on recency (descending)
        contributorRank: contributorRank, // Keep the original contributor rank
        total: totalTransfers,
        count: uniqueContributors.get(address) || 1
      };
    });

    // For each transfer, fetch Farcaster profile if available
    for (const transfer of transferDetails) {
      const profile = await getFarcasterProfile(transfer.from_address);
      if (profile) {
        transfer.farcaster = profile;
      }
    }
    
    // Prepare response data
    const responseData = {
      balance: contractBalance,
      transfers: transferDetails,
      rankings: contributorRankings,
      cached: false,
      cachedAt: new Date().toISOString()
    };
    
    // Cache the final result - this is the only thing we're caching
    await setToCache(responseData);
    
    // Adding Cache-Control header to ensure browser doesn't cache
    const headers = {
      'Cache-Control': 'no-store, max-age=0, must-revalidate'
    };
    return Response.json(responseData, { headers });
  } catch (error) {
    console.error("Error fetching transfer logs:", error);
    return Response.json(
      { error: `Failed to fetch transfer logs: ${error.message}` },
      { status: 500 }
    );
  }
}