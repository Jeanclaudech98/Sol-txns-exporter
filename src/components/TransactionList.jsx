import React from 'react';
import { exportToCsv } from '../utils/csvExport';

function TransactionList({ transactions, loading, error }) {
  if (loading) return <div className="loading">Loading transactions...</div>;
  if (error) return <div className="error">{error}</div>;
  
  return (
    <div className="transaction-list">
      {transactions.length > 0 && (
        <>
          <button onClick={() => exportToCsv(transactions)} className="export-btn">
            Export to CSV
          </button>
          <div className="transactions-preview">
            <h3>Preview ({transactions.length} transactions)</h3>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Currency</th>
                  <th>USD Value</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Hash</th>
                </tr>
              </thead>
              <tbody>
                {transactions.slice(0, 5).map((tx) => (
                  <tr key={tx.txnHash}>
                    <td>{tx.date}</td>
                    <td>{parseFloat(tx.originalAmount).toLocaleString(undefined, {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 6
                    })}</td>
                    <td>{tx.originalCurrency}</td>
                    <td>${parseFloat(tx.amountInUSD).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}</td>
                    <td className={tx.type.toLowerCase()}>{tx.type}</td>
                    <td>{tx.description || 'Unknown Transaction'}</td>
                    <td>
                      <a 
                        href={`https://solscan.io/tx/${tx.txnHash}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                      >
                        {tx.txnHash.slice(0, 10)}...
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default TransactionList;
