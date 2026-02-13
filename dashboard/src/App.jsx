import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ShoppingBag, Trash2, ExternalLink, RefreshCw, Plus } from 'lucide-react';

function App() {
    const [stores, setStores] = useState([]);
    const [loading, setLoading] = useState(false);
    const [newStoreName, setNewStoreName] = useState('');
    const [newStoreType, setNewStoreType] = useState('woocommerce');

    const fetchStores = async () => {
        try {
            const res = await axios.get('/api/stores');
            setStores(res.data);
        } catch (err) {
            console.error("Failed to fetch stores", err);
        }
    };

    useEffect(() => {
        fetchStores();
        const interval = setInterval(fetchStores, 5000);
        return () => clearInterval(interval);
    }, []);

    const createStore = async (e) => {
        e.preventDefault();
        if (!newStoreName) return;

        setLoading(true);
        try {
            await axios.post('/api/stores', {
                name: newStoreName,
                type: newStoreType
            });
            setNewStoreName('');
            fetchStores();
        } catch (err) {
            alert('Failed to create store');
        } finally {
            setLoading(false);
        }
    };

    const deleteStore = async (id) => {
        if (!confirm('Are you sure you want to delete this store?')) return;
        try {
            await axios.delete(`/api/stores/${id}`);
            fetchStores();
        } catch (err) {
            alert('Failed to delete store');
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'READY': return 'bg-green-100 text-green-800';
            case 'PROVISIONING': return 'bg-yellow-100 text-yellow-800';
            case 'FAILED': return 'bg-red-100 text-red-800';
            case 'DELETING': return 'bg-gray-100 text-gray-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <div className="min-h-screen p-8">
            <div className="max-w-6xl mx-auto">

                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                        <ShoppingBag className="w-8 h-8 text-blue-600" />
                        <h1 className="text-2xl font-bold">Store Provisioning Platform</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">Auto-refreshing</span>
                        <RefreshCw className="w-4 h-4 text-gray-400 animate-spin-slow" />
                    </div>
                </div>

                {/* Create Store Card */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-8">
                    <h2 className="text-lg font-semibold mb-4">Create New Store</h2>
                    <form onSubmit={createStore} className="flex gap-4 items-end">
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Store Name</label>
                            <input
                                type="text"
                                value={newStoreName}
                                onChange={(e) => setNewStoreName(e.target.value)}
                                placeholder="e.g. my-awesome-shop"
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                pattern="[a-z0-9-]+"
                                title="Lowercase letters, numbers, and hyphens only"
                            />
                        </div>
                        <div className="w-48">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                            <select
                                value={newStoreType}
                                onChange={(e) => setNewStoreType(e.target.value)}
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            >
                                <option value="woocommerce">WooCommerce</option>
                                <option value="medusa">Medusa (Stub)</option>
                            </select>
                        </div>
                        <button
                            type="submit"
                            disabled={loading || !newStoreName}
                            className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" />
                            {loading ? 'Provisioning...' : 'Create Store'}
                        </button>
                    </form>
                </div>

                {/* Store List */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="px-6 py-4 font-medium text-gray-500">Store Name</th>
                                <th className="px-6 py-4 font-medium text-gray-500">Type</th>
                                <th className="px-6 py-4 font-medium text-gray-500">Status</th>
                                <th className="px-6 py-4 font-medium text-gray-500">URL</th>
                                <th className="px-6 py-4 font-medium text-gray-500">Created</th>
                                <th className="px-6 py-4 font-medium text-gray-500 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {stores.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                                        No stores found. Create one above!
                                    </td>
                                </tr>
                            ) : (
                                stores.map((store) => (
                                    <tr key={store.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 font-medium">{store.name}</td>
                                        <td className="px-6 py-4 text-gray-600">{store.type}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(store.status)}`}>
                                                {store.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            {store.url && (
                                                <a
                                                    href={store.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-sm"
                                                >
                                                    Visit Store <ExternalLink className="w-3 h-3" />
                                                </a>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-gray-500 text-sm">
                                            {new Date(store.createdAt).toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => deleteStore(store.id)}
                                                className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Delete Store"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

            </div>
        </div>
    );
}

export default App;
