// FILE: src/App.js (VERSION 13.0 - WITH TIKTOK ACCOUNT MANAGEMENT)

import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
    const [productName, setProductName] = useState('');
    const [productUrl, setProductUrl] = useState('');
    const [mood, setMood] = useState('Energetic');
    const [language, setLanguage] = useState('English');
    const [audioOption, setAudioOption] = useState('music'); // Changed to avoid voice API errors

    const [videoUrl, setVideoUrl] = useState('');
    const [script, setScript] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // TikTok Account Management State
    const [tiktokAccounts, setTiktokAccounts] = useState([]);
    const [selectedAccounts, setSelectedAccounts] = useState([]);
    const [newAccountName, setNewAccountName] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newUsername, setNewUsername] = useState('');
    const [uploadQueue, setUploadQueue] = useState([]);
    const [uploading, setUploading] = useState(false);

    // Load TikTok accounts on component mount
    useEffect(() => {
        loadTikTokAccounts();
        loadUploadQueue();
    }, []);

    const loadTikTokAccounts = async () => {
        try {
            const response = await fetch('http://localhost:3001/api/tiktok/accounts');
            const data = await response.json();
            if (data.success) {
                setTiktokAccounts(data.accounts);
            }
        } catch (err) {
            console.error('Failed to load TikTok accounts:', err);
        }
    };

    const loadUploadQueue = async () => {
        try {
            const response = await fetch('http://localhost:3001/api/tiktok/upload-queue');
            const data = await response.json();
            if (data.success) {
                setUploadQueue(data.queue);
            }
        } catch (err) {
            console.error('Failed to load upload queue:', err);
        }
    };

    const addTikTokAccount = async () => {
    if (!newAccountName || !newUsername || !newPassword) {
        alert('Please fill in account name, username, and password');
        return;
    }

        try {
            const response = await fetch('http://localhost:3001/api/tiktok/add-account', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
    account_name: newAccountName,
    username: newUsername,
    password: newPassword
})
            });

            const data = await response.json();
            if (data.success) {
                alert('✅ TikTok account added successfully!');
                setNewAccountName('');
                setNewUsername('');
                setNewPassword('');
                loadTikTokAccounts();
            } else {
                alert('❌ Error: ' + data.error);
            }
        } catch (err) {
            alert('❌ Failed to add account: ' + err.message);
        }
    };

    const removeTikTokAccount = async (accountId) => {
        if (!window.confirm('Are you sure you want to remove this account?')) return;

        try {
            const response = await fetch(`http://localhost:3001/api/tiktok/accounts/${accountId}`, {
                method: 'DELETE'
            });

            const data = await response.json();
            if (data.success) {
                alert('✅ Account removed successfully!');
                loadTikTokAccounts();
                // Remove from selected accounts if it was selected
                setSelectedAccounts(selectedAccounts.filter(id => id !== accountId));
            } else {
                alert('❌ Error: ' + data.error);
            }
        } catch (err) {
            alert('❌ Failed to remove account: ' + err.message);
        }
    };

    const handleAccountSelection = (accountId, isChecked) => {
        if (isChecked) {
            setSelectedAccounts([...selectedAccounts, accountId]);
        } else {
            setSelectedAccounts(selectedAccounts.filter(id => id !== accountId));
        }
    };

    const handleGenerateClick = async (event) => {
        event.preventDefault();
        if (!productName && !productUrl) {
            alert('Please provide a Product Name or a Product URL!');
            return;
        }

        setLoading(true);
        setVideoUrl('');
        setScript('');
        setError('');

        try {
            const response = await fetch('http://localhost:3001/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    productName, 
                    productUrl, 
                    mood, 
                    language: language.toLowerCase(), 
                    audioOption,
                    includeSubtitles: true
                }),
            });

            const data = await response.json();
            if (response.ok) {
                setVideoUrl(data.videoUrl);
                setScript(data.script);
            } else {
                setError(data.message || 'An error occurred.');
            }
        } catch (err) {
            setError('Failed to connect to the server. Is it running?');
        } finally {
            setLoading(false);
        }
    };

    const handleGenerateAndQueue = async (event) => {
        event.preventDefault();
        if (!productName && !productUrl) {
            alert('Please provide a Product Name or a Product URL!');
            return;
        }

        if (selectedAccounts.length === 0) {
            alert('Please select at least one TikTok account to queue upload!');
            return;
        }

        setLoading(true);
        setUploading(true);
        setVideoUrl('');
        setScript('');
        setError('');

        try {
            const response = await fetch('http://localhost:3001/api/generate-and-queue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productName,
                    productUrl,
                    mood,
                    audioOption,
                    accountIds: selectedAccounts,
                    autoQueue: true
                }),
            });

            const data = await response.json();
            if (response.ok) {
                setVideoUrl(data.videoUrl);
                setScript(data.script);
                alert(`✅ ${data.message}\n\nVideo generated and queued for ${data.queueResults.filter(r => r.success).length} TikTok accounts!`);
                loadUploadQueue(); // Refresh upload queue
            } else {
                setError(data.message || 'An error occurred.');
            }
        } catch (err) {
            setError('Failed to connect to the server. Is it running?');
        } finally {
            setLoading(false);
            setUploading(false);
        }
    };

    return (
        <div className="App">
            <div className="container">
                <header className="header-section">
                    <h1>🎬 AI TikTok Video Engine</h1>
                    <p>Generate videos and manage TikTok accounts automatically</p>
                </header>

                {/* TikTok Account Management */}
                <div className="accounts-section">
                    <h3>📱 TikTok Account Management</h3>
                    
                    <div className="add-account-container">
                        <input
                            type="text"
                            className="input-field"
                            placeholder="Account Display Name"
                            value={newAccountName}
                            onChange={(e) => setNewAccountName(e.target.value)}
                        />
                        <input
                            type="text"
                            className="input-field"
                            placeholder="@username"
                            value={newUsername}
                            onChange={(e) => setNewUsername(e.target.value)}
                        /><input
    type="password"
    className="input-field"
    placeholder="TikTok Password"
    value={newPassword}
    onChange={(e) => setNewPassword(e.target.value)}
/>
                        <button 
                            className="add-account-button"
                            onClick={addTikTokAccount}
                        >
                            Add Account
                        </button>
                    </div>

                    <div className="accounts-list">
                        <h4>Your TikTok Accounts ({tiktokAccounts.length}):</h4>
                        {tiktokAccounts.length === 0 ? (
                            <p>No TikTok accounts added yet. Add one above!</p>
                        ) : (
                            tiktokAccounts.map(account => (
                                <div key={account.id} className="account-item">
                                    <label className="account-checkbox">
                                        <input
                                            type="checkbox"
                                            checked={selectedAccounts.includes(account.id)}
                                            onChange={(e) => handleAccountSelection(account.id, e.target.checked)}
                                        />
                                        📱 {account.account_name} (@{account.username})
                                    </label>
                                    <button 
                                        className="remove-account-button"
                                        onClick={() => removeTikTokAccount(account.id)}
                                    >
                                        🗑️
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <form className="form-container">
                    <label htmlFor="productName">Product Name:</label>
                    <input 
                        id="productName" 
                        type="text" 
                        className="input-field" 
                        placeholder="e.g., 'Magic Glow Serum'" 
                        value={productName} 
                        onChange={(e) => setProductName(e.target.value)} 
                    />
                    
                    <p className="or-text">- OR -</p>
                    
                    <label htmlFor="productUrl">Product URL:</label>
                    <input 
                        id="productUrl" 
                        type="text" 
                        className="input-field" 
                        placeholder="e.g., Shopify or Amazon link" 
                        value={productUrl} 
                        onChange={(e) => setProductUrl(e.target.value)} 
                    />

                    <div className="options-grid">
                        <div>
                            <label htmlFor="mood">Video Mood:</label>
                            <select 
                                id="mood" 
                                value={mood} 
                                onChange={(e) => setMood(e.target.value)} 
                                className="select-field"
                            >
                                <option value="energetic">✨ Energetic & Fun</option>
                                <option value="funny">😂 Funny</option>
                                <option value="trendy">💖 Trendy</option>
                                <option value="exciting">🚀 Exciting</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="language">Voice Language:</label>
                            <select 
                                id="language" 
                                value={language} 
                                onChange={(e) => setLanguage(e.target.value)} 
                                className="select-field"
                            >
                                <option value="english">English</option>
                                <option value="indonesian">Indonesian</option>
                            </select>
                        </div>
                    </div>
                    
                    <div className="audio-options-container">
                        <label htmlFor="audioOption">Audio Choice:</label>
                        <select 
                            id="audioOption" 
                            value={audioOption} 
                            onChange={(e) => setAudioOption(e.target.value)} 
                            className="select-field"
                        >
                            <option value="music">🎵 Background Music Only</option>
                            <option value="voice+music">🎤 AI Voice + Music</option>
                            <option value="voice">🗣️ AI Voice Only</option>
                        </select>
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button 
                            type="button"
                            className="generate-button" 
                            disabled={loading}
                            onClick={handleGenerateClick}
                            style={{ flex: 1 }}
                        >
                            {loading && !uploading ? '⚙️ Building Video...' : '✨ Generate Video Only'}
                        </button>
                        
                        <button 
                            type="button"
                            className="upload-button" 
                            disabled={loading || selectedAccounts.length === 0}
                            onClick={handleGenerateAndQueue}
                            style={{ flex: 1 }}
                        >
                            {uploading ? '📤 Generating & Queueing...' : `🚀 Generate + Queue (${selectedAccounts.length} accounts)`}
                        </button>
                    </div>
                </form>

                {error && <div className="error-message">{error}</div>}

                {videoUrl && (
                    <div className="results-container">
                        <div className="video-container">
                            <h2>🎥 Generated Video:</h2>
                            <video controls width="100%" autoPlay key={videoUrl}>
                                <source src={videoUrl} type="video/mp4" />
                            </video>
                            <div style={{ textAlign: 'center', marginTop: '15px' }}>
                                <a 
                                    href={videoUrl} 
                                    download={`tiktok-video-${Date.now()}.mp4`} 
                                    className="generate-button"
                                    style={{ display: 'inline-block', textDecoration: 'none', width: 'auto', padding: '12px 24px' }}
                                >
                                    ⬇️ Download Video
                                </a>
                            </div>
                        </div>
                        
                        <div className="script-container">
                            <h2>📝 Generated Script:</h2>
                            <pre className="script-box">{script}</pre>
                        </div>

                        {selectedAccounts.length > 0 && (
                            <div className="publish-section">
                                <h3>📤 Upload Status</h3>
                                <p>Video queued for {selectedAccounts.length} TikTok account(s)</p>
                                <p><strong>Note:</strong> Videos are queued for manual upload to your TikTok accounts.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Upload Queue Display */}
                {uploadQueue.length > 0 && (
                    <div className="accounts-section">
                        <h3>📋 Upload Queue ({uploadQueue.length} videos)</h3>
                        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                            {uploadQueue.slice(0, 10).map(item => (
                                <div key={item.id} className="account-item">
                                    <div>
                                        <strong>📹 {item.product_name}</strong> → @{item.username}
                                        <br />
                                        <small style={{ color: '#666' }}>
                                            {new Date(item.created_at).toLocaleString()} - 
                                            <span style={{ 
                                                color: item.upload_status === 'ready' ? 'green' : 
                                                       item.upload_status === 'queued' ? 'orange' : 'red',
                                                fontWeight: 'bold',
                                                marginLeft: '5px'
                                            }}>
                                                {item.upload_status.toUpperCase()}
                                            </span>
                                        </small>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button 
                            className="add-account-button"
                            onClick={loadUploadQueue}
                            style={{ width: '100%', marginTop: '10px' }}
                        >
                            🔄 Refresh Queue
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;