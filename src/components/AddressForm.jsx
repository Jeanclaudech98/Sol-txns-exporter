import React, { useState } from 'react';
import { fetchTransactions } from '../utils/solanaUtils';

function AddressForm({ setTransactions, setLoading, setError }) {
  const [address, setAddress] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      if (!address) {
        throw new Error('Please enter a valid Solana address');
      }
      console.log('Submitting form with:', { address, startDate, endDate });
      const txns = await fetchTransactions(address, startDate, endDate);
      setTransactions(txns);
    } catch (err) {
      console.error('Form submission error:', err);
      setError(err.message);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="address-form">
      <div className="form-group">
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Enter Solana Address"
          required
          className="address-input"
        />
      </div>
      <div className="form-group date-inputs">
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          required
          className="date-input"
        />
        <span>to</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          required
          className="date-input"
        />
      </div>
      <button type="submit">Fetch Transactions</button>
    </form>
  );
}

export default AddressForm;
