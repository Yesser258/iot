import { MapPin, ExternalLink, History } from 'lucide-react';
import { useState } from 'react';
import PathVisualization from './PathVisualization';
import { getSensorHistory } from '../lib/supabase';

interface LocationCardProps {
    latitude: number;
    longitude: number;
}

export default function LocationCard({ latitude, longitude }: LocationCardProps) {
    const [showMap, setShowMap] = useState(true);
    const [showHistory, setShowHistory] = useState(false);
    const [historyData, setHistoryData] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${longitude - 0.01},${latitude - 0.01},${longitude + 0.01},${latitude + 0.01}&layer=mapnik&marker=${latitude},${longitude}`;

    const toggleHistory = async () => {
        if (!showHistory) {
            setLoadingHistory(true);
            const data = await getSensorHistory(7);
            setHistoryData(data || []);
            setLoadingHistory(false);
        }
        setShowHistory(!showHistory);
    };

    return (
        <>
            {showHistory && (
                <PathVisualization
                    data={historyData}
                    onClose={() => setShowHistory(false)}
                />
            )}

            <div className="bg-white rounded-lg shadow-lg p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-blue-100 rounded-lg">
                            <MapPin className="w-6 h-6 text-blue-600" />
                        </div>
                        <h2 className="text-xl font-semibold text-gray-800">GPS Location</h2>
                    </div>
                    <button
                        onClick={toggleHistory}
                        disabled={loadingHistory}
                        className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition text-sm font-medium disabled:opacity-50"
                        title="View 7-day history"
                    >
                        <History className={`w-4 h-4 ${loadingHistory ? 'animate-spin' : ''}`} />
                        <span className="hidden sm:inline">History</span>
                    </button>
                </div>

            {showMap ? (
                <div className="space-y-3">
                    <div className="w-full h-64 rounded-lg overflow-hidden border-2 border-gray-200">
                        <iframe
                            width="100%"
                            height="100%"
                            frameBorder="0"
                            src={mapUrl}
                            style={{ border: 0 }}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-gray-50 rounded-lg">
                            <span className="text-gray-600 text-sm font-medium block">Latitude</span>
                            <span className="text-gray-900 font-mono text-lg">{latitude.toFixed(6)}°</span>
                        </div>

                        <div className="p-3 bg-gray-50 rounded-lg">
                            <span className="text-gray-600 text-sm font-medium block">Longitude</span>
                            <span className="text-gray-900 font-mono text-lg">{longitude.toFixed(6)}°</span>
                        </div>
                    </div>

                    <button
                        onClick={() => setShowMap(false)}
                        className="w-full py-2 px-4 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
                    >
                        Hide Map
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-gray-50 rounded-lg">
                            <span className="text-gray-600 text-sm font-medium block">Latitude</span>
                            <span className="text-gray-900 font-mono text-lg">{latitude.toFixed(6)}°</span>
                        </div>

                        <div className="p-3 bg-gray-50 rounded-lg">
                            <span className="text-gray-600 text-sm font-medium block">Longitude</span>
                            <span className="text-gray-900 font-mono text-lg">{longitude.toFixed(6)}°</span>
                        </div>
                    </div>

                    <button
                        onClick={() => setShowMap(true)}
                        className="w-full py-2 px-4 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition"
                    >
                        Show Map
                    </button>
                </div>
            )}

            <div className="mt-4 pt-4 border-t border-gray-200">
                <a
                    href={`https://www.google.com/maps?q=${latitude},${longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center gap-2 group"
                >
                    View on Google Maps
                    <ExternalLink className="w-4 h-4 group-hover:translate-x-0.5 transition" />
                </a>
            </div>
        </div>
        </>
    );
}