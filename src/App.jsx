import React, { useState } from 'react';
import AddressForm from './components/AddressForm';
import TransactionList from './components/TransactionList';
import './App.css';

function App() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  return (
    <div className="app">
      <h1>Solana Transaction Exporter</h1>
      <AddressForm 
        setTransactions={setTransactions}
        setLoading={setLoading}
        setError={setError}
      />
      <TransactionList 
        transactions={transactions}
        loading={loading}
        error={error}
      />
    </div>
  );
}

export default App;
