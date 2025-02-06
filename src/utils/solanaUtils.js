import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { format, parseISO, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { getTokenSymbol, getHistoricalPrice, isSwapTransaction, calculateSwapValues } from './tokenUtils';

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=f29148cc-d664-496c-8fdd-76ca11455b07', {
  commitment: 'confirmed',
  confirmTransactionInitialTimeout: 60000,
  wsEndpoint: undefined
});

const MIN_SOL_AMOUNT = 0.001;
const MIN_TOKEN_AMOUNT = 0.00001;

function extractWalletAddresses(tx, userAddress) {
  try {
    const accountKeys = tx.transaction.message.accountKeys;
    const instructions = tx.transaction.message.instructions;
    const innerInstructions = tx.meta.innerInstructions || [];

    const allInstructions = [
      ...instructions,
      ...innerInstructions.flatMap(inner => inner.instructions)
    ];

    for (const ix of allInstructions) {
      // Handle system transfer (SOL)
      if (ix.program === 'system' && ix.parsed?.type === 'transfer') {
        return {
          sourceWallet: ix.parsed.info.source,
          destinationWallet: ix.parsed.info.destination
        };
      }

      // Handle SPL token transfer
      if (ix.program === 'spl-token' && (ix.parsed?.type === 'transfer' || ix.parsed?.type === 'transferChecked')) {
        const sourcePubkey = ix.parsed.info.source;
        const destPubkey = ix.parsed.info.destination;

        let sourceOwner = 'Unknown';
        let destOwner = 'Unknown';

        // Find source token account index
        const sourceIndex = accountKeys.findIndex(acc => acc.pubkey.toString() === sourcePubkey);
        if (sourceIndex !== -1) {
          const sourceBalance = (tx.meta.preTokenBalances || []).concat(tx.meta.postTokenBalances || [])
            .find(b => b.accountIndex === sourceIndex);
          if (sourceBalance) sourceOwner = sourceBalance.owner;
        }

        // Find destination token account index
        const destIndex = accountKeys.findIndex(acc => acc.pubkey.toString() === destPubkey);
        if (destIndex !== -1) {
          const destBalance = (tx.meta.preTokenBalances || []).concat(tx.meta.postTokenBalances || [])
            .find(b => b.accountIndex === destIndex);
          if (destBalance) destOwner = destBalance.owner;
        }

        return {
          sourceWallet: sourceOwner,
          destinationWallet: destOwner
        };
      }
    }

    // Fallback logic if no transfer instructions found
    const userAddressLower = userAddress.toLowerCase();
    const nonUserKeys = accountKeys.filter(key => 
      key.pubkey.toString().toLowerCase() !== userAddressLower
    );

    if (nonUserKeys.length >= 2) {
      return {
        sourceWallet: nonUserKeys[0].pubkey.toString(),
        destinationWallet: nonUserKeys[1].pubkey.toString()
      };
    }

    return {
      sourceWallet: accountKeys[0]?.pubkey.toString() || 'Unknown',
      destinationWallet: accountKeys[accountKeys.length - 1]?.pubkey.toString() || 'Unknown'
    };

  } catch (error) {
    console.error('Error extracting wallet addresses:', error);
    return { sourceWallet: 'Unknown', destinationWallet: 'Unknown' };
  }
}



function determineDescription(transfers, address, tx) {
  // Extract wallet addresses from the transaction
  const { sourceWallet, destinationWallet } = extractWalletAddresses(tx, address);

  // If it's a swap transaction
  if (transfers.length === 2) {
    const solTransfer = transfers.find(t => t.originalCurrency === 'SOL');
    const tokenTransfer = transfers.find(t => t.originalCurrency !== 'SOL');

    if (solTransfer && tokenTransfer) {
      if (solTransfer.type === 'Outflow') {
        return `Converting SOL to ${tokenTransfer.originalCurrency}`;
      } else {
        return `Liquidating ${tokenTransfer.originalCurrency} to SOL`;
      }
    }
  }

  // If it's a single transfer
  if (transfers.length === 1) {
    const transfer = transfers[0];
    
    // Determine description based on transfer type
    if (transfer.type === 'Outflow') {
      return `Transfer to Wallet ${destinationWallet}`;
    } else {
      return `Reception from Wallet ${sourceWallet}`;
    }
  }

  // Default description if no specific type is found
  return 'Unknown Transaction';
}

