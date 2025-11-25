import { useMemo, useState, useEffect } from 'react';
import { MapPin, Calendar, Navigation, Clock, ExternalLink, AlertCircle, X } from 'lucide-react';

interface PathPoint {
  latitude: number;
  longitude: number;
  created_at: string;
}

interface PathVisualizationProps {
  data: PathPoint[];
  onClose: () => void;
}

export default function PathVisualization({ data = [], onClose }: PathVisualizationProps) {
  const safeData = useMemo(() => Array.isArray(data) ? data : [], [data]);

  const groupedData = useMemo(() => {
    const groups: Record<string, PathPoint[]> = {};

    safeData.forEach(d => {
      if (!d.created_at || typeof d.latitude !== 'number' || typeof d.longitude !== 'number') return;
      try {
        const dateObj = new Date(d.created_at);
        const dateKey = dateObj.toISOString().split('T')[0];

        if (!groups[dateKey]) {
          groups[dateKey] = [];
        }
        groups[dateKey].push(d);
      } catch (e) {
        console.warn("Invalid date ignored", d);
      }
    });

    return groups;
  }, [safeData]);

  const sortedDays = useMemo(() => Object.keys(groupedData).sort().reverse(), [groupedData]);

  const [selectedDay, setSelectedDay] = useState<string>('');

  useEffect(() => {
    if (sortedDays.length > 0 && !selectedDay) {
      setSelectedDay(sortedDays[0]);
    }
  }, [sortedDays, selectedDay]);

  const displayData = useMemo(() => {
    if (!selectedDay) return [];
    return (groupedData[selectedDay] || []).sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }, [selectedDay, groupedData]);

  const { mapUrl, hasValidData, bounds } = useMemo(() => {
    if (displayData.length < 1) return { mapUrl: '', hasValidData: false, bounds: null };

    const validData = displayData.filter(d =>
      Math.abs(d.latitude) > 0.1 && Math.abs(d.longitude) > 0.1
    );

    if (validData.length === 0) return { mapUrl: '', hasValidData: false, bounds: null };

    const lats = validData.map(d => d.latitude);
    const longs = validData.map(d => d.longitude);

    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLong = Math.min(...longs);
    const maxLong = Math.max(...longs);

    const padding = 0.002;
    const bbox = `${minLong - padding},${minLat - padding},${maxLong + padding},${maxLat + padding}`;

    const startPoint = validData[0];
    const endPoint = validData[validData.length - 1];

    const pathPoints = validData.map(p => `${p.latitude},${p.longitude}`).join(';');

    const url = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${startPoint.latitude},${startPoint.longitude}`;

    return {
      mapUrl: url,
      hasValidData: true,
      bounds: { minLat, maxLat, minLong, maxLong }
    };
  }, [displayData]);

  const openInGoogleMaps = () => {
    if (displayData.length < 1) return;

    const validGPSData = displayData.filter(d => Math.abs(d.latitude) > 0.1);

    if (validGPSData.length === 0) return;

    const origin = validGPSData[0];
    const dest = validGPSData[validGPSData.length - 1];

    const step = Math.max(1, Math.floor(validGPSData.length / 10));
    const waypoints = validGPSData
      .filter((_, i) => i > 0 && i < validGPSData.length - 1 && i % step === 0)
      .map(p => `${p.latitude},${p.longitude}`)
      .join('|');

    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin.latitude},${origin.longitude}&destination=${dest.latitude},${dest.longitude}&waypoints=${waypoints}&travelmode=driving`;

    window.open(url, '_blank');
  };

  const formatDateLabel = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
    } catch (e) {
      return dateStr;
    }
  };

  const estimatedDuration = useMemo(() => {
    if (displayData.length < 2) return '--';
    const start = new Date(displayData[0].created_at).getTime();
    const end = new Date(displayData[displayData.length - 1].created_at).getTime();
    const minutes = Math.round((end - start) / 60000);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }, [displayData]);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col h-[90vh]">

        <div className="p-4 bg-white border-b flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
              <Navigation className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Travel History</h2>
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Last 7 days
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-gray-50 border-b p-3 flex gap-2 overflow-x-auto shrink-0" style={{ scrollbarWidth: 'thin' }}>
          {sortedDays.length > 0 ? (
            sortedDays.map(day => (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all border ${
                  selectedDay === day
                    ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
                }`}
              >
                {formatDateLabel(day)}
                <span className={`ml-2 text-xs ${selectedDay === day ? 'text-blue-200' : 'text-gray-400'}`}>
                  ({groupedData[day].length} pts)
                </span>
              </button>
            ))
          ) : (
            <span className="text-gray-400 text-sm italic p-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> No history data available
            </span>
          )}
        </div>

        <div className="flex-1 relative overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 relative w-full bg-gray-100">
            {hasValidData ? (
              <>
                <iframe
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  src={mapUrl}
                  style={{ border: 0 }}
                  className="w-full h-full"
                />

                <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-md rounded-lg p-3 border border-gray-200 text-xs shadow-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="font-medium">Start Point</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500"></div>
                    <span className="font-medium">End Point</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-3">
                <MapPin className="w-16 h-16 opacity-20" />
                <p>No route available for this day</p>
              </div>
            )}
          </div>

          <div className="bg-white p-4 border-t flex flex-wrap justify-between items-center gap-4 shrink-0">
            <div className="flex gap-6 text-sm text-gray-600 w-full sm:w-auto justify-around sm:justify-start">
              <div className="flex flex-col items-center sm:items-start">
                <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Duration</span>
                <span className="font-mono font-bold flex items-center gap-1 text-gray-800 text-lg">
                  <Clock className="w-4 h-4 text-blue-500" />
                  {estimatedDuration}
                </span>
              </div>
              <div className="flex flex-col items-center sm:items-start">
                <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">GPS Points</span>
                <span className="font-mono font-bold text-lg text-gray-800">{displayData.length}</span>
              </div>
            </div>

            <button
              onClick={openInGoogleMaps}
              disabled={!hasValidData}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-bold shadow-lg shadow-blue-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5"
            >
              <MapPin className="w-5 h-5" />
              View on Google Maps
              <ExternalLink className="w-4 h-4 ml-1 opacity-70" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
