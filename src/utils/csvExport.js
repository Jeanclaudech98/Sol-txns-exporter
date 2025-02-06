export function exportToCsv(transactions) {
  const headers = [
    'Date',
    'Year',
    'Month',
    'Original Amount',
    'Original Currency',
    'Amount in Base Currency ($)',
    'Inflow/Outflow',
    'Description',
    'Transaction Hash',
    'Chain',
    'Wallet Address'
  ];

  const csvContent = [
    headers.join(','),
    ...transactions.map(tx => [
      tx.date,
      tx.year,
      tx.month,
      tx.originalAmount,
      tx.originalCurrency,
      tx.amountInUSD,
      tx.type,
      tx.description || 'Unknown Transaction',
      tx.txnHash,
      tx.chain,
      tx.walletAddress
    ].map(value => `"${value}"`).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `solana_transactions_${new Date().toISOString()}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