async function parseTransaction(tx, address) {
  const parsedTx = new Set();
  
  if (!tx?.meta || !tx?.transaction) return [];

  try {
    const userAddress = address.toLowerCase();
    
    // Handle token transfers
    if (tx.meta.preTokenBalances || tx.meta.postTokenBalances) {
      const preBalances = new Map(
        tx.meta.preTokenBalances?.map(balance => [
          `${balance.accountIndex}-${balance.mint}`,
          BigInt(balance.uiTokenAmount.amount)
        ]) || []
      );

      for (const balance of tx.meta.postTokenBalances || []) {
        const key = `${balance.accountIndex}-${balance.mint}`;
        const preBalance = preBalances.get(key) || BigInt(0);
        const postBalance = BigInt(balance.uiTokenAmount.amount);
        const difference = Number(postBalance - preBalance);

        if (difference !== 0 && balance.owner.toLowerCase() === userAddress) {
          const amount = Math.abs(difference) / Math.pow(10, balance.uiTokenAmount.decimals);
          if (amount >= MIN_TOKEN_AMOUNT) {
            const symbol = await getTokenSymbol(balance.mint);
            parsedTx.add(JSON.stringify({
              amount: difference > 0 ? amount : -amount,
              currency: symbol,
              type: difference > 0 ? 'Inflow' : 'Outflow',
              decimals: balance.uiTokenAmount.decimals,
              mint: balance.mint
            }));
          }
        }
      }
    }

    // Handle SOL transfers
    const accountIndex = tx.transaction.message.accountKeys.findIndex(
      key => key.pubkey.toString().toLowerCase() === userAddress
    );

    if (accountIndex !== -1) {
      const preBalance = tx.meta.preBalances[accountIndex];
      const postBalance = tx.meta.postBalances[accountIndex];
      const difference = postBalance - preBalance;
      const amount = Math.abs(difference) / LAMPORTS_PER_SOL;

      if (amount >= MIN_SOL_AMOUNT) {
        parsedTx.add(JSON.stringify({
          amount: difference > 0 ? amount : -amount,
          currency: 'SOL',
          type: difference > 0 ? 'Inflow' : 'Outflow',
          decimals: 9,
          mint: 'SOL'
        }));
      }
    }

    return Array.from(parsedTx).map(item => JSON.parse(item));
  } catch (error) {
    console.error('Error parsing transaction:', error);
    return [];
  }
}

export async function fetchTransactions(address, startDate, endDate) {
  try {
    const pubKey = new PublicKey(address);
    
    const signatures = await connection.getSignaturesForAddress(
      pubKey,
      { limit: 1000 },
      'confirmed'
    );

    if (!signatures.length) {
      throw new Error('No transactions found for this address');
    }

    const start = startOfDay(parseISO(startDate));
    const end = endOfDay(parseISO(endDate));

    const filteredSignatures = signatures.filter(sig => {
      if (!sig.blockTime) return false;
      const txDate = new Date(sig.blockTime * 1000);
      return isWithinInterval(txDate, { start, end });
    });

    if (!filteredSignatures.length) {
      throw new Error('No transactions found in the selected date range');
    }

    const transactions = [];
    const processedTxs = new Set();

    const batchSize = 3;
    for (let i = 0; i < filteredSignatures.length; i += batchSize) {
      const batch = filteredSignatures.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (sig) => {
        try {
          const tx = await connection.getParsedTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed'
          });
          
          if (!tx) return;

          const parsedTransfers = await parseTransaction(tx, address);
          if (parsedTransfers.length === 0) return;

          const date = new Date(sig.blockTime * 1000);
          const txTransfers = [];

          for (const transfer of parsedTransfers) {
            const transferKey = `${sig.signature}-${transfer.currency}-${transfer.amount}-${transfer.type}`;
            
            if (!processedTxs.has(transferKey)) {
              processedTxs.add(transferKey);
              
              const price = await getHistoricalPrice(transfer.currency, date);
              const amountInUSD = price * Math.abs(transfer.amount);

              txTransfers.push({
                date: format(date, 'yyyy-MM-dd'),
                year: date.getFullYear(),
                month: date.getMonth() + 1,
                originalAmount: transfer.amount.toString(),
                originalCurrency: transfer.currency,
                amountInUSD: amountInUSD.toFixed(2),
                type: transfer.type,
                txnHash: sig.signature,
                chain: 'Solana',
                walletAddress: address
              });
            }
          }

          // Determine description for the transaction
          const description = determineDescription(txTransfers, address, tx);
          
          // Add description to each transfer
          const transfersWithDescription = txTransfers.map(transfer => ({
            ...transfer,
            description
          }));

          if (isSwapTransaction(txTransfers)) {
            transactions.push(...calculateSwapValues(transfersWithDescription));
          } else {
            transactions.push(...transfersWithDescription);
          }
        } catch (err) {
          console.error(`Error processing transaction ${sig.signature}:`, err);
        }
      }));

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const validTransactions = transactions
      .filter(tx => tx !== null && Math.abs(parseFloat(tx.originalAmount)) > 0)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    if (!validTransactions.length) {
      throw new Error('No valid transactions found in the selected date range');
    }

    return validTransactions;
  } catch (error) {
    console.error('Fetch error:', error);
    throw new Error(
      error.message.includes('429') 
        ? 'Rate limit exceeded. Please try again in a few minutes.' 
        : `Failed to fetch transactions: ${error.message}`
    );
  }
}
