"use client";

import { useEffect, useState, useCallback } from "react";
import styles from "./TransferTable.module.css";
import * as frame from '@farcaster/frame-sdk';

export default function TransferTable() {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  const [balance, setBalance] = useState(0);
  const [uniqueUsers, setUniqueUsers] = useState({ total: 0, farcaster: 0 });
  const [data, setData] = useState(null);
  
  // Function to view a Farcaster profile
  const viewProfile = useCallback(async (fid) => {
    try {
      if (frame && frame.sdk && frame.sdk.actions) {
        await frame.sdk.actions.viewProfile({ fid });
      } else {
        console.log('Frame SDK not available or not in frame context');
        // Fallback for non-frame environments
        window.open(`https://warpcast.com/~/profiles/${fid}`, '_blank');
      }
    } catch (error) {
      console.error('Error opening profile:', error);
    }
  }, []);

  // Function to refresh data (with cache busting)
  const refreshData = async (bustCache = false) => {
    try {
      setLoading(true);
      setError(null);
      
      const url = bustCache ? "/api/transfers?bust=1" : "/api/transfers";
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`HTTP error! Status: ${response.status}. ${errorData.error || ''}`);
      }
      const responseData = await response.json();
      setData(responseData);
      setTransfers(responseData.transfers);
      setBalance(responseData.balance);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    const fetchTransfers = async () => {
      await refreshData(false);
    };

    fetchTransfers();
  }, []);
  
  // Update unique users count whenever transfers changes
  useEffect(() => {
    if (transfers && transfers.length > 0) {
      // Count unique addresses
      const uniqueAddresses = new Set(transfers.map(t => t.from_address.toLowerCase()));
      
      // Count unique Farcaster users
      const farcasterUsers = transfers
        .filter(t => t.farcaster && t.farcaster.fid)
        .map(t => t.farcaster.fid);
      const uniqueFarcasterUsers = new Set(farcasterUsers);
      
      setUniqueUsers({
        total: uniqueAddresses.size,
        farcaster: uniqueFarcasterUsers.size
      });
    }
  }, [transfers]);

    // Set up automatic retry if there's an error
  useEffect(() => {
    let retryTimer;
    if (error && retryCount < 3) {
      retryTimer = setTimeout(() => {
        setRetryCount(prev => prev + 1);
        refreshData(false); // Try again without cache busting
      }, 5000);
    }

    return () => {
      clearTimeout(retryTimer);
    };
  }, [error, retryCount]);
  
  // Add a refresh button
  const handleRefresh = () => {
    refreshData(true); // Force refresh with cache busting
    setRetryCount(0); // Reset retry count
  };

  if (loading) return <div className={styles.loadingContainer}></div>;
  if (error) return <div>Error loading transfers: {error}</div>;

  return (
    <div>
      <div className={styles.balanceContainer}>
        <div className={styles.headerRow}>
          <h2>Contract USDC Balance: <span className={styles.balance}>${balance.toLocaleString()}</span></h2>
          <button onClick={handleRefresh} className={styles.refreshButton} title="Refresh data">
            ↻
          </button>
        </div>
        <div className={styles.statsContainer}>
          <div className={styles.stats}>
            <span className={styles.statLabel}>Total Unique Contributors:</span> {uniqueUsers.total}
            {uniqueUsers.farcaster > 0 && (
              <span className={styles.statDetail}>
                ({uniqueUsers.farcaster} Farcaster {uniqueUsers.farcaster === 1 ? 'user' : 'users'})
              </span>
            )}
          </div>
          <div className={styles.timestampContainer}>
            <div className={styles.timestamp}>
              As of {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} {new Date().toLocaleDateString([], {month: '2-digit', day: '2-digit', year: 'numeric'})}
            </div>
            {data?.cached && data?.cachedAt && (
              <div className={styles.cacheStatus}>
                (Cached data from {new Date(data.cachedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className={styles.tableContainer}>
        <table className={styles.transferTable}>
          <thead>
            <tr>
              <th>Rank</th>
              <th>From</th>
              <th>Address</th>
              <th>Timestamp</th>
              <th>Transaction</th>
            </tr>
          </thead>
          <tbody>
            {transfers.length > 0 ? (
              transfers.map((transfer, index) => (
                <tr key={index}>
                  <td className={styles.rankCell}>
                    {transfer.rank && (
                      <div className={styles.rank}>
                        <span className={styles.rankPosition}>#{transfer.rank.position}</span>
                        {transfer.rank.count > 1 && (
                          <span className={styles.rankCount}>({transfer.rank.count})</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className={styles.profileCell}>
                    {transfer.farcaster ? (
                      <div 
                        className={styles.profile} 
                        onClick={() => transfer.farcaster.fid && viewProfile(transfer.farcaster.fid)}
                        style={{ cursor: transfer.farcaster.fid ? 'pointer' : 'default' }}
                      >
                        {transfer.farcaster.pfp_url && (
                          <img 
                            src={transfer.farcaster.pfp_url} 
                            alt={transfer.farcaster.username || 'Profile'}
                            className={styles.avatar}
                          />
                        )}
                        <div className={styles.profileInfo}>
                          <div className={styles.displayName}>{transfer.farcaster.display_name || 'Unknown'}</div>
                          {transfer.farcaster.username && (
                            <div className={styles.username}>@{transfer.farcaster.username}</div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className={styles.shortAddress}>
                        {transfer.from_address.substring(0, 6)}...{transfer.from_address.substring(38)}
                      </span>
                    )}
                  </td>
                  <td className={styles.addressCell}>
                    <span className={styles.address}>{transfer.from_address}</span>
                  </td>
                  <td className={styles.timestampCell}>
                    {new Date(transfer.timestamp).toLocaleString([], {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </td>
                  <td>
                    <a 
                      href={`https://basescan.org/tx/${transfer.transaction_hash}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                    >
                      View
                    </a>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5">No transfers found in the specified time period</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}